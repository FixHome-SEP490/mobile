import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors, spacing } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';

/**
 * M4 shared quotation row draft. Presentation-only: the frozen controller
 * validator (`validateQuotationPayload`) owns every DTO rule, so this module
 * never invents schemas and never coerces invalid numeric strings to 0.
 * The same row shape is reused by M5 additional-cost drafting.
 */
export type CostItemKind = 'labor' | 'parts_equipment';
export type CostItemPartSource = 'fixhome' | 'external' | 'technician';
export type CostItemWarrantyOption = 'no_warranty' | 'paid_warranty';

export interface CostItemRow {
  key: string;
  kind: CostItemKind;
  description: string;
  quantity: string;
  unitPrice: string;
  partSource: CostItemPartSource;
  partCatalogId: string;
  partNameSnapshot: string;
  partSku: string;
  warrantyPolicy: string;
  partWarrantyOption: CostItemWarrantyOption;
  warrantyTermDays: string;
  warrantyFee: string;
  laborWarrantyDays: string;
}

export interface CostItemFieldErrors {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  partCatalogId?: string;
  warrantyTermDays?: string;
  warrantyFee?: string;
  laborWarrantyDays?: string;
}

export interface CostItemCatalogOption {
  id: string;
  name: string;
  sellingPrice: number;
  warrantyDays: number | null;
  warrantyPolicy: string | null;
  sku: string | null;
}

export interface CostItemCatalogPanel {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  parts: CostItemCatalogOption[];
  error: string | null;
}

let rowSequence = 0;

export function createCostItemRow(kind: CostItemKind = 'labor'): CostItemRow {
  rowSequence += 1;
  return {
    key: `item-${Date.now().toString(36)}-${rowSequence}`,
    kind,
    description: '',
    quantity: '',
    unitPrice: '',
    partSource: 'technician',
    partCatalogId: '',
    partNameSnapshot: '',
    partSku: '',
    warrantyPolicy: '',
    partWarrantyOption: 'no_warranty',
    warrantyTermDays: '',
    warrantyFee: '',
    laborWarrantyDays: '',
  };
}

/** Kind/source switches clear forbidden fields; never carried into the payload. */
export function switchCostItemKind(row: CostItemRow, kind: CostItemKind): CostItemRow {
  if (kind === 'labor') {
    return {
      ...row,
      kind,
      partSource: 'technician',
      partCatalogId: '',
      partNameSnapshot: '',
      partSku: '',
      warrantyPolicy: '',
      partWarrantyOption: 'no_warranty',
      warrantyTermDays: '',
      warrantyFee: '',
    };
  }
  return { ...row, kind, laborWarrantyDays: '' };
}

export function switchCostItemSource(row: CostItemRow, partSource: CostItemPartSource): CostItemRow {
  // Every source switch drops catalog snapshots and warranty choices: only the
  // current source's fields may reach the payload.
  return {
    ...row,
    partSource,
    partCatalogId: '',
    partNameSnapshot: '',
    partSku: '',
    warrantyPolicy: '',
    partWarrantyOption: 'no_warranty',
    warrantyTermDays: '',
    warrantyFee: '',
  };
}

/**
 * Shape one row into raw validator input. Raw strings pass through untouched;
 * the controller validator rejects invalid numerics (never 0) and owns bounds.
 */
