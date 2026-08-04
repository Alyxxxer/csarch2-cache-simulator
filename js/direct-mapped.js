export const MAIN_MEMORY_BLOCKS = 1024;

export const DEFAULT_TIMING = {
  cacheAccessTime: 1,
  memoryAccessTime: 10,
  countMissDetection: true,
};

export const READ_POLICIES = ['non-load-through', 'load-through'];

export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

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
    this.steps = [];
  }

  decompose(blockAddress) {
    return {
      index: blockAddress % this.numCacheBlocks,
      tag: Math.floor(blockAddress / this.numCacheBlocks),
    };
  }

  missPenalty(policy = this.readPolicy) {
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = this.timing;
    const detect = countMissDetection ? Tc : 0;

    if (policy === 'load-through') {
      return detect + Tm + Tc;
    }

    return detect + this.blockSize * Tm + Tc;
  }

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
      if (line.valid) {
        evictedBlock = line.blockAddress;
        missType = 'conflict';
      } else {
        missType = 'compulsory';
      }
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
      missType,                       
      evictedBlock,                  
      accessTimeCycles,
      cacheStateAfter: this.snapshot(),
    };
    this.steps.push(step);
    return step;
  }

  run(sequence) {
    this.reset();
    for (const blockAddress of sequence) this.access(blockAddress);
    return {
      steps: this.steps,
      stats: this.getStats(),
      finalSnapshot: this.snapshot(),
    };
  }

  snapshot() {
    return this.lines.map((line, index) => ({
      index,
      valid: line.valid,
      tag: line.tag,
      blockAddress: line.blockAddress,
      words: line.valid
        ? Array.from({ length: this.blockSize }, (_, w) => line.blockAddress * this.blockSize + w)
        : [],
      lastUsedAtAccess: line.lastUsedAtAccess,
    }));
  }

  getStats() {
    const hitRate = this.totalAccesses ? this.hits / this.totalAccesses : 0;
    const missRate = this.totalAccesses ? this.misses / this.totalAccesses : 0;
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = this.timing;
    const detect = countMissDetection ? Tc : 0;
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
      avgAccessTime: this.totalAccesses ? this.totalAccessTime / this.totalAccesses : 0,
      formulaAvgAccessTime: hitRate * Tc + missRate * this.missPenalty(),
      totalAccessTime,
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

export function formatLogLine(step) {
  const verdict = step.hit ? 'HIT ' : `MISS(${step.missType})`;
  const evicted = step.evictedBlock === null ? '-' : `blk ${step.evictedBlock}`;
  return `#${String(step.step).padStart(3)} | blk ${String(step.blockAddress).padStart(4)}` +
         ` | tag ${String(step.tag).padStart(3)} | idx ${String(step.index).padStart(3)}` +
         ` | ${verdict.padEnd(16)} | evicted: ${evicted.padEnd(9)}` +
         ` | ${step.accessTimeCycles} cycles`;
}
