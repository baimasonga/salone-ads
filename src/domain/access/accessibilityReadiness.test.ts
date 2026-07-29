import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const suite = readFileSync(resolve(root, 'tests/accessibility/public-accessibility.spec.ts'), 'utf8');
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const deploy = readFileSync(resolve(root, '.github/workflows/deploy-containers.yml'), 'utf8');
const styles = readFileSync(resolve(root, 'src/index.css'), 'utf8');

describe('accessibility release readiness', () => {
  it('audits the public, authentication, and tender journeys', () => {
    for (const path of ["path: '/'", "path: '/?auth=signup'", "path: '/tenders'"]) expect(suite).toContain(path);
  });

  it('blocks serious and critical WCAG violations', () => {
    expect(suite).toContain("violation.impact === 'critical'");
    expect(suite).toContain("violation.impact === 'serious'");
    expect(suite).toContain("'wcag2aa'");
  });

  it('protects keyboard focus and reduced-motion preferences', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(suite).toContain('Skip to main content');
  });

  it('runs the accessibility gate in CI and deployment validation', () => {
    expect(ci).toContain('npm run test:a11y');
    expect(deploy).toContain('npm run test:a11y');
  });
});
