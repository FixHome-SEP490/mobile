import { appendCustomerWords, CUSTOMER_WORDS_MAX } from './ai-chat-words';

describe('appendCustomerWords', () => {
  it('keeps every turn the customer typed, oldest first', () => {
    let words = appendCustomerWords('', 'Tủ lạnh không đông đá');
    words = appendCustomerWords(words, '  Tủ Samsung 2 cánh,\n dùng 5 năm ');
    expect(words).toBe('Tủ lạnh không đông đá. Tủ Samsung 2 cánh, dùng 5 năm');
  });

  it('ignores empty turns, such as a photo sent without text', () => {
    expect(appendCustomerWords('Máy giặt kêu', '   ')).toBe('Máy giặt kêu');
  });

  it('drops the oldest words first when the conversation grows too long', () => {
    let words = '';
    for (let i = 0; i < 40; i++) words = appendCustomerWords(words, `lượt ${i} ${'😀'.repeat(20)}`);
    expect(words.length).toBeLessThanOrEqual(CUSTOMER_WORDS_MAX);
    expect(words).toContain('lượt 39');
    expect(words).not.toContain('lượt 0 ');
  });
});
