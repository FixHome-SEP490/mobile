import type { ImageSourcePropType } from 'react-native';

// Owner-supplied illustrations, resized with alpha intact. Decorative only:
// status, service names, prices and permissions always come from existing data.
export const CUSTOMER_UI_ARTWORK = {
  homeHero: require('../../assets/optimized/ui/home-hero-repair-family.png'),
  aircon: require('../../assets/optimized/ui/service-aircon-clean.png'),
  plumbing: require('../../assets/optimized/ui/service-plumbing.png'),
  electrical: require('../../assets/optimized/ui/service-electrical.png'),
  washingMachine: require('../../assets/optimized/ui/service-washing-machine.png'),
  otherDetail: require('../../assets/optimized/ui/service-detail-other.png'),
  aiHelper: require('../../assets/optimized/ui/ai-helper-sparkles.png'),
  emptySearch: require('../../assets/optimized/ui/empty-state-search-service.png'),
  bookingConfirmed: require('../../assets/optimized/ui/booking-confirmed.png'),
  technicianMatch: require('../../assets/optimized/ui/booking-technician-match.png'),
} as const satisfies Record<string, ImageSourcePropType>;