export function costItemRowToPayloadItem(row: CostItemRow): Record<string, unknown> {
  const base = { description: row.description, quantity: row.quantity, unitPrice: row.unitPrice };
  if (row.kind === 'labor') {
    return {
      type: 'labor',
      ...base,
      ...(row.laborWarrantyDays.trim() ? { warrantyDays: row.laborWarrantyDays } : {}),
    };
  }
  if (row.partSource === 'fixhome') {
    return {
      type: 'parts_equipment',
      ...base,
      partSource: 'fixhome',
      partCatalogId: row.partCatalogId,
      ...(row.partNameSnapshot.trim() ? { partNameSnapshot: row.partNameSnapshot.trim() } : {}),
      ...(row.partSku.trim() ? { partSku: row.partSku.trim() } : {}),
      ...(row.warrantyPolicy.trim() ? { warrantyPolicy: row.warrantyPolicy.trim() } : {}),
    };
  }
  if (row.partSource === 'external') {
    return { type: 'parts_equipment', ...base, partSource: 'external' };
  }
  if (row.partWarrantyOption === 'paid_warranty') {
    return {
      type: 'parts_equipment',
      ...base,
      partSource: 'technician',
      partWarrantyOption: 'paid_warranty',
      ...(row.warrantyTermDays.trim() ? { warrantyTermDays: row.warrantyTermDays } : {}),
      ...(row.warrantyFee.trim() ? { warrantyFee: row.warrantyFee } : {}),
    };
  }
  return { type: 'parts_equipment', ...base, partSource: 'technician', partWarrantyOption: 'no_warranty' };
}

export interface CostItemEditorProps {
  row: CostItemRow;
  errors?: CostItemFieldErrors;
  catalog?: CostItemCatalogPanel;
  catalogHint?: string | null;
  expanded: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onChange: (next: CostItemRow) => void;
  onRemove: () => void;
  onLoadCatalog?: (search?: string) => void;
  onSelectCatalogPart?: (part: CostItemCatalogOption) => void;
}

function FieldError({ testID, message }: { testID: string; message?: string }) {
  if (!message) return null;
  return (
    <Text testID={testID} accessibilityRole="alert" style={styles.errorText}>
      {message}
    </Text>
  );
}

/**
 * One expandable quotation row. Only one row is expanded at a time (the parent
 * owns `expanded`); a 100-row quote never mounts 100 full forms at once.
 */
