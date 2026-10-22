import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronRight, Minus, Plus, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react-native';
import { costItemRowSubtotal, type CostItemFieldErrors, type CostItemRow } from '../shared/CostItemEditor';
import { lightTheme as colors, spacing, type ToneName } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';

/** A FixHome part the technician asked for before the repair; one quote line can reuse it as is. */
export interface EarlierPartLine {
  id: string;
  catalogId: string;
  name: string;
  quantity: number;
  statusLabel: string;
  tone: ToneName;
}

const digits = (value: string) => /^\d+$/.test(value.trim());

/** One section = title (and hint) outside, one bordered card inside, rows separated by hairlines. */
export function Section({ title, hint, required, children }: { title: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" accessibilityLabel={required ? `${title}, bắt buộc` : undefined} style={styles.sectionTitle}>{title}{required ? <Text style={{ color: colors.error }}> *</Text> : null}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={styles.card}>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && (items[i - 1] as React.ReactElement).type !== GroupLabel && <View style={styles.divider} />}
            {item}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** Caption that names a group of rows inside a section card. */
export function GroupLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.groupLabel}>
      <Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/** The one "add" control, last row of a section card. */
export function AddRow({ label, testID, hint, disabled, onPress }: { label: string; testID: string; hint?: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityHint={hint} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.addRow, pressed && styles.pressedRow, disabled && styles.disabled]}>
      <Plus size={20} strokeWidth={1.75} color={colors.primaryStrong} />
      <Text style={styles.addText}>{label}</Text>
    </Pressable>
  );
}

/** Navigation row, same look as the order hub rows. */
export function LinkRow({ label, testID, Icon, onPress, disabled }: { label: string; testID: string; Icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressedRow, disabled && styles.disabled]}>
      <View style={styles.linkTile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon size={20} strokeWidth={1.75} color={colors.primaryStrong} /></View>
      <Text style={styles.linkLabel}>{label}</Text>
      <ChevronRight size={20} strokeWidth={1.75} color={colors.muted} />
    </Pressable>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function IconButton({ label, testID, disabled, onPress, children }: { label: string; testID: string; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, disabled && styles.disabled]}>
      {children}
    </Pressable>
  );
}

export function LaborCard({ row, index, errors, disabled, onChange, onRemove }: {
  row: CostItemRow; index: number; errors?: CostItemFieldErrors; disabled: boolean; onChange: (next: CostItemRow) => void; onRemove: () => void;
}) {
  const subtotal = costItemRowSubtotal(row);
  const id = (suffix: string) => `quote-labor-${row.key}-${suffix}`;
  return (
    <View testID={`quote-labor-${row.key}`} style={styles.item}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Công việc {index + 1}</Text>
        <IconButton testID={id('remove')} label={`Xóa công việc ${index + 1}`} disabled={disabled} onPress={onRemove}><Trash2 size={20} strokeWidth={1.75} color={colors.error} /></IconButton>
      </View>
      <Field label="Nội dung" error={errors?.description}>
        <TextInput testID={id('description')} accessibilityLabel="Nội dung công việc" editable={!disabled} value={row.description} maxLength={2000}
          onChangeText={description => onChange({ ...row, description })} placeholder="Ví dụ: Vệ sinh dàn lạnh" placeholderTextColor={colors.muted} style={styles.input} />
      </Field>
      <View style={styles.twoCols}>
        <View style={styles.col}>
          <Field label="Số lượng" error={errors?.quantity}>
            <TextInput testID={id('quantity')} accessibilityLabel="Số lượng" editable={!disabled} value={row.quantity} keyboardType="number-pad" maxLength={4}
              onChangeText={quantity => onChange({ ...row, quantity: quantity.replace(/\D/g, '') })} placeholder="1" placeholderTextColor={colors.muted} style={styles.input} />
          </Field>
        </View>
        <View style={styles.col}>
          <Field label="Đơn giá (đ)" error={errors?.unitPrice}>
            <TextInput testID={id('unitprice')} accessibilityLabel="Đơn giá" editable={!disabled} value={row.unitPrice} keyboardType="number-pad" maxLength={9}
              onChangeText={unitPrice => onChange({ ...row, unitPrice: unitPrice.replace(/\D/g, '') })} placeholder="150000" placeholderTextColor={colors.muted} style={styles.input} />
          </Field>
        </View>
      </View>
      <Field label="Bảo hành công (ngày, tùy chọn)" error={errors?.laborWarrantyDays}>
        <TextInput testID={id('warranty')} accessibilityLabel="Số ngày bảo hành tiền công" editable={!disabled} value={row.laborWarrantyDays} keyboardType="number-pad" maxLength={4}
          onChangeText={laborWarrantyDays => onChange({ ...row, laborWarrantyDays: laborWarrantyDays.replace(/\D/g, '') })} placeholder="Để trống: theo mặc định của bạn" placeholderTextColor={colors.muted} style={styles.input} />
      </Field>
      {subtotal !== null ? <Text style={styles.subtotal}>Thành tiền {formatVnd(subtotal)}</Text> : null}
    </View>
  );
}

