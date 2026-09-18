// src/screens/customer/CustomerAIChatScreen.tsx
//
// The assistant. It answers questions and gives a preliminary diagnosis, and
// it invites the customer to book - it never books anything itself. The button
// it shows is a route into the booking flow carrying the service across.
//
// Nothing here is persisted. Closing the screen ends the conversation, which is
// the behaviour a diagnosis assistant should have: yesterday's washing machine
// has nothing to do with today's question.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import type { RootStackParamList } from '../../types';
import TypingDots from '../chat/TypingDots';
import {
  aiApi,
  looksLikeAQuestion,
  AI_MAX_IMAGES,
  AI_IMAGE_QUALITY,
  type AiReply,
  type RecommendedService,
} from '../../api/ai.api';

/** The AI drops a session after an hour of silence. Told, not discovered. */
const SESSION_IDLE_MINUTES = 60;

/**
 * How long the acknowledgement stays alone on screen before the answer can
 * land. The model often replies in under a second, and an answer that arrives
 * while the customer is still reading "em đang xem ạ" reads like neither was
 * meant. Deliberate pacing, not a fake delay: the request is already in flight.
 */
const ACKNOWLEDGEMENT_DWELL_MS = 900;

const GREETING =
  'Dạ em chào anh/chị, em là trợ lý của FixHome ạ. Anh/chị đang gặp vấn đề gì ở ' +
  'nhà mình thì kể em nghe, hoặc gửi em tấm ảnh thiết bị để em xem giúp nhé.';

type Sender = 'user' | 'bot';

interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  /** Data URIs the customer attached to this message. */
  images?: string[];
  /** Set on a bot message that carries a diagnosis. */
  reply?: AiReply;
  /** A holding line, replaced in place by the real answer. */
  isAcknowledgement?: boolean;
}

type ChatRoute = RouteProp<RootStackParamList, 'CustomerAIChat'>;

let messageCounter = 0;
const nextId = () => `m${Date.now()}_${messageCounter++}`;

/** Situation keys as the AI groups them. */
type Situation =
  | 'first_text'
  | 'first_photo'
  | 'follow_up'
  | 'price_question'
  | 'general_question';

