
export function generateSequential(n) {
  const single = Array.from({ length: 2 * n }, (_, i) => i);
  return [...single, ...single];
}

export function generateMidRepeat(n) {
  const first = Array.from({ length: n }, (_, i) => i);
  const middle = Array.from({ length: 2 * n }, (_, i) => i);

  const reversedFirst = [...first].reverse();
  const reversedMiddle = [...middle].reverse();

  return [...first, ...middle, ...middle, ...reversedFirst, ...reversedMiddle, ...reversedMiddle];
}

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
