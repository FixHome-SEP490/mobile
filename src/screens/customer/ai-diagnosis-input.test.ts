import {
  AI_DESCRIPTION_REQUIRED_HINT,
  canSendToAssistant,
  hasDescription,
  showDescriptionHint,
} from './ai-diagnosis-input';

describe('BRX-064: AI diagnosis needs a written description', () => {
  it('refuses photos without text', () => {
    expect(canSendToAssistant({ text: '', imageCount: 3 })).toBe(false);
    expect(canSendToAssistant({ text: '', imageCount: 1 })).toBe(false);
  });

  it('treats whitespace-only text as no description', () => {
    expect(hasDescription('   \n\t ')).toBe(false);
    expect(canSendToAssistant({ text: '   \n', imageCount: 2 })).toBe(false);
  });

  it('allows text with or without photos', () => {
    expect(canSendToAssistant({ text: 'Điều hòa không mát', imageCount: 0 })).toBe(true);
    expect(canSendToAssistant({ text: ' tủ lạnh kêu to ', imageCount: 3 })).toBe(true);
  });

  it('blocks sending while the assistant is still answering', () => {
    expect(canSendToAssistant({ text: 'Máy giặt không vắt', imageCount: 0, busy: true })).toBe(false);
  });

  it('accepts emoji and accented text as a description', () => {
    expect(canSendToAssistant({ text: '🔥 bếp từ báo lỗi', imageCount: 0 })).toBe(true);
    expect(hasDescription('Đèn')).toBe(true);
  });

  it('shows the hint in chat only once photos are waiting without text', () => {
    expect(showDescriptionHint({ text: '', imageCount: 0 })).toBe(false);
    expect(showDescriptionHint({ text: '', imageCount: 1 })).toBe(true);
    expect(showDescriptionHint({ text: 'Bồn cầu rò nước', imageCount: 1 })).toBe(false);
  });

  it('always shows the hint on the diagnosis screen until text is written', () => {
    expect(showDescriptionHint({ text: '  ', imageCount: 0 }, true)).toBe(true);
    expect(showDescriptionHint({ text: 'Quạt không quay', imageCount: 0 }, true)).toBe(false);
  });

  it('uses the agreed wording', () => {
    expect(AI_DESCRIPTION_REQUIRED_HINT).toBe('Mô tả vấn đề trước khi gửi cho trợ lý');
  });
});
