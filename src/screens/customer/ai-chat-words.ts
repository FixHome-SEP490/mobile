// src/screens/customer/ai-chat-words.ts

/** The booking description holds at most this much of the conversation. */
export const CUSTOMER_WORDS_MAX = 1000;

/**
 * Everything the customer typed to the assistant, oldest first, for the
 * booking description. Only the last message lost the first one - "tủ lạnh
 * không đông đá" disappeared once the customer added "tủ Samsung, 5 năm" - so
 * every turn is kept, the oldest dropped first when it grows too long. The web
 * booking form does the same.
 */
export function appendCustomerWords(previous: string, next: string): string {
  const text = next.replace(/\s+/g, ' ').trim();
  if (!text) return previous;
  const joined = previous ? `${previous}. ${text}` : text;
  return joined.length > CUSTOMER_WORDS_MAX ? joined.slice(joined.length - CUSTOMER_WORDS_MAX).trimStart() : joined;
}
