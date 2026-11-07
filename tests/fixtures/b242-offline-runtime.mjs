// web/offline/db.mjs
var OFFLINE_STORES = Object.freeze(["entities", "outbox", "conflicts", "meta"]);
function entityKey(scope, id) {
  if (typeof scope !== "string" || !scope || typeof id !== "string" || !id) {
    throw new TypeError("Offline records require an explicit scope and identity");
  }
  return JSON.stringify([scope, id]);
}
function offlineValue(entity) {
  const value = entity?.dirty ? entity.local : entity?.server;
  if (entity?.entity_id?.startsWith("todo:") && value && [0, 1].includes(value.completed)) {
    return { ...value, completed: value.completed === 1 };
  }
  return value;
}
function assertOfflineData(value) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Offline storage accepts plain data only");
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:authorization|cookie|headers|csrf[_-]?token|access[_-]?token|token|password|__proto__|constructor|prototype)$/i.test(key)) {
      throw new TypeError("Credentials cannot be persisted in the offline database");
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
  const store = (name) => transaction.objectStore(name);
  return {
    get: (name, key) => schedule(() => store(name).get(key)),
    getAll: (name) => schedule(() => store(name).getAll()),
    put(name, value) {
      assertOfflineData(value);
      if (typeof value.key !== "string") throw new TypeError("Offline record key is required");
      return schedule(() => store(name).put(value));
    },
    delete: (name, key) => schedule(() => store(name).delete(key))
  };
}
function keepTransactionAlive(transaction, name) {
  let stopped = false, finished = false;
  const queue = [];
  const schedule = (operation2) => new Promise((resolve, reject) => {
    queue.push({ operation: operation2, resolve, reject });
  });
  function pulse() {
    if (stopped) return;
    const request = transaction.objectStore(name).count();
    request.onsuccess = () => {
      if (stopped) return;
      for (const task of queue.splice(0)) {
        try {
          idbRequest(task.operation()).then(task.resolve, task.reject);
        } catch (error) {
          task.reject(error);
        }
      }
      if (!finished || queue.length) pulse();
    };
  }
  pulse();
  return { schedule, finish: () => {
    finished = true;
  }, stop: () => {
    stopped = true;
    for (const task of queue.splice(0)) task.reject(new Error("Offline transaction ended"));
  } };
}
function idbTransaction(database, names, mode, callback) {
  return new Promise((resolve, reject) => {
    let tx, result, finished = false;
    try {
      tx = database.transaction(names, mode, { durability: "strict" });
    } catch {
      tx = database.transaction(names, mode);
    }
    const keeper = keepTransactionAlive(tx, names[0]);
    const timer = setTimeout(() => {
      keeper.stop();
      try {
        tx.abort();
      } catch {
      }
    }, 1e4);
    const done = () => {
      keeper.stop();
      clearTimeout(timer);
    };
    tx.oncomplete = () => {
      done();
      finished ? resolve(result) : reject(new Error("Offline transaction became inactive"));
    };
    tx.onabort = () => {
      done();
      reject(tx.error || new Error("Offline transaction aborted"));
    };
    tx.onerror = () => {
    };
    Promise.resolve().then(() => callback(transactionAPI(tx, keeper.schedule))).then((value) => {
      result = value;
      finished = true;
      keeper.finish();
    }).catch((error) => {
      done();
      try {
        tx.abort();
      } catch {
      }
      reject(error);
    });
  });
}
function openOfflineDB({ indexedDB = globalThis.indexedDB, name = "haoduoyu-offline" } = {}) {
  if (!indexedDB) return Promise.reject(new Error("IndexedDB is unavailable; changes have not been saved"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "key" });
        }
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close the other tab before upgrading offline storage"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve({
        transaction: (names, mode, callback) => idbTransaction(database, names, mode, callback),
        close: () => database.close()
      });
    };
  });
}

// web/offline/document.mjs
var localMarker = /* @__PURE__ */ Symbol("haoduoyu-local-durable-document");
var documents = /* @__PURE__ */ new WeakMap();
function localDocument({ local, server = null, operation: operation2 = null, conflict = null }) {
  const { content_hash, change_seq, ...value } = structuredClone(local);
  const document = Object.freeze({ ...value, [localMarker]: true });
  documents.set(document, {
    local: value,
    server: structuredClone(server),
    operation: structuredClone(operation2),
    conflict: structuredClone(conflict)
  });
  return document;
}

// web/offline/notes.mjs
var uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var hashPattern = /^[a-f0-9]{64}$/;
var isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
var fail = (message, code) => Object.assign(new Error(message), { code });
var missing = () => fail("\u6B64\u8BB0\u5F55\u5C1A\u672A\u5B8C\u6574\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u4E00\u6B21\u3002", "OFFLINE_CACHE_MISS");
var validDay = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
var timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
var noteEntity = (row) => row?.entity_id?.startsWith("note-entry:");
var removed = (row) => Boolean(row && (row.deleted || row.deleted_at));
var liveOperation = (row) => !["acked", "archived"].includes(row.status);
function noteReadRoute(path) {
  const url = new URL(path, "https://offline.invalid"), query = url.searchParams;
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  if (url.pathname === "/note-entries" && [...query.keys()].every((key) => ["category", "date"].includes(key)) && query.getAll("category").length === 1 && query.getAll("date").length === 1 && ["life", "work"].includes(query.get("category")) && validDay(query.get("date")))
    return { kind: "note_entries", date: query.get("date"), category: query.get("category") };
  const match = /^\/note-entries\/([^/]+)$/.exec(url.pathname);
  return match && !url.search && uuidPattern.test(match[1]) ? { kind: "note_entry", id: match[1].toLowerCase() } : null;
}
function isNoteApiRow(row) {
  return Boolean(isObject(row) && !Object.hasOwn(row, "entity_type") && uuidPattern.test(row.id) && ["life", "work"].includes(row.category) && validDay(row.date) && typeof row.text === "string" && new TextEncoder().encode(row.text).byteLength <= 65536 && Number.isSafeInteger(row.version) && row.version >= 1 && typeof row.deleted === "boolean" && typeof row.can_edit === "boolean" && timestamp(row.created_at) && timestamp(row.updated_at) && (row.deleted_at === null || timestamp(row.deleted_at)) && row.deleted === (row.deleted_at !== null) && Number.isSafeInteger(row.change_seq) && row.change_seq >= 0 && hashPattern.test(row.content_hash));
}
function checkedResponse(route, value) {
  const invalid3 = () => fail("\u788E\u788E\u5FF5\u8BFB\u53D6\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u672A\u8986\u76D6\u672C\u673A\u5185\u5BB9\u3002", "OFFLINE_RESPONSE_INVALID");
  if (route.kind === "note_entry") {
    if (!isNoteApiRow(value) || value.id !== route.id) throw invalid3();
    return structuredClone(value);
  }
  if (!isObject(value) || value.category !== route.category || value.date !== route.date || typeof value.can_edit !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 200) throw invalid3();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    if (!isNoteApiRow(row) || row.category !== route.category || row.date !== route.date || row.deleted || row.can_edit !== value.can_edit || ids.has(row.id)) throw invalid3();
    ids.add(row.id);
  }
  return structuredClone(value);
}
function inRoute(entity, route) {
  if (!noteEntity(entity)) return false;
  if (route.kind === "note_entry") return entity.entity_id === "note-entry:" + route.id;
  const row = entity.dirty ? entity.local : entity.server || entity.api_server;
  return row?.category === route.category && row?.date === route.date;
}
function serverFence(rows, route, owner) {
  return JSON.stringify(rows.filter((row) => row.scope === owner && inRoute(row, route)).map((row) => [row.entity_id, row.server || null, row.api_server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function localValue(entity, capability) {
  const row = entity.dirty ? entity.local : entity.server;
  if (!row || !uuidPattern.test(row.id || row.source_id) || !["life", "work"].includes(row.category) || !validDay(row.date) || !Number.isSafeInteger(row.version) || row.version < 1) throw missing();
  if (!removed(row) && typeof row.text !== "string") throw missing();
  return {
    id: row.id || row.source_id,
    category: row.category,
    date: row.date,
    text: typeof row.text === "string" ? row.text : entity.local?.text ?? entity.api_server?.text ?? "",
    version: row.version,
    deleted: removed(row),
    can_edit: capability === true,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}
function realServer(entity) {
  if (isNoteApiRow(entity.server)) return entity.server;
  return isNoteApiRow(entity.api_server) ? entity.api_server : null;
}
function projectEntity(entity, capability, operations, conflicts) {
  const local = localValue(entity, capability), server = realServer(entity);
  if (!entity.dirty && server?.version === local.version && server.deleted === local.deleted && (server.deleted || server.text === local.text)) return { ...structuredClone(server), can_edit: capability === true };
  const pending = operations.filter((row) => row.entity_id === entity.entity_id && liveOperation(row)).sort((a, b) => a.seq - b.seq).at(-1);
  const conflict = conflicts.find((row) => row.key === entity.conflict && row.resolved_at === null) || conflicts.filter((row) => row.entity_id === entity.entity_id && row.resolved_at === null).at(-1) || null;
  return localDocument({
    local,
    server: entity.dirty ? server : null,
    operation: entity.dirty ? pending || null : null,
    conflict: entity.dirty ? conflict : null
  });
}
function notesContext({ db, getScope, getGeneration = () => 0, now = Date.now }) {
  const capture = () => {
    const scope = getScope();
    if (!scope) throw fail("\u8BF7\u5148\u8054\u7F51\u6838\u5B9E\u8EAB\u4EFD\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_REQUIRED");
    const generation = getGeneration();
    return { scope, active() {
      if (getScope() !== scope || getGeneration() !== generation)
        throw fail("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u673A\u5185\u5BB9\u672A\u8986\u76D6\u3002", "OFFLINE_SCOPE_CHANGED");
    } };
  };
  const load = (tx, scope) => Promise.all(["entities", "outbox", "conflicts"].map((store) => tx.getAll(store))).then((rows) => Object.fromEntries(["entities", "outbox", "conflicts"].map((name, index) => [name, rows[index].filter((row) => row.scope === scope)])));
  const capabilityKey = (scope) => entityKey(scope, "capability:note-entry");
  return { db, capture, load, capabilityKey, now };
}
function readingMethods(context) {
  const { db, capture, load, capabilityKey } = context;
  async function capability() {
    const owner = capture();
    const record = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", capabilityKey(owner.scope)));
    owner.active();
    return record?.scope === owner.scope && typeof record.can_edit === "boolean" ? record.can_edit : null;
  }
  async function read(path, route = noteReadRoute(path)) {
    if (!route) throw missing();
    const owner = capture();
    const result = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      owner.active();
      const rows = await load(tx, owner.scope), cap = await tx.get("meta", capabilityKey(owner.scope));
      const capability2 = cap?.scope === owner.scope ? cap.can_edit : null;
      const cached = await tx.get("meta", entityKey(owner.scope, "get:" + path));
      const snapshot = await tx.get("meta", entityKey(owner.scope, "snapshot"));
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner.scope;
      const entities = rows.entities.filter((row) => inRoute(row, route) && (row.dirty || !row.remote_missing && row.server));
      if (route.kind === "note_entry") {
        if (!entities.length) throw missing();
        owner.active();
        return {
          data: projectEntity(entities[0], capability2, rows.outbox, rows.conflicts),
          saved_at: cached?.saved_at || snapshot?.value?.verified_at || null
        };
      }
      if (!cached && !complete && !entities.some((row) => row.dirty)) throw missing();
      if (complete && Array.isArray(snapshot.value.index.entities)) {
        const present = new Set(entities.map((row) => row.entity_id));
        if (snapshot.value.index.entities.some((row) => row.entity_id?.startsWith("note-entry:") && row.date === route.date && row.entity_type === route.category + "_note" && !row.deleted_at && !present.has(row.entity_id)))
          throw missing();
      }
      const entries = entities.filter((row) => !removed(row.dirty ? row.local : row.server)).map((row) => projectEntity(row, capability2, rows.outbox, rows.conflicts));
      if (entries.length > 200) throw fail("\u672C\u673A\u5F53\u65E5\u8BB0\u5F55\u8F83\u591A\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u8054\u7F51\u6838\u5BF9\u3002", "OFFLINE_CACHE_LIMIT");
      entries.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id));
      owner.active();
      return {
        data: {
          category: route.category,
          date: route.date,
          can_edit: capability2 === true,
          entries,
          ...!cached && !complete ? { offline_partial: true } : {}
        },
        saved_at: cached?.saved_at || snapshot?.value?.verified_at || null
      };
    });
    owner.active();
    return result;
  }
  async function fence(pathOrRoute) {
    const route = typeof pathOrRoute === "string" ? noteReadRoute(pathOrRoute) : pathOrRoute, owner = capture();
    if (!route) throw missing();
    const result = await db.transaction(["entities"], "readonly", async (tx) => serverFence(await tx.getAll("entities"), route, owner.scope));
    owner.active();
    return result;
  }
  return { read, capability, fence };
}
function writingMethods(context) {
  const { db, capture, capabilityKey, now } = context;
  async function write(path, route, value, { baseline } = {}) {
    route ||= noteReadRoute(path);
    if (!route) throw missing();
    const owner = capture(), data = checkedResponse(route, value);
    const incoming = route.kind === "note_entry" ? [data] : data.entries;
    await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      owner.active();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence(rows, route, owner.scope))
        throw fail("\u672C\u673A\u521A\u786E\u8BA4\u4E86\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5B8C\u6574\u8BB0\u5F55\u3002", "OFFLINE_CACHE_CHANGED");
      const found = new Set(incoming.map((row) => "note-entry:" + row.id));
      if (route.kind === "note_entries") for (const old of rows) {
        if (old.scope === owner.scope && inRoute(old, route) && !found.has(old.entity_id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of incoming) {
        const entity_id = "note-entry:" + row.id, key = entityKey(owner.scope, entity_id);
        const old = await tx.get("entities", key);
        if (Math.max(old?.server?.version || 0, old?.api_server?.version || 0) > row.version)
          throw fail("\u8BFB\u53D6\u7ED3\u679C\u65E9\u4E8E\u672C\u673A\u5DF2\u786E\u8BA4\u7248\u672C\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\u3002", "OFFLINE_CACHE_CHANGED");
        await tx.put("entities", { ...old, key, scope: owner.scope, entity_id, server: row, api_server: row, remote_missing: false });
      }
      await tx.put("meta", { key: entityKey(owner.scope, "get:" + path), scope: owner.scope, path, data, saved_at: now() });
      await tx.put("meta", { key: capabilityKey(owner.scope), scope: owner.scope, can_edit: data.can_edit, verified_at: now() });
      owner.active();
    });
    owner.active();
    const result = await context.read(path, route);
    owner.active();
    return result.data;
  }
  async function captureAcknowledged() {
    const owner = capture();
    const count = await db.transaction(["entities"], "readwrite", async (tx) => {
      owner.active();
      let count2 = 0;
      for (const entity of await tx.getAll("entities")) {
        if (entity.scope !== owner.scope || !noteEntity(entity) || !isNoteApiRow(entity.server) || entity.api_server?.version > entity.server.version) continue;
        await tx.put("entities", { ...entity, api_server: structuredClone(entity.server) });
        count2++;
      }
      owner.active();
      return count2;
    });
    owner.active();
    return count;
  }
  return { write, captureAcknowledged };
}
function createNotesCache(options) {
  const context = notesContext(options);
  const reading = readingMethods(context);
  Object.assign(context, reading);
  return { ...reading, ...writingMethods(context) };
}

// web/offline/read-only.mjs
var day = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
var missing2 = () => Object.assign(new Error("\u6B64\u5185\u5BB9\u5C1A\u672A\u5B8C\u6574\u7F13\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u3002"), { code: "OFFLINE_CACHE_MISS" });
function readOnlyRoute(path) {
  const url = new URL(path, "https://offline.invalid"), query = url.searchParams;
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  if (url.pathname === "/work-reminders" && [...query.keys()].every((key) => key === "date") && query.getAll("date").length === 1 && day(query.get("date"))) return { kind: "reminders", date: query.get("date") };
  if (!["/note-entries/dates", "/daily-notes/dates"].includes(url.pathname) || [...query.keys()].some((key) => !["category", "before", "page_size"].includes(key) || query.getAll(key).length !== 1) || query.has("category") && !["life", "work"].includes(query.get("category")) || query.has("before") && !day(query.get("before"))) return null;
  const size = query.get("page_size") || "30";
  if (!/^[1-9]\d*$/.test(size) || Number(size) > 100) return null;
  return {
    kind: "dates",
    source: url.pathname.startsWith("/daily-notes") ? "legacy" : "note_entry",
    category: query.get("category") || "life",
    before: query.get("before"),
    size: Number(size)
  };
}
function matches(entity, route) {
  if (route.kind === "reminders") return entity.entity_id.startsWith("work-reminder:");
  return route.source === "legacy" ? entity.entity_id.startsWith("legacy-" + route.category + ":") : entity.entity_id.startsWith("note-entry:");
}
async function readOnlySnapshot({ db, scope, route, getScope, getGeneration }) {
  const generation = getGeneration();
  const result = await db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await tx.get("meta", entityKey(scope, "snapshot")), index = snapshot?.value?.index;
    if (index?.complete !== true || index.scope_id !== scope) throw missing2();
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === scope && matches(row, route));
    for (const expected of index.entities.filter((row) => matches(row, route) && !row.deleted_at)) {
      if (!rows.some((row) => row.entity_id === expected.entity_id && row.server)) throw missing2();
    }
    const active4 = rows.filter((row) => row.dirty || !row.remote_missing).map((row) => route.source === "note_entry" && row.dirty ? row.local : row.server).filter((row) => row && !row.deleted && !row.deleted_at);
    let data;
    if (route.kind === "reminders") {
      const items = active4.filter((row) => row.date === route.date).map((row) => {
        if (typeof row.summary !== "string" || !Number.isFinite(Date.parse(row.updated_at))) throw missing2();
        return {
          id: row.id || row.source_id,
          date: row.date,
          summary: row.summary,
          source_key: row.source_key,
          version: row.version,
          updated_at: row.updated_at
        };
      });
      data = { date: route.date, can_edit: false, items, snapshot_complete: true };
    } else {
      const dates = [...new Set(active4.filter((row) => row.category === route.category && day(row.date) && (route.source !== "legacy" || typeof row.text === "string" && row.text !== "") && (!route.before || row.date < route.before)).map((row) => row.date))].sort().reverse();
      const selected = dates.slice(0, route.size), has_more = dates.length > route.size;
      data = { dates: selected, has_more, next_before: has_more ? selected.at(-1) : null, snapshot_complete: true };
    }
    return { data, saved_at: snapshot.value.verified_at || null };
  });
  if (scope !== getScope() || generation !== getGeneration()) throw missing2();
  return result;
}

