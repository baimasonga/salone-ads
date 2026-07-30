import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.cwd(), 'migrations/manohub-new-project');
// Migrations also live here (Supabase CLI naming). They reach production too,
// so they must be validated and checksummed alongside the numbered sequence.
const supabaseDirectory = resolve(process.cwd(), 'supabase/migrations');

const bootstrap = new Set(['EXPORT_from_old_project.sql', 'full_setup.sql']);
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
for (const required of bootstrap) {
  if (!files.includes(required)) throw new Error(`Required bootstrap migration is missing: ${required}`);
}
const numbered = files.filter(name => !bootstrap.has(name));
if (!numbered.length) throw new Error('No numbered migrations found.');

const sequences = new Map();
const manifest = [];
for (const name of numbered) {
  const match = name.match(/^(\d+)_([A-Za-z0-9_.-]+)\.sql$/);
  if (!match) throw new Error(`Unsafe migration filename: ${name}`);
  const path = resolve(directory, name);
  if (statSync(path).size === 0) throw new Error(`Empty migration: ${name}`);
  const sequence = Number(match[1]);
  if (sequences.has(sequence)) throw new Error(`Duplicate migration sequence ${sequence}: ${sequences.get(sequence)}, ${name}`);
  sequences.set(sequence, name);
  const content = readFileSync(path);
  manifest.push({ sequence, name, sha256: createHash('sha256').update(content).digest('hex') });
}
manifest.sort((a, b) => a.sequence - b.sequence);

// A hole in the sequence usually means a migration was renamed, moved to the
// other directory, or never committed — all of which break a replay from
// scratch. Record it explicitly instead of letting it pass unnoticed.
const gaps = [];
for (let sequence = manifest[0].sequence; sequence < manifest.at(-1).sequence; sequence += 1) {
  if (!sequences.has(sequence)) gaps.push(sequence);
}

const supabaseManifest = [];
if (existsSync(supabaseDirectory)) {
  for (const name of readdirSync(supabaseDirectory).filter(entry => entry.endsWith('.sql')).sort()) {
    if (!/^[A-Za-z0-9_.-]+\.sql$/.test(name)) throw new Error(`Unsafe migration filename: supabase/migrations/${name}`);
    const path = resolve(supabaseDirectory, name);
    if (statSync(path).size === 0) throw new Error(`Empty migration: supabase/migrations/${name}`);
    supabaseManifest.push({
      name,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    });
  }
}

const report = {
  count: manifest.length,
  latest: manifest.at(-1),
  gaps,
  migrations: manifest,
  supabaseMigrationCount: supabaseManifest.length,
  supabaseMigrations: supabaseManifest,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (gaps.length) {
  process.stderr.write(
    `Warning: gaps in the numbered migration sequence: ${gaps.join(', ')}. `
    + `Confirm each is intentional (for example, moved to supabase/migrations).\n`,
  );
}
