import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.cwd(), 'migrations/manohub-new-project');
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
  if (statSync(resolve(directory, name)).size === 0) throw new Error(`Empty migration: ${name}`);
  const sequence = Number(match[1]);
  if (sequences.has(sequence)) throw new Error(`Duplicate migration sequence ${sequence}: ${sequences.get(sequence)}, ${name}`);
  sequences.set(sequence, name);
  const content = readFileSync(resolve(directory, name));
  manifest.push({ sequence, name, sha256: createHash('sha256').update(content).digest('hex') });
}
manifest.sort((a, b) => a.sequence - b.sequence);
process.stdout.write(`${JSON.stringify({ count: manifest.length, latest: manifest.at(-1), migrations: manifest }, null, 2)}\n`);
