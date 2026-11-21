// Smart Document Scanner: main-thread client for scanner.worker.js (owner: Forge, wasm-expert).
// The page never calls cv.*; it only talks to the worker through this module.
//
//   const scanner = createScanner();
//   scanner.onStatus((s) => ...)            // 'loading' | 'ready' | 'failed' | 'restarting'
//   await scanner.ready                     // -> { version }
//   const r = await scanner.scan(bitmap, { mode: 'bw' }, (stage) => ...)  // bitmap is transferred
//   await scanner.stats()                   // -> { heapBytes, probe }
//   scanner.restart()                       // kill a stuck worker and load a fresh one

export function createScanner({
  url = 'scanner.worker.js',
  loadTimeout = 45000,   // opencv.js is ~11 MB; allow slow networks
  jobTimeout = 30000,
} = {}) {
  let worker = null;
  let ready = null;
  let nextId = 1;
  let status = 'loading';
  const pending = new Map();          // id -> { resolve, reject, timer, onProgress }
  const listeners = new Set();

  const setStatus = (s, detail) => { status = s; for (const cb of listeners) { try { cb(s, detail); } catch (_) {} } };

  function rejectAll(message) {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
    pending.clear();
  }

  function start() {
    setStatus('loading');
    worker = new Worker(url);                 // classic worker: it uses importScripts
    let settle;
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('OpenCV took too long to load. Check your connection and try again.')); }, loadTimeout);
      settle = { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } };
    });
    ready.then((v) => setStatus('ready', v), (e) => setStatus('failed', e));
    ready.catch(() => {});                    // avoid "unhandled rejection" noise; callers still see the error

    const w = worker;
    w.onmessage = (event) => {
      if (w !== worker) return;               // message from a terminated worker
      const msg = event.data || {};
      if (msg.type === 'ready') return settle.resolve({ version: msg.version });
      if (msg.type === 'fatal') { settle.reject(new Error(msg.message)); return rejectAll(msg.message); }
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') { try { p.onProgress && p.onProgress(msg.stage); } catch (_) {} return; }
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    w.onerror = (event) => {
      if (w !== worker) return;
      event.preventDefault();                 // we report it ourselves
      const message = 'The scanner stopped unexpectedly' + (event.message ? ': ' + event.message : '.');
      settle.reject(new Error(message));
      rejectAll(message);
    };
  }

  function restart() {
    setStatus('restarting');
    const old = worker;
    worker = null;                            // ignore anything the old worker still sends
    if (old) old.terminate();                 // frees its whole Wasm heap
    rejectAll('The scanner was restarted.');
    start();
    return ready;
  }

  function request(message, transfer, onProgress, timeout) {
    return ready.then(() => new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The scan took too long, so the scanner was restarted. Please try again.'));
        restart();
      }, timeout);
      pending.set(id, { resolve, reject, timer, onProgress });
      worker.postMessage({ ...message, id }, transfer);
    }));
  }

  start();

  return {
    get ready() { return ready; },
    get status() { return status; },
    onStatus(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    /** Scan an ImageBitmap. The bitmap is transferred (unusable here afterwards). */
    scan(bitmap, options = {}, onProgress) {
      return request({ type: 'scan', bitmap, options }, [bitmap], onProgress, jobTimeout);
    },
    stats() { return request({ type: 'stats' }, [], null, 10000); },
    restart,
  };
}