function PartPrice({ row }: { row: CostItemRow }) {
  const subtotal = costItemRowSubtotal(row);
  if (!digits(row.unitPrice)) return <Text style={styles.meta}>Đang lấy giá từ FixHome…</Text>;
  return (
    <>
      <View style={styles.priceRow}>
        <Text style={styles.meta}>{row.quantity} × {formatVnd(Number(row.unitPrice))}</Text>
        <Text style={styles.subtotalInline}>{subtotal !== null ? formatVnd(subtotal) : ''}</Text>
      </View>
      <View style={styles.warrantyRow}>
        <ShieldCheck size={16} strokeWidth={1.75} color={colors.tone.success.fg} />
        <Text style={styles.warrantyText}>{row.warrantyTermDays && Number(row.warrantyTermDays) > 0 ? `Bảo hành ${row.warrantyTermDays} ngày theo FixHome` : 'Bảo hành theo chính sách FixHome'}</Text>
      </View>
    </>
  );
}

/** A part asked for earlier: tick it to put it into the quote, using up to the quantity that was asked for. */
export function EarlierPartCard({ line, row, disabled, onToggle, onQuantity }: {
  line: EarlierPartLine; row?: CostItemRow; disabled: boolean; onToggle: () => void; onQuantity: (quantity: string) => void;
}) {
  const selected = !!row;
  const tone = colors.tone[line.tone];
  // Never more than was asked for: more than that is added from the stock list, which asks the warehouse for it.
  const qty = row && digits(row.quantity) ? Number(row.quantity) : line.quantity;
  const step = (delta: number) => onQuantity(String(Math.min(line.quantity, Math.max(1, qty + delta))));
  return (
    <View style={[styles.item, selected && styles.earlierOn, disabled && styles.disabled]}>
      <Pressable testID={`quote-earlier-${line.id}`} accessibilityRole="checkbox" accessibilityLabel={`${line.name}, đã yêu cầu ${line.quantity}, ${line.statusLabel}`}
        accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onToggle}
        style={({ pressed }) => [styles.earlier, pressed && styles.pressed]}>
        <View style={[styles.check, selected && styles.checkOn]}>{selected ? <Check size={16} strokeWidth={2.5} color={colors.surface} /> : null}</View>
        <View style={styles.earlierBody}>
          <Text style={styles.cardTitle}>{line.name}</Text>
          <View style={styles.earlierMeta}>
            <Text style={styles.meta}>Đã yêu cầu {line.quantity}</Text>
            <View style={[styles.chip, { backgroundColor: tone.bg }]}><Text style={[styles.chipText, { color: tone.text }]}>{line.statusLabel}</Text></View>
          </View>
        </View>
      </Pressable>
      {row ? (
        <>
          <View style={styles.stepper}>
            <Text style={styles.label}>Số lượng dùng (tối đa {line.quantity})</Text>
            <IconButton testID={`quote-earlier-${line.id}-minus`} label={`Giảm số lượng ${line.name}`} disabled={disabled || qty <= 1} onPress={() => step(-1)}><Minus size={18} color={colors.primaryStrong} /></IconButton>
            <Text accessibilityLabel={`Số lượng dùng ${qty}`} style={styles.qtyText}>{qty}</Text>
            <IconButton testID={`quote-earlier-${line.id}-plus`} label={`Tăng số lượng ${line.name}`} disabled={disabled || qty >= line.quantity} onPress={() => step(1)}><Plus size={18} color={colors.primaryStrong} /></IconButton>
          </View>
          <PartPrice row={row} />
        </>
      ) : null}
    </View>
  );
}

