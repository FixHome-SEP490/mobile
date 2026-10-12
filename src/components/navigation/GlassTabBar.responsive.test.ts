import {
  getGlassTabBarLayout,
  getGlassTabIndicatorOffset,
  shouldSyncGlassTabIndicator,
} from './glass-tab-bar-layout';

declare const require: <T>(moduleName: string) => T;
declare const __dirname: string;

const { readFileSync } = require<{ readFileSync: (filePath: string, encoding: 'utf8') => string }>('fs');
const { resolve } = require<{ resolve: (...segments: string[]) => string }>('path');

describe('GlassTabBar responsive layout', () => {
  it('sizes five Technician slots to the live viewport and reanchors selection on resize', () => {
    let previousTabWidth = 0;

    for (const windowWidth of [1024, 320, 360, 390, 430, 530]) {
      const layout = getGlassTabBarLayout({
        windowWidth,
        screenWidth: 320,
        tabCount: 5,
        showAssistant: false,
        technicianResponsive: true,
      });
      const expectedPillWidth = Math.min(600, windowWidth - 32);
      const expectedTabWidth = expectedPillWidth / 5;

      expect(layout.pillWidth).toBe(expectedPillWidth);
      expect(layout.tabWidth).toBe(expectedTabWidth);
      expect(layout.tabWidth).toBeLessThanOrEqual(expectedPillWidth / 5);
      expect(getGlassTabIndicatorOffset(2, layout.tabWidth)).toBe(2 * expectedTabWidth);
      expect(shouldSyncGlassTabIndicator(2, 2, previousTabWidth, layout.tabWidth)).toBe(true);
      previousTabWidth = layout.tabWidth;
    }

    expect(shouldSyncGlassTabIndicator(4, 2, previousTabWidth, previousTabWidth)).toBe(true);
  });

  it('preserves the legacy Customer pill width when the live viewport changes', () => {
    const original = getGlassTabBarLayout({
      windowWidth: 320,
      screenWidth: 390,
      tabCount: 4,
      showAssistant: true,
      technicianResponsive: false,
    });
    const afterResize = getGlassTabBarLayout({
      windowWidth: 530,
      screenWidth: 390,
      tabCount: 4,
      showAssistant: true,
      technicianResponsive: false,
    });

    expect(original.pillWidth).toBe(390 - 32 - 12 - 64);
    expect(afterResize).toEqual(original);
  });

  it('routes the five Technician tabs through GlassTabBar with its responsive opt-in', () => {
    const technicianSource = readFileSync(resolve(__dirname, '../../navigation/TechnicianNavigator.tsx'), 'utf8');
    const customerSource = readFileSync(resolve(__dirname, '../../navigation/CustomerNavigator.tsx'), 'utf8');

    expect(technicianSource).toContain("import { GlassTabBar } from '../components/navigation/GlassTabBar';");
    expect(technicianSource).toContain('<GlassTabBar {...props} showAssistant={false} technicianResponsive />');
    expect(technicianSource).toContain('Home, MailOpen, Briefcase, Wallet, User');
    expect(technicianSource.match(/<Tab\.Screen/g)).toHaveLength(5);
    expect(technicianSource).not.toContain('TechnicianResponsiveTabBar');
    expect(customerSource).toContain('<CustomerAnimatedBottomBar {...props} mode="authenticated" />');
    expect(technicianSource).toContain('useTechnicianLocationPing(!!user)');
    expect(technicianSource).toContain('name="Wallet"');
  });

  it('keeps an empty route set from dividing by zero', () => {
    expect(getGlassTabBarLayout({
      windowWidth: 320,
      screenWidth: 320,
      tabCount: 0,
      showAssistant: false,
      technicianResponsive: true,
    }).tabWidth).toBe(0);
  });
});
