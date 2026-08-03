
export function createStats() {
  return {totalAccesses: 0, hits: 0, misses: 0, hitRate: 0, missRate: 0, avgAccessTime: 0, totalAccessTime: 0};
}

export function updateStats(stats, step) {
  stats.totalAccesses += 1;

  if (step.hit) {
    stats.hits += 1;
  } else {
    stats.misses += 1;
  }

  stats.totalAccessTime += step.accessTimeCycles;

  stats.hitRate =
    stats.totalAccesses > 0
      ? stats.hits / stats.totalAccesses
      : 0;

  stats.missRate =
    stats.totalAccesses > 0
      ? stats.misses / stats.totalAccesses
      : 0;

  stats.avgAccessTime =
    stats.totalAccesses > 0
      ? stats.totalAccessTime / stats.totalAccesses
      : 0;

  return stats;
}

export function formatRunningLog(step, stats, mappingLabel = '') {
  const result = step.hit
    ? 'HIT'
    : `MISS(${step.missType ?? 'unknown'})`;

  const evicted =
    step.evictedBlock === null ||
    step.evictedBlock === undefined
      ? '-'
      : `blk ${step.evictedBlock}`;

  const labelPart = mappingLabel
    ? `${mappingLabel} | `
    : '';

  return (
    `#${String(step.step).padStart(3)} | ` +
    labelPart +
    `blk ${String(step.blockAddress).padStart(4)} | ` +
    `slot ${String(step.index).padStart(3)} | ` +
    `${result.padEnd(18)} | ` +
    `evicted: ${evicted.padEnd(8)} | ` +
    `${step.accessTimeCycles} cycles | ` +
    `running: accesses=${stats.totalAccesses}, ` +
    `hits=${stats.hits}, misses=${stats.misses}, ` +
    `hitRate=${(stats.hitRate * 100).toFixed(2)}%, ` +
    `missRate=${(stats.missRate * 100).toFixed(2)}%`
  );
}