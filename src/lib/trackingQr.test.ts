import { describe, expect, it } from 'vitest';
import { trackingQrFilename } from './trackingQr';

describe('trackingQrFilename', () => {
  it('creates a portable filename from a tracking-link label', () => {
    expect(trackingQrFilename(' Facebook / WhatsApp Launch! ')).toBe('facebook-whatsapp-launch-qr.png');
  });

  it('uses a stable fallback when the label has no filename-safe characters', () => {
    expect(trackingQrFilename('***')).toBe('tracking-link-qr.png');
  });

  it('bounds the user-controlled portion of the filename', () => {
    expect(trackingQrFilename('a'.repeat(200))).toBe(`${'a'.repeat(80)}-qr.png`);
  });
});
