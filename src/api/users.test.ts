import { usersApi } from './users';
import apiClient from './client';

jest.mock('./client');

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('usersApi', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call getProfile and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 200,
      message: 'Success',
      data: { id: '1', email: 'test@example.com' }
    };
    mockedApiClient.get.mockResolvedValueOnce({ data: mockData });

    const result = await usersApi.getProfile();
    expect(mockedApiClient.get).toHaveBeenCalledWith('/users/me');
    expect(result).toEqual(mockData);
  });

  it('should call updateProfile and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 200,
      message: 'Success',
      data: { id: '1', fullName: 'John Doe' }
    };
    mockedApiClient.patch.mockResolvedValueOnce({ data: mockData });

    const updateReq = { fullName: 'John Doe' };
    const result = await usersApi.updateProfile(updateReq);
    expect(mockedApiClient.patch).toHaveBeenCalledWith('/users/me', updateReq);
    expect(result).toEqual(mockData);
  });
});
