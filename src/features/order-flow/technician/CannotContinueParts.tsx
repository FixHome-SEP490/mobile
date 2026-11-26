import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BellRing, Camera, Check, CheckCircle2, Circle, LifeBuoy, OctagonX, Phone, Wrench, X } from 'lucide-react-native';
import type { ContactReadiness } from '../../../api/cannot-continue.api';
import ToneNote from '../../../components/ToneNote';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { vnDateTimeString } from '../../../utils/vn-time';
import type { CameraOrderAsset } from './arrival-proof-controller';
import { STOP_REASON_MAX, STOP_REASON_MIN, type FormReasonCode, type StopMode } from './cannot-continue-form';

/** Decorative icons next to visible text stay out of the screen reader's way. */
const Decor = ({ children }: { children: React.ReactNode }) => (
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>
);

/** A titled block of the form. No step numbers: the form is one short page, not a wizard. */
export function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <Decor><Check size={14} strokeWidth={3} color={colors.surface} /></Decor>}</View>;
}

export interface DeviceChoice { id: string; seq: number; title: string; sub: string; on: boolean; disabled: boolean }

/** What the report is about: the device (and its order). With several devices in the visit the same card lets the technician switch. */
export function DeviceCard({ title, sub, choices, busy, onPick }: { title: string; sub: string; choices: DeviceChoice[]; busy: boolean; onPick: (id: string) => void }) {
  return (
    <View testID="cc-device-card" style={styles.card}>
      <View style={styles.deviceHead}>
        <View style={styles.tile}><Decor><Wrench size={20} strokeWidth={1.75} color={colors.primaryStrong} /></Decor></View>
        <View style={styles.flex}>
          <Text style={styles.deviceTitle} numberOfLines={2}>{title}</Text>
          {!!sub && <Text style={styles.meta}>{sub}</Text>}
        </View>
      </View>
      {choices.length > 1 && (
        <View accessibilityRole="radiogroup" style={styles.choices}>
          <Text style={styles.hint}>Báo cáo cho máy khác trong lượt</Text>
          {choices.map((c) => (
            <Pressable key={c.id} testID={`cc-device-${c.seq}`} accessibilityRole="radio" accessibilityState={{ selected: c.on, disabled: busy || c.disabled }}
              disabled={busy || c.disabled} onPress={() => onPick(c.id)} style={({ pressed }) => [styles.choice, c.on && styles.choiceOn, c.disabled && !c.on && styles.off, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.hint}>{c.sub}</Text>
              </View>
              <Radio on={c.on} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const MODES = [
  { value: 'stop', label: 'Dừng công việc', Icon: OctagonX },
  { value: 'support', label: 'Nhờ hỗ trợ', Icon: LifeBuoy },
] as const;

/** The one decision that matters: stop for good, or ask the manager and carry on. The note under it says what each does. */
export function ModeSwitch({ mode, busy, onPick }: { mode: StopMode; busy: boolean; onPick: (mode: StopMode) => void }) {
  return (
    <View style={styles.gap}>
      <View accessibilityRole="radiogroup" style={styles.switchWrap}>
        {MODES.map(({ value, label, Icon }) => {
          const on = mode === value;
          const tone = value === 'stop' ? colors.tone.danger : colors.tone.info;
          return (
            <Pressable key={value} testID={`cc-mode-${value}`} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on, disabled: busy }}
              disabled={busy} onPress={() => onPick(value)} style={({ pressed }) => [styles.seg, on && { backgroundColor: colors.surface, borderColor: tone.fg }, pressed && styles.pressed]}>
              <Decor><Icon size={20} strokeWidth={1.75} color={on ? tone.fg : colors.textSecondary} /></Decor>
              <Text style={[styles.segText, on && { color: tone.text }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'stop'
        ? <ToneNote tone="danger" icon={OctagonX}>Dừng hẳn công việc này, không hoàn tác được. Bạn sẽ không còn được giao đơn này; tiền và linh kiện do quản lý đối soát.</ToneNote>
        : <ToneNote tone="info" icon={LifeBuoy}>Chỉ gửi báo cáo cho quản lý dịch vụ. Công việc vẫn tiếp tục, đơn không bị dừng hay hủy.</ToneNote>}
    </View>
  );
}

export interface ReasonGroup { title: string; items: { code: FormReasonCode; label: string; wholeVisit: boolean }[] }

/** One column, left-aligned: reasons are read, not matched by shape. Grouped by what they are about. */
export function ReasonList({ groups, code, busy, onPick }: { groups: ReasonGroup[]; code: FormReasonCode | null; busy: boolean; onPick: (code: FormReasonCode) => void }) {
  return (
    <View style={styles.gap}>
      {groups.filter((g) => g.items.length).map((g) => (
        <View key={g.title} style={styles.gapSmall}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          <View accessibilityRole="radiogroup" style={styles.list}>
            {g.items.map((item, index) => {
              const on = code === item.code;
              return (
                <Pressable key={item.code} testID={`cc-reason-${item.code}`} accessibilityRole="radio" accessibilityLabel={`${item.label}${item.wholeVisit ? ', dừng cả lượt' : ''}`}
                  accessibilityState={{ selected: on, disabled: busy }} disabled={busy} onPress={() => onPick(item.code)}
                  style={({ pressed }) => [styles.reason, index > 0 && styles.reasonDivider, on && styles.reasonOn, pressed && styles.pressed]}>
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, on && styles.rowTitleOn]}>{item.label}</Text>
                    {item.wholeVisit && <Text style={styles.wholeVisit}>Dừng cả lượt, mọi máy chưa xong</Text>}
                  </View>
                  <Radio on={on} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function Check3({ done, label, meta }: { done: boolean; label: string; meta?: string }) {
  return (
    <View style={styles.check} accessible accessibilityLabel={`${label}${meta ? `, ${meta}` : ''}, ${done ? 'đã đạt' : 'chưa đạt'}`}>
      <Decor>{done ? <CheckCircle2 size={20} strokeWidth={1.75} color={colors.tone.success.fg} /> : <Circle size={20} strokeWidth={1.75} color={colors.muted} />}</Decor>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{label}</Text>
        {!!meta && <Text style={styles.hint}>{meta}</Text>}
      </View>
    </View>
  );
}

/** A customer who is not there: the three things Backend wants before the visit can be stopped, ticked off as they are met. */
export function ContactChecklist({ readiness, summary, busy, error, children, onCall, onNotify, onRecheck }: {
  readiness: ContactReadiness | null; summary: string; busy: boolean; error: string; children?: React.ReactNode;
  onCall: () => void; onNotify: () => void; onRecheck: () => void;
}) {
  const r = readiness;
  const waited = !!r && (r.ready || (r.contactCount > 0 && !!r.nextEligibleAt && Date.parse(r.serverNow) >= Date.parse(r.nextEligibleAt)));
  return (
    <View style={styles.gap}>
      <View style={styles.card}>
        <Check3 done={!!r && r.contactCount >= 2 && r.callsSpaced} label="Gọi khách ít nhất 2 lần, cách nhau 5 phút" meta={`${r?.contactCount ?? 0} cuộc gọi đã ghi nhận`} />
        <Check3 done={!!r?.notificationSent} label="Gửi 1 thông báo trong ứng dụng" />
        <Check3 done={waited} label="Đợi 10 phút sau cuộc gọi đầu" meta={!waited && r?.nextEligibleAt ? `Có thể dừng sau ${vnDateTimeString(r.nextEligibleAt)}` : undefined} />
        <Text testID="cc-readiness" style={styles.hint}>{summary}</Text>
        {children}
      </View>
      <View style={styles.row2}>
        <Pressable testID="cc-call" accessibilityRole="button" accessibilityLabel="Gọi khách và ghi nhận" disabled={busy} onPress={onCall} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Decor><Phone size={18} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
          <Text style={styles.actionText}>Gọi khách</Text>
        </Pressable>
        <Pressable testID="cc-notify" accessibilityRole="button" accessibilityLabel="Gửi thông báo trong ứng dụng" disabled={busy} onPress={onNotify} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Decor><BellRing size={18} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
          <Text style={styles.actionText}>Gửi thông báo</Text>
        </Pressable>
      </View>
      <Pressable testID="cc-recheck" accessibilityRole="button" accessibilityLabel="Kiểm tra điều kiện" disabled={busy} hitSlop={8} onPress={onRecheck} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkText}>Kiểm tra lại điều kiện</Text>
      </Pressable>
      {busy && <ActivityIndicator size="small" color={colors.primaryStrong} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

/** The description and, while the work is running, photos: one card, because they are one piece of evidence. */
export function DetailsCard({ reason, onReason, busy, photos }: {
  reason: string; onReason: (text: string) => void; busy: boolean;
  photos?: { assets: CameraOrderAsset[]; max: number; onCapture: () => void; onDrop: (index: number) => void } | { hint: string };
}) {
  const withPhotos = !!photos && 'assets' in photos;
  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Mô tả tình huống</Text>
        <Text style={styles.counter}>{`${reason.trim().length}/${STOP_REASON_MAX}`}</Text>
      </View>
      <TextInput testID="cc-reason-text" value={reason} onChangeText={onReason} editable={!busy} multiline maxLength={STOP_REASON_MAX}
        accessibilityLabel="Mô tả tình huống" accessibilityHint={`Ít nhất ${STOP_REASON_MIN} ký tự`} placeholder="Ví dụ: bo mạch cháy, hãng đã ngừng bán linh kiện"
        placeholderTextColor={colors.textSecondary} style={styles.input} />
      {!!photos && (
        <View style={styles.gapSmall}>
          <Text style={styles.label}>{withPhotos ? `Ảnh chứng cứ (${photos.assets.length}/${photos.max}, không bắt buộc)` : 'Ảnh chứng cứ'}</Text>
          {withPhotos ? (
            <View style={styles.grid}>
              {photos.assets.map((asset, index) => (
                <View key={asset.uri} style={styles.photoTile}>
                  <Image source={{ uri: asset.uri }} accessibilityIgnoresInvertColors accessibilityLabel={`Ảnh chứng cứ ${index + 1}`} style={styles.photo} />
                  <Pressable testID={`cc-drop-photo-${index}`} accessibilityRole="button" accessibilityLabel={`Xóa ảnh ${index + 1}`} disabled={busy} hitSlop={8}
                    onPress={() => photos.onDrop(index)} style={({ pressed }) => [styles.drop, pressed && styles.pressed]}>
                    <Decor><X size={16} strokeWidth={2.5} color={colors.surface} /></Decor>
                  </Pressable>
                </View>
              ))}
              {photos.assets.length < photos.max && (
                <Pressable testID="cc-capture" accessibilityRole="button" accessibilityLabel="Chụp ảnh chứng cứ" disabled={busy} onPress={photos.onCapture}
                  style={({ pressed }) => [styles.photoTile, styles.add, pressed && styles.pressed]}>
                  <Decor><Camera size={24} strokeWidth={1.75} color={colors.primaryStrong} /></Decor>
                  <Text style={styles.addText}>Chụp ảnh</Text>
                </Pressable>
              )}
            </View>
          ) : <Text style={styles.hint}>{photos.hint}</Text>}
          {withPhotos && <Text style={styles.hint}>Ảnh riêng tư, chỉ bạn và quản lý xem được.</Text>}
        </View>
      )}
    </View>
  );
}

/** The last thing before the red button: an explicit tick, kept apart from the form so it is not missed. */
export function ConfirmBox({ checked, busy, text, onToggle }: { checked: boolean; busy: boolean; text: string; onToggle: () => void }) {
  return (
    <Pressable testID="cc-confirm" accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={onToggle}
      style={({ pressed }) => [styles.confirm, checked && styles.confirmOn, pressed && styles.pressed]}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked && <Decor><Check size={16} strokeWidth={3} color={colors.surface} /></Decor>}</View>
      <Text style={styles.confirmText}>{text}</Text>
    </Pressable>
  );
}

/** What happened and what comes next, so the technician is not left with a bare "done". */
export function DoneCard({ title, text, next }: { title: string; text: string; next: string[] }) {
  return (
    <View testID="cc-done" accessibilityRole="summary" style={styles.gap}>
      <View style={styles.done}>
        <View style={styles.doneIcon}><Decor><Check size={22} strokeWidth={2.5} color={colors.surface} /></Decor></View>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.doneTitle}>{title}</Text>
          <Text style={styles.doneText}>{text}</Text>
        </View>
      </View>
      {next.length > 0 && (
        <FormSection title="Tiếp theo">
          <View style={styles.card}>
            {next.map((line) => (
              <View key={line} style={styles.nextRow}>
                <Decor><CheckCircle2 size={18} strokeWidth={1.75} color={colors.textSecondary} /></Decor>
                <Text style={[styles.rowTitle, styles.flex]}>{line}</Text>
              </View>
            ))}
          </View>
        </FormSection>
      )}
    </View>
  );
}

const TARGET = 48;
const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  gapSmall: { gap: 8 },
  pressed: { opacity: 0.8 },
  off: { opacity: 0.5 },
  section: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  groupTitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.tone.danger.text, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  rowTitle: { color: colors.text, fontSize: 15, lineHeight: 22 },
  rowTitleOn: { fontWeight: '700', color: colors.primaryStrong },

  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md, gap: 12 },
  deviceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  deviceTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  choices: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  choice: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },

  switchWrap: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.divider },
  seg: { flex: 1, minHeight: TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  segText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },

  list: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  reason: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 10 },
  reasonDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reasonOn: { backgroundColor: colors.primarySoft },
  wholeVisit: { color: colors.tone.warning.text, fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },

  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, paddingHorizontal: 8 },
  actionText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  counter: { color: colors.textSecondary, fontSize: 12 },
  input: { minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoTile: { width: '31.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  photo: { width: '100%', height: '100%', backgroundColor: colors.divider },
  drop: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { color: colors.primaryStrong, fontSize: 13, fontWeight: '600' },

  confirm: { minHeight: TARGET + 8, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.tone.danger.fg, backgroundColor: colors.tone.danger.bg },
  confirmOn: { borderWidth: 2 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.tone.danger.fg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.tone.danger.fg },
  confirmText: { flex: 1, color: colors.tone.danger.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },

  done: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: 14, backgroundColor: colors.tone.success.bg },
  doneIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tone.success.fg, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: colors.tone.success.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  doneText: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 2 },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
