import React, { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { lightTheme as colors } from '../../../constants/theme';
import { formatVnd } from '../../../utils/format';

export interface CatalogPickerOption {
  id: string;
  name: string;
  sellingPrice: number;
  sku: string | null;
}

export interface CatalogPickerPanel<T extends CatalogPickerOption = CatalogPickerOption> {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  parts: T[];
  error: string | null;
}

/**
 * FixHome catalog search + pick list shared by the quotation/extra editor and
 * the pre-repair parts picker. Loads on first mount (idle) so the technician
 * never has to find a "load catalog" button; the list scrolls inside a
 * fixed-height box so a long catalog never stretches the page.
 */
export function CatalogPicker<T extends CatalogPickerOption>({ idPrefix, selectedId, catalog, hint, error, onLoad, onSelect, selectedIds, renderSelected, fill, ListComponent = ScrollView, InputComponent = TextInput }: {
  idPrefix: string;
  selectedId: string;
  catalog?: CatalogPickerPanel<T>;
  hint?: string | null;
  error?: string;
  onLoad?: (search?: string) => void;
  onSelect?: (part: T) => void;
  /** Multi-select: every id here shows as picked (a check mark, no "Đã chọn" text) and selectedId is ignored. */
  selectedIds?: string[];
  /** Extra content under a picked option (e.g. its quantity stepper). */
  renderSelected?: (part: T) => ReactNode;
  /** Fill the parent's height and let the list take the remaining space (bottom sheet). */
  fill?: boolean;
  ListComponent?: ComponentType<any>;
  InputComponent?: ComponentType<any>;
}) {
  const id = (suffix: string) => `${idPrefix}${suffix}`;
  const [search, setSearch] = useState('');
  const idle = !catalog || catalog.status === 'idle';
  // Mount-only on purpose: a failed load shows an explicit retry instead of looping.
  useEffect(() => { if (idle) onLoad?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const runSearch = () => onLoad?.(search);

  return (
    <View style={[styles.wrap, fill && styles.fill]}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.searchRow}>
        <InputComponent
          testID={id('catalog-search')}
          accessibilityLabel="Tìm linh kiện FixHome"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          placeholder="Tìm theo tên hoặc mã linh kiện"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, styles.searchInput]}
        />
        <TouchableOpacity
          testID={id('catalog-search-submit')}
          accessibilityRole="button"
          accessibilityLabel="Tìm linh kiện"
          disabled={catalog?.status === 'loading'}
          onPress={runSearch}
          style={[styles.searchBtn, catalog?.status === 'loading' && styles.disabled]}
        >
          <Text style={styles.searchBtnText}>Tìm</Text>
        </TouchableOpacity>
      </View>

      {(idle || catalog?.status === 'error') && (
        <View style={styles.wrap}>
          {catalog?.status === 'error' && catalog.error ? (
            <Text testID={id('catalog-error')} accessibilityRole="alert" style={styles.errorText}>{catalog.error}</Text>
          ) : null}
          <TouchableOpacity
            testID={id('catalog-retry')}
            accessibilityRole="button"
            accessibilityHint="Tải lại danh mục linh kiện FixHome"
            onPress={() => onLoad?.(search)}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>{catalog?.status === 'error' ? 'Thử tải lại danh mục' : 'Tải danh mục FixHome'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {catalog?.status === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.hint}>Đang tải danh mục…</Text>}
      {catalog?.status === 'empty' && (
        <View style={styles.wrap}>
          <Text style={styles.hint}>Danh mục đang trống hoặc không có linh kiện khớp từ khóa.</Text>
          <TouchableOpacity testID={id('catalog-retry')} accessibilityRole="button" onPress={() => onLoad?.(search)} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      )}
      {catalog?.status === 'ready' && (
        <View style={[styles.wrap, fill && styles.fill]}>
          <Text style={styles.count}>{catalog.parts.length} linh kiện</Text>
          <ListComponent nestedScrollEnabled style={[styles.list, fill ? styles.fill : styles.listCap]}>
            {catalog.parts.map(part => {
              const selected = selectedIds ? selectedIds.includes(part.id) : selectedId === part.id;
              return (
                <View key={part.id} style={[styles.optionWrap, selected && styles.optionSelected]}>
                <TouchableOpacity
                  testID={id(`catalog-option-${part.id}`)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${part.name}${part.sku ? `, mã ${part.sku}` : ''}, ${formatVnd(part.sellingPrice)}${selected ? ', đã chọn' : ''}`}
                  onPress={() => onSelect?.(part)}
                  style={styles.option}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionName} numberOfLines={2}>{part.name}</Text>
                    {!!part.sku && <Text style={styles.optionMeta}>Mã {part.sku}</Text>}
                  </View>
                  <View style={styles.optionSide}>
                    <Text style={styles.optionPrice}>{formatVnd(part.sellingPrice)}</Text>
                    {selected && !selectedIds && <Text style={styles.chosen}>Đã chọn</Text>}
                  </View>
                  {selectedIds && <View style={[styles.check, selected && styles.checkOn]}>{selected && <Check size={14} color={colors.surface} />}</View>}
                </TouchableOpacity>
                {selected && renderSelected?.(part)}
                </View>
              );
            })}
          </ListComponent>
        </View>
      )}
      {error ? <Text testID={id('error-catalog')} accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  count: { color: colors.textSecondary, fontSize: 12 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, color: colors.text, fontSize: 16, backgroundColor: colors.surface },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1 },
  searchBtn: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primaryStrong, paddingHorizontal: 16 },
  searchBtnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 19 },
  secondaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 16 },
  secondaryActionText: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  fill: { flex: 1 },
  listCap: { maxHeight: 320 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  optionWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  optionMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  optionSide: { alignItems: 'flex-end', gap: 2 },
  optionPrice: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  chosen: { color: colors.primaryStrong, fontSize: 12, fontWeight: '700' },
});