export function CostItemEditor({
  row,
  errors,
  catalog,
  catalogHint,
  expanded,
  canRemove,
  onToggle,
  onChange,
  onRemove,
  onLoadCatalog,
  onSelectCatalogPart,
}: CostItemEditorProps) {
  const id = (suffix: string) => `cost-item-${row.key}-${suffix}`;
  const title = row.description.trim() || 'Hạng mục mới';
  const kindLabel = row.kind === 'labor' ? 'Tiền công' : 'Linh kiện';
  const [search, setSearch] = useState('');

  return (
    <View style={styles.card}>
      <TouchableOpacity
        testID={id('header')}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint="Mở hoặc thu gọn hạng mục này"
        onPress={onToggle}
        style={styles.header}
      >
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerMeta}>{kindLabel}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.optionRow}>
            <TouchableOpacity
              testID={id('kind-labor')}
              accessibilityRole="button"
              accessibilityState={{ selected: row.kind === 'labor' }}
              onPress={() => onChange(switchCostItemKind(row, 'labor'))}
              style={[styles.option, row.kind === 'labor' && styles.optionSelected]}
            >
              <Text style={row.kind === 'labor' ? styles.optionTextSelected : styles.optionText}>Tiền công</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={id('kind-parts')}
              accessibilityRole="button"
              accessibilityState={{ selected: row.kind === 'parts_equipment' }}
              onPress={() => onChange(switchCostItemKind(row, 'parts_equipment'))}
              style={[styles.option, row.kind === 'parts_equipment' && styles.optionSelected]}
            >
              <Text style={row.kind === 'parts_equipment' ? styles.optionTextSelected : styles.optionText}>Linh kiện</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Mô tả</Text>
          <TextInput
            testID={id('description')}
            accessibilityLabel="Mô tả hạng mục"
            value={row.description}
            onChangeText={description => onChange({ ...row, description })}
            placeholder="Ví dụ: Vệ sinh dàn lạnh"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={2000}
          />
          <FieldError testID={id('error-description')} message={errors?.description} />

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Text style={styles.label}>Số lượng</Text>
              <TextInput
                testID={id('quantity')}
                accessibilityLabel="Số lượng"
                value={row.quantity}
                onChangeText={quantity => onChange({ ...row, quantity })}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <FieldError testID={id('error-quantity')} message={errors?.quantity} />
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>Đơn giá (đ)</Text>
              <TextInput
                testID={id('unitprice')}
                accessibilityLabel="Đơn giá"
                value={row.unitPrice}
                onChangeText={unitPrice => onChange({ ...row, unitPrice })}
                keyboardType="number-pad"
                placeholder="150000"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <FieldError testID={id('error-unitprice')} message={errors?.unitPrice} />
            </View>
          </View>

          {row.kind === 'labor' ? (
            <View>
              <Text style={styles.label}>Bảo hành công (ngày, tùy chọn)</Text>
              <TextInput
                testID={id('labor-warranty')}
                accessibilityLabel="Số ngày bảo hành tiền công"
                value={row.laborWarrantyDays}
                onChangeText={laborWarrantyDays => onChange({ ...row, laborWarrantyDays })}
                keyboardType="number-pad"
                placeholder="365"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <FieldError testID={id('error-labor-warranty')} message={errors?.laborWarrantyDays} />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>Nguồn linh kiện</Text>
              <View style={styles.optionRow}>
                {(
                  [
                    ['fixhome', 'FixHome'],
                    ['external', 'Ngoài'],
                    ['technician', 'Thợ'],
                  ] as [CostItemPartSource, string][]
                ).map(([source, label]) => (
                  <TouchableOpacity
                    key={source}
                    testID={id(`source-${source}`)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: row.partSource === source }}
                    onPress={() => onChange(switchCostItemSource(row, source))}
                    style={[styles.option, row.partSource === source && styles.optionSelected]}
                  >
                    <Text style={row.partSource === source ? styles.optionTextSelected : styles.optionText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {row.partSource === 'fixhome' && (
                <View>
                  <Text style={styles.hint}>Chọn đúng mã sản phẩm FixHome. Giá và bảo hành do máy chủ đối chiếu lại.</Text>
                  {catalogHint ? <Text style={styles.hint}>{catalogHint}</Text> : null}
                  <TextInput
                    testID={id('catalog-search')}
                    accessibilityLabel="Tìm linh kiện FixHome"
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={() => onLoadCatalog?.(search)}
                    returnKeyType="search"
                    placeholder="Tìm theo tên hoặc mã linh kiện"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  {(!catalog || catalog.status === 'idle' || catalog.status === 'error') && (
                    <View>
                      {catalog?.status === 'error' && catalog.error ? (
                        <Text testID={id('catalog-error')} accessibilityRole="alert" style={styles.errorText}>
                          {catalog.error}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        testID={id('catalog-retry')}
                        accessibilityRole="button"
                        accessibilityHint="Tải lại danh mục linh kiện FixHome"
                        onPress={() => onLoadCatalog?.(search)}
                        style={styles.secondaryAction}
                      >
                        <Text style={styles.secondaryActionText}>
                          {catalog?.status === 'error' ? 'Thử tải lại danh mục' : 'Tải danh mục FixHome'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {catalog?.status === 'loading' && <Text style={styles.hint}>Đang tải danh mục.</Text>}
                  {catalog?.status === 'empty' && (
                    <View>
                      <Text style={styles.hint}>Danh mục đang trống.</Text>
                      <TouchableOpacity
                        testID={id('catalog-retry')}
                        accessibilityRole="button"
                        onPress={() => onLoadCatalog?.(search)}
                        style={styles.secondaryAction}
                      >
                        <Text style={styles.secondaryActionText}>Tải lại</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {catalog?.status === 'ready' && (
                    <View>
                      <Text style={styles.catalogCount}>
                        {catalog.parts.length} linh kiện · nhập từ khóa rồi bấm tìm để lọc
                      </Text>
                      {/* Danh sách dài cuộn trong khung cố định, không kéo dài cả form. */}
                      <ScrollView nestedScrollEnabled style={styles.catalogList} keyboardShouldPersistTaps="handled">
                        {catalog.parts.map(part => (
                          <TouchableOpacity
                            key={part.id}
                            testID={id(`catalog-option-${part.id}`)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: row.partCatalogId === part.id }}
                            onPress={() => onSelectCatalogPart?.(part)}
                            style={[styles.catalogOption, row.partCatalogId === part.id && styles.optionSelected]}
                          >
                            <View style={styles.catalogText}>
                              <Text style={styles.catalogName} numberOfLines={2}>
                                {part.name}
                              </Text>
                              {!!part.sku && <Text style={styles.catalogMeta}>{part.sku}</Text>}
                            </View>
                            <Text style={styles.catalogPrice}>{formatVnd(part.sellingPrice)}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <FieldError testID={id('error-catalog')} message={errors?.partCatalogId} />
                </View>
              )}

              {row.partSource === 'external' && (
                <Text style={styles.hint}>Linh kiện ngoài luôn không bảo hành.</Text>
              )}

              {row.partSource === 'technician' && (
                <View>
                  <View style={styles.optionRow}>
                    <TouchableOpacity
                      testID={id('warranty-no')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: row.partWarrantyOption === 'no_warranty' }}
                      onPress={() => onChange({ ...row, partWarrantyOption: 'no_warranty', warrantyTermDays: '', warrantyFee: '' })}
                      style={[styles.option, row.partWarrantyOption === 'no_warranty' && styles.optionSelected]}
                    >
                      <Text style={row.partWarrantyOption === 'no_warranty' ? styles.optionTextSelected : styles.optionText}>
                        Không bảo hành
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={id('warranty-paid')}
                      accessibilityRole="button"
                      accessibilityState={{ selected: row.partWarrantyOption === 'paid_warranty' }}
                      onPress={() => onChange({ ...row, partWarrantyOption: 'paid_warranty' })}
                      style={[styles.option, row.partWarrantyOption === 'paid_warranty' && styles.optionSelected]}
                    >
                      <Text style={row.partWarrantyOption === 'paid_warranty' ? styles.optionTextSelected : styles.optionText}>
                        Bảo hành có phí
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {row.partWarrantyOption === 'paid_warranty' && (
                    <View style={styles.twoColumns}>
                      <View style={styles.column}>
                        <Text style={styles.label}>Thời hạn (ngày)</Text>
                        <TextInput
                          testID={id('warranty-term')}
                          accessibilityLabel="Thời hạn bảo hành"
                          value={row.warrantyTermDays}
                          onChangeText={warrantyTermDays => onChange({ ...row, warrantyTermDays })}
                          keyboardType="number-pad"
                          placeholder="90"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                        />
                        <FieldError testID={id('error-term')} message={errors?.warrantyTermDays} />
                      </View>
                      <View style={styles.column}>
                        <Text style={styles.label}>Phí (đ, tùy chọn)</Text>
                        <TextInput
                          testID={id('warranty-fee')}
                          accessibilityLabel="Phí bảo hành"
                          value={row.warrantyFee}
                          onChangeText={warrantyFee => onChange({ ...row, warrantyFee })}
                          keyboardType="number-pad"
                          placeholder="30000"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                        />
                        <FieldError testID={id('error-fee')} message={errors?.warrantyFee} />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {canRemove && (
            <TouchableOpacity
              testID={id('remove')}
              accessibilityRole="button"
              accessibilityHint="Xóa hạng mục này khỏi báo giá"
              onPress={onRemove}
              style={styles.removeAction}
            >
              <Text style={styles.removeText}>Xóa hạng mục</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, gap: 8 },
  headerTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  headerMeta: { color: colors.textSecondary, fontSize: 13 },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 8 },
  section: { gap: 8 },
  label: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  twoColumns: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, gap: 8 },
  optionRow: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  optionSelected: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  optionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  optionTextSelected: { color: colors.primaryStrong, fontSize: 14, fontWeight: '700' },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 19 },
  secondaryAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
  },
  secondaryActionText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  catalogCount: { color: colors.textSecondary, fontSize: 12, marginBottom: 6 },
  catalogList: { maxHeight: 264, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  catalogOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  catalogText: { flex: 1, minWidth: 0, gap: 2 },
  catalogName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  catalogMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  catalogPrice: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  removeAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.error, fontSize: 15, fontWeight: '600' },
});
