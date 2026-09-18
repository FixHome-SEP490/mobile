// src/api/ai.api.ts
//
// The assistant's contract, as the AI Service actually speaks it. We reach it
// through our own backend rather than calling the GPU box directly: the box is
// rented per demo, so its host and port change every time, and a new rental
// must not mean a new app build.

import apiClient from './client';

/** The AI rejects a fourth image, so the picker must stop at three. */
export const AI_MAX_IMAGES = 3;

/** Its ceiling is 8 MiB per image once decoded. We aim well under it. */
export const AI_IMAGE_MAX_WIDTH = 1280;
export const AI_IMAGE_QUALITY = 0.7;

/**
 * The model's own budget is eight seconds and measured round trips are 0.3 to
 * 2.4 seconds, but the box sits on rented hardware that may be on another
 * continent. The shared client timeout of 15s is too tight for a cold first
 * call, so these requests carry their own.
 */
const AI_REQUEST_TIMEOUT = 30000;

export interface DetectedDevice {
  deviceType: string;
  nameVi: string;
  confidence: number;
  source?: string | null;
}

export interface SuspectedFault {
  faultCode: string;
  nameVi: string;
  confidence: number;
  source?: string | null;
}

export interface RecommendedService {
  serviceCode: string;
  nameVi: string;
  /** Added by our backend from the catalogue. Null if the code is unknown. */
  serviceId?: string | null;
}

export interface PriceEstimate {
  min: number;
  /** Null means the technician has to look first: render it as "from min". */
  max?: number | null;
  currency: string;
  requiresAssessment: boolean;
}

export interface Clarification {
  questionsVi: string[];
  serviceGroupCodes?: string[] | null;
}

export interface Citation {
  docId: string;
  titleVi: string;
  score: number;
}

/**
 * `status` is the branch to render on.
 *   ok                   - a diagnosis, or an answer
 *   needs_clarification  - questionsVi is filled; a service is still offered
 *   out_of_scope         - politely declined; show the text as written
 *   general_knowledge    - answered without our documents behind it
 *   no_grounding         - nothing in the corpus matched
 *   unavailable          - our backend could not reach the AI at all
 */
export type AiStatus =
  | 'ok'
  | 'needs_clarification'
  | 'out_of_scope'
  | 'general_knowledge'
  | 'no_grounding'
  | 'unavailable';

export interface AiReply {
  sessionId: string | null;
  status: AiStatus;
  /** False only when the backend could not reach the AI. */
  aiAvailable?: boolean;

  /** Prose. Diagnosis fills messageVi; a question fills answerVi. */
  messageVi?: string | null;
  answerVi?: string | null;

  device?: DetectedDevice | null;
  suspectedFaults?: SuspectedFault[];
  recommendedServices?: RecommendedService[];
  /** Safety advice. When urgency is HIGH this outranks everything else. */
  suggestedActionsVi?: string[];
  priceEstimate?: PriceEstimate | null;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence?: number;
  isLowConfidence?: boolean;
  clarification?: Clarification | null;
  citations?: Citation[];
  disclaimerVi?: string;
}

export type AcknowledgementSituations = Record<string, string[]>;

export interface AcknowledgementPayload {
  version?: string;
  situations?: AcknowledgementSituations;
  safetyFirst?: string[];
}

export interface AnalyzePayload {
  description: string;
  /** Data URIs or bare base64. At most three; the rest are dropped. */
  images?: string[];
  /** Omit on the first message, then echo back what the reply returned. */
  sessionId?: string | null;
  categoryHint?: string;
}

export interface AskPayload {
  question: string;
  sessionId?: string | null;
  deviceType?: string;
}

