import { normalizeProfile, technicianProfileApi } from './technician-profile.api';
import apiClient from './client';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockedClient = apiClient as unknown as { get: jest.Mock; patch: jest.Mock };

describe('technician profile normalization', () => {
  it('keeps missing rating, reliability and radius as null instead of inventing 5 / 100 / 10', () => {
    const profile = normalizeProfile({ bio: null, yearsExperience: 3, isAvailable: true });
    expect(profile.averageRating).toBeNull();
    expect(profile.ratingCount).toBe(0);
    expect(profile.reliabilityScore).toBeNull();
    expect(profile.serviceRadiusKm).toBeNull();
  });

  it('reads the decimal strings the server sends', () => {
    const profile = normalizeProfile({
      averageRating: '4.50',
      ratingCount: 2,
      reliabilityScore: 96,
      serviceRadiusKm: '12.5',
      isAvailable: false,
    });
    expect(profile.averageRating).toBe(4.5);
    expect(profile.ratingCount).toBe(2);
    expect(profile.reliabilityScore).toBe(96);
    expect(profile.serviceRadiusKm).toBe(12.5);
    expect(profile.isAvailable).toBe(false);
  });

  it('does not mark the technician available when the field is missing', () => {
    expect(normalizeProfile({}).isAvailable).toBe(false);
    expect(normalizeProfile(null).schedules).toEqual([]);
  });

  it('applies the same rules to the GET response', async () => {
    mockedClient.get.mockResolvedValueOnce({
      data: { data: { averageRating: '0.00', ratingCount: 0, schedules: [] } },
    });
    const profile = await technicianProfileApi.getMyProfile();
    expect(mockedClient.get).toHaveBeenCalledWith('/technicians/me/profile');
    expect(profile.averageRating).toBe(0);
    expect(profile.ratingCount).toBe(0);
    expect(profile.serviceRadiusKm).toBeNull();
  });
});
