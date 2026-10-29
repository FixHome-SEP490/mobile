import { useAppTheme } from '../../constants/theme';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { AI_MAX_IMAGES } from '../../api/ai.api';
import { pickImagesForAi } from '../../services/image-for-ai';
import {
  AI_DESCRIPTION_REQUIRED_HINT,
  canSendToAssistant,
  showDescriptionHint,
} from './ai-diagnosis-input';
import BackButton from '../../components/BackButton';

type DiagnosisRoute = RouteProp<RootStackParamList, 'CustomerAIDiagnosis'>;

export default function CustomerAIDiagnosisScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = getStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DiagnosisRoute>();

  // Set when the assistant sent the customer here with a service in hand. The
  // chat never books; it routes across, and this is the far end of that route.
  const prefill = route.params?.prefill;

  const [description, setDescription] = useState(prefill?.description || '');
  /** Data URIs, at most three, only used to hand over to the assistant. */
  const [images, setImages] = useState<string[]>([]);
  const assistantReady = canSendToAssistant({ text: description, imageCount: images.length });

  /**
   * Hand the photos and the description to the assistant.
   *
   * Diagnosis used to happen on this screen, in a card that read `advice`,
   * `possibleCauses` and `estimatedCostRange` - three fields the AI Service has
   * never returned, so the card showed a canned sentence whatever the customer
   * typed. A diagnosis is a conversation: the assistant asks which appliance it
   * is when the photo is ambiguous, and asks follow-up questions. That belongs
   * in chat, so this screen collects the first message and hands it over.
   *
   * Booking without a diagnosis is untouched. A customer who knows what they
   * want carries straight on to step two.
   */
  const askTheAssistant = useCallback(() => {
    // BRX-064: photos alone are not a diagnosis request; the button is
    // disabled without text, this guards a stale press as well.
    if (!canSendToAssistant({ text: description, imageCount: images.length })) return;
    Haptics.selectionAsync();
    navigation.navigate('CustomerAIChat', {
      initialDescription: description.trim(),
      initialImages: images,
    });
  }, [description, images, navigation]);

  const pickImages = useCallback(async () => {
    Haptics.selectionAsync();
    const result = await pickImagesForAi(images.length);
    if (result.problemVi) Alert.alert('Ảnh', result.problemVi);
    if (result.images.length > 0) {
      setImages((prev) =>
        [...prev, ...result.images.map((image) => image.dataUri)].slice(0, AI_MAX_IMAGES),
      );
    }
  }, [images.length]);

  const handleNextStep = () => {
    // Booking description is mandatory: do not hand an empty description to
    // BookingCreate. AI chat is advisory and never creates the Booking.
    if (!description.trim()) {
      Alert.alert(
        'Cần mô tả sự cố',
        'Mô tả sự cố là bắt buộc khi đặt lịch. Bạn hãy mô tả thiết bị và vấn đề cần sửa trước khi tiếp tục.',
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Use real catalog and saved address rather than legacy placeholder steps.
    navigation.push('CustomerBookingCreate', {
      prefill: { ...prefill, description: description.trim() },
    });
  };
  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <BackButton onPress={handleBack} />
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>GỢI Ý CHỌN DỊCH VỤ</Text>
              <Text style={styles.mainTitle} accessibilityRole="header">Kể FixHome nghe</Text>
              <Text style={styles.headerSubtitle}>Trợ lý FixHome</Text>
            </View>
            <View style={{ width: 44, height: 44 }} />
          </View>
          <View style={styles.advisoryArt}>
            <Ionicons name="sparkles-outline" size={36} color={colors.primaryStrong} />
            <Text style={styles.artTitle}>Nhà đang gặp chuyện gì?</Text>
          </View>
          <Text style={styles.helperText}>Mô tả dấu hiệu bạn thấy. Bạn quyết định dịch vụ phù hợp.</Text>
          {prefill?.serviceName && (
            <View style={styles.prefillCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.tone.success.text} />
              <View style={styles.prefillText}>
                <Text style={styles.prefillLabel}>Dịch vụ đã chọn</Text>
                <Text style={styles.prefillValue}>{prefill.serviceName}</Text>
              </View>
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Mô tả sự cố <Text style={styles.inlineTag}>· bắt buộc</Text></Text>
            <TextInput
              style={styles.textArea}
              placeholder="Ví dụ: Điều hòa vẫn chạy nhưng không lạnh…"
              multiline numberOfLines={4} maxLength={2000}
              value={description} onChangeText={setDescription}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Mô tả sự cố thiết bị"
              accessibilityHint="Nhập mô tả bắt buộc trước khi trò chuyện AI hoặc tiếp tục đặt lịch"
            />
            <Text style={styles.fieldHint}>Thiết bị nào, dấu hiệu gì và xảy ra từ khi nào?</Text>
          </View>
          <TouchableOpacity style={styles.uploadArea} activeOpacity={0.7} onPress={pickImages}
            accessibilityRole="button" accessibilityLabel="Chọn ảnh thiết bị cho trợ lý"
            accessibilityHint={`Tối đa ${AI_MAX_IMAGES} ảnh, JPG hoặc PNG. Ảnh chỉ gửi vào cuộc trò chuyện AI.`}>
            <Ionicons name="camera-outline" size={24} color={colors.text} />
            <View style={styles.uploadCopy}>
              <Text style={styles.uploadTitle}>Thêm ảnh thiết bị · không bắt buộc</Text>
              <Text style={styles.uploadHelper}>Đã chọn {images.length}/{AI_MAX_IMAGES} ảnh</Text>
            </View>
            <Ionicons name="add" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.fieldHint}>JPG, PNG · tối đa 8 MB/ảnh. Chỉ chọn ảnh liên quan đến sự cố.</Text>
          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {images.map((uri, index) => (
                <View key={index} style={styles.thumbBox}>
                  <Image source={{ uri }} style={styles.thumb} accessibilityLabel={`Ảnh sự cố thứ ${index + 1}`} />
                  <TouchableOpacity style={styles.thumbRemove}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setImages((prev) => prev.filter((_, i) => i !== index));
                    }}
                    accessibilityRole="button" accessibilityLabel={`Bỏ ảnh thứ ${index + 1}`}>
                    <Ionicons name="close" size={20} color={colors.surface} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          {showDescriptionHint({ text: description, imageCount: images.length }, true) && (
            <Text style={styles.requiredHint}>{AI_DESCRIPTION_REQUIRED_HINT}</Text>
          )}
          <View style={styles.advisoryStrip}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.advisoryText}>AI chỉ đưa ra gợi ý, không tự đặt lịch hoặc xác nhận giá.</Text>
          </View>
          <Text style={styles.assistantHint}>Trợ lý có thể hỏi thêm để làm rõ tình trạng. Bạn vẫn có thể tiếp tục chọn lịch mà không cần trò chuyện AI.</Text>
        </ScrollView>
        <View style={styles.bottomBar}>
          <TouchableOpacity testID="ai-diagnosis-ask"
            style={[styles.askBtn, !assistantReady && styles.askBtnDisabled]}
            onPress={askTheAssistant} disabled={!assistantReady} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel="Nhờ trợ lý tư vấn"
            accessibilityState={{ disabled: !assistantReady }}
            accessibilityHint={assistantReady ? undefined : AI_DESCRIPTION_REQUIRED_HINT}>
            <Text style={[styles.askBtnText, !assistantReady && styles.askBtnTextDisabled]}>Nhờ trợ lý tư vấn</Text>
            <Ionicons name="arrow-forward" size={20} color={assistantReady ? colors.surface : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bookBtn} activeOpacity={0.8} onPress={handleNextStep}
            accessibilityRole="button" accessibilityLabel="Tiếp tục chọn lịch sửa chữa"
            accessibilityHint="Cần có mô tả sự cố, chưa gửi yêu cầu đặt lịch ở bước này">
            <Text style={styles.bookBtnText}>Tiếp tục chọn lịch</Text>
          </TouchableOpacity>
          <Text style={styles.ctaNote}>Ảnh chỉ dùng cho trợ lý AI; hiện chưa đính kèm vào yêu cầu đặt lịch.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  screenBody: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4, alignItems: 'center' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary, textAlign: 'center' },
  mainTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerSubtitle: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  advisoryArt: { minHeight: 88, borderRadius: 24, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 24 },
  artTitle: { flex: 1, fontSize: 20, lineHeight: 28, fontWeight: '600', color: colors.primaryStrong },
  helperText: { fontSize: 14, lineHeight: 24, color: colors.textSecondary },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  inlineTag: { fontSize: 12, color: colors.textSecondary, fontWeight: '400' },
  textArea: { minHeight: 112, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 16, lineHeight: 24, color: colors.text, textAlignVertical: 'top' },
  fieldHint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  uploadArea: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  uploadCopy: { flex: 1, minWidth: 0, gap: 4 },
  uploadTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  uploadHelper: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  thumbRow: { gap: 12, paddingTop: 4 },
  thumbBox: { width: 96, height: 96 },
  thumb: { width: 96, height: 96, borderRadius: 16, backgroundColor: colors.border },
  thumbRemove: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  prefillCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.tone.success.bg },
  prefillText: { flex: 1, minWidth: 0, gap: 4 },
  prefillLabel: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.tone.success.text },
  prefillValue: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  advisoryStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 16, borderTopWidth: 1, borderColor: colors.border },
  advisoryText: { flex: 1, fontSize: 12, lineHeight: 20, color: colors.textSecondary },
  requiredHint: { fontSize: 12, lineHeight: 20, color: colors.tone.warning.text },
  assistantHint: { fontSize: 12, lineHeight: 20, color: colors.textSecondary },
  bottomBar: { padding: 16, gap: 8, backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.border },
  askBtn: { minHeight: 56, padding: 16, borderRadius: 16, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  askBtnDisabled: { backgroundColor: colors.border },
  askBtnText: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.surface },
  askBtnTextDisabled: { color: colors.textSecondary },
  bookBtn: { minHeight: 48, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bookBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  ctaNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
});
