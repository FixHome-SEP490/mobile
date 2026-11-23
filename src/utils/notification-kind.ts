// Order, quotation and extra-cost notifications that web labels but exact-match maps on mobile left on the plain bell.
// One place decides the tone and the icon family so the customer and technician lists agree with web.
import type { ToneName } from '../constants/theme';

export type NotificationIconKey = 'check' | 'close' | 'truck' | 'cash' | 'package' | 'people' | 'clipboard';

export interface NotificationKind {
  tone: ToneName;
  icon: NotificationIconKey;
}

/** null = not one of these types; the caller keeps its own default. */
export function notificationKind(type?: string | null): NotificationKind | null {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t.includes('CANCEL')) return { tone: 'danger', icon: 'close' };
  if (t.endsWith('_REJECTED') && (t.startsWith('QUOTATION') || t.startsWith('ADDITIONAL_COST'))) return { tone: 'danger', icon: 'close' };
  if (t.endsWith('_APPROVED') && (t.startsWith('QUOTATION') || t.startsWith('ADDITIONAL_COST'))) return { tone: 'success', icon: 'check' };
  switch (t) {
    case 'ORDER_COMPLETED':
    case 'COMPLETION_CONFIRMED':
    case 'TECHNICIAN_ARRIVED':
      return { tone: 'success', icon: 'check' };
    case 'COMPLETION_REQUESTED':
      return { tone: 'warning', icon: 'clipboard' };
    case 'TECHNICIAN_EN_ROUTE':
      return { tone: 'info', icon: 'truck' };
    case 'BOOKING_INVITATION':
      return { tone: 'repair', icon: 'clipboard' };
    case 'BOOKING_MATCHING_EXHAUSTED':
      return { tone: 'warning', icon: 'people' };
    case 'PART_RETURN_DECLARED':
      return { tone: 'info', icon: 'package' };
    default:
      break;
  }
  if (t.startsWith('QUOTATION') || t.startsWith('ADDITIONAL_COST')) return { tone: 'info', icon: 'cash' };
  return null;
}
