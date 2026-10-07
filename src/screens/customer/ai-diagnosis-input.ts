// BRX-064: chẩn đoán bằng AI cần mô tả bằng chữ. Ảnh chỉ đi kèm mô tả, không
// thay được mô tả, nên màn chẩn đoán và khung trò chuyện với trợ lý đều khoá
// nút gửi cho tới khi có chữ thật (không tính khoảng trắng).

export const AI_DESCRIPTION_REQUIRED_HINT = 'Mô tả vấn đề trước khi gửi cho trợ lý';

export function hasDescription(text: string | null | undefined): boolean {
  return (text ?? '').trim().length > 0;
}

export interface AssistantInputState {
  text: string;
  imageCount: number;
  busy?: boolean;
}

/** Gửi được khi có mô tả và trợ lý không đang trả lời; ảnh không bắt buộc. */
export function canSendToAssistant({ text, busy = false }: AssistantInputState): boolean {
  return !busy && hasDescription(text);
}

/**
 * Hiện câu nhắc khi khách đã có ý gửi (đã chọn ảnh) mà chưa viết mô tả.
 * `always` dùng cho màn chẩn đoán, nơi nút gửi luôn hiện.
 */
export function showDescriptionHint(
  { text, imageCount }: AssistantInputState,
  always = false,
): boolean {
  if (hasDescription(text)) return false;
  return always || imageCount > 0;
}
