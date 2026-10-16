import { normalizeProfile } from './technician-profile.api';

describe('normalizeProfile autoAcceptInvitations', () => {
  it('is true only when the server sent true', () => {
    expect(normalizeProfile({ autoAcceptInvitations: true }).autoAcceptInvitations).toBe(true);
    expect(normalizeProfile({ autoAcceptInvitations: 'true' }).autoAcceptInvitations).toBe(false);
    expect(normalizeProfile({}).autoAcceptInvitations).toBe(false);
  });
});
