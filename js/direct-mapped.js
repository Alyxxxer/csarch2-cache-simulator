// ===========================================================================
// direct-mapped.js
// CSARCH2 Case Study 1 — Machine 8 (Direct Mapped vs Fully Associative + MRU)
//
// This module implements ONLY the Direct Mapped engine.
// Read policy: parameterized — 'non-load-through' OR 'load-through'.
//
// Public API (everything the GUI / stats / logging modules need):
//   isPowerOfTwo(n)
//   validateConfig(config)        -> string[] of error messages ([] = valid)
//   addressLayout(config)         -> { addressBits, tagBits, indexBits, offsetBits }
//   DirectMappedCache             -> class: .access(), .run(), .snapshot(),
//                                          .getStats(), .reset()
//   formatLogLine(step)           -> one human-readable trace line
// ===========================================================================

/** Main memory is fixed at 1024 blocks by the case study spec. */
export const MAIN_MEMORY_BLOCKS = 1024;

/**
 * Timing model (in cycles/ns). These match the worked example from lecture
 * (cacheAccessTime = 1ns, memoryAccessTime = 10ns/word) — confirm against
 * your own instructor's numbers if they differ, and document in the README.
 *
 *   cacheAccessTime (Tc) : time to read/write one word in the cache
 *   memoryAccessTime (Tm): time to read one word from main memory
 *   countMissDetection   : whether the initial failed tag check costs 1 Tc
 *
 * NON-LOAD-THROUGH:
 *   Hit  time = Tc
 *   Miss time = Tc (miss detection) + blockSize * Tm (load whole block) + Tc (read word from cache)
 *   Checked against the lecture example: blockSize=2, Tc=1, Tm=10
 *     -> 1 + 2*10 + 1 = 22ns. Matches.
 *
 * LOAD-THROUGH:
 *   Hit  time = Tc (same as non-load-through — a hit never touches main memory)
 *   Miss time = Tc (miss detection) + Tm (fetch just the requested word) + Tc (forward word to CPU)
 *   The remaining (blockSize - 1) words keep loading into the cache in the
 *   background afterward, but that does NOT block the CPU, so it is left out
 *   of the miss penalty on purpose — that's the entire benefit of the policy.
 */
export const DEFAULT_TIMING = {
  cacheAccessTime: 1,
  memoryAccessTime: 10,
  countMissDetection: true,
};

export const READ_POLICIES = ['non-load-through', 'load-through'];

/** A cache size / block size must be a power of two. */
export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Validates a config object against the case study specifications.
 * @returns {string[]} list of problems; empty array means the config is valid.
 */
export function validateConfig(config = {}) {
  const {
    blockSize,
    numCacheBlocks,
    mainMemoryBlocks = MAIN_MEMORY_BLOCKS,
    readPolicy = 'non-load-through',
  } = config;

  const errors = [];

  if (!isPowerOfTwo(blockSize) || blockSize < 2) {
    errors.push('blockSize must be a power of 2 and at least 2 words.');
  }
  if (!isPowerOfTwo(numCacheBlocks) || numCacheBlocks < 4) {
    errors.push('numCacheBlocks must be a power of 2 and at least 4 blocks.');
  }
  if (mainMemoryBlocks !== MAIN_MEMORY_BLOCKS) {
    errors.push(`mainMemoryBlocks must be ${MAIN_MEMORY_BLOCKS} (fixed by the spec).`);
  }
  if (isPowerOfTwo(numCacheBlocks) && numCacheBlocks > mainMemoryBlocks) {
    errors.push('numCacheBlocks cannot exceed the number of main memory blocks.');
  }
  if (!READ_POLICIES.includes(readPolicy)) {
    errors.push(`readPolicy must be one of: ${READ_POLICIES.join(', ')}.`);
  }

  return errors;
}

/**
 * Address decomposition for direct mapping.
 * Byte/word address space = mainMemoryBlocks * blockSize words.
 *   offset bits = log2(blockSize)
 *   index  bits = log2(numCacheBlocks)
 *   tag    bits = the rest
 */
