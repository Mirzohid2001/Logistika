import {imageSize} from 'image-size';

describe('patched image-size parser', () => {
  it('rejects a zero-length ICNS entry instead of looping forever', () => {
    const maliciousIcns = Uint8Array.from([
      0x69, 0x63, 0x6e, 0x73,
      0x00, 0x00, 0x00, 0x10,
      0x69, 0x63, 0x30, 0x37,
      0x00, 0x00, 0x00, 0x00,
    ]);

    expect(() => imageSize(maliciousIcns)).toThrow('Invalid ICNS entry length');
  });
});
