import { supabase } from './supabaseClient';

export type ProtectedFileKind = 'image' | 'document' | 'receipt' | 'csv';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<ProtectedFileKind, Set<string>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  document: new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']),
  receipt: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  csv: new Set(['text/csv', 'application/csv', 'text/plain']),
};

function signatureMatches(bytes: Uint8Array, type: string): boolean {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (type === 'application/pdf') return starts(0x25, 0x50, 0x44, 0x46);
  if (type === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (type === 'image/gif') return starts(0x47, 0x49, 0x46, 0x38);
  if (type === 'image/webp') return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (type.includes('officedocument') || type.includes('msword') || type.includes('ms-excel')) return starts(0x50, 0x4b) || starts(0xd0, 0xcf, 0x11, 0xe0);
  return true;
}

export async function scanFileBeforeUpload(file: Blob, kind: ProtectedFileKind, fileName = (file as File).name || 'upload.bin'): Promise<void> {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Files must be non-empty and no larger than 10MB.');
  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED[kind].has(contentType)) throw new Error(`Unsupported ${kind} type.`);
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!signatureMatches(header, contentType)) throw new Error('The file contents do not match the declared file type.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in before uploading files.');
  const response = await fetch('/api/security/scan', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': contentType,
      'X-File-Name': encodeURIComponent(fileName.slice(0, 240)),
      'X-File-Kind': kind,
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.verdict !== 'clean') throw new Error(payload?.error?.message || 'The file could not be cleared by security scanning.');
}
