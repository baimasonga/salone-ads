import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = join('dist', '.vite', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = Object.values(manifest).find((item) => item.isEntry);
if (!entry) throw new Error('Vite manifest does not contain an application entry.');

const initialFiles = new Set();

function collectInitial(item) {
  if (!item || initialFiles.has(item.file)) return;
  initialFiles.add(item.file);
  for (const css of item.css ?? []) initialFiles.add(css);
  for (const importedKey of item.imports ?? []) collectInitial(manifest[importedKey]);
}

collectInitial(entry);

function compressedBytes(file) {
  return gzipSync(readFileSync(join('dist', file))).byteLength;
}

const initialAssets = [...initialFiles]
  .map((file) => ({ file, gzipBytes: compressedBytes(file) }))
  .sort((a, b) => b.gzipBytes - a.gzipBytes);
const allJavaScript = Object.values(manifest)
  .filter((item) => item.file.endsWith('.js'))
  .map((item) => ({ file: item.file, gzipBytes: compressedBytes(item.file) }))
  .sort((a, b) => b.gzipBytes - a.gzipBytes);

const initialGzipBytes = initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const initialBudgetBytes = 230 * 1024;
const routeChunkBudgetBytes = 100 * 1024;
// PDF.js is deliberately isolated behind the subscriber's "Analyse document"
// action. It is not a route or initial-load dependency, so give that single,
// named tool bundle an explicit on-demand budget without weakening the general
// route budget.
const onDemandChunkBudgets = {
  'pdf-intelligence-': 310 * 1024,
  'docx-intelligence-': 140 * 1024,
};
const budgetFor = (asset) => {
  const prefix = Object.keys(onDemandChunkBudgets).find((candidate) => asset.file.includes(candidate));
  return prefix ? onDemandChunkBudgets[prefix] : routeChunkBudgetBytes;
};
const oversizedChunks = allJavaScript.filter((asset) => asset.gzipBytes > budgetFor(asset));
const report = {
  generatedAt: new Date().toISOString(),
  budgets: {
    initialGzipBytes: initialBudgetBytes,
    routeChunkGzipBytes: routeChunkBudgetBytes,
    onDemandChunkGzipBytes: onDemandChunkBudgets,
  },
  measurements: {
    initialGzipBytes,
    initialAssets,
    largestJavaScriptChunks: allJavaScript.slice(0, 8),
  },
  passed: initialGzipBytes <= initialBudgetBytes && oversizedChunks.length === 0,
};

writeFileSync('low-bandwidth-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Initial download: ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip (limit 230 KiB)`);
for (const asset of initialAssets) {
  console.log(`  ${asset.file}: ${(asset.gzipBytes / 1024).toFixed(1)} KiB`);
}

if (initialGzipBytes > initialBudgetBytes) {
  console.error('Initial application download exceeds the low-bandwidth budget.');
}
if (oversizedChunks.length > 0) {
  console.error(`JavaScript chunks exceed their gzip budgets: ${oversizedChunks.map((asset) => asset.file).join(', ')}`);
}
if (!report.passed) process.exit(1);