/** A FixHome part the technician still holds: tick to use it in this proposal (quantity up to what is left). */
export function HeldPartCard({ name, available, row, disabled, readOnly, onToggle, onQuantity }: {
  name: string; available: number; row?: CostItemRow; disabled: boolean; readOnly?: boolean; onToggle: () => void; onQuantity: (quantity: string) => void;
}) {
  if (readOnly) {
    return (
      <View testID="held-part-row" accessible accessibilityLabel={`${name}, còn ${available}`} style={[styles.item, styles.heldRow]}>
        <Text style={styles.cardTitle}>{name}</Text>
        <Text style={styles.meta}>Còn {available}</Text>
      </View>
    );
  }
  const selected = !!row;
  const qty = row && digits(row.quantity) ? Number(row.quantity) : 1;
  const step = (delta: number) => onQuantity(String(Math.min(available, Math.max(1, qty + delta))));
  return (
    <View testID="held-part-row" style={[styles.item, selected && styles.earlierOn]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${name}, còn ${available}`} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onToggle}
        style={({ pressed }) => [styles.earlier, pressed && styles.pressed, disabled && styles.disabled]}>
        <View style={[styles.check, selected && styles.checkOn]}>{selected ? <Check size={16} strokeWidth={2.5} color={colors.surface} /> : null}</View>
        <View style={styles.earlierBody}>
          <Text style={styles.cardTitle}>{name}</Text>
          <View style={styles.earlierMeta}>
            <Text style={styles.meta}>Còn {available}</Text>
          </View>
        </View>
      </Pressable>
      {row ? (
        <>
          <View style={styles.stepper}>
            <Text style={styles.label}>Dùng</Text>
            <IconButton testID={`held-${row.key}-minus`} label={`Giảm số lượng ${name}`} disabled={disabled || qty <= 1} onPress={() => step(-1)}><Minus size={18} color={colors.primaryStrong} /></IconButton>
            <Text accessibilityLabel={`Số lượng ${name}: ${qty}`} style={styles.qtyText}>{qty}</Text>
            <IconButton testID={`held-${row.key}-plus`} label={`Tăng số lượng ${name}`} disabled={disabled || qty >= available} onPress={() => step(1)}><Plus size={18} color={colors.primaryStrong} /></IconButton>
          </View>
          <PartPrice row={row} />
        </>
      ) : null}
    </View>
  );
}

/** A part added fresh from the FixHome stock list; quantity is editable, price and warranty are not. */
export function PartLineCard({ row, maxQuantity, disabled, onQuantity, onRemove }: {
  row: CostItemRow; maxQuantity: number; disabled: boolean; onQuantity: (quantity: string) => void; onRemove: () => void;
}) {
  const qty = digits(row.quantity) ? Number(row.quantity) : 1;
  const step = (delta: number) => onQuantity(String(Math.min(maxQuantity, Math.max(1, qty + delta))));
  return (
    <View testID={`quote-part-${row.key}`} style={styles.item}>
      <View style={styles.cardHead}>
        <View style={styles.earlierBody}>
          <Text style={styles.cardTitle}>{row.partNameSnapshot || row.description}</Text>
          {row.partSku ? <Text style={styles.meta}>Mã {row.partSku}</Text> : null}
        </View>
        <IconButton testID={`quote-part-${row.key}-remove`} label={`Xóa ${row.partNameSnapshot}`} disabled={disabled} onPress={onRemove}><Trash2 size={20} strokeWidth={1.75} color={colors.error} /></IconButton>
      </View>
      <View style={styles.stepper}>
        <Text style={styles.label}>Số lượng</Text>
        <IconButton testID={`quote-part-${row.key}-minus`} label={`Giảm số lượng ${row.partNameSnapshot}`} disabled={disabled || qty <= 1} onPress={() => step(-1)}><Minus size={18} color={colors.primaryStrong} /></IconButton>
        <TextInput testID={`quote-part-${row.key}-qty`} accessibilityLabel={`Số lượng ${row.partNameSnapshot}`} editable={!disabled} value={row.quantity} keyboardType="number-pad" maxLength={3}
          onChangeText={quantity => onQuantity(quantity.replace(/\D/g, ''))} style={styles.qtyInput} />
        <IconButton testID={`quote-part-${row.key}-plus`} label={`Tăng số lượng ${row.partNameSnapshot}`} disabled={disabled || qty >= maxQuantity} onPress={() => step(1)}><Plus size={18} color={colors.primaryStrong} /></IconButton>
      </View>
      <PartPrice row={row} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionHead: { gap: 2 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  sectionHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { padding: spacing.md, gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  groupLabel: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 4, gap: 2 },
  groupTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  addRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.md },
  addText: { color: colors.primaryStrong, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  pressedRow: { backgroundColor: colors.divider },
  linkRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 8 },
  linkTile: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  linkLabel: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  field: { gap: 4 },
  label: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  twoCols: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  subtotal: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  subtotalInline: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  warrantyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warrantyText: { flex: 1, color: colors.tone.success.text, fontSize: 13, lineHeight: 19 },
  earlier: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48 },
  qtyText: { minWidth: 40, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' },
  earlierOn: { backgroundColor: colors.primarySoft },
  earlierBody: { flex: 1, minWidth: 0, gap: 4 },
  earlierMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2, backgroundColor: colors.surface },
  checkOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, minHeight: 24, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  heldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 64, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, textAlign: 'center', color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
