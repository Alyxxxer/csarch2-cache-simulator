// ===========================================================================
// test.js — run with:  node src/test.js
// Hand-traced checks for BOTH engines under BOTH read policies.
// ===========================================================================

import { DirectMappedCache, formatLogLine } from './direct-mapped.js';
import { FullyAssociativeMRUCache } from './fully-associative-mru.js';

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
  const firstHalf = Array.from({ length: n }, (_, i) => i);
  const full = Array.from({ length: 2 * n }, (_, i) => i);
  const revHalf = [...firstHalf].reverse();
  const revFull = [...full].reverse();
  return [...firstHalf, ...full, ...full, ...revHalf, ...revFull, ...revFull];
}

export function randomSequence(count = 64, maxBlock = 1023) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (maxBlock + 1)));
}

const base = { blockSize: 4, numCacheBlocks: 4 };
const NLT = { ...base, readPolicy: 'non-load-through' };
const LT  = { ...base, readPolicy: 'load-through' };

// ===========================================================================
// 1. Miss penalties differ by policy; hit/miss COUNTS must not.
// ===========================================================================
console.log('--- Miss penalties (blockSize=4, Tc=1, Tm=10) ---');
const dmNLT = new DirectMappedCache(NLT);
const dmLT  = new DirectMappedCache(LT);
check('DM non-load-through penalty', dmNLT.missPenalty(), 1 + 4 * 10 + 1); // 42
check('DM load-through penalty',     dmLT.missPenalty(),  1 + 4 * 10);     // 41

const dmLTfirst = new DirectMappedCache({ ...LT, timing: { loadThroughModel: 'first-word' } });
check('DM load-through (first-word)', dmLTfirst.missPenalty(), 1 + 10);    // 11

const faNLT = new FullyAssociativeMRUCache(NLT);
const faLT  = new FullyAssociativeMRUCache(LT);
check('FA non-load-through penalty', faNLT.missPenalty(), 42);
check('FA load-through penalty',     faLT.missPenalty(),  41);

// ===========================================================================
// 2. Direct Mapped — sequential (n=4): pure thrashing, 0 hits either policy.
// ===========================================================================
console.log('\n--- (a) Sequential, Direct Mapped ---');
let a = dmNLT.run(sequential(4));
let b = dmLT.run(sequential(4));
console.log(a.steps.map(formatLogLine).join('\n'));
check('DM seq hits (NLT)', a.stats.hits, 0);
check('DM seq hits (LT)',  b.stats.hits, 0);
check('DM seq totalTime (NLT)', a.stats.totalAccessTime, 16 * 42);
check('DM seq totalTime (LT)',  b.stats.totalAccessTime, 16 * 41);

// ===========================================================================
// 3. Direct Mapped — mid-repeat.
// ===========================================================================
console.log('\n--- (b) Mid-repeat, Direct Mapped ---');
a = dmNLT.run(midRepeat(4));
b = dmLT.run(midRepeat(4));
check('DM mid totalAccesses', a.stats.totalAccesses, 40);
check('DM mid hits (NLT)', a.stats.hits, 4);
check('DM mid hits (LT)',  b.stats.hits, 4);
check('DM mid totalTime (NLT)', a.stats.totalAccessTime, 4 * 1 + 36 * 42);
check('DM mid totalTime (LT)',  b.stats.totalAccessTime, 4 * 1 + 36 * 41);

// ===========================================================================
// 4. FA+MRU on the same sequences — counts must match across policies too.
// ===========================================================================
console.log('\n--- FA + MRU ---');
const faSeqN = faNLT.run(sequential(4));
const faSeqL = faLT.run(sequential(4));
check('FA seq hits identical across policies', faSeqN.stats.hits, faSeqL.stats.hits);
check('FA seq timing gap = misses * 1',
  faSeqN.stats.totalAccessTime - faSeqL.stats.totalAccessTime, faSeqN.stats.misses);
console.log('FA seq hits:', faSeqN.stats.hits, '| DM seq hits: 0');

const faMidN = faNLT.run(midRepeat(4));
check('FA mid totalAccesses', faMidN.stats.totalAccesses, 40);
console.log('FA mid hits:', faMidN.stats.hits, '| DM mid hits: 4');

// ===========================================================================
// 5. Same random sequence, all four combinations (for the README table).
// ===========================================================================
console.log('\n--- (c) Random 64, all 4 combinations ---');
const seq = randomSequence(64);
const rows = [
  ['Direct Mapped', 'non-load-through', dmNLT.run(seq).stats],
  ['Direct Mapped', 'load-through',     dmLT.run(seq).stats],
  ['FA + MRU',      'non-load-through', faNLT.run(seq).stats],
  ['FA + MRU',      'load-through',     faLT.run(seq).stats],
];
for (const [m, p, s] of rows) {
  console.log(
    `${m.padEnd(14)} | ${p.padEnd(17)} | hits ${String(s.hits).padStart(2)}` +
    ` | hitRate ${s.hitRate.toFixed(4)} | AMAT ${s.avgAccessTime.toFixed(2)}` +
    ` | total ${s.totalAccessTime}`
  );
}
check('random: DM hit counts equal across policies', rows[0][2].hits, rows[1][2].hits);
check('random: FA hit counts equal across policies', rows[2][2].hits, rows[3][2].hits);

// ===========================================================================
// 6. Sanity + config validation.
// ===========================================================================
a = dmNLT.run([5, 5, 5, 5]);
check('repeat-same-block hits', a.stats.hits, 3);
check('repeat-same-block totalTime (NLT)', a.stats.totalAccessTime, 42 + 3 * 1);

let threw = false;
try { new DirectMappedCache({ ...base, readPolicy: 'write-back' }); } catch { threw = true; }
check('invalid readPolicy rejected', threw, true);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
