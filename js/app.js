import { DirectMappedCache, validateConfig as validateDirect, formatLogLine as formatDirectLog }
  from './direct-mapped.js';
import { FullyAssociativeMRUCache, validateConfig as validateFA, formatLogLine as formatFALog }
  from './fully-associative-mru.js';
import { TEST_CASES } from './test-cases.js';

function instantiateEngine(EngineClass, validateFn, config) {
  if (validateFn(config).length === 0) {
    return new EngineClass(config); // engine natively supports this config as-is
  }

  const engine = new EngineClass({ ...config, readPolicy: 'non-load-through' });
  if (config.readPolicy === 'load-through') {
    engine.readPolicy = 'load-through';
    const { cacheAccessTime: Tc, memoryAccessTime: Tm, countMissDetection } = engine.timing;
    engine.missPenalty = () => (countMissDetection ? Tc : 0) + Tm + Tc;
  }
  return engine;
}

function validateIgnoringReadPolicyLock(config) {
  const neutralConfig = { ...config, readPolicy: 'non-load-through' };
  return [...new Set([...validateDirect(neutralConfig), ...validateFA(neutralConfig)])];
}

const els = {
  blockSize: document.getElementById('blockSize'),
  numBlocks: document.getElementById('numBlocks'),
  readPolicy: document.getElementById('readPolicy'),
  testCase: document.getElementById('testCase'),
  viewMode: document.getElementById('viewMode'),
  runBtn: document.getElementById('runBtn'),
  stepBtn: document.getElementById('stepBtn'),
  playBtn: document.getElementById('playBtn'),
  resetBtn: document.getElementById('resetBtn'),
  progress: document.getElementById('progressLabel'),
  busAddress: document.getElementById('busAddress'),
  errorBanner: document.getElementById('errorBanner'),

  directGrid: document.getElementById('directGrid'),
  directLog: document.getElementById('directLog'),
  directStats: document.getElementById('directStats'),

  faGrid: document.getElementById('faGrid'),
  faLog: document.getElementById('faLog'),
  faStats: document.getElementById('faStats'),
};

let direct = null;    // DirectMappedCache instance
let fa = null;    // FullyAssociativeMRUCache instance
let sequence = [];
let cursor = -1;    // -1 = nothing stepped yet
let playTimer = null;

function readConfig() {
  return {
    blockSize: parseInt(els.blockSize.value, 10),
    numCacheBlocks: parseInt(els.numBlocks.value, 10),
    mainMemoryBlocks: 1024,
    readPolicy: els.readPolicy.value, 
  };
}

function showErrors(errors) {
  if (!errors.length) {
    els.errorBanner.hidden = true;
    els.errorBanner.textContent = '';
    return false;
  }
  els.errorBanner.hidden = false;
  els.errorBanner.textContent = errors.join('  ·  ');
  return true;
}

function renderGrid(container, snapshot, { highlightIndex = null, event = null, markerMode }) {
  container.innerHTML = '';

  let mostRecentIndex = null;
  if (markerMode === 'direct') {
    mostRecentIndex = snapshot.reduce((best, line, i) => {
      if (!line.valid) return best;
      if (best === null || line.lastUsedAtAccess > snapshot[best].lastUsedAtAccess) return i;
      return best;
    }, null);
  }

  snapshot.forEach((line, i) => {
    const cell = document.createElement('div');
    cell.className = 'mem-cell' + (line.valid ? ' valid' : '');
    if (i === highlightIndex) {
      cell.classList.add(event === 'hit' ? 'flash-hit' : 'flash-miss');
    }

    const marker =
      markerMode === 'fa'
        ? line.isMRU && line.valid
          ? '<span class="badge badge-mru">MRU · next evict</span>'
          : ''
        : i === mostRecentIndex
        ? '<span class="badge badge-rec">recently used</span>'
        : '';

    cell.innerHTML = `
      <div class="mem-cell-idx">${markerMode === 'fa' ? 'slot' : 'line'} ${i} ${marker}</div>
      <div class="mem-cell-row"><span>V</span><span>${line.valid ? 1 : 0}</span></div>
      <div class="mem-cell-row"><span>TAG</span><span>${line.tag ?? '—'}</span></div>
      <div class="mem-cell-row"><span>DATA</span><span>${line.blockAddress ?? '—'}</span></div>
    `;
    container.appendChild(cell);
  });
}

function renderStats(container, stats) {
  container.innerHTML = `
    <div class="stat"><span>Total accesses</span><b>${stats.totalAccesses}</b></div>
    <div class="stat"><span>Hits</span><b class="ok">${stats.hits}</b></div>
    <div class="stat"><span>Misses</span><b class="bad">${stats.misses}</b></div>
    <div class="stat"><span>Hit rate</span><b class="ok">${(stats.hitRate * 100).toFixed(2)}%</b></div>
    <div class="stat"><span>Miss rate</span><b class="bad">${(stats.missRate * 100).toFixed(2)}%</b></div>
    <div class="stat"><span>Avg. access time</span><b>${stats.avgAccessTime.toFixed(2)} cyc</b></div>
    <div class="stat"><span>Total access time</span><b>${stats.totalAccessTime} cyc</b></div>
  `;
}

