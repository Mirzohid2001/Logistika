import { getMediaUrl } from '../services/api';

describe('getMediaUrl', () => {
  it('builds url for relative avatar path', () => {
    expect(getMediaUrl('avatars/user.jpg')).toBe('http://127.0.0.1:8000/media/avatars/user.jpg');
  });

  it('normalizes /media/ prefixed paths from backend', () => {
    expect(getMediaUrl('/media/avatars/user.jpg')).toBe('http://127.0.0.1:8000/media/avatars/user.jpg');
  });

  it('normalizes media/ prefixed paths', () => {
    expect(getMediaUrl('media/avatars/user.jpg')).toBe('http://127.0.0.1:8000/media/avatars/user.jpg');
  });

  it('returns absolute urls unchanged', () => {
    const absolute = 'https://cdn.example.com/avatars/user.jpg';
    expect(getMediaUrl(absolute)).toBe(absolute);
  });
});
