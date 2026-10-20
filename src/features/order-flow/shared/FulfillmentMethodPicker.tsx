import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme as colors } from '../../../constants/theme';

export type FulfillmentMethod = 'pickup' | 'delivery';

const HINT: Record<FulfillmentMethod, string> = {
  pickup: 'Bạn tự đến kho lấy linh kiện và xác nhận bằng mã QR khi nhận.',
  delivery: 'Linh kiện được giao đến nơi; bạn xác nhận bằng mã QR từ nhân viên giao hàng.',
};

/** Two-way receive-method choice with a visible selected state (shared by pre-repair and extra-cost screens). */
export function FulfillmentMethodPicker({ testIDPrefix, value, disabled, onChange }: {
  testIDPrefix: string;
  value: FulfillmentMethod;
  disabled?: boolean;
  onChange: (method: FulfillmentMethod) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Hình thức nhận linh kiện" style={styles.row}>
        {(['pickup', 'delivery'] as const).map(method => {
          const selected = value === method;
          return (
            <TouchableOpacity
              key={method}
              testID={`${testIDPrefix}-${method}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !!disabled }}
              disabled={disabled}
              style={[styles.btn, selected && styles.btnSelected, disabled && styles.disabled]}
              onPress={() => onChange(method)}
            >
              <Text style={[styles.text, selected && styles.textSelected]}>{method === 'pickup' ? 'Tự lấy tại kho' : 'Giao tận nơi'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>{HINT[value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 8 },
  btnSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.5 },
  text: { fontSize: 14, color: colors.text, fontWeight: '500', textAlign: 'center' },
  textSelected: { color: colors.primaryStrong, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
});
