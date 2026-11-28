import React from 'react';
import { Text, View } from 'react-native';
import { useExtraCostDecisionNotice } from '../runtime/extra-cost-decision-notice';
import { lightTheme as colors, spacing } from '../../../constants/theme';

/** Says "the customer answered your extra-cost proposal" at the top of the screen the technician is on; goes away by itself. */
export default function ExtraCostDecisionBanner({ orderId }: { orderId: string | undefined }) {
  const notice = useExtraCostDecisionNotice(orderId);
  if (!notice) return null;
  const tone = notice.approved ? colors.tone.success : colors.tone.danger;
  return (
    <View testID="extra-cost-decision-banner" accessibilityRole="alert" style={{ backgroundColor: tone.bg, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, gap: 2 }}>
      <Text style={{ color: tone.text, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>
        {notice.approved ? 'Khách đã đồng ý đề xuất của bạn' : 'Khách đã từ chối đề xuất của bạn'}
      </Text>
      <Text style={{ color: tone.text, fontSize: 13, lineHeight: 19 }}>
        {notice.approved ? 'Bạn có thể sửa thêm phần phát sinh.' : 'Bạn tiếp tục công việc theo phạm vi đã chốt.'}
      </Text>
    </View>
  );
}
