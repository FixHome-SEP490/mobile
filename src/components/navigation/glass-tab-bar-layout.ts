export const GLASS_TAB_BAR_MARGIN_HORIZONTAL = 16;
export const GLASS_TAB_BAR_GAP = 12;
export const GLASS_TAB_BAR_ACTION_CIRCLE_SIZE = 64;
const MAX_TECHNICIAN_PILL_WIDTH = 600;

export function getGlassTabBarLayout({
  windowWidth,
  screenWidth,
  tabCount,
  showAssistant,
  technicianResponsive,
}: {
  windowWidth: number;
  screenWidth: number;
  tabCount: number;
  showAssistant: boolean;
  technicianResponsive: boolean;
}) {
  const pillWidth = technicianResponsive
    ? Math.max(0, Math.min(MAX_TECHNICIAN_PILL_WIDTH, windowWidth - GLASS_TAB_BAR_MARGIN_HORIZONTAL * 2))
    : screenWidth - GLASS_TAB_BAR_MARGIN_HORIZONTAL * 2 - (showAssistant ? GLASS_TAB_BAR_GAP + GLASS_TAB_BAR_ACTION_CIRCLE_SIZE : 0);

  return {
    pillWidth,
    tabWidth: tabCount > 0 ? pillWidth / tabCount : 0,
  };
}

export function getGlassTabIndicatorOffset(index: number, tabWidth: number) {
  return Math.max(0, index) * tabWidth;
}

export function shouldSyncGlassTabIndicator(
  currentIndex: number,
  activeIndex: number,
  previousTabWidth: number,
  tabWidth: number,
) {
  return currentIndex !== activeIndex || previousTabWidth !== tabWidth;
}
