import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { OrderSessionSnapshot } from '../domain/order-session.types';
import { createOrderSessionSnapshot, readyResource } from '../domain/order-session.types';
import PersonalOrderNotesScreen from './PersonalOrderNotesScreen';

let mockSnapshot: OrderSessionSnapshot;
let mockLoadNote: jest.Mock<Promise<string>, [string, string]>;
let mockSaveNote: jest.Mock<Promise<boolean>, [string, string, string]>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

jest.mock('../runtime/OrderSessionProvider', () => ({ useOptionalOrderSession: () => null, useOrderSession: () => ({ key: mockSnapshot.key, snapshot: mockSnapshot }) }));
jest.mock('../../../screens/technician/technician-notes', () => ({
  NOTE_MAX_LENGTH: 2000,
  loadNote: (...args: [string, string]) => mockLoadNote(...args),
  saveNote: (...args: [string, string, string]) => mockSaveNote(...args),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const Native = jest.requireActual('react-native');
  return { SafeAreaView: Native.View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('../../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));

function session(orderId: string, userId = 'tech-1', sessionGeneration = 1) {
  const key = { userId, role: 'technician' as const, sessionGeneration, serviceOrderId: orderId };
  const snapshot = createOrderSessionSnapshot(key);
  snapshot.access = 'current';
  snapshot.order = readyResource({ id: orderId, code: 'SO-1', bookingId: 'b-1', serviceName: 'Repair', status: 'UNDER_REPAIR',
    customerName: 'Customer', customerPhone: '0900', addressSummary: 'Address', scheduledAt: '', laborTotal: 0,
    partsTotal: 0, grandTotal: 0, paymentStatus: 'UNPAID', createdAt: '' }, 1, 1);
  return snapshot;
}

function input(renderer: ReturnType<typeof create>) { return renderer.root.findByType(TextInput); }
function saveButton(renderer: ReturnType<typeof create>) { return renderer.root.findByProps({ testID: 'personal-order-note-save' }); }

beforeEach(() => {
  mockSnapshot = session('order-1');
  mockLoadNote = jest.fn(async (_userId: string, _orderId: string) => 'original');
  mockSaveNote = jest.fn(async (_userId: string, _orderId: string, _text: string) => true);
});

it('does not replace a newer draft when a deferred save resolves', async () => {
  const save = deferred<boolean>();
  mockSaveNote.mockReturnValue(save.promise);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  expect(input(renderer).props.value).toBe('original');
  await act(async () => saveButton(renderer).props.onPress());
  expect(mockSaveNote).toHaveBeenCalledWith('tech-1', 'order-1', 'original');
  expect(saveButton(renderer).props.disabled).toBe(true);
  await act(async () => input(renderer).props.onChangeText('new draft'));
  expect(saveButton(renderer).props.disabled).toBe(true);
  expect(mockSaveNote).toHaveBeenCalledTimes(1);
  await act(async () => { save.resolve(true); await save.promise; });
  expect(input(renderer).props.value).toBe('new draft');
  expect(saveButton(renderer).props.disabled).toBe(false);
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Đã lưu trên thiết bị.')).toBe(false);
  await act(async () => renderer.unmount());
});

it('synchronously blocks a double tap before React commits the saving state', async () => {
  const save = deferred<boolean>();
  mockSaveNote.mockReturnValue(save.promise);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  await act(async () => {
    const press = saveButton(renderer).props.onPress;
    press();
    press();
    await Promise.resolve();
  });
  expect(mockSaveNote).toHaveBeenCalledTimes(1);
  expect(saveButton(renderer).props.disabled).toBe(true);
  await act(async () => { save.resolve(true); await save.promise; });
  await act(async () => renderer.unmount());
});

it('ignores an old-order save completion after the provider identity changes', async () => {
  const save = deferred<boolean>();
  mockSaveNote.mockReturnValue(save.promise);
  mockLoadNote.mockImplementation(async (_userId, orderId) => orderId === 'order-1' ? 'old order draft' : 'new order note');
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  await act(async () => saveButton(renderer).props.onPress());
  mockSnapshot = session('order-2');
  await act(async () => { renderer.update(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  expect(input(renderer).props.value).toBe('new order note');
  expect(saveButton(renderer).props.disabled).toBe(false);
  await act(async () => { save.resolve(true); await save.promise; });
  expect(input(renderer).props.value).toBe('new order note');
  expect(saveButton(renderer).props.disabled).toBe(false);
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Đã lưu trên thiết bị.')).toBe(false);
  await act(async () => renderer.unmount());
});

it('keeps the same physical user-order locked across a session-generation change', async () => {
  const save = deferred<boolean>();
  mockSaveNote.mockReturnValue(save.promise);
  mockLoadNote.mockImplementation(async (_userId, _orderId) => 'latest draft');
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  await act(async () => saveButton(renderer).props.onPress());
  mockSnapshot = session('order-1', 'tech-1', 2);
  await act(async () => { renderer.update(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  expect(input(renderer).props.value).toBe('latest draft');
  expect(saveButton(renderer).props.disabled).toBe(true);
  expect(mockSaveNote).toHaveBeenCalledTimes(1);
  await act(async () => { save.resolve(true); await save.promise; });
  expect(input(renderer).props.value).toBe('latest draft');
  expect(saveButton(renderer).props.disabled).toBe(false);
  await act(async () => renderer.unmount());
});

it('does not leave another account locked after an old save completes', async () => {
  const save = deferred<boolean>();
  mockSaveNote.mockReturnValue(save.promise);
  mockLoadNote.mockImplementation(async (userId, orderId) => `${userId}:${orderId}`);
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  await act(async () => saveButton(renderer).props.onPress());
  mockSnapshot = session('order-1', 'tech-2');
  await act(async () => { renderer.update(<PersonalOrderNotesScreen />); await Promise.resolve(); });
  expect(input(renderer).props.value).toBe('tech-2:order-1');
  expect(saveButton(renderer).props.disabled).toBe(false);
  await act(async () => { save.resolve(true); await save.promise; });
  expect(input(renderer).props.value).toBe('tech-2:order-1');
  expect(saveButton(renderer).props.disabled).toBe(false);
  await act(async () => renderer.unmount());
});
