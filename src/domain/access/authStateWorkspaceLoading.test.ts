import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const app=fs.readFileSync('src/App.tsx','utf8');

describe('auth state workspace loading',()=>{
  it('defers Supabase workspace calls until the auth callback lock is released',()=>{
    expect(app).toContain('workspaceLoadTimer = window.setTimeout(() => {');
    expect(app).toContain('await loadWorkspace(nextSession);');
    expect(app).not.toContain('\n      loadWorkspace(nextSession);');
  });
  it('cancels queued hydration for password recovery and unmount',()=>{
    expect(app.match(/window\.clearTimeout\(workspaceLoadTimer\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('leaves the sign-in form as soon as Supabase confirms a session',()=>{
    expect(app).toContain("event === 'SIGNED_IN' || event === 'INITIAL_SESSION'");
    expect(app).toContain("currentView === 'signin' ? 'dashboard' : currentView");
  });
});
