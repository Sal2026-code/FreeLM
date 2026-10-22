import { readFileSync } from 'node:fs';

import { chunkDocument } from '../src/lib/ai/chunking';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/check-chunker.ts <file>');
  process.exit(1);
}

const buffer = readFileSync(file);
const text = buffer.toString('utf8');
console.log(`file: ${(buffer.length / 1024 / 1024).toFixed(1)} MB, ${text.length} chars`);

const t0 = Date.now();
try {
  const chunks = chunkDocument({ text });
  console.log(
    `OK -> ${chunks.length} chunks in ${Date.now() - t0} ms; first=${chunks[0]?.tokenCount} tokens`,
  );
} catch (error) {
  console.error('FAILED after', Date.now() - t0, 'ms');
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
