/** Source-level safety guard: legacy mock screens must not be registered in the real app navigator. */
const { readFileSync } = jest.requireActual<{ readFileSync: (file: string, encoding: string) => string }>('fs');
const navigatorSource = readFileSync('src/navigation/AppNavigator.tsx', 'utf8');
const obsoleteDemoScreens = [
  'CustomerTechFound', 'CustomerTracking', 'CustomerQuotation',
  'CustomerUnderRepair', 'CustomerCompleted', 'CustomerReview',
] as const;

describe('Mobile Booking routes never expose the legacy mock completion/review chain', () => {
  it.each(obsoleteDemoScreens)('does not register the mock %s route', (route) => {
    expect(navigatorSource).not.toContain(`<Stack.Screen name="${route}"`);
  });

  it('keeps the server-backed order detail routes registered', () => {
    expect(navigatorSource).toContain('<Stack.Screen name="CustomerOrderDetail"');
    expect(navigatorSource).toContain('<Stack.Screen name="TechnicianOrderDetail"');
  });
});
