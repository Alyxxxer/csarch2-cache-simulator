// ===========================================================================
// test.js — run with:  node src/test.js
// Hand-traced checks for the Direct Mapped engine (non-load-through).
// Delete or fold into the real test suite.
// ===========================================================================

import { DirectMappedCache, formatLogLine } from './direct-mapped.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}

// --- The three required sequences, parameterized by n = numCacheBlocks -----
export function sequential(n) {
  const one = Array.from({ length: 2 * n }, (_, i) => i);   // 0 .. 2n-1
  return [...one, ...one];                                  // repeated twice
}

export function midRepeat(n) {
  const firstHalf = Array.from({ length: n }, (_, i) => i);       // 0 .. n-1
  const full = Array.from({ length: 2 * n }, (_, i) => i);        // 0 .. 2n-1
  const revHalf = [...firstHalf].reverse();                       // n-1 .. 0
  const revFull = [...full].reverse();                            // 2n-1 .. 0
  return [...firstHalf, ...full, ...full, ...revHalf, ...revFull, ...revFull];
}

export function randomSequence(count = 64, maxBlock = 1023) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (maxBlock + 1)));
}

// --- Configuration under test ---------------------------------------------
const config = { blockSize: 4, numCacheBlocks: 4, readPolicy: 'non-load-through' };
const cache = new DirectMappedCache(config);

console.log('Config:', JSON.stringify(cache.describe(), null, 2));
console.log('Miss penalty (cycles):', cache.missPenalty());  // 1 + 4*10 + 1 = 42

// --- Test case A: sequential ----------------------------------------------
// n = 4 -> 0..7 twice = 16 accesses. Every access maps onto a line that was
// just taken by block (b + 4), so direct mapping thrashes: 0 hits.
console.log('\n--- (a) Sequential ---');
let r = cache.run(sequential(4));
console.log(r.steps.map(formatLogLine).join('\n'));
check('sequential totalAccesses', r.stats.totalAccesses, 16);
check('sequential hits', r.stats.hits, 0);
check('sequential misses', r.stats.misses, 16);
check('sequential totalAccessTime', r.stats.totalAccessTime, 16 * 42);
check('sequential avgAccessTime', r.stats.avgAccessTime, 42);

// --- Test case B: mid-repeat ----------------------------------------------
// 4 + 8 + 8 + 4 + 8 + 8 = 40 accesses. Only the second segment's first four
// accesses (0,1,2,3) hit, because they are still resident from segment one.
console.log('\n--- (b) Mid-repeat ---');
r = cache.run(midRepeat(4));
check('mid-repeat totalAccesses', r.stats.totalAccesses, 40);
check('mid-repeat hits', r.stats.hits, 4);
check('mid-repeat misses', r.stats.misses, 36);
check('mid-repeat hitRate', r.stats.hitRate, 0.1);

// --- Test case C: random --------------------------------------------------
console.log('\n--- (c) Random 64 ---');
r = cache.run(randomSequence(64));
check('random totalAccesses', r.stats.totalAccesses, 64);
check('random hits+misses', r.stats.hits + r.stats.misses, 64);
console.log('random hitRate:', r.stats.hitRate.toFixed(4));
console.log('final snapshot:', JSON.stringify(r.finalSnapshot, null, 2));

// --- Sanity: a sequence that MUST hit -------------------------------------
r = cache.run([5, 5, 5, 5]);
check('repeat-same-block hits', r.stats.hits, 3);
check('repeat-same-block misses', r.stats.misses, 1);
check('repeat-same-block totalAccessTime', r.stats.totalAccessTime, 42 + 3 * 1);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
