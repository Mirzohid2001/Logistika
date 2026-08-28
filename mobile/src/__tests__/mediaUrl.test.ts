import { getMediaUrl } from '../services/api';
import {DEV_API_PORT} from '../config/appConfig';

const LOCAL_MEDIA = `http://127.0.0.1:${DEV_API_PORT}/media/avatars/user.jpg`;

describe('getMediaUrl', () => {
  it('builds url for relative avatar path', () => {
    expect(getMediaUrl('avatars/user.jpg')).toBe(LOCAL_MEDIA);
  });

  it('normalizes /media/ prefixed paths from backend', () => {
    expect(getMediaUrl('/media/avatars/user.jpg')).toBe(LOCAL_MEDIA);
  });

  it('normalizes media/ prefixed paths', () => {
    expect(getMediaUrl('media/avatars/user.jpg')).toBe(LOCAL_MEDIA);
  });

  it('returns absolute urls unchanged', () => {
    const absolute = 'https://cdn.example.com/avatars/user.jpg';
    expect(getMediaUrl(absolute)).toBe(absolute);
  });
});
