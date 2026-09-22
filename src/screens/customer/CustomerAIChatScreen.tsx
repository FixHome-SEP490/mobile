import { useAppTheme } from '../../constants/theme';
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
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import {
  pickImagesForAi,
  takePhotoForAi,
  shrinkForRetry,
  type PickedImage,
} from '../../services/image-for-ai';
import TypingDots from '../chat/TypingDots';
import {
  aiApi,
  looksLikeAQuestion,
  AI_MAX_IMAGES,
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
  const { colors, spacing, fontSize, isDark } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ChatRoute>();
  const insets = useSafeAreaInsets();

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
    // Handed over already encoded; there is no original to shrink, so a weak
    // connection here falls back to the ordinary unavailable message.
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
  
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [isThinking, setIsThinking] = useState(
    Boolean(route.params?.initialDescription || route.params?.initialImages?.length),
  );

  /**
   * Server-issued. Null until the first reply, then echoed back on every
   * message. Never invented here: the id field accepts any string, so two
   * clients that both made one up would share a conversation.
   */
  const sessionId = useRef<string | null>(null);
  /**
   * What the customer actually typed, carried into the booking form. The
   * assistant's own reply was the obvious thing to send and the wrong one: the
   * technician needs the symptom in the customer's words, not a paragraph the
   * model wrote back to them.
   */
  const lastCustomerWords = useRef('');
  /**
   * The service the customer is currently about to order.
   *
   * Pinned rather than rendered into a message, because a button inside a
   * message scrolls away as soon as the assistant says anything else. It is
   * replaced - never appended to - every time the assistant recommends
   * something, so asking "đổi sang thợ sửa tủ lạnh" changes what the button
   * books rather than leaving two contradictory buttons in the thread.
   */
  const [pinnedService, setPinnedService] = useState<RecommendedService | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [holdingLines, setHoldingLines] = useState<Record<string, string[]>>({});
  const keyboardInset = useKeyboardInset();

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
    async (text: string, images: PickedImage[], isQuestion: boolean) => {
      // The acknowledgement is already on screen; the answer waits for both the
      // model and a beat of reading time, so the two do not arrive together.
      if (text.trim()) {
        lastCustomerWords.current = text.trim();
      }

      const ask = (payload: string[]) =>
        isQuestion
          ? aiApi.ask({ question: text, sessionId: sessionId.current })
          : aiApi.analyze({ description: text, images: payload, sessionId: sessionId.current });

      const [firstTry] = await Promise.all([
        ask(images.map((image) => image.dataUri)),
        new Promise((resolve) => setTimeout(resolve, ACKNOWLEDGEMENT_DWELL_MS)),
      ]);

      // A send that fails with photographs attached is usually the photographs.
      // On a weak connection the request never completes, and the customer is
      // told the assistant is unreachable when the assistant is fine. One
      // retry at roughly a tenth of the bytes - still above the 640px the
      // detector actually sees - turns that into an answer.
      let reply = firstTry;
      if (reply.status === 'unavailable' && images.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            sender: 'bot',
            text: 'Mạng hơi yếu nên ảnh chưa gửi được, em thử lại với ảnh nhẹ hơn nhé...',
            isAcknowledgement: true,
          },
        ]);
        scrollToEnd();
        const smaller = await shrinkForRetry(images);
        if (smaller.length > 0) {
          reply = await ask(smaller);
        }
      }

      // Always the server's id, never one of ours.
      if (reply.sessionId) {
        sessionId.current = reply.sessionId;
      }
      setTurnCount((count) => count + 1);

      const prose =
        reply.messageVi?.trim() || reply.answerVi?.trim() || composeFromFields(reply);

      const offered = reply.recommendedServices?.[0];
      if (offered) {
        setPinnedService(offered);
      }

      setMessages((prev) => [...prev, { id: nextId(), sender: 'bot', text: prose, reply }]);
      setIsThinking(false);
      scrollToEnd();
    },
    [scrollToEnd],
  );

  const send = useCallback(
    async (text: string, images: PickedImage[]) => {
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
        { id: nextId(), sender: 'user', text: trimmed, images: images.map((i) => i.dataUri) },
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
    const handedOver: PickedImage[] = images.map((dataUri) => ({ uri: '', dataUri }));
    // The rule cannot see that this is async: awaitReply opens with an await,
    // so every setState inside it runs a microtask later, not during this
    // effect. The ref above is what actually prevents it running twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void awaitReply(text, handedOver, false);
  }, [awaitReply, handover]);

  // -------------------------------------------------------------- images

  const pickImages = useCallback(async () => {
    const result = await pickImagesForAi(pendingImages.length);
    if (result.problemVi) Alert.alert('Ảnh', result.problemVi);
    if (result.images.length > 0) {
      setPendingImages((prev) => [...prev, ...result.images].slice(0, AI_MAX_IMAGES));
    }
  }, [pendingImages.length]);

  const takePhoto = useCallback(async () => {
    const result = await takePhotoForAi(pendingImages.length);
    if (result.problemVi) Alert.alert('Ảnh', result.problemVi);
    if (result.images.length > 0) {
      setPendingImages((prev) => [...prev, ...result.images].slice(0, AI_MAX_IMAGES));
    }
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
            setPinnedService(null);
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
    (service: RecommendedService) => {
      navigation.navigate('CustomerAIDiagnosis', {
        prefill: {
          serviceId: service.serviceId ?? null,
          serviceCode: service.serviceCode,
          serviceName: service.nameVi,
          description: lastCustomerWords.current,
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
            <Ionicons name="hardware-chip-outline" size={16} color={colors.primary} />
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
    [goToBooking, colors, styles],
  );

  const canSend = (input.trim().length > 0 || pendingImages.length > 0) && !isThinking;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
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
            color={turnCount === 0 ? '#CBD5E1' : colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Not KeyboardAvoidingView: on Android it needs the window to resize
          when the keyboard opens, and this app draws edge to edge, where it
          does not. The composer stayed put and the keyboard covered it, so the
          customer could type without seeing what they typed. The measured
          inset works in both layout modes. */}
      <View style={[styles.flex, { paddingBottom: keyboardInset }]}>
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

        {pinnedService && (
          <View style={styles.pinnedBar}>
            <View style={styles.pinnedText}>
              <Text style={styles.pinnedLabel}>Dịch vụ đang chọn</Text>
              <Text style={styles.pinnedValue} numberOfLines={1}>
                {pinnedService.nameVi}
              </Text>
              <Text style={styles.pinnedHint}>Muốn loại khác, cứ nhắn em đổi ạ</Text>
            </View>
            <TouchableOpacity
              style={styles.pinnedBtn}
              activeOpacity={0.85}
              onPress={() => goToBooking(pinnedService)}
            >
              <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
              <Text style={styles.pinnedBtnText}>Đặt thợ</Text>
            </TouchableOpacity>
          </View>
        )}

        {pendingImages.length > 0 && (
          <ScrollView
            horizontal
            style={styles.tray}
            contentContainerStyle={styles.trayContent}
            showsHorizontalScrollIndicator={false}
          >
            {pendingImages.map((image, index) => (
              <View key={index} style={styles.trayItem}>
                <Image source={{ uri: image.dataUri }} style={styles.trayThumb} />
                <TouchableOpacity
                  style={styles.trayRemove}
                  onPress={() =>
                    setPendingImages((prev) => prev.filter((_, i) => i !== index))
                  }
                  accessibilityLabel="Bỏ ảnh này"
                >
                  <Ionicons name="close" size={12} color={colors.surface} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.trayHint}>
              {pendingImages.length}/{AI_MAX_IMAGES} ảnh
            </Text>
          </ScrollView>
        )}

        <View style={[styles.composer, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity style={styles.composerBtn} onPress={pickImages}>
            <Ionicons name="image-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.composerBtn} onPress={takePhoto}>
            <Ionicons name="camera-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Nhà mình đang gặp vấn đề gì ạ?"
            placeholderTextColor="#000000"
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
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Ionicons name="send" size={18} color={colors.surface} />
            )}
          </TouchableOpacity>
        </View>
      </View>
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
  onBook: (service: RecommendedService) => void;
}) {
  const { colors, spacing, fontSize } = useAppTheme();
  const styles = getStyles(colors, spacing, fontSize);
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
            <Ionicons name="cube-outline" size={13} color={colors.text} />
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
          onPress={() => onBook(service)}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.surface} />
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

const getStyles = (colors: any, spacing: any, fontSize: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnMuted: { opacity: 0.5 },
  headerTitleBox: { flex: 1, paddingHorizontal: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  listContent: { paddingVertical: 16, paddingBottom: 24 },

  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
    marginHorizontal: 16,
    marginVertical: 4,
    maxWidth: '82%',
  },
  userText: { color: colors.surface, fontSize: 15, lineHeight: 22 },
  bubbleImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  bubbleThumb: { width: 92, height: 92, borderRadius: 10, backgroundColor: colors.primaryDark },

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
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  acknowledgementBubble: { backgroundColor: colors.border, borderColor: colors.border },
  acknowledgementText: { color: colors.textSecondary, fontStyle: 'italic' },

  card: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  section: { marginTop: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
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
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  deviceChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },

  faultRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  faultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
    marginRight: 8,
  },
  actionDot: { backgroundColor: colors.success },
  faultText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 20 },
  questionText: { fontSize: 13, color: colors.text, lineHeight: 20, marginBottom: 4 },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: { fontSize: 12, color: colors.textSecondary },
  priceValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  priceNote: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  bookBtnText: { color: colors.surface, fontWeight: '700', fontSize: 14 },

  disclaimer: { fontSize: 10, color: '#94A3B8', marginTop: 10, lineHeight: 15 },

  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  pinnedText: { flex: 1 },
  pinnedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pinnedValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  pinnedHint: { fontSize: 11, color: '#64748B', marginTop: 2 },
  pinnedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pinnedBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  tray: {
    maxHeight: 86,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trayContent: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  trayItem: { width: 64, height: 64 },
  trayThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.border },
  trayRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayHint: { fontSize: 11, color: colors.textSecondary, marginLeft: 4 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    backgroundColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
});


