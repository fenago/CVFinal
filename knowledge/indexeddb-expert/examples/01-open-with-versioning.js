// Versioned open with an upgrade ladder, blocked handling and versionchange handling.
export const DB_NAME = 'docscanner';
export const DB_VERSION = 1;

export function openDB({ onBlocked = () => {}, onStale = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        const scans = db.createObjectStore('scans', { keyPath: 'id' });
        scans.createIndex('createdAt', 'createdAt');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      // if (e.oldVersion < 2) { req.transaction.objectStore('scans').createIndex('name', 'name'); }
    };
    req.onblocked = () => onBlocked();               // another tab holds an older version
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); onStale(); };  // a newer tab wants to upgrade
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}