// web/offline/cache.mjs
var dayPattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
var uuidPattern2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var clone = (value) => structuredClone(value);
var missing3 = () => Object.assign(new Error("\u6B64\u5185\u5BB9\u5C1A\u672A\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u4E00\u6B21\u3002"), { code: "OFFLINE_CACHE_MISS" });
var active = (row) => row && !row.deleted && !row.deleted_at;
function offlineReadRoute(path) {
  const url = new URL(path, "https://offline.invalid");
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  const route = url.pathname, query = url.searchParams;
  if (["/work-reminders", "/note-entries/dates", "/daily-notes/dates"].includes(route)) return readOnlyRoute(path);
  if (route === "/todos" && [...query.keys()].every((key) => key === "date") && query.getAll("date").length === 1 && dayPattern.test(query.get("date"))) return { kind: "todo", date: query.get("date") };
  if (route === "/todo-templates" && !url.search) return { kind: "template" };
  if (route === "/accounts" && !url.search) return { kind: "accounts" };
  if (route === "/overview") return { kind: "overview" };
  if (route === "/daily-notes" && query.getAll("date").length === 1 && dayPattern.test(query.get("date")) && [...query.keys()].every((key) => ["date", "category"].includes(key)) && query.getAll("category").length <= 1 && (!query.has("category") || ["life", "work"].includes(query.get("category"))))
    return { kind: "legacy", date: query.get("date"), category: query.get("category") || "life" };
  if (route === "/note-entries" || route.startsWith("/note-entries/")) return noteReadRoute(path);
  if (route === "/memos" && !url.search) return { kind: "memos" };
  if (/^\/memos\/notes\/[a-f0-9-]{36}$/i.test(route)) return { kind: "memo_note" };
  return null;
}
function safeIdentity(value) {
  if (!value || typeof value.id !== "string" || !value.id || typeof value.username !== "string")
    throw new Error("\u8EAB\u4EFD\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u672A\u542F\u7528\u672C\u673A\u6570\u636E\u3002");
  return { id: value.id, username: value.username, ...value.publicBusiness === true ? { publicBusiness: true } : {} };
}
var identityFingerprint = (value) => JSON.stringify([value.id, value.publicBusiness === true]);
function safeAccounts(value) {
  if (!Array.isArray(value)) throw new Error("\u8D26\u6237\u8BFB\u53D6\u4E0D\u5B8C\u6574\u3002");
  if (value.some((row) => !row || ![0, 1].includes(row.active))) throw new Error("\u8D26\u6237\u72B6\u6001\u8BFB\u53D6\u4E0D\u5B8C\u6574\u3002");
  const fields3 = ["id", "name", "platform", "active", "account_name", "position", "created_at", "updated_at"];
  return value.map((row) => Object.fromEntries(fields3.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
}
function checkedResponse2(route, value) {
  const invalid3 = () => Object.assign(new Error("\u8BFB\u53D6\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u672A\u8986\u76D6\u672C\u673A\u6570\u636E\u3002"), { code: "OFFLINE_RESPONSE_INVALID" });
  if (value === void 0 || value === null) throw invalid3();
  if (["todo", "template"].includes(route.kind) && (!Array.isArray(value.items) || value.items.some((row) => !row || !uuidPattern2.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.text !== "string" || !row.text.trim() || row.text.length > 500 || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at)) || route.kind === "todo" && (row.date !== route.date || typeof row.completed !== "boolean" || row.deleted_at !== null))))
    throw invalid3();
  return route.kind === "accounts" ? safeAccounts(value) : clone(value);
}
function belongs(row, route) {
  const value = offlineValue(row);
  return row.entity_id.startsWith(route.kind + ":") && value && (route.kind !== "todo" || value.date === route.date);
}
function todoFence(value) {
  if (!value) return null;
  return [
    value.id || value.source_id,
    value.date,
    value.text ?? null,
    value.completed === true || value.completed === 1,
    value.version,
    value.created_at,
    value.updated_at,
    value.deleted_at ?? null,
    Boolean(value.deleted || value.deleted_at),
    value.template_id ?? null,
    value.template_version ?? null,
    value.template_active ?? null
  ];
}
function serverFence2(rows, route, owner) {
  if (!["todo", "template"].includes(route.kind)) return null;
  return JSON.stringify(rows.filter((row) => row.scope === owner && belongs(row, route)).map((row) => [row.entity_id, route.kind === "todo" ? todoFence(row.server) : row.server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function overlay(value, route, entities, dirtyOnly) {
  if (!["todo", "template"].includes(route.kind)) return value;
  const items = new Map(value.items.map((row) => [row.id, row]));
  for (const entity of entities) {
    if (!belongs(entity, route) || dirtyOnly && !entity.dirty) continue;
    const row = offlineValue(entity);
    if (active(row) && !entity.remote_missing || entity.dirty && active(row)) items.set(row.id, clone(row));
    else items.delete(row.id);
  }
  return { ...value, items: [...items.values()].filter(active).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id)) };
}
function identityMethods(db, now) {
  const key = JSON.stringify(["haoduoyu-offline", "last-verified-identity"]);
  return {
    readIdentity: () => db.transaction(["meta"], "readonly", (tx) => tx.get("meta", key)),
    async saveIdentity(me, scope) {
      const identity4 = safeIdentity(me);
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", { key, identity: identity4, scope, verified_at: now() }));
      return identity4;
    },
    forgetIdentity: () => db.transaction(["meta"], "readwrite", (tx) => tx.delete("meta", key))
  };
}
async function legacySnapshot(db, owner, route) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await tx.get("meta", entityKey(owner, "snapshot"));
    if (snapshot?.value?.index?.complete !== true || snapshot.value.index.scope_id !== owner) throw missing3();
    const entity = await tx.get("entities", entityKey(owner, "legacy-" + route.category + ":" + route.date));
    const row = !entity?.remote_missing && entity?.server;
    if (!row && snapshot.value.index.entities?.some((value) => value.entity_id === "legacy-" + route.category + ":" + route.date)) throw missing3();
    if (row && (!Number.isSafeInteger(row.version) || row.version < 1 || !row.deleted_at && typeof row.text !== "string")) throw missing3();
    const data = {
      date: route.date,
      text: row?.text || "",
      version: row?.version || 0,
      updated_at: row?.updated_at || null,
      deleted: Boolean(row?.deleted_at),
      can_edit: false,
      snapshot_complete: true
    };
    return { data, saved_at: snapshot.value.verified_at || null };
  });
}
function createOfflineCache({ db, getScope, now = Date.now, getGeneration = () => 0 }) {
  const notes = createNotesCache({ db, getScope, now, getGeneration });
  const scope = () => {
    const value = getScope();
    if (!value) throw Object.assign(new Error("\u8BF7\u5148\u8054\u7F51\u6838\u5B9E\u5F53\u524D\u8EAB\u4EFD\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002"), { code: "OFFLINE_SCOPE_REQUIRED" });
    return value;
  };
  async function write(path, value, { baseline } = {}) {
    const route = offlineReadRoute(path);
    if (!route) return value;
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.write(path, route, value, { baseline });
    const owner = scope(), generation = getGeneration(), data = checkedResponse2(route, value), key = entityKey(owner, "get:" + path);
    const active4 = () => {
      if (scope() !== owner || getGeneration() !== generation)
        throw Object.assign(new Error("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u6B21\u8BFB\u53D6\u672A\u4FDD\u5B58\u3002"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta", "entities"], "readwrite", async (tx) => {
      active4();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence2(rows, route, owner))
        throw Object.assign(new Error("\u672C\u673A\u521A\u540C\u6B65\u4E86\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5B8C\u6574\u5217\u8868\u3002"), { code: "OFFLINE_CACHE_CHANGED" });
      await tx.put("meta", { key, scope: owner, path, data, saved_at: now() });
      if (!["todo", "template"].includes(route.kind)) {
        active4();
        return;
      }
      const found = new Set(data.items.map((row) => row.id));
      for (const old of rows) {
        if (old.scope === owner && belongs(old, route) && !found.has(offlineValue(old).id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of data.items) {
        const entity_id = route.kind + ":" + row.id, storageKey = entityKey(owner, entity_id);
        const old = await tx.get("entities", storageKey);
        if (old?.server?.version > row.version)
          throw Object.assign(new Error("\u8BFB\u53D6\u7ED3\u679C\u65E9\u4E8E\u672C\u673A\u5DF2\u786E\u8BA4\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002"), { code: "OFFLINE_CACHE_CHANGED" });
        await tx.put("entities", {
          ...old,
          key: storageKey,
          scope: owner,
          entity_id,
          server: row,
          remote_missing: false,
          ...route.kind === "todo" ? { needs_api_refresh: false } : {}
        });
      }
      active4();
    });
    const result = overlay(route.kind === "accounts" ? value : data, route, await entities(owner), true);
    active4();
    return result;
  }
  const entities = (owner) => db.transaction(["entities"], "readonly", async (tx) => (await tx.getAll("entities")).filter((row) => row.scope === owner));
  async function read(path) {
    const route = offlineReadRoute(path);
    if (!route) throw missing3();
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.read(path, route);
    const owner = scope(), generation = getGeneration();
    const cached = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(owner, "get:" + path)));
    if (["reminders", "dates"].includes(route.kind)) {
      try {
        return await readOnlySnapshot({ db, scope: owner, route, getScope, getGeneration });
      } catch (error) {
        if (error.code !== "OFFLINE_CACHE_MISS" || !cached) throw error;
      }
    }
    if (!cached || cached.data === void 0) {
      if (route.kind === "legacy") {
        const result2 = await legacySnapshot(db, owner, route);
        if (scope() !== owner || getGeneration() !== generation) throw missing3();
        return result2;
      }
      const local = route.kind === "todo" ? (await entities(owner)).filter((row) => row.dirty && belongs(row, route)) : [];
      if (!local.length) throw missing3();
      const data = {
        date: route.date,
        today: new Date(now() + 8 * 36e5).toISOString().slice(0, 10),
        completed_mode: "strike",
        preferences_version: 0,
        items: [],
        offline_partial: true
      };
      if (scope() !== owner || getGeneration() !== generation) throw missing3();
      return { data: overlay(data, route, local, false), saved_at: null };
    }
    const result = route.kind === "legacy" ? { ...clone(cached.data), can_edit: false } : overlay(clone(cached.data), route, await entities(owner), false);
    if (scope() !== owner || getGeneration() !== generation) throw missing3();
    return { data: result, saved_at: cached.saved_at };
  }
  const entity = (id) => db.transaction(["entities"], "readonly", (tx) => tx.get("entities", entityKey(scope(), id)));
  const fence = async (path) => {
    const route = offlineReadRoute(path);
    return ["note_entries", "note_entry"].includes(route?.kind) ? notes.fence(route) : serverFence2(await entities(scope()), route, scope());
  };
  return {
    read,
    write,
    entity,
    fence,
    entities: () => entities(scope()),
    noteCapability: notes.capability,
    captureDocuments: notes.captureAcknowledged,
    ...identityMethods(db, now)
  };
}

// web/offline/resolution-ledger.mjs
function resolutionParent(rows, operation2) {
  return rows.find((row) => row.scope === operation2.scope && row.resolution?.id === operation2.resolution_id);
}
async function outstandingResolution(tx, conflict, acknowledgements = [], completedChild = null) {
  const children = new Set(conflict.resolution.conflict_keys || []), acked = new Set(acknowledgements.map((row) => row.operation_key));
  const pending = (await tx.getAll("outbox")).some((row) => row.scope === conflict.scope && row.resolution_id === conflict.resolution.id && !["acked", "archived"].includes(row.status) && !acked.has(row.key));
  const conflicts = (await tx.getAll("conflicts")).some((row) => row.scope === conflict.scope && row.resolved_at === null && row.key !== completedChild && (row.resolution_parent === conflict.key || children.has(row.key)));
  return { pending, conflicts };
}
async function finishParents(tx, conflict, time) {
  let key = conflict.resolution_parent, completedChild = conflict.key;
  const seen = /* @__PURE__ */ new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const parent = await tx.get("conflicts", key);
    if (!parent || parent.scope !== conflict.scope || !parent.resolution) return;
    const completed = [.../* @__PURE__ */ new Set([...parent.resolution.completed_children || [], completedChild])];
    const waiting = await outstandingResolution(tx, parent, parent.resolution.acknowledgements || [], completedChild);
    if (waiting.pending || waiting.conflicts) {
      await tx.put("conflicts", { ...parent, resolved_at: null, resolution: {
        ...parent.resolution,
        state: "conflict",
        completed_children: completed
      } });
      return;
    }
    await tx.put("conflicts", { ...parent, resolved_at: time, resolution: {
      ...parent.resolution,
      completed_children: completed,
      state: "superseded",
      completed_by: conflict.key,
      completed_at: time
    } });
    completedChild = parent.key;
    key = parent.resolution_parent;
  }
}
async function recordResolutionAck(tx, operation2, remote, time) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (operation2.protocol === 3 && (!conflict || conflict.key !== operation2.origin_conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)))
    throw Object.assign(new Error("\u672C\u673A\u9009\u62E9\u51ED\u636E\u4E0D\u5B8C\u6574\uFF0C\u672A\u786E\u8BA4\u6B64\u6B21\u4FDD\u5B58\u3002"), { code: "OFFLINE_DECISION_EVIDENCE_MISSING" });
  if (!conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)) return;
  const resolution = conflict.resolution;
  const acknowledgements = [
    ...(resolution.acknowledgements || []).filter((row) => row.operation_key !== operation2.key),
    { operation_key: operation2.key, save_id: operation2.save_id, remote, acknowledged_at: time }
  ];
  const waiting = await outstandingResolution(tx, conflict, acknowledgements);
  const allAcknowledged = resolution.operation_keys.every((key) => acknowledgements.some((row) => row.operation_key === key));
  const hasCompletedChildren = Boolean(resolution.completed_children?.length);
  const complete = !waiting.pending && !waiting.conflicts && (allAcknowledged || hasCompletedChildren);
  const next = { ...conflict, resolved_at: complete ? time : null, resolution: {
    ...resolution,
    acknowledgements,
    state: complete ? hasCompletedChildren ? "superseded" : "synced" : waiting.conflicts || hasCompletedChildren ? "conflict" : "queued",
    ...complete ? { completed_at: time } : {}
  } };
  await tx.put("conflicts", next);
  if (complete) await finishParents(tx, next, time);
}
async function recordResolutionConflict(tx, operation2, child) {
  if (!operation2.resolution_id) return child;
  const parent = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!parent || parent.resolved_at !== null) return child;
  const keys = [.../* @__PURE__ */ new Set([...parent.resolution.conflict_keys || [], child.key])];
  await tx.put("conflicts", { ...parent, resolution: { ...parent.resolution, state: "conflict", conflict_keys: keys } });
  return { ...child, resolution_parent: parent.key };
}
async function recordResolutionFailure(tx, operation2, fields3) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!conflict || conflict.resolved_at !== null) return;
  const waiting = await outstandingResolution(tx, conflict, conflict.resolution.acknowledgements || []);
  const state = waiting.conflicts || conflict.resolution.completed_children?.length ? "conflict" : fields3.status === "blocked" ? "blocked" : fields3.status === "paused" ? "paused" : "queued";
  await tx.put("conflicts", { ...conflict, resolution: {
    ...conflict.resolution,
    state,
    last_error: fields3.error || null
  } });
}
async function finishServerResolution(tx, conflict, time) {
  if (conflict.resolution?.state === "accepted-server") await finishParents(tx, conflict, time);
}

// web/offline/conflict.mjs
function createConflictStore({ db, now = Date.now, canDispatch = () => true }) {
  async function record({ operation: operation2, remote = null, reason = "version" }) {
    return db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      const current = await tx.get("outbox", operation2.key);
      if (!current || current.scope !== operation2.scope) throw new Error("Offline operation is no longer current");
      if (!canDispatch(operation2) || !canDispatch(current)) return null;
      if (current.claim_owner !== operation2.claim_owner || ["archived", "conflict"].includes(current.status)) {
        throw new Error("Offline conflict claim changed");
      }
      const entity = await tx.get("entities", entityKey(operation2.scope, operation2.entity_id));
      const key = entityKey(operation2.scope, "conflict:" + operation2.id);
      let conflict = {
        key,
        scope: operation2.scope,
        entity_id: operation2.entity_id,
        operation: current,
        local: entity?.local || operation2.local,
        remote,
        reason,
        created_at: now(),
        resolved_at: null
      };
      conflict = await recordResolutionConflict(tx, current, conflict);
      await tx.put("conflicts", conflict);
      await tx.put("outbox", { ...current, status: "conflict", error: reason });
      if (entity) await tx.put("entities", { ...entity, conflict: key, dirty: true });
      return conflict;
    });
  }
  const list = (scope) => db.transaction(["conflicts"], "readonly", async (tx) => (await tx.getAll("conflicts")).filter((value) => value.scope === scope && value.resolved_at === null));
  return { record, list };
}

