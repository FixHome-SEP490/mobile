import React from 'react';
import { act, create } from 'react-test-renderer';
import type { InvitationItem } from '../../../api/bookings.api';
import InvitationDecisionView from './InvitationDecisionView';

const invitation: InvitationItem = {
  id: 'inv-1',
  bookingId: 'booking-1',
  booking: {
    province: 'Hà Nội',
    district: 'Cầu Giấy',
    serviceName: 'Sửa máy lạnh',
    quantity: 1,
    urgency: 'NORMAL',
    preferredStartAt: '2030-01-01T08:00:00Z',
    preferredEndAt: '2030-01-01T12:00:00Z',
  } as InvitationItem['booking'],
  priorityOrder: 1,
  status: 'PENDING',
  invitedAt: '2030-01-01T00:00:00Z',
  expiresAt: '2030-01-02T00:00:00Z',
};

function props(overrides: Partial<React.ComponentProps<typeof InvitationDecisionView>> = {}) {
  return {
    invitation,
    actionable: true,
    closedLabel: 'Đã hết hạn',
    countdownLabel: 'Còn 2 giờ',
    countdownUrgent: false,
    inFlight: null,
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onBack: jest.fn(),
    onRefresh: jest.fn(),
    ...overrides,
  };
}

it('expired invitation shows closed state with back/refresh only and never responds', async () => {
  const p = props({ actionable: false });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<InvitationDecisionView {...p} />);
  });
  expect(() => renderer.root.findByProps({ testID: 'invitation-accept' })).toThrow();
  expect(() => renderer.root.findByProps({ testID: 'invitation-decline' })).toThrow();
  expect(renderer.root.findByProps({ testID: 'invitation-closed' })).toBeTruthy();
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-back' }).props.onPress();
    renderer.root.findByProps({ testID: 'invitation-refresh' }).props.onPress();
  });
  expect(p.onBack).toHaveBeenCalledTimes(1);
  expect(p.onRefresh).toHaveBeenCalledTimes(1);
  expect(p.onAccept).not.toHaveBeenCalled();
  expect(p.onDecline).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it('accept responds once; decline needs a separate explicit confirm', async () => {
  const p = props();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<InvitationDecisionView {...p} />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-accept' }).props.onPress();
  });
  expect(p.onAccept).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-decline' }).props.onPress();
  });
  expect(p.onDecline).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-decline-confirm' }).props.onPress();
  });
  expect(p.onDecline).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});

it('decline cancel sends nothing and in-flight locks both actions', async () => {
  const p = props();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<InvitationDecisionView {...p} />);
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-decline' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-decline-cancel' }).props.onPress();
  });
  expect(p.onDecline).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());

  const locked = props({ inFlight: 'ACCEPT' });
  await act(async () => {
    renderer = create(<InvitationDecisionView {...locked} />);
  });
  expect(renderer.root.findByProps({ testID: 'invitation-accept' }).props.disabled).toBe(true);
  expect(renderer.root.findByProps({ testID: 'invitation-decline' }).props.disabled).toBe(true);
  await act(async () => {
    renderer.root.findByProps({ testID: 'invitation-accept' }).props.onPress();
  });
  expect(locked.onAccept).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
