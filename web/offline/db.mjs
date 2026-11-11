export const OFFLINE_STORES = Object.freeze(['entities', 'outbox', 'conflicts', 'meta']);

export function entityKey(scope, id) {
  if (typeof scope !== 'string' || !scope || typeof id !== 'string' || !id) {
    throw new TypeError('Offline records require an explicit scope and identity');
  }
  return JSON.stringify([scope, id]);
}

export function offlineValue(entity) {
  const value = entity?.dirty ? entity.local : entity?.server;
  if (entity?.entity_id?.startsWith('todo:') && value && [0, 1].includes(value.completed)) {
    return {...value, completed: value.completed === 1};
  }
  return value;
}

// Credentials are supplied by the live transport, never copied into storage.
export function assertOfflineData(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Offline storage accepts plain data only');
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:authorization|cookie|headers|csrf[_-]?token|access[_-]?token|token|password|__proto__|constructor|prototype)$/i.test(key)) {
      throw new TypeError('Credentials cannot be persisted in the offline database');
    }
    assertOfflineData(child);
  }
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionAPI(transaction, schedule) {
  const store = name => transaction.objectStore(name);
  return {
    get: (name, key) => schedule(() => store(name).get(key)),
    getAll: name => schedule(() => store(name).getAll()),
    put(name, value) {
      assertOfflineData(value);
      if (typeof value.key !== 'string') throw new TypeError('Offline record key is required');
      return schedule(() => store(name).put(value));
    },
    delete: (name, key) => schedule(() => store(name).delete(key)),
  };
}

function keepTransactionAlive(transaction, name) {
  let stopped = false, finished = false;
  const queue = [];
  const schedule = operation => new Promise((resolve, reject) => { queue.push({operation, resolve, reject}); });
  function pulse() {
    if (stopped) return;
    const request = transaction.objectStore(name).count();
    request.onsuccess = () => {
      if (stopped) return;
      for (const task of queue.splice(0)) {
        try { idbRequest(task.operation()).then(task.resolve, task.reject); }
        catch (error) { task.reject(error); }
      }
      if (!finished || queue.length) pulse();
    };
  }
  pulse();
  return {schedule, finish: () => { finished = true; }, stop: () => {
    stopped = true;
    for (const task of queue.splice(0)) task.reject(new Error('Offline transaction ended'));
  }};
}

function idbTransaction(database, names, mode, callback) {
  return new Promise((resolve, reject) => {
    let tx, result, finished = false;
    try { tx = database.transaction(names, mode, {durability: 'strict'}); }
    catch { tx = database.transaction(names, mode); }
    const keeper = keepTransactionAlive(tx, names[0]);
    const timer = setTimeout(() => { keeper.stop(); try { tx.abort(); } catch {} }, 10000);
    const done = () => { keeper.stop(); clearTimeout(timer); };
    tx.oncomplete = () => { done(); finished ? resolve(result) : reject(new Error('Offline transaction became inactive')); };
    tx.onabort = () => { done(); reject(tx.error || new Error('Offline transaction aborted')); };
    tx.onerror = () => {};
    // Schedule requests in active IDB events, including after an async task gap.
    // Keep network calls outside this bounded transaction.
    Promise.resolve().then(() => callback(transactionAPI(tx, keeper.schedule))).then(value => {
      result = value;
      finished = true;
      keeper.finish();
    }).catch(error => {
      done();
      try { tx.abort(); } catch {}
      reject(error);
    });
  });
}

export function openOfflineDB({indexedDB = globalThis.indexedDB, name = 'haoduoyu-offline'} = {}) {
  if (!indexedDB) return Promise.reject(new Error('IndexedDB is unavailable; changes have not been saved'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, {keyPath: 'key'});
        }
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close the other tab before upgrading offline storage')); };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve({transaction: (names, mode, callback) => idbTransaction(database, names, mode, callback),
        close: () => database.close()});
    };
  });
}

// Explicit deterministic test adapter. It is never an automatic durability fallback.
export function createMemoryDB() {
  let tables = Object.fromEntries(OFFLINE_STORES.map(name => [name, new Map()]));
  let tail = Promise.resolve();
  function transaction(names, mode, callback) {
    const work = tail.then(async () => {
      const next = structuredClone(tables);
      const table = name => {
        if (!names.includes(name) || !next[name]) throw new Error('Store outside transaction');
        return next[name];
      };
      const api = {
        get: async (name, key) => structuredClone(table(name).get(key)),
        getAll: async name => structuredClone([...table(name).values()]),
        put: async (name, value) => {
          if (mode !== 'readwrite') throw new Error('Readonly transaction');
          assertOfflineData(value);
          if (typeof value.key !== 'string') throw new TypeError('Offline record key is required');
          table(name).set(value.key, structuredClone(value));
        },
        delete: async (name, key) => {
          if (mode !== 'readwrite') throw new Error('Readonly transaction');
          table(name).delete(key);
        },
      };
      const result = await callback(api);
      if (mode === 'readwrite') tables = next;
      return result;
    });
    tail = work.catch(() => {});
    return work;
  }
  return {transaction, close() {}};
}