// web/offline/conflict-plan.mjs
var prefixes = {
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuidPattern3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var clientIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
var removed2 = (value) => Boolean(value && (value.deleted || value.deleted_at));
var revision = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
var plain = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
var invalid = () => {
  throw new TypeError("\u51B2\u7A81\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u4FDD\u7559\u539F\u6587\u5E76\u91CD\u65B0\u6838\u5BF9\u3002");
};
function checkedDay(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const stamp2 = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(stamp2) || new Date(stamp2).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
function shortText(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || value.includes("\0")) invalid();
  return value.trim();
}
function longText(value) {
  if (!plain(value)) invalid();
  value = value.replace(/\r\n?/g, "\n");
  if (new TextEncoder().encode(value).length > 65536) invalid();
  return value;
}
function memoContent(local, type) {
  if (!plain(local.title) || !local.title.trim() || [...local.title.trim()].length > 120 || /[\r\n\t]/.test(local.title) || !Number.isSafeInteger(local.position) || local.position < 0 || local.position > 1e6) invalid();
  const value = { title: local.title.trim(), position: local.position };
  if (type === "memo_note") {
    if (!uuidPattern3.test(local.group_id)) invalid();
    Object.assign(value, { group_id: local.group_id.toLowerCase(), body: longText(local.body) });
  }
  return value;
}
function content(local, type) {
  if (!local || typeof local !== "object" || Array.isArray(local)) invalid();
  if (local.version !== void 0 && (!Number.isSafeInteger(local.version) || local.version < 0 || local.version >= Number.MAX_SAFE_INTEGER)) invalid();
  if (type === "todo") {
    if (typeof local.completed !== "boolean") invalid();
    return { date: checkedDay(local.date), text: shortText(local.text), completed: local.completed };
  }
  if (type === "template") return { text: shortText(local.text) };
  if (type === "note_entry") {
    if (!["life", "work"].includes(local.category)) invalid();
    return { category: local.category, date: checkedDay(local.date), text: longText(local.text) };
  }
  return memoContent(local, type);
}
function contextFor({ conflict, remote, choice, uuid: uuid4 }) {
  const type = conflict?.operation?.entity_type, scope = conflict?.scope, prefix = prefixes[type];
  if (!prefix || !["use-server", "use-local", "keep-both"].includes(choice) || typeof scope !== "string" || !scope) invalid();
  const entity = conflict.entity_id, pattern = ["todo", "template"].includes(type) ? clientIdPattern : uuidPattern3;
  if (typeof entity !== "string" || !entity.startsWith(prefix) || !pattern.test(entity.slice(prefix.length)) || conflict.operation.scope !== void 0 && conflict.operation.scope !== scope || conflict.operation.entity_id !== void 0 && conflict.operation.entity_id !== entity) invalid();
  const id = entity.slice(prefix.length).toLowerCase(), local = conflict.local;
  if (local?.id !== void 0 && local.id.toLowerCase?.() !== id || conflict.operation.source_id !== void 0 && conflict.operation.source_id.toLowerCase?.() !== id) invalid();
  if (remote && (typeof remote !== "object" || remote.id?.toLowerCase?.() !== id || !revision(remote.version))) invalid();
  const used = /* @__PURE__ */ new Set([id, conflict.operation.save_id?.toLowerCase?.(), local?.group_id?.toLowerCase?.()]);
  const fresh = () => {
    const value = uuid4();
    if (typeof value !== "string" || !pattern.test(value) || used.has(value.toLowerCase())) invalid();
    used.add(value.toLowerCase());
    return value.toLowerCase();
  };
  const reserve = (values) => {
    for (const value of values) if (typeof value === "string") used.add(value.toLowerCase());
  };
  return { type, scope, id, local, remote, choice, fresh, reserve };
}
function operation(context, id, method, path, body2, value, base = null, deleted2 = false) {
  const local = { ...value, id, version: (body2.version || 0) + 1, can_edit: true, deleted: deleted2, deleted_at: null };
  return {
    scope: context.scope,
    entity_type: context.type,
    entity_id: id,
    method,
    path,
    body: body2,
    base: base ? structuredClone(base) : null,
    local
  };
}
function copyResult(context, id, operations) {
  return {
    mode: "copy",
    target_id: id,
    operations,
    explanation: removed2(context.local) ? "\u5C06\u5220\u9664\u524D\u7684\u672C\u673A\u5185\u5BB9\u53E6\u5B58\u4E3A\u65B0\u8BB0\u5F55\uFF0C\u539F\u8BB0\u5F55\u4FDD\u6301\u539F\u72B6\u3002" : "\u5C06\u672C\u673A\u5185\u5BB9\u53E6\u5B58\u4E3A\u65B0\u8BB0\u5F55\uFF0C\u539F\u8BB0\u5F55\u4FDD\u6301\u539F\u72B6\u3002"
  };
}
function todoPlan(context, value) {
  const { id, remote, local, choice, fresh } = context, path = "/todos/" + id;
  if (choice === "use-local" && remote && !removed2(remote) && remote.date === value.date && remote.text === value.text) {
    const method = removed2(local) ? "DELETE" : "PATCH";
    const body2 = method === "DELETE" ? { date: value.date, version: remote.version } : { completed: value.completed, version: remote.version };
    return {
      mode: "replace",
      target_id: id,
      operations: [operation(context, id, method, path, body2, value, remote, method === "DELETE")]
    };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations = [operation(context, target, "POST", "/todos", { id: target, date: value.date, text: value.text }, created)];
  if (value.completed) operations.push(operation(context, target, "PATCH", "/todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations);
}
function templatePlan(context, value) {
  const { id, remote, local, choice, fresh } = context;
  if (choice === "use-local" && remote && !removed2(remote)) {
    const method = removed2(local) ? "DELETE" : "PATCH", body2 = { version: remote.version };
    if (method === "PATCH") body2.text = value.text;
    return { mode: "replace", target_id: id, operations: [
      operation(context, id, method, "/todo-templates/" + id, body2, value, remote, method === "DELETE")
    ] };
  }
  const target = fresh();
  return copyResult(context, target, [operation(context, target, "POST", "/todo-templates", { id: target, text: value.text }, value)]);
}
function notePlan(context, value) {
  const { id, remote, local, choice, fresh } = context;
  if (choice === "use-local" && remote && !removed2(remote) && remote.category === value.category && remote.date === value.date) {
    const method = removed2(local) ? "DELETE" : "PUT", body3 = { version: remote.version, save_id: fresh() };
    if (method === "PUT") Object.assign(body3, value);
    return { mode: "replace", target_id: id, operations: [
      operation(context, id, method, "/note-entries/" + id, body3, value, remote, method === "DELETE")
    ] };
  }
  const target = fresh(), body2 = { ...value, version: 0, save_id: fresh() };
  return copyResult(context, target, [operation(context, target, "PUT", "/note-entries/" + target, body2, value)]);
}
function liveMemoGroup(group) {
  return group && uuidPattern3.test(group.id) && revision(group.version) && group.deleted_at === null && !group.deleted && (group.position === void 0 || Number.isSafeInteger(group.position) && group.position >= 0 && group.position <= 1e6);
}
function memoOperation(context, id, body2, value, base = null) {
  const kind = context.type === "memo_note" ? "notes" : "groups";
  const result = operation(context, id, "PUT", "/memos/" + kind + "/" + id, body2, value, base);
  if (context.type === "memo_note") Object.assign(result, { protocol: 2, depends_on: ["memo-group:" + body2.group_id] });
  return result;
}
function memoParentCopy(context, value, groups) {
  const live2 = groups.filter(liveMemoGroup).sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
  const operations = [];
  let parent = live2[0]?.id.toLowerCase();
  if (!parent) {
    parent = context.fresh();
    const groupValue = { title: "\u672C\u673A\u51B2\u7A81\u526F\u672C", position: 0 };
    const groupBody = { ...groupValue, version: 0, save_id: context.fresh() };
    operations.push(memoOperation({ ...context, type: "memo_group" }, parent, groupBody, groupValue));
  }
  const target = context.fresh(), local = { ...value, group_id: parent };
  const body2 = { ...local, version: 0, save_id: context.fresh() };
  operations.push(memoOperation(context, target, body2, local));
  return {
    ...copyResult(context, target, operations),
    explanation: "\u539F\u7B14\u8BB0\u6240\u5728\u4F4D\u7F6E\u5DF2\u4E0D\u53EF\u7528\uFF0C\u5C06\u672C\u673A\u6B63\u6587\u53E6\u5B58\u4E3A\u65B0\u7B14\u8BB0\uFF0C\u539F\u5185\u5BB9\u4FDD\u7559\u3002"
  };
}
function memoPlan(context, value, groups) {
  const { id, remote, local, choice, fresh, type } = context;
  if (removed2(local)) return {
    mode: "blocked",
    operations: [],
    target_id: id,
    explanation: "\u672C\u673A\u4FDD\u7559\u7684\u662F\u5220\u9664\u610F\u56FE\uFF1B\u5907\u5FD8\u5F55\u5220\u9664\u9700\u8054\u7F51\u786E\u8BA4\uFF0C\u539F\u6587\u4E0E\u51B2\u7A81\u4ECD\u4FDD\u7559\u3002"
  };
  if (type === "memo_note" && !groups.some((group) => group?.id === value.group_id && liveMemoGroup(group)))
    return memoParentCopy(context, value, groups);
  const replace = choice === "use-local" && remote && !removed2(remote) && (type !== "memo_note" || remote.group_id === value.group_id);
  const target = replace ? id : fresh(), body2 = { ...value, version: replace ? remote.version : 0, save_id: fresh() };
  const operations = [memoOperation(context, target, body2, value, replace ? remote : null)];
  return replace ? { mode: "replace", target_id: target, operations } : copyResult(context, target, operations);
}
function planConflictResolution({ conflict, remote = null, choice, groups = [], uuid: uuid4 = () => crypto.randomUUID() }) {
  const context = contextFor({ conflict, remote, choice, uuid: uuid4 });
  if (choice === "use-server") return { mode: "server", target_id: context.id, operations: [] };
  if (choice === "use-local" && removed2(context.local) && (!remote || removed2(remote)))
    return { mode: "server", target_id: context.id, operations: [], explanation: "\u7EBF\u4E0A\u5DF2\u5220\u9664\uFF0C\u786E\u8BA4\u5220\u9664\u7ED3\u679C\uFF1B\u5220\u9664\u524D\u539F\u6587\u4ECD\u4FDD\u7559\u3002" };
  if (!Array.isArray(groups)) invalid();
  context.reserve(groups.map((group) => group?.id));
  const value = content(context.local, context.type);
  if (context.type === "todo") return todoPlan(context, value);
  if (context.type === "template") return templatePlan(context, value);
  if (context.type === "note_entry") return notePlan(context, value);
  return memoPlan(context, value, groups);
}

// web/offline/conflict-decisions.mjs
var live = (row) => !["acked", "archived"].includes(row.status);
var own = (value, key) => Object.hasOwn(value, key);
var currentLocal = (row) => own(row, "review_local") ? row.review_local : row.local;
var currentRemote = (row) => own(row, "review_remote") ? row.review_remote : row.remote;
var failure = (message, code = "OFFLINE_CONFLICT_CHANGED") => Object.assign(new Error(message), { code });
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
var stable = (value) => JSON.stringify(canonical(value));
function conflictDecisionToken(conflict) {
  return stable({
    key: conflict.key,
    local: currentLocal(conflict),
    remote: currentRemote(conflict),
    operation: conflict.operation,
    copy_required: conflict.copy_required === true,
    resolved_at: conflict.resolved_at
  });
}
function remoteEvidence(value, type) {
  if (!value) return null;
  const fields3 = type === "todo" ? ["date", "text", "completed"] : type === "template" ? ["text"] : type === "note_entry" ? ["category", "date", "text"] : type === "memo_note" ? ["group_id", "title", "body", "position"] : ["title", "position"];
  return {
    id: value.id || value.source_id,
    version: value.version,
    deleted: Boolean(value.deleted || value.deleted_at),
    ...Object.fromEntries(fields3.filter((key) => own(value, key)).map((key) => [key, value[key]]))
  };
}
function branchState(conflict, entity, operations, drafts) {
  return stable({ conflict, entity, operations, drafts });
}
async function storedState(tx, scope, key) {
  const conflict = await tx.get("conflicts", key);
  if (!conflict || conflict.scope !== scope) throw failure("\u51B2\u7A81\u4E0D\u5C5E\u4E8E\u5F53\u524D\u8EAB\u4EFD\u3002", "OFFLINE_SCOPE_CHANGED");
  const entity = await tx.get("entities", entityKey(scope, conflict.entity_id));
  const operations = (await tx.getAll("outbox")).filter((row) => row.scope === scope && row.entity_id === conflict.entity_id && live(row)).sort((a, b) => a.seq - b.seq);
  const id = conflict.operation.source_id;
  const drafts = (await tx.getAll("meta")).filter((row) => row.scope === scope && row.draft_kind && row.data?.id === id);
  return { conflict, entity, operations, drafts, signature: branchState(conflict, entity, operations, drafts) };
}
function checkSelection(captured, expected, canDispatch) {
  const { conflict, entity, operations } = captured;
  if (conflict.resolved_at !== null || conflict.resolution) return;
  if (expected !== void 0 && expected !== conflictDecisionToken(conflict)) throw failure("\u6BD4\u8F83\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
  if (!canDispatch(conflict.operation) || operations.some((row) => !canDispatch(row)))
    throw failure("\u6B64\u672C\u673A\u64CD\u4F5C\u9700\u65B0\u7248\u9875\u9762\u5904\u7406\uFF0C\u539F\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_UPGRADE_REQUIRED");
  if (!entity || entity.conflict !== conflict.key || !operations.some((row) => row.key === conflict.operation.key))
    throw failure("\u8FD9\u4EFD\u51B2\u7A81\u5DF2\u53D8\u5316\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
}
function createConflictDecisions({
  db,
  getScope,
  prepare,
  append,
  canDispatch = () => true,
  now = Date.now,
  uuid: uuid4 = () => crypto.randomUUID()
}) {
  async function transaction(captured, scope, assertActive, callback) {
    return db.transaction(["entities", "outbox", "conflicts", "meta"], "readwrite", async (tx) => {
      assertActive();
      const latest = await storedState(tx, scope, captured.conflict.key);
      if (latest.conflict.resolved_at !== null || latest.conflict.resolution) return { ...latest.conflict, already_resolved: true };
      if (latest.signature !== captured.signature) throw failure("\u672C\u673A\u5185\u5BB9\u521A\u6709\u53D8\u5316\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
      const result = await callback(tx, latest);
      assertActive();
      return result;
    });
  }
  async function review(captured, scope, active4, remote, message, extra = {}) {
    return transaction(captured, scope, active4, async (tx) => {
      const history = [...captured.conflict.remote_history || []];
      if (!history.some((value) => stable(value) === stable(currentRemote(captured.conflict))))
        history.push(currentRemote(captured.conflict));
      const next = {
        ...captured.conflict,
        remote_history: history,
        review_local: captured.entity.local,
        review_remote: remote,
        needs_recompare: true,
        resolution_message: message,
        ...extra
      };
      await tx.put("conflicts", next);
      return next;
    });
  }
  async function commit(captured, scope, active4, choice, prepared, plan) {
    return transaction(captured, scope, active4, async (tx) => {
      const conflict = captured.conflict, resolutionId = uuid4();
      for (const operation3 of captured.operations)
        await tx.put("outbox", { ...operation3, status: "archived", archived_by: resolutionId });
      const entity = {
        ...captured.entity,
        server: prepared.remote,
        local: prepared.remote,
        dirty: false,
        conflict: null,
        remote_missing: !prepared.remote
      };
      if (prepared.remote?.can_edit !== void 0) entity.api_server = prepared.remote;
      await tx.put("entities", entity);
      await rememberParents(tx, scope, prepared.groups || [], plan.operations);
      const stamp2 = new Date(now()).toISOString();
      const inputs = plan.operations.map((input) => ({
        ...input,
        protocol: 3,
        resolution_id: resolutionId,
        origin_conflict: conflict.key,
        resolution_receipt: 1,
        local: { ...input.local, created_at: input.base?.created_at || stamp2, updated_at: stamp2 }
      }));
      const saved = await append(tx, inputs, { assertActive: active4 });
      const resolution = {
        id: resolutionId,
        mode: plan.mode,
        target_id: plan.target_id,
        operation_keys: saved.map((row) => row.operation.key),
        state: saved.length ? "queued" : "accepted-server"
      };
      const operation2 = saved.length ? {
        ...conflict.operation,
        protocol: 3,
        resolution_id: resolutionId,
        origin_conflict: conflict.key,
        resolution_receipt: 1
      } : conflict.operation;
      const result = {
        ...conflict,
        choice,
        needs_recompare: false,
        needs_followup: false,
        resolved_at: saved.length ? null : now(),
        original_operation: conflict.original_operation || conflict.operation,
        operation: operation2,
        resolution,
        resolution_remote: prepared.remote,
        resolution_message: plan.explanation || ""
      };
      await tx.put("conflicts", result);
      await finishServerResolution(tx, result, now());
      return result;
    });
  }
  async function resolve(key, choice, { scope = getScope(), assertActive = () => {
  }, expected, copyConfirmed = false } = {}) {
    if (!["use-server", "use-local", "keep-both"].includes(choice)) throw new TypeError("Unknown conflict choice");
    const active4 = () => {
      assertActive();
      if (!scope || scope !== getScope()) throw failure("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u51B2\u7A81\u548C\u539F\u6587\u4FDD\u6301\u539F\u6837\u3002", "OFFLINE_SCOPE_CHANGED");
    };
    active4();
    const captured = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", (tx) => storedState(tx, scope, key));
    active4();
    if (captured.conflict.resolved_at !== null || captured.conflict.resolution)
      return { ...captured.conflict, already_resolved: true };
    checkSelection(captured, expected, canDispatch);
    if (stable(captured.entity.local) !== stable(currentLocal(captured.conflict)))
      return review(captured, scope, active4, currentRemote(captured.conflict), "\u672C\u673A\u5DF2\u6709\u540E\u7EED\u4FEE\u6539\uFF0C\u8BF7\u6838\u5BF9\u65B0\u6BD4\u8F83\u5185\u5BB9\u540E\u518D\u9009\u62E9\u3002");
    const prepared = await prepare(captured.conflict, { assertActive: active4 });
    active4();
    const type = captured.conflict.operation.entity_type;
    if (stable(remoteEvidence(prepared.remote, type)) !== stable(remoteEvidence(currentRemote(captured.conflict), type)))
      return review(captured, scope, active4, prepared.remote, "\u7EBF\u4E0A\u521A\u6709\u66F4\u65B0\uFF0C\u8BF7\u6838\u5BF9\u65B0\u6BD4\u8F83\u5185\u5BB9\u540E\u518D\u9009\u62E9\u3002");
    const selected = { ...captured.conflict, local: currentLocal(captured.conflict), remote: prepared.remote };
    const plan = planConflictResolution({ conflict: selected, remote: prepared.remote, choice, groups: prepared.groups || [], uuid: uuid4 });
    if (plan.mode === "blocked") return { ...captured.conflict, blocked: true, resolution_message: plan.explanation };
    if (choice === "use-local" && plan.mode === "copy" && !copyConfirmed)
      return review(captured, scope, active4, prepared.remote, plan.explanation + "\u8BF7\u660E\u786E\u9009\u62E9\u53E6\u5B58\u672C\u5730\u526F\u672C\u3002", { copy_required: true });
    active4();
    return commit(captured, scope, active4, choice, prepared, plan);
  }
  return { resolve };
}
async function rememberParents(tx, scope, groups, operations) {
  for (const input of operations.filter((row) => row.entity_type === "memo_note")) {
    const id = input.body.group_id, server = groups.find((row) => row.id === id && !row.deleted_at && !row.deleted);
    if (!server) continue;
    const entity_id = "memo-group:" + id, key = entityKey(scope, entity_id), old = await tx.get("entities", key);
    if (old?.server?.version > server.version) throw failure("\u5206\u7EC4\u521A\u6709\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u540E\u4FDD\u5B58\u3002");
    await tx.put("entities", {
      ...old,
      key,
      scope,
      entity_id,
      server,
      local: old?.dirty ? old.local : server,
      dirty: old?.dirty === true,
      remote_missing: false
    });
  }
}

// web/offline/conflict-transport.mjs
var prefixes2 = {
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
var object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
var version = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
var sequence = (value) => Number.isSafeInteger(value) && value >= 0;
var timestamp2 = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
var invalid2 = () => {
  throw Object.assign(new Error("\u7EBF\u4E0A\u5185\u5BB9\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002"), { code: "OFFLINE_RESPONSE_INVALID" });
};
var removed3 = (row) => row?.deleted === true || row?.deleted_at !== null && row?.deleted_at !== void 0;
var own2 = (value, key) => Object.hasOwn(value, key);
function day2(value) {
  return typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
}
function shortText2(value) {
  return typeof value === "string" && value.isWellFormed() && value.trim().length > 0 && value.length <= 500 && !value.includes("\0");
}
function body(value) {
  return typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r]/.test(value) && new TextEncoder().encode(value).byteLength <= 65536;
}
function identity(row, id, type) {
  return object(row) && (row.id === id || row.id === void 0 && row.source_id === id) && (!own2(row, "source_id") || row.source_id === id) && (!own2(row, "entity_id") || row.entity_id === prefixes2[type] + id);
}
function deletion(row) {
  return (!own2(row, "deleted") || typeof row.deleted === "boolean") && (!own2(row, "deleted_at") || row.deleted_at === null || timestamp2(row.deleted_at)) && (!own2(row, "deleted") || !own2(row, "deleted_at") || row.deleted === (row.deleted_at !== null));
}
function basicRemote(row, id, type) {
  if (!identity(row, id, type) || !version(row.version) || !deletion(row)) invalid2();
  if (type === "todo" && (!day2(row.date) || !removed3(row) && (!shortText2(row.text) || typeof row.completed !== "boolean"))) invalid2();
  if (type === "template" && !removed3(row) && !shortText2(row.text)) invalid2();
  return structuredClone(row);
}
function noteRemote(row, id) {
  if (!isNoteApiRow(row) || row.id !== id || row.can_edit !== true || !body(row.text)) invalid2();
  return structuredClone(row);
}
function memoMeta(row, note = false) {
  if (!object(row) || !uuid.test(row.id) || typeof row.title !== "string" || !row.title.isWellFormed() || !row.title.trim() || [...row.title].length > 120 || /[\u0000-\u001f\u007f]/.test(row.title) || !Number.isSafeInteger(row.position) || row.position < 0 || row.position > 1e6 || !version(row.version) || !sequence(row.change_seq) || !timestamp2(row.created_at) || !timestamp2(row.updated_at) || row.deleted_at !== null && !timestamp2(row.deleted_at) || note && !uuid.test(row.group_id)) invalid2();
  if (own2(row, "deleted") && row.deleted !== (row.deleted_at !== null)) invalid2();
  if (own2(row, "active_note_count") && (!sequence(row.active_note_count) || row.active_note_count > 200)) invalid2();
}
function memoIndex(value) {
  if (!object(value) || value.can_edit !== true || !Array.isArray(value.groups) || value.groups.length > 32 || !Array.isArray(value.notes) || value.notes.length > 200) invalid2();
  const groups = /* @__PURE__ */ new Set(), notes = /* @__PURE__ */ new Set();
  for (const row of value.groups) {
    memoMeta(row);
    if (groups.has(row.id)) invalid2();
    groups.add(row.id);
  }
  for (const row of value.notes) {
    memoMeta(row, true);
    if (notes.has(row.id) || !groups.has(row.group_id)) invalid2();
    notes.add(row.id);
  }
  return structuredClone(value);
}
function memoDetail(row, id, index) {
  if (!identity(row, id, "memo_note") || row.can_edit !== true || !body(row.body)) invalid2();
  memoMeta(row, true);
  const metadata2 = index.notes.find((value) => value.id === id);
  const fields3 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id"];
  if (!metadata2 || fields3.some((key) => metadata2[key] !== row[key])) invalid2();
  return structuredClone(row);
}
function noteAbsence(value, local, id) {
  if (!object(value) || value.can_edit !== true || value.category !== local.category || value.date !== local.date || !Array.isArray(value.entries) || value.entries.length > 200) invalid2();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    noteRemote(row, row?.id);
    if (row.id === id || ids.has(row.id) || row.deleted || row.category !== local.category || row.date !== local.date) invalid2();
    ids.add(row.id);
  }
}
function conflictIdentity(conflict) {
  const operation2 = conflict?.operation, type = operation2?.entity_type, id = operation2?.source_id;
  if (!prefixes2[type] || !uuid.test(id) || typeof conflict.scope !== "string" || !conflict.scope || operation2.scope !== conflict.scope || operation2.entity_id !== prefixes2[type] + id || conflict.entity_id !== operation2.entity_id) invalid2();
  return { operation: operation2, type, id, scope: conflict.scope };
}
function createConflictPreparation({ readRemote, network }) {
  async function guarded(read, assertActive) {
    assertActive();
    const value = await read();
    assertActive();
    return value;
  }
  return async function prepare(conflict, { assertActive = () => {
  } } = {}) {
    assertActive();
    const { operation: operation2, type, id, scope } = conflictIdentity(conflict);
    if (type === "memo_group" || type === "memo_note") {
      const index = memoIndex(await guarded(() => network(scope, "/memos"), assertActive));
      if (type === "memo_group") {
        const row2 = index.groups.find((value) => value.id === id);
        return { remote: row2 ? { ...row2, can_edit: true } : null, groups: index.groups };
      }
      const row = await guarded(() => readRemote(operation2), assertActive);
      if (row === null) {
        if (index.notes.some((value) => value.id === id)) invalid2();
        return { remote: null, groups: index.groups };
      }
      return { remote: memoDetail(row, id, index), groups: index.groups };
    }
    const remote = await guarded(() => readRemote(operation2), assertActive);
    if (remote !== null) return { remote: type === "note_entry" ? noteRemote(remote, id) : basicRemote(remote, id, type), groups: [] };
    if (type === "note_entry") {
      const local = own2(conflict, "review_local") ? conflict.review_local : conflict.local;
      if (!object(local) || !["life", "work"].includes(local.category) || !day2(local.date)) invalid2();
      const path = "/note-entries?category=" + local.category + "&date=" + local.date;
      noteAbsence(await guarded(() => network(scope, path), assertActive), local, id);
    }
    return { remote: null, groups: [] };
  };
}

// web/offline/outbox.mjs
var RETRY_DELAYS = Object.freeze([5e3, 15e3, 6e4, 3e5]);
var prefixes3 = {
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuidPattern4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var active2 = (operation2) => !["acked", "archived"].includes(operation2.status);
var deleted = (value) => Boolean(value && (value.deleted || value.deleted_at));
var ordered = (rows) => rows.sort((a, b) => a.seq - b.seq);
var needsUpgrade = () => Object.assign(new Error("\u6B64\u672C\u673A\u64CD\u4F5C\u9700\u65B0\u7248\u9875\u9762\u5904\u7406\uFF0C\u539F\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002"), { code: "OFFLINE_UPGRADE_REQUIRED" });
function canonicalRoute(operation2) {
  const { entity_type: type, source_id: id, entity_id, method, path } = operation2;
  if (!uuidPattern4.test(id) || entity_id !== prefixes3[type] + id) return false;
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  if (["todo", "template"].includes(type)) {
    if (method === "POST") return path === base || type === "todo" && path === base + "/" + id + "/restore";
    return ["PATCH", "DELETE"].includes(method) && path === base + "/" + id;
  }
  return (method === "PUT" || type === "note_entry" && method === "DELETE") && path === base + "/" + id;
}
function dispatchCapabilities(options) {
  const types2 = new Set(options.enabledTypes || Object.keys(prefixes3));
  const protocols = new Set(options.supportedProtocols || [1, 2, 3]);
  const memoDependencies = (operation2) => options.supportedDependencies === true && operation2.entity_type === "memo_note" && operation2.method === "PUT" && uuidPattern4.test(operation2.body?.group_id) && Array.isArray(operation2.depends_on) && operation2.depends_on.length === 1 && operation2.depends_on[0] === "memo-group:" + operation2.body.group_id;
  const decision = (operation2) => {
    let origin;
    try {
      origin = JSON.parse(operation2.origin_conflict);
    } catch {
      return false;
    }
    return options.resolutionReceipts !== false && uuidPattern4.test(operation2.resolution_id) && operation2.resolution_receipt === 1 && Array.isArray(origin) && origin.length === 2 && origin[0] === operation2.scope && typeof origin[1] === "string" && origin[1].startsWith("conflict:") && (!Object.hasOwn(operation2, "depends_on") || memoDependencies(operation2));
  };
  const canDispatch = (operation2) => {
    const protocol = operation2?.protocol === void 0 ? 1 : operation2.protocol;
    return Boolean(operation2 && Object.hasOwn(prefixes3, operation2.entity_type) && types2.has(operation2.entity_type) && Number.isSafeInteger(protocol) && protocols.has(protocol) && canonicalRoute(operation2) && (protocol === 1 && !Object.hasOwn(operation2, "depends_on") || protocol === 2 && memoDependencies(operation2) || protocol === 3 && decision(operation2)));
  };
  const requireDispatch = (operation2) => {
    if (!canDispatch(operation2)) throw needsUpgrade();
  };
  return { canDispatch, requireDispatch };
}
function identity2(input, uuid4) {
  const prefix = prefixes3[input.entity_type];
  if (!prefix) throw new TypeError("This entity is read-only offline");
  const raw = input.entity_id || input.body?.id || uuid4();
  const id = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern4.test(id)) throw new TypeError("Offline entity requires a stable UUID");
  return { id: id.toLowerCase(), entity_id: prefix + id.toLowerCase() };
}
function operationFor(input, uuid4, time) {
  const initialStatus = input.initial_status || "queued";
  if (!["queued", "unknown"].includes(initialStatus)) throw new TypeError("Invalid initial offline operation status");
  if (initialStatus === "unknown" && (!uuidPattern4.test(input.body?.save_id) || !input.entity_id))
    throw new TypeError("Unknown operation import requires its original save_id and entity identity");
  const { id, entity_id } = identity2(input, uuid4), type = input.entity_type;
  const method = input.method?.toUpperCase();
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  const restore = type === "todo" && method === "POST" && input.path === base + "/" + id + "/restore";
  const create = ["todo", "template"].includes(type) && method === "POST" && !restore;
  const allowed = type === "todo" ? ["POST", "PATCH", "DELETE"] : type === "template" ? ["POST", "PATCH", "DELETE"] : type === "note_entry" ? ["PUT", "DELETE"] : ["PUT"];
  if (!allowed.includes(method)) throw new TypeError("Unsupported offline mutation");
  const path = create ? base : base + "/" + id + (restore ? "/restore" : "");
  if (input.path && input.path !== path) throw new TypeError("Offline mutation path does not match its entity");
  const body2 = structuredClone(input.body || {});
  if (typeof body2.text === "string") {
    body2.text = ["todo", "template"].includes(type) ? body2.text.trim() : body2.text.replace(/\r\n?/g, "\n");
  }
  if (typeof body2.title === "string") body2.title = body2.title.trim();
  if (typeof body2.body === "string") body2.body = body2.body.replace(/\r\n?/g, "\n");
  if (create) {
    if (body2.id && body2.id.toLowerCase() !== id) throw new TypeError("Client UUID cannot change");
    body2.id = id;
  }
  const expected = create ? 0 : body2.version;
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Offline mutation requires an expected version");
  }
  const saveId = body2.save_id || uuid4();
  if (!uuidPattern4.test(saveId)) throw new TypeError("Offline save_id requires a UUID");
  if (!["todo", "template"].includes(type)) body2.save_id = saveId.toLowerCase();
  else delete body2.save_id;
  const operation2 = {
    id: uuid4(),
    scope: input.scope,
    entity_type: type,
    entity_id,
    source_id: id,
    protocol: input.protocol === void 0 ? 1 : input.protocol,
    method,
    path,
    body: body2,
    expected_version: expected,
    save_id: saveId.toLowerCase(),
    created_at: time,
    attempts: 0,
    next_attempt_at: 0,
    status: initialStatus,
    base: input.base || null,
    local: { ...structuredClone(input.local || body2), id, version: expected + 1 },
    claim_owner: null,
    error: null
  };
  operation2.key = entityKey(input.scope, "operation:" + operation2.id);
  if (Object.hasOwn(input, "depends_on")) operation2.depends_on = structuredClone(input.depends_on);
  for (const field of ["resolution_id", "resolution_receipt", "origin_conflict"])
    if (Object.hasOwn(input, field)) operation2[field] = input[field];
  assertOfflineData(operation2);
  return operation2;
}
async function digest(value) {
  const canonical3 = (node) => Array.isArray(node) ? node.map(canonical3) : node && typeof node === "object" ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, canonical3(node[key])])) : node;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical3(value)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
}
async function memoHash(row, kind) {
  const fields3 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at"];
  if (kind === "memo_note") fields3.push("group_id", "body");
  return digest(Object.fromEntries(fields3.map((field) => [field, row[field]])));
}
function desired(operation2, remote) {
  if (!remote || remote.id !== operation2.source_id) return false;
  if (operation2.method === "DELETE") return deleted(remote);
  if (deleted(remote)) return false;
  const keys = operation2.entity_type === "todo" ? operation2.path.endsWith("/restore") ? ["date"] : operation2.method === "POST" ? ["date", "text", ...operation2.body.template_id ? ["template_id"] : []] : ["completed"] : operation2.entity_type === "template" ? ["text"] : Object.keys(operation2.body).filter((key) => !["version", "save_id"].includes(key));
  return keys.every((key) => remote[key] === operation2.body[key]);
}
function expectedFields(operation2, remote) {
  const base = operation2.base;
  if (!base) return true;
  const fields3 = operation2.entity_type === "todo" ? deleted(remote) ? ["date"] : ["date", "text"] : [];
  return fields3.every((key) => base[key] === void 0 || remote[key] === base[key]);
}
function completeNoteRow(remote) {
  const time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  return remote && uuidPattern4.test(remote.id) && ["life", "work"].includes(remote.category) && /^\d{4}-\d{2}-\d{2}$/.test(remote.date) && typeof remote.text === "string" && typeof remote.deleted === "boolean" && remote.can_edit === true && /^[a-f0-9]{64}$/.test(remote.content_hash) && Number.isSafeInteger(remote.change_seq) && remote.change_seq >= 0 && time(remote.created_at) && time(remote.updated_at) && (remote.deleted_at === null || time(remote.deleted_at)) && remote.deleted === (remote.deleted_at !== null);
}
function validAcknowledgement(operation2, remote) {
  if (operation2.entity_type === "note_entry" && !completeNoteRow(remote)) return false;
  if (operation2.entity_type === "template" && operation2.method === "DELETE") {
    return remote?.id === operation2.source_id && remote.deleted === true;
  }
  if (operation2.path.endsWith("/restore") && remote?.version === operation2.expected_version) {
    return desired(operation2, remote) && expectedFields(operation2, remote);
  }
  return Number.isSafeInteger(remote?.version) && remote.version === operation2.expected_version + 1 && desired(operation2, remote) && expectedFields(operation2, remote);
}
function createContext(options) {
  const { db, request, getScope, now = Date.now, uuid: uuid4 = () => crypto.randomUUID(), timeout = 2e4 } = options;
  const owner = uuid4();
  const state = { phase: "idle", pending: 0, unsupported: 0, error: null };
  const { canDispatch, requireDispatch } = dispatchCapabilities(options);
  const conflicts = createConflictStore({ db, now, canDispatch });
  const leaseKey = (scope) => entityKey(scope, "outbox-lease");
  const checkScope = (scope) => {
    if (getScope() !== scope) throw Object.assign(new Error("Offline identity changed"), { code: "OFFLINE_SCOPE_CHANGED" });
  };
  const list = (scope) => db.transaction(["outbox"], "readonly", async (tx) => ordered((await tx.getAll("outbox")).filter((value) => value.scope === scope && active2(value))));
  const retryable = async (scope) => {
    const rows = await list(scope), first = /* @__PURE__ */ new Map(), ready = [];
    for (const row of rows) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
    for (const row of first.values()) {
      if (!canDispatch(row) || !["queued", "unknown", "sending"].includes(row.status)) continue;
      const dependency = await dependencyState({ db }, row, rows);
      if (["ready", "deleted"].includes(dependency)) ready.push(row);
    }
    return ready;
  };
  async function lease(scope) {
    checkScope(scope);
    return db.transaction(["meta"], "readwrite", async (tx) => {
      const old = await tx.get("meta", leaseKey(scope));
      if (old && old.owner !== owner && old.expires_at > now()) return false;
      await tx.put("meta", { key: leaseKey(scope), owner, expires_at: now() + 9e4 });
      return true;
    });
  }
  async function network(scope, path, opts = {}, claim = true) {
    checkScope(scope);
    if (claim && !await lease(scope)) throw new Error("Offline sync lease changed");
    checkScope(scope);
    const controller = new AbortController();
    let timer;
    try {
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("Offline request outcome is unknown"), { code: "OFFLINE_TIMEOUT" }));
        }, timeout);
      });
      const result = await Promise.race([request(path, { ...opts, signal: controller.signal }), expired]);
      checkScope(scope);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  const readNetwork = (scope, path, opts = {}) => {
    if (!["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) throw new TypeError("Conflict preparation is read-only");
    return network(scope, path, opts, false);
  };
  return {
    db,
    request,
    getScope,
    now,
    uuid: uuid4,
    timeout,
    owner,
    conflicts,
    state,
    leaseKey,
    checkScope,
    list,
    lease,
    network,
    readNetwork,
    canDispatch,
    requireDispatch,
    retryable
  };
}
async function replayOperation(tx, operation2, input, all) {
  const replay = all.find((value) => value.save_id === operation2.save_id);
  if (!replay) return null;
  if (replay.entity_id !== operation2.entity_id || replay.path !== operation2.path || replay.method !== operation2.method || JSON.stringify(replay.body) !== JSON.stringify(operation2.body)) throw new Error("Offline save_id cannot change its original request");
  const entity = await tx.get("entities", entityKey(input.scope, replay.entity_id));
  if (!entity) throw new Error("Offline operation entity is missing");
  if (input.initial_status === "unknown" && replay.status === "queued") {
    await tx.put("outbox", { ...replay, status: "unknown" });
    return { operation: { ...replay, status: "unknown" }, entity };
  }
  return { operation: replay, entity };
}
async function noteCapacity(tx, operation2, old) {
  if (operation2.entity_type !== "note_entry" || operation2.expected_version !== 0 || operation2.status === "unknown" || old) return;
  let count = 0;
  for (const entity of await tx.getAll("entities")) {
    const row = entity.dirty ? entity.local : entity.server;
    if (entity.scope === operation2.scope && entity.entity_id.startsWith("note-entry:") && (entity.dirty || !entity.remote_missing) && row?.category === operation2.body.category && row?.date === operation2.body.date && !deleted(row)) count++;
  }
  if (count >= 200) throw Object.assign(new Error("\u672C\u673A\u5F53\u65E5\u8BB0\u5F55\u5DF2\u8FBE 200 \u6761\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002"), { code: "OFFLINE_CACHE_LIMIT" });
}
function storageMethods(context) {
  const { db, checkScope, uuid: uuid4, now, owner } = context;
  async function enqueueInTransaction(tx, input) {
    input.assertActive?.();
    checkScope(input.scope);
    const operation2 = operationFor(input, uuid4, now());
    context.requireDispatch(operation2);
    checkScope(input.scope);
    input.assertActive?.();
    const all = (await tx.getAll("outbox")).filter((value) => value.scope === input.scope);
    const replay = await replayOperation(tx, operation2, input, all);
    if (replay) {
      input.assertActive?.();
      return replay;
    }
    const rows = all.filter(active2);
    if (rows.length >= 1e3) throw new Error("Offline queue is full; this edit was not saved");
    const previous = ordered(rows.filter((value) => value.entity_id === operation2.entity_id)).at(-1);
    const conflict = rows.some((value) => value.entity_id === operation2.entity_id && value.status === "conflict");
    if (conflict || previous && operation2.expected_version !== previous.expected_version + 1) {
      throw new Error("Offline edits must use the preceding local version");
    }
    const sequenceKey = entityKey(input.scope, "outbox-sequence");
    const sequence2 = (await tx.get("meta", sequenceKey))?.value || 0;
    operation2.seq = sequence2 + 1;
    const key = entityKey(input.scope, operation2.entity_id), old = await tx.get("entities", key);
    await noteCapacity(tx, operation2, old);
    const visible = old?.dirty ? old.local : old?.server || operation2.base;
    operation2.base = operation2.base || old?.server || null;
    operation2.local = {
      ...visible,
      ...operation2.local,
      ...operation2.entity_type === "todo" && operation2.path === "/todos" ? { completed: false } : {},
      ...operation2.path.endsWith("/restore") ? { deleted: false, deleted_at: null } : {},
      ...operation2.method === "DELETE" ? { deleted: true } : {}
    };
    const entity = {
      ...old,
      key,
      scope: input.scope,
      entity_id: operation2.entity_id,
      server: old?.server || operation2.base,
      local: operation2.local,
      dirty: true
    };
    input.assertActive?.();
    await tx.put("entities", entity);
    await tx.put("outbox", operation2);
    await tx.put("meta", { key: sequenceKey, value: operation2.seq });
    input.assertActive?.();
    return { operation: operation2, entity };
  }
  async function enqueue(input) {
    return db.transaction(["entities", "outbox", "meta"], "readwrite", (tx) => enqueueInTransaction(tx, input));
  }
  async function update(operation2, fields3) {
    if (!context.canDispatch(operation2)) return null;
    return db.transaction(["outbox", "meta", "conflicts"], "readwrite", async (tx) => {
      const current = await tx.get("outbox", operation2.key);
      const held = await tx.get("meta", context.leaseKey(operation2.scope));
      if (!context.canDispatch(current) || held?.owner !== owner || !["queued", "unknown", "sending"].includes(current.status)) return null;
      if (!Object.hasOwn(fields3, "claim_owner") && current.claim_owner !== owner) return null;
      const result = { ...current, ...fields3 };
      await tx.put("outbox", result);
      if (fields3.status) await recordResolutionFailure(tx, result, fields3);
      return result;
    });
  }
  async function acknowledge(operation2, remote) {
    context.requireDispatch(operation2);
    if (operation2.entity_type === "note_entry" && !completeNoteRow(remote)) throw new Error("Incomplete note acknowledgement");
    checkScope(operation2.scope);
    await db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      checkScope(operation2.scope);
      const current = await tx.get("outbox", operation2.key);
      if (!context.canDispatch(current) || current.claim_owner !== owner || !["sending", "unknown"].includes(current.status)) {
        throw new Error("Offline operation claim changed");
      }
      const key = entityKey(operation2.scope, operation2.entity_id), entity = await tx.get("entities", key);
      const confirmed = operation2.entity_type === "template" && operation2.method === "DELETE" ? { ...operation2.base, ...entity.server, ...remote, version: operation2.expected_version + 1 } : remote;
      await tx.delete("outbox", operation2.key);
      const remaining = (await tx.getAll("outbox")).some((value) => value.scope === operation2.scope && value.entity_id === operation2.entity_id && active2(value));
      await tx.put("entities", {
        ...entity,
        server: confirmed,
        local: remaining ? entity.local : confirmed,
        dirty: remaining,
        conflict: null
      });
      await recordResolutionAck(tx, current, confirmed, now());
    });
  }
  return { enqueue, enqueueInTransaction, update, acknowledge };
}
function remoteMethods(context) {
  const { network } = context;
  async function readRemote(operation2) {
    const scope = operation2.scope, type = operation2.entity_type;
    if (type === "note_entry" || type === "memo_note") {
      try {
        return await network(scope, operation2.path);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    }
    if (type === "memo_group") {
      const index2 = await network(scope, "/memos");
      if (index2?.can_edit !== true || !Array.isArray(index2.groups)) throw new Error("Invalid memo index");
      const row2 = index2.groups.find((value) => value.id === operation2.source_id);
      return row2 ? { ...row2, can_edit: true } : null;
    }
    const path = type === "template" ? "/todo-templates" : "/todos?date=" + (operation2.body.date || operation2.base?.date || operation2.local.date);
    const index = await network(scope, path);
    if (!Array.isArray(index?.items)) throw new Error("Incomplete offline entity index");
    const row = index.items.find((value) => value.id === operation2.source_id);
    if (row || type === "template") return row || null;
    const day4 = operation2.body.date || operation2.base?.date || operation2.local.date;
    const snapshot = await network(scope, "/workbench-snapshot?date=" + day4);
    if (snapshot?.complete !== true || snapshot.scope_id !== scope || !Array.isArray(snapshot.data?.todos)) {
      throw new Error("Todo absence could not be verified completely");
    }
    return snapshot.data.todos.find((value) => value.source_id === operation2.source_id) ? { ...snapshot.data.todos.find((value) => value.source_id === operation2.source_id), id: operation2.source_id } : null;
  }
  return { readRemote };
}
function receiptMethods(context) {
  const { network, readRemote } = context;
  async function receiptRead(operation2) {
    const note = operation2.entity_type === "note_entry", scope = operation2.scope;
    const receiptPath = (note ? "/note-entries" : "/memos") + "/operations/" + operation2.save_id;
    const receipt = await network(scope, receiptPath);
    if (!receipt || typeof receipt.found !== "boolean") throw new Error("Invalid offline save receipt");
    const remote = await readRemote(operation2);
    if (receipt.found) {
      const hash = note ? remote?.content_hash : remote && await memoHash(remote, operation2.entity_type);
      const expectedHash = note ? receipt.content_hash : receipt.entity_hash;
      const kind = operation2.entity_type === "memo_note" ? "notes" : "groups";
      if (receipt.id === operation2.source_id && receipt.version === operation2.expected_version + 1 && (note || receipt.kind === kind) && remote?.can_edit === true && remote.version === receipt.version && hash === expectedHash && desired(operation2, remote)) {
        return { result: "ack", remote };
      }
      return { result: "conflict", remote };
    }
    if (!remote && operation2.expected_version === 0) {
      const path = note ? "/note-entries?category=" + operation2.body.category + "&date=" + operation2.body.date : "/memos";
      const index = await network(scope, path);
      if (index?.can_edit !== true) throw new Error("Offline editor capability could not be verified");
      const rows = note ? index.entries : operation2.entity_type === "memo_note" ? index.notes : index.groups;
      if (!Array.isArray(rows) || rows.some((value) => value.id === operation2.source_id)) {
        throw new Error("Offline create absence could not be verified");
      }
      return { result: "retry", remote };
    }
    if (remote?.can_edit === true && !deleted(remote) && remote.version === operation2.expected_version) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  return { receiptRead };
}
function processingMethods(context) {
  const { receiptRead, readRemote, acknowledge, update, network, conflicts, now, owner } = context;
  async function reconcile(operation2) {
    if (!["todo", "template"].includes(operation2.entity_type)) return receiptRead(operation2);
    const remote = await readRemote(operation2);
    if (remote && remote.version === operation2.expected_version + 1 && desired(operation2, remote) && expectedFields(operation2, remote)) return { result: "ack", remote };
    if (!remote && operation2.expected_version === 0) return { result: "retry", remote };
    if (operation2.path.endsWith("/restore") && remote?.version === operation2.expected_version && deleted(remote)) {
      return { result: "retry", remote };
    }
    if (remote && !deleted(remote) && remote.version === operation2.expected_version && expectedFields(operation2, remote)) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  async function fail5(operation2, error) {
    if ([409, 410, 404].includes(error.status)) {
      const current = await context.db.transaction(["outbox"], "readonly", (tx) => tx.get("outbox", operation2.key));
      if (!context.canDispatch(current)) return;
      let remote = null;
      try {
        remote = await readRemote(operation2);
      } catch {
      }
      return conflicts.record({ operation: operation2, remote, reason: deleted(remote) ? "deleted" : error.code || "version" });
    }
    const attempts = operation2.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error.status) ? "paused" : error.status && error.status < 500 && error.status !== 429 ? "blocked" : "unknown";
    return update(operation2, {
      status,
      attempts,
      next_attempt_at: now() + (error.status === 429 ? Math.max(6e4, delay) : delay),
      error: error.code || "OFFLINE_UNKNOWN"
    });
  }
  async function process(operation2) {
    if (!context.canDispatch(operation2)) return;
    try {
      const claimed = await update(operation2, { claim_owner: owner });
      if (!claimed) return;
      if (claimed.protocol === 3) {
        const origin = await context.db.transaction(["conflicts"], "readonly", (tx) => tx.get("conflicts", claimed.origin_conflict));
        if (!origin || origin.scope !== claimed.scope || origin.resolved_at !== null || origin.resolution?.id !== claimed.resolution_id || !origin.resolution.operation_keys.includes(claimed.key))
          throw Object.assign(new Error("\u672C\u673A\u9009\u62E9\u51ED\u636E\u4E0D\u5B8C\u6574\uFF0C\u539F\u8BF7\u6C42\u5DF2\u4FDD\u7559\u3002"), { status: 422, code: "OFFLINE_DECISION_EVIDENCE_MISSING" });
      }
      if (["unknown", "sending"].includes(operation2.status)) {
        const checked3 = await reconcile(claimed);
        if (checked3.result === "ack") return await acknowledge(claimed, checked3.remote);
        if (checked3.result === "conflict") return conflicts.record({
          operation: claimed,
          remote: checked3.remote,
          reason: deleted(checked3.remote) ? "deleted" : "version"
        });
      }
      const sending = await update(claimed, { status: "sending" });
      if (!sending) return;
      const remote = await network(operation2.scope, operation2.path, { method: operation2.method, body: operation2.body });
      if (!validAcknowledgement(operation2, remote)) throw new Error("Invalid offline write acknowledgement");
      return await acknowledge(sending, remote);
    } catch (error) {
      return fail5({ ...operation2, claim_owner: owner }, error);
    }
  }
  return { reconcile, fail: fail5, process };
}
async function dependencyState(context, operation2, rows) {
  if (!operation2.depends_on?.length) return "ready";
  if (operation2.depends_on.some((id) => rows.some((row) => row.entity_id === id && active2(row)))) return "pending";
  return context.db.transaction(["entities", "outbox"], "readonly", async (tx) => {
    for (const id of operation2.depends_on) {
      const parent = await tx.get("entities", entityKey(operation2.scope, id));
      if (deleted(parent?.server)) return "deleted";
      if (!parent?.server || parent.remote_missing || parent.server.version < 1) {
        const abandoned = operation2.protocol === 3 && (await tx.getAll("outbox")).some((row) => row.scope === operation2.scope && row.entity_id === id && row.resolution_id === operation2.resolution_id && row.status === "archived");
        return abandoned ? "deleted" : "unknown";
      }
    }
    return "ready";
  });
}
async function dependenciesReady(context, operation2, rows) {
  const state = await dependencyState(context, operation2, rows);
  if (state === "deleted") {
    const claimed = await context.update(operation2, { claim_owner: context.owner });
    if (claimed) {
      const entity = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", entityKey(operation2.scope, operation2.entity_id)));
      await context.conflicts.record({ operation: claimed, remote: entity?.server || null, reason: "MEMO_GROUP_UNAVAILABLE" });
    }
  }
  return state === "ready";
}
function executionMethods(context) {
  const { getScope, lease, state, list, checkScope, process, db, leaseKey, owner, now, retryable, canDispatch } = context;
  let running = null;
  async function run() {
    const scope = getScope();
    if (!scope) return { phase: "paused", pending: 0 };
    if (!await lease(scope)) return { phase: "busy", pending: (await list(scope)).length };
    state.phase = "syncing";
    state.error = null;
    try {
      for (let count = 0; count < 1e3; count++) {
        checkScope(scope);
        const rows = await list(scope);
        let operation2;
        for (const candidate of await retryable(scope)) {
          if (candidate.next_attempt_at <= now() && await dependenciesReady(context, candidate, rows)) {
            operation2 = candidate;
            break;
          }
        }
        if (!operation2) break;
        await process(operation2);
      }
      const pending = await list(scope);
      state.pending = pending.length;
      state.unsupported = pending.filter((value) => !canDispatch(value)).length;
      state.phase = state.unsupported ? "upgrade-required" : pending.some((value) => value.status === "conflict") ? "conflict" : pending.length ? "pending" : "synced";
      return { ...state };
    } catch (error) {
      state.phase = "paused";
      state.error = error.code || "OFFLINE_UNKNOWN";
      return { ...state };
    } finally {
      await db.transaction(["meta"], "readwrite", async (tx) => {
        if ((await tx.get("meta", leaseKey(scope)))?.owner === owner) await tx.delete("meta", leaseKey(scope));
      });
    }
  }
  function drain() {
    if (!running) running = run().finally(() => {
      running = null;
    });
    return running;
  }
  async function resume(scope) {
    checkScope(scope);
    return db.transaction(["outbox"], "readwrite", async (tx) => {
      checkScope(scope);
      let count = 0;
      for (const operation2 of await tx.getAll("outbox")) {
        if (operation2.scope === scope && canDispatch(operation2) && operation2.status === "paused") {
          await tx.put("outbox", { ...operation2, status: "unknown", next_attempt_at: 0, claim_owner: null });
          count++;
        }
      }
      return count;
    });
  }
  return { run, drain, resume };
}
function createOutbox(options) {
  const context = createContext(options);
  Object.assign(context, storageMethods(context));
  Object.assign(context, remoteMethods(context));
  Object.assign(context, receiptMethods(context));
  Object.assign(context, processingMethods(context));
  Object.assign(context, executionMethods(context));
  const preparationReads = remoteMethods({ ...context, network: context.readNetwork });
  const prepare = createConflictPreparation({ readRemote: preparationReads.readRemote, network: context.readNetwork });
  const decisions = createConflictDecisions({
    db: context.db,
    getScope: context.getScope,
    now: context.now,
    uuid: context.uuid,
    canDispatch: context.canDispatch,
    prepare,
    append: async (tx, inputs, { assertActive }) => {
      const result = [];
      for (const input of inputs) result.push(await context.enqueueInTransaction(tx, { ...input, assertActive }));
      return result;
    }
  });
  async function resolve(...args) {
    const scope = context.getScope();
    try {
      return await decisions.resolve(...args);
    } finally {
      if (scope && context.state.phase !== "syncing") await context.db.transaction(["meta"], "readwrite", async (tx) => {
        const key = context.leaseKey(scope), held = await tx.get("meta", key);
        if (held?.owner === context.owner) await tx.delete("meta", key);
      }).catch(() => {
      });
    }
  }
  context.conflicts.resolve = resolve;
  const { enqueue, drain, resume, list, state, conflicts, canDispatch, retryable } = context;
  return { enqueue, drain, resume, list, state, conflicts, canDispatch, retryable, resolve };
}

// web/offline/sync.mjs
var FORMAT = "haoduoyu-workbench-snapshot-v1";
var collections = ["todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos"];
var types = /* @__PURE__ */ new Set(["todo", "life_note", "work_note", "work_reminder", "memo_group", "memo_note"]);
var recordKeys = /* @__PURE__ */ new Set([
  "entity_id",
  "entity_type",
  "source",
  "source_id",
  "date",
  "category",
  "version",
  "change_seq",
  "created_at",
  "updated_at",
  "deleted_at",
  "content_hash",
  "text",
  "completed",
  "summary",
  "source_key",
  "title",
  "position",
  "body",
  "group_id"
]);
var hashPattern2 = /^[a-f0-9]{64}$/;
var datePattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
var supportedId = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note):/;
var SNAPSHOT_PULL_LIMITS = Object.freeze({
  maxEntities: 4e3,
  maxDates: 1e3,
  maxResponseBytes: 1048576,
  maxBatchBytes: 8388608,
  maxHashBytes: 8388608,
  maxRequests: 128
});
var stable2 = (value) => Array.isArray(value) ? value.map(stable2) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])])) : value;
var canonical2 = (value) => JSON.stringify(stable2(value));
var equal = (a, b) => canonical2(a) === canonical2(b);
var object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fail2(code, message, status) {
  throw Object.assign(new Error(message), { code, ...status ? { status } : {} });
}
function requireValue(condition, message = "\u5DE5\u4F5C\u53F0\u5FEB\u7167\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u672A\u8986\u76D6\u672C\u5730\u6570\u636E\u3002") {
  if (!condition) fail2("OFFLINE_SNAPSHOT_INVALID", message);
}
function day3(value) {
  requireValue(typeof value === "string" && datePattern.test(value));
  const parsed = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value);
  return value;
}
function stamp(value, nullable = false) {
  if (value === null && nullable) return;
  const parts = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(parts && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60 && Number.isFinite(Date.parse(value)) && (parts[5] === "Z" || Number(parts[5].slice(1, 3)) < 24 && Number(parts[5].slice(4)) < 60));
  day3(parts[1]);
}
function identity3(scope, getScope) {
  if (getScope() !== scope) fail2("OFFLINE_SCOPE_CHANGED", "\u5F53\u524D\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5B9E\uFF1B\u539F\u672C\u5730\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
}
function budget(limits, crypto2) {
  let bytes = 0, hashBytes = 0, requests = 0;
  const encoder = new TextEncoder();
  return {
    response(value) {
      let text;
      try {
        text = JSON.stringify(value);
      } catch {
        fail2("OFFLINE_SNAPSHOT_INVALID", "\u5DE5\u4F5C\u53F0\u5FEB\u7167\u65E0\u6CD5\u89E3\u6790\u3002");
      }
      requireValue(typeof text === "string");
      const size = encoder.encode(text).byteLength;
      bytes += size;
      if (size > limits.maxResponseBytes || bytes > limits.maxBatchBytes) fail2("OFFLINE_SNAPSHOT_LIMIT", "\u672C\u6B21\u5B8C\u6574\u5FEB\u7167\u8D85\u8FC7\u672C\u673A\u8BFB\u53D6\u9884\u7B97\uFF0C\u672A\u8986\u76D6\u672C\u5730\u6570\u636E\u3002", 413);
    },
    request() {
      if (++requests > limits.maxRequests) fail2("OFFLINE_SNAPSHOT_LIMIT", "\u672C\u6B21\u5B8C\u6574\u5FEB\u7167\u8BF7\u6C42\u6570\u8D85\u8FC7\u9884\u7B97\uFF0C\u672A\u8986\u76D6\u672C\u5730\u6570\u636E\u3002", 413);
    },
    async hash(value) {
      const input = encoder.encode(canonical2(value));
      hashBytes += input.byteLength;
      if (hashBytes > limits.maxHashBytes) fail2("OFFLINE_SNAPSHOT_LIMIT", "\u672C\u6B21\u5B8C\u6574\u5FEB\u7167\u54C8\u5E0C\u9884\u7B97\u4E0D\u8DB3\uFF0C\u672A\u8986\u76D6\u672C\u5730\u6570\u636E\u3002", 413);
      if (!crypto2?.subtle) fail2("OFFLINE_CRYPTO_UNAVAILABLE", "\u65E0\u6CD5\u6838\u5B9E\u5FEB\u7167\u54C8\u5E0C\uFF0C\u672A\u8986\u76D6\u672C\u5730\u6570\u636E\u3002");
      const digest2 = await crypto2.subtle.digest("SHA-256", input);
      return [...new Uint8Array(digest2)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
    }
  };
}
function metadata(row) {
  return {
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    date: row.date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    content_hash: row.content_hash
  };
}
function envelope(value, scope, limits) {
  if (object2(value) && value.scope_id !== scope) fail2("OFFLINE_SCOPE_CHANGED", "\u5FEB\u7167\u8EAB\u4EFD\u8303\u56F4\u4E0E\u5DF2\u6838\u5B9E\u8303\u56F4\u4E0D\u540C\uFF0C\u539F\u672C\u5730\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
  requireValue(object2(value) && value.snapshot_format === FORMAT && value.projection === "current" && value.complete === true && value.scope_id === scope && value.timezone === "Asia/Shanghai" && hashPattern2.test(value.manifest_hash) && hashPattern2.test(value.global_content_hash) && Array.isArray(value.entities) && value.entities.length <= limits.maxEntities);
  stamp(value.generated_at);
  const seen = /* @__PURE__ */ new Set();
  let previous = "";
  for (const row of value.entities) {
    requireValue(object2(row) && Object.keys(row).sort().join(",") === "content_hash,date,deleted_at,entity_id,entity_type,updated_at" && typeof row.entity_id === "string" && row.entity_id.length > 0 && row.entity_id.length <= 256 && !seen.has(row.entity_id) && row.entity_id > previous && types.has(row.entity_type) && hashPattern2.test(row.content_hash));
    if (row.date !== null) day3(row.date);
    stamp(row.updated_at);
    stamp(row.deleted_at, true);
    seen.add(row.entity_id);
    previous = row.entity_id;
  }
  return value;
}
async function indexFor(value, scope, limits, readBudget) {
  envelope(value, scope, limits);
  requireValue(Array.isArray(value.dates) && value.dates.length <= limits.maxDates && value.index_hash === value.manifest_hash);
  const represented = new Set(value.entities.filter((row) => row.date !== null).map((row) => row.date));
  let previous = "";
  for (const row of value.dates) {
    requireValue(object2(row) && Object.keys(row).sort().join(",") === "content_hash,date" && day3(row.date) > previous && hashPattern2.test(row.content_hash) && represented.has(row.date));
    previous = row.date;
    represented.delete(row.date);
    requireValue(row.content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((entity) => entity.date === row.date) }));
  }
  requireValue(represented.size === 0);
  requireValue(value.manifest_hash === await readBudget.hash({ snapshot_format: FORMAT, scope_id: scope, entities: value.entities }));
  requireValue(value.global_content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((row) => row.date === null) }));
  return value;
}
function sameIndex(a, b) {
  return a.scope_id === b.scope_id && a.manifest_hash === b.manifest_hash && a.global_content_hash === b.global_content_hash && equal(a.entities, b.entities) && equal(a.dates, b.dates);
}
async function detailFor(value, date, index, limits, readBudget) {
  envelope(value, index.scope_id, limits);
  requireValue(value.date === date && value.manifest_hash === index.manifest_hash && value.global_content_hash === index.global_content_hash && equal(value.entities, index.entities) && object2(value.data) && Object.keys(value.data).sort().join(",") === [...collections].sort().join(",") && hashPattern2.test(value.content_hash) && hashPattern2.test(value.date_content_hash));
  const expected = new Map(index.entities.filter((row) => row.date === null || row.date === date).map((row) => [row.entity_id, row])), records = [];
  for (const name of collections) {
    const rows = value.data[name];
    requireValue(Array.isArray(rows));
    let previous = "";
    for (const row of rows) {
      requireValue(object2(row) && Object.keys(row).every((key) => recordKeys.has(key)) && row.entity_id > previous && expected.has(row.entity_id) && equal(metadata(row), expected.get(row.entity_id)) && typeof row.source === "string" && typeof row.source_id === "string" && Number.isSafeInteger(row.version) && row.version >= 1);
      stamp(row.created_at, true);
      if (row.change_seq !== void 0) requireValue(Number.isSafeInteger(row.change_seq) && row.change_seq >= 0);
      const { content_hash, ...content2 } = row;
      requireValue(content_hash === await readBudget.hash(content2));
      previous = row.entity_id;
      expected.delete(row.entity_id);
      records.push(row);
    }
  }
  requireValue(expected.size === 0);
  const dateEntities = index.entities.filter((row) => row.date === date);
  requireValue(value.date_content_hash === await readBudget.hash({ scope_id: index.scope_id, entities: dateEntities }));
  requireValue(value.content_hash === await readBudget.hash({ snapshot_format: FORMAT, scope_id: index.scope_id, date, timezone: "Asia/Shanghai", data: value.data }));
  return records;
}
async function applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now }) {
  await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
    identity3(scope, getScope);
    const current = await tx.get("meta", key);
    if (!equal(current ?? null, initial.meta ?? null)) fail2("OFFLINE_SNAPSHOT_CHANGED", "\u5176\u4ED6\u9875\u9762\u5DF2\u66F4\u65B0\u672C\u5730\u5FEB\u7167\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
    const all = (await tx.getAll("entities")).filter((row) => row.scope === scope), manifest = new Set(index.entities.map((row) => row.entity_id));
    for (const record of records.values()) {
      const storageKey = entityKey(scope, record.entity_id), old = await tx.get("entities", storageKey);
      if (old?.server?.version > record.version) fail2("OFFLINE_SNAPSHOT_CHANGED", "\u672C\u5730\u5DF2\u786E\u8BA4\u8F83\u65B0\u7248\u672C\uFF0C\u672A\u8986\u76D6\u8BE5\u7248\u672C\u3002");
      const server = { ...record, id: record.source_id }, sameVersion = old?.server?.version === record.version;
      if (record.entity_type === "todo" && sameVersion) {
        for (const field of ["template_id", "template_version", "template_active"]) {
          if (Object.hasOwn(old.server, field)) server[field] = old.server[field];
        }
      }
      await tx.put("entities", {
        ...old,
        key: storageKey,
        scope,
        entity_id: record.entity_id,
        server,
        snapshot_hash: record.content_hash,
        remote_missing: false,
        synced_at: now(),
        ...record.entity_type === "todo" ? { needs_api_refresh: !sameVersion || old?.needs_api_refresh === true } : {}
      });
    }
    for (const row of all) if (row.server && supportedId.test(row.entity_id) && !manifest.has(row.entity_id)) {
      if (!equal(row.server, cached.get(row.entity_id)?.server ?? null))
        fail2("OFFLINE_SNAPSHOT_CHANGED", "\u5176\u4ED6\u9875\u9762\u521A\u786E\u8BA4\u4E86\u8BB0\u5F55\uFF0C\u672A\u628A\u5B83\u5224\u4E3A\u7EBF\u4E0A\u7F3A\u5931\u3002");
      await tx.put("entities", { ...row, server: null, snapshot_hash: null, remote_missing: true, synced_at: now() });
    }
    identity3(scope, getScope);
    await tx.put("meta", { key, value: { index, verified_at: now() } });
  });
}
function createSnapshotSync({ db, request, getScope, now = Date.now, crypto: crypto2 = globalThis.crypto, limits = {} }) {
  if (!db?.transaction || typeof request !== "function" || typeof getScope !== "function") throw new TypeError("Snapshot sync dependencies required");
  limits = { ...SNAPSHOT_PULL_LIMITS, ...limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(SNAPSHOT_PULL_LIMITS, key) || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Invalid snapshot pull limit");
  }
  const state = { status: "idle", last_success: null, error: null };
  let inFlight = null;
  async function run({ date: probeDate } = {}) {
    const scope = getScope();
    if (typeof scope !== "string" || !hashPattern2.test(scope)) fail2("OFFLINE_SCOPE_REQUIRED", "\u8BF7\u5148\u8054\u7F51\u6838\u5B9E\u5F53\u524D\u8EAB\u4EFD\u8303\u56F4\u3002");
    const key = JSON.stringify([scope, "snapshot"]), readBudget = budget(limits, crypto2);
    const initial = await db.transaction(["entities", "meta"], "readonly", async (tx) => ({
      meta: await tx.get("meta", key),
      entities: (await tx.getAll("entities")).filter((row) => row.scope === scope)
    }));
    identity3(scope, getScope);
    async function get(path) {
      identity3(scope, getScope);
      readBudget.request();
      const value = await request(path);
      identity3(scope, getScope);
      readBudget.response(value);
      return value;
    }
    const index = await indexFor(await get("/workbench-snapshot/index"), scope, limits, readBudget);
    const previous = initial.meta?.value?.index;
    const oldDates = new Map(previous?.scope_id === scope ? previous.dates.map((row) => [row.date, row.content_hash]) : []);
    const dates = new Map(index.dates.map((row) => [row.date, row.content_hash]));
    const changed = new Set([.../* @__PURE__ */ new Set([...oldDates.keys(), ...dates.keys()])].filter((date) => oldDates.get(date) !== dates.get(date)));
    const cached = new Map(initial.entities.map((row) => [row.entity_id, row]));
    let needGlobal = !previous || previous.global_content_hash !== index.global_content_hash;
    for (const entity of index.entities) {
      const row = cached.get(entity.entity_id);
      if (!row?.server || row.snapshot_hash !== entity.content_hash) {
        if (entity.date === null) needGlobal = true;
        else changed.add(entity.date);
      }
    }
    if (!changed.size && needGlobal && index.entities.some((row) => row.date === null))
      changed.add(probeDate === void 0 ? new Date(now() + 8 * 36e5).toISOString().slice(0, 10) : day3(probeDate));
    if (changed.size + 2 > limits.maxRequests) fail2("OFFLINE_SNAPSHOT_LIMIT", "\u53D8\u5316\u65E5\u671F\u8FC7\u591A\uFF0C\u672A\u8FD4\u56DE\u90E8\u5206\u540C\u6B65\u7ED3\u679C\u3002", 413);
    const records = /* @__PURE__ */ new Map();
    for (const date of [...changed].sort()) {
      const rows = await detailFor(await get("/workbench-snapshot?date=" + encodeURIComponent(date)), date, index, limits, readBudget);
      for (const row of rows) {
        if (records.has(row.entity_id)) requireValue(equal(records.get(row.entity_id), row));
        records.set(row.entity_id, row);
      }
    }
    const verified = await indexFor(await get("/workbench-snapshot/index"), scope, limits, readBudget);
    if (!sameIndex(index, verified)) fail2("OFFLINE_SNAPSHOT_CHANGED", "\u8BFB\u53D6\u671F\u95F4\u7EBF\u4E0A\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u7A0D\u540E\u91CD\u65B0\u6838\u5BF9\uFF1B\u672C\u5730\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
    identity3(scope, getScope);
    await applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now });
    state.last_success = now();
    return { status: "synced", scope, changed_dates: [...changed].sort(), entities: index.entities.length };
  }
  function pull(options) {
    if (inFlight) return inFlight;
    state.status = "pulling";
    state.error = null;
    inFlight = run(options).then((result) => {
      state.status = "synced";
      return result;
    }, (error) => {
      state.status = error.code === "OFFLINE_SCOPE_CHANGED" ? "scope-changed" : "error";
      state.error = { code: error.code || "OFFLINE_SNAPSHOT_NETWORK", status: error.status || null, message: error.message };
      throw error;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  let stopTriggers = () => {
  };
  function start({
    window = globalThis.window,
    document = globalThis.document,
    setInterval: setInterval2 = globalThis.setInterval,
    clearInterval: clearInterval2 = globalThis.clearInterval
  } = {}) {
    stopTriggers();
    const refresh = () => {
      if (!document || document.visibilityState !== "hidden") pull().catch(() => {
      });
    };
    window?.addEventListener?.("online", refresh);
    document?.addEventListener?.("visibilitychange", refresh);
    const timer = setInterval2(refresh, 3e5);
    stopTriggers = () => {
      window?.removeEventListener?.("online", refresh);
      document?.removeEventListener?.("visibilitychange", refresh);
      clearInterval2(timer);
    };
    refresh();
    return stopTriggers;
  }
  return { pull, state, start, stop: () => stopTriggers() };
}

// web/offline/note-mutations.mjs
var uuid2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var failure2 = (message, code = "OFFLINE_INVALID_MUTATION") => Object.assign(new Error(message), { code, localNotSaved: true });
function noteMutationRoute(path, options, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method = (options.method || "GET").toUpperCase();
  return features.notes && match && uuid2.test(match[1]) && ["PUT", "DELETE"].includes(method) ? { type: "note_entry", id: match[1].toLowerCase(), method } : null;
}
function checked(body2, method) {
  const fields3 = method === "PUT" ? ["category", "date", "text", "version", "save_id"] : ["version", "save_id"];
  if (!body2 || Object.keys(body2).sort().join(",") !== fields3.sort().join(",") || !uuid2.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < (method === "PUT" ? 0 : 1) || body2.version >= Number.MAX_SAFE_INTEGER)
    throw failure2("\u4FDD\u5B58\u5B57\u6BB5\u6216\u539F\u4FDD\u5B58\u6807\u8BC6\u4E0D\u5B8C\u6574\uFF0C\u672C\u6B21\u4FEE\u6539\u672A\u4FDD\u5B58\u3002");
  if (method === "PUT") {
    const day4 = /* @__PURE__ */ new Date(body2.date + "T00:00:00Z");
    if (!["life", "work"].includes(body2.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body2.date) || !Number.isFinite(day4.getTime()) || day4.toISOString().slice(0, 10) !== body2.date || typeof body2.text !== "string" || !body2.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body2.text) || new TextEncoder().encode(body2.text.replace(/\r\n?/g, "\n")).byteLength > 65536)
      throw failure2("\u5206\u7C7B\u3001\u65E5\u671F\u6216\u6B63\u6587\u65E0\u6548\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002");
  }
  return structuredClone(body2);
}
function createNoteMutations(context) {
  async function mutate(path, options, route, guard) {
    const { state, cache, outbox, now } = context, owner = state.scope, generation = context.generation;
    const active4 = () => {
      guard();
      if (!owner || owner !== state.scope || generation !== context.generation)
        throw failure2("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u6B21\u4FEE\u6539\u672A\u4FDD\u5B58\u3002", "OFFLINE_SCOPE_CHANGED");
    };
    active4();
    const body2 = checked(options.body, route.method);
    if (!await cache.noteCapability()) throw failure2("\u8BF7\u5148\u8054\u7F51\u6838\u5B9E\u788E\u788E\u5FF5\u7F16\u8F91\u80FD\u529B\u3002", "OFFLINE_SCOPE_REQUIRED");
    active4();
    const stored = await cache.entity("note-entry:" + route.id), visible = offlineValue(stored);
    active4();
    if (route.method === "PUT" && body2.version === 0 && !visible) {
      const existing = await cache.entities();
      active4();
      if (existing.filter((row) => row.entity_id.startsWith("note-entry:") && (row.dirty ? row.local : row.server)?.category === body2.category && (row.dirty ? row.local : row.server)?.date === body2.date && !(row.dirty ? row.local : row.server)?.deleted && !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure2("\u672C\u673A\u8BE5\u65E5\u8BB0\u5F55\u5DF2\u8FBE 200 \u6761\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002", "OFFLINE_CACHE_LIMIT");
    }
    if (!options.offlineUnknown && body2.version !== (visible?.version || 0))
      throw failure2("\u672C\u673A\u5DF2\u6709\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u540E\u4FDD\u5B58\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002", "OFFLINE_CACHE_CHANGED");
    if (route.method === "DELETE" && !visible) throw failure2("\u6B64\u8BB0\u5F55\u5C1A\u672A\u4FDD\u5B58\u5728\u672C\u673A\u3002", "OFFLINE_CACHE_MISS");
    if (visible && route.method === "PUT" && (visible.category !== body2.category || visible.date !== body2.date))
      throw failure2("\u8BB0\u5F55\u7684\u5206\u7C7B\u548C\u65E5\u671F\u4E0D\u53EF\u66F4\u6539\u3002");
    const stamp2 = new Date(now()).toISOString();
    const local = {
      ...visible,
      ...body2,
      id: route.id,
      can_edit: true,
      deleted: route.method === "DELETE",
      created_at: visible?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: route.method === "DELETE" ? stamp2 : null
    };
    let result;
    try {
      result = await outbox.enqueue({
        scope: owner,
        entity_type: "note_entry",
        entity_id: route.id,
        method: route.method,
        path,
        body: body2,
        base: stored?.server || null,
        local,
        initial_status: options.offlineUnknown ? "unknown" : "queued",
        assertActive: active4
      });
    } catch (error) {
      error.localNotSaved = true;
      if (!error.code) error.code = "OFFLINE_STORAGE_UNAVAILABLE";
      throw error;
    }
    active4();
    if (["acked", "archived"].includes(result.operation.status) && result.entity.server?.can_edit !== void 0)
      return result.entity.server;
    await context.refresh();
    context.broadcast();
    if (context.online()) context.scheduleRetry();
    return localDocument({ local: result.entity.local, server: stored?.api_server || (stored?.server?.can_edit !== void 0 ? stored.server : null), operation: result.operation });
  }
  return { mutate };
}

// web/offline/drafts.mjs
var fields = [
  "kind",
  "id",
  "category",
  "date",
  "draft",
  "version",
  "serverText",
  "contentHash",
  "createdAt",
  "updatedAt",
  "dirty",
  "phase",
  "pending",
  "remote",
  "localVersion",
  "durableText",
  "localBacked",
  "localQueued",
  "recoveredBaseline"
];
var unresolved = (row) => row.dirty || row.pending || ["unknown", "conflict", "error", "oversize"].includes(row.phase);
function safeDraft(row) {
  if (!row || !["legacy", "note_entry"].includes(row.kind) || !["life", "work"].includes(row.category) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== "string" || row.draft.length > 262144 || row.kind === "note_entry" && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error("\u672C\u673A\u8349\u7A3F\u5B57\u6BB5\u65E0\u6548\u3002");
  return Object.fromEntries(fields.filter((key) => row[key] !== void 0).map((key) => [key, structuredClone(row[key])]));
}
function createDraftJournal({ db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID() }) {
  const pending = /* @__PURE__ */ new Set();
  async function write(rows) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return;
    const clean = rows.map(safeDraft);
    const active4 = () => {
      if (owner !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u65E7\u8349\u7A3F\u4FDD\u6301\u539F\u8303\u56F4\u3002"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active4();
      for (const row of clean) {
        const identity4 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key = entityKey(owner, "draft:" + row.kind + ":" + identity4 + ":" + draftOwner);
        if (unresolved(row)) await tx.put("meta", { key, scope: owner, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now() });
        else if (row.kind === "note_entry") {
          await tx.delete("meta", key);
          for (const old of await tx.getAll("meta")) if (old.scope === owner && old.draft_kind === "note_entry" && old.data.id === row.id && old.data.draft === row.draft && !old.data.pending) await tx.delete("meta", old.key);
        }
      }
      active4();
    });
  }
  function capture(rows) {
    const work = write(rows);
    pending.add(work);
    work.finally(() => pending.delete(work)).catch(() => {
    });
    return work;
  }
  async function list(kind) {
    const owner = getScope(), generation = getGeneration();
    if (!owner) return [];
    const rows = await db.transaction(["meta"], "readonly", async (tx) => (await tx.getAll("meta")).filter((row) => row.scope === owner && row.draft_kind === kind).sort((a, b) => b.saved_at - a.saved_at).map((row) => row.data));
    return owner === getScope() && generation === getGeneration() ? rows : [];
  }
  return { capture, list, flush: () => Promise.all([...pending]) };
}

// web/offline/conflict-draft-guards.mjs
var factories = /* @__PURE__ */ new Set();
function captureConflictDraftGuard(entity_id) {
  const checks = [...factories].map((factory) => factory(entity_id)).filter(Boolean);
  if (checks.some((check) => typeof check !== "function")) throw new TypeError("Conflict draft guard must return a function");
  return () => {
    for (const check of checks) check();
  };
}

// web/offline/memos.mjs
var uuid3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var active3 = (value) => !["archived", "acked"].includes(value.status);
var fail3 = (message, code = "OFFLINE_MEMO_INVALID") => Object.assign(new Error(message), { code });
var keyFor = (scope, kind, id) => entityKey(scope, (kind === "notes" ? "memo-note:" : "memo-group:") + id);
var fields2 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id", "body"];
function memoRoute(path) {
  if (path === "/memos") return { kind: "index" };
  const match = /^\/memos\/(notes|groups)\/([a-f0-9-]{36})$/i.exec(path);
  return match && uuid3.test(match[2]) ? { kind: match[1], id: match[2].toLowerCase() } : null;
}
function checked2(row, kind, detail = false) {
  if (!row || !uuid3.test(row.id) || typeof row.title !== "string" || !row.title.trim() || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.position) || kind === "notes" && (!uuid3.test(row.group_id) || detail && typeof row.body !== "string")) {
    throw fail3("\u5907\u5FD8\u5F55\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u672A\u8986\u76D6\u672C\u673A\u5185\u5BB9\u3002");
  }
  return Object.fromEntries(fields2.filter((field) => row[field] !== void 0).map((field) => [field, row[field]]));
}
function memoDocument(entity, records, canEdit, index = false) {
  const value = offlineValue(entity);
  if (!value || entity.remote_missing && !entity.dirty) return null;
  const operation2 = records.operations.filter((row) => row.entity_id === entity.entity_id && active3(row)).at(-1) || null;
  const conflict = records.conflicts.find((row) => row.entity_id === entity.entity_id && row.resolved_at === null) || null;
  const local = { ...value, id: value.id || value.source_id, can_edit: canEdit };
  if (!entity.dirty && entity.remote_index?.version > value.version) {
    if (index) return { ...entity.remote_index, can_edit: canEdit };
    if (!entity.remote_index.deleted_at) throw fail3("\u6B63\u6587\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u540E\u7F16\u8F91\u3002", "OFFLINE_CACHE_MISS");
    return localDocument({ local: { ...local, deleted_at: entity.remote_index.deleted_at }, server: entity.server });
  }
  if (!entity.dirty && !operation2 && !conflict) return local;
  return localDocument({ local, server: entity.server || null, operation: operation2, conflict });
}
function scoped(context, assertActive = () => {
}) {
  assertActive();
  const scope = context.getScope(), generation = context.getGeneration();
  if (!scope) throw fail3("\u8BF7\u5148\u8054\u7F51\u6838\u5B9E\u5DE5\u4F5C\u53F0\uFF0C\u672C\u673A\u7B14\u8BB0\u4ECD\u4FDD\u7559\u3002", "OFFLINE_SCOPE_REQUIRED");
  return { scope, check() {
    assertActive();
    if (context.getScope() !== scope || context.getGeneration() !== generation)
      throw fail3("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8F93\u5165\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_CHANGED");
  } };
}
function checkedInput(raw, kind, createId) {
  const body2 = structuredClone(raw || {});
  if (!body2.save_id) body2.save_id = createId();
  const fields3 = ["title", "position", "version", "save_id", ...kind === "notes" ? ["group_id", "body"] : []];
  const plain2 = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const invalid3 = () => {
    throw Object.assign(fail3("\u5907\u5FD8\u5F55\u5B57\u6BB5\u65E0\u6548\uFF0C\u8F93\u5165\u4ECD\u4FDD\u7559\u3002"), { status: 400 });
  };
  if (Object.keys(body2).sort().join(",") !== fields3.sort().join(",") || !uuid3.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < 0 || body2.version >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(body2.position) || body2.position < 0 || body2.position > 1e6 || !plain2(body2.title) || !body2.title.trim() || [...body2.title.trim()].length > 120 || /[\r\n\t]/.test(body2.title)) invalid3();
  body2.title = body2.title.trim();
  if (kind === "notes") {
    if (!uuid3.test(body2.group_id) || !plain2(body2.body)) invalid3();
    body2.body = body2.body.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(body2.body).length > 65536) invalid3();
  }
  return body2;
}
function memoReads(context) {
  async function project(path) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route || route.kind === "groups") throw fail3("\u6B64\u5907\u5FD8\u5F55\u5C1A\u672A\u7F13\u5B58\u3002", "OFFLINE_CACHE_MISS");
    const result = await context.db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      guard.check();
      const cap = await tx.get("meta", entityKey(guard.scope, "memo-capability"));
      const entities = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      const records = {
        operations: (await tx.getAll("outbox")).filter((row) => row.scope === guard.scope),
        conflicts: (await tx.getAll("conflicts")).filter((row) => row.scope === guard.scope)
      };
      const canEdit = cap?.can_edit === true;
      if (route.kind === "notes") {
        const entity = entities.find((row) => row.key === keyFor(guard.scope, "notes", route.id));
        if (!entity || typeof offlineValue(entity)?.body !== "string") throw fail3("\u8BF7\u8054\u7F51\u8BFB\u53D6\u6B64\u7B14\u8BB0\u6B63\u6587\u3002", "OFFLINE_CACHE_MISS");
        const document = memoDocument(entity, records, canEdit);
        if (!document) throw fail3("\u7B14\u8BB0\u5DF2\u4E0D\u5728\u5F53\u524D\u7F13\u5B58\u8303\u56F4\u3002", "OFFLINE_CACHE_MISS");
        guard.check();
        return document;
      }
      const values = (kind) => entities.filter((row) => row.entity_id.startsWith(kind === "groups" ? "memo-group:" : "memo-note:")).map((row) => memoDocument(row, records, canEdit, true)).filter(Boolean).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const data = {
        groups: values("groups"),
        notes: values("notes"),
        can_edit: canEdit,
        ...cap?.draft_scope ? { draft_scope: cap.draft_scope } : {}
      };
      guard.check();
      return data;
    });
    guard.check();
    return result;
  }
  return { project };
}
function memoCache(context) {
  const serverFence3 = (rows, route) => JSON.stringify(rows.filter((row) => row.server && row.entity_id.startsWith("memo-") && (route.kind === "index" || row.entity_id === "memo-note:" + route.id)).map((row) => [row.entity_id, Object.fromEntries(fields2.map((field) => [field, row.server[field]]))]).sort((a, b) => a[0].localeCompare(b[0])));
  async function fence(path) {
    const guard = scoped(context), route = memoRoute(path);
    const rows = await context.db.transaction(["entities"], "readonly", (tx) => tx.getAll("entities"));
    guard.check();
    return serverFence3(rows.filter((row) => row.scope === guard.scope), route);
  }
  async function remember(path, value, { baseline } = {}) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route) return value;
    if (route.kind === "index" && (!Array.isArray(value?.groups) || !Array.isArray(value.notes) || typeof value.can_edit !== "boolean")) throw fail3("\u5907\u5FD8\u5F55\u7D22\u5F15\u4E0D\u5B8C\u6574\uFF0C\u672A\u8986\u76D6\u672C\u673A\u5185\u5BB9\u3002");
    await context.db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      guard.check();
      const initial = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      if (baseline !== void 0 && baseline !== serverFence3(initial, route))
        throw fail3("\u672C\u673A\u521A\u786E\u8BA4\u4E86\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5907\u5FD8\u5F55\u3002", "OFFLINE_CACHE_CHANGED");
      const collections2 = route.kind === "index" ? [["groups", value.groups], ["notes", value.notes]] : [[route.kind, [value]]];
      for (const [kind, rows] of collections2) for (const raw of rows) {
        const server = checked2(raw, kind, route.kind === "notes"), key = keyFor(guard.scope, kind, server.id);
        const old = await tx.get("entities", key);
        if (old?.server?.version > server.version) throw fail3("\u672C\u673A\u5DF2\u6709\u8F83\u65B0\u5907\u5FD8\u5F55\uFF0C\u8BF7\u91CD\u8BFB\u3002", "OFFLINE_CACHE_CHANGED");
        const complete = kind === "groups" || typeof server.body === "string";
        const stored = complete ? server : old?.server?.version === server.version ? { ...old.server, ...server } : old?.server || server;
        await tx.put("entities", {
          ...old,
          key,
          scope: guard.scope,
          entity_id: (kind === "groups" ? "memo-group:" : "memo-note:") + server.id,
          server: stored,
          remote_index: server,
          remote_missing: false
        });
      }
      if (route.kind === "index") await tx.put("meta", {
        key: entityKey(guard.scope, "memo-capability"),
        can_edit: value.can_edit,
        ...value.draft_scope ? { draft_scope: value.draft_scope } : {},
        verified_at: context.now()
      });
      guard.check();
    });
    guard.check();
    return context.project(path);
  }
  return { remember, fence };
}
function memoWrites(context) {
  async function mutate(path, options, assertActive) {
    const route = memoRoute(path), guard = scoped(context, assertActive);
    if (!route || !["notes", "groups"].includes(route.kind) || options.method?.toUpperCase() !== "PUT") {
      throw fail3("\u5907\u5FD8\u5F55\u5220\u9664\u548C\u6062\u590D\u9700\u8054\u7F51\u786E\u8BA4\u3002", "OFFLINE_UNSUPPORTED");
    }
    const body2 = checkedInput(options.body, route.kind, context.uuid);
    const cap = await context.db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(guard.scope, "memo-capability")));
    guard.check();
    if (cap?.can_edit !== true) throw fail3("\u8BF7\u5148\u8054\u7F51\u786E\u8BA4\u5907\u5FD8\u5F55\u7F16\u8F91\u6743\u9650\u3002", "OFFLINE_SCOPE_REQUIRED");
    const key = keyFor(guard.scope, route.kind, route.id);
    const old = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", key));
    guard.check();
    const visible = offlineValue(old);
    if (visible?.deleted_at || visible?.deleted) throw fail3("\u7B14\u8BB0\u5DF2\u5220\u9664\uFF0C\u8BF7\u8054\u7F51\u6838\u5BF9\u540E\u6062\u590D\u3002", "OFFLINE_MEMO_DELETED");
    const local = {
      ...visible,
      ...body2,
      id: route.id,
      version: body2.version + 1,
      created_at: visible?.created_at || new Date(context.now()).toISOString(),
      updated_at: new Date(context.now()).toISOString(),
      deleted_at: null
    };
    const result = await context.outbox.enqueue({
      scope: guard.scope,
      entity_type: route.kind === "notes" ? "memo_note" : "memo_group",
      entity_id: route.id,
      method: "PUT",
      path,
      body: body2,
      base: old?.server || null,
      local,
      assertActive: guard.check,
      ...route.kind === "notes" ? { protocol: 2, depends_on: ["memo-group:" + body2.group_id] } : {},
      ...options.offlineUnknown ? { initial_status: "unknown" } : {}
    });
    guard.check();
    return localDocument({
      local: { ...result.entity.local, can_edit: true },
      server: result.entity.server,
      operation: result.operation,
      conflict: null
    });
  }
  return { mutate };
}
function createMemoOfflineAdapter(options) {
  const context = { getGeneration: () => 0, now: Date.now, uuid: () => crypto.randomUUID(), ...options };
  Object.assign(context, memoReads(context), memoCache(context), memoWrites(context));
  return { project: context.project, remember: context.remember, mutate: context.mutate, fence: context.fence };
}

