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

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
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
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import {
  pickImagesForAi,
  pickVideoForAi,
  recordVideoForAi,
  takePhotoForAi,
  shrinkForRetry,
  type PickedImage,
  type PickedVideo,
} from '../../services/image-for-ai';
import TypingDots from '../chat/TypingDots';
import {
  aiApi,
  looksLikeAQuestion,
  AI_MAX_IMAGES,
  type AiReply,
  type RecommendedService,
} from '../../api/ai.api';
import { appendCustomerWords } from './ai-chat-words';
import {
  AI_MAX_VIDEOS,
  AI_VIDEO_MAX_BYTES,
  REVEAL_MS,
  VIDEO_SOURCE_MAX_BYTES,
  VIDEO_NOT_ANALYSED,
  nextPinnedService,
  quickReplies,
  revealSteps,
  videoDuration,
  videoMimeType,
  videoProblem,
  type AttachedVideo,
} from './ai-chat-logic';
import { AI_CHAT_MAX_IMAGES, ATTACHMENT_LIMIT_TEXT, ChatUploadQueue, type ChatUpload } from './chat-upload-queue';
import { canShrinkVideos } from '../../services/video-shrink';
import {
  AI_DESCRIPTION_REQUIRED_HINT,
  canSendToAssistant,
  hasDescription,
  showDescriptionHint,
} from './ai-diagnosis-input';
import BackButton from '../../components/BackButton';

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
  /** The photos and videos of this message on their way to the technician; the AI never gets the videos. */
  uploadIds?: string[];
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
    // BRX-064: without a written description nothing is sent; any photos wait
    // in the tray until the customer writes one.
    if (!hasDescription(text)) return [opening];
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
  const [pendingImages, setPendingImages] = useState<PickedImage[]>(() =>
    hasDescription(route.params?.initialDescription)
      ? []
      : (route.params?.initialImages ?? []).map((dataUri) => ({ uri: '', dataUri })),
  );
  const [isThinking, setIsThinking] = useState(hasDescription(route.params?.initialDescription));
  /**
   * The chat's photos and videos for the technician (PO 18/10/2026): videos are
   * made light as soon as they are picked, and everything sent goes up at once,
   * in the background. At most three photos and two videos per conversation.
   */
  const [queue] = useState(() => new ChatUploadQueue());
  const uploads = useSyncExternalStore(queue.subscribe, queue.snapshot);
  const waitingVideos = useMemo(() => uploads.filter((item) => item.kind === 'video' && !item.sent), [uploads]);
  const uploadsById = useMemo(() => new Map(uploads.map((item) => [item.id, item])), [uploads]);
  const imagesUsed = pendingImages.length + uploads.filter((item) => item.kind === 'image').length;
  const videosUsed = uploads.filter((item) => item.kind === 'video').length;
  useEffect(() => () => queue.reset(), [queue]);
  const attachmentsOf = useCallback(
    (message: ChatMessage) =>
      (message.uploadIds ?? []).flatMap((id) => {
        const upload = uploadsById.get(id);
        return upload ? [upload] : [];
      }),
    [uploadsById],
  );
  const sentVideosOf = useCallback(
    (message: ChatMessage) => attachmentsOf(message).filter((upload) => upload.kind === 'video'),
    [attachmentsOf],
  );
  /** "Đúng ý / Chưa đúng" under the newest answer, per message. */
  const [verdicts, setVerdicts] = useState<Record<string, 'note' | 'done'>>({});
  const [feedbackNote, setFeedbackNote] = useState('');
  /** Replies are written out piece by piece, except where motion is reduced or under tests. */
  const revealPace = useRef(process.env.JEST_WORKER_ID ? 0 : REVEAL_MS);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled?.().then((reduced) => { if (reduced) revealPace.current = 0; }).catch(() => undefined);
  }, []);

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
      lastCustomerWords.current = appendCustomerWords(lastCustomerWords.current, text);

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

      // A catch-all service never replaces a specific one the conversation already found (as on the web).
      setPinnedService((current) => nextPinnedService(current, reply.recommendedServices?.[0]));

      const pace = revealPace.current;
      const steps = pace > 0 ? revealSteps(prose) : [prose];
      if (steps.length === 1) {
        setMessages((prev) => [...prev, { id: nextId(), sender: 'bot', text: prose, reply }]);
      } else {
        // Written out piece by piece; the card under it and every button come once the whole text is there.
        const id = nextId();
        setMessages((prev) => [...prev, { id, sender: 'bot', text: '' }]);
        for (const step of steps) {
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: step } : m)));
          scrollToEnd();
          if (step !== prose) await new Promise((resolve) => setTimeout(resolve, pace));
        }
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: prose, reply } : m)));
      }
      setIsThinking(false);
      scrollToEnd();
    },
    [scrollToEnd],
  );

  const send = useCallback(
    async (text: string, images: PickedImage[]) => {
      const trimmed = text.trim();
      // BRX-064: a diagnosis needs words; photos and videos only go along with them.
      if (!hasDescription(trimmed)) return;
      // For the technician, sent at once in the background: the chat's own photos (they have
      // a file on the phone; handed-over ones do not) and the videos waiting in the tray.
      const q = queue;
      const sentNow: ChatUpload[] = [
        ...images.filter((image) => !!image.uri).map((image) => q.addSentImage(image)),
        ...q.sendWaitingVideos(),
      ];

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
        {
          id: nextId(),
          sender: 'user',
          text: trimmed,
          images: images.map((i) => i.dataUri),
          ...(sentNow.length ? { uploadIds: sentNow.map((item) => item.id) } : {}),
        },
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
    [awaitReply, holdingLineFor, scrollToEnd, turnCount, queue],
  );

  /** Starts the handed-over message. The message itself is already on screen. */
  const initialSendStarted = useRef(false);
  useEffect(() => {
    if (initialSendStarted.current) return;
    const text = handover?.initialDescription?.trim() || '';
    const images = handover?.initialImages || [];
    if (!hasDescription(text)) return;
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
    Haptics.selectionAsync();
    if (imagesUsed >= AI_CHAT_MAX_IMAGES) {
      Alert.alert('Ảnh', ATTACHMENT_LIMIT_TEXT);
      return;
    }
    const result = await pickImagesForAi(imagesUsed);
    if (result.problemVi) Alert.alert('Ảnh', result.problemVi);
    if (result.images.length > 0) {
      setPendingImages((prev) => [...prev, ...result.images].slice(0, AI_MAX_IMAGES));
    }
  }, [imagesUsed]);

  const takePhoto = useCallback(async () => {
    Haptics.selectionAsync();
    if (imagesUsed >= AI_CHAT_MAX_IMAGES) {
      Alert.alert('Ảnh', ATTACHMENT_LIMIT_TEXT);
      return;
    }
    const result = await takePhotoForAi(imagesUsed);
    if (result.problemVi) Alert.alert('Ảnh', result.problemVi);
    if (result.images.length > 0) {
      setPendingImages((prev) => [...prev, ...result.images].slice(0, AI_MAX_IMAGES));
    }
  }, [imagesUsed]);

  // -------------------------------------------------------------- videos

  /** A video for the technician (PO 18/10/2026): never sent to the AI, kept with the booking. */
  const addVideo = useCallback((picked: PickedVideo | null, problemVi?: string) => {
    if (problemVi) Alert.alert('Video', problemVi);
    if (!picked) return;
    const video: AttachedVideo = {
      id: nextId(),
      uri: picked.uri,
      name: picked.name,
      type: videoMimeType(picked.uri, picked.type),
      sizeBytes: picked.sizeBytes,
      durationMs: picked.durationMs,
    };
    const problem = videoProblem(video, videosUsed, canShrinkVideos() ? VIDEO_SOURCE_MAX_BYTES : AI_VIDEO_MAX_BYTES);
    if (problem) {
      Alert.alert('Video', problem);
      return;
    }
    // Made light at once, while the customer writes (PO 18/10/2026: weak connections).
    queue.addVideo(video);
  }, [videosUsed, queue]);

  const chooseVideo = useCallback(() => {
    Haptics.selectionAsync();
    if (videosUsed >= AI_MAX_VIDEOS) {
      Alert.alert('Video', ATTACHMENT_LIMIT_TEXT);
      return;
    }
    Alert.alert('Gửi video cho kỹ thuật viên', VIDEO_NOT_ANALYSED, [
      { text: 'Quay video', onPress: () => { void recordVideoForAi().then((r) => addVideo(r.video, r.problemVi)); } },
      { text: 'Chọn video có sẵn', onPress: () => { void pickVideoForAi().then((r) => addVideo(r.video, r.problemVi)); } },
      { text: 'Để sau', style: 'cancel' },
    ]);
  }, [addVideo, videosUsed]);

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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            sessionId.current = null;
            lastCustomerWords.current = '';
            setPinnedService(null);
            setTurnCount(0);
            setPendingImages([]);
            queue.reset();
            setVerdicts({});
            setInput('');
            setMessages([{ id: `greeting-${Date.now()}`, sender: 'bot', text: GREETING }]);
          },
        },
      ],
    );
  }, [turnCount, queue]);

  // --------------------------------------------------------------- book

  /**
   * Chat does not book. It carries the service into the booking flow, and with
   * it the photos and videos the customer sent here (PO 18/10/2026: the
   * technician sees them; the videos were never shown to the AI). They went up
   * in the background as they were sent; the booking takes those that arrived,
   * and the customer chooses to wait for, retry or leave out the rest: a weak
   * connection never blocks booking without saying why.
   */
  const openBooking = useCallback(
    (service: RecommendedService) => {
      const attachmentUploadIds = queue.uploadIds() ?? [];
      navigation.navigate('CustomerAIDiagnosis', {
        prefill: {
          serviceId: service.serviceId ?? null,
          serviceCode: service.serviceCode,
          serviceName: service.nameVi,
          description: lastCustomerWords.current,
          aiSessionId: sessionId.current ?? undefined,
          ...(attachmentUploadIds.length ? { attachmentUploadIds } : {}),
        },
      });
    },
    [navigation, queue],
  );

  const goToBooking = useCallback(
    (service: RecommendedService) => {
      const summary = queue.summary();
      if (summary && summary.busy > 0) {
        Alert.alert(
          'Ảnh, video đang gửi cho thợ',
          `Đã gửi khoảng ${Math.round(summary.progress * 100)}%. Mạng yếu thì có thể mất vài phút. Anh/chị chờ thêm, hoặc đặt thợ không kèm những tệp chưa gửi xong.`,
          [
            { text: 'Chờ thêm', style: 'cancel' },
            { text: 'Đặt thợ không kèm', onPress: () => openBooking(service) },
          ],
        );
        return;
      }
      if (summary && summary.failed > 0) {
        Alert.alert(
          'Có ảnh hoặc video chưa gửi được',
          'Anh/chị bấm Thử lại khi mạng ổn hơn, hoặc đặt thợ không kèm những tệp đó.',
          [
            { text: 'Thử lại', onPress: () => queue.retryFailed() },
            { text: 'Đặt thợ không kèm', onPress: () => openBooking(service) },
          ],
        );
        return;
      }
      openBooking(service);
    },
    [openBooking, queue],
  );

  /** "Đúng ý" / "Chưa đúng" under the newest answer (as on the web); a failure still thanks. */
  const rate = useCallback((message: ChatMessage, verdict: 'right' | 'wrong', note?: string) => {
    const id = sessionId.current;
    setVerdicts((prev) => ({ ...prev, [message.id]: 'done' }));
    setFeedbackNote('');
    if (id) void aiApi.feedback({ sessionId: id, verdict, note, reply: message.text });
  }, []);

  // -------------------------------------------------------------- render

  /** The newest real answer: the only one whose question can be answered or rated. */
  const latestReplyId = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.sender === 'bot' && !m.isAcknowledgement);
    return last?.reply && last.reply.status !== 'unavailable' ? last.id : null;
  }, [messages]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (item.sender === 'user') {
        return (
          <View>
            <View style={[styles.bubble, styles.userBubble]}>
              {item.images && item.images.length > 0 && (
                <View style={styles.bubbleImages}>
                  {item.images.map((uri, index) => (
                    <Image key={index} source={{ uri }} style={styles.bubbleThumb} />
                  ))}
                </View>
              )}
              {sentVideosOf(item).length > 0 && (
                <View style={styles.bubbleImages} testID="ai-message-videos">
                  {sentVideosOf(item).map((video) => (
                    <View key={video.id} style={styles.videoTile}>
                      <Ionicons name="play-circle" size={26} color={colors.surface} />
                      {!!videoDuration(video.durationMs) && <Text style={styles.videoTileText}>{videoDuration(video.durationMs)}</Text>}
                    </View>
                  ))}
                </View>
              )}
              {!!item.text && <Text style={styles.userText}>{item.text}</Text>}
            </View>
            {sentVideosOf(item).length > 0 && <Text style={styles.videoNote} testID="ai-video-note">{VIDEO_NOT_ANALYSED}</Text>}
            {/* PO 18/10/2026: what goes with the booking is sent now, in the background; each says how far it is. */}
            {attachmentsOf(item).length > 0 && (
              <View style={styles.uploadList} testID="ai-attachment-status">
                {attachmentsOf(item).map((upload) => (
                  <View key={upload.id} style={styles.uploadRow} testID={`ai-attachment-${upload.state}`}>
                    <Ionicons
                      name={upload.state === 'done' ? 'checkmark-circle' : upload.state === 'failed' ? 'alert-circle' : upload.kind === 'video' ? 'videocam-outline' : 'image-outline'}
                      size={14}
                      color={upload.state === 'done' ? colors.success : upload.state === 'failed' ? colors.error : colors.textSecondary}
                    />
                    <Text style={[styles.uploadText, upload.state === 'failed' && { color: colors.error }, upload.state === 'done' && { color: colors.success }]}>
                      {uploadStatusText(upload)}
                    </Text>
                    {upload.state === 'failed' && (
                      <TouchableOpacity
                        onPress={() => queue.retry(upload.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Gửi lại tệp này"
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      >
                        <Text style={styles.uploadRetry}>Thử lại</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      }

      const isLatest = item.id === latestReplyId && !isThinking;
      const lastQuestion = item.reply?.clarification?.questionsVi?.slice(-1)[0];
      const choices = isLatest ? quickReplies(lastQuestion) : [];
      const verdict = verdicts[item.id];

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
            {item.reply && item.reply.status !== 'unavailable' && (
              <DiagnosisCard reply={item.reply} />
            )}
            {choices.length > 0 && (
              <View style={styles.quickRow} testID="ai-quick-replies">
                {choices.map((choice) => (
                  <TouchableOpacity
                    key={choice}
                    style={styles.quickChip}
                    onPress={() => {
                      Haptics.selectionAsync();
                      void send(choice, []);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Trả lời ${choice}`}
                  >
                    <Text style={styles.quickChipText}>{choice}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {isLatest && !!sessionId.current && (
              <View style={styles.feedbackBox} testID="ai-feedback">
                {verdict === 'done' ? (
                  <Text style={styles.feedbackText}>Em cảm ơn anh/chị, em ghi nhận để học thêm ạ.</Text>
                ) : verdict === 'note' ? (
                  <View style={styles.feedbackNoteRow}>
                    <TextInput
                      style={styles.feedbackInput}
                      value={feedbackNote}
                      onChangeText={setFeedbackNote}
                      maxLength={300}
                      placeholder="Anh/chị góp ý thêm cho em (không bắt buộc)"
                      placeholderTextColor={colors.muted}
                      accessibilityLabel="Góp ý cho trợ lý"
                      multiline
                    />
                    <TouchableOpacity style={styles.feedbackSend} onPress={() => rate(item, 'wrong', feedbackNote)} accessibilityRole="button" accessibilityLabel="Gửi góp ý">
                      <Text style={styles.feedbackSendText}>Gửi góp ý</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.feedbackRow}>
                    <Text style={styles.feedbackText}>Câu trả lời này có đúng ý anh/chị không?</Text>
                    <TouchableOpacity onPress={() => rate(item, 'right')} accessibilityRole="button" accessibilityLabel="Đúng ý" hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={styles.feedbackAction}>Đúng ý</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setVerdicts((prev) => ({ ...prev, [item.id]: 'note' }))} accessibilityRole="button" accessibilityLabel="Chưa đúng" hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={styles.feedbackAction}>Chưa đúng</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      );
    },
    [colors, styles, latestReplyId, isThinking, verdicts, feedbackNote, rate, send, attachmentsOf, sentVideosOf, queue],
  );

  const canSend = canSendToAssistant({
    text: input,
    imageCount: pendingImages.length,
    busy: isThinking,
  });
  const needsDescription = showDescriptionHint({ text: input, imageCount: pendingImages.length + waitingVideos.length });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle} accessibilityRole="header">Trợ lý FixHome</Text>
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
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Bắt đầu phiên chat mới"
          accessibilityState={{ disabled: turnCount === 0 }}
          accessibilityHint="Xóa ngữ cảnh của cuộc trò chuyện hiện tại khi bắt đầu phiên mới"
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

        {/* "Đặt thợ" only once the assistant has finished answering (as on the web). */}
        {pinnedService && !isThinking && (
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
              accessibilityRole="button"
              accessibilityLabel={`Xem dịch vụ ${pinnedService.nameVi} để tiếp tục đặt lịch`}
              accessibilityHint="Mở bước lựa chọn dịch vụ; chưa tạo yêu cầu đặt lịch"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                goToBooking(pinnedService);
              }}
            >
              <Ionicons name="calendar-outline" size={15} color={colors.surface} />
              <Text style={styles.pinnedBtnText}>Đặt thợ</Text>
            </TouchableOpacity>
          </View>
        )}

        {waitingVideos.length > 0 && (
          <View style={styles.videoTray} testID="ai-pending-videos">
            {waitingVideos.map((video, index) => (
              <View key={video.id} style={styles.trayItem} testID={`ai-pending-video-${video.state}`}>
                <View style={[styles.trayThumb, styles.videoTile]}>
                  <Ionicons name="videocam" size={20} color={colors.surface} />
                  <Text style={styles.videoTileText}>
                    {video.state === 'preparing' ? `${Math.round(video.progress * 100)}%` : videoDuration(video.durationMs)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.trayRemove}
                  onPress={() => {
                    Haptics.selectionAsync();
                    queue.remove(video.id);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ video thứ ${index + 1}`}
                >
                  <Ionicons name="close" size={12} color={colors.surface} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.trayHint} testID="ai-video-count">
              {`Ảnh ${imagesUsed}/${AI_CHAT_MAX_IMAGES} · Video ${videosUsed}/${AI_MAX_VIDEOS}`}
            </Text>
            <Text style={styles.videoTrayNote}>
              {waitingVideos.some((video) => video.state === 'preparing')
                ? 'Đang nén video cho nhẹ trước khi gửi, anh/chị cứ nhắn tiếp ạ.'
                : VIDEO_NOT_ANALYSED}
            </Text>
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
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPendingImages((prev) => prev.filter((_, i) => i !== index));
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ ảnh thứ ${index + 1}`}
                >
                  <Ionicons name="close" size={12} color={colors.surface} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.trayHint} testID="ai-attachment-count">
              {`Ảnh ${imagesUsed}/${AI_CHAT_MAX_IMAGES} · Video ${videosUsed}/${AI_MAX_VIDEOS}`}
            </Text>
          </ScrollView>
        )}

        {needsDescription && (
          <Text testID="ai-chat-description-hint" style={styles.descriptionHint}>
            {AI_DESCRIPTION_REQUIRED_HINT}
          </Text>
        )}

        <View style={[styles.composer, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={styles.composerBtn}
            onPress={pickImages}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Chọn ảnh từ thư viện"
          >
            <Ionicons name="image-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.composerBtn}
            onPress={takePhoto}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh"
          >
            <Ionicons name="camera-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.composerBtn}
            onPress={chooseVideo}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Gửi video cho kỹ thuật viên"
            accessibilityHint={VIDEO_NOT_ANALYSED}
          >
            <Ionicons name="videocam-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Nhà mình đang gặp vấn đề gì ạ?"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Nhắn tin cho trợ lý FixHome"
            accessibilityHint="Mô tả thiết bị hoặc hiện tượng cần tư vấn trước khi gửi"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              send(input, pendingImages);
            }}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn cho trợ lý"
            accessibilityState={{ disabled: !canSend, busy: isThinking }}
            accessibilityHint={needsDescription ? AI_DESCRIPTION_REQUIRED_HINT : undefined}
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

/** Where a sent photo or video is on its way to the technician, in plain words. */
export function uploadStatusText(upload: ChatUpload): string {
  const what = upload.kind === 'video' ? 'video' : 'ảnh';
  const percent = `${Math.round(Math.max(0, Math.min(1, upload.progress)) * 100)}%`;
  if (upload.state === 'preparing') return `Đang nén video ${percent}`;
  if (upload.state === 'ready') return `Chờ gửi ${what} cho thợ`;
  if (upload.state === 'uploading') return upload.retrying ? 'Mạng chập chờn, đang gửi lại' : `Đang gửi ${what} cho thợ ${percent}`;
  if (upload.state === 'done') return upload.kind === 'video' ? 'Video đã gửi kèm cho thợ' : 'Ảnh đã gửi kèm cho thợ';
  return upload.error || 'Chưa gửi được';
}

// ---------------------------------------------------------------- the card

/**
 * What the assistant found, under the sentence it wrote.
 *
 * Order matters and is not cosmetic. A HIGH urgency reply leads with the safety
 * steps - turn off the gas, kill the breaker - because those are useless if the
 * customer reads them after a list of suspected faults.
 */
function DiagnosisCard({ reply }: { reply: AiReply }) {
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

      {/* The booking action is the pinned "Đặt thợ" bar only, as on the web; here the suggestion is information. */}
      {services.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Dịch vụ gợi ý</Text>
          {services.map((service) => (
            <Text key={service.serviceCode} style={styles.faultText}>{service.nameVi}</Text>
          ))}
        </View>
      )}

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
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnMuted: { opacity: 0.5 },
  headerTitleBox: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerSubtitle: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  listContent: { paddingVertical: 16, paddingBottom: 28 },

  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primaryTint,
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
    padding: 16,
  },
  section: { marginTop: 8 },
  sectionLabel: {
    fontSize: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  deviceChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },

  faultRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  faultDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
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
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: { fontSize: 12, color: colors.textSecondary },
  priceValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  priceNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 4 },

  disclaimer: { fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 19 },

  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primarySoft,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  pinnedText: { flex: 1 },
  pinnedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pinnedValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  pinnedHint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 4 },
  pinnedBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryStrong,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pinnedBtnText: { color: colors.surface, fontWeight: '700', fontSize: 13 },

  tray: {
    maxHeight: 116,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trayContent: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  trayItem: { width: 88, height: 88 },
  trayThumb: { width: 80, height: 80, borderRadius: 14, backgroundColor: colors.border },
  trayRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayHint: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginLeft: 4 },
  descriptionHint: {
    fontSize: 12,
    color: colors.tone.warning.text,
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
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

  videoTile: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  videoTileText: { color: colors.surface, fontSize: 12, fontWeight: '600' },
  videoNote: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    marginHorizontal: 16,
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 18,
    color: colors.tone.warning.text,
  },
  videoTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  uploadList: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 4, marginHorizontal: 16, marginBottom: 4, maxWidth: '82%' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  uploadRetry: { fontSize: 12, fontWeight: '700', color: colors.primary },
  videoTrayNote: { flex: 1, minWidth: 140, fontSize: 12, lineHeight: 18, color: colors.tone.warning.text },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  quickChipText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  feedbackBox: { marginTop: 8 },
  feedbackRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  feedbackText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  feedbackAction: { fontSize: 13, fontWeight: '700', color: colors.primary },
  feedbackNoteRow: { gap: 8 },
  feedbackInput: {
    minHeight: 44,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  feedbackSend: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  feedbackSendText: { color: colors.surface, fontWeight: '700', fontSize: 13 },
});


