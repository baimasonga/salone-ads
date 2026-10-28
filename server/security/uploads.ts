import express from 'express';
import { validateFileBytes, type ProtectedFileKind } from '../../src/lib/fileValidation.js';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKETS = new Set(['advert-creatives', 'landing-cms-media', 'media-assets', 'private-documents', 'public-assets', 'bid-submissions', 'subscription-payment-proofs']);
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status, expose: true });

export function registerProtectedUploads(app: express.Express, dependencies: {
  requireUser: express.RequestHandler;
  scanRateLimiter: express.RequestHandler;
  scan: (bytes: Buffer) => Promise<{ clean: boolean; detail: string }>;
  serviceClient: SupabaseClient | null;
  userClient: (req: express.Request) => SupabaseClient;
}): void {
  app.post('/api/security/upload', dependencies.scanRateLimiter, dependencies.requireUser,
    express.raw({ type: () => true, limit: '10mb' }), async (req, res, next) => {
      let authorizationId: string | undefined;
      try {
        if (!dependencies.serviceClient) throw fail('Protected uploads are not configured.', 503);
        const bucket = req.get('x-upload-bucket') || '';
        const requestedPath = decodeURIComponent(req.get('x-upload-path') || '');
        if (!BUCKETS.has(bucket) || requestedPath.length > 900 || !requestedPath || requestedPath.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(requestedPath)) {
          throw fail('Invalid upload destination.');
        }
        if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail('A non-empty file is required.');
        const contentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const kind: ProtectedFileKind = bucket === 'subscription-payment-proofs' ? 'receipt'
          : ['advert-creatives', 'landing-cms-media'].includes(bucket) ? 'image'
          : bucket === 'media-assets' && contentType.startsWith('image/') ? 'image' : 'document';
        try { validateFileBytes(req.body.subarray(0, 16), contentType, kind, req.body.length); }
        catch (error) { throw fail(error instanceof Error ? error.message : 'Invalid file.'); }
        const userId = (req as express.Request & { userId: string }).userId;
        const client = dependencies.userClient(req);
        // The random name stays private until storage has accepted these exact
        // scanned bytes. Clients cannot race or reuse a scan authorization.
        const separator = requestedPath.lastIndexOf('/');
        const storagePath = `${requestedPath.slice(0, separator + 1)}${randomUUID()}-${requestedPath.slice(separator + 1)}`;
        const { data: grant, error: grantError } = await dependencies.serviceClient.from('protected_upload_authorizations')
          .insert({ user_id: userId, bucket_id: bucket, object_path: storagePath }).select('id').single();
        if (grantError || !grant) throw grantError || fail('Upload authorization failed.', 503);
        authorizationId = grant.id;
        // Signing uses the caller's JWT, preserving existing bucket-specific
        // organization, ownership, editorial and draft-submission RLS checks.
        const { data: signed, error: signingError } = await client.storage.from(bucket).createSignedUploadUrl(storagePath);
        if (signingError || !signed) throw fail('You cannot upload to this destination.', 403);
        const result = await dependencies.scan(req.body);
        const { error: auditError } = await dependencies.serviceClient.from('upload_security_events').insert({
          user_id: userId,
          file_name: requestedPath.slice(separator + 1).slice(0, 240),
          file_kind: kind, mime_type: contentType, file_size: req.body.length,
          verdict: result.clean ? 'clean' : 'blocked',
          threat_detail: result.clean ? null : result.detail.slice(0, 240),
          request_id: res.locals.requestId,
        });
        if (auditError) throw auditError;
        if (!result.clean) throw fail('This file was blocked because malware was detected.', 422);
        const { error: uploadError } = await client.storage.from(bucket).uploadToSignedUrl(storagePath, signed.token, req.body, {
          contentType, upsert: false,
        });
        if (uploadError) throw uploadError;
        res.status(201).json({ path: storagePath });
      } catch (error) {
        next(error);
      } finally {
        if (authorizationId && dependencies.serviceClient) {
          const { error } = await dependencies.serviceClient.from('protected_upload_authorizations').delete().eq('id', authorizationId);
          if (error) console.error('Protected upload authorization cleanup failed.');
        }
      }
    });
}
