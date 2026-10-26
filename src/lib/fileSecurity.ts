import { supabase } from './supabaseClient';

import { validateFileBytes, type ProtectedFileKind } from './fileValidation';

export async function uploadScannedFile(file: Blob, kind: ProtectedFileKind, bucket: string, path: string): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  validateFileBytes(header, contentType, kind, file.size);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in before uploading files.');
  const response = await fetch('/api/security/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': contentType,
      'X-Upload-Bucket': bucket,
      'X-Upload-Path': encodeURIComponent(path),
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.path !== 'string') throw new Error(payload?.error?.message || 'The file could not be securely uploaded.');
  return payload.path;
}
