import { addressesApi } from './addresses';
import apiClient from './client';

jest.mock('./client');

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('addressesApi', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call getAddresses and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 200,
      message: 'Success',
      data: [{ id: '1', label: 'Home' }]
    };
    mockedApiClient.get.mockResolvedValueOnce({ data: mockData });

    const result = await addressesApi.getAddresses();
    expect(mockedApiClient.get).toHaveBeenCalledWith('/me/addresses');
    expect(result).toEqual(mockData);
  });

  it('should call createAddress and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 201,
      message: 'Success',
      data: { id: '2', label: 'Work' }
    };
    const req = { label: 'Work', line1: '123', ward: 'W', district: 'D', province: 'P', lat: 0, lng: 0 };
    mockedApiClient.post.mockResolvedValueOnce({ data: mockData });

    const result = await addressesApi.createAddress(req);
    expect(mockedApiClient.post).toHaveBeenCalledWith('/me/addresses', req);
    expect(result).toEqual(mockData);
  });

  it('should call updateAddress and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 200,
      message: 'Success',
      data: { id: '1', label: 'Updated Home' }
    };
    const req = { label: 'Updated Home' };
    mockedApiClient.patch.mockResolvedValueOnce({ data: mockData });

    const result = await addressesApi.updateAddress('1', req);
    expect(mockedApiClient.patch).toHaveBeenCalledWith('/me/addresses/1', req);
    expect(result).toEqual(mockData);
  });

  it('should call deleteAddress and return data', async () => {
    const mockData = {
      success: true,
      statusCode: 200,
      message: 'Success',
      data: { id: '1' }
    };
    mockedApiClient.delete.mockResolvedValueOnce({ data: mockData });

    const result = await addressesApi.deleteAddress('1');
    expect(mockedApiClient.delete).toHaveBeenCalledWith('/me/addresses/1');
    expect(result).toEqual(mockData);
  });
});
