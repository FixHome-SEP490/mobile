import { parsePushData, pushOpenTarget, showWhileOpen, PUSH_CHANNELS } from './push-routing';

const CONV = '44444444-4444-4444-8444-444444444444';
const ORDER = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-28T10:00:00.000Z');

describe('parsePushData', () => {
  it('reads the three kinds the backend sends', () => {
    expect(parsePushData({ kind: 'chat', conversationId: CONV, messageId: 'm1' })).toEqual({ kind: 'chat', conversationId: CONV, messageId: 'm1' });
    expect(parsePushData({ kind: 'call', conversationId: CONV, callId: 'c1' })).toEqual({ kind: 'call', conversationId: CONV, callId: 'c1' });
    expect(parsePushData({ kind: 'notification', notificationId: 'n1', type: 'quotation_submitted', referenceId: ORDER, referenceType: 'SERVICE_ORDER' })).toEqual({
      kind: 'notification', notificationId: 'n1', type: 'QUOTATION_SUBMITTED', referenceId: ORDER, referenceType: 'SERVICE_ORDER',
    });
  });

  it('ignores anything else, including a chat or call without its thread', () => {
    for (const raw of [null, undefined, 'x', 42, {}, { kind: 'promo' }, { kind: 'chat' }, { kind: 'call', conversationId: '  ' }]) {
      expect(parsePushData(raw)).toBeNull();
    }
  });

  it('turns missing notice fields into safe defaults', () => {
    expect(parsePushData({ kind: 'notification' })).toEqual({ kind: 'notification', notificationId: '', type: 'INFO', referenceId: null, referenceType: null });
  });
});

describe('showWhileOpen', () => {
  const chat = { kind: 'chat' as const, conversationId: CONV, messageId: 'm' };
  it('hides a message for the thread already on screen, shows it for any other', () => {
    expect(showWhileOpen(chat, { openConversationId: CONV })).toBe(false);
    expect(showWhileOpen(chat, { openConversationId: 'other' })).toBe(true);
    expect(showWhileOpen(chat, { openConversationId: null })).toBe(true);
  });

  it('never shows a call banner while open: the call screen rings', () => {
    expect(showWhileOpen({ kind: 'call', conversationId: CONV, callId: 'c' }, { openConversationId: null })).toBe(false);
  });

  it('shows notices and unknown pushes', () => {
    expect(showWhileOpen({ kind: 'notification', notificationId: 'n', type: 'INFO', referenceId: null, referenceType: null }, { openConversationId: CONV })).toBe(true);
    expect(showWhileOpen(null, { openConversationId: null })).toBe(true);
  });
});

describe('pushOpenTarget', () => {
  it('opens the thread for a message, named after the sender', () => {
    expect(pushOpenTarget({ kind: 'chat', conversationId: CONV, messageId: 'm' }, { title: ' Thợ Một ' })).toEqual({ screen: 'ChatThread', params: { conversationId: CONV, counterpartName: 'Thợ Một' } });
  });

  it('opens the thread for a call; the call screen shows on top while it rings', () => {
    expect(pushOpenTarget({ kind: 'call', conversationId: CONV, callId: 'c' }, { title: 'Cuộc gọi đến' })).toEqual({ screen: 'ChatThread', params: { conversationId: CONV, counterpartName: '' } });
  });

  it('hands a notice to the notification screen as an unread item', () => {
    expect(pushOpenTarget({ kind: 'notification', notificationId: 'n1', type: 'BOOKING_INVITATION', referenceId: ORDER, referenceType: 'BOOKING' }, { title: 'Lời mời mới', body: 'Có việc gần bạn' }, NOW)).toEqual({
      screen: 'Notifications',
      item: { id: 'n1', title: 'Lời mời mới', message: 'Có việc gần bạn', type: 'BOOKING_INVITATION', referenceId: ORDER, referenceType: 'BOOKING', isRead: false, createdAt: NOW.toISOString() },
    });
  });

  it('does not try to mark read a shared push that names no row', () => {
    const target = pushOpenTarget({ kind: 'notification', notificationId: '', type: 'SYSTEM_BROADCAST', referenceId: null, referenceType: null }, {}, NOW);
    expect(target).toMatchObject({ screen: 'Notifications', item: { id: '', isRead: true } });
  });
});

describe('channels', () => {
  it('match the ids the backend and the Android plugin use', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = require('../../plugins/with-notification-channels.js');
    expect(plugin.CHANNELS.map((c: { id: string }) => c.id)).toEqual([PUSH_CHANNELS.call, PUSH_CHANNELS.message, PUSH_CHANNELS.system]);
    expect(plugin.CHANNELS[0]).toMatchObject({ id: 'fh_calls', sound: 'ringtone', importance: 'IMPORTANCE_HIGH' });
  });

  it('the plugin adds the channel call to MainApplication once, after super.onCreate()', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addOnCreateCall, kotlinSource } = require('../../plugins/with-notification-channels.js');
    const before = 'override fun onCreate() {\n    super.onCreate()\n    other()\n  }';
    const once = addOnCreateCall(before);
    expect(once).toBe('override fun onCreate() {\n    super.onCreate()\n    FixHomeNotificationChannels.create(this)\n    other()\n  }');
    expect(addOnCreateCall(once)).toBe(once);
    expect(() => addOnCreateCall('class X {}')).toThrow();
    const source = kotlinSource('com.fixhome.mobile');
    expect(source).toContain('package com.fixhome.mobile');
    expect(source).toContain('NotificationChannel("fh_calls", "Cuộc gọi đến", NotificationManager.IMPORTANCE_HIGH)');
    expect(source).toContain('RingtoneManager.TYPE_RINGTONE');
  });
});
