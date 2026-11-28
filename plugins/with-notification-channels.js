// Android notification channels for phone push (PO 28/11/2026).
//
// The backend names these channels on every OneSignal push (existing_android_channel_id), so the
// sound and importance are decided here, in the app, and nothing has to be set in the OneSignal
// dashboard. Keep the ids in step with src/services/push-routing.ts and the backend's
// src/modules/push/push-payload.ts. A channel's sound cannot change once a phone created it: a new
// sound needs a new id.
//
// The code goes straight into MainApplication.onCreate with fully qualified android.* names: no
// extra file and no import, so it is untouched when prebuild renames the app's package.
const { withMainApplication } = require('expo/config-plugins');

const MARKER = '// FixHome notification channels (plugins/with-notification-channels.js)';

const CHANNELS = [
  // Incoming calls: the phone's ringtone, heads-up, shown on the lock screen.
  { id: 'fh_calls', name: 'Cuộc gọi đến', description: 'Chuông khi khách hàng hoặc kỹ thuật viên gọi cho bạn', importance: 'IMPORTANCE_HIGH', sound: 'ringtone' },
  { id: 'fh_messages', name: 'Tin nhắn', description: 'Tin nhắn mới và cuộc gọi nhỡ', importance: 'IMPORTANCE_HIGH', sound: 'notification' },
  { id: 'fh_system', name: 'Đơn và tài khoản', description: 'Đơn sửa chữa, lời mời nhận việc, báo giá, ví và các thông báo khác', importance: 'IMPORTANCE_DEFAULT', sound: 'notification' },
];

/** The Kotlin block run once at start-up; a phone that refuses a channel still runs the app. */
function channelBlock(indent = '    ') {
  const channel = (c) => {
    const uri = c.sound === 'ringtone' ? 'TYPE_RINGTONE' : 'TYPE_NOTIFICATION';
    const usage = c.sound === 'ringtone' ? 'USAGE_NOTIFICATION_RINGTONE' : 'USAGE_NOTIFICATION';
    return [
      `android.app.NotificationChannel("${c.id}", "${c.name}", android.app.NotificationManager.${c.importance}).apply {`,
      `  description = "${c.description}"`,
      '  lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC',
      '  enableVibration(true)',
      '  setSound(',
      `    android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.${uri}),`,
      `    android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.${usage}).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build()`,
      '  )',
      '}',
    ];
  };
  const list = CHANNELS.map((c, i) => channel(c).map((line, j, all) => `      ${line}${j === all.length - 1 && i < CHANNELS.length - 1 ? ',' : ''}`)).flat();
  return [
    MARKER,
    'if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {',
    '  try {',
    '    val fixHomeNotifications = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager',
    '    fixHomeNotifications.createNotificationChannels(listOf(',
    ...list,
    '    ))',
    '  } catch (error: Exception) {',
    "    // Pushes then use OneSignal's default channel.",
    '  }',
    '}',
  ].map((line) => `${indent}${line}`).join('\n');
}

/** Adds the block right after super.onCreate() in MainApplication.kt, once. */
function addOnCreateCall(contents) {
  if (contents.includes(MARKER)) return contents;
  const anchor = /super\.onCreate\(\)\s*\n/;
  if (!anchor.test(contents)) throw new Error('with-notification-channels: super.onCreate() not found in MainApplication');
  return contents.replace(anchor, (match) => `${match}${channelBlock()}\n`);
}

const withNotificationChannels = (config) =>
  withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('with-notification-channels: MainApplication must be Kotlin');
    mod.modResults.contents = addOnCreateCall(mod.modResults.contents);
    return mod;
  });

module.exports = withNotificationChannels;
module.exports.CHANNELS = CHANNELS;
module.exports.channelBlock = channelBlock;
module.exports.addOnCreateCall = addOnCreateCall;
