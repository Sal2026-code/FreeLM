import { chunkDocument, splitSentences } from '../src/lib/ai/chunking';

const block = 'Retrieval augmented generation grounds every answer in a cited passage. ';
const big = block.repeat(1_000_000); // ~60 MB, no line breaks
const t0 = Date.now();
const chunks = chunkDocument({ text: big });
console.log('60MB single-paragraph ->', chunks.length, 'chunks in', Date.now() - t0, 'ms');
console.log('first chunk tokens:', chunks[0]?.tokenCount, 'last index:', chunks[chunks.length - 1]?.chunkIndex);
console.log('sentences split ok:', splitSentences('One. Two! Three? Four.').length);