export function addressLayout(config) {
  const { blockSize, numCacheBlocks, mainMemoryBlocks = MAIN_MEMORY_BLOCKS } = config;
  const addressBits = Math.log2(mainMemoryBlocks * blockSize);
  const offsetBits = Math.log2(blockSize);
  const indexBits = Math.log2(numCacheBlocks);
  return {
    addressBits,
    offsetBits,
    indexBits,
    tagBits: addressBits - offsetBits - indexBits,
  };
}

export class DirectMappedCache {
  /**
   * @param {{blockSize:number, numCacheBlocks:number, mainMemoryBlocks?:number,
   *          readPolicy?:string, timing?:object}} config
   */
  constructor(config) {
    const errors = validateConfig(config);
    if (errors.length) {
      throw new Error('Invalid cache configuration:\n- ' + errors.join('\n- '));
    }

    this.blockSize = config.blockSize;
    this.numCacheBlocks = config.numCacheBlocks;
    this.mainMemoryBlocks = config.mainMemoryBlocks ?? MAIN_MEMORY_BLOCKS;
    this.readPolicy = config.readPolicy ?? 'non-load-through';
    this.mappingType = 'direct';
    this.timing = { ...DEFAULT_TIMING, ...(config.timing || {}) };
    this.layout = addressLayout(this);

    this.reset();
  }

  /** Clears the cache and all counters. Call between test cases. */
  reset() {
    // One entry per cache block. blockAddress is kept for display/logging.
    this.lines = Array.from({ length: this.numCacheBlocks }, () => ({
      valid: false,
      tag: null,
      blockAddress: null,
      loadedAtAccess: null,
      lastUsedAtAccess: null,
    }));

    this.totalAccesses = 0;
    this.hits = 0;
    this.misses = 0;
    this.totalAccessTime = 0;
    this.steps = [];
  }

  /** Direct mapping: index = block mod n, tag = floor(block / n). */
  decompose(blockAddress) {
    return {
      index: blockAddress % this.numCacheBlocks,
      tag: Math.floor(blockAddress / this.numCacheBlocks),
    };
  }

  /** Cost of a single miss — formula depends on the given/instance readPolicy. */
  missPenalty(policy = this.readPolicy) {
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = this.timing;
    const detect = countMissDetection ? Tc : 0;

    if (policy === 'load-through') {
      // CPU waits for miss detection + the ONE requested word, then the word
      // is forwarded straight to the CPU. The other (blockSize-1) words keep
      // streaming into the cache line afterward, off the CPU's critical path.
      // (blockSize must NOT multiply Tm here — that would erase the entire
      // benefit of load-through over non-load-through.)
      return detect + Tm + Tc;
    }

    // non-load-through: CPU waits for the WHOLE block to land in the cache,
    // then reads its word out of the cache at normal cache speed.
    return detect + this.blockSize * Tm + Tc;
  }

  /**
   * Performs one memory access on the given main-memory BLOCK address.
   * @param {number} blockAddress 0 .. 1023
   * @returns {object} Access Step object (matches the team's shared contract)
   */
  access(blockAddress) {
    if (!Number.isInteger(blockAddress) ||
        blockAddress < 0 ||
        blockAddress >= this.mainMemoryBlocks) {
      throw new RangeError(
        `blockAddress must be an integer in [0, ${this.mainMemoryBlocks - 1}], got ${blockAddress}`
      );
    }

    this.totalAccesses += 1;
    const { index, tag } = this.decompose(blockAddress);
    const line = this.lines[index];

    const hit = line.valid && line.tag === tag;
    let evictedBlock = null;
    let missType = null;
    let accessTimeCycles;

    if (hit) {
      this.hits += 1;
      accessTimeCycles = this.timing.cacheAccessTime;
      line.lastUsedAtAccess = this.totalAccesses;
    } else {
      this.misses += 1;
      // compulsory = the line was empty; conflict = a different block was thrown out
      if (line.valid) {
        evictedBlock = line.blockAddress;
        missType = 'conflict';
      } else {
        missType = 'compulsory';
      }
      // Cache line ends up holding the full block either way — read policy
      // only changes HOW LONG the CPU waits (see missPenalty()), not what
      // ends up stored in the line.
      line.valid = true;
      line.tag = tag;
      line.blockAddress = blockAddress;
      line.loadedAtAccess = this.totalAccesses;
      line.lastUsedAtAccess = this.totalAccesses;
      accessTimeCycles = this.missPenalty();
    }

    this.totalAccessTime += accessTimeCycles;

    const step = {
      step: this.totalAccesses,
      blockAddress,
      tag,
      index,
      hit,
      missType,                       // null on a hit
      evictedBlock,                   // null when nothing was evicted
      accessTimeCycles,
      cacheStateAfter: this.snapshot(),
    };
    this.steps.push(step);
    return step;
  }