function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** The sentence to show when even our own backend is unreachable. */
function offline(sessionId?: string | null): AiReply {
  return {
    sessionId: sessionId ?? null,
    status: 'unavailable',
    aiAvailable: false,
    messageVi:
      'Hiện chưa kết nối được tới trợ lý ạ. Anh/chị kiểm tra lại mạng giúp em, ' +
      'hoặc vẫn có thể đặt thợ bình thường.',
    answerVi:
      'Hiện chưa kết nối được tới trợ lý ạ. Anh/chị kiểm tra lại mạng giúp em, ' +
      'hoặc vẫn có thể đặt thợ bình thường.',
    suspectedFaults: [],
    recommendedServices: [],
    suggestedActionsVi: [],
  };
}

export const aiApi = {
  /**
   * A photo, a description, or both.
   *
   * Never rejects: the assistant failing must not take the screen down with it,
   * and the customer can always still book.
   */
  async analyze(payload: AnalyzePayload): Promise<AiReply> {
    try {
      const res = await apiClient.post<{ data: AiReply } | AiReply>(
        '/ai/diagnoses',
        {
          description: payload.description,
          images: (payload.images || []).slice(0, AI_MAX_IMAGES),
          sessionId: payload.sessionId || undefined,
          categoryHint: payload.categoryHint,
        },
        { timeout: AI_REQUEST_TIMEOUT },
      );
      return unwrap(res.data);
    } catch {
      return offline(payload.sessionId);
    }
  },

  /** A question with no photo. */
  async ask(payload: AskPayload): Promise<AiReply> {
    try {
      const res = await apiClient.post<{ data: AiReply } | AiReply>(
        '/ai/chat/ask',
        {
          question: payload.question,
          sessionId: payload.sessionId || undefined,
          deviceType: payload.deviceType,
        },
        { timeout: AI_REQUEST_TIMEOUT },
      );
      return unwrap(res.data);
    } catch {
      return offline(payload.sessionId);
    }
  },

  /**
   * Lines to show while the model is thinking, so the wait has words in it.
   *
   * Grouped by situation - first_photo, first_text, follow_up, price_question,
   * general_question, before_asking_back, long_wait - so the holding line can
   * match the message that caused the wait. Returns an empty map on failure;
   * the caller has its own last-resort sentence.
   */
  async acknowledgements(): Promise<AcknowledgementSituations> {
    try {
      const res = await apiClient.get<
        { data: AcknowledgementPayload } | AcknowledgementPayload
      >('/ai/chat/acknowledgements');
      const body = unwrap(res.data);
      return body?.situations ?? {};
    } catch {
      return {};
    }
  },
};

/**
 * Whether a message should go to the diagnosis route or the question route.
 *
 * A photo always means diagnosis. Otherwise anything that reads like a report
 * of something wrong goes to diagnosis, and the rest is a question. Getting it
 * wrong is cheap: the diagnosis route recognises questions, greetings and
 * booking intent on its own and answers them correctly, so it is the safe
 * default and this only avoids the needless round trip.
 */
export function looksLikeAQuestion(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;

  const asksSomething =
    trimmed.includes('?') ||
    /\b(bao nhiêu|bao lâu|thế nào|như thế nào|có được không|được không|là gì|gì vậy|khi nào|ở đâu|tại sao|vì sao|có nên|nên không)\b/.test(
      trimmed,
    );
  if (!asksSomething) return false;

  // "máy lạnh không mát phải làm sao?" is a fault report wearing a question
  // mark. Symptoms win, because the diagnosis route is the one that can help.
  //
  // `nóng` and `lạnh` are deliberately absent. They are not symptoms here, they
  // are parts of appliance names - máy lạnh, tủ lạnh, bình nóng lạnh - so
  // including them sent "vệ sinh máy lạnh bao nhiêu tiền" to the diagnosis
  // route as though something had been reported broken. A real report of those
  // symptoms says "không lạnh" or "không mát", and `không` is in the list.
  const reportsAFault =
    /(không|hỏng|hư|kêu|rò rỉ|chảy|cháy|rung|lỗi|kẹt|tắc|nghẹt|chập|aptomat|bốc khói|mất điện)/.test(
      trimmed,
    );
  return !reportsAFault;
}
