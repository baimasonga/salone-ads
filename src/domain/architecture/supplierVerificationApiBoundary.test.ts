import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const facade = readSource('src/lib/procurementApi.ts');
const supplierVerificationApi = readSource('src/lib/procurement/supplierVerificationApi.ts');

describe('supplier and organization verification API boundary', () => {
  it('keeps compatibility exports while the focused module owns the implementation', () => {
    expect(facade).toContain("export * from './procurement/supplierVerificationApi'");
    expect(facade).not.toContain('export async function enableSupplierMode');
    expect(facade).not.toContain('export async function submitVerificationRequest');
    expect(facade).not.toContain('export async function fetchVerificationQueue');

    expect(supplierVerificationApi).toContain('export async function enableSupplierMode');
    expect(supplierVerificationApi).toContain('export async function submitVerificationRequest');
    expect(supplierVerificationApi).toContain('export async function fetchVerificationQueue');
  });

  it('routes the existing workspace through the focused module', () => {
    expect(readSource('src/components/Workspaces.tsx'))
      .toContain('lib/procurement/supplierVerificationApi');
  });

  it('keeps verification approval behind the secure backend command boundary', () => {
    expect(supplierVerificationApi).toContain("import('../commandApi')");
    expect(supplierVerificationApi).toContain("executeBackendCommand('organization.verification.approve'");
  });
});
