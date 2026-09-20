import { useAppTheme } from '../../constants/theme';
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, StatusBar, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function CustomerReviewScreen() {
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('Kỹ thuật viên làm nhanh, giải thích rõ chi phí trước khi thay linh kiện.');

  const CHIPS = ['Đúng giờ', 'Lịch sự', 'Sạch sẽ', 'Tư vấn rõ'];
  const [selectedChips, setSelectedChips] = useState<string[]>(['Đúng giờ', 'Lịch sự']);

  const toggleChip = (chip: string) => {
    if (selectedChips.includes(chip)) {
      setSelectedChips(selectedChips.filter(c => c !== chip));
    } else {
      setSelectedChips([...selectedChips, chip]);
    }
  };

  const handleSubmit = () => {
    Alert.alert('Thành công', 'Đánh giá đã được gửi. Cảm ơn bạn!', [
      { text: 'OK', onPress: () => navigation.navigate('CustomerMain') }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('CustomerMain')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đánh giá dịch vụ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.techCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color={colors.primary} />
          </View>
          <View style={styles.techDetails}>
            <Text style={styles.techName}>Nguyễn Đức Anh</Text>
            <Text style={styles.mutedText}>Vệ sinh + sửa điều hòa · #FH-240921</Text>
          </View>
        </View>

        <View style={styles.ratingArea}>
          <Text style={styles.ratingTitle}>Trải nghiệm của bạn thế nào?</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} style={styles.starBtn}>
                <Ionicons name={star <= rating ? "star" : "star-outline"} size={36} color={star <= rating ? "#EAB308" : "#CBD5E1"} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.chipsContainer}>
          {CHIPS.map(chip => (
            <TouchableOpacity 
              key={chip} 
              style={[styles.chip, selectedChips.includes(chip) && styles.chipActive]}
              onPress={() => toggleChip(chip)}
            >
              <Text style={[styles.chipText, selectedChips.includes(chip) && styles.chipTextActive]}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Nhận xét</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            value={comment}
            onChangeText={setComment}
            placeholder="Chia sẻ thêm về trải nghiệm của bạn..."
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}>
          <Text style={styles.primaryBtnText}>Gửi đánh giá</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Tính năng đang phát triển')}>
          <Text style={styles.secondaryBtnText}>Tôi có vấn đề với đơn này</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
  content: { padding: 16 },
  techCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  techDetails: { flex: 1 },
  techName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  mutedText: { fontSize: 12, color: colors.textSecondary },
  ratingArea: { alignItems: 'center', paddingVertical: 16, marginBottom: 16 },
  ratingTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },
  starsContainer: { flexDirection: 'row', gap: 8 },
  starBtn: { padding: 4 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, justifyContent: 'center' },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: '#DBEAFE', borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  field: { marginBottom: 24 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8 },
  textArea: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, fontSize: 14, color: colors.text, minHeight: 100, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: colors.surface, paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});