function logHeader(config, mappingLabel) {
  return `--- ${mappingLabel} | ${config.readPolicy} | blockSize=${config.blockSize} | numCacheBlocks=${config.numCacheBlocks} ---\n`;
}

function runSequence() {
  stopPlaying();
  const config = readConfig();

  const errors = validateIgnoringReadPolicyLock(config);
  if (showErrors(errors)) return;

  direct = instantiateEngine(DirectMappedCache, validateDirect, config);
  fa = instantiateEngine(FullyAssociativeMRUCache, validateFA, config);

  const n = config.numCacheBlocks;
  sequence = TEST_CASES[els.testCase.value].generate(n);
  cursor = -1;

  els.directLog.textContent = logHeader(config, 'Direct Mapped');
  els.faLog.textContent = logHeader(config, 'Fully Associative + MRU');
  els.directGrid.innerHTML = '';
  els.faGrid.innerHTML = '';
  els.directStats.innerHTML = '';
  els.faStats.innerHTML = '';
  els.progress.textContent = `0 / ${sequence.length}`;
  els.busAddress.textContent = '—';

  if (els.viewMode.value === 'final') {
    const directResult = direct.run(sequence);
    const faResult = fa.run(sequence);

    renderGrid(els.directGrid, directResult.finalSnapshot, { markerMode: 'direct' });
    renderGrid(els.faGrid, faResult.finalSnapshot, { markerMode: 'fa' });

    directResult.steps.forEach((s) => (els.directLog.textContent += formatDirectLog(s) + '\n'));
    faResult.steps.forEach((s) => (els.faLog.textContent += formatFALog(s) + '\n'));

    renderStats(els.directStats, directResult.stats);
    renderStats(els.faStats, faResult.stats);

    els.progress.textContent = `${sequence.length} / ${sequence.length} (final snapshot)`;
  }
}

function stepForward() {
  if (els.viewMode.value === 'final') return; // nothing to step through
  if (!direct || !fa) return;
  if (cursor >= sequence.length - 1) {
    stopPlaying();
    return;
  }
  cursor += 1;
  const blockAddress = sequence[cursor];
  els.busAddress.textContent = blockAddress;

  const dStep = direct.access(blockAddress);
  const fStep = fa.access(blockAddress);

  renderGrid(els.directGrid, dStep.cacheStateAfter, {
    highlightIndex: dStep.index,
    event: dStep.hit ? 'hit' : 'miss',
    markerMode: 'direct',
  });
  renderGrid(els.faGrid, fStep.cacheStateAfter, {
    highlightIndex: fStep.index,
    event: fStep.hit ? 'hit' : 'miss',
    markerMode: 'fa',
  });

  els.directLog.textContent += formatDirectLog(dStep) + '\n';
  els.faLog.textContent += formatFALog(fStep) + '\n';
  els.directLog.scrollTop = els.directLog.scrollHeight;
  els.faLog.scrollTop = els.faLog.scrollHeight;

  renderStats(els.directStats, direct.getStats());
  renderStats(els.faStats, fa.getStats());

  els.progress.textContent = `${cursor + 1} / ${sequence.length}`;
}

function togglePlay() {
  if (playTimer) {
    stopPlaying();
    return;
  }
  els.playBtn.textContent = '⏸ Pause';
  playTimer = setInterval(() => {
    if (cursor >= sequence.length - 1) {
      stopPlaying();
      return;
    }
    stepForward();
  }, 350);
}

function stopPlaying() {
  clearInterval(playTimer);
  playTimer = null;
  els.playBtn.textContent = '▶ Play';
}

function resetAll() {
  stopPlaying();
  direct = null;
  fa = null;
  sequence = [];
  cursor = -1;
  els.directGrid.innerHTML = '';
  els.faGrid.innerHTML = '';
  els.directLog.textContent = '';
  els.faLog.textContent = '';
  els.directStats.innerHTML = '';
  els.faStats.innerHTML = '';
  els.progress.textContent = '0 / 0';
  els.busAddress.textContent = '—';
  showErrors([]);
}

els.runBtn.addEventListener('click', runSequence);
els.stepBtn.addEventListener('click', stepForward);
els.playBtn.addEventListener('click', togglePlay);
els.resetBtn.addEventListener('click', resetAll);
els.viewMode.addEventListener('change', () => {
  const disabled = els.viewMode.value === 'final';
  els.stepBtn.disabled = disabled;
  els.playBtn.disabled = disabled;
});

resetAll();