export default function CustomerAIChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ChatRoute>();

  /**
   * When the customer arrived from the diagnosis screen their message is
   * already known, so it is seeded here rather than sent from an effect: the
   * first paint shows what they submitted instead of a greeting that is about
   * to be replaced.
   */
  const handover = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const opening: ChatMessage = { id: 'greeting', sender: 'bot', text: GREETING };
    const text = handover?.initialDescription?.trim() || '';
    const images = handover?.initialImages || [];
    if (!text && images.length === 0) return [opening];
    return [
      opening,
      { id: nextId(), sender: 'user', text, images },
      {
        id: nextId(),
        sender: 'bot',
        text: 'Dạ em nhận được rồi ạ, anh/chị chờ em xem một chút nhé.',
        isAcknowledgement: true,
      },
    ];
  });
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(
    Boolean(route.params?.initialDescription || route.params?.initialImages?.length),
  );

  /**
   * Server-issued. Null until the first reply, then echoed back on every
   * message. Never invented here: the id field accepts any string, so two
   * clients that both made one up would share a conversation.
   */
  const sessionId = useRef<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [holdingLines, setHoldingLines] = useState<Record<string, string[]>>({});

  useEffect(() => {
    aiApi.acknowledgements().then((situations) => {
      if (situations && typeof situations === 'object') {
        setHoldingLines(situations as unknown as Record<string, string[]>);
      }
    });
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const holdingLineFor = useCallback(
    (situation: Situation): string => {
      const group = holdingLines[situation] || holdingLines.first_text || [];
      if (group.length === 0) {
        return 'Dạ em nhận được rồi ạ, anh/chị chờ em xem một chút nhé.';
      }
      return group[Math.floor(Math.random() * group.length)];
    },
    [holdingLines],
  );

  // ------------------------------------------------------------- sending

  /**
   * The network half of a turn: ask, wait, append the answer.
   *
   * Separate from `send` because the customer can arrive with their first
   * message already written, handed over from the diagnosis screen. That
   * message is seeded into state above, so the effect that starts it must only
   * do the asking.
   */
  const awaitReply = useCallback(
    async (text: string, images: string[], isQuestion: boolean) => {
      // The acknowledgement is already on screen; the answer waits for both the
      // model and a beat of reading time, so the two do not arrive together.
      const [reply] = await Promise.all([
        isQuestion
          ? aiApi.ask({ question: text, sessionId: sessionId.current })
          : aiApi.analyze({ description: text, images, sessionId: sessionId.current }),
        new Promise((resolve) => setTimeout(resolve, ACKNOWLEDGEMENT_DWELL_MS)),
      ]);

      // Always the server's id, never one of ours.
      if (reply.sessionId) {
        sessionId.current = reply.sessionId;
      }
      setTurnCount((count) => count + 1);

      const prose =
        reply.messageVi?.trim() || reply.answerVi?.trim() || composeFromFields(reply);

      setMessages((prev) => [...prev, { id: nextId(), sender: 'bot', text: prose, reply }]);
      setIsThinking(false);
      scrollToEnd();
    },
    [scrollToEnd],
  );

  const send = useCallback(
    async (text: string, images: string[]) => {
      const trimmed = text.trim();
      if (!trimmed && images.length === 0) return;

      const isQuestion = images.length === 0 && looksLikeAQuestion(trimmed);
      const situation: Situation =
        images.length > 0
          ? 'first_photo'
          : turnCount > 0
            ? 'follow_up'
            : isQuestion
              ? 'general_question'
              : 'first_text';

      setMessages((prev) => [
        ...prev,
        { id: nextId(), sender: 'user', text: trimmed, images },
        {
          id: nextId(),
          sender: 'bot',
          text: holdingLineFor(situation),
          isAcknowledgement: true,
        },
      ]);
      setInput('');
      setPendingImages([]);
      setIsThinking(true);
      scrollToEnd();

      await awaitReply(trimmed, images, isQuestion);
    },
    [awaitReply, holdingLineFor, scrollToEnd, turnCount],
  );

  /** Starts the handed-over message. The message itself is already on screen. */
  const initialSendStarted = useRef(false);
  useEffect(() => {
    if (initialSendStarted.current) return;
    const text = handover?.initialDescription?.trim() || '';
    const images = handover?.initialImages || [];
    if (!text && images.length === 0) return;
    initialSendStarted.current = true;
    // The rule cannot see that this is async: awaitReply opens with an await,
    // so every setState inside it runs a microtask later, not during this
    // effect. The ref above is what actually prevents it running twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void awaitReply(text, images, false);
  }, [awaitReply, handover]);

  // -------------------------------------------------------------- images

  const pickImages = useCallback(async () => {
    const room = AI_MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      Alert.alert('Đủ ảnh rồi ạ', `Mỗi lần em xem được tối đa ${AI_MAX_IMAGES} ảnh thôi ạ.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Chưa có quyền xem ảnh',
        'Anh/chị cho phép FixHome truy cập thư viện ảnh để gửi ảnh thiết bị giúp em ạ.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      quality: AI_IMAGE_QUALITY,
      base64: true,
    });
    if (picked.canceled) return;

    const encoded: string[] = [];
    for (const asset of picked.assets.slice(0, room)) {
      if (!asset.base64) continue;
      // The AI rejects anything over 8 MiB decoded. Base64 is about a third
      // bigger than the bytes it carries, so this is the ceiling in characters.
      if (asset.base64.length > 8 * 1024 * 1024 * 1.37) {
        Alert.alert('Ảnh hơi nặng', 'Anh/chị chụp lại ảnh nhỏ hơn giúp em nhé.');
        continue;
      }
      const mime = asset.mimeType || 'image/jpeg';
      encoded.push(`data:${mime};base64,${asset.base64}`);
    }
    setPendingImages((prev) => [...prev, ...encoded].slice(0, AI_MAX_IMAGES));
  }, [pendingImages.length]);

  const takePhoto = useCallback(async () => {
    if (pendingImages.length >= AI_MAX_IMAGES) {
      Alert.alert('Đủ ảnh rồi ạ', `Mỗi lần em xem được tối đa ${AI_MAX_IMAGES} ảnh thôi ạ.`);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Chưa có quyền camera',
        'Anh/chị cho phép FixHome dùng camera để chụp thiết bị giúp em ạ.',
      );
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      quality: AI_IMAGE_QUALITY,
      base64: true,
    });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    const asset = shot.assets[0];
    setPendingImages((prev) =>
      [...prev, `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`].slice(
        0,
        AI_MAX_IMAGES,
      ),
    );
  }, [pendingImages.length]);

  // ------------------------------------------------------- a fresh start

  /**
   * The assistant remembers the appliance and every symptom mentioned, which is
   * what makes a follow-up work and exactly what makes an unrelated second
   * problem come out wrong. Dropping the session id is enough: the next message
   * opens a new conversation on the server.
   */
  const startOver = useCallback(() => {
    if (turnCount === 0) return;
    Alert.alert(
      'Bắt đầu phiên mới?',
      'Em sẽ quên thiết bị và các triệu chứng anh/chị vừa kể, để hỏi chuyện khác cho chính xác ạ.',
      [
        { text: 'Để sau', style: 'cancel' },
        {
          text: 'Bắt đầu mới',
          style: 'destructive',
          onPress: () => {
            sessionId.current = null;
            setTurnCount(0);
            setPendingImages([]);
            setInput('');
            setMessages([{ id: `greeting-${Date.now()}`, sender: 'bot', text: GREETING }]);
          },
        },
      ],
    );
  }, [turnCount]);

  // --------------------------------------------------------------- book

  /** Chat does not book. It carries the service into the booking flow. */
  const goToBooking = useCallback(
    (service: RecommendedService, context: string) => {
      navigation.navigate('CustomerAIDiagnosis', {
        prefill: {
          serviceId: service.serviceId ?? null,
          serviceCode: service.serviceCode,
          serviceName: service.nameVi,
          description: context,
        },
      });
    },
    [navigation],
  );

  // -------------------------------------------------------------- render

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (item.sender === 'user') {
        return (
          <View style={[styles.bubble, styles.userBubble]}>
            {item.images && item.images.length > 0 && (
              <View style={styles.bubbleImages}>
                {item.images.map((uri, index) => (
                  <Image key={index} source={{ uri }} style={styles.bubbleThumb} />
                ))}
              </View>
            )}
            {!!item.text && <Text style={styles.userText}>{item.text}</Text>}
          </View>
        );
      }

      return (
        <View style={styles.botRow}>
          <View style={styles.avatar}>
            <Ionicons name="hardware-chip-outline" size={16} color="#2563EB" />
          </View>
          <View style={styles.botColumn}>
            <View
              style={[
                styles.bubble,
                styles.botBubble,
                item.isAcknowledgement && styles.acknowledgementBubble,
              ]}
            >
              <Text
                style={[
                  styles.botText,
                  item.isAcknowledgement && styles.acknowledgementText,
                ]}
              >
                {item.text}
              </Text>
            </View>
            {item.reply && (
              <DiagnosisCard reply={item.reply} onBook={goToBooking} />
            )}
          </View>
        </View>
      );
    },
    [goToBooking],
  );

  const canSend = (input.trim().length > 0 || pendingImages.length > 0) && !isThinking;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Trợ lý FixHome</Text>
          <Text style={styles.headerSubtitle}>
            {turnCount > 0
              ? `Đang nhớ cuộc trò chuyện · quên sau ${SESSION_IDLE_MINUTES} phút`
              : 'Chẩn đoán sơ bộ, không thay thợ'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={startOver}
          style={[styles.headerBtn, turnCount === 0 && styles.headerBtnMuted]}
          disabled={turnCount === 0}
          accessibilityLabel="Bắt đầu phiên chat mới"
        >
          <Ionicons
            name="refresh"
            size={22}
            color={turnCount === 0 ? '#CBD5E1' : '#2563EB'}
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={isThinking ? <TypingDots /> : null}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        />

        {pendingImages.length > 0 && (
          <ScrollView
            horizontal
            style={styles.tray}
            contentContainerStyle={styles.trayContent}
            showsHorizontalScrollIndicator={false}
          >
            {pendingImages.map((uri, index) => (
              <View key={index} style={styles.trayItem}>
                <Image source={{ uri }} style={styles.trayThumb} />
                <TouchableOpacity
                  style={styles.trayRemove}
                  onPress={() =>
                    setPendingImages((prev) => prev.filter((_, i) => i !== index))
                  }
                  accessibilityLabel="Bỏ ảnh này"
                >
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.trayHint}>
              {pendingImages.length}/{AI_MAX_IMAGES} ảnh
            </Text>
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TouchableOpacity style={styles.composerBtn} onPress={pickImages}>
            <Ionicons name="image-outline" size={22} color="#2563EB" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.composerBtn} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={22} color="#2563EB" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Nhà mình đang gặp vấn đề gì ạ?"
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => send(input, pendingImages)}
            disabled={!canSend}
            accessibilityLabel="Gửi"
          >
            {isThinking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- the card

/**
 * What the assistant found, under the sentence it wrote.
 *
 * Order matters and is not cosmetic. A HIGH urgency reply leads with the safety
 * steps - turn off the gas, kill the breaker - because those are useless if the
 * customer reads them after a list of suspected faults.
 */
function DiagnosisCard({
  reply,
  onBook,
}: {
  reply: AiReply;
  onBook: (service: RecommendedService, context: string) => void;
}) {
  const urgent = reply.urgency === 'HIGH';
  const actions = reply.suggestedActionsVi || [];
  const faults = reply.suspectedFaults || [];
  const services = reply.recommendedServices || [];
  const questions = reply.clarification?.questionsVi || [];
  const price = reply.priceEstimate;

  const priceLabel = useMemo(() => {
    if (!price) return null;
    const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
    if (price.max && price.max > price.min) {
      return `${money(price.min)} – ${money(price.max)}`;
    }
    return `Từ ${money(price.min)}`;
  }, [price]);

  const nothingToShow =
    !urgent &&
    actions.length === 0 &&
    faults.length === 0 &&
    services.length === 0 &&
    questions.length === 0 &&
    !priceLabel;
  if (nothingToShow) return null;

  return (
    <View style={styles.card}>
      {urgent && actions.length > 0 && (
        <View style={styles.urgentBox}>
          <View style={styles.urgentHead}>
            <Ionicons name="warning" size={16} color="#B91C1C" />
            <Text style={styles.urgentTitle}>Anh/chị làm ngay giúp em</Text>
          </View>
          {actions.map((action, index) => (
            <Text key={index} style={styles.urgentText}>
              {index + 1}. {action}
            </Text>
          ))}
        </View>
      )}

      {reply.device && (
        <View style={styles.chipRow}>
          <View style={styles.deviceChip}>
            <Ionicons name="cube-outline" size={13} color="#0F172A" />
            <Text style={styles.deviceChipText}>{reply.device.nameVi}</Text>
          </View>
        </View>
      )}

      {faults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Có thể là</Text>
          {faults.map((fault) => (
            <View key={fault.faultCode} style={styles.faultRow}>
              <View style={styles.faultDot} />
              <Text style={styles.faultText}>{fault.nameVi}</Text>
            </View>
          ))}
        </View>
      )}

      {!urgent && actions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Anh/chị có thể làm trước</Text>
          {actions.map((action, index) => (
            <View key={index} style={styles.faultRow}>
              <View style={[styles.faultDot, styles.actionDot]} />
              <Text style={styles.faultText}>{action}</Text>
            </View>
          ))}
        </View>
      )}

      {questions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Em hỏi thêm một chút ạ</Text>
          {questions.map((question, index) => (
            <Text key={index} style={styles.questionText}>
              {question}
            </Text>
          ))}
        </View>
      )}

      {priceLabel && (
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Chi phí tham khảo</Text>
          <Text style={styles.priceValue}>{priceLabel}</Text>
        </View>
      )}
      {price?.requiresAssessment && (
        <Text style={styles.priceNote}>Thợ xem tận nơi rồi mới báo giá chính xác ạ.</Text>
      )}

      {services.map((service) => (
        <TouchableOpacity
          key={service.serviceCode}
          style={styles.bookBtn}
          activeOpacity={0.85}
          onPress={() => onBook(service, reply.messageVi || '')}
        >
          <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
          <Text style={styles.bookBtnText}>Đặt thợ · {service.nameVi}</Text>
        </TouchableOpacity>
      ))}

      {!!reply.disclaimerVi && (
        <Text style={styles.disclaimer}>{reply.disclaimerVi}</Text>
      )}
    </View>
  );
}

/**
 * A sentence built from the structured fields.
 *
 * Only used when the reply carries no prose. The service normally writes the
 * sentence itself, but there are branches that return fields alone, and an
 * empty bubble is the one outcome the customer must never see.
 */
function composeFromFields(reply: AiReply): string {
  const faults = reply.suspectedFaults || [];
  const questions = reply.clarification?.questionsVi || [];

  if (questions.length > 0) {
    return 'Dạ em cần hỏi thêm một chút để chẩn cho đúng ạ.';
  }
  if (faults.length > 0) {
    return `Dạ em xem rồi ạ, khả năng là ${faults[0].nameVi.toLowerCase()}.`;
  }
  if (reply.device) {
    return `Dạ em thấy đây là ${reply.device.nameVi.toLowerCase()} ạ. Anh/chị kể thêm hiện tượng giúp em nhé.`;
  }
  return 'Dạ anh/chị mô tả thêm giúp em một chút để em xem cho đúng ạ.';
}

// -------------------------------------------------------------------- style

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnMuted: { opacity: 0.5 },
  headerTitleBox: { flex: 1, paddingHorizontal: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  headerSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2 },

  listContent: { paddingVertical: 16, paddingBottom: 24 },

  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
    marginHorizontal: 16,
    marginVertical: 4,
    maxWidth: '82%',
  },
  userText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  bubbleImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  bubbleThumb: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#1D4ED8' },

  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginVertical: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginTop: 2,
  },
  botColumn: { flex: 1 },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  botText: { color: '#0F172A', fontSize: 14, lineHeight: 21 },
  acknowledgementBubble: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  acknowledgementText: { color: '#64748B', fontStyle: 'italic' },

  card: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  section: { marginTop: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },

  urgentBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  urgentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  urgentTitle: { color: '#B91C1C', fontWeight: '800', fontSize: 13 },
  urgentText: { color: '#7F1D1D', fontSize: 13, lineHeight: 20 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  deviceChipText: { fontSize: 12, color: '#0F172A', fontWeight: '600' },

  faultRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  faultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginTop: 7,
    marginRight: 8,
  },
  actionDot: { backgroundColor: '#16A34A' },
  faultText: { flex: 1, fontSize: 13, color: '#0F172A', lineHeight: 20 },
  questionText: { fontSize: 13, color: '#0F172A', lineHeight: 20, marginBottom: 4 },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  priceLabel: { fontSize: 12, color: '#64748B' },
  priceValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  priceNote: { fontSize: 11, color: '#64748B', marginTop: 2 },

  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  bookBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  disclaimer: { fontSize: 10, color: '#94A3B8', marginTop: 10, lineHeight: 15 },

  tray: {
    maxHeight: 86,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  trayContent: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  trayItem: { width: 64, height: 64 },
  trayThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#E2E8F0' },
  trayRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayHint: { fontSize: 11, color: '#64748B', marginLeft: 4 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  composerBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
});
