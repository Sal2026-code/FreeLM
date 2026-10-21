import { resolveVoices, speak, segmentForSpeech } from '../src/lib/media/tts';

async function main() {
  const voices = resolveVoices('en');
  console.log('voices:', JSON.stringify(voices));

  const text =
    'The source recommends a chunk size of three hundred to eight hundred tokens, with roughly fifty tokens of overlap between consecutive chunks. This range balances retrieval precision with context preservation.';

  const segments = segmentForSpeech(text);
  console.log(`segments: ${segments.length} (max ${Math.max(...segments.map((s) => s.length))} chars)`);

  const a = await speak(segments[0] ?? '', { voice: voices.hostA, language: 'en' });
  console.log(`host A (${voices.hostA}): ${a.length} bytes`);

  const b = await speak(segments[0] ?? '', {
    voice: voices.hostB,
    language: 'en',
    ...(voices.hostBSpeed !== undefined ? { speed: voices.hostBSpeed } : {}),
  });
  console.log(`host B (${voices.hostB}): ${b.length} bytes`);

  console.log(
    `voices differ: ${a.subarray(0, 200).toString('base64') !== b.subarray(0, 200).toString('base64')}`,
  );
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