// web/offline/runtime.mjs
var OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: true });
var scopePattern = /^[a-f0-9]{64}$/;
var uuidPattern5 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var networkFailure = (error) => error?.code === "NETWORK_UNAVAILABLE" || error?.code === "OFFLINE_NETWORK";
var fail4 = (message, code) => Object.assign(new Error(message), { code });
var today = (now) => new Date(now() + 8 * 36e5).toISOString().slice(0, 10);
var offlineError = () => fail4("\u5F53\u524D\u79BB\u7EBF\uFF0C\u6B64\u64CD\u4F5C\u9700\u8054\u7F51\uFF1B\u8F93\u5165\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_NETWORK");
async function identityProbe(context, path, options = {}) {
  const controller = new AbortController(), external = options.signal;
  const abort = () => controller.abort(external.reason);
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(fail4("\u8EAB\u4EFD\u8303\u56F4\u6838\u5B9E\u6682\u672A\u5B8C\u6210\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_NETWORK"));
        controller.abort();
      }, 1e4);
    });
    return await Promise.race([context.request(path, { ...options, signal: controller.signal }), expired]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}
function writableRoute(path, options, features) {
  if (!features.todos) return null;
  const method = (options.method || "GET").toUpperCase();
  if (["/todos", "/todo-templates"].includes(path) && method === "POST")
    return { type: path === "/todos" ? "todo" : "template", create: true };
  const match = /^\/(todos|todo-templates)\/([a-f0-9-]{36})(\/restore)?$/i.exec(path);
  if (!match || !uuidPattern5.test(match[2])) return null;
  if (match[3] && (method !== "POST" || match[1] !== "todos") || !match[3] && !["PATCH", "DELETE"].includes(method)) return null;
  return { type: match[1] === "todos" ? "todo" : "template", id: match[2].toLowerCase(), restore: Boolean(match[3]) };
}
function checkedBody(route, options, uuid4) {
  const body2 = structuredClone(options.body || {}), method = (options.method || "GET").toUpperCase();
  const required = route.create ? route.type === "todo" ? ["id", "date", "text"] : ["id", "text"] : route.type === "todo" ? route.restore || method === "DELETE" ? ["date", "version"] : ["completed", "version"] : method === "DELETE" ? ["version"] : ["text", "version"];
  if (route.create && !body2.id) body2.id = uuid4();
  const allowed = [...required, ...route.create && route.type === "todo" ? ["template_id"] : []];
  if (required.some((key) => !Object.hasOwn(body2, key)) || Object.keys(body2).some((key) => !allowed.includes(key)))
    throw fail4("\u8BF7\u6C42\u5B57\u6BB5\u4E0D\u5B8C\u6574\uFF0C\u672C\u6B21\u64CD\u4F5C\u672A\u4FDD\u5B58\u3002", "OFFLINE_INVALID_MUTATION");
  if (body2.id && !uuidPattern5.test(body2.id) || body2.template_id && !uuidPattern5.test(body2.template_id))
    throw fail4("\u4E8B\u9879\u6807\u8BC6\u65E0\u6548\uFF0C\u672C\u6B21\u64CD\u4F5C\u672A\u4FDD\u5B58\u3002", "OFFLINE_INVALID_MUTATION");
  if (body2.date && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body2.date) || !Number.isFinite(Date.parse(body2.date + "T00:00:00Z")) || (/* @__PURE__ */ new Date(body2.date + "T00:00:00Z")).toISOString().slice(0, 10) !== body2.date))
    throw fail4("\u8BF7\u9009\u62E9\u6709\u6548\u65E5\u671F\u3002", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body2, "text") && (typeof body2.text !== "string" || !body2.text.trim() || body2.text.length > 500 || body2.text.includes("\0")))
    throw fail4("\u8BF7\u586B\u5199 1\u2013500 \u5B57\u7684\u5185\u5BB9\u3002", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body2, "completed") && typeof body2.completed !== "boolean")
    throw fail4("\u5B8C\u6210\u72B6\u6001\u65E0\u6548\u3002", "OFFLINE_INVALID_MUTATION");
  if (!route.create && (!Number.isSafeInteger(body2.version) || body2.version < 1 || body2.version >= Number.MAX_SAFE_INTEGER))
    throw fail4("\u7248\u672C\u65E0\u6548\uFF0C\u672C\u6B21\u64CD\u4F5C\u672A\u4FDD\u5B58\u3002", "OFFLINE_INVALID_MUTATION");
  return body2;
}
function runtimeContext(options) {
  const {
    db,
    request,
    now = Date.now,
    uuid: uuid4 = () => crypto.randomUUID(),
    online = () => globalThis.navigator?.onLine !== false,
    onIdentity = () => {
    },
    features = OFFLINE_FEATURES
  } = options;
  const state = {
    scope: null,
    verifiedScope: null,
    identity: null,
    online: online(),
    phase: "idle",
    pending: 0,
    conflicts: 0,
    unsupported: 0,
    lastSuccess: null,
    cachedAt: null,
    error: null,
    ready: true
  };
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const callback of listeners) callback({ ...state });
  };
  const cache = createOfflineCache({ db, getScope: () => state.scope, getGeneration: () => context.generation, now });
  const context = {
    db,
    request,
    now,
    uuid: uuid4,
    online,
    onIdentity,
    features,
    state,
    cache,
    emit,
    listeners,
    generation: 0,
    authFlight: null,
    syncFlight: null,
    timer: null,
    channel: null,
    stopped: false
  };
  const send = async (path, opts) => {
    if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase()) && !writableRoute(path, opts, features) && !noteMutationRoute(path, opts, features) && !(features.memos && memoRoute(path) && opts.method.toUpperCase() === "PUT"))
      throw fail4("\u6B64\u672C\u673A\u64CD\u4F5C\u9700\u65B0\u7248\u9875\u9762\u5904\u7406\uFF0C\u539F\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_UPGRADE_REQUIRED");
    if (!online() || !state.verifiedScope || state.verifiedScope !== state.scope) throw offlineError();
    const owner = state.scope, generation = context.generation;
    try {
      if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state.verifiedScope || owner !== state.scope || generation !== context.generation) throw offlineError();
      const result = await request(path, opts);
      if (owner !== state.scope || generation !== context.generation) throw fail4("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\u3002", "OFFLINE_SCOPE_CHANGED");
      return result;
    } catch (error) {
      if ([401, 403].includes(error.status) && generation === context.generation) await context.invalidate({ forget: true });
      throw error;
    }
  };
  context.outbox = createOutbox({
    db,
    request: send,
    getScope: () => state.scope,
    now,
    uuid: uuid4,
    timeout: options.timeout,
    enabledTypes: [
      ...features.todos ? ["todo", "template"] : [],
      ...features.notes ? ["note_entry"] : [],
      ...features.memos ? ["memo_note", "memo_group"] : []
    ],
    supportedProtocols: features.memos ? [1, 2, 3] : [1, 3],
    supportedDependencies: features.memos === true,
    resolutionReceipts: true
  });
  context.snapshot = createSnapshotSync({ db, request: send, getScope: () => state.scope, now });
  context.memos = createMemoOfflineAdapter({
    db,
    cache,
    outbox: context.outbox,
    getScope: () => state.scope,
    getGeneration: () => context.generation,
    now,
    uuid: uuid4
  });
  return context;
}
function identityActions(context) {
  const { cache, state, emit, request, onIdentity } = context;
  async function invalidate({ forget = false } = {}) {
    context.generation++;
    context.authFlight = null;
    state.scope = null;
    state.verifiedScope = null;
    state.identity = null;
    state.pending = 0;
    state.conflicts = 0;
    state.unsupported = 0;
    state.phase = "paused";
    if (forget) await cache.forgetIdentity();
    emit();
  }
  async function adopt(me, index, generation) {
    const identity4 = safeIdentity(me);
    if (generation !== context.generation) throw fail4("\u8EAB\u4EFD\u8BFB\u53D6\u5DF2\u8FC7\u671F\u3002", "OFFLINE_SCOPE_CHANGED");
    if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== "current")
      throw fail4("\u8EAB\u4EFD\u8303\u56F4\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8054\u7F51\u91CD\u8BD5\u3002", "OFFLINE_SCOPE_REQUIRED");
    if (state.scope && (state.scope !== index.scope_id || identityFingerprint(state.identity) !== identityFingerprint(identity4))) {
      await invalidate({ forget: true });
      throw fail4("\u5F53\u524D\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u539F\u672C\u673A\u5185\u5BB9\u4E0E\u961F\u5217\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u3002", "OFFLINE_SCOPE_CHANGED");
    }
    await cache.saveIdentity(identity4, index.scope_id);
    if (generation !== context.generation || state.scope && state.scope !== index.scope_id) {
      await invalidate({ forget: true });
      throw fail4("\u8EAB\u4EFD\u6838\u5B9E\u5DF2\u8FC7\u671F\uFF0C\u539F\u672C\u673A\u6570\u636E\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_CHANGED");
    }
    state.scope = index.scope_id;
    state.verifiedScope = index.scope_id;
    state.identity = identity4;
    state.online = true;
    state.error = null;
    onIdentity(me);
    emit();
    return me;
  }
  async function authenticate(options = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, "/auth/me", options);
      liveIdentity = safeIdentity(me);
      const index = await identityProbe(context, "/workbench-snapshot/index");
      return await adopt(me, index, generation);
    } catch (error) {
      if (generation !== context.generation) throw fail4("\u8EAB\u4EFD\u6838\u5B9E\u5DF2\u8FC7\u671F\u3002", "OFFLINE_SCOPE_CHANGED");
      state.verifiedScope = null;
      if ([401, 403].includes(error.status)) {
        await invalidate({ forget: true });
        throw error;
      }
      if (!networkFailure(error)) throw error;
      const cached = await cache.readIdentity();
      if (generation !== context.generation || !cached?.identity || !scopePattern.test(cached.scope)) throw error;
      if (liveIdentity && identityFingerprint(liveIdentity) !== identityFingerprint(cached.identity)) {
        await invalidate({ forget: true });
        throw fail4("\u5F53\u524D\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u8054\u7F51\u6838\u5B9E\u540E\u91CD\u65B0\u6253\u5F00\u3002", "OFFLINE_SCOPE_CHANGED");
      }
      state.scope = cached.scope;
      state.identity = safeIdentity(cached.identity);
      state.online = false;
      state.phase = "offline";
      emit();
      return { ...state.identity, offlineIdentity: true };
    }
  }
  function verify() {
    if (!context.authFlight) {
      const flight = authenticate().finally(() => {
        if (context.authFlight === flight) context.authFlight = null;
      });
      context.authFlight = flight;
    }
    return context.authFlight;
  }
  async function verifyScope() {
    if (!state.identity || !state.verifiedScope) return verify();
    const generation = context.generation, owner = state.scope;
    try {
      const index = await identityProbe(context, "/workbench-snapshot/index");
      if (generation !== context.generation || state.scope !== owner || index?.scope_id !== owner || index.complete !== true || index.projection !== "current") {
        await invalidate({ forget: true });
        throw fail4("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u673A\u5185\u5BB9\u4E0E\u961F\u5217\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_CHANGED");
      }
      return state.identity;
    } catch (error) {
      state.verifiedScope = null;
      if ([401, 403].includes(error.status)) await invalidate({ forget: true });
      throw error;
    }
  }
  return { authenticate, verify, verifyScope, invalidate };
}
function stateActions(context) {
  const { state, outbox, emit, online } = context;
  async function refresh() {
    const sequence2 = context.refreshSequence = (context.refreshSequence || 0) + 1;
    if (!state.scope) {
      emit();
      return { ...state };
    }
    const owner = state.scope, generation = context.generation;
    const [pending, conflicts] = await Promise.all([outbox.list(owner), outbox.conflicts.list(owner)]);
    if (sequence2 !== context.refreshSequence || owner !== state.scope || generation !== context.generation) return { ...state };
    state.pending = pending.length;
    state.conflicts = conflicts.length;
    state.online = online() && state.online;
    state.unsupported = pending.filter((row) => !outbox.canDispatch(row)).length;
    if (state.phase !== "syncing") state.phase = state.unsupported ? "upgrade-required" : conflicts.length ? "conflict" : state.online ? pending.length ? "pending" : "synced" : "offline";
    emit();
    return { ...state };
  }
  async function queue() {
    if (!state.scope) return { operations: [], conflicts: [] };
    const owner = state.scope, generation = context.generation;
    const result = { operations: await outbox.list(owner), conflicts: await outbox.conflicts.list(owner) };
    result.operations = result.operations.map((row) => outbox.canDispatch(row) ? row : { ...row, needs_upgrade: true });
    result.conflicts = result.conflicts.map((row) => outbox.canDispatch(row.operation) ? row : { ...row, needs_upgrade: true });
    return owner === state.scope && generation === context.generation ? result : { operations: [], conflicts: [] };
  }
  async function resolve(key, choice, options = {}) {
    if (!state.scope) throw fail4("\u8BF7\u5148\u6838\u5B9E\u8EAB\u4EFD\u3002", "OFFLINE_SCOPE_REQUIRED");
    const conflict = (await outbox.conflicts.list(state.scope)).find((row) => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail4("\u6B64\u672C\u673A\u64CD\u4F5C\u9700\u65B0\u7248\u9875\u9762\u5904\u7406\uFF0C\u539F\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002", "OFFLINE_UPGRADE_REQUIRED");
    const owner = state.scope, generation = context.generation;
    const checkDraft = captureConflictDraftGuard(conflict?.entity_id);
    const active4 = () => {
      if (options.signal?.aborted) throw new DOMException("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "AbortError");
      if (owner !== state.scope || generation !== context.generation) throw fail4("\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u539F\u6587\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_CHANGED");
      checkDraft();
    };
    active4();
    await context.verifyScope();
    active4();
    const result = await outbox.resolve(key, choice, {
      scope: owner,
      assertActive: active4,
      expected: options.expected,
      copyConfirmed: options.copyConfirmed
    });
    await refresh();
    context.broadcast();
    if (result.resolution?.state === "queued" && context.online()) context.scheduleRetry();
    return result;
  }
  return { refresh, queue, resolve };
}
function syncActions(context) {
  const { state, emit, outbox, snapshot, now, online } = context;
  async function run() {
    if (!online()) {
      state.verifiedScope = null;
      return context.refresh();
    }
    if (context.cooldownUntil > now()) {
      context.scheduleRetry();
      return context.refresh();
    }
    try {
      await context.verify();
      if (!state.verifiedScope) return context.refresh();
      state.phase = "syncing";
      emit();
      await outbox.resume(state.scope);
      await outbox.drain();
      if (state.verifiedScope) await context.cache.captureDocuments();
      if (state.verifiedScope) {
        await snapshot.pull({ date: today(now) });
        if (context.lastTodoPath) {
          const date = offlineReadRoute(context.lastTodoPath).date;
          if ((await context.cache.entities()).some((row) => row.needs_api_refresh && row.server?.date === date))
            await context.call(context.lastTodoPath);
        }
      }
      state.lastSuccess = now();
      state.error = null;
    } catch (error) {
      state.error = error.message;
      if (error.status === 429) context.cooldownUntil = now() + 6e4;
      if (error.status) state.online = true;
      else if (networkFailure(error)) state.online = false;
    }
    state.phase = "idle";
    await context.refresh();
    context.broadcast();
    if (state.pending && state.online && !context.stopped) context.scheduleRetry();
    return { ...state };
  }
  function sync() {
    if (!context.syncFlight) context.syncFlight = run().finally(() => {
      context.syncFlight = null;
    });
    return context.syncFlight;
  }
  function scheduleRetry() {
    clearTimeout(context.timer);
    const owner = state.scope;
    if (!owner) return;
    outbox.retryable(owner).then((operations) => {
      if (context.stopped || state.scope !== owner) return;
      if (!operations.length) return;
      const next = Math.min(...operations.map((row) => row.next_attempt_at || 0));
      const delay = Math.max(100, next - now(), (context.cooldownUntil || 0) - now());
      clearTimeout(context.timer);
      context.timer = setTimeout(() => {
        if (!context.stopped) void sync();
      }, delay);
      context.timer?.unref?.();
    }).catch((error) => {
      state.error = error.message;
      emit();
    });
  }
  return { sync, scheduleRetry };
}
async function unmanaged(context, path, options, guard) {
  try {
    guard();
    return await context.request(path, options);
  } catch (error) {
    if ([401, 403].includes(error.status)) await context.invalidate({ forget: true });
    throw error;
  }
}
async function mutateMemo(context, path, options, guard) {
  const value = await context.memos.mutate(path, options, guard);
  guard();
  await context.refresh();
  context.broadcast();
  if (context.online()) context.scheduleRetry();
  return value;
}
async function rememberRead(context, path, value, baseline, memo) {
  if (memo) return context.memos.remember(path, value, { baseline });
  try {
    return await context.cache.write(path, value, { baseline });
  } catch (error) {
    if (["OFFLINE_RESPONSE_INVALID", "OFFLINE_SCOPE_CHANGED", "OFFLINE_CACHE_CHANGED"].includes(error.code)) throw error;
    context.state.error = error.message;
    context.emit();
    return value;
  }
}
function mutationActions(context) {
  const { state, cache, now, uuid: uuid4, outbox, features } = context;
  async function mutate(path, options, route, guard) {
    guard();
    if (!state.scope || !state.identity) throw fail4("\u8BF7\u5148\u8054\u7F51\u8BFB\u53D6\u6B64\u5DE5\u4F5C\u53F0\uFF0C\u518D\u4FDD\u5B58\u79BB\u7EBF\u5185\u5BB9\u3002", "OFFLINE_SCOPE_REQUIRED");
    const owner = state.scope, generation = context.generation;
    const active4 = () => {
      guard();
      if (owner !== state.scope || generation !== context.generation)
        throw fail4("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u6B21\u4FEE\u6539\u672A\u4FDD\u5B58\uFF0C\u8F93\u5165\u5DF2\u4FDD\u7559\u3002", "OFFLINE_SCOPE_CHANGED");
    };
    const body2 = checkedBody(route, options, uuid4), id = route.id || body2.id;
    const old = await cache.entity(route.type + ":" + id), base = old?.server || null, visible = offlineValue(old);
    active4();
    if (!route.create && !visible) throw fail4("\u6B64\u4E8B\u9879\u5C1A\u672A\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u540E\u518D\u64CD\u4F5C\u3002", "OFFLINE_CACHE_MISS");
    const stamp2 = new Date(now()).toISOString(), method = options.method.toUpperCase();
    const local = {
      ...visible,
      ...body2,
      id,
      created_at: visible?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: method === "DELETE" ? stamp2 : route.restore ? null : visible?.deleted_at || null,
      ...route.create ? { completed: false, ...route.type === "template" ? { completed_days: 0, habit_status: "todo" } : {} } : {},
      ...route.restore ? { deleted: false } : {}
    };
    if (body2.template_id) {
      const template = offlineValue(await cache.entity("template:" + body2.template_id));
      active4();
      if (!template || template.deleted) throw fail4("\u5E38\u7528\u5F85\u529E\u5C1A\u672A\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u3002", "OFFLINE_CACHE_MISS");
      local.template_version = template.version;
      local.template_active = true;
    }
    active4();
    const { entity } = await outbox.enqueue({
      scope: owner,
      entity_type: route.type,
      entity_id: id,
      method,
      path,
      body: body2,
      base,
      local,
      assertActive: active4
    });
    active4();
    await context.refresh();
    context.broadcast();
    if (context.online()) context.scheduleRetry();
    return structuredClone(entity.local);
  }
  async function call(path, input = {}, readRetried = false) {
    const { offlineGuard: guard = () => {
    }, ...options } = input;
    guard();
    const method = (options.method || "GET").toUpperCase(), route = writableRoute(path, options, features);
    const memo = features.memos && memoRoute(path);
    const noteRoute = noteMutationRoute(path, options, features);
    if (noteRoute) return context.noteMutations.mutate(path, options, noteRoute, guard);
    if (path === "/auth/me" && method === "GET") return options.context || options.signal ? context.authenticate(options) : context.verify();
    if (["/auth/login", "/auth/logout"].includes(path) && method === "POST") {
      const value = await context.request(path, options);
      await context.invalidate({ forget: true });
      return value;
    }
    if (route) return mutate(path, options, route, guard);
    if (memo && method === "PUT") return mutateMemo(context, path, options, guard);
    if (method !== "GET" || !offlineReadRoute(path)) return unmanaged(context, path, options, guard);
    if (offlineReadRoute(path).kind === "todo") context.lastTodoPath = path;
    try {
      if (context.online() && state.identity) await context.verifyScope();
      guard();
      const owner = state.scope, generation = context.generation;
      const baseline = owner ? await (memo ? context.memos.fence(path) : cache.fence(path)) : void 0;
      guard();
      const value = await context.request(path, options);
      guard();
      if (owner !== state.scope || generation !== context.generation) throw fail4("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u672C\u6B21\u8BFB\u53D6\u5DF2\u53D6\u6D88\u3002", "OFFLINE_SCOPE_CHANGED");
      if (offlineReadRoute(path).kind === "todo") state.partial = false;
      if (!state.scope) return value;
      return await rememberRead(context, path, value, baseline, memo);
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        await context.invalidate({ forget: true });
        throw error;
      }
      if (error.code === "OFFLINE_CACHE_CHANGED" && !readRetried) return call(path, input, true);
      if (!networkFailure(error)) throw error;
      state.verifiedScope = null;
      state.online = false;
      if (memo) {
        const value = await context.memos.project(path);
        guard();
        await context.refresh();
        return value;
      }
      const cached = await cache.read(path);
      const kind = offlineReadRoute(path).kind;
      if (kind === "overview") state.cachedAt = cached.saved_at;
      if (kind === "todo") state.partial = cached.data.offline_partial === true;
      const data = ["legacy", ...!features.notes ? ["note_entries", "note_entry"] : [], "memos", "memo_note"].includes(kind) ? { ...cached.data, can_edit: false, ...Array.isArray(cached.data.entries) ? { entries: cached.data.entries.map((entry) => ({ ...entry, can_edit: false })) } : {} } : cached.data;
      await context.refresh();
      return data;
    }
  }
  return { call, mutate };
}
function lifecycleActions(context) {
  let stop = () => {
  };
  const broadcast = () => context.channel?.postMessage({ type: "changed", scope: context.state.scope });
  function start({ window = globalThis.window, document = globalThis.document, BroadcastChannel = globalThis.BroadcastChannel } = {}) {
    stop();
    context.stopped = false;
    const sync = () => {
      if (document?.visibilityState !== "hidden") void context.sync();
    };
    const offline = () => {
      context.state.verifiedScope = null;
      void context.refresh();
    };
    window?.addEventListener("online", sync);
    window?.addEventListener("focus", sync);
    window?.addEventListener("haoduoyu:sync-request", sync);
    window?.addEventListener("offline", offline);
    document?.addEventListener("visibilitychange", sync);
    const timer = setInterval(sync, 3e5);
    timer?.unref?.();
    if (BroadcastChannel) {
      context.channel = new BroadcastChannel("haoduoyu-offline-status-v1");
      context.channel.onmessage = (event) => {
        if (event.data?.type === "changed" && event.data.scope === context.state.scope) void context.refresh();
      };
    }
    stop = () => {
      context.stopped = true;
      clearTimeout(context.timer);
      clearInterval(timer);
      context.channel?.close();
      context.channel = null;
      window?.removeEventListener("online", sync);
      window?.removeEventListener("focus", sync);
      window?.removeEventListener("haoduoyu:sync-request", sync);
      window?.removeEventListener("offline", offline);
      document?.removeEventListener("visibilitychange", sync);
    };
    sync();
    return stop;
  }
  return { start, stop: () => stop(), broadcast };
}
function createOfflineRuntime(options) {
  const context = runtimeContext(options);
  Object.assign(context, identityActions(context), stateActions(context), syncActions(context), lifecycleActions(context));
  Object.assign(context, mutationActions(context));
  context.noteMutations = createNoteMutations(context);
  const drafts = createDraftJournal({ db: context.db, getScope: () => context.state.scope, getGeneration: () => context.generation, now: context.now });
  return {
    call: context.call,
    sync: context.sync,
    start: context.start,
    stop: context.stop,
    refresh: context.refresh,
    readMemo: (path) => context.memos.project(path),
    queue: context.queue,
    resolve: context.resolve,
    invalidate: context.invalidate,
    state: context.state,
    localRead: async (path) => (await context.cache.read(path)).data,
    retainDrafts: drafts.capture,
    retainedDrafts: drafts.list,
    flushDrafts: drafts.flush,
    subscribe(callback) {
      context.listeners.add(callback);
      callback({ ...context.state });
      return () => context.listeners.delete(callback);
    }
  };
}
var singleton = null;
var initialization = null;
var readyListeners = /* @__PURE__ */ new Set();
function getOfflineRuntime() {
  return singleton;
}
function onOfflineRuntime(callback) {
  readyListeners.add(callback);
  if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
async function offlineRequest(path, options, request, onIdentity, assertActive = () => {
}) {
  if (!initialization) initialization = openOfflineDB().then((db) => {
    singleton = createOfflineRuntime({ db, request, onIdentity });
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  let runtime;
  try {
    runtime = await initialization;
  } catch {
    assertActive();
    if (writableRoute(path, options, OFFLINE_FEATURES) || noteMutationRoute(path, options, OFFLINE_FEATURES) || OFFLINE_FEATURES.memos && memoRoute(path) && options.method?.toUpperCase() === "PUT")
      throw fail4("\u6D4F\u89C8\u5668\u65E0\u6CD5\u4FDD\u5B58\u672C\u673A\u6570\u636E\uFF0C\u672C\u6B21\u4FEE\u6539\u672A\u4FDD\u5B58\uFF1B\u8F93\u5165\u5DF2\u4FDD\u7559\u3002", "OFFLINE_STORAGE_UNAVAILABLE");
    return request(path, options);
  }
  assertActive();
  const managed = offlineReadRoute(path) || writableRoute(path, options, OFFLINE_FEATURES) || noteMutationRoute(path, options, OFFLINE_FEATURES) || ["/auth/me", "/auth/login", "/auth/logout"].includes(path);
  if (!managed) return runtime.call(path, { ...options, offlineGuard: assertActive });
  const { envelope: envelope2 = false, ...opts } = options;
  const value = await runtime.call(path, { ...opts, offlineGuard: assertActive });
  return envelope2 ? { data: value } : value;
}
export {
  OFFLINE_FEATURES,
  createOfflineRuntime,
  getOfflineRuntime,
  offlineRequest,
  onOfflineRuntime
};
