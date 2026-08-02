// ===========================================================================
// test-cases.js
// Generates the three required access sequences from the case brief.
// `n` is always the number of cache blocks (numCacheBlocks) currently
// configured in the control panel — NOT hardcoded.
//
// Owned provisionally by Person C (GUI) since Person D's version wasn't
// ready in time; swap this file out freely if Person D's lands later,
// as long as it keeps exporting the same TEST_CASES shape.
// ===========================================================================

/** (a) Sequential: 0..2n-1, then repeat the whole thing once more. */
export function generateSequential(n) {
  const single = Array.from({ length: 2 * n }, (_, i) => i);
  return [...single, ...single];
}

/** (b) Mid-repeat: 0..n-1, then (0..2n-1) x2, then reversed (2n-1..0) x2. */
export function generateMidRepeat(n) {
  const first = Array.from({ length: n }, (_, i) => i);
  const middle = Array.from({ length: 2 * n }, (_, i) => i);
  const reversed = [...middle].reverse();

  return [...first, ...middle, ...middle, ...reversed, ...reversed];
}

/** (c) Random: 64 accesses, block indices uniformly random in [0, mainMemoryBlocks). */
export function generateRandom(mainMemoryBlocks = 1024, count = 64) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * mainMemoryBlocks));
}

export const TEST_CASES = {
  sequential: {
    label: '(a) Sequential — 0..2n-1, repeated x2',
    generate: (n) => generateSequential(n),
  },
  'mid-repeat': {
    label: '(b) Mid-repeat blocks',
    generate: (n) => generateMidRepeat(n),
  },
  random: {
    label: '(c) Random — 64 accesses, 0–1023',
    generate: () => generateRandom(),
  },
};
