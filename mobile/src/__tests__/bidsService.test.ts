import { bidsService } from '../services/bidsService';
import { apiService } from '../services/api';

jest.mock('../services/api', () => ({
  apiService: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('bidsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('agreeToCounter posts to agree-counter endpoint', async () => {
    const mockBid = { id: 7, is_driver_agreed_to_amount: true };
    (apiService.post as jest.Mock).mockResolvedValue(mockBid);

    const result = await bidsService.agreeToCounter(7);

    expect(apiService.post).toHaveBeenCalledWith('/bids/7/agree-counter/', {});
    expect(result).toEqual(mockBid);
  });

  it('counterOffer posts amount to counter-offer endpoint', async () => {
    const mockBid = { id: 3, current_amount: '47000' };
    (apiService.post as jest.Mock).mockResolvedValue(mockBid);

    await bidsService.counterOffer(3, 47000);

    expect(apiService.post).toHaveBeenCalledWith('/bids/3/counter-offer/', { amount: 47000 });
  });
});
