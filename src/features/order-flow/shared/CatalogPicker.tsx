import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

const PAGE = 8;

/**
 * FixHome catalog search + pick list shared by the quotation/extra editor and
 * the pre-repair parts picker. Loads on first mount (idle) so the technician
 * never has to find a "load catalog" button; the list is paged instead of a
 * nested ScrollView so it never fights the page scroll.
 */
export function CatalogPicker<T extends CatalogPickerOption>({ idPrefix, selectedId, catalog, hint, error, onLoad, onSelect }: {
  idPrefix: string;
  selectedId: string;
  catalog?: CatalogPickerPanel<T>;
  hint?: string | null;
  error?: string;
  onLoad?: (search?: string) => void;
  onSelect?: (part: T) => void;
}) {
  const id = (suffix: string) => `${idPrefix}${suffix}`;
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const idle = !catalog || catalog.status === 'idle';
  // Mount-only on purpose: a failed load shows an explicit retry instead of looping.
  useEffect(() => { if (idle) onLoad?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const runSearch = () => { setShown(PAGE); onLoad?.(search); };

  return (
    <View style={styles.wrap}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.searchRow}>
        <TextInput
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
        <View style={styles.wrap}>
          <Text style={styles.count}>{catalog.parts.length} linh kiện</Text>
          <View style={styles.list}>
            {catalog.parts.slice(0, shown).map(part => {
              const selected = selectedId === part.id;
              return (
                <TouchableOpacity
                  key={part.id}
                  testID={id(`catalog-option-${part.id}`)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${part.name}${part.sku ? `, mã ${part.sku}` : ''}, ${formatVnd(part.sellingPrice)}${selected ? ', đã chọn' : ''}`}
                  onPress={() => onSelect?.(part)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionName} numberOfLines={2}>{part.name}</Text>
                    {!!part.sku && <Text style={styles.optionMeta}>Mã {part.sku}</Text>}
                  </View>
                  <View style={styles.optionSide}>
                    <Text style={styles.optionPrice}>{formatVnd(part.sellingPrice)}</Text>
                    {selected && <Text style={styles.chosen}>Đã chọn</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {catalog.parts.length > shown && (
            <TouchableOpacity testID={id('catalog-more')} accessibilityRole="button" onPress={() => setShown(n => n + PAGE)} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Xem thêm ({catalog.parts.length - shown})</Text>
            </TouchableOpacity>
          )}
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
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  optionName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  optionMeta: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  optionSide: { alignItems: 'flex-end', gap: 2 },
  optionPrice: { color: colors.primaryStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  chosen: { color: colors.primaryStrong, fontSize: 12, fontWeight: '700' },
});
