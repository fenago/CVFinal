// Save one scan atomically. Blobs are prepared BEFORE the transaction (auto-commit rule).
export function saveScan(db, { name, original, result, thumb, width, height }) {
  const record = { id: crypto.randomUUID(), name, createdAt: Date.now(), original, result, thumb, width, height };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scans', 'readwrite');
    tx.objectStore('scans').add(record);
    tx.oncomplete = () => resolve(record);
    tx.onabort = () => reject(tx.error || new Error('Save aborted'));   // e.g. QuotaExceededError
    tx.onerror = () => {};                                                // let it bubble to onabort
  });
}

export function listScans(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('scans').objectStore('scans').index('createdAt').getAll();
    req.onsuccess = () => resolve(req.result.reverse());                  // newest first
    req.onerror = () => reject(req.error);
  });
}
