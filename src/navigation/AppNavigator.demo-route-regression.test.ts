/** Source-level safety guard: legacy mock screens/routes must stay out of the real app. */
const fs = jest.requireActual<{
  readFileSync: (file: string, encoding: string) => string;
  existsSync: (file: string) => boolean;
}>('fs');

const navigatorSource = fs.readFileSync('src/navigation/AppNavigator.tsx', 'utf8');
const navigationTypesSource = fs.readFileSync('src/types/navigation.types.ts', 'utf8');

const obsoleteDemoScreens = [
  'CustomerTechFound',
  'CustomerTracking',
  'CustomerQuotation',
  'CustomerUnderRepair',
  'CustomerCompleted',
  'CustomerReview',
] as const;

const obsoleteDemoFiles = [
  'CustomerTechFoundScreen.tsx',
  'CustomerTrackingScreen.tsx',
  'CustomerQuotationScreen.tsx',
  'CustomerUnderRepairScreen.tsx',
  'CustomerCompletedScreen.tsx',
  'CustomerReviewScreen.tsx',
] as const;

describe('Mobile Booking routes never expose the legacy mock completion/review chain', () => {
  it.each(obsoleteDemoScreens)('does not register or type the mock %s route', (route) => {
    expect(navigatorSource).not.toContain(`<Stack.Screen name="${route}"`);
    expect(navigationTypesSource).not.toContain(`${route}:`);
  });

  it.each(obsoleteDemoFiles)('does not keep the unreachable mock screen source %s', (file) => {
    expect(fs.existsSync(`src/screens/customer/${file}`)).toBe(false);
  });

  it('keeps the server-backed order detail and customer service-history routes registered', () => {
    expect(navigatorSource).toContain('<Stack.Screen name="CustomerOrderDetail"');
    expect(navigatorSource).toContain('<Stack.Screen name="CustomerRepairHistory"');
    expect(navigatorSource).toContain('<Stack.Screen name="CustomerWarranties"');
    expect(navigatorSource).toContain('<Stack.Screen name="CustomerSecurity"');
    expect(navigatorSource).toContain('<Stack.Screen name="TechnicianOrderDetail"');
  });
});
