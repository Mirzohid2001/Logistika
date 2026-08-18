import { locationsService } from '../services/locationsService';
import { apiService } from '../services/api';

jest.mock('../services/api', () => ({
  apiService: {
    get: jest.fn(),
  },
}));

const mockedGet = apiService.get as jest.Mock;

describe('locationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns plain array countries', async () => {
    mockedGet.mockResolvedValue([{ id: 1, name: 'Uzbekistan', code: 'UZ' }]);
    const countries = await locationsService.getCountries();
    expect(countries).toHaveLength(1);
    expect(countries[0].code).toBe('UZ');
  });

  it('normalizes paginated countries response', async () => {
    mockedGet.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 2, name: 'Kazakhstan', code: 'KZ' }],
    });
    const countries = await locationsService.getCountries();
    expect(countries).toHaveLength(1);
    expect(countries[0].code).toBe('KZ');
  });

  it('returns empty list when API response is empty', async () => {
    mockedGet.mockResolvedValue([]);
    const cities = await locationsService.getCities(1);
    expect(cities).toEqual([]);
  });

  it('requests nearest city by GPS coordinates', async () => {
    mockedGet.mockResolvedValue({ id: 7, name: 'Toshkent', distance_km: 1.2 });
    const city = await locationsService.getNearestCity(41.3, 69.24, { maxKm: 120 });
    expect(city.id).toBe(7);
    expect(mockedGet).toHaveBeenCalledWith('/locations/nearest-city/', {
      lat: 41.3,
      lng: 69.24,
      max_km: 120,
    });
  });
});
