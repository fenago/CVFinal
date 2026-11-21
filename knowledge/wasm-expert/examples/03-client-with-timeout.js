// Main-thread client: request ids, timeouts, restart a stuck worker.
export function createScanner(url = 'scanner.worker.js', { loadTimeout = 30000, jobTimeout = 30000 } = {}) {
  let worker, nextId = 1; const pending = new Map(); let ready;
  function start() {
    worker = new Worker(url);
    ready = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('OpenCV took too long to load')), loadTimeout);
      worker.addEventListener('message', (e) => {
        if (e.data.type === 'ready') { clearTimeout(t); resolve(); }
        if (e.data.type === 'fatal') { clearTimeout(t); reject(new Error(e.data.message)); }
      });
    });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id); if (!p) return;
      if (e.data.type === 'progress') return p.onProgress?.(e.data.stage);
      clearTimeout(p.timer); pending.delete(e.data.id);
      e.data.type === 'error' ? p.reject(new Error(e.data.message)) : p.resolve(e.data);
    };
    worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message)); pending.clear(); };
  }
  function restart() { worker.terminate(); for (const p of pending.values()) p.reject(new Error('Scanner restarted')); pending.clear(); start(); }
  start();
  return {
    get ready() { return ready; },
    restart,
    async scan(bitmap, opts = {}, onProgress) {
      await ready; const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { restart(); reject(new Error('The scan took too long. The scanner was restarted.')); }, jobTimeout);
        pending.set(id, { resolve, reject, timer, onProgress });
        worker.postMessage({ type: 'scan', id, bitmap, opts }, [bitmap]);
      });
    },
  };
}
