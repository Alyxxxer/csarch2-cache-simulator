// ===========================================================================
// fully-associative-mru.js
// CSARCH2 Case Study 1 — Machine 8 (Direct Mapped vs Fully Associative + MRU)
//
// This module implements ONLY the Fully Associative + MRU engine.
// Read policy: NON-LOAD-THROUGH
// Replacement policy: MRU (Most Recently Used)

import { MAIN_MEMORY_BLOCKS, DEFAULT_TIMING, isPowerOfTwo } from './direct-mapped.js';

export { MAIN_MEMORY_BLOCKS, DEFAULT_TIMING, isPowerOfTwo };

/**
 * Validates a config object against the case study specifications.
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
  if (readPolicy !== 'non-load-through') {
    errors.push('This build only implements the non-load-through read policy.');
  }

  return errors;
}

/**
 * Address decomposition for Fully Associative mapping.
 * In FA, there are NO index bits. Every block can go into any line.
 *   offset bits = log2(blockSize)
 *   index  bits = 0
 *   tag    bits = log2(mainMemoryBlocks)
 */
export function addressLayout(config) {
  const { blockSize, mainMemoryBlocks = MAIN_MEMORY_BLOCKS } = config;
  const addressBits = Math.log2(mainMemoryBlocks * blockSize);
  const offsetBits = Math.log2(blockSize);
  const indexBits = 0;
  return {
    addressBits,
    offsetBits,
    indexBits,
    tagBits: addressBits - offsetBits,
  };
}

export class FullyAssociativeMRUCache {
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
    this.readPolicy = 'non-load-through';
    this.mappingType = 'fully-associative-mru';
    this.timing = { ...DEFAULT_TIMING, ...(config.timing || {}) };
    this.layout = addressLayout(this);

    this.reset();
  }

  reset() {
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
    /** Tracks the index of the Most Recently Used block in the cache array */
    this.mruIndex = null;
    this.steps = [];
  }

  /** Cost of a single miss under non-load-through. */
  missPenalty() {
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = this.timing;
    return (countMissDetection ? Tc : 0) + this.blockSize * Tm + Tc;
  }

  /**
   * Performs one memory access on the given main-memory BLOCK address.
   * @param {number} blockAddress 0 .. 1023
   * @returns {object} Access Step object matching the team's shared contract
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
    
    // In Fully Associative, tag is simply the block address itself
    const tag = blockAddress; 
    let hitIndex = this.lines.findIndex((line) => line.valid && line.tag === tag);
    const hit = hitIndex !== -1;

    let evictedBlock = null;
    let missType = null;
    let accessTimeCycles;
    let targetIndex;

    if (hit) {
      this.hits += 1;
      accessTimeCycles = this.timing.cacheAccessTime;
      targetIndex = hitIndex;
    } else {
      this.misses += 1;

      // 1. Check if there's an empty line (Compulsory Miss)
      const emptyIndex = this.lines.findIndex((line) => !line.valid);

      if (emptyIndex !== -1) {
        missType = 'compulsory';
        targetIndex = emptyIndex;
      } else {
        // 2. Cache is FULL: Replace the Most Recently Used (MRU) line (Capacity Miss)
        missType = 'capacity';
        targetIndex = this.mruIndex;
        evictedBlock = this.lines[targetIndex].blockAddress;
      }

      this.lines[targetIndex].valid = true;
      this.lines[targetIndex].tag = tag;
      this.lines[targetIndex].blockAddress = blockAddress;
      this.lines[targetIndex].loadedAtAccess = this.totalAccesses;
      accessTimeCycles = this.missPenalty();
    }

    // Update state tracking & MRU marker
    this.lines[targetIndex].lastUsedAtAccess = this.totalAccesses;
    this.mruIndex = targetIndex;
    this.totalAccessTime += accessTimeCycles;

    const step = {
      step: this.totalAccesses,
      blockAddress,
      tag,
      index: targetIndex, // line where block resides in cache
      hit,
      missType,                       // null on hit, 'compulsory' or 'capacity' on miss
      evictedBlock,                   // null when nothing was evicted
      mruIndex: this.mruIndex,         // useful for Venice's visual UI indicator
      accessTimeCycles,
      cacheStateAfter: this.snapshot(),
    };

    this.steps.push(step);
    return step;
  }

  /** Runs a whole test sequence from a clean cache. */
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
      isMRU: index === this.mruIndex, // Explicit flag for frontend visualization
      words: line.valid
        ? Array.from({ length: this.blockSize }, (_, w) => line.blockAddress * this.blockSize + w)
        : [],
      lastUsedAtAccess: line.lastUsedAtAccess,
    }));
  }

  getStats() {
    const hitRate = this.totalAccesses ? this.hits / this.totalAccesses : 0;
    const missRate = this.totalAccesses ? this.misses / this.totalAccesses : 0;
    const { cacheAccessTime: Tc } = this.timing;
    return {
      totalAccesses: this.totalAccesses,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      missRate,
      avgAccessTime: this.totalAccesses ? this.totalAccessTime / this.totalAccesses : 0,
      formulaAvgAccessTime: hitRate * Tc + missRate * this.missPenalty(),
      totalAccessTime: this.totalAccessTime,
    };
  }

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

/** Formats trace log lines to mirror direct-mapped formatting */
export function formatLogLine(step) {
  const verdict = step.hit ? 'HIT ' : `MISS(${step.missType})`;
  const evicted = step.evictedBlock === null ? '-' : `blk ${step.evictedBlock}`;
  return `#${String(step.step).padStart(3)} | blk ${String(step.blockAddress).padStart(4)}` +
         ` | tag ${String(step.tag).padStart(3)} | slot ${String(step.index).padStart(3)}` +
         ` | ${verdict.padEnd(16)} | evicted: ${evicted.padEnd(9)}` +
         ` | ${step.accessTimeCycles} cycles`;
}