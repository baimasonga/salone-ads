export function trackingQrFilename(label: string): string {
  const safeLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safeLabel || 'tracking-link'}-qr.png`;
}

export async function downloadTrackingQr(shortUrl: string, label: string): Promise<void> {
  // QR generation is an occasional export action, so keep the encoder out of
  // the main workspace bundle for customers on slower connections.
  const { default: QRCode } = await import('qrcode');
  const dataUrl = await QRCode.toDataURL(shortUrl, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1024,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = trackingQrFilename(label);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
