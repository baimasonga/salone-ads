import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const app=fs.readFileSync('src/App.tsx','utf8');

describe('auth state workspace loading',()=>{
  it('defers Supabase workspace calls until the auth callback lock is released',()=>{
    expect(app).toContain('window.setTimeout(() => void loadWorkspace(nextSession), 0)');
    expect(app).not.toContain('\n      loadWorkspace(nextSession);');
  });
  it('cancels queued hydration for password recovery and unmount',()=>{
    expect(app.match(/window\.clearTimeout\(workspaceLoadTimer\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
