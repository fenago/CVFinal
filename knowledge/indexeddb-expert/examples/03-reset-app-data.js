// "Reset app data": close our connection, delete the DB, tell the user if another tab blocks it.
export function resetAppData(db, { onBlocked = () => {} } = {}) {
  db?.close();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('docscanner');
    req.onblocked = () => onBlocked();      // fires while other tabs keep a connection open
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
