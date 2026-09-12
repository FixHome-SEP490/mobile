import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';

export default function CustomerAIDiagnosisScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState('');
  const [analyzed, setAnalyzed] = useState(false);

  // Step 2 states
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [quantity, setQuantity] = useState(1);

  const handleAnalyze = () => {
    setAnalyzed(true);
  };

  const handleNextStep = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      navigation.navigate('CustomerMatching');
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const renderStep1 = () => (
    <>
      <Text style={styles.mainTitle}>Nhà mình đang gặp vấn đề gì?</Text>
      <Text style={styles.helperText}>Thêm mô tả để thợ chuẩn bị tốt hơn. Bạn có thể dùng ảnh để nhận gợi ý kiểm tra.</Text>

      <TouchableOpacity style={styles.uploadArea} activeOpacity={0.7}>
        <View style={styles.camIcon}>
          <Ionicons name="camera-outline" size={24} color="#2563EB" />
        </View>
        <Text style={styles.uploadTitle}>Thêm ảnh thiết bị</Text>
        <Text style={styles.uploadHelper}>Ảnh toàn cảnh và vị trí có vấn đề</Text>
        <Text style={styles.uploadHelper}>Tối đa 5 ảnh · JPG, PNG · 10 MB/ảnh</Text>
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Mô tả nhu cầu <Text style={styles.inlineTag}>· không bắt buộc khi đặt lịch</Text></Text>
        <TextInput
          style={styles.textArea}
          placeholder="Ví dụ: Điều hòa vẫn chạy nhưng không lạnh, có tiếng kêu nhẹ…"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
          placeholderTextColor="#94A3B8"
        />
      </View>

      {!analyzed ? (
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleAnalyze} activeOpacity={0.7}>
          <Text style={styles.secondaryBtnText}>Phân tích sự cố bằng AI</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.aiResultCard}>
          <View style={styles.scoreRow}>
            <View style={styles.badgeSuccess}>
              <Text style={styles.badgeTextSuccess}>Đã có gợi ý kiểm tra</Text>
            </View>
            <Text style={styles.inlineTag}>Kết quả mô phỏng</Text>
          </View>
          <Text style={styles.aiResultTitle}>Nên kiểm tra dàn lạnh và nguồn gas</Text>
          <Text style={styles.aiResultDesc}>Mô tả này có thể liên quan đến nhiều nguyên nhân. Thợ sẽ kiểm tra trực tiếp và báo giá trước khi sửa.</Text>
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Chi phí tham khảo</Text>
            <Text style={styles.quoteValue}>150.000–450.000đ</Text>
          </View>
          <Text style={styles.aiResultNote}>Đây chưa phải báo giá. Không tự tháo thiết bị nếu bạn không có chuyên môn.</Text>
        </View>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.mainTitle}>Thông tin lịch hẹn</Text>
      
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Địa chỉ sửa chữa</Text>
          <TouchableOpacity><Text style={styles.link}>Thay đổi</Text></TouchableOpacity>
        </View>
        <View style={styles.addressBox}>
          <Ionicons name="location" size={20} color="#2563EB" />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.addressTitle}>Nhà riêng</Text>
            <Text style={styles.addressDesc}>28 Duy Tân, Cầu Giấy, Hà Nội</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Chọn ngày</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
          {[0,1,2,3].map(i => (
            <TouchableOpacity 
              key={i} 
              style={[styles.dateChip, selectedDate === i && styles.dateChipActive]}
              onPress={() => setSelectedDate(i)}
            >
              <Text style={[styles.dateText, selectedDate === i && styles.textActive]}>{i === 0 ? 'Hôm nay' : `Ngày ${i+1}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.label, { marginTop: 16 }]}>Chọn giờ</Text>
        <View style={styles.timeGrid}>
          {['09:00', '10:00', '13:00', '14:00', '15:00', '16:00'].map(time => (
            <TouchableOpacity 
              key={time} 
              style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
              onPress={() => setSelectedTime(time)}
            >
              <Text style={[styles.timeText, selectedTime === time && styles.textActive]}>{time}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Số lượng thiết bị</Text>
          <View style={styles.quantityBox}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
              <Ionicons name="remove" size={20} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{quantity}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(quantity + 1)}>
              <Ionicons name="add" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.mainTitle}>Kiểm tra lần cuối</Text>
      
      <View style={styles.card}>
        <Text style={styles.serviceTitle}>Dịch vụ đã chọn</Text>
        <Text style={styles.serviceName}>Vệ sinh máy lạnh</Text>
        
        <View style={styles.divider} />
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Thời gian</Text>
          <Text style={styles.summaryValue}>{selectedTime} · {selectedDate === 0 ? 'Hôm nay' : `Ngày ${selectedDate+1}`}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Địa chỉ</Text>
          <Text style={styles.summaryValue}>28 Duy Tân, Cầu Giấy</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Số lượng</Text>
          <Text style={styles.summaryValue}>{quantity} thiết bị</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Phí dịch vụ</Text>
          <Text style={styles.summaryValue}>{150000 * quantity}đ</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Ưu đãi</Text>
          <Text style={[styles.summaryValue, { color: '#16A34A' }]}>-50.000đ</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Dự kiến thanh toán</Text>
          <Text style={styles.totalValue}>{(150000 * quantity) - 50000}đ</Text>
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Hỗ trợ chẩn đoán</Text>
        {step === 1 ? (
          <View style={styles.aiBadge}>
            <MaterialCommunityIcons name="robot-outline" size={14} color="#2563EB" />
            <Text style={styles.aiBadgeText}>AI 2.0</Text>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Bước {step} / 3</Text>
            <Text style={styles.progressLabel}>
              {step === 1 ? 'Mô tả nhu cầu' : step === 2 ? 'Thời gian & địa chỉ' : 'Kiểm tra lần cuối'}
            </Text>
          </View>
          <View style={styles.steps}>
            <View style={[styles.dot, step >= 1 && styles.dotOn]} />
            <View style={[styles.dot, step >= 2 && styles.dotOn]} />
            <View style={[styles.dot, step >= 3 && styles.dotOn]} />
          </View>
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bookBtn} activeOpacity={0.8} onPress={handleNextStep}>
          <LinearGradient colors={['#1D4ED8', '#2563EB']} style={styles.bookBtnGradient}>
            <Text style={styles.bookBtnText}>
              {step === 1 ? 'Tiếp tục chọn lịch' : step === 2 ? 'Tiếp tục' : 'Xác nhận & tìm kỹ thuật viên'}
            </Text>
            {step < 3 && <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />}
          </LinearGradient>
        </TouchableOpacity>
        {step === 1 && <Text style={styles.ctaNote}>Ảnh và mô tả được đính kèm lịch hẹn</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', flex: 1, textAlign: 'center' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  aiBadgeText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 100 },
  progressWrap: { marginBottom: 16 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  steps: { flexDirection: 'row', gap: 6 },
  dot: { height: 4, flex: 1, backgroundColor: '#E2E8F0', borderRadius: 2 },
  dotOn: { backgroundColor: '#2563EB' },
  mainTitle: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  helperText: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 16 },
  uploadArea: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  camIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  uploadHelper: { fontSize: 12, color: '#64748B', marginTop: 4 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  inlineTag: { fontSize: 12, color: '#64748B', fontWeight: '400' },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 100,
    textAlignVertical: 'top'
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  aiResultCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badgeSuccess: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeTextSuccess: { color: '#16A34A', fontSize: 12, fontWeight: '700' },
  aiResultTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  aiResultDesc: { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 12 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 8 },
  quoteLabel: { fontSize: 14, color: '#64748B' },
  quoteValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  aiResultNote: { fontSize: 12, color: '#64748B', fontStyle: 'italic' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  bookBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  bookBtnGradient: { paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  bookBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  ctaNote: { textAlign: 'center', fontSize: 12, color: '#64748B' },
  
  // Step 2 & 3 styles
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  link: { fontSize: 14, color: '#2563EB', fontWeight: '600' },
  addressBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12 },
  addressTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  addressDesc: { fontSize: 12, color: '#64748B', marginTop: 4 },
  dateStrip: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  dateChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF' },
  dateChipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  dateText: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, width: '31%', alignItems: 'center' },
  timeChipActive: { borderColor: '#2563EB', backgroundColor: '#2563EB' },
  timeText: { fontSize: 14, color: '#0F172A', fontWeight: '500' },
  textActive: { color: '#FFFFFF', fontWeight: '700' },
  quantityBox: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  
  serviceTitle: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  serviceName: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: '#64748B' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#2563EB' },
});
