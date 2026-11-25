import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../constants/theme';
import {
  SKILL_EVIDENCE_TYPES,
  SKILL_EVIDENCE_TYPE_LABEL,
  skillEvidenceFields,
  type SkillEvidenceField,
  type SkillEvidenceForm,
} from './skill-evidence';

const VISIBLE_TYPES = 4;

const FIELD: Record<SkillEvidenceField, { label: string; placeholder: string; maxLength: number; keyboardType?: 'number-pad' }> = {
  issuer: { label: 'Cơ quan cấp hoặc nơi xác nhận', placeholder: 'Ví dụ: Trường Cao đẳng nghề', maxLength: 200 },
  referenceNumber: { label: 'Số hiệu', placeholder: 'Số trên giấy tờ', maxLength: 100 },
  issuedAt: { label: 'Ngày cấp', placeholder: 'dd/MM/yyyy', maxLength: 10 },
  expiresAt: { label: 'Ngày hết hạn (nếu có)', placeholder: 'dd/MM/yyyy', maxLength: 10 },
  claimedYears: { label: 'Số năm kinh nghiệm theo giấy tờ này', placeholder: 'Số năm', maxLength: 2, keyboardType: 'number-pad' },
};

/**
 * The type of a paper and the details that fit it, shared by the skills sheet (inside a bottom sheet, which needs
 * `BottomSheetTextInput`) and the registration wizard (a plain scroll view, where the normal `TextInput` is right).
 */
export default function SkillEvidenceFormFields({ form, onChange, InputComponent = TextInput, labelSuffix = '', testIdPrefix = 'skill-evidence' }: {
  form: SkillEvidenceForm;
  onChange: (next: SkillEvidenceForm) => void;
  InputComponent?: typeof TextInput;
  /** Added to each field's accessibility label so a screen reader tells rows of different services apart. */
  labelSuffix?: string;
  testIdPrefix?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const fields = skillEvidenceFields(form.evidenceType);
  // Only the first few types to start with; the chosen one always stays in view.
  const [showAllTypes, setShowAllTypes] = useState(false);
  const types = showAllTypes
    ? SKILL_EVIDENCE_TYPES
    : SKILL_EVIDENCE_TYPES.filter((type, index) => index < VISIBLE_TYPES || type === form.evidenceType);

  return (
    <>
      <Text style={styles.label}>Loại giấy tờ</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {types.map((type) => {
          const selected = form.evidenceType === type;
          return (
            <Pressable key={type} testID={`${testIdPrefix}-type-${type}`} accessibilityRole="radio" accessibilityState={{ selected }}
              onPress={() => onChange({ ...form, evidenceType: type, issuer: '', referenceNumber: '', issuedAt: '', expiresAt: '', claimedYears: '' })}
              style={[styles.option, selected && styles.optionSelected]}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{SKILL_EVIDENCE_TYPE_LABEL[type]}</Text>
            </Pressable>
          );
        })}
        {SKILL_EVIDENCE_TYPES.length > VISIBLE_TYPES && (
          <Pressable testID={`${testIdPrefix}-type-more`} accessibilityRole="button" onPress={() => setShowAllTypes((v) => !v)} style={styles.more}>
            <Text style={styles.moreText}>{showAllTypes ? 'Thu gọn' : `Xem đầy đủ (${SKILL_EVIDENCE_TYPES.length})`}</Text>
          </Pressable>
        )}
      </View>
      {fields.map((field) => (
        <View key={field}>
          <Text style={styles.label}>{FIELD[field].label}</Text>
          <InputComponent
            value={form[field]}
            onChangeText={(value) => onChange({ ...form, [field]: field === 'claimedYears' ? value.replace(/\D/g, '') : value })}
            keyboardType={FIELD[field].keyboardType}
            maxLength={FIELD[field].maxLength}
            placeholder={FIELD[field].placeholder}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={`${FIELD[field].label}${labelSuffix ? ` ${labelSuffix}` : ''}`}
            style={styles.input}
          />
        </View>
      ))}
    </>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500', marginBottom: 4 },
  options: { gap: 8 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primaryStrong, backgroundColor: colors.primarySoft },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  moreText: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  optionText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  optionTextSelected: { color: colors.primaryStrong, fontWeight: '600' },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 14, color: colors.text, fontSize: 16, backgroundColor: colors.surface },
});