  /**
   * Runs a whole test sequence from a clean cache.
   * @param {number[]} sequence list of block addresses
   * @returns {{steps: object[], stats: object, finalSnapshot: object[]}}
   */
  run(sequence) {
    this.reset();
    for (const blockAddress of sequence) this.access(blockAddress);
    return {
      steps: this.steps,
      stats: this.getStats(),
      finalSnapshot: this.snapshot(),
    };
  }

  /** Visual snapshot of cache memory state — one row per cache block. */
  snapshot() {
    return this.lines.map((line, index) => ({
      index,
      valid: line.valid,
      tag: line.tag,
      blockAddress: line.blockAddress,
      // Word addresses currently held, handy for the GUI's "data" column.
      words: line.valid
        ? Array.from({ length: this.blockSize }, (_, w) => line.blockAddress * this.blockSize + w)
        : [],
      lastUsedAtAccess: line.lastUsedAtAccess,
    }));
  }

  /** The 7 required statistics. */
  getStats() {
    const hitRate = this.totalAccesses ? this.hits / this.totalAccesses : 0;
    const missRate = this.totalAccesses ? this.misses / this.totalAccesses : 0;
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = this.timing;
    const detect = countMissDetection ? Tc : 0;

    // "Total Access Time" per the course's own convention — confirmed
    // against three worked examples (Direct Mapped 213ns, FA+MRU 192ns,
    // Block-Set-Assoc 171ns, all non-load-through): it charges hits and
    // misses at WORD granularity, not block granularity. This is a
    // DIFFERENT accounting than AMAT below — the two stats are defined
    // independently in the course material, and total is NOT expected to
    // equal avg * count (verified: 16.75ns * 12 = 201, but the slide's own
    // total is 213ns — the two formulas simply don't reconcile, by design
    // or by a slide inconsistency we can't resolve without the instructor).
    //   Non-load-through: H*blockSize*Tc + M*(blockSize*(Tm+Tc) + detect)
    //   Load-through: no word-scaled worked example was given for this
    //   policy, so misses use the unscaled missPenalty() (only the ONE
    //   requested word sits on the CPU's critical path either way) —
    //   flag this assumption to your instructor if it matters for grading.
    const totalAccessTime =
      this.readPolicy === 'load-through'
        ? this.hits * this.blockSize * Tc + this.misses * this.missPenalty()
        : this.hits * this.blockSize * Tc + this.misses * (this.blockSize * (Tm + Tc) + detect);

    return {
      totalAccesses: this.totalAccesses,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      missRate,
      // Measured average (total simulated time / accesses). Equivalent to the
      // textbook formula: h*Tc + (1-h)*missPenalty
      avgAccessTime: this.totalAccesses ? this.totalAccessTime / this.totalAccesses : 0,
      formulaAvgAccessTime: hitRate * Tc + missRate * this.missPenalty(),
      totalAccessTime,
    };
  }

  /** Everything the README needs to describe this run. */
  describe() {
    return {
      mappingType: this.mappingType,
      readPolicy: this.readPolicy,
      blockSize: this.blockSize,
      numCacheBlocks: this.numCacheBlocks,
      mainMemoryBlocks: this.mainMemoryBlocks,
      timing: this.timing,
      addressLayout: this.layout,
      missPenalty: this.missPenalty(),
    };
  }
}

/** One line of the required text trace log. */
export function formatLogLine(step) {
  const verdict = step.hit ? 'HIT ' : `MISS(${step.missType})`;
  const evicted = step.evictedBlock === null ? '-' : `blk ${step.evictedBlock}`;
  return `#${String(step.step).padStart(3)} | blk ${String(step.blockAddress).padStart(4)}` +
         ` | tag ${String(step.tag).padStart(3)} | idx ${String(step.index).padStart(3)}` +
         ` | ${verdict.padEnd(16)} | evicted: ${evicted.padEnd(9)}` +
         ` | ${step.accessTimeCycles} cycles`;
}
