var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// local-ui/frontend/web/core/constants.mjs
var platforms, modeLabels, kindLabels, statusLabels, slotLabels, writerLabels, illustratorLabels, metrics, nav, settingsTabs, legacyPages, defaultFilters, articleColumns, articleChoices, defaultColumns;
var init_constants = __esm({
  "local-ui/frontend/web/core/constants.mjs"() {
    platforms = { toutiao: "\u4ECA\u65E5\u5934\u6761", zhihu: "\u77E5\u4E4E", wechat: "\u5FAE\u4FE1\u516C\u4F17\u53F7", other: "\u5176\u4ED6\u5E73\u53F0" };
    modeLabels = { manual: "\u4EBA\u5DE5", automatic: "\u81EA\u52A8\u5316", mixed: "\u4EBA\u5DE5\uFF0B\u81EA\u52A8\u5316", unknown: "\u672A\u8BB0\u5F55" };
    kindLabels = { latest: "\u6700\u65B0\u6570\u636E", d1: "\u7B2C 1 \u5929\u89C2\u5BDF", d3: "\u7B2C 3 \u5929\u89C2\u5BDF", d7: "\u7B2C 7 \u5929\u89C2\u5BDF" };
    statusLabels = { drafting: "\u8D77\u8349\u4E2D", illustrated: "\u5DF2\u914D\u56FE", draft_saved: "\u8349\u7A3F\u5DF2\u5B58", published: "\u5DF2\u53D1\u5E03", failed: "\u53D7\u963B" };
    slotLabels = { zh1: "\u77E5\u4E4E 1", zh2: "\u77E5\u4E4E 2", tt1: "\u5934\u6761 1", tt2: "\u5934\u6761 2", zh3: "\u77E5\u4E4E 3", tt3: "\u5934\u6761 3", gzh: "\u516C\u4F17\u53F7" };
    writerLabels = { dedao: "\u5F97\u5230\u5927\u8111", gemini_web: "Gemini", human: "\u672C\u4EBA", other: "\u5176\u4ED6" };
    illustratorLabels = { codex: "Codex", pil: "PIL", human: "\u672C\u4EBA" };
    metrics = { reads: "\u9605\u8BFB", impressions: "\u5C55\u73B0", likes: "\u70B9\u8D5E", comments: "\u8BC4\u8BBA", favorites: "\u6536\u85CF", shares: "\u5206\u4EAB", approvals: "\u8D5E\u540C", reading_users: "\u9605\u8BFB\u4EBA\u6570" };
    nav = [
      { id: "review", label: "\u5185\u5BB9\u590D\u76D8", icon: "chart" },
      { id: "todos", label: "\u6BCF\u65E5\u5F85\u529E", icon: "check" },
      { id: "notes", label: "\u788E\u788E\u5FF5", icon: "edit" },
      { id: "ai-diagnosis", label: "AI\u8BCA\u65AD", icon: "chart" },
      { id: "ai-reports", label: "AI \u65E5\u62A5", icon: "calendar" },
      { id: "settings", label: "\u8BBE\u7F6E", icon: "settings" }
    ];
    settingsTabs = { workspace: "\u56DE\u6536\u7AD9", todo: "\u5F85\u529E\u5207\u6362", openai: "OpenAI API", keys: "AI \u6388\u6743", security: "\u5B89\u5168", log: "\u64CD\u4F5C\u65E5\u5FD7" };
    legacyPages = { management: "workspace", accounts: "workspace", keys: "keys" };
    defaultFilters = () => ({
      mode: "",
      from: "",
      to: "",
      sort: "published_at",
      order: "desc",
      group: "",
      platform: "",
      topic: "",
      data_status: "",
      status: "published",
      slot: "",
      writer: "",
      has_warnings: "",
      has_pending_verify: "",
      series_no_min: "",
      series_no_max: ""
    });
    articleColumns = {
      reads: ["\u9605\u8BFB", "reads"],
      likes: ["\u70B9\u8D5E", "likes"],
      comments: ["\u8BC4\u8BBA", "comments"],
      as_of: ["\u6570\u636E\u622A\u81F3", "latest_as_of"],
      approvals: ["\u8D5E\u540C", "approvals"],
      mode: ["\u751F\u4EA7\u65B9\u5F0F", ""],
      duration: ["\u8017\u65F6", "duration"],
      published: [
        "\u53D1\u5E03\u65E5\u671F",
        "published_at"
      ],
      account: ["\u8D26\u53F7", ""],
      status: ["\u72B6\u6001", ""],
      slot: ["\u69FD\u4F4D", ""],
      writer: ["\u5199\u4F5C\u8005", ""],
      char_count: ["\u5B57\u6570", ""],
      subheading_count: ["\u5C0F\u6807\u9898", ""],
      image_count: ["\u56FE\u6570", ""],
      draft_ref: ["\u8349\u7A3F\u51ED\u8BC1", ""],
      total_duration: ["\u6D41\u6C34\u7EBF\u8017\u65F6", ""],
      warnings: ["\u8B66\u544A", ""],
      verify: ["\u5F85\u6838", ""],
      topic: ["\u9898\u6750", ""]
    };
    articleChoices = {
      topic: { entertainment: "\u6587\u5A31\uFF08\u63A8\u65AD\uFF09", insurance: "\u4FDD\u9669\uFF08\u63A8\u65AD\uFF09", unknown: "\u672A\u63A8\u65AD" },
      mode: modeLabels,
      group: { account: "\u6309\u8D26\u53F7", mode: "\u6309\u751F\u4EA7\u65B9\u5F0F" }
    };
    defaultColumns = ["account", "reads", "likes", "comments", "as_of"];
  }
});

// local-ui/frontend/web/core/state.mjs
var state_exports = {};
__export(state_exports, {
  runtime: () => runtime,
  state: () => state
});
var state, runtime;
var init_state = __esm({
  "local-ui/frontend/web/core/state.mjs"() {
    init_constants();
    state = {
      me: null,
      savedViews: [],
      accounts: [],
      accountProfiles: [],
      page: "review",
      settingsTab: "workspace",
      account: "V\u5B57",
      overviewPeriod: "yesterday",
      trendOpen: false,
      attentionExpanded: false,
      reviewTab: "observations",
      reviewArticles: [],
      articles: [],
      articleOverviewMode: "published",
      columns: new Set(defaultColumns),
      filters: defaultFilters(),
      listPage: 1,
      pageSize: 20,
      topN: 5,
      topPlatform: "",
      trendMetric: "reads",
      todoDate: ""
    };
    runtime = {
      renderVersion: 0,
      lastFocus: null,
      activePopover: null,
      popoverId: 0,
      modalRequestVersion: 0,
      menuFocus: null,
      entryObserver: null,
      entryBlocks: [],
      articleIndexGeneration: 0,
      sessionEpoch: 0
    };
  }
});

// local-ui/frontend/web/offline/db.mjs
function entityKey(scope, id2) {
  if (typeof scope !== "string" || !scope || typeof id2 !== "string" || !id2) {
    throw new TypeError("Offline records require an explicit scope and identity");
  }
  return JSON.stringify([scope, id2]);
}
function assertOfflineData(value) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Offline storage accepts plain data only");
  }
  for (const [key2, child] of Object.entries(value)) {
    if (/^(?:authorization|cookie|headers|csrf[_-]?token|access[_-]?token|token|password|__proto__|constructor|prototype)$/i.test(key2)) {
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
    get: (name, key2) => schedule(() => store(name).get(key2)),
    getAll: (name) => schedule(() => store(name).getAll()),
    put(name, value) {
      assertOfflineData(value);
      if (typeof value.key !== "string") throw new TypeError("Offline record key is required");
      return schedule(() => store(name).put(value));
    },
    delete: (name, key2) => schedule(() => store(name).delete(key2))
  };
}
function keepTransactionAlive(transaction, name) {
  let stopped = false, finished = false;
  const queue = [];
  const schedule = (operation) => new Promise((resolve, reject) => {
    queue.push({ operation, resolve, reject });
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
    const timer2 = setTimeout(() => {
      keeper.stop();
      try {
        tx.abort();
      } catch {
      }
    }, 1e4);
    const done = () => {
      keeper.stop();
      clearTimeout(timer2);
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
    let blocked2 = false;
    request.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "key" });
        }
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked2 = true;
      reject(new Error("Close the other tab before upgrading offline storage"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked2) {
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
var OFFLINE_STORES;
var init_db = __esm({
  "local-ui/frontend/web/offline/db.mjs"() {
    OFFLINE_STORES = Object.freeze(["entities", "outbox", "conflicts", "meta"]);
  }
});

// local-ui/frontend/web/offline/retained-drafts.mjs
function createDraftRevisionTracker() {
  const revisions = /* @__PURE__ */ new WeakMap();
  return (item) => {
    const signature2 = JSON.stringify([item.draft, item.labels, item.label, item.dirty, item.composing]);
    const previous = revisions.get(item);
    const revision = previous ? previous.revision + Number(previous.signature !== signature2) : 0;
    revisions.set(item, { signature: signature2, revision });
    return revision;
  };
}
function unchangedEntrySinceSnapshot(epochs, id2, current3, snapshotRevision, currentRevision) {
  return epochs.has(id2) === Boolean(current3) && (!current3 || current3.writeEpoch === epochs.get(id2) && (snapshotRevision === void 0 || snapshotRevision === currentRevision));
}
function uniqueRetainedDrafts(rows) {
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return true;
    const key2 = signature(row);
    if (seen.has(key2)) return false;
    seen.add(key2);
    return true;
  });
}
function matchesDeletedEntry(row, value) {
  if (row.kind !== "note_entry" || !value || value.id !== row.id || value.category !== row.category || value.date !== row.date || value.deleted !== true || value.can_edit !== true || typeof value.deleted_at !== "string" || !Number.isFinite(Date.parse(value.deleted_at)) || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) || typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at)) || typeof value.content_hash !== "string" || !/^[a-f0-9]{64}$/i.test(value.content_hash) || !Number.isSafeInteger(value.version) || !Number.isSafeInteger(row.version) || value.version <= row.version || typeof value.text !== "string" || value.text !== row.draft || value.labels_version !== 3 || !Array.isArray(value.labels) || !Array.isArray(row.labels) || JSON.stringify(labels(value)) !== JSON.stringify(labels(row)) || row.pending || row.remote || row.localQueued || Number.isSafeInteger(row.localVersion) && row.localVersion > row.version || row.labelKnown === false || ["unknown", "conflict"].includes(row.phase)) return false;
  return true;
}
function createLegacyRecoveryGuard() {
  const restored = /* @__PURE__ */ new WeakMap();
  const signature2 = (item) => JSON.stringify([item.draft, item.pending || null, item.remote || null]);
  return {
    remember(item) {
      restored.set(item, signature2(item));
    },
    unchanged(item) {
      return restored.has(item) && restored.get(item) === signature2(item);
    },
    forget(item) {
      restored.delete(item);
    }
  };
}
function createEntryRecoveryGuard(fields4) {
  const restored = /* @__PURE__ */ new WeakMap();
  const signature2 = (item) => JSON.stringify(fields4.map((key2) => item[key2]));
  return {
    remember(item, record) {
      if (item && typeof record?.key === "string" && typeof record?.write_id === "string")
        restored.set(item, { signature: signature2(item), key: record.key, write_id: record.write_id });
    },
    proof(item) {
      const saved = restored.get(item);
      return saved && saved.signature === signature2(item) ? { key: saved.key, write_id: saved.write_id } : null;
    }
  };
}
var labels, signature;
var init_retained_drafts = __esm({
  "local-ui/frontend/web/offline/retained-drafts.mjs"() {
    labels = (row) => Array.isArray(row.labels) ? [...row.labels].sort() : row.label ? [row.label] : [];
    signature = (row) => JSON.stringify([
      row.kind,
      row.id || "",
      row.category,
      row.date,
      row.draft,
      Array.isArray(row.labels) ? labels(row) : null,
      row.label ?? null,
      row.pending ?? null,
      row.remote ?? null,
      row.phase ?? null,
      row.version ?? null,
      row.localVersion ?? null,
      row.localQueued ?? null,
      row.labelKnown ?? null
    ]);
  }
});

// local-ui/frontend/web/offline/drafts.mjs
function samePendingOperation(original, restored) {
  if (!original || !restored) return !original && !restored;
  const fields4 = ["kind", "version", "saveId", "text", "labels", "label", "expectedLabel"];
  const permitted = /* @__PURE__ */ new Set([...fields4, "uncertain", "checking", "retryReady"]);
  if (typeof original !== "object" || typeof restored !== "object" || Array.isArray(original) || Array.isArray(restored) || Object.keys(original).some((key2) => !permitted.has(key2)) || Object.keys(restored).some((key2) => !permitted.has(key2)) || !["put", "delete", "restore"].includes(original.kind)) return false;
  return fields4.every((key2) => JSON.stringify(original[key2] ?? null) === JSON.stringify(restored[key2] ?? null));
}
function safeDraft(row) {
  if (!row || !["legacy", "note_entry"].includes(row.kind) || !["life", "work"].includes(row.category) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== "string" || row.draft.length > 262144 || row.kind === "note_entry" && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error("\u672C\u673A\u8349\u7A3F\u5B57\u6BB5\u65E0\u6548\u3002");
  return Object.fromEntries(fields.filter((key2) => row[key2] !== void 0).map((key2) => [key2, structuredClone(row[key2])]));
}
async function noteDigest(row) {
  const value = JSON.stringify([row.id, row.category, row.date, row.draft, [...row.labels].sort()]);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function createDraftJournal({ db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID() }) {
  const pending = /* @__PURE__ */ new Set();
  async function write(rows) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return;
    const clean = rows.map(safeDraft);
    const digests = await Promise.all(clean.map((row) => eligible(row) ? noteDigest(row) : null));
    const active2 = () => {
      if (owner2 !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error("\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u65E7\u8349\u7A3F\u4FDD\u6301\u539F\u8303\u56F4\u3002"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active2();
      for (const [index, row] of clean.entries()) {
        const identity4 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key2 = entityKey(owner2, "draft:" + row.kind + ":" + identity4 + ":" + draftOwner);
        const recovered = rows[index].recoveryProof;
        if (row.kind === "note_entry" && unresolved(row) && recovered && typeof recovered.key === "string" && typeof recovered.write_id === "string") {
          const source = await tx.get("meta", recovered.key), original = source?.data;
          if (source?.scope === owner2 && source.draft_kind === row.kind && source.write_id === recovered.write_id && original?.id === row.id && original.category === row.category && original.date === row.date && original.draft === row.draft && JSON.stringify(original.labels ?? (original.label ? [original.label] : [])) === JSON.stringify(row.labels ?? (row.label ? [row.label] : [])) && samePendingOperation(original.pending, row.pending) && JSON.stringify(original.remote ?? null) === JSON.stringify(row.remote ?? null) && (original.version === row.version || row.recoveredBaseline?.version === original.version && row.recoveredBaseline?.serverText === (original.serverText ?? null) && row.recoveredBaseline?.contentHash === (original.contentHash ?? null))) continue;
        }
        const proof = digests[index] && await tx.get("meta", entityKey(owner2, "deleted-note-proof:" + digests[index]));
        if (proof && row.version < proof.version) continue;
        if (unresolved(row)) await tx.put("meta", { key: key2, scope: owner2, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now(), write_id: crypto.randomUUID() });
        else if (row.kind === "note_entry") {
          await tx.delete("meta", key2);
        }
      }
      active2();
    });
  }
  function capture(rows) {
    const work = write(rows);
    pending.add(work);
    work.finally(() => pending.delete(work)).catch(() => {
    });
    return work;
  }
  async function records(kind) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return [];
    const rows = await db.transaction(["meta"], "readonly", async (tx) => (await tx.getAll("meta")).filter((row) => row.scope === owner2 && row.draft_kind === kind).sort((a, b) => b.saved_at - a.saved_at));
    return owner2 === getScope() && generation === getGeneration() ? rows : [];
  }
  async function list2(kind) {
    return (await records(kind)).map((row) => row.data);
  }
  async function purgeVerified(snapshots2, tombstones, stillActive = () => true) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return;
    const active2 = () => {
      if (owner2 !== getScope() || generation !== getGeneration() || !stillActive())
        throw new Error("Draft cleanup was cancelled");
    };
    const candidates = [];
    for (const snapshot of snapshots2) {
      const value = tombstones.get(snapshot.data?.id);
      if (snapshot.scope === owner2 && matchesDeletedEntry(snapshot.data, value))
        candidates.push({ snapshot, value, digest: await noteDigest(snapshot.data) });
    }
    active2();
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active2();
      for (const { snapshot, value, digest: digest2 } of candidates) {
        active2();
        const current3 = await tx.get("meta", snapshot.key);
        if (!current3 || current3.scope !== owner2 || current3.draft_kind !== "note_entry" || JSON.stringify(current3) !== JSON.stringify(snapshot) || !matchesDeletedEntry(current3.data, value)) continue;
        const key2 = entityKey(owner2, "deleted-note-proof:" + digest2);
        const previous = await tx.get("meta", key2);
        await tx.put("meta", { key: key2, scope: owner2, version: Math.max(previous?.version || 0, value.version) });
        await tx.delete("meta", current3.key);
      }
      active2();
    });
  }
  async function purgeUserDeleted(raw, snapshots2, value, stillActive = () => true) {
    const owner2 = getScope(), generation = getGeneration(), target = safeDraft(raw);
    const evidenceRow = { ...target, draft: value?.text, labels: value?.labels };
    if (!owner2 || !eligible(target) || !matchesDeletedEntry(evidenceRow, value) || value.version !== target.version + 1) return;
    const digest2 = await noteDigest(target);
    const active2 = () => {
      if (owner2 !== getScope() || generation !== getGeneration() || !stillActive()) throw new Error("Draft cleanup was cancelled");
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active2();
      let removed = false;
      for (const snapshot of snapshots2) {
        const row = snapshot.data;
        if (snapshot.scope !== owner2 || snapshot.draft_kind !== "note_entry" || !row || !eligible(row) || row.id !== target.id || row.category !== target.category || row.date !== target.date || row.version !== target.version || row.draft !== target.draft || JSON.stringify([...row.labels].sort()) !== JSON.stringify([...target.labels].sort())) continue;
        const current3 = await tx.get("meta", snapshot.key);
        if (current3 && JSON.stringify(current3) === JSON.stringify(snapshot)) {
          await tx.delete("meta", current3.key);
          removed = true;
        }
      }
      if (removed) {
        const key2 = entityKey(owner2, "deleted-note-proof:" + digest2), previous = await tx.get("meta", key2);
        await tx.put("meta", { key: key2, scope: owner2, version: Math.max(previous?.version || 0, value.version) });
      }
      active2();
    });
  }
  async function discardUnsent(raw) {
    const owner2 = getScope(), generation = getGeneration(), row = safeDraft(raw);
    if (!owner2 || !eligible(row) || row.version !== 0 || (row.localVersion || 0) !== 0)
      throw new Error("\u672C\u673A\u8349\u7A3F\u72B6\u6001\u9700\u8981\u91CD\u65B0\u6838\u5BF9\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
    const digest2 = await noteDigest(row);
    const active2 = () => {
      if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("\u8349\u7A3F\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\u3002");
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active2();
      for (const stored of await tx.getAll("meta")) {
        const data2 = stored.data;
        if (stored.scope !== owner2 || stored.draft_kind !== "note_entry" || !data2 || !eligible(data2) || data2.version !== 0 || (data2.localVersion || 0) !== 0 || data2.id !== row.id || data2.category !== row.category || data2.date !== row.date || data2.draft !== row.draft || JSON.stringify([...data2.labels].sort()) !== JSON.stringify([...row.labels].sort())) continue;
        await tx.delete("meta", stored.key);
      }
      const key2 = entityKey(owner2, "deleted-note-proof:" + digest2);
      const previous = await tx.get("meta", key2);
      await tx.put("meta", { key: key2, scope: owner2, version: Math.max(previous?.version || 0, 1) });
      active2();
    });
  }
  async function discardSelected(snapshot) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2 || snapshot?.scope !== owner2 || !["legacy", "note_entry"].includes(snapshot?.draft_kind))
      throw new Error("\u8349\u7A3F\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u770B\u3002");
    await Promise.all([...pending]);
    return db.transaction(["meta"], "readwrite", async (tx) => {
      if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("\u8349\u7A3F\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\u3002");
      const current3 = await tx.get("meta", snapshot.key);
      if (!current3 || current3.scope !== owner2 || current3.draft_kind !== snapshot.draft_kind || JSON.stringify(current3) !== JSON.stringify(snapshot))
        throw new Error("\u8349\u7A3F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u67E5\u770B\u540E\u518D\u5220\u9664\u3002");
      await tx.delete("meta", snapshot.key);
      if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("\u8349\u7A3F\u8EAB\u4EFD\u8303\u56F4\u5DF2\u53D8\u5316\u3002");
      return true;
    });
  }
  return { capture, list: list2, records, purgeVerified, purgeUserDeleted, discardUnsent, discardSelected, flush: () => Promise.all([...pending]) };
}
var fields, unresolved, eligible;
var init_drafts = __esm({
  "local-ui/frontend/web/offline/drafts.mjs"() {
    init_db();
    init_retained_drafts();
    fields = [
      "kind",
      "id",
      "category",
      "date",
      "draft",
      "version",
      "serverText",
      "contentHash",
      "label",
      "labels",
      "labelKnown",
      "createdAt",
      "updatedAt",
      "dirty",
      "phase",
      "pending",
      "remote",
      "deleted",
      "localVersion",
      "durableText",
      "localBacked",
      "localQueued",
      "recoveredBaseline"
    ];
    unresolved = (row) => row.dirty || row.pending || ["unknown", "conflict", "error", "oversize"].includes(row.phase);
    eligible = (row) => row.kind === "note_entry" && Array.isArray(row.labels) && Number.isSafeInteger(row.version) && row.version >= 0 && !row.pending && !row.remote && !row.localQueued && (!Number.isSafeInteger(row.localVersion) || row.localVersion <= row.version) && row.labelKnown !== false && !["unknown", "conflict"].includes(row.phase);
  }
});

// local-ui/frontend/web/local/drafts.mjs
function createComposerJournal({ db, scope, uuid: uuid2 = () => crypto.randomUUID(), onError = () => {
} }) {
  if (!db?.transaction || typeof scope !== "string" || !scope) throw new TypeError("Explicit durable draft scope required");
  const cache2 = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map(), snapshots2 = /* @__PURE__ */ new WeakSet(), requests = /* @__PURE__ */ new WeakMap();
  let ready = false, tail = Promise.resolve();
  function key2(kind, identity4 = "") {
    if (!(kind === "todo" && validDate(identity4) || kind === "future" && identity4 === ""))
      throw new TypeError("Unknown local composer identity");
    return JSON.stringify([scope, FORMAT, kind, identity4]);
  }
  function verify(row) {
    return row && row.format === FORMAT && row.scope === scope && typeof row.text === "string" && row.text.length <= 262144 && typeof row.writeId === "string" && row.key === key2(row.kind, row.identity);
  }
  async function initialize() {
    const rows = await db.transaction(["meta"], "readonly", (tx) => tx.getAll("meta"));
    for (const row of rows) if (row.format === FORMAT && row.scope === scope) {
      if (!verify(row)) throw errorFor(new Error("Invalid composer record"));
      cache2.set(row.key, row);
    }
    ready = true;
  }
  function read3(kind, identity4 = "") {
    if (!ready) throw errorFor(new Error("Composer storage not initialized"));
    return cache2.get(key2(kind, identity4))?.text || "";
  }
  function enqueue(row) {
    const work = tail.then(async () => {
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", row));
      const actual = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", row.key));
      if (JSON.stringify(actual) !== JSON.stringify(row)) throw new Error("Composer readback mismatch");
      failures.delete(row.key);
    }).catch((cause) => {
      const error = errorFor(cause);
      failures.set(row.key, { writeId: row.writeId, error });
      onError(error);
      throw error;
    });
    tail = work.catch(() => {
    });
    work.catch(() => {
    });
    return work;
  }
  function set(kind, identity4, text) {
    read3(kind, identity4);
    if (typeof text !== "string" || text.length > 262144) throw errorFor(new Error("Composer text exceeds safe limit"));
    const id2 = key2(kind, identity4), current3 = cache2.get(id2);
    if (current3?.text === text && !failures.has(id2)) return tail;
    const revision = (current3?.revision || 0) + 1;
    if (!Number.isSafeInteger(revision)) throw errorFor(new Error("Composer revision overflow"));
    const row = { key: id2, format: FORMAT, scope, kind, identity: identity4, text, revision, writeId: uuid2() + ":" + revision };
    cache2.set(id2, row);
    return enqueue(row);
  }
  async function flush() {
    let observed2;
    do {
      observed2 = tail;
      await observed2;
    } while (observed2 !== tail);
    if (failures.size) throw [...failures.values()][0].error;
    const expected = [...cache2.values()];
    await db.transaction(["meta"], "readonly", async (tx) => {
      for (const row of expected) if (JSON.stringify(await tx.get("meta", row.key)) !== JSON.stringify(row))
        throw errorFor(new Error("Composer verification mismatch"));
    });
  }
  function snapshot(kind, identity4 = "") {
    const id2 = key2(kind, identity4);
    read3(kind, identity4);
    const row = cache2.get(id2), value = Object.freeze({ key: id2, scope, kind, identity: identity4, text: row?.text || "", revision: row?.revision || 0, writeId: row?.writeId || null });
    snapshots2.add(value);
    return value;
  }
  function requestSnapshot(request, kind, identity4 = "") {
    if (!request || typeof request !== "object") throw errorFor(new Error("Missing create request identity"));
    const payload = JSON.stringify([kind, identity4, request.id, request.date ?? null, request.text]);
    let saved = requests.get(request);
    if (!saved) {
      saved = { value: snapshot(kind, identity4), payload };
      requests.set(request, saved);
    }
    if (saved.payload !== payload) throw errorFor(new Error("Create request payload changed"));
    const { value } = saved;
    if (value.kind !== kind || value.identity !== identity4 || value.text.trim() !== request.text || kind === "todo" && identity4 !== request.date) throw errorFor(new Error("Create request differs from its original composer snapshot"));
    return value;
  }
  function matches(value) {
    if (!snapshots2.has(value)) return false;
    const current3 = cache2.get(value.key);
    return (current3?.writeId || null) === value.writeId && (current3?.text || "") === value.text;
  }
  function unchangedSince(value) {
    return snapshots2.has(value) && (matches(value) || cache2.get(value.key)?.writeId === "consumed:" + value.writeId);
  }
  function wasConsumed(value) {
    const current3 = snapshots2.has(value) && cache2.get(value.key);
    return Boolean(current3 && value.writeId && current3.text === "" && current3.writeId === "consumed:" + value.writeId);
  }
  function commitHook(value) {
    if (!snapshots2.has(value)) throw errorFor(new Error("Unknown composer snapshot"));
    return async (tx) => {
      const current3 = await tx.get("meta", value.key);
      if ((current3?.writeId || null) !== value.writeId || (current3?.text || "") !== value.text) return;
      await tx.put("meta", {
        key: value.key,
        format: FORMAT,
        scope,
        kind: value.kind,
        identity: value.identity,
        text: "",
        revision: value.revision,
        writeId: "consumed:" + value.writeId
      });
    };
  }
  function accept(value) {
    if (!matches(value)) return false;
    cache2.set(value.key, {
      key: value.key,
      format: FORMAT,
      scope,
      kind: value.kind,
      identity: value.identity,
      text: "",
      revision: value.revision,
      writeId: "consumed:" + value.writeId
    });
    return true;
  }
  function bind(object2, property, kind, identity4 = "") {
    read3(kind, identity4);
    Object.defineProperty(object2, property, {
      enumerable: true,
      configurable: true,
      get: () => read3(kind, identity4),
      set: (text) => {
        void set(kind, identity4, text);
      }
    });
    return object2;
  }
  return { initialize, read: read3, set, flush, snapshot, requestSnapshot, matches, unchangedSince, wasConsumed, commitHook, accept, bind };
}
var FORMAT, errorFor, validDate;
var init_drafts2 = __esm({
  "local-ui/frontend/web/local/drafts.mjs"() {
    FORMAT = "haoduoyu-local-composer-v1";
    errorFor = (cause) => Object.assign(
      new Error("\u672C\u673A\u8349\u7A3F\u5C1A\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\uFF0C\u4E0D\u8981\u5173\u95ED\u6216\u6E05\u9664\u6570\u636E\u3002", { cause }),
      { code: "LOCAL_DRAFT_FAILURE", localNotSaved: true }
    );
    validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + "T00:00:00Z")) && (/* @__PURE__ */ new Date(date + "T00:00:00Z")).toISOString().slice(0, 10) === date;
  }
});

// local-ui/frontend/web/local/common.mjs
function idOf(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw invalid("\u8BB0\u5F55\u6807\u8BC6\u5FC5\u987B\u4E3A\u6709\u6548 UUID\u3002");
  return value.toLowerCase();
}
function versionOf(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value >= Number.MAX_SAFE_INTEGER) throw invalid("\u8BB0\u5F55\u7248\u672C\u65E0\u6548\u3002");
  return value;
}
function dateOf(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid("\u65E5\u671F\u65E0\u6548\u3002");
  const date = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid("\u65E5\u671F\u65E0\u6548\u3002");
  return value;
}
function plain(value) {
  return typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
function textOf(value, max = 500) {
  if (!plain(value) || !value.trim() || value.length > max) throw invalid("\u5185\u5BB9\u987B\u4E3A 1\u2013" + max + " \u4E2A\u5B57\u7B26\u3002");
  return value.trim();
}
function bodyText(value) {
  if (!plain(value)) throw invalid("\u6B63\u6587\u5FC5\u987B\u662F\u6709\u6548\u7EAF\u6587\u5B57\u3002");
  const text = value.replace(/\r\n?/g, "\n");
  if (new TextEncoder().encode(text).length > 65536) throw fail(413, "TEXT_TOO_LARGE", "\u6B63\u6587\u6700\u591A 64 KiB\uFF0C\u672A\u4FDD\u5B58\u3002");
  return text;
}
function exact(body, names) {
  if (!body || Object.getPrototypeOf(body) !== Object.prototype || Object.keys(body).sort().join(",") !== [...names].sort().join(",")) throw invalid();
}
function queryOnly(query, names = []) {
  if ([...query.keys()].some((key2) => !names.includes(key2) || query.getAll(key2).length !== 1)) throw invalid("\u67E5\u8BE2\u53C2\u6570\u65E0\u6548\u3002");
}
function currentVersion(row, version, { allowMissing = false, allowDeleted = false } = {}) {
  if (!row && !allowMissing) throw fail(404, "NOT_FOUND", "\u672C\u673A\u8BB0\u5F55\u4E0D\u5B58\u5728\u3002");
  if ((row?.version || 0) !== version) throw fail(409, "VERSION_CONFLICT", "\u672C\u673A\u8BB0\u5F55\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\uFF0C\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002");
  if (row?.deleted_at && !allowDeleted) throw fail(409, "RECORD_DELETED", "\u8BB0\u5F55\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C\u8BF7\u5148\u6062\u590D\u3002");
}
function sortData(value) {
  if (Array.isArray(value)) return value.map(sortData);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key2) => [key2, sortData(value[key2])]));
  return value;
}
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
var LOCAL_DATABASE_NAME, LOCAL_OWNER_ID, LOCAL_SCOPE, fail, invalid, unsupported, clone, beijingDay, canonical, byCreated;
var init_common = __esm({
  "local-ui/frontend/web/local/common.mjs"() {
    LOCAL_DATABASE_NAME = "haoduoyu-standalone-local-v1";
    LOCAL_OWNER_ID = "00000000-0000-4000-8000-000000000001";
    LOCAL_SCOPE = "local:v1:" + LOCAL_OWNER_ID;
    fail = (status, code, message) => Object.assign(new Error(message), { status, code, localNotSaved: true });
    invalid = (message = "\u672C\u673A\u8BF7\u6C42\u5B57\u6BB5\u65E0\u6548\uFF0C\u672A\u4FDD\u5B58\u3002") => fail(400, "VALIDATION_ERROR", message);
    unsupported = () => fail(501, "LOCAL_NOT_IMPLEMENTED", "\u6B64\u529F\u80FD\u5C1A\u672A\u5B9E\u73B0\u672C\u673A\u64CD\u4F5C\uFF0C\u672A\u8BBF\u95EE\u7F51\u7AD9\u6216\u66F4\u6539\u6570\u636E\u3002");
    clone = (value) => structuredClone(value);
    beijingDay = (at) => new Date(at + 8 * 36e5).toISOString().slice(0, 10);
    canonical = (value) => JSON.stringify(sortData(value));
    byCreated = (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  }
});

// local-ui/frontend/web/local/todos.mjs
function linked(c, row) {
  if (!row) throw fail(404, "NOT_FOUND", "\u672C\u673A\u5F85\u529E\u4E0D\u5B58\u5728\u3002");
  const value = { ...row };
  delete value.created_template_id;
  if (!value.note) delete value.note;
  if (row.template_id) {
    const template = c.get("template", row.template_id);
    value.template_version = template?.version || 0;
    value.template_active = Boolean(template && !template.deleted_at && !template.archived_at);
  }
  return value;
}
function templateView(c, row) {
  const start = /* @__PURE__ */ new Date(c.today + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 29);
  const dates = new Set(c.list("todo").filter((todo) => todo.template_id === row.id && todo.completed && !todo.deleted_at && todo.date >= start.toISOString().slice(0, 10) && todo.date <= c.today).map((todo) => todo.date));
  return { ...row, completed_days: dates.size, habit_status: dates.size >= 21 ? "habit" : "todo" };
}
async function save(c, kind, row) {
  await c.history(kind, c.get(kind, row.id));
  await c.put(kind, row.id, row);
  return row;
}
async function todosRoute(c) {
  const { path, method, body: b, url } = c, q = url.searchParams;
  if (path === "/todo-preferences") {
    queryOnly(q);
    const row2 = c.get("preference", "todos") || { completed_mode: "strike", version: 0 };
    if (method === "GET") return row2;
    if (method !== "PATCH") throw unsupported();
    exact(b, ["completed_mode", "version"]);
    versionOf(b.version, 0);
    if (!["strike", "hide"].includes(b.completed_mode)) throw invalid();
    return commit(c, "preference", "todos", b, async () => {
      currentVersion(row2, b.version);
      const value = { completed_mode: b.completed_mode, version: row2.version + 1 };
      await c.put("preference", "todos", value);
      return { response: value, checks: [{ kind: "preference", id: "todos", version: value.version }] };
    });
  }
  if (method === "GET" && path === "/todos") {
    queryOnly(q, ["date"]);
    const date = q.has("date") ? dateOf(q.get("date")) : c.today;
    const preferences = c.get("preference", "todos") || { completed_mode: "strike", version: 0 };
    return {
      date,
      today: c.today,
      completed_mode: preferences.completed_mode,
      preferences_version: preferences.version,
      items: c.list("todo").filter((row2) => row2.date === date && !row2.deleted_at).sort(byCreated).map((row2) => linked(c, row2))
    };
  }
  if (method === "GET" && path === "/todo-templates") {
    queryOnly(q, ["archived"]);
    if (q.has("archived") && q.get("archived") !== "1") throw invalid();
    const start = /* @__PURE__ */ new Date(c.today + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 29);
    return { today: c.today, window_start: start.toISOString().slice(0, 10), items: c.list("template").filter((row2) => !row2.deleted_at && Boolean(row2.archived_at) === q.has("archived")).sort(byCreated).map((row2) => templateView(c, row2)) };
  }
  if (method === "GET" && path === "/unscheduled-todos") {
    queryOnly(q);
    return { items: c.list("unscheduled_todo").filter((row2) => !row2.deleted_at).sort(byCreated) };
  }
  const createKind = { "/todos": "todo", "/todo-templates": "template", "/unscheduled-todos": "unscheduled_todo" }[path];
  if (createKind && method === "POST") {
    exact(b, createKind === "todo" ? ["id", "text", "date", ...Object.hasOwn(b, "template_id") ? ["template_id"] : []] : ["id", "text"]);
    const id3 = idOf(b.id), text = textOf(b.text), date = createKind === "todo" ? dateOf(b.date) : null;
    const templateId = b.template_id === void 0 ? null : idOf(b.template_id);
    return commit(c, createKind, id3, b, async () => {
      if (c.get(createKind, id3)) throw fail(409, "IDEMPOTENCY_CONFLICT", "\u672C\u673A\u6807\u8BC6\u5DF2\u5B58\u5728\uFF0C\u672A\u521B\u5EFA\u91CD\u590D\u8BB0\u5F55\u3002");
      if (templateId) {
        const template = c.get("template", templateId);
        if (!template || template.deleted_at || template.archived_at) throw fail(409, "TEMPLATE_UNAVAILABLE", "\u5E38\u7528\u5F85\u529E\u5DF2\u5220\u9664\u6216\u5F52\u6863\u3002");
      }
      const row2 = initial(c, {
        id: id3,
        text,
        ...date ? { date } : {},
        ...createKind !== "template" ? { completed: false } : { archived_at: null },
        ...templateId ? { template_id: templateId, created_template_id: templateId } : {}
      });
      await save(c, createKind, row2);
      return { response: createKind === "template" ? templateView(c, row2) : linked(c, row2), checks: [check(createKind, row2)] };
    });
  }
  const match = /^\/(todos|todo-templates|unscheduled-todos)\/([^/]+)(?:\/(restore|archive|note|template|move|complete-today))?$/.exec(path);
  if (!match) throw unsupported();
  const kind = { todos: "todo", "todo-templates": "template", "unscheduled-todos": "unscheduled_todo" }[match[1]], id2 = idOf(match[2]), action = match[3] || "";
  const row = c.get(kind, id2);
  if (method === "GET" && !action && kind !== "template") {
    queryOnly(q);
    return linked(c, row);
  }
  const deletion = method === "DELETE" && !action, restoring = method === "POST" && action === "restore";
  const settingTemplate = kind === "todo" && method === "POST" && action === "template";
  const moving = kind === "unscheduled_todo" && method === "POST" && ["move", "complete-today"].includes(action);
  const archiving = kind === "template" && method === "POST" && action === "archive";
  const patching = method === "PATCH" && (!action || kind === "todo" && action === "note");
  if (!(deletion || restoring || settingTemplate || moving || archiving || patching)) throw unsupported();
  const fields4 = settingTemplate ? ["date", "version", "template_id", "template_version"] : moving ? ["date", "version"] : patching ? [kind === "template" ? "text" : action === "note" ? "note" : "completed", "version"] : kind === "todo" ? ["date", "version"] : ["version"];
  exact(b, fields4);
  versionOf(b.version);
  if ("date" in b) dateOf(b.date);
  if (settingTemplate) {
    idOf(b.template_id);
    versionOf(b.template_version, 0);
  }
  if (patching) {
    if (kind === "template") textOf(b.text);
    else if (action === "note") {
      if (!plain(b.note) || b.note.length > 4e3) throw invalid("\u5907\u6CE8\u6700\u591A 4000 \u5B57\u3002");
    } else boolean(b.completed);
  }
  return commit(c, kind, id2, b, async () => {
    currentVersion(row, b.version, { allowDeleted: restoring });
    if (kind === "todo" && b.date && row.date !== b.date) throw invalid("\u5F85\u529E\u65E5\u671F\u4E0D\u5339\u914D\u3002");
    if (moving) {
      const complete = action === "complete-today";
      if (complete && b.date !== c.today) throw fail(409, "TODO_DAY_CHANGED", "\u5317\u4EAC\u65F6\u95F4\u65E5\u671F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
      if (c.get("todo", id2)) throw fail(409, "IDEMPOTENCY_CONFLICT", "\u76EE\u6807\u5F85\u529E\u6807\u8BC6\u5DF2\u5B58\u5728\uFF0C\u539F\u9879\u4ECD\u4FDD\u7559\u3002");
      const todo = initial(c, { id: id2, date: b.date, text: row.text, completed: complete || row.completed });
      const source = next(c, row, { completed: todo.completed, deleted_at: c.stamp, moved_to_date: b.date });
      await save(c, "todo", todo);
      await save(c, kind, source);
      return { response: { todo: linked(c, todo), source }, checks: [check("todo", todo), check(kind, source)] };
    }
    if (settingTemplate) {
      const templateId = idOf(b.template_id), existing = c.get("template", templateId);
      if (row.template_id && row.template_id !== templateId || existing && !row.template_id) throw fail(409, "IDEMPOTENCY_CONFLICT", "\u5F85\u529E\u6216\u6A21\u677F\u6807\u8BC6\u5DF2\u5173\u8054\u5176\u4ED6\u8BB0\u5F55\u3002");
      let template, todo = row;
      if (existing) {
        currentVersion(existing, b.template_version, { allowDeleted: true });
        if (existing.archived_at) throw fail(409, "TEMPLATE_ARCHIVED", "\u8BF7\u5148\u6062\u590D\u5DF2\u5F52\u6863\u6A21\u677F\u3002");
        template = existing.deleted_at ? next(c, existing, { deleted_at: null }) : existing;
      } else {
        if (b.template_version !== 0) throw fail(409, "VERSION_CONFLICT", "\u6A21\u677F\u7248\u672C\u4E0D\u5339\u914D\u3002");
        template = initial(c, { id: templateId, text: row.text, archived_at: null });
        todo = next(c, row, { template_id: templateId });
        await save(c, kind, todo);
      }
      await save(c, "template", template);
      return { response: { todo: linked(c, todo), template: templateView(c, template) }, checks: [check(kind, todo), check("template", template)] };
    }
    let changes;
    if (kind === "template" && (archiving || restoring)) {
      if (row.deleted_at) throw fail(409, "TEMPLATE_DELETED", "\u5DF2\u5220\u9664\u5E38\u7528\u9879\u9700\u4ECE\u539F\u5F85\u529E\u91CD\u65B0\u8BBE\u4E3A\u5E38\u7528\u3002");
      changes = { archived_at: archiving ? c.stamp : null };
    } else if (restoring) {
      if (!row.deleted_at) throw fail(409, "VERSION_CONFLICT", "\u8BB0\u5F55\u5DF2\u7ECF\u6062\u590D\u3002");
      if (kind === "unscheduled_todo" && row.moved_to_date) throw fail(409, "TODO_MOVED", "\u8BE5\u9879\u5DF2\u79FB\u52A8\u5230\u65E5\u671F\u5F85\u529E\uFF0C\u4E0D\u5F97\u91CD\u590D\u6062\u590D\u3002");
      changes = { deleted_at: null };
    } else if (deletion) changes = { deleted_at: c.stamp };
    else changes = kind === "template" ? { text: textOf(b.text) } : action === "note" ? { note: b.note } : { completed: b.completed };
    const saved = await save(c, kind, next(c, row, changes));
    return { response: kind === "template" ? deletion ? { id: id2, deleted: true, version: saved.version } : templateView(c, saved) : linked(c, saved), checks: [check(kind, saved)] };
  });
}
var check, boolean, next, initial, commit;
var init_todos = __esm({
  "local-ui/frontend/web/local/todos.mjs"() {
    init_common();
    check = (kind, row) => ({ kind, id: row.id, version: row.version });
    boolean = (value) => {
      if (typeof value !== "boolean") throw invalid();
      return value;
    };
    next = (c, row, changes) => ({ ...row, ...changes, version: row.version + 1, updated_at: c.stamp });
    initial = (c, value) => ({ ...value, version: 1, created_at: c.stamp, updated_at: c.stamp, deleted_at: null });
    commit = (c, kind, id2, body, work) => c.commit("todo", c.method + ":" + c.path + ":" + (body.version ?? "create:" + id2), { method: c.method, path: c.path, ...body }, work);
  }
});

// local-ui/frontend/web/local/notes.mjs
function labelOf(value, allowBuiltins = true) {
  if (!plain(value)) throw invalid("\u6807\u7B7E\u65E0\u6548\u3002");
  const label3 = value.trim().normalize("NFC");
  if (!label3 || [...label3].length > 32 || /[\u0000-\u001f\u007f]/.test(label3) || !allowBuiltins && builtins.includes(label3)) throw invalid("\u6807\u7B7E\u987B\u4E3A 1\u201332 \u5B57\u3002");
  return label3;
}
function protocolFor(headers) {
  const value = typeof headers.get === "function" ? headers.get("X-Note-Labels-Version") : Object.entries(headers).find(([key2]) => key2.toLowerCase() === "x-note-labels-version")?.[1];
  if (value !== void 0 && value !== null && !["1", "2", "3"].includes(String(value))) throw invalid("\u6807\u7B7E\u7248\u672C\u65E0\u6548\u3002");
  return Number(value || 3);
}
function view(row, protocol) {
  const { labels: labels2, ...rest } = row;
  const legacy = row.category === "life" ? labels2.filter((label3) => !builtins.includes(label3)) : [];
  return {
    ...rest,
    deleted: Boolean(row.deleted_at),
    can_edit: true,
    labels_version: protocol,
    ...protocol === 1 ? { label: legacy[0] || null } : { labels: protocol === 3 ? labels2 : legacy }
  };
}
function dateList(c, kind, q) {
  queryOnly(q, ["category", "before", "page_size"]);
  const category = categoryOf(q.get("category") ?? void 0), before = q.has("before") ? dateOf(q.get("before")) : null;
  const size = q.get("page_size") || "30";
  if (!/^[1-9]\d*$/.test(size) || Number(size) > 100) throw invalid("\u65E5\u671F\u5217\u8868\u6BCF\u9875\u6700\u591A 100 \u9879\u3002");
  const dates = [...new Set(c.list(kind).filter((row) => row.category === category && !row.deleted_at && (!before || row.date < before)).map((row) => row.date))].sort().reverse();
  const page2 = dates.slice(0, Number(size)), has_more = dates.length > Number(size);
  return { dates: page2, has_more, next_before: has_more ? page2.at(-1) : null };
}
async function ensureLabels(c, labels2, previous = []) {
  const existing = c.list("label").filter((row) => !builtins.includes(row.name));
  const missing2 = labels2.filter((name) => !builtins.includes(name) && !c.get("label", name));
  if (existing.length + missing2.length > 200) throw fail(409, "NOTES_LIMIT", "\u81EA\u5EFA\u6807\u7B7E\u5DF2\u8FBE 200 \u4E2A\u4E0A\u9650\u3002");
  for (const name of labels2) {
    const current3 = c.get("label", name);
    if (current3?.deleted_at || current3?.archived_at && !previous.includes(name)) throw fail(409, "LABEL_UNAVAILABLE", "\u6807\u7B7E\u5DF2\u5220\u9664\u6216\u5F52\u6863\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
  }
  for (const name of missing2) await c.put("label", name, { name, created_at: c.stamp, archived_at: null, deleted_at: null, version: 1 });
}
async function labelsRoute(c, protocol) {
  queryOnly(c.url.searchParams);
  if (c.method === "GET") {
    const rows = c.list("label");
    return {
      labels_version: protocol,
      labels: rows.filter((row) => !builtins.includes(row.name) && !row.deleted_at).map(({ name: name2, created_at }) => ({ name: name2, created_at })),
      archived_labels: rows.filter((row) => row.archived_at || row.deleted_at).map((row) => ({ name: row.name, archived_at: row.archived_at || row.deleted_at }))
    };
  }
  if (c.method !== "POST") throw unsupported();
  const b = c.body, action = b.action || "create";
  if (!["create", "archive", "restore", "delete"].includes(action)) throw invalid();
  exact(b, ["name", "save_id", ...Object.hasOwn(b, "action") ? ["action"] : []]);
  const name = labelOf(b.name, action !== "create"), saveId = idOf(b.save_id);
  const result = await c.commit("note-label", saveId, { path: c.path, ...b }, async () => {
    let row = c.get("label", name), response;
    if (action === "create") {
      if (row?.deleted_at || row?.archived_at) throw fail(409, "LABEL_UNAVAILABLE", "\u6807\u7B7E\u540D\u79F0\u5DF2\u88AB\u4FDD\u7559\uFF0C\u8BF7\u5148\u6062\u590D\u3002");
      await ensureLabels(c, [name]);
      row = c.get("label", name);
      response = { name, created_at: row.created_at };
    } else {
      if (!row && !builtins.includes(name)) throw fail(404, "NOT_FOUND", "\u6807\u7B7E\u4E0D\u5B58\u5728\u3002");
      row ||= { name, created_at: c.stamp, archived_at: null, deleted_at: null, version: 0 };
      if (action === "delete" && (row.deleted_at || row.archived_at)) throw fail(409, "LABEL_UNAVAILABLE", "\u6807\u7B7E\u5DF2\u88AB\u79FB\u9664\u6216\u5F52\u6863\u3002");
      const old = { ...row };
      row = {
        ...row,
        version: row.version + 1,
        archived_at: action === "restore" ? null : c.stamp,
        deleted_at: action === "delete" ? c.stamp : action === "restore" ? null : row.deleted_at
      };
      await c.put("history", "label:" + name + ":" + old.version, { kind: "label", ...old });
      await c.put("label", name, row);
      if (action === "delete" && !builtins.includes(name)) {
        for (const note of c.list("note_entry").filter((note2) => note2.labels.includes(name))) {
          await c.history("note_entry", note);
          const value = { ...note, labels: note.labels.filter((label3) => label3 !== name), version: note.version + 1, change_seq: await c.revision() };
          delete value.content_hash;
          value.content_hash = await digest(value);
          await c.put("note_entry", note.id, value);
        }
      }
      response = action === "delete" ? { name, deleted: true, mode: builtins.includes(name) ? "builtin-hidden" : "deleted" } : { name, archived_at: row.archived_at };
    }
    return { response, receipt: { name, action } };
  });
  return { ...result, labels_version: protocol };
}
async function monthRoute(c, protocol) {
  if (c.method !== "GET") throw unsupported();
  const q = c.url.searchParams;
  queryOnly(q, ["month"]);
  const month = q.get("month");
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw invalid("\u6708\u4EFD\u65E0\u6548\u3002");
  const rows = c.list("note_entry").filter((row) => row.date.startsWith(month + "-") && !row.deleted_at), days = /* @__PURE__ */ new Map();
  if (rows.length > 2e3) throw fail(413, "NOTES_MONTH_LIMIT", "\u8BE5\u6708\u8BB0\u5F55\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\u3002");
  for (const row of rows.sort(byCreated)) {
    if (!days.has(row.date)) days.set(row.date, []);
    const displayed = view(row, protocol);
    days.get(row.date).push({
      entity_id: "note-entry:" + row.id,
      source: "note_entry",
      category: row.category,
      text: row.text,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...protocol === 1 ? { label: displayed.label } : { labels: displayed.labels }
    });
  }
  const result = {
    format: "haoduoyu-note-month-v1",
    month,
    complete: true,
    labels_version: protocol,
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }))
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1048576) throw fail(413, "NOTES_MONTH_LIMIT", "\u8BE5\u6708\u6B63\u6587\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\u3002");
  return result;
}
async function notesRoute(c, headers) {
  const { path, method, body: b, url } = c, q = url.searchParams, protocol = protocolFor(headers);
  if (path === "/note-entries/labels") return labelsRoute(c, protocol);
  if (path === "/note-entries/month") return monthRoute(c, protocol);
  if (method === "GET" && ["/note-entries/dates", "/daily-notes/dates"].includes(path)) return dateList(c, path.startsWith("/daily") ? "legacy_note" : "note_entry", q);
  if (method === "GET" && ["/note-entries", "/daily-notes"].includes(path)) {
    queryOnly(q, ["date", "category"]);
    const date2 = q.has("date") ? dateOf(q.get("date")) : c.today, category2 = categoryOf(q.get("category") ?? void 0);
    if (path === "/daily-notes") {
      const row2 = c.get("legacy_note", category2 + ":" + date2);
      return row2 ? { date: date2, text: row2.deleted_at ? "" : row2.text, version: row2.version, updated_at: row2.updated_at, deleted: Boolean(row2.deleted_at), can_edit: false } : { date: date2, text: "", version: 0, updated_at: null, deleted: false, can_edit: false };
    }
    const rows = c.list("note_entry").filter((row2) => row2.date === date2 && row2.category === category2 && !row2.deleted_at).sort(byCreated);
    if (rows.length > 200) throw fail(413, "NOTES_LIMIT", "\u8BE5\u65E5\u8BB0\u5F55\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\u3002");
    return { date: date2, category: category2, labels_version: protocol, entries: rows.map((row2) => view(row2, protocol)), can_edit: true };
  }
  const operation = /^\/note-entries\/operations\/([^/]+)$/.exec(path);
  if (method === "GET" && operation) {
    queryOnly(q);
    const receipt = await c.receipt("note-entry", idOf(operation[1]));
    if (!receipt) return { found: false, labels_version: protocol };
    const row2 = c.get("note_entry", receipt.id);
    if (!row2) throw fail(503, "LOCAL_RECEIPT_INVALID", "\u672C\u673A\u4FDD\u5B58\u6536\u636E\u5BF9\u5E94\u8BB0\u5F55\u7F3A\u5931\u3002");
    const shown = view(row2, protocol);
    return { found: true, ...receipt, labels_version: protocol, ...protocol === 1 ? { label: shown.label } : { labels: shown.labels } };
  }
  const match = /^\/note-entries\/([^/]+)(\/restore)?$/.exec(path);
  if (!match) throw unsupported();
  const id2 = idOf(match[1]), restore = Boolean(match[2]), row = c.get("note_entry", id2);
  if (method === "GET" && !restore) {
    queryOnly(q);
    if (!row) throw fail(404, "NOT_FOUND", "\u672C\u673A\u788E\u788E\u5FF5\u4E0D\u5B58\u5728\u3002");
    return view(row, protocol);
  }
  if (!["PUT", "DELETE", "POST"].includes(method) || restore !== (method === "POST")) throw unsupported();
  exact(b, method === "PUT" ? ["version", "save_id", "category", "date", "text", ...Object.hasOwn(b, "labels") ? ["labels"] : [], ...Object.hasOwn(b, "label") ? ["label"] : []] : ["version", "save_id"]);
  versionOf(b.version, method === "PUT" ? 0 : 1);
  const saveId = idOf(b.save_id);
  let labels2, text, category, date;
  if (method === "PUT") {
    category = categoryOf(b.category);
    date = dateOf(b.date);
    text = bodyText(b.text);
    if (Object.hasOwn(b, "labels") && Object.hasOwn(b, "label")) throw invalid();
    if (Object.hasOwn(b, "labels")) {
      if (!Array.isArray(b.labels) || b.labels.length > (protocol === 3 ? 202 : 200)) throw invalid();
      labels2 = b.labels.map((label3) => labelOf(label3, protocol === 3)).sort();
      if (new Set(labels2).size !== labels2.length || protocol !== 3 && category !== "life" && labels2.length) throw invalid();
    } else if (Object.hasOwn(b, "label")) {
      if (category !== "life") throw invalid();
      labels2 = [labelOf(b.label, false)];
    } else labels2 = row?.labels || [category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"];
    if (protocol !== 3) labels2 = [.../* @__PURE__ */ new Set([...(row?.labels || [category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"]).filter((label3) => builtins.includes(label3)), ...labels2])].sort();
  }
  const result = await c.commit("note-entry", saveId, { method, path, ...b }, async () => {
    currentVersion(row, b.version, { allowMissing: method === "PUT", allowDeleted: method !== "PUT" });
    if (method === "PUT" && row && (row.category !== category || row.date !== date)) throw invalid("\u5DF2\u6709\u8BB0\u5F55\u7684\u65E5\u671F\u4E0E\u5206\u7C7B\u4E0D\u53EF\u66F4\u6539\u3002");
    if (restore && !row.deleted_at || method === "DELETE" && row.deleted_at) throw fail(409, "VERSION_CONFLICT", "\u5220\u9664\u72B6\u6001\u5DF2\u53D8\u5316\u3002");
    if (method === "PUT" && !row && date !== c.today) throw fail(400, "NOTES_TODAY_ONLY", "\u53EA\u80FD\u65B0\u589E\u5317\u4EAC\u65F6\u95F4\u5F53\u5929\u7684\u788E\u788E\u5FF5\u3002");
    if (method === "PUT" && !row || restore) {
      if (c.list("note_entry").filter((note) => note.category === (row?.category || category) && note.date === (row?.date || date) && !note.deleted_at).length >= 200)
        throw fail(409, "NOTES_LIMIT", "\u8BE5\u65E5\u788E\u788E\u5FF5\u5DF2\u8FBE 200 \u6761\u3002");
    }
    if (method === "PUT") await ensureLabels(c, labels2, row?.labels || []);
    const value = {
      id: id2,
      category: row?.category || category,
      date: row?.date || date,
      text: method === "PUT" ? text : row.text,
      labels: method === "PUT" ? labels2 : row.labels,
      version: b.version + 1,
      change_seq: await c.revision(),
      created_at: row?.created_at || c.stamp,
      updated_at: c.stamp,
      deleted_at: method === "DELETE" ? c.stamp : null
    };
    value.content_hash = await digest(value);
    await c.history("note_entry", row);
    await c.put("note_entry", id2, value);
    const receipt = { id: id2, version: value.version, deleted_at: value.deleted_at, change_seq: value.change_seq, content_hash: value.content_hash };
    return { response: value, checks: [{ kind: "note_entry", id: id2, version: value.version }], receipt };
  });
  return view(result, protocol);
}
var categoryOf, builtins;
var init_notes = __esm({
  "local-ui/frontend/web/local/notes.mjs"() {
    init_common();
    categoryOf = (value = "life") => {
      if (!["life", "work"].includes(value)) throw invalid("\u788E\u788E\u5FF5\u5206\u7C7B\u65E0\u6548\u3002");
      return value;
    };
    builtins = ["\u751F\u6D3B", "\u5DE5\u4F5C"];
  }
});

// local-ui/frontend/web/local/memos.mjs
function titleOf(value) {
  if (!plain(value) || /[\r\n\t]/.test(value) || !value.trim() || [...value.trim()].length > 120) throw invalid("\u6807\u9898\u987B\u4E3A 1\u2013120 \u5B57\u5355\u884C\u6587\u5B57\u3002");
  return value.trim();
}
async function memosRoute(c) {
  const { path, method, body: b } = c;
  queryOnly(c.url.searchParams);
  if (method === "GET" && path === "/memos") {
    const groups = c.list("memo_group").sort(sort), notes = c.list("memo_note").sort(sort);
    if (groups.length > limit.groups || notes.length > limit.notes) throw fail(413, "MEMOS_LIMIT", "\u5907\u5FD8\u5F55\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\u3002");
    return {
      groups: groups.map((group) => ({ ...group, active_note_count: notes.filter((note) => note.group_id === group.id && !note.deleted_at).length })),
      notes: notes.map(({ body, ...row2 }) => row2),
      can_edit: true,
      draft_scope: c.ownerId
    };
  }
  const operation = /^\/memos\/operations\/([^/]+)$/.exec(path);
  if (method === "GET" && operation) {
    const receipt = await c.receipt("memo", idOf(operation[1]));
    return receipt ? { found: true, ...receipt } : { found: false };
  }
  if (path === "/memos/trash/clear") throw fail(405, "LOCAL_SOFT_DELETE_ONLY", "\u672C\u673A\u7248\u53EA\u4FDD\u7559\u53EF\u6062\u590D\u5220\u9664\uFF0C\u4E0D\u6267\u884C\u6C38\u4E45\u6E05\u7A7A\u3002");
  const match = /^\/memos\/(groups|notes)\/([^/]+)(\/restore)?$/.exec(path);
  if (!match) throw unsupported();
  const kind = match[1], table2 = kind === "groups" ? "memo_group" : "memo_note", id2 = idOf(match[2]), restore = Boolean(match[3]), row = c.get(table2, id2);
  const count2 = (groupId) => c.list("memo_note").filter((note) => note.group_id === groupId && !note.deleted_at).length;
  const view2 = (value) => ({ ...value, can_edit: true, ...kind === "groups" ? { active_note_count: count2(value.id) } : {} });
  if (method === "GET" && !restore) {
    if (!row) throw fail(404, "NOT_FOUND", "\u672C\u673A\u5907\u5FD8\u5F55\u4E0D\u5B58\u5728\u3002");
    return view2(row);
  }
  if (!["PUT", "DELETE", "POST"].includes(method) || restore !== (method === "POST")) throw unsupported();
  exact(b, [
    "version",
    "save_id",
    ...method === "PUT" ? ["title", "position", ...kind === "notes" ? ["group_id", "body"] : []] : [],
    ...method === "DELETE" && kind === "groups" ? ["confirm_title", "confirm_note_count"] : []
  ]);
  versionOf(b.version, method === "PUT" ? 0 : 1);
  const saveId = idOf(b.save_id);
  let content;
  if (method === "PUT") {
    const title = titleOf(b.title);
    if (!Number.isSafeInteger(b.position) || b.position < 0 || b.position > 1e6) throw invalid("\u6392\u5E8F\u4F4D\u7F6E\u65E0\u6548\u3002");
    content = { title, position: b.position, ...kind === "notes" ? { group_id: idOf(b.group_id), body: bodyText(b.body) } : {} };
  }
  if (method === "DELETE" && kind === "groups" && (typeof b.confirm_title !== "string" || !Number.isSafeInteger(b.confirm_note_count) || b.confirm_note_count < 0 || b.confirm_note_count > limit.notes)) throw invalid();
  return c.commit("memo", saveId, { method, path, ...b }, async () => {
    currentVersion(row, b.version, { allowMissing: method === "PUT", allowDeleted: method !== "PUT" });
    if (restore && !row.deleted_at || method === "DELETE" && row.deleted_at) throw fail(409, "VERSION_CONFLICT", "\u5220\u9664\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
    if (method === "PUT" && !row && c.list(table2).length >= limit[kind]) throw fail(409, "MEMOS_LIMIT", "\u5907\u5FD8\u5F55\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u56DE\u6536\u7AD9\u4E5F\u8BA1\u5165\u3002");
    if (kind === "notes" && (method === "PUT" || restore)) {
      if (row && method === "PUT" && row.group_id !== content.group_id) throw invalid("\u5DF2\u6709\u7B14\u8BB0\u6240\u5C5E\u5206\u7EC4\u4E0D\u53EF\u66F4\u6539\u3002");
      const group = c.get("memo_group", row?.group_id || content.group_id);
      if (!group || group.deleted_at) throw fail(409, "MEMO_GROUP_UNAVAILABLE", "\u5206\u7EC4\u4E0D\u5B58\u5728\u6216\u5DF2\u5220\u9664\uFF0C\u8BF7\u5148\u6062\u590D\u3002");
    }
    if (method === "DELETE" && kind === "groups" && (row.title !== b.confirm_title || count2(id2) !== b.confirm_note_count)) throw fail(409, "MEMO_DELETE_CONFIRMATION", "\u5206\u7EC4\u540D\u79F0\u6216\u7B14\u8BB0\u6570\u91CF\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u3002");
    const value = {
      ...content || row,
      id: id2,
      version: b.version + 1,
      change_seq: await c.revision(),
      created_at: row?.created_at || c.stamp,
      updated_at: c.stamp,
      deleted_at: method === "DELETE" ? c.stamp : null
    };
    await c.history(table2, row);
    await c.put(table2, id2, value);
    const receipt = { kind, id: id2, version: value.version, change_seq: value.change_seq, deleted_at: value.deleted_at, entity_hash: await digest(value) };
    return { response: view2(value), checks: [{ kind: table2, id: id2, version: value.version }], receipt };
  });
}
var limit, sort;
var init_memos = __esm({
  "local-ui/frontend/web/local/memos.mjs"() {
    init_common();
    limit = { groups: 32, notes: 200 };
    sort = (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  }
});

// local-ui/frontend/web/local/review.mjs
function offsetOf(query) {
  const raw = query.get("offset") ?? "0";
  if (!/^(0|[1-9]\d*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw invalid("\u5206\u9875\u504F\u79FB\u987B\u4E3A\u975E\u8D1F\u5B89\u5168\u6574\u6570\u3002");
  return Number(raw);
}
function checkedRows(ctx, kind) {
  const rows = ctx.list(kind).filter(active), ids = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id || ids.has(row.id))
      throw fail(409, "LOCAL_REVIEW_INVALID", "\u672C\u673A\u590D\u76D8\u8BB0\u5F55\u6807\u8BC6\u65E0\u6548\u6216\u91CD\u590D\uFF0C\u8BF7\u6838\u5BF9\u5DF2\u6709\u8D44\u6599\u3002");
    ids.add(row.id);
  }
  return rows;
}
function limited(data2) {
  const count2 = Object.values(data2).reduce((sum, rows) => sum + rows.length, 0);
  if (count2 > REVIEW_READ_LIMITS.totalRows || new TextEncoder().encode(canonical(data2)).length > REVIEW_READ_LIMITS.totalBytes)
    throw fail(413, "LOCAL_REVIEW_TOO_LARGE", "\u672C\u673A\u590D\u76D8\u8D44\u6599\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\uFF0C\u672A\u8FD4\u56DE\u4E0D\u5B8C\u6574\u7EDF\u8BA1\u3002");
  return data2;
}
function page(rows, offset, extra = {}) {
  return { items: rows.slice(offset, offset + 100), has_more: rows.length > offset + 100, ...extra };
}
function ordered(resource, rows) {
  const field2 = {
    articles: "published_at",
    snapshots: "snapshot_date",
    reports: "period_end",
    playbooks: "published_on",
    "benchmark-accounts": "created_at",
    "benchmark-articles": "collected_on",
    notes: "note_date",
    "account-health": "observed_on"
  }[resource];
  return rows.sort((a, b) => compare(b[field2], a[field2]) || compare(a.id, b.id));
}
async function reviewRoute(ctx) {
  if (ctx.method !== "GET") throw unsupported();
  const q = ctx.url.searchParams;
  if (ctx.path === "/ai-reports") {
    queryOnly(q, ["offset"]);
    const offset2 = offsetOf(q), rows2 = limited({ reports: checkedRows(ctx, "ai-report") }).reports;
    rows2.sort((a, b) => compare(b.created_at, a.created_at) || compare(b.id, a.id));
    return page(rows2.map(({ id: id2, author, content, created_at }) => ({ id: id2, author, content, created_at })), offset2);
  }
  if (ctx.path === "/work-reminders") {
    queryOnly(q, ["date"]);
    const date = q.has("date") ? dateOf(q.get("date")) : ctx.today;
    const rows2 = checkedRows(ctx, "work-reminder").filter((row) => row.date === date);
    if (rows2.length > REVIEW_READ_LIMITS.remindersPerDay) throw fail(413, "LOCAL_REMINDERS_TOO_LARGE", "\u8BE5\u65E5\u672C\u673A\u63D0\u9192\u8D85\u8FC7\u5B8C\u6574\u8BFB\u53D6\u4E0A\u9650\u3002");
    rows2.sort((a, b) => compare(a.created_at, b.created_at) || compare(a.id, b.id));
    return { date, items: rows2.map(({ id: id2, date: date2, source_key, summary, version, change_seq, created_at, updated_at }) => ({ id: id2, date: date2, source_key, summary, version, change_seq, created_at, updated_at })), can_edit: false };
  }
  const match = /^\/review\/([^/]+)$/.exec(ctx.path), resource = match?.[1];
  if (!REVIEW_COLLECTIONS.includes(resource)) throw unsupported();
  queryOnly(q, ["account", "offset", "read_revision"]);
  const account = textOf(q.get("account"), 120), offset = offsetOf(q);
  const all = limited(Object.fromEntries(REVIEW_COLLECTIONS.map((name) => [name, checkedRows(ctx, kindOf(name))])));
  const revision = await digest({ scope: ctx.scope, collections: Object.fromEntries(REVIEW_COLLECTIONS.map((name) => [name, [...all[name]].sort((a, b) => compare(a.id, b.id))])) });
  if (q.has("read_revision") && q.get("read_revision") !== revision)
    throw fail(409, "READ_REVISION_CHANGED", "\u672C\u673A\u590D\u76D8\u8D44\u6599\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u4ECE\u7B2C\u4E00\u9875\u91CD\u65B0\u8BFB\u53D6\u3002");
  const articles = new Set(all.articles.filter((row) => row.account === account).map((row) => row.id));
  const parents = new Map(all["benchmark-accounts"].map((row) => [row.id, row]));
  const rows = resource === "snapshots" ? all.snapshots.filter((row) => articles.has(row.article_id)) : resource === "benchmark-articles" ? all[resource].filter((row) => parents.get(row.benchmark_account_id)?.account === account).map((row) => ({
    ...row,
    account: parents.get(row.benchmark_account_id).account,
    used_by_article_ids: all.articles.filter((article) => article.reference_article_id === row.id).map((article) => article.id).sort()
  })) : all[resource].filter((row) => row.account === account);
  return page(ordered(resource, rows), offset, { read_revision: revision });
}
var REVIEW_COLLECTIONS, REVIEW_READ_LIMITS, kindOf, active, compare;
var init_review = __esm({
  "local-ui/frontend/web/local/review.mjs"() {
    init_common();
    REVIEW_COLLECTIONS = Object.freeze(["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health"]);
    REVIEW_READ_LIMITS = Object.freeze({ page: 100, totalRows: 2e4, totalBytes: 16 * 1024 * 1024, remindersPerDay: 100 });
    kindOf = (resource) => "review:" + resource;
    active = (row) => !row.deleted_at && row.deleted !== true;
    compare = (a, b) => String(a ?? "").localeCompare(String(b ?? ""));
  }
});

// local-ui/frontend/web/local/api.mjs
function createLocalApi({ db, now = Date.now, uuid: uuid2 = () => globalThis.crypto.randomUUID(), ownerId = LOCAL_OWNER_ID } = {}) {
  if (!db || typeof db.transaction !== "function") throw new TypeError("A durable database adapter is required");
  ownerId = idOf(ownerId);
  const scope = "local:v1:" + ownerId;
  const key2 = (type, id2) => JSON.stringify([scope, type, id2]);
  return async function call(path, options2 = {}) {
    const method = (options2.method || "GET").toUpperCase();
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) throw invalid("\u4EC5\u5141\u8BB8\u672C\u673A API \u8DEF\u5F84\u3002");
    const url = new URL(path, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.hash || path.split("?")[0] !== url.pathname) throw invalid("\u672C\u673A API \u8DEF\u5F84\u65E0\u6548\u3002");
    const active2 = () => {
      if (options2.signal?.aborted || options2.context?.controller?.signal?.aborted) throw new DOMException("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "AbortError");
      options2.offlineGuard?.();
    };
    active2();
    const writing = method !== "GET";
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw unsupported();
    let body = options2.body;
    if (writing) {
      if (url.search) throw invalid("\u672C\u673A\u5199\u5165\u4E0D\u63A5\u53D7\u67E5\u8BE2\u53C2\u6570\u3002");
      if (body === void 0) body = {};
      if (!body || Object.getPrototypeOf(body) !== Object.prototype) throw invalid("\u5199\u5165\u9700\u8981 JSON \u5BF9\u8C61\u3002");
      try {
        assertOfflineData(body);
        body = clone(body);
      } catch {
        throw invalid();
      }
    } else if (body !== void 0) throw invalid("\u8BFB\u53D6\u4E0D\u63A5\u53D7\u6B63\u6587\u3002");
    const at = now();
    if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime())) throw invalid("\u672C\u673A\u65F6\u95F4\u65E0\u6548\u3002");
    let value;
    try {
      value = await db.transaction(["entities", "meta"], writing ? "readwrite" : "readonly", async (tx) => {
        active2();
        const all = (await tx.getAll("entities")).filter((row) => row.scope === scope);
        const rows = new Map(all.map((row) => [row.key, row]));
        const record = (kind, id2) => rows.get(key2(kind, id2));
        const ctx = {
          tx,
          scope,
          ownerId,
          method,
          body,
          url,
          path: url.pathname,
          at,
          stamp: new Date(at).toISOString(),
          today: beijingDay(at),
          uuid: uuid2,
          get: (kind, id2) => clone(record(kind, id2)?.value),
          list: (kind) => [...rows.values()].filter((row) => row.kind === kind).map((row) => clone(row.value)),
          async put(kind, id2, value2) {
            const row = { key: key2(kind, id2), scope, kind, id: id2, value: clone(value2) };
            await tx.put("entities", row);
            rows.set(row.key, row);
          },
          async revision() {
            const revisionKey = key2("meta", "revision"), current3 = await tx.get("meta", revisionKey), revision = (current3?.value || 0) + 1;
            if (!Number.isSafeInteger(revision)) throw fail(503, "LOCAL_REVISION", "\u672C\u673A\u4FEE\u8BA2\u53F7\u8D85\u51FA\u8303\u56F4\u3002");
            await tx.put("meta", { key: revisionKey, value: revision });
            return revision;
          },
          async history(kind, row) {
            if (row) await ctx.put("history", kind + ":" + row.id + ":" + row.version, { kind, ...row });
          },
          async receipt(domain, id2) {
            return (await tx.get("meta", key2("receipt:" + domain, id2)))?.receipt;
          },
          async commit(domain, operationId, request, work) {
            const receiptKey = key2("receipt:" + domain, operationId), fingerprint = canonical(request);
            const saved = await tx.get("meta", receiptKey);
            if (saved) {
              if (saved.fingerprint !== fingerprint) throw fail(409, "IDEMPOTENCY_CONFLICT", "\u64CD\u4F5C\u6807\u8BC6\u5DF2\u7528\u4E8E\u4E0D\u540C\u5185\u5BB9\uFF0C\u672A\u91CD\u590D\u4FDD\u5B58\u3002");
              for (const check2 of saved.checks) if (ctx.get(check2.kind, check2.id)?.version !== check2.version)
                throw fail(409, "VERSION_CONFLICT", "\u539F\u64CD\u4F5C\u5DF2\u4FDD\u5B58\uFF0C\u8BB0\u5F55\u968F\u540E\u5DF2\u6709\u66F4\u65B0\uFF0C\u8BF7\u6838\u5BF9\u4FDD\u5B58\u6536\u636E\u3002");
              return clone(saved.response);
            }
            const { response, checks = [], receipt = {} } = await work();
            await tx.put("meta", { key: receiptKey, fingerprint, response, checks, receipt, created_at: ctx.stamp });
            return clone(response);
          }
        };
        let result;
        if (method === "GET" && ctx.path === "/auth/me") {
          queryOnly(url.searchParams);
          result = { id: ownerId, username: "\u672C\u673A\u5DE5\u4F5C\u533A", publicBusiness: true, localOnly: true };
        } else if (method === "GET" && ctx.path === "/accounts") {
          queryOnly(url.searchParams);
          result = ctx.list("account");
        } else if (method === "GET" && ctx.path === "/workbench-snapshot/index") {
          queryOnly(url.searchParams, ["version"]);
          if (url.searchParams.get("version") !== "2") throw invalid();
          result = {
            format: "haoduoyu-workbench-snapshot-v2",
            complete: true,
            projection: "current",
            scope_id: scope,
            entities: [...rows.values()].filter((row) => !["history", "label"].includes(row.kind)).map((row) => ({ entity_id: row.kind + ":" + row.id, version: row.value.version || 0 }))
          };
        } else if (/^\/(todos|unscheduled-todos|todo-templates|todo-preferences)(\/|$)/.test(ctx.path)) result = await todosRoute(ctx);
        else if (/^\/(note-entries|daily-notes)(\/|$)/.test(ctx.path)) result = await notesRoute(ctx, options2.headers || {});
        else if (/^\/memos(\/|$)/.test(ctx.path)) result = await memosRoute(ctx);
        else if (/^\/(review|ai-reports|work-reminders)(\/|$)/.test(ctx.path)) result = await reviewRoute(ctx);
        else throw unsupported();
        if (typeof options2.localDraftCommit === "function" && method === "POST" && ["/todos", "/unscheduled-todos"].includes(ctx.path))
          await options2.localDraftCommit(tx);
        active2();
        return result;
      });
    } catch (error) {
      if (error.status || error.name === "AbortError") throw error;
      throw Object.assign(new Error("\u672C\u673A\u5B58\u50A8\u5931\u8D25\uFF0C\u672A\u786E\u8BA4\u4FDD\u5B58\u3002\u8BF7\u4FDD\u7559\u8349\u7A3F\u5E76\u6838\u5BF9\u5DF2\u6709\u8BB0\u5F55\u3002", { cause: error }), { code: "LOCAL_STORAGE_FAILURE", localNotSaved: true });
    }
    return options2.envelope ? { data: value } : value;
  };
}
var init_api = __esm({
  "local-ui/frontend/web/local/api.mjs"() {
    init_db();
    init_common();
    init_todos();
    init_notes();
    init_memos();
    init_review();
  }
});

// local-ui/frontend/web/local/runtime.mjs
function createStandaloneRuntime({ db, now = Date.now, uuid: uuid2 = () => crypto.randomUUID() } = {}) {
  const service = createLocalApi({ db, now, uuid: uuid2, ownerId: LOCAL_OWNER_ID });
  const listeners = /* @__PURE__ */ new Set();
  const identity4 = { id: LOCAL_OWNER_ID, username: "\u672C\u673A", publicBusiness: true, localOnly: true };
  const state2 = {
    scope: LOCAL_SCOPE,
    verifiedScope: LOCAL_SCOPE,
    identity: identity4,
    localOnly: true,
    online: true,
    phase: "local",
    pending: 0,
    conflicts: 0,
    unsupported: 0,
    lastSuccess: null,
    error: null,
    ready: true
  };
  const drafts = createDraftJournal({ db, getScope: () => LOCAL_SCOPE, getGeneration: () => 0, now, draftOwner: uuid2() });
  const composerDrafts = createComposerJournal({ db, scope: LOCAL_SCOPE, uuid: uuid2, onError(error) {
    state2.error = error.message;
    emit();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("haoduoyu:local-draft-error", { detail: { message: error.message } }));
  } });
  const composerReady = composerDrafts.initialize();
  composerReady.catch(() => {
  });
  const flushAllDrafts = async () => {
    await composerReady;
    await drafts.flush();
    await composerDrafts.flush();
  };
  const token = () => ({ scope: LOCAL_SCOPE, generation: 0, localOnly: true });
  const emit = () => {
    for (const listener of listeners) listener({ ...state2 });
  };
  const unavailable = () => {
    throw Object.assign(new Error("\u8FD9\u662F\u72EC\u7ACB\u672C\u673A\u7248\u672C\uFF0C\u6CA1\u6709\u7EBF\u4E0A\u540C\u6B65\u961F\u5217\u3002\u539F\u5185\u5BB9\u4FDD\u7559\u3002"), { code: "LOCAL_ONLY", status: 409 });
  };
  return {
    state: state2,
    composerDrafts,
    composerReady,
    async call(path, options2 = {}) {
      if (options2.signal?.aborted || options2.context?.controller?.signal.aborted)
        throw new DOMException("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "AbortError");
      options2.offlineGuard?.();
      await composerReady;
      const snapshot = options2.localDraftSnapshot;
      const clean = { ...options2 };
      delete clean.localDraftSnapshot;
      delete clean.localDraftCommit;
      if (snapshot) {
        const expectedPath = snapshot.kind === "todo" ? "/todos" : snapshot.kind === "future" ? "/unscheduled-todos" : null;
        if (path !== expectedPath || String(options2.method).toUpperCase() !== "POST" || snapshot.text.trim() !== options2.body?.text || snapshot.kind === "todo" && snapshot.identity !== options2.body?.date)
          throw new Error("\u8349\u7A3F\u4E0E\u4FDD\u5B58\u5185\u5BB9\u4E0D\u5339\u914D\uFF0C\u672A\u6E05\u9664\u8F93\u5165\u3002");
        const hook = composerDrafts.commitHook(snapshot);
        await composerDrafts.flush();
        const result = await service(path, { ...clean, localDraftCommit: hook });
        composerDrafts.accept(snapshot);
        return result;
      }
      return service(path, clean);
    },
    async sync() {
      await flushAllDrafts();
      return { ...state2 };
    },
    async refresh() {
      await flushAllDrafts();
      emit();
      return { ...state2 };
    },
    start() {
      return () => {
      };
    },
    stop() {
    },
    captureRateLimitContext: token,
    async recordRateLimit() {
    },
    async queue() {
      return { operations: [], conflicts: [] };
    },
    resolve: unavailable,
    invalidate: unavailable,
    readMemo: (path) => service(path),
    localRead: (path) => service(path),
    // Original month UI safely falls back to local per-day reads.
    async readTodoMonthSnapshot() {
      return null;
    },
    findTodo: (id2) => service("/todos/" + encodeURIComponent(id2)),
    async acceptMovedTodo({ source, todo }, expected) {
      if (!expected || expected.scope !== LOCAL_SCOPE || expected.generation !== 0 || source?.id !== todo?.id)
        return "refresh";
      const actual = await service("/todos/" + encodeURIComponent(todo.id));
      return actual.version === todo.version && actual.date === todo.date ? "saved" : "refresh";
    },
    retainDrafts: drafts.capture,
    retainedDrafts: drafts.list,
    retainedDraftRecords: drafts.records,
    purgeVerifiedNoteDrafts: drafts.purgeVerified,
    purgeUserDeletedNoteDrafts: drafts.purgeUserDeleted,
    discardUnsentNoteDraft: drafts.discardUnsent,
    discardSelectedDraft: drafts.discardSelected,
    flushDrafts: flushAllDrafts,
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state2 });
      return () => listeners.delete(listener);
    }
  };
}
function getOfflineRuntime() {
  return singleton;
}
function onOfflineRuntime(callback) {
  readyListeners.add(callback);
  if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
async function getLocalRuntime() {
  if (!initialization) initialization = openOfflineDB({ name: LOCAL_DATABASE_NAME }).then(async (db) => {
    singleton = createStandaloneRuntime({ db });
    await singleton.composerReady;
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  try {
    return await initialization;
  } catch (cause) {
    throw Object.assign(
      new Error("\u65E0\u6CD5\u6253\u5F00\u672C\u673A\u6570\u636E\u5E93\uFF0C\u672C\u6B21\u6CA1\u6709\u4FDD\u5B58\u3002\u8BF7\u4FDD\u7559\u8F93\u5165\uFF0C\u4E0D\u8981\u5378\u8F7D\u6216\u6E05\u9664\u6570\u636E\u3002"),
      { code: "LOCAL_STORAGE_UNAVAILABLE", status: 503, cause }
    );
  }
}
function bindLocalComposer(object2, property, kind, identity4 = "") {
  if (!singleton) throw new Error("\u672C\u673A\u8349\u7A3F\u5B58\u50A8\u5C1A\u672A\u51C6\u5907\u597D\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u3002");
  return singleton.composerDrafts.bind(object2, property, kind, identity4);
}
function localComposerUnchanged(snapshot) {
  return singleton?.composerDrafts.unchangedSince(snapshot) || false;
}
function localComposerRequestSnapshot(request, kind, identity4 = "") {
  if (!singleton) throw new Error("\u672C\u673A\u8349\u7A3F\u5B58\u50A8\u5C1A\u672A\u51C6\u5907\u597D\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u3002");
  return singleton.composerDrafts.requestSnapshot(request, kind, identity4);
}
var singleton, initialization, readyListeners, OFFLINE_FEATURES;
var init_runtime = __esm({
  "local-ui/frontend/web/local/runtime.mjs"() {
    init_db();
    init_drafts();
    init_drafts2();
    init_api();
    singleton = null;
    initialization = null;
    readyListeners = /* @__PURE__ */ new Set();
    OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true });
  }
});

// local-ui/frontend/web/local/client.mjs
var client_exports = {};
__export(client_exports, {
  api: () => api,
  apiNetwork: () => apiNetwork
});
async function localRequest(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity4 = state.me?.id ?? null;
  const active2 = () => {
    if (epoch !== runtime.sessionEpoch || identity4 !== (state.me?.id ?? null) || options2.signal?.aborted || options2.context?.controller?.signal.aborted) throw new DOMException("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "AbortError");
  };
  const local = await getLocalRuntime();
  active2();
  return local.call(path, { ...options2, offlineGuard: active2 });
}
var api, apiNetwork;
var init_client = __esm({
  "local-ui/frontend/web/local/client.mjs"() {
    init_state();
    init_runtime();
    api = localRequest;
    apiNetwork = localRequest;
  }
});

// local-ui/frontend/web/local/lifecycle.mjs
var editorGuards = /* @__PURE__ */ new WeakMap();
var fieldIdentity = (field2) => JSON.stringify([field2.id, { ...field2.dataset }, field2.form?.dataset?.date]);
function localEditorPaintValue(field2, proposed) {
  const guard = editorGuards.get(field2);
  if (!guard) return proposed;
  if (!guard.valid()) {
    editorGuards.delete(field2);
    return proposed;
  }
  const consumed = guard.record.consumedValue(field2);
  if (consumed !== void 0) {
    editorGuards.delete(field2);
    return consumed;
  }
  return guard.value;
}
function installLocalLifecycle({
  window: window2,
  document: document2,
  getRuntime,
  getReadyRuntime = null,
  capture = () => {
  },
  collect = () => {
  },
  reportError = () => {
  },
  timeoutMs = 8e3,
  timers = globalThis
} = {}) {
  const requests = /* @__PURE__ */ new Map(), observedDocuments = /* @__PURE__ */ new WeakSet();
  let active2 = null, backgroundSequence = 0;
  const navigation = Object.freeze({
    "notes-date": ["date", "#daily-notes"],
    "notes-history-month": ["month", "#daily-notes"],
    "notes-month-input": ["month", "#notes-month-panel"],
    "reminder-date": ["date", "#work-reminders"],
    "todo-date": ["date", "#daily-todos"],
    "todo-calendar-month-input": ["month", "#daily-todos"]
  });
  const navigationOnly = (field2) => {
    const entry = navigation[field2.id];
    return Boolean(entry && field2.type === entry[0] && field2.closest?.(entry[1]));
  };
  const supported = (field2) => field2.type !== "password" && (["todo-text", "todo-future-text", "memo-title", "memo-body", "notes-editor"].includes(field2.id) || Boolean(field2.dataset?.noteEntryEditor));
  const editable = (field2) => !field2.disabled && !field2.readOnly && !["button", "submit", "reset", "hidden", "checkbox", "radio", "range", "color", "file"].includes(field2.type);
  function unsupportedFields(targetDocument = document2, extraSupported = /* @__PURE__ */ new Set()) {
    return [...targetDocument.querySelectorAll("input,textarea")].filter((field2) => {
      if (!editable(field2) || supported(field2) || extraSupported.has(field2) || navigationOnly(field2)) return false;
      const type = field2.type || "text";
      if (["date", "month", "week", "time", "datetime-local", "number", "search"].includes(type))
        return Boolean(String(field2.value || "")) || String(field2.value || "") !== String(field2.defaultValue || "");
      return Boolean(String(field2.value || ""));
    }).map((field2) => field2.id || field2.name || field2.getAttribute?.("aria-label") || "\u672A\u547D\u540D\u8F93\u5165\u6846");
  }
  function freeze(record, targetDocument = document2) {
    const root2 = targetDocument.body, inert = root2?.inert;
    const controls = /* @__PURE__ */ new Map();
    const lock = () => {
      for (const control of targetDocument.querySelectorAll("button,input,textarea,select")) {
        if (!controls.has(control)) controls.set(control, { disabled: control.disabled, readOnly: control.readOnly });
        if (!control.disabled) control.disabled = true;
        if ("readOnly" in control && !control.readOnly) control.readOnly = true;
      }
      if (root2) root2.inert = true;
    };
    const block = (event) => {
      if (active2 === record) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const types = ["beforeinput", "keydown", "click", "submit", "compositionstart"];
    for (const type of types) targetDocument.addEventListener(type, block, true);
    let observer;
    if (window2.MutationObserver && root2) {
      observer = new window2.MutationObserver(lock);
      observer.observe(root2, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "readonly"] });
    }
    lock();
    return () => {
      observer?.disconnect();
      for (const type of types) targetDocument.removeEventListener(type, block, true);
      for (const [control, previous] of controls) {
        control.disabled = previous.disabled;
        if ("readOnly" in control) control.readOnly = previous.readOnly;
      }
      if (root2) root2.inert = inert;
    };
  }
  function restore(record, preserve = true) {
    if (record.released) return;
    record.released = true;
    if (!preserve) for (const field2 of record.snapshots.keys()) {
      if (editorGuards.get(field2)?.record === record) editorGuards.delete(field2);
    }
    for (const callback of record.resumes.reverse()) {
      try {
        callback();
      } catch (error) {
        reportError(error);
      }
    }
    for (const unlock of record.extraUnlocks.reverse()) unlock();
    record.unlock?.();
    if (active2 === record) active2 = null;
    for (const [field2, snapshot] of record.snapshots) {
      if (!record.validField(field2)) continue;
      if (preserve) {
        const consumed = record.consumedValue(field2);
        if (consumed !== void 0) {
          if (editorGuards.get(field2)?.record === record) editorGuards.delete(field2);
          field2.value = consumed;
        } else field2.value = snapshot.value;
        continue;
      }
      const kind = snapshot.id === "todo-text" ? "todo" : snapshot.id === "todo-future-text" ? "future" : null;
      if (!kind || !record.runtime?.composerDrafts) continue;
      try {
        const current3 = record.runtime.composerDrafts.read(kind, kind === "todo" ? snapshot.form.dataset.date : "");
        if (typeof current3 !== "string") throw new Error("\u672C\u673A\u7F16\u8F91\u5668\u6062\u590D\u7ED3\u679C\u65E0\u6548\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u3002");
        field2.value = current3;
      } catch (error) {
        reportError(error);
      }
    }
  }
  function failed(record, error) {
    if (record.state !== "pending") return;
    record.state = "failed";
    record.error = String(error?.message || error);
    timers.clearTimeout(record.timer);
    restore(record);
    reportError(error);
  }
  function requestFlush(id2) {
    if (typeof id2 !== "string" || !id2 || id2.length > 160) return "unknown";
    if (requests.has(id2)) return requests.get(id2).state;
    const record = {
      id: id2,
      state: "pending",
      resumes: [],
      extraUnlocks: [],
      lockedDocuments: /* @__PURE__ */ new Set(),
      snapshots: /* @__PURE__ */ new Map(),
      composerProofs: /* @__PURE__ */ new Map(),
      stages: [],
      documentFields: /* @__PURE__ */ new Map(),
      released: false
    };
    requests.set(id2, record);
    if (active2) {
      record.state = "failed";
      record.error = "\u53E6\u4E00\u6B21\u5173\u95ED\u6838\u5BF9\u5C1A\u672A\u7ED3\u675F\u3002";
      return record.state;
    }
    active2 = record;
    let readyRuntime = null;
    const bindComposerProof = (field2, value, runtime2) => {
      const journal = runtime2?.composerDrafts;
      const kind = value.id === "todo-text" ? "todo" : value.id === "todo-future-text" ? "future" : null;
      if (!kind || !journal?.snapshot || !journal?.wasConsumed) return;
      const identity4 = kind === "todo" ? value.form.dataset.date : "";
      const capability = journal.snapshot(kind, identity4);
      if (capability.text === value.value) record.composerProofs.set(field2, { journal, capability, kind, identity: identity4 });
    };
    record.consumedValue = (field2) => {
      const proof = record.composerProofs.get(field2), value = record.snapshots.get(field2);
      if (proof && record.runtime && record.runtime.composerDrafts !== proof.journal) return void 0;
      return proof && value?.value === proof.capability.text && proof.journal.wasConsumed(proof.capability) ? proof.journal.read(proof.kind, proof.identity) : void 0;
    };
    const waits = [], protectedFields = /* @__PURE__ */ new Set(), required = [], unsupported2 = [], documents2 = /* @__PURE__ */ new Set();
    let capturing = true;
    const captureErrors = [];
    record.validField = (field2) => {
      const snapshot2 = record.snapshots.get(field2);
      return Boolean(snapshot2 && field2.isConnected !== false && fieldIdentity(field2) === snapshot2.fingerprint && record.stages.filter((stage) => stage.field === field2).every((stage) => stage.valid()));
    };
    const snapshot = (field2) => {
      const value = record.snapshots.get(field2);
      if (!value) throw new Error("\u5F53\u524D\u8F93\u5165\u4E0D\u5C5E\u4E8E\u672C\u6B21\u5173\u95ED\u5FEB\u7167\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u540E\u91CD\u8BD5\u3002");
      return value;
    };
    const detail = {
      localSnapshot: true,
      snapshot,
      fail: (error) => captureErrors.push(error),
      editors: () => Object.freeze([...record.snapshots].map(([field2, value]) => Object.freeze({ field: field2, snapshot: value }))),
      captureDocument: (target, extra = []) => {
        if (!capturing) throw new Error("\u5173\u95ED\u5FEB\u7167\u767B\u8BB0\u5DF2\u7ECF\u7ED3\u675F\u3002");
        if (!target || documents2.has(target)) return;
        documents2.add(target);
        record.documentFields.set(target, new Set(target.querySelectorAll("input,textarea")));
        const extras = new Set(extra);
        unsupported2.push(...unsupportedFields(target, extras));
        for (const field2 of target.querySelectorAll("input,textarea")) {
          if (!supported(field2) && !extras.has(field2)) continue;
          const value = Object.freeze({
            id: field2.id,
            value: String(field2.value ?? ""),
            dataset: Object.freeze({ ...field2.dataset }),
            form: Object.freeze({ dataset: Object.freeze({ ...field2.form?.dataset }) }),
            readOnly: field2.readOnly,
            composing: field2.dataset?.composing === "true",
            fingerprint: fieldIdentity(field2)
          });
          record.snapshots.set(field2, value);
          if (getReadyRuntime && ["todo-text", "todo-future-text"].includes(value.id) && value.value && (!readyRuntime?.composerDrafts?.snapshot || !readyRuntime.composerDrafts.wasConsumed))
            throw new Error("\u672C\u673A\u8349\u7A3F\u5B58\u50A8\u5C1A\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u6838\u5BF9\u539F\u63D0\u4EA4\u7248\u672C\uFF0C\u672C\u6B21\u672A\u5141\u8BB8\u5173\u95ED\u3002\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u3002");
          const previous = editorGuards.get(field2);
          if (previous?.valid() && previous.value === value.value && previous.record.consumedValue(field2) !== void 0)
            record.composerProofs.set(field2, previous.record.composerProofs.get(field2));
          else bindComposerProof(field2, value, readyRuntime);
          if (editable(field2)) required.push(field2);
        }
        const edited = (event) => {
          if (!active2) editorGuards.delete(event.target);
        };
        if (!observedDocuments.has(target)) {
          observedDocuments.add(target);
          target.addEventListener("beforeinput", edited, true);
          target.addEventListener("input", edited, true);
        }
      },
      stage: ({ field: field2, key: key2, valid: valid2 = () => true, apply, composing = false }) => {
        if (!capturing || typeof apply !== "function" || typeof key2 !== "string") throw new Error("\u65E0\u6548\u7684\u5173\u95ED\u91C7\u96C6\u767B\u8BB0\u3002");
        const value = snapshot(field2);
        record.stages.push({ field: field2, key: key2, valid: valid2, apply, snapshot: value, composing: composing || value.composing });
        protectedFields.add(field2);
      },
      protect: (field2) => {
        snapshot(field2);
        protectedFields.add(field2);
      },
      lockDocument: (target) => {
        if (!documents2.has(target)) throw new Error("\u6D6E\u7A97\u6CA1\u6709\u5B8C\u6210\u540C\u6B65\u5173\u95ED\u5FEB\u7167\u3002");
      },
      waitUntil: (work) => {
        const promise = Promise.resolve(work);
        promise.catch(() => {
        });
        waits.push(promise);
      },
      onFailure: (callback) => {
        if (typeof callback === "function") record.resumes.push(callback);
      }
    };
    try {
      readyRuntime = getReadyRuntime?.();
      detail.captureDocument(document2);
      capture(detail);
      window2.dispatchEvent(new window2.CustomEvent("haoduoyu:capture-current-editors", { detail }));
      capturing = false;
      if (captureErrors.length) throw captureErrors[0];
      for (const [field2, value] of record.snapshots)
        editorGuards.set(field2, { record, value: value.value, valid: () => record.validField(field2) });
      const byKey = /* @__PURE__ */ new Map();
      for (const stage of record.stages) {
        if (!stage.valid() || !record.validField(stage.field)) throw new Error("\u7F16\u8F91\u8EAB\u4EFD\u6216\u9875\u9762\u5DF2\u53D8\u5316\uFF0C\u5DF2\u963B\u6B62\u5173\u95ED\uFF1B\u65E7\u539F\u6587\u4EC5\u5728\u672C\u6B21\u5185\u5B58\u5FEB\u7167\u4E2D\uFF0C\u65E0\u6CD5\u4FDD\u8BC1\u5728\u65B0\u9875\u9762\u6062\u590D\u3002\u8BF7\u52FF\u5237\u65B0\u6216\u9000\u51FA\u3002");
        if (stage.composing) throw new Error("\u8F93\u5165\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7ED3\u675F\u8F93\u5165\u540E\u518D\u5173\u95ED\u3002");
        const previous = byKey.get(stage.key);
        if (previous && previous.snapshot.value !== stage.snapshot.value)
          throw new Error("\u540C\u4E00\u6761\u8349\u7A3F\u5728\u4E3B\u9875\u9762\u548C\u6D6E\u7A97\u4E2D\u7684\u539F\u6587\u4E0D\u540C\uFF0C\u4E24\u4EFD\u8F93\u5165\u5DF2\u4FDD\u7559\u3002\u8BF7\u6838\u5BF9\u540E\u518D\u5173\u95ED\u3002");
        byKey.set(stage.key, stage);
      }
      if (record.stages.length && required.some((field2) => !protectedFields.has(field2)))
        throw new Error("\u5F53\u524D\u8F93\u5165\u6CA1\u6709\u5B8C\u6210\u540C\u6B65\u5173\u95ED\u5FEB\u7167\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\uFF1A" + required.filter((field2) => !protectedFields.has(field2)).map((field2) => field2.id || "\u5F53\u524D\u7F16\u8F91\u5668").join("\u3001"));
      if (unsupported2.length) throw new Error("\u4EE5\u4E0B\u8F93\u5165\u5C1A\u672A\u63A5\u5165\u672C\u673A\u5173\u7A97\u4FDD\u5B58\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u5E76\u5148\u5B8C\u6210\u6216\u53D6\u6D88\uFF1A" + unsupported2.join("\u3001"));
      for (const target of documents2) {
        record.lockedDocuments.add(target);
        record.extraUnlocks.push(freeze(record, target));
      }
    } catch (error) {
      capturing = false;
      failed(record, error);
      return record.state;
    }
    record.timer = timers.setTimeout(() => failed(record, new Error("\u672C\u673A\u4FDD\u5B58\u6838\u5BF9\u8D85\u65F6\uFF0C\u5C1A\u672A\u5141\u8BB8\u5173\u95ED\u3002\u8BF7\u4FDD\u7559\u8F93\u5165\u540E\u91CD\u8BD5\u3002")), timeoutMs);
    Promise.resolve().then(async () => {
      const runtime2 = await getRuntime();
      if (record.state !== "pending") return;
      record.runtime = runtime2;
      const validate = () => {
        for (const [target, original] of record.documentFields) {
          if ([...target.querySelectorAll("input,textarea")].some((field2) => !original.has(field2) && !navigationOnly(field2) && (supported(field2) || Boolean(String(field2.value || "")))))
            throw new Error("\u5173\u95ED\u91C7\u96C6\u540E\u9875\u9762\u51FA\u73B0\u4E86\u65B0\u7684\u672A\u91C7\u96C6\u8F93\u5165\uFF0C\u5DF2\u963B\u6B62\u5173\u95ED\u3002\u8BF7\u6838\u5BF9\u5F53\u524D\u9875\u9762\u540E\u91CD\u8BD5\u3002");
        }
        if (record.stages.some((stage) => !record.validField(stage.field)))
          throw new Error("\u7F16\u8F91\u8EAB\u4EFD\u6216\u9875\u9762\u5DF2\u53D8\u5316\uFF0C\u5DF2\u963B\u6B62\u5173\u95ED\uFF1B\u65E7\u539F\u6587\u4EC5\u5728\u672C\u6B21\u5185\u5B58\u5FEB\u7167\u4E2D\uFF0C\u65E0\u6CD5\u4FDD\u8BC1\u5728\u65B0\u9875\u9762\u6062\u590D\u3002\u8BF7\u52FF\u5237\u65B0\u6216\u9000\u51FA\u3002");
      };
      validate();
      for (const stage of record.stages) {
        if (record.consumedValue(stage.field) !== void 0) continue;
        detail.waitUntil(stage.apply(stage.snapshot, runtime2));
        bindComposerProof(stage.field, stage.snapshot, runtime2);
      }
      await collect(runtime2, detail);
      if (record.state !== "pending") return;
      validate();
      window2.dispatchEvent(new window2.CustomEvent("haoduoyu:collect-current-editors", { detail }));
      window2.dispatchEvent(new window2.CustomEvent("haoduoyu:before-refresh", { detail }));
      const missing2 = required.filter((field2) => !protectedFields.has(field2)).map((field2) => field2.id || field2.dataset?.noteEntryEditor || "\u5F53\u524D\u7F16\u8F91\u5668");
      if (missing2.length) detail.waitUntil(Promise.reject(new Error("\u5F53\u524D\u8F93\u5165\u6CA1\u6709\u5B8C\u6210\u672C\u673A\u4FDD\u5B58\u91C7\u96C6\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\uFF1A" + missing2.join("\u3001"))));
      const settled = await Promise.allSettled(waits);
      const rejected = settled.find((row) => row.status === "rejected");
      if (rejected) throw rejected.reason;
      if (record.state !== "pending") return;
      validate();
      await runtime2.flushDrafts();
      if (record.state !== "pending") return;
      validate();
      record.state = "complete";
      timers.clearTimeout(record.timer);
    }).catch((error) => failed(record, error));
    return "pending";
  }
  function status(id2) {
    return requests.get(id2)?.state || "unknown";
  }
  function resume(id2) {
    const record = requests.get(id2);
    if (!record) return "unknown";
    timers.clearTimeout(record.timer);
    const preserve = record.state !== "complete";
    record.state = "unknown";
    restore(record, preserve);
    return "unknown";
  }
  async function background() {
    if (active2) return;
    const id2 = "background:" + ++backgroundSequence;
    requestFlush(id2);
    while (status(id2) === "pending") await new Promise((resolve) => timers.setTimeout(resolve, 10));
    resume(id2);
    requests.delete(id2);
  }
  const api2 = Object.freeze({ requestFlush, status, resume });
  window2.haoduoyuLocalLifecycle = api2;
  window2.addEventListener("haoduoyu:local-background", () => {
    void background();
  });
  document2.addEventListener("visibilitychange", () => {
    if (document2.visibilityState === "hidden") void background();
  });
  return api2;
}

// local-ui/frontend/web/pages/unscheduled-todos.mjs
init_client();

// local-ui/frontend/web/core/dom.mjs
var $ = (q, root2 = document) => root2.querySelector(q);
var $$ = (q, root2 = document) => [...root2.querySelectorAll(q)];
var e = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var icons = {
  fish: '<path d="M18 8c-4-5-10-4-14 4 4 8 10 9 14 4l5 4V4z"/><circle cx="9" cy="11" r=".8" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  articles: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2v3l-1 2 3 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2V9l1-2-3-3-3 1-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14z"/>',
  link: '<path d="m9 15 6-6m-8 3-3 3a4 4 0 0 0 6 6l4-4m-4-10 4-4a4 4 0 0 1 6 6l-3 3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>'
};
var icon = (name, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.articles}</svg>`;

// local-ui/frontend/web/pages/unscheduled-todos.mjs
init_state();

// local-ui/frontend/web/core/format.mjs
init_constants();
init_state();
var num = (value) => value === null || value === void 0 || value === "" ? "\u2014" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(value));
var compact = (value) => value == null ? "\u2014" : Number(value) >= 1e4 ? `${num(Number(value) / 1e4)}\u4E07` : num(value);
var bjtDate = (value = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(value));
var time = (value, short = false) => {
  if (!value) return "\u672A\u8BB0\u5F55";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u672A\u8BB0\u5F55";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...short ? {} : {
    year: "numeric",
    second: "2-digit"
  }, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};
var duration = (seconds) => {
  if (seconds == null) return "\u672A\u8BB0\u5F55";
  const n = Number(seconds);
  if (n < 60) return `${Math.round(n)} \u79D2`;
  if (n < 3600) return `${Math.round(n / 60)} \u5206\u949F`;
  const h = Math.floor(n / 3600), m = Math.round(n % 3600 / 60);
  return m === 60 ? `${h + 1} \u5C0F\u65F6` : `${h} \u5C0F\u65F6${m ? ` ${m} \u5206\u949F` : ""}`;
};
var localDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 16);
};
var iso = (value) => value ? (/* @__PURE__ */ new Date(`${value}:00+08:00`)).toISOString() : null;
var metricData = (item) => {
  const raw = item?.metrics ?? item?.metrics_json ?? {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
};
var accountLabel = (account) => `${platforms[account.platform] || account.platform} \xB7 ${account.name}`;
var accountName = (id2) => {
  const a = state.accounts.find((a2) => a2.id === id2);
  return a ? accountLabel(a) : "\u672A\u627E\u5230\u8D26\u53F7";
};
var selectedQuery = () => state.account ? `account_id=${encodeURIComponent(state.account)}` : "";
function displayTime(value) {
  const stamp = Date.parse(value), diff = Date.now() - stamp;
  return !Number.isFinite(stamp) ? "\u672A\u8BB0\u5F55" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} \u5C0F\u65F6\u524D` : time(value, bjtDate(value).slice(0, 4) === bjtDate().slice(0, 4));
}
function safeURL(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// local-ui/frontend/web/core/todos-state.mjs
init_state();
init_runtime();
var todosState = { owner: "", days: /* @__PURE__ */ new Map(), today: "", calendarMonth: "", calendarDate: "" };
function todoOwner() {
  return JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null]);
}
function resetTodos() {
  if (typeof window !== "undefined" && typeof Event === "function") window.dispatchEvent(new Event("haoduoyu-todos-reset"));
  todosState.owner = todoOwner();
  todosState.days.clear();
  todosState.today = bjtDate();
  todosState.calendarMonth = "";
  todosState.calendarDate = "";
  todosState.preferences = { mode: "strike", version: 0, loaded: false, pending: null, error: "" };
}
function validTodoDate(date) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const parsed2 = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === date;
}
function todoDate() {
  return state.page === "todos" && validTodoDate(state.todoDate) ? state.todoDate : bjtDate();
}
function todoDay(date = todoDate()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  if (!todosState.days.has(date)) {
    todosState.days.set(date, {
      date,
      items: [],
      draft: "",
      create: null,
      adding: false,
      loading: false,
      loaded: false,
      error: "",
      notice: "",
      noticeVersion: 0,
      revision: 0,
      sequence: 0,
      updates: /* @__PURE__ */ new Map(),
      templateCreates: /* @__PURE__ */ new Map(),
      removals: /* @__PURE__ */ new Map(),
      templateLinks: /* @__PURE__ */ new Map(),
      templateWrites: /* @__PURE__ */ new Set()
    });
  }
  const day3 = todosState.days.get(date);
  if (!day3.localDraftBound) {
    bindLocalComposer(day3, "draft", "todo", date);
    day3.localDraftBound = true;
  }
  return day3;
}
function syncTodoDay(now = Date.now()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  const today = bjtDate(now), changed4 = todosState.today !== today;
  todosState.today = today;
  return changed4;
}
function todoSessionActive(owner2) {
  return Boolean(state.me) && owner2 === todoOwner() && owner2 === todosState.owner;
}
function mergeTodo(day3, item) {
  const index = day3.items.findIndex((row) => row.id === item.id);
  if (index < 0) day3.items.push(item);
  else if (day3.items[index].version <= item.version) day3.items[index] = item;
}
function todoTemplateAdded(day3, id2) {
  return day3.items.some((item) => item.date === day3.date && item.template_id === id2 && !item.deleted_at);
}

// local-ui/frontend/web/pages/unscheduled-todos.mjs
init_runtime();

// local-ui/frontend/web/ui/toast.mjs
function toast(message, error = false) {
  const node2 = document.createElement("div");
  node2.className = `toast${error ? " error" : ""}`;
  node2.setAttribute("role", error ? "alert" : "status");
  node2.textContent = message;
  $("#toasts").append(node2);
  while ($("#toasts").children.length > 3) $("#toasts").firstElementChild.remove();
  setTimeout(() => node2.remove(), error ? 8e3 : 4500);
}

// local-ui/frontend/web/pages/unscheduled-todos.mjs
init_runtime();
var cache = { owner: "", items: [], draft: "", loaded: false, loading: false, error: "", notice: "", pending: false, request: null, dates: {}, uncertain: {} };
var owner = () => JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null, getOfflineRuntime()?.state.scope ?? null]);
function current() {
  const key2 = owner();
  if (cache.owner !== key2) {
    Object.assign(cache, { owner: key2, items: [], loaded: false, loading: false, error: "", notice: "", pending: false, request: null, dates: {}, uncertain: {} });
    bindLocalComposer(cache, "draft", "future");
  }
  return cache;
}
var visible = () => Boolean(state.me) && state.page === "todos" && state.todoPanel === "future";
function renderUnscheduledTodos() {
  const v = current();
  return `<section id="todo-future" aria-label="\u672A\u6765\u5F85\u529E" ${visible() ? "" : "hidden"}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">\u672A\u6765\u5F85\u529E</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="\u8FD8\u6CA1\u786E\u5B9A\u65E5\u671F\u7684\u4E8B" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending ? "disabled" : ""}>\u6DFB\u52A0</button></form>
<p class="todo-future-help">\u52FE\u9009\u5B8C\u6210\u540E\u79FB\u81F3\u4ECA\u65E5\u5F85\u529E\uFF1B\u4E5F\u53EF\u9009\u62E9\u65E5\u671F\u79FB\u52A8\u3002</p>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
function paintUnscheduledTodos() {
  const v = current(), root2 = $("#todo-future");
  if (!root2) return;
  root2.hidden = !visible();
  const input = $("#todo-future-text", root2), button2 = $("#todo-future-form button", root2), status = $("#todo-future-status", root2), error = $("#todo-future-error", root2), list2 = $("#todo-future-items", root2);
  if (input && document.activeElement !== input && input.value !== v.draft) input.value = localEditorPaintValue(input, v.draft);
  if (button2) button2.disabled = v.pending;
  if (status) status.textContent = v.notice || (v.loading && !v.loaded ? "" : v.loaded && v.items.length === 0 ? "\u8FD8\u6CA1\u6709\u672A\u6765\u5F85\u529E\u3002" : "");
  if (error) error.textContent = v.error;
  if (list2) list2.innerHTML = v.items.filter((x) => !x.deleted_at && !x.deleted).map((x) => `<li class="daily-todo-row${x.completed ? " is-complete" : ""}">
<label><input type="checkbox" data-future-todo-id="${e(x.id)}" ${x.completed ? "checked" : ""} ${v.pending || v.uncertain[x.id] ? "disabled" : ""}>
<span class="daily-todo-text">${e(x.text)}</span></label><div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${e(x.id)}" value="${e(v.dates[x.id] || "")}" aria-label="\u4E3A ${e(x.text)} \u9009\u62E9\u65E5\u671F" ${v.pending || v.uncertain[x.id] ? "disabled" : ""}><button class="btn small" type="button" data-action="todo-future-schedule" data-id="${e(x.id)}" ${v.pending ? "disabled" : ""}>${v.uncertain[x.id] ? "\u6838\u5B9E\u79FB\u52A8\u7ED3\u679C" : "\u79FB\u81F3\u8BE5\u65E5\u671F"}</button></div><button class="icon-button" type="button"
 data-action="todo-future-delete" data-id="${e(x.id)}" aria-label="\u5220\u9664 ${e(x.text)}" ${v.pending || v.uncertain[x.id] ? "disabled" : ""}>\xD7</button></li>`).join("");
}
async function loadUnscheduledTodos() {
  if (!visible()) return;
  const v = current(), key2 = v.owner;
  if (v.loading) return;
  v.loading = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const data2 = await api("/unscheduled-todos");
    if (v.owner !== key2 || owner() !== key2 || !Array.isArray(data2.items)) return;
    const ids = new Set(data2.items.map((item) => item.id));
    v.items = [...data2.items, ...Object.values(v.uncertain).map((item) => item.row).filter((item) => !ids.has(item.id))];
    v.loaded = true;
  } catch (error) {
    if (v.owner === key2 && owner() === key2 && !error.staleSession && error.name !== "AbortError") v.error = error.message;
  } finally {
    if (v.owner === key2 && owner() === key2) {
      v.loading = false;
      paintUnscheduledTodos();
    }
  }
}
function inputUnscheduledTodo(el) {
  if (el.id === "todo-future-text") current().draft = el.value;
  if (el.dataset?.futureDateId) current().dates[el.dataset.futureDateId] = el.value;
}
function moved(row, date, source, todo, complete = false) {
  const completed = complete ? true : row.completed;
  return source?.id === row.id && source.text === row.text && source.version === row.version + 1 && source.completed === completed && typeof source.deleted_at === "string" && todo?.id === row.id && todo.date === date && todo.text === row.text && todo.deleted_at === null && Number.isSafeInteger(todo.version) && todo.version >= 1 && todo.completed === completed && Number.isFinite(Date.parse(todo.created_at)) && Number.isFinite(Date.parse(todo.updated_at));
}
function unchanged(row, source) {
  return source?.id === row.id && source.text === row.text && source.version === row.version && source.completed === row.completed && source.deleted_at === null;
}
async function verifyFutureMove(row, date, { readSource, readDay, guard = () => {
}, complete = false }) {
  try {
    const source = await readSource(row.id);
    guard();
    const day3 = await readDay(date);
    guard();
    const todo = Array.isArray(day3?.items) ? day3.items.find((item) => item.id === row.id) : null;
    if (moved(row, date, source, todo, complete)) return { state: "confirmed", source, todo };
    const compatible = !todo || todo.date === date && todo.text === row.text && (complete || todo.completed === row.completed) && todo.deleted_at === null && !todo.template_id;
    return unchanged(row, source) && day3?.date === date && Array.isArray(day3.items) && compatible ? { state: "retryable" } : { state: "unknown", source };
  } catch {
    return { state: "unknown" };
  }
}
async function planFutureMove(row, date, { checkReady, move, readSource, readDay, guard = () => {
}, priorUncertain = false, complete = false }) {
  if (!validTodoDate(date)) return { state: "not_started", reason: "\u8BF7\u9009\u62E9\u6709\u6548\u65E5\u671F" };
  try {
    await checkReady(row);
    guard();
  } catch (error) {
    if (error.staleSession) return { state: "cancelled" };
    if (priorUncertain) return { state: "unknown" };
    if (error.status === 429 || error.code === "NETWORK_UNAVAILABLE" || error.name === "AbortError")
      return { state: "not_started", reason: error.message || "\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
    try {
      const source = await readSource(row.id);
      guard();
      if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error.message || "\u6682\u65F6\u65E0\u6CD5\u6838\u5BF9\u6570\u636E" };
    } catch {
    }
    return { state: "not_started", reason: error.message || "\u6682\u65F6\u65E0\u6CD5\u6838\u5BF9\u6570\u636E" };
  }
  try {
    const result2 = await move(row.id, { date, version: row.version });
    guard();
    if (moved(row, date, result2?.source, result2?.todo, complete)) return { state: "confirmed", ...result2 };
  } catch (error) {
    if (error.staleSession) return { state: "unknown" };
    if (error.status === 429) return priorUncertain ? { state: "unknown" } : { state: "not_started", reason: error.message || "\u8BF7\u6C42\u8F83\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
    if (!priorUncertain && error.status >= 400 && error.status < 500 && ![408, 425].includes(error.status)) {
      try {
        const source = await readSource(row.id);
        guard();
        if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error.message || "\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
      } catch {
      }
    }
  }
  const result = await verifyFutureMove(row, date, { readSource, readDay, guard, complete });
  return result.state === "retryable" ? { state: "unknown" } : result;
}
function timedNetwork(path, options2 = {}) {
  const controller = new AbortController(), timer2 = setTimeout(() => controller.abort(), 12e3);
  return apiNetwork(path, { ...options2, signal: controller.signal }).finally(() => clearTimeout(timer2));
}
function formatMovedDate(date) {
  const [, month, day3] = date.split("-");
  return `${Number(month)}\u6708${Number(day3)}\u65E5`;
}
async function scheduleUnscheduledTodo(id2, { complete = false } = {}) {
  if (!visible()) return;
  const v = current(), key2 = v.owner, row = v.items.find((item) => item.id === id2 && !item.deleted_at && !item.deleted);
  if (!row || v.pending) return;
  const unresolved2 = v.uncertain[id2], original = unresolved2?.row || structuredClone(row), finishing = unresolved2?.complete ?? complete, date = unresolved2?.date || (finishing ? bjtDate() : v.dates[id2] || "");
  v.pending = true;
  v.error = "";
  v.notice = "";
  paintUnscheduledTodos();
  const offline = getOfflineRuntime(), token = offline?.captureRateLimitContext();
  if (!offline || !token) {
    v.pending = false;
    paintUnscheduledTodos();
    toast("\u672A\u6267\u884C\u79FB\u52A8\uFF1A\u8BF7\u8054\u7F51\u5E76\u786E\u8BA4\u6570\u636E\u540E\u91CD\u8BD5", true);
    return;
  }
  const guard = () => {
    const currentToken = offline?.captureRateLimitContext();
    if (v.owner !== key2 || owner() !== key2 || !token || !currentToken || currentToken.scope !== token.scope || currentToken.generation !== token.generation)
      throw Object.assign(new Error("\u8D26\u53F7\u6216\u6570\u636E\u8303\u56F4\u5DF2\u53D8\u5316"), { staleSession: true });
  };
  const readSource = (sourceId) => timedNetwork("/unscheduled-todos/" + encodeURIComponent(sourceId));
  const readDay = (day3) => timedNetwork("/todos?date=" + encodeURIComponent(day3));
  const services = {
    guard,
    readSource,
    readDay,
    complete: finishing,
    move: (sourceId, body) => timedNetwork("/unscheduled-todos/" + encodeURIComponent(sourceId) + (finishing ? "/complete-today" : "/move"), { method: "POST", body }),
    async checkReady(item) {
      guard();
      const index = await timedNetwork("/workbench-snapshot/index?version=2");
      guard();
      if (index?.complete !== true || index.projection !== "current" || index.scope_id !== token.scope) throw new Error("\u65E0\u6CD5\u6838\u5BF9\u5F53\u524D\u6570\u636E\u8303\u56F4");
      const queue = await offline.queue();
      guard();
      const ids = ["unscheduled_todo:" + item.id, "todo:" + item.id];
      const pending = (value) => value.operations.some((op) => ids.includes(op.entity_id)) || value.conflicts.some((conflict) => ids.includes(conflict.entity_id || conflict.operation?.entity_id));
      if (pending(queue)) throw new Error("\u8BE5\u5F85\u529E\u6709\u672A\u540C\u6B65\u5185\u5BB9\uFF0C\u8BF7\u540C\u6B65\u540E\u91CD\u8BD5");
      const source = await readSource(item.id);
      guard();
      if (!unchanged(item, source)) throw new Error("\u5F85\u529E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
      const latest = await offline.queue();
      guard();
      if (pending(latest)) throw new Error("\u8BE5\u5F85\u529E\u6709\u672A\u540C\u6B65\u5185\u5BB9\uFF0C\u8BF7\u540C\u6B65\u540E\u91CD\u8BD5");
    }
  };
  try {
    let result;
    if (unresolved2) {
      result = await verifyFutureMove(original, date, services);
      if (result.state === "retryable") result = await planFutureMove(original, date, { ...services, priorUncertain: true });
    } else result = await planFutureMove(original, date, services);
    if (v.owner !== key2 || owner() !== key2) return;
    try {
      guard();
    } catch {
      return;
    }
    if (result.state === "confirmed") {
      delete v.uncertain[id2];
      v.items = v.items.filter((item) => item.id !== id2);
      let cacheStatus = "refresh";
      try {
        cacheStatus = await offline.acceptMovedTodo({ source: result.source, todo: result.todo }, token);
      } catch {
      }
      if (v.owner !== key2 || owner() !== key2) return;
      try {
        guard();
      } catch {
        return;
      }
      if (cacheStatus === "saved" && todosState.owner === todoOwner()) {
        const day3 = todosState.days.get(date);
        if (day3) {
          mergeTodo(day3, result.todo);
          day3.revision++;
        }
      }
      const note = cacheStatus === "pending" ? "\uFF1B\u672C\u5730\u4ECD\u6709\u5F85\u5904\u7406\u5185\u5BB9\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u5904\u7406" : cacheStatus === "saved" ? "" : "\uFF1B\u672C\u5730\u7F13\u5B58\u5F85\u5237\u65B0";
      toast(`\u5DF2\u79FB\u81F3 ${formatMovedDate(date)}${note}`);
    } else if (result.state === "failed") {
      toast(`\u79FB\u52A8\u5931\u8D25\uFF0C\u539F\u9879\u5DF2\u4FDD\u7559\uFF1A${result.reason}`, true);
    } else if (result.state === "not_started") {
      toast(`\u672A\u6267\u884C\u79FB\u52A8\uFF1A${result.reason}`, true);
    } else if (result.state === "cancelled") {
      return;
    } else {
      v.uncertain[id2] = { row: original, date, complete: finishing };
      v.notice = "\u79FB\u52A8\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u8054\u7F51\u540E\u70B9\u51FB\u201C\u6838\u5B9E\u79FB\u52A8\u7ED3\u679C\u201D\u3002";
      toast(v.notice, true);
    }
  } finally {
    if (v.owner === key2 && owner() === key2) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function submitUnscheduledTodo({ data: data2 }) {
  if (!visible()) return;
  const v = current(), key2 = v.owner, text = String(data2.text || "").trim();
  if (v.pending) return;
  if (!text || text.length > 500) {
    v.error = "\u8BF7\u586B\u5199 1\u2013500 \u5B57\u7684\u5185\u5BB9\u3002";
    paintUnscheduledTodos();
    return;
  }
  if (!v.request || v.request.text !== text) v.request = { id: crypto.randomUUID(), text };
  const submitted = v.request, localDraftSnapshot = localComposerRequestSnapshot(v.request, "future");
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const row = await api("/unscheduled-todos", { method: "POST", body: submitted, localDraftSnapshot });
    if (v.owner !== key2 || owner() !== key2) return;
    v.items = [...v.items.filter((x) => x.id !== row.id), row];
    if (localComposerUnchanged(localDraftSnapshot) && v.draft.trim() === text) v.draft = "";
    v.request = null;
    const input = $("#todo-future-text");
    if (input && localComposerUnchanged(localDraftSnapshot) && input.value.trim() === text) input.value = "";
  } catch (error) {
    if (v.owner === key2 && owner() === key2 && !error.staleSession) v.error = error.message;
  } finally {
    if (v.owner === key2 && owner() === key2) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function change(id2, method, body) {
  if (!visible()) return;
  const v = current(), key2 = v.owner, row = v.items.find((x) => x.id === id2);
  if (!row || v.pending) return;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const updated = await api("/unscheduled-todos/" + encodeURIComponent(id2), { method, body: { ...body, version: row.version } });
    if (v.owner === key2 && owner() === key2) v.items = v.items.map((x) => x.id === id2 ? updated : x);
  } catch (error) {
    if (v.owner === key2 && owner() === key2 && !error.staleSession) v.error = error.message;
  } finally {
    if (v.owner === key2 && owner() === key2) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
function toggleUnscheduledTodo(el) {
  return el.checked ? scheduleUnscheduledTodo(el.dataset.futureTodoId, { complete: true }) : change(el.dataset.futureTodoId, "PATCH", { completed: false });
}
function deleteUnscheduledTodo(id2) {
  return change(id2, "DELETE", {});
}

// local-ui/frontend/web/core/article-ledger.mjs
init_constants();

// local-ui/frontend/web/ui/components.mjs
init_constants();
init_state();
var platformLogo = (p) => `<span class="platform-logo platform-${e(["toutiao", "zhihu", "wechat"].includes(p) ? p : "other")}">${e({
  toutiao: "\u5934",
  zhihu: "\u77E5",
  wechat: "\u5FAE"
}[p] || "\u6587")}</span>`;
function detailInfo(reason, label3, id2) {
  return `<button class="icon-button inline-info" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="detail-info-${e(id2)}">${icon("info", 14)}</button>`;
}
function empty(title, description = "", action = "") {
  return `<div class="empty"><span class="empty-icon">${icon("articles", 22)}</span><h3>${e(title)}</h3>${description ? `<p>${e(
    description
  )}</p>` : ""}${action}</div>`;
}
function accountOptions(selected = "", all = true, activeOnly = false) {
  return `${all ? '<option value="">\u5168\u90E8\u8D26\u53F7</option>' : ""}${state.accounts.filter((a) => !activeOnly || a.active || a.id === selected).map((a) => `<option value="${e(a.id)}" ${a.id === selected ? "selected" : ""}>${e(accountLabel(a))}${a.active ? "" : "\uFF08\u5DF2\u505C\u7528\uFF09"}</option>`).join("")}`;
}
function accountFilter() {
  return `<label class="account-select"><span class="sr-only">\u5207\u6362\u8FD0\u8425\u8D26\u53F7</span><select id="global-account" aria-label="\u5207\u6362\u8FD0\u8425\u8D26\u53F7">${accountOptions(
    state.account
  )}</select></label>`;
}
function skeleton() {
  return '<div class="skeleton" role="status" aria-label="\u6B63\u5728\u8BFB\u53D6\u6570\u636E"><span></span><span></span><span></span><span class="sr-only">\u6B63\u5728\u8BFB\u53D6\u6570\u636E\u2026</span></div>';
}
function comparisonHTML(comparison) {
  if (!comparison?.comparable) return `<span class="comparison muted" title="${e(comparison?.reason || "\u7F3A\u5C11\u5B8C\u6574\u7684\u53EF\u6BD4\u6570\u636E")}">\u6682\u4E0D\u53EF\u6BD4</span>`;
  const delta = Number(comparison.delta), direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const change2 = delta === 0 ? "\u6301\u5E73" : `${delta > 0 ? "+" : ""}${num(delta)}`;
  const percent2 = comparison.percent == null ? "" : `\uFF08${Number(comparison.percent) > 0 ? "+" : ""}${num(comparison.percent)}%\uFF09`;
  return `<span class="comparison ${direction}" title="${e(comparison.reason || "\u4E0E\u524D\u4E00\u7B49\u957F\u5468\u671F\u6BD4\u8F83")}">${change2}${percent2}</span>`;
}
function dashboardInfo(kind, label3, id2 = "") {
  return `<button class="icon-button inline-info" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id2)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id2)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp) return { kind: "unknown", label: "\u6570\u636E\u65B0\u9C9C\u5EA6\u672A\u77E5" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "\u6570\u636E\u65E5\u671F\u5F85\u6838\u5B9E" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `\u6570\u636E\u622A\u81F3 ${time(
    stamp,
    true
  )} \xB7 ${days === 0 ? "\u4ECA\u5929\u66F4\u65B0" : `\u5DF2 ${days} \u5929\u672A\u66F4\u65B0`}` };
}
function dashboardMetric(article, key2) {
  return article.latest_metrics == null ? '<span class="missing-value" title="\u672A\u91C7\u96C6">\u2014<span class="sr-only">\u672A\u91C7\u96C6</span></span>' : article.latest_metrics[key2] == null ? '<span class="missing-value">\u672A\u53D6\u5F97</span>' : `<strong class="number">${e(num(article.latest_metrics[key2]))}</strong>`;
}
function metricSummary(a) {
  return `<dl class="detail-stats">${["reads", "likes", "comments", ...a.latest_metrics?.approvals != null ? ["approvals"] : []].map((key2) => `<div class="stat"><dt>${e(metrics[key2])}${key2 === "likes" ? dashboardInfo("metrics", "\u6307\u6807\u53E3\u5F84", "detail") : ""}</dt><dd>${dashboardMetric(
    a,
    key2
  )}</dd></div>`).join("")}</dl>`;
}
function articleSelect(name, label3, choices, value) {
  return `<label class="form-field">${e(label3)}<select name="${e(name)}" class="input" aria-label="${e(label3)}"><option value="">\u5168\u90E8</option>${Object.entries(choices).map(([key2, text]) => `<option value="${e(key2)}" ${value === key2 ? "selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
}
function field(name, label3, type = "text", value = "", options2 = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label3}</label><input id="field-${e(name)}" class="input" name="${e(name)}" type="${type}" value="${e(value)}" ${options2}></div>`;
}
function formEnd(label3 = "\u4FDD\u5B58") {
  return `<p class="form-message" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">\u53D6\u6D88</button><button class="btn primary" type="submit">${e(label3)}</button></div>`;
}
function renderSnapshot(row) {
  const m = metricData(row);
  return `<article class="snapshot"><div class="snapshot-head"><span class="badge ${row.kind === "latest" ? "up" : "neutral"}">${e(kindLabels[row.kind] || row.kind || "\u6BCF\u65E5\u6570\u636E")}</span><span class="snapshot-time">${e(row.date || displayTime(row.as_of))}</span></div><div class="snapshot-metrics">${Object.entries(metrics).filter(([key2]) => m[key2] != null).map(([key2, label3]) => `<span>${e(label3)} <strong>${e(
    num(m[key2])
  )}</strong></span>`).join("") || "\u672A\u8BB0\u5F55\u6307\u6807"}</div><p class="cell-sub">\u6765\u6E90 ${e(row.source || "\u672A\u8BB0\u5F55")}${row.collected_at ? " \xB7 \u91C7\u96C6 " + e(displayTime(row.collected_at)) : ""}</p>${row.note ? `<p class="cell-sub">${e(row.note)}</p>` : ""}</article>`;
}

// local-ui/frontend/web/core/article-ledger.mjs
var warningLabels = {
  TOUTIAO_TITLE_TOO_LONG: "\u5934\u6761\u6807\u9898\u8D85\u8FC7 30 \u5B57",
  CHAR_COUNT_OUT_OF_RANGE: "\u5B57\u6570\u4E0D\u5728 2000\u20132300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "\u5C0F\u6807\u9898\u4E0D\u5728 5\u20137",
  ENTERTAINMENT_IMAGES_TOO_FEW: "\u6587\u5A31\u914D\u56FE\u4E0D\u8DB3 25 \u5F20",
  DRAFT_CREDENTIAL_MISSING: "\u7F3A\u5C11\u8349\u7A3F\u51ED\u8BC1"
};
var isPublished = (row) => !Object.hasOwn(row, "status") || row.status === "published";
function hasRecordedUnknownMetrics(row) {
  return !isPublished(row) && !Object.hasOwn(statusLabels, row.status) && (row.latest_metrics != null || Array.isArray(row.observations) && row.observations.length > 0 || Array.isArray(row.timeline) && row.timeline.length > 0);
}
function safeLedgerURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

// local-ui/frontend/web/pages/article-reconciliation.mjs
init_client();
init_constants();
var reconciliationData = null;
var fieldLabels = { run_date: "\u65E5\u671F", status: "\u72B6\u6001", slot: "\u69FD\u4F4D", writer: "\u5199\u4F5C\u8005", series_no: "\u7F16\u53F7" };
var label = (choices, value) => choices[value] || "\u672A\u77E5";
function articleRows(rows) {
  return rows.map((row) => `<tr><td><button class="btn text" data-action="article-detail" data-id="${e(row.id)}">${e(row.title)}</button></td>
<td>${e(row.run_date ?? "\u672A\u6807\u6CE8")}</td><td>${e(label(slotLabels, row.slot))}</td><td>${e(label(statusLabels, row.status))}</td>
<td>${e(label(writerLabels, row.writer))}</td><td>${e(row.series_no ?? "\u672A\u77E5")}</td>
<td>${e(row.missing_fields.map((key2) => fieldLabels[key2] || key2).join("\u3001") || "\u65E0")}</td>
<td>${e(row.has_pending_verify === true ? "\u5F85\u6838" : row.verify_state === "complete" ? "\u5DF2\u6838" : "\u672A\u77E5")}</td>
<td>${e(row.warnings.length ? row.warnings.map((key2) => warningLabels[key2] || key2).join("\uFF1B") : "\u65E0")}</td><td>${row.sample == null ? "\u672A\u77E5" : `<details><summary>\u539F\u59CB\u6837\u672C\u8BB0\u5F55</summary><pre>${e(JSON.stringify(row.sample, null, 2))}</pre></details>`}</td></tr>`).join("");
}
function table(data2, filters = {}) {
  const rows = data2.rows.filter((row) => ["run_date", "slot", "writer", "status"].every((key2) => !filters[key2] || (row[key2] ?? "unknown") === filters[key2]));
  return `<p role="status">\u7B5B\u9009\u7ED3\u679C ${e(rows.length)} \u6761</p>${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>\u6587\u7AE0</th><th>\u5B58\u7A3F\u65E5\u671F</th><th>\u69FD\u4F4D</th><th>\u72B6\u6001</th>
<th>\u5199\u4F5C\u8005</th><th>\u7F16\u53F7</th><th>\u7F3A\u5B57\u6BB5</th><th>\u5F85\u6838</th><th>\u8B66\u544A</th><th>\u6837\u672C</th></tr></thead><tbody>${articleRows(rows)}</tbody></table></div>` : '<p class="muted">\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5B9E\u9645\u6587\u7AE0\u8BB0\u5F55\u3002</p>'}`;
}
function changeReconciliationFilters(element) {
  const form = element.closest("#reconciliation-filters");
  if (!form || !reconciliationData) return false;
  document.querySelector("#reconciliation-results").innerHTML = table(reconciliationData, Object.fromEntries(new FormData(form)));
  return true;
}

// local-ui/frontend/web/core/requests.mjs
init_state();
var pageContext = null;
var modalContext = null;
var backgroundContext = null;
var backgroundKey = "";
var contextId = 0;
function isRequestAbort(error) {
  return error?.name === "AbortError";
}
function requestContext(kind) {
  return { id: ++contextId, kind, controller: new AbortController(), pending: /* @__PURE__ */ new Map() };
}
function cancelPageRequests() {
  pageContext?.controller.abort();
  pageContext = null;
}
function beginPageRequests() {
  cancelPageRequests();
  pageContext = requestContext("page");
  return pageContext;
}
function cancelModalRequests() {
  modalContext?.controller.abort();
  modalContext = null;
}
function beginModalRequests() {
  cancelModalRequests();
  modalContext = requestContext("modal");
  return modalContext;
}
function backgroundRequests() {
  const key2 = [runtime.renderVersion, runtime.sessionEpoch, runtime.articleIndexGeneration].join(":");
  if (!backgroundContext || key2 !== backgroundKey) {
    backgroundKey = key2;
    backgroundContext = requestContext("background");
  }
  return backgroundContext;
}

// local-ui/frontend/web/openai-settings-controller.mjs
init_client();
init_state();

// local-ui/frontend/web/core/openai-review-state.mjs
var OPENAI_TABS = Object.freeze(["reminders", "reports"]);
var openAiSessionAvailable = (me) => Boolean(me?.id);
var openAiRunActive = (run2) => ["running"].includes(run2?.status);
var openAiRunFinished = (run2) => ["succeeded", "failed"].includes(run2?.status) || Boolean(run2?.released_at);
function openAiPendingRunSettled(previous, next2) {
  const run2 = next2.run;
  return Boolean(previous.pendingId && run2?.id === previous.pendingId && ["succeeded", "failed", "cancelled", "uncertain"].includes(run2.status) && (previous.run?.id !== run2.id || previous.run?.status !== run2.status));
}
function openAiRunDay(run2) {
  const date = new Date(run2?.created_at);
  if (!Number.isFinite(date.getTime())) return "";
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts2.year}-${parts2.month}-${parts2.day}`;
}
function openAiDiaryLink(run2) {
  const query = new URLSearchParams({ page: "ai-diagnosis", diagnosis_tab: "reports", date: openAiRunDay(run2) });
  if (run2?.id) query.set("openai_run", run2.id);
  return "?" + query;
}
function openAiRunsForDate(items, date) {
  return items.filter((run2) => openAiRunDay(run2) === date).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
}
async function readOpenAiRuns(read3, date = "", current3 = () => true) {
  const items = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; ; ) {
    const query = new URLSearchParams({ offset: String(offset) });
    if (date) query.set("date", date);
    const page2 = await read3("/openai-review/runs?" + query);
    if (!current3()) return null;
    if (!Array.isArray(page2?.items) || typeof page2.has_more !== "boolean" || page2.has_more && !page2.items.length)
      throw new Error("\u5206\u6790\u8BB0\u5F55\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
    for (const row of page2.items) {
      if (!row.id || seen.has(row.id)) throw new Error("\u5206\u6790\u8BB0\u5F55\u5728\u8BFB\u53D6\u65F6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
      seen.add(row.id);
      items.push(row);
    }
    if (!page2.has_more) return date ? openAiRunsForDate(items, date) : items;
    offset += page2.items.length;
  }
}
function openAiDraft(saved, retained2 = null) {
  const text = typeof retained2?.text === "string" ? retained2.text : saved.instructions;
  const dirty = text !== saved.instructions;
  return {
    saved,
    text,
    dirty,
    baseVersion: retained2?.version ?? saved.version,
    conflict: dirty && retained2?.version !== saved.version,
    saving: false,
    error: "",
    message: ""
  };
}
function editOpenAiDraft(draft, text) {
  return { ...draft, text, dirty: text !== draft.saved.instructions, message: "" };
}
async function saveOpenAiDraft(draft, request) {
  if (draft.saving || draft.conflict || !draft.dirty) return draft;
  const result = { ...draft, saving: false, message: "", error: "" };
  try {
    const saved = await request("/openai-review/config", {
      method: "PATCH",
      body: { instructions: draft.text, version: draft.saved.version }
    });
    return { ...openAiDraft(saved), message: "\u5DF2\u4FDD\u5B58\u3002\u4E0B\u6B21\u5206\u6790\u4F7F\u7528\u8FD9\u4EFD\u6307\u4EE4\u3002" };
  } catch (error) {
    return { ...result, conflict: error.status === 409, error: error.status === 409 ? "\u6307\u4EE4\u5DF2\u5728\u522B\u5904\u66F4\u65B0\u3002\u4F60\u7684\u4FEE\u6539\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u8BFB\u53D6\u6700\u65B0\u7248\u672C\u5E76\u6BD4\u8F83\u540E\u518D\u4FDD\u5B58\u3002" : error.message || "\u4FDD\u5B58\u5931\u8D25\uFF0C\u4FEE\u6539\u5DF2\u4FDD\u7559\u3002" };
  }
}

// local-ui/frontend/web/core/safe-markdown.mjs
function safeLink(value) {
  try {
    if (/[\u0000-\u0020\u007f]/.test(value)) return "";
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
function inlineToken(part) {
  const link = part.match(/^\[([^\[\]\n]+)\]\(([^()\n]+)\)$/);
  if (link) {
    const href = safeLink(link[2]);
    return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(part);
  }
  if (part.startsWith("**") || part.startsWith("__")) return `<strong>${e(part.slice(2, -2))}</strong>`;
  if (part.startsWith("`")) return `<code>${e(part.slice(1, -1))}</code>`;
  return `<em>${e(part.slice(1, -1))}</em>`;
}
function inline(value) {
  const text = String(value);
  const tokens = /\[[^\[\]\n]+\]\([^()\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`/g;
  let output = "", offset = 0;
  for (const match of text.matchAll(tokens)) {
    output += e(text.slice(offset, match.index)) + inlineToken(match[0]);
    offset = match.index + match[0].length;
  }
  return output + e(text.slice(offset));
}
function renderSafeMarkdown(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  let out = "", list2 = "", paragraph = [], code = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      out += "<p>" + paragraph.map(inline).join("<br>") + "</p>";
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list2) {
      out += `</${list2}>`;
      list2 = "";
    }
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      closeList();
      out += code ? "</code></pre>" : "<pre><code>";
      code = !code;
      continue;
    }
    if (code) {
      out += e(line) + "\n";
      continue;
    }
    const item = line.match(/^\s*(?:(- |\* |\+ )|([0-9]{1,8})[.)] )(.*)$/);
    if (item) {
      flushParagraph();
      const type = item[2] ? "ol" : "ul";
      if (list2 !== type) {
        closeList();
        list2 = type;
        out += type === "ol" ? `<ol start="${Number(item[2])}">` : "<ul>";
      }
      out += `<li>${inline(item[3])}</li>`;
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 2, 6);
      out += `<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  if (code) out += "</code></pre>";
  return out;
}

// local-ui/frontend/web/core/openai-review-progress.mjs
function openAiStartTime(storage2, key2, id2) {
  try {
    const saved = JSON.parse(storage2.getItem(key2 + ":started"));
    return id2 && saved?.id === id2 && Number.isFinite(saved.at) && saved.at > 0 ? saved.at : 0;
  } catch {
    return 0;
  }
}
function openAiElapsed(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1e3));
  return seconds < 60 ? `${seconds}\u79D2` : `${Math.floor(seconds / 60)}\u5206${seconds % 60}\u79D2`;
}
function openAiCompletedElapsed(run2) {
  if (!["succeeded", "failed", "cancelled"].includes(run2?.status)) return "";
  const duration3 = Number.isFinite(run2.elapsed_ms) ? run2.elapsed_ms : Date.parse(run2.completed_at) - Date.parse(run2.created_at);
  return Number.isFinite(duration3) && duration3 >= 0 ? openAiElapsed(0, duration3) : "";
}
function openAiReviewFeedback(vm4) {
  const run2 = !vm4.pendingId || vm4.run?.id === vm4.pendingId ? vm4.run : null;
  const error = run2?.error_message || "";
  if (run2?.status === "uncertain") return {
    title: "\u7ED3\u679C\u5F85\u786E\u8BA4",
    detail: error || "API \u6267\u884C\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002",
    note: "\u65E0\u6CD5\u786E\u5B9A\u662F\u5426\u5DF2\u7ECF\u8BA1\u8D39\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\uFF1B\u8BF7\u53EA\u8BFB\u6838\u67E5\u72B6\u6001\u3002"
  };
  if (vm4.pendingId && vm4.error) return {
    title: "\u5F53\u524D\u8BF7\u6C42\u7ED3\u679C\u5F85\u786E\u8BA4",
    detail: vm4.error,
    note: "\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u5206\u6790\u3002\u53EF\u4EE5\u53EA\u8BFB\u6838\u67E5\u72B6\u6001\u3002"
  };
  if (run2?.status === "running" || vm4.operation === "start" && vm4.pendingId) return {
    title: run2?.stage === "awaiting_provider" || run2?.provider_calls > 0 ? "\u5DF2\u767B\u8BB0\u8C03\u7528\uFF0C\u7B49\u5F85\u7ED3\u679C" : run2?.stage === "preparing" ? "\u6B63\u5728\u51C6\u5907\u8BCA\u65AD\u8D44\u6599\u2026" : "\u8BF7\u6C42\u5DF2\u53D1\u51FA\uFF0C\u7B49\u5F85\u670D\u52A1\u5668\u786E\u8BA4\u2026",
    waiting: true,
    detail: "\u4EC5\u663E\u793A\u5DF2\u786E\u8BA4\u7684\u8BF7\u6C42\u72B6\u6001\uFF0C\u4E0D\u4EE3\u8868\u6A21\u578B\u601D\u8003\u8FDB\u5EA6\u3002\u65E0\u9700\u518D\u6B21\u70B9\u51FB\uFF1B\u79BB\u5F00\u540E\u53EF\u56DE\u6765\u6838\u67E5\u3002"
  };
  if (vm4.pendingId) return {
    title: vm4.operation === "check" ? "\u6B63\u5728\u53EA\u8BFB\u6838\u67E5\u72B6\u6001\u2026" : "\u5F53\u524D\u8BF7\u6C42\u7ED3\u679C\u5F85\u786E\u8BA4",
    detail: "\u8BF7\u6C42\u7F16\u53F7\u5DF2\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u5206\u6790\u3002\u8BF7\u6838\u67E5\u72B6\u6001\u3002"
  };
  if (run2?.status === "failed") return { title: "\u672C\u6B21\u5206\u6790\u672A\u5B8C\u6210", detail: error || "\u672A\u751F\u6210\u5B8C\u6574\u62A5\u544A\u3002\u5386\u53F2\u8BB0\u5F55\u4ECD\u4FDD\u7559\u3002" };
  if (vm4.error) return { title: "\u64CD\u4F5C\u672A\u5B8C\u6210", detail: vm4.error };
  if (run2?.status === "succeeded") return { title: "\u5206\u6790\u5B8C\u6210", detail: "\u62A5\u544A\u5DF2\u4FDD\u5B58\uFF0C\u53EF\u5728\u8BCA\u65AD\u62A5\u544A\u67E5\u770B\u3002" };
  return null;
}
function createOpenAiElapsedClock(target, { now = Date.now, every = setInterval, cancel = clearInterval } = {}) {
  let timer2 = null;
  const stop = () => {
    if (timer2 !== null) cancel(timer2);
    timer2 = null;
  };
  const tick = () => {
    const value = target();
    if (!value?.node || !Number.isFinite(value.startedAt) || value.startedAt <= 0) {
      stop();
      return false;
    }
    value.node.textContent = openAiElapsed(value.startedAt, now());
    return true;
  };
  return { stop, refresh() {
    stop();
    if (tick()) timer2 = every(tick, 1e3);
  } };
}

// local-ui/frontend/web/pages/openai-review.mjs
var openAiLogin = '<p class="hint">\u8BF7\u5148<a href="?page=login">\u767B\u5F55</a>\uFF0C\u518D\u67E5\u770B\u6216\u4F7F\u7528 OpenAI API\u3002</p>';
var timestamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date) + "\uFF08\u5317\u4EAC\u65F6\u95F4\uFF09" : "\u65F6\u95F4\u672A\u77E5";
};
function openAiRunLabel(run2) {
  if (run2?.status === "succeeded") return "\u5206\u6790\u5B8C\u6210";
  if (run2?.status === "failed") return "\u672C\u6B21\u5206\u6790\u672A\u5B8C\u6210";
  if (run2?.status === "cancelled") return "\u672C\u6B21\u5206\u6790\u5DF2\u53D6\u6D88";
  return openAiRunActive(run2) ? "\u6B63\u5728\u5206\u6790\u2026" : "\u7ED3\u679C\u5F85\u786E\u8BA4";
}
function openAiRunModeLabel(run2) {
  if (run2.mode === "full") {
    if (run2.baseline_run_id === null) return "\u9996\u6B21\u5168\u91CF\u5206\u6790";
    return run2.baseline_run_id ? "\u5168\u91CF\u91CD\u67E5" : "\u5168\u91CF\u5206\u6790";
  }
  return run2.mode === "incremental" ? "\u7D2F\u8BA1\u590D\u76D8" : "\u6587\u7AE0\u590D\u76D8";
}
function renderOpenAiRun(run2) {
  const elapsed = openAiCompletedElapsed(run2);
  return `<article class="card panel openai-run" id="openai-run-${e(run2.id)}" tabindex="-1">
    <div class="openai-run-heading"><h3>${e(openAiRunLabel(run2))}</h3>
    <time datetime="${e(run2.created_at)}">${e(timestamp(run2.created_at))}</time></div>
    <p class="hint">${e(openAiRunModeLabel(run2))}
    ${run2.model ? " \xB7 " + e(run2.model) : ""}${run2.instruction_version ? " \xB7 \u6307\u4EE4\u7248\u672C " + e(run2.instruction_version) : ""}${elapsed ? " \xB7 \u7528\u65F6 " + e(elapsed) : ""}</p>
    ${run2.report_markdown ? `<div class="ai-report-markdown">${renderSafeMarkdown(run2.report_markdown)}</div>` : ""}
    ${run2.status === "failed" ? `<p role="alert">${e(run2.error_message || "\u672A\u751F\u6210\u5B8C\u6574\u62A5\u544A\u3002\u5386\u53F2\u8BB0\u5F55\u4ECD\u4FDD\u7559\u3002")}</p>` : ""}
    ${run2.status === "uncertain" ? `<p role="status">${e(run2.error_message || "API \u6267\u884C\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u53EF\u80FD\u5DF2\u7ECF\u8BA1\u8D39\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002")}</p>
      <p><a href="?page=ai-diagnosis&amp;diagnosis_tab=help">\u524D\u5F80\u6C42\u52A9API\u6838\u67E5\u72B6\u6001</a></p>` : ""}
    ${openAiRunActive(run2) ? '<p role="status">\u5206\u6790\u8FDB\u884C\u4E2D\u3002\u53EF\u5728\u6C42\u52A9API\u6838\u67E5\u72B6\u6001\uFF0C\u65E0\u9700\u518D\u6B21\u53D1\u8D77\u3002</p>' : ""}</article>`;
}
function renderOpenAiReviewPanel(vm4 = {}) {
  const header = '<div class="openai-review-heading"><h2>\u6C42\u52A9API</h2></div>';
  if (!vm4.owner) return header + openAiLogin;
  const busy = vm4.loading || vm4.busy, disabled = busy || !vm4.config?.configured || Boolean(vm4.pendingId);
  const status = vm4.loading ? "\u6B63\u5728\u8BFB\u53D6\u5206\u6790\u914D\u7F6E\u2026" : !vm4.config ? "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u914D\u7F6E\u3002" : vm4.config.configured ? vm4.pendingId || vm4.busy ? "\u672C\u6B21\u8BF7\u6C42\u5904\u7406\u4E2D\u6216\u7B49\u5F85\u6838\u67E5" : "\u53EF\u53D1\u8D77\u5206\u6790" : "\u5C1A\u672A\u914D\u7F6E OpenAI API\uFF0C\u6682\u4E0D\u80FD\u53D1\u8D77\u5206\u6790\u3002";
  const selectedModel = vm4.pendingId && vm4.run?.id === vm4.pendingId && vm4.run.model || vm4.selectedModel || vm4.config?.default_model || vm4.config?.model;
  return header + `<p class="hint">${e(status)}</p>
    <label for="openai-model">\u6A21\u578B</label>
    <select class="input" id="openai-model" ${disabled ? "disabled" : ""}>
      ${(vm4.config?.supported_models || []).map((model) => `<option value="${e(model.id)}"
        ${model.id === selectedModel ? "selected" : ""}>${e(model.label)}</option>`).join("")}
    </select><p class="hint">\u6A21\u578B\u80FD\u5426\u8C03\u7528\u4EE5\u8D26\u6237\u6743\u9650\u4E3A\u51C6\u3002</p>
    <div class="openai-review-actions"><button class="btn primary" type="button" data-openai-action="start"
    ${disabled ? "disabled" : ""} aria-busy="${Boolean(vm4.busy)}">\u6C42\u52A9API</button>
    ${vm4.pendingId ? `<button class="btn" type="button" data-openai-action="check" ${busy ? "disabled" : ""}>\u6838\u67E5\u72B6\u6001</button>` : ""}
    ${vm4.pendingId && (vm4.notFound || vm4.run?.status === "uncertain") ? `<button class="btn" type="button" data-openai-action="release" ${busy ? "disabled" : ""}>\u7ED3\u675F\u672C\u6B21\u72B6\u6001\u6838\u67E5</button>` : ""}
    ${!vm4.config && !vm4.loading ? '<button class="btn" type="button" data-openai-action="reload">\u91CD\u65B0\u8BFB\u53D6</button>' : ""}</div>
    ${renderOpenAiReviewStatus(vm4)}
    ${vm4.run ? `<p>\u6700\u8FD1\u8BB0\u5F55\uFF1A${e(openAiRunLabel(vm4.run))} \xB7 ${e(timestamp(vm4.run.created_at))}
      <a href="${e(openAiDiaryLink(vm4.run))}">\u5728\u8BCA\u65AD\u62A5\u544A\u67E5\u770B\u8FD9\u6761\u8BB0\u5F55</a></p>` : ""}`;
}
function renderOpenAiReviewStatus(vm4) {
  const feedback = openAiReviewFeedback(vm4);
  if (!feedback) return "";
  const elapsed = !vm4.pendingId || vm4.run?.id === vm4.pendingId ? openAiCompletedElapsed(vm4.run) : "";
  const startedAt = vm4.startedAt || (vm4.run?.id === vm4.pendingId ? Date.parse(vm4.run.created_at) : 0);
  return `<div class="openai-review-status"><p role="status" aria-live="polite"><strong>${e(feedback.title)}</strong></p>
    ${feedback.waiting ? '<progress aria-label="\u7B49\u5F85\u5206\u6790\u7ED3\u679C\uFF0C\u65E0\u6CD5\u63D0\u4F9B\u51C6\u786E\u8FDB\u5EA6"></progress>' : ""}
    ${feedback.waiting && Number.isFinite(startedAt) && startedAt > 0 ? `<p aria-live="off">\u5DF2\u7B49\u5F85 <span data-openai-elapsed="${startedAt}">${e(openAiElapsed(startedAt))}</span></p>` : ""}
    ${elapsed ? `<p>\u7528\u65F6 ${e(elapsed)}</p>` : ""}
    <p>${e(feedback.detail)}</p>${feedback.note ? `<p>${e(feedback.note)}</p>` : ""}
    ${vm4.error && vm4.error !== feedback.detail ? `<p role="alert">${e(vm4.error)}</p>` : ""}</div>`;
}
function renderOpenAiSettings(vm4 = {}) {
  if (!vm4.owner) return `<section id="openai-settings" class="card panel"><h2>AI\u8BCA\u65AD \xB7 \u5B8C\u6574\u63D0\u793A\u8BCD</h2>${openAiLogin}</section>`;
  const draft = vm4.draft;
  const status = vm4.loading ? "\u6B63\u5728\u8BFB\u53D6\u2026" : !draft ? "\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\u3002" : draft.saved.configured ? "\u53EF\u53D1\u8D77\u5206\u6790" : "\u5C1A\u672A\u914D\u7F6E OpenAI API";
  return `<section id="openai-settings" class="card panel"><h2>AI\u8BCA\u65AD \xB7 \u5B8C\u6574\u63D0\u793A\u8BCD</h2><p class="hint">${e(status)}</p>
    <p class="hint">\u5BC6\u94A5\u7531\u670D\u52A1\u5668\u7BA1\u7406\uFF0C\u6B64\u5904\u4E0D\u663E\u793A\u6216\u5F55\u5165\u5BC6\u94A5\u3002<a href="?page=ai-diagnosis">\u524D\u5F80AI\u8BCA\u65AD</a></p>
    ${draft ? renderInstructions(draft) : ""}<p role="alert">${e(vm4.error || "")}</p>
    ${!draft && !vm4.loading ? '<button class="btn" type="button" data-openai-action="reload-settings">\u91CD\u65B0\u8BFB\u53D6</button>' : ""}</section>`;
}
function renderInstructions(draft) {
  return `<form id="openai-instructions-form"><label for="openai-instructions">\u5B8C\u6574\u5206\u6790\u6307\u4EE4</label>
    <p class="hint" id="openai-instructions-help">\u7248\u672C ${e(draft.saved.version)}\u3002\u70B9\u51FB\u4FDD\u5B58\u540E\u624D\u751F\u6548\uFF0C\u5206\u6790\u4F7F\u7528\u5F53\u65F6\u6700\u65B0\u7684\u5DF2\u4FDD\u5B58\u7248\u672C\u3002</p>
    <textarea class="input openai-instructions" id="openai-instructions" name="instructions" rows="18" required
    aria-describedby="openai-instructions-help openai-instructions-status" ${draft.saving ? "readonly" : ""}>${e(draft.text)}</textarea>
    <p id="openai-instructions-status" role="status">${e(draft.error || draft.message || (draft.dirty ? "\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\u3002" : "\u5DF2\u4FDD\u5B58"))}</p>
    ${draft.conflict ? '<p role="alert">\u7248\u672C\u5DF2\u53D8\u5316\u3002\u8BFB\u53D6\u6700\u65B0\u7248\u672C\u4F1A\u4FDD\u7559\u4F60\u7684\u6587\u5B57\uFF0C\u6BD4\u8F83\u5E76\u786E\u8BA4\u540E\u624D\u80FD\u518D\u6B21\u4FDD\u5B58\u3002</p>' : ""}
    <div class="openai-review-actions"><button class="btn primary" type="submit"
    ${!draft.dirty || draft.conflict || draft.saving ? "disabled" : ""}>${draft.saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u6307\u4EE4"}</button>
    <button class="btn" type="button" data-openai-action="compare" ${draft.saving ? "disabled" : ""}>\u8BFB\u53D6\u6700\u65B0\u7248\u672C</button>
    <button class="btn" type="button" data-openai-action="discard" ${draft.saving ? "disabled" : ""}>\u653E\u5F03\u672C\u673A\u4FEE\u6539</button></div></form>
    ${draft.latest ? `<section class="openai-latest"><h3>\u670D\u52A1\u5668\u6700\u65B0\u6307\u4EE4\uFF08\u7248\u672C ${e(draft.latest.version)}\uFF09</h3>
      <pre>${e(draft.latest.instructions)}</pre><button class="btn" type="button" data-openai-action="rebase">
      \u5DF2\u6BD4\u8F83\uFF0C\u4FDD\u7559\u6211\u7684\u6587\u5B57\u7EE7\u7EED\u7F16\u8F91</button></section>` : ""}`;
}

// local-ui/frontend/web/openai-settings-controller.mjs
var session = "";
var vm = {};
var registered = false;
var sequence = 0;
var identity = () => `${runtime.sessionEpoch}:${state.me?.id || ""}:${Boolean(state.me?.publicBusiness)}`;
var key = () => `haoduoyu.openai.instructions.v1:${state.me?.id}`;
var read = (path, options2 = {}) => apiNetwork(path, { ...options2, suppressAuthRedirect: true });
function retained() {
  try {
    return JSON.parse(localStorage.getItem(key()));
  } catch {
    return null;
  }
}
function retain() {
  if (!vm.draft) return;
  vm.draft.localRetained = false;
  try {
    if (vm.draft.dirty) localStorage.setItem(key(), JSON.stringify({ text: vm.draft.text, version: vm.draft.baseVersion }));
    else localStorage.removeItem(key());
    vm.draft.localRetained = true;
  } catch {
    vm.draft.error = "\u65E0\u6CD5\u4FDD\u5B58\u5728\u672C\u673A\u3002\u79BB\u5F00\u524D\u8BF7\u590D\u5236\u4FEE\u6539\u5185\u5BB9\uFF0C\u6216\u5148\u4FDD\u5B58\u5230\u670D\u52A1\u5668\u3002";
  }
}
function reset() {
  if (session === identity()) return;
  session = identity();
  vm = { owner: openAiSessionAvailable(state.me), loading: false, draft: null, error: "" };
}
function paint() {
  if (session !== identity() || state.page !== "settings" || state.settingsTab !== "openai") return;
  const node2 = document.querySelector("#openai-settings");
  if (node2) node2.outerHTML = renderOpenAiSettings(vm);
}
function openAiSettingsPage() {
  reset();
  return renderOpenAiSettings(vm);
}
async function loadOpenAiSettings() {
  reset();
  register();
  if (!vm.owner || vm.draft?.saving) {
    paint();
    return;
  }
  const ticket = ++sequence, captured = session;
  const fresh = () => ticket === sequence && captured === identity();
  vm.loading = true;
  vm.error = "";
  paint();
  try {
    const saved = await read("/openai-review/config");
    if (!fresh() || vm.draft?.saving) return;
    const existing = vm.draft?.dirty ? { text: vm.draft.text, version: vm.draft.baseVersion } : retained();
    vm.draft = openAiDraft(saved, existing);
  } catch (error) {
    if (fresh()) vm.error = error.message || "\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002";
  } finally {
    if (fresh()) {
      vm.loading = false;
      paint();
    }
  }
}
async function save2() {
  const draft = vm.draft;
  if (!draft || draft.saving || draft.conflict || !draft.dirty) return;
  const captured = session;
  vm.draft = { ...draft, saving: true };
  paint();
  const result = await saveOpenAiDraft(draft, read);
  if (captured !== identity()) return;
  vm.draft = result;
  retain();
  paint();
}
async function compare2() {
  const captured = session, draft = vm.draft;
  if (!draft || draft.saving) return;
  try {
    const latest = await read("/openai-review/config");
    if (captured !== identity() || vm.draft !== draft) return;
    vm.draft = { ...draft, latest, conflict: latest.version !== draft.saved.version, error: "", message: "\u5DF2\u8BFB\u53D6\u6700\u65B0\u7248\u672C\uFF0C\u8BF7\u6BD4\u8F83\u3002" };
  } catch (error) {
    if (captured === identity() && vm.draft === draft) vm.draft.error = error.message;
  }
  paint();
}
function changeAction(action) {
  if (action === "reload-settings") {
    void loadOpenAiSettings();
    return;
  }
  if (!vm.draft || vm.draft.saving) return;
  if (action === "compare") {
    void compare2();
    return;
  }
  if (action === "rebase" && vm.draft.latest) {
    vm.draft = openAiDraft(vm.draft.latest, { text: vm.draft.text, version: vm.draft.latest.version });
    retain();
    paint();
  }
  if (action === "discard" && window.confirm("\u653E\u5F03\u5C1A\u672A\u4FDD\u5B58\u7684\u672C\u673A\u4FEE\u6539\uFF0C\u91CD\u65B0\u8BFB\u53D6\u5DF2\u4FDD\u5B58\u7684\u6307\u4EE4\uFF1F")) {
    vm.draft = null;
    try {
      localStorage.removeItem(key());
    } catch {
    }
    void loadOpenAiSettings();
  }
}
function register() {
  if (registered) return;
  registered = true;
  document.addEventListener("input", (event) => {
    if (event.target.id !== "openai-instructions" || session !== identity() || !vm.draft || vm.draft.saving) return;
    vm.draft = editOpenAiDraft(vm.draft, event.target.value);
    retain();
    const status = document.querySelector("#openai-instructions-status");
    if (status) status.textContent = vm.draft.error || (vm.draft.dirty ? "\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u5DF2\u4FDD\u7559\u5728\u672C\u673A\u3002\u4EC5\u70B9\u51FB\u4FDD\u5B58\u540E\u751F\u6548\u3002" : "\u5DF2\u4FDD\u5B58");
    const submit = document.querySelector('#openai-instructions-form button[type="submit"]');
    if (submit) submit.disabled = !vm.draft.dirty || vm.draft.conflict;
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "openai-instructions-form") return;
    event.preventDefault();
    if (session === identity() && vm.owner) void save2();
  });
  document.addEventListener("click", (event) => {
    const button2 = event.target.closest?.("#openai-settings [data-openai-action]");
    if (button2 && !button2.disabled && session === identity() && vm.owner) changeAction(button2.dataset.openaiAction);
  });
  document.addEventListener("click", (event) => {
    const leaving = event.target.closest?.('a[href],[data-nav],[data-action="settings-tab"],[data-action="logout"]');
    if (!leaving || session !== identity() || !vm.draft?.dirty || vm.draft.localRetained !== false) return;
    if (!window.confirm("\u4FEE\u6539\u672A\u4FDD\u5B58\uFF0C\u800C\u4E14\u65E0\u6CD5\u4FDD\u7559\u5728\u672C\u673A\u3002\u8BF7\u5148\u590D\u5236\u5185\u5BB9\u6216\u4FDD\u5B58\u3002\u4ECD\u8981\u79BB\u5F00\u5417\uFF1F")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener("beforeunload", (event) => {
    if (session === identity() && vm.draft?.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

// local-ui/frontend/web/ai-diagnosis-controller.mjs
init_state();

// local-ui/frontend/web/core/router.mjs
init_constants();
init_state();

// local-ui/frontend/web/core/storage.mjs
var storage = { get(key2) {
  try {
    return localStorage.getItem(key2);
  } catch {
    return null;
  }
}, set(key2, value) {
  try {
    localStorage.setItem(key2, value);
  } catch {
  }
} };

// local-ui/frontend/web/core/daily-notes-state.mjs
var DAILY_NOTES_MAX_BYTES = 65536;
function validDailyNotesDate(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed2 = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === value;
}
function dailyNotesToday() {
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date()).map((part) => [part.type, part.value]));
  return parts2.year + "-" + parts2.month + "-" + parts2.day;
}
var routeDate = "";
var routeCategory = "life";
var dailyNotesRouteCategory = () => routeCategory;
function setDailyNotesRouteCategory(value) {
  routeCategory = value === "work" ? "work" : "life";
}
function dailyNotesRouteDate() {
  return routeDate || dailyNotesToday();
}
function setDailyNotesRouteDate(value) {
  routeDate = validDailyNotesDate(value) ? value : "";
}
function dailyNotesBytes(text) {
  return new TextEncoder().encode(text).length;
}
function checkedPage(value, date) {
  if (!value || value.date !== date || typeof value.text !== "string" || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES) throw new Error("\u788E\u788E\u5FF5\u8BFB\u53D6\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
  return value;
}
function createDailyNotesContext({
  load,
  put,
  remove,
  restore,
  onChange = () => {
  },
  onSaved = () => {
  },
  uuid: uuid2 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 700
}) {
  const context = { pages: /* @__PURE__ */ new Map(), disposed: false, options: { load, put, remove, restore, onSaved, uuid: uuid2 } };
  const pages = context.pages;
  const emit = () => {
    if (!context.disposed) onChange();
  };
  const page2 = (date) => {
    if (!validDailyNotesDate(date)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u65E5\u671F\u3002");
    if (!pages.has(date)) pages.set(date, {
      date,
      loaded: false,
      loading: false,
      canEdit: false,
      serverText: "",
      draft: "",
      version: 0,
      updatedAt: null,
      deleted: false,
      dirty: false,
      phase: "loading",
      error: "",
      remote: null,
      pending: null,
      timer: null,
      sequence: 0,
      writeEpoch: 0
    });
    return pages.get(date);
  };
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  const adopt = (item, value, preserve = false) => {
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? "" : value.text;
    item.version = value.version;
    item.updatedAt = value.updated_at;
    item.deleted = value.deleted;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText;
    item.loaded = true;
  };
  function schedule(item) {
    stopTimer(item);
    if (!context.disposed && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !["conflict", "unknown", "error", "oversize"].includes(item.phase)) {
      item.timer = setTimer(() => {
        item.timer = null;
        void context.save(item.date);
      }, delay);
    }
  }
  const matches = (value, operation) => value.version === operation.version + 1 && (operation.kind === "delete" ? value.deleted === true : operation.kind === "restore" ? value.deleted === false : value.deleted === false && value.text === operation.text);
  function accepted(item, value, operation) {
    const keep = operation.kind === "put" && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, keep);
    item.remote = null;
    item.pending = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    onSaved(item.date);
    schedule(item);
  }
  function dispose() {
    context.disposed = true;
    for (const item of pages.values()) stopTimer(item);
  }
  Object.assign(context, { page: page2, emit, stopTimer, adopt, schedule, matches, accepted, dispose });
  return context;
}
function createReadingActions(context) {
  const { page: page2, emit, stopTimer, adopt, schedule } = context;
  const { load } = context.options;
  async function read3(date) {
    const item = page2(date), sequence5 = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || sequence5 !== item.sequence) return;
      if (item.pending || writeEpoch !== item.writeEpoch) return;
      if (["conflict", "unknown"].includes(item.phase)) {
        item.remote = value;
        item.canEdit = value.can_edit;
      } else if (item.dirty && value.version !== item.version) {
        item.remote = value;
        item.canEdit = value.can_edit;
        item.phase = "conflict";
        item.error = "\u670D\u52A1\u5668\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u540E\u9009\u62E9\u3002";
      } else {
        adopt(item, value, item.dirty);
        item.phase = item.dirty ? "dirty" : "saved";
        item.error = "";
      }
    } catch (error) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!["conflict", "unknown"].includes(item.phase)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        emit();
        schedule(item);
      }
    }
  }
  function edit(date, text, { composing = false } = {}) {
    const item = page2(date);
    if (context.disposed || !item.canEdit || !item.loaded || ["delete", "restore"].includes(item.pending?.kind)) return;
    item.composing = composing;
    item.draft = text;
    item.dirty = text !== item.serverText;
    stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!["conflict", "unknown"].includes(item.phase)) item.phase = "oversize";
      item.error = "\u6587\u5B57\u8D85\u8FC7 64 KiB\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u7F29\u77ED\u540E\u518D\u4FDD\u5B58\u3002";
    } else if (!["conflict", "unknown"].includes(item.phase)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : "saved";
      item.error = "";
    }
    emit();
    if (!composing) schedule(item);
  }
  return { read: read3, edit };
}
function createWritingActions(context) {
  const { page: page2, emit, stopTimer, matches, accepted } = context;
  const { put, remove, restore, uuid: uuid2 } = context.options;
  async function send(item, operation) {
    stopTimer(item);
    item.pending = operation;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const raw = await (operation.kind === "restore" ? restore(item.date, {
        version: operation.version,
        save_id: operation.saveId
      }) : operation.kind === "delete" ? remove(item.date, {
        version: operation.version,
        save_id: operation.saveId
      }) : put(item.date, { text: operation.text, version: operation.version, save_id: operation.saveId }));
      if (context.disposed || item.pending !== operation) return;
      const value = checkedPage(raw, item.date);
      if (!matches(value, operation)) throw new Error("\u4FDD\u5B58\u54CD\u5E94\u9700\u8981\u91CD\u65B0\u6838\u5BF9\u3002");
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (error.status === 409) {
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "\u670D\u52A1\u5668\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u3002";
        emit();
        await context.read(item.date);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        item.phase = "unknown";
        item.error = "\u6B63\u5728\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
        emit();
        await context.reconcile(item.date);
      }
    }
  }
  async function save3(date) {
    const item = page2(date);
    stopTimer(item);
    if (context.disposed || !item.canEdit || !item.loaded || item.loading || item.pending || ["conflict", "unknown"].includes(item.phase) || !item.dirty) return;
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = "oversize";
      item.error = "\u6587\u5B57\u8D85\u8FC7 64 KiB\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      emit();
      return;
    }
    return send(item, { kind: "put", text: item.draft, version: item.version, saveId: uuid2() });
  }
  async function deletePage(date) {
    const item = page2(date);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending || ["conflict", "unknown"].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, { kind: "delete", text: item.draft, version: item.version, saveId: uuid2() });
  }
  async function retryPending(date) {
    const item = page2(date), operation = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation?.retryReady || operation.checking || !item.canEdit) return;
    operation.retryReady = false;
    return send(item, operation);
  }
  async function restorePage(date) {
    const item = page2(date);
    if (context.disposed || !item.canEdit || !item.loaded || !item.deleted || item.pending || item.dirty || ["conflict", "unknown"].includes(item.phase)) return;
    return send(item, { kind: "restore", text: "", version: item.version, saveId: uuid2() });
  }
  return { save: save3, deletePage, restorePage, retryPending };
}
function createResolutionActions(context) {
  const { page: page2, emit, stopTimer, adopt, matches, accepted } = context;
  const { load } = context.options;
  async function reconcile(date) {
    const item = page2(date), operation = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation || operation.checking) return;
    operation.checking = true;
    operation.retryReady = false;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || item.pending !== operation) return;
      item.canEdit = value.can_edit;
      if (matches(value, operation)) accepted(item, value, operation);
      else if (value.version > operation.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "\u670D\u52A1\u5668\u5DF2\u6709\u4E0D\u540C\u7684\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u3002";
      } else {
        item.remote = value;
        operation.retryReady = value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ? "\u5DF2\u6838\u5BF9\u670D\u52A1\u5668\u5C1A\u65E0\u65B0\u7248\u672C\u3002\u53EF\u624B\u52A8\u91CD\u8BD5\u539F\u4FDD\u5B58\uFF0C\u540E\u7EED\u8349\u7A3F\u4ECD\u4F1A\u4FDD\u7559\u3002" : "\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002\u8BF7\u518D\u6B21\u6838\u5BF9\uFF0C\u6682\u4E0D\u91CD\u590D\u53D1\u9001\u3002";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) item.error = "\u6838\u5BF9\u5931\u8D25\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF1A" + error.message;
    } finally {
      operation.checking = false;
      emit();
    }
  }
  function useServer(date) {
    const item = page2(date);
    if (!item.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit();
  }
  async function useDraft(date) {
    const item = page2(date);
    if (!item.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    return context.save(date);
  }
  return { reconcile, useServer, useDraft };
}
function createDailyNotesStore(options2) {
  const context = createDailyNotesContext(options2);
  Object.assign(context, createReadingActions(context), createWritingActions(context), createResolutionActions(context));
  const { page: page2, pages, read: read3, edit, save: save3, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose } = context;
  return { page: page2, pages, read: read3, edit, save: save3, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose };
}

// local-ui/frontend/web/core/router.mjs
function normalizeArticlePipelineFilters(filters) {
  const allowed = {
    status: ["published"],
    slot: ["", ...Object.keys(slotLabels)],
    writer: ["", ...Object.keys(writerLabels)],
    has_warnings: ["", "true", "false"],
    has_pending_verify: ["", "true", "false"]
  };
  for (const [key2, choices] of Object.entries(allowed)) {
    if (!choices.includes(filters[key2])) filters[key2] = defaultFilters()[key2];
  }
  for (const key2 of ["series_no_min", "series_no_max"]) {
    const value = filters[key2];
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) filters[key2] = "";
  }
  if (filters.series_no_min && filters.series_no_max && Number(filters.series_no_min) > Number(filters.series_no_max)) {
    filters.series_no_min = "";
    filters.series_no_max = "";
  }
  return filters;
}
function isMobileLayout() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") return window.matchMedia("(max-width: 767px)").matches;
  return Number.isFinite(window.innerWidth) && window.innerWidth < 768;
}
function mobilePage(page2) {
  return ["overview", "dashboard", "articles", "reviews"].includes(page2) ? "review" : page2;
}
function updateRoute(push = false) {
  const page2 = mobilePage(state.page), redirected = page2 !== state.page;
  if (redirected) state.page = page2;
  state.filters.status = "published";
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  if (state.page === "ai-diagnosis" && u.hash === "#openai-review-panel") u.hash = "";
  if (state.page === "notes" && dailyNotesRouteCategory() === "work") u.searchParams.set("notes_category", "work");
  else u.searchParams.delete("notes_category");
  if (state.page === "memos" && state.memoView === "trash") u.searchParams.set("memo_view", "trash");
  else u.searchParams.delete("memo_view");
  u.searchParams.delete("period");
  u.searchParams.delete("article_scope");
  u.searchParams.delete("q");
  if (state.page === "todos" && state.todoDate) u.searchParams.set("date", state.todoDate);
  else if (state.page === "notes") u.searchParams.set("date", dailyNotesRouteDate());
  else if (state.page === "reminders" && state.reminderDate) u.searchParams.set("date", state.reminderDate);
  else if (["ai-reports", "ai-diagnosis"].includes(state.page) && state.aiDailyDate) u.searchParams.set("date", state.aiDailyDate);
  else u.searchParams.delete("date");
  if (state.page === "ai-diagnosis") {
    u.searchParams.set("diagnosis_tab", state.diagnosisTab || "help");
    u.searchParams.delete("ai_tab");
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun);
    else u.searchParams.delete("openai_run");
  } else if (state.page === "ai-reports") {
    u.searchParams.set("ai_tab", state.aiDailyTab || "reminders");
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun);
    else u.searchParams.delete("openai_run");
  } else {
    u.searchParams.delete("ai_tab");
    u.searchParams.delete("openai_run");
  }
  if (state.page !== "ai-diagnosis") u.searchParams.delete("diagnosis_tab");
  if (state.page === "todos" && state.todoPanel) u.searchParams.set("todo_panel", state.todoPanel);
  else u.searchParams.delete("todo_panel");
  if (state.page === "settings") u.searchParams.set("tab", state.settingsTab);
  else u.searchParams.delete("tab");
  if (state.page === "review") u.searchParams.set("account", state.account || "V\u5B57");
  else u.searchParams.delete("account");
  for (const key2 of [...Object.keys(defaultFilters()), "list_page", "page_size", "top_n", "top_platform", "columns"])
    u.searchParams.delete(key2);
  if (state.page !== "review") {
    for (const key2 of ["review_view", "review_date", "review_period", "review_article", "review_version", "review_compare"])
      u.searchParams.delete(key2);
  }
  history[push && !redirected ? "pushState" : "replaceState"]({}, "", u);
  storage.set("haoduoyu.account", state.account);
}
function readRoute() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("page");
  const fallback = "review";
  state.page = raw === "reminders" ? "ai-reports" : Object.hasOwn(legacyPages, raw) ? "settings" : nav.some((n) => n.id === raw) ? raw : fallback;
  state.page = mobilePage(state.page);
  if (state.page === "notes") {
    setDailyNotesRouteDate(params.get("date"));
    setDailyNotesRouteCategory(params.get("notes_category"));
  }
  const legacyDiary = raw === "ai-reports" && params.get("ai_tab") === "openai";
  const legacyHelp = raw === "review" && location.hash === "#openai-review-panel";
  if (legacyDiary || legacyHelp) state.page = "ai-diagnosis";
  state.diagnosisTab = legacyDiary || params.get("diagnosis_tab") === "reports" ? "reports" : "help";
  state.aiDailyTab = ["reminders", "reports"].includes(params.get("ai_tab")) ? params.get("ai_tab") : "reminders";
  state.aiDailyDate = ["ai-reports", "ai-diagnosis"].includes(state.page) && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.openAiRun = state.page === "ai-diagnosis" && /^[a-zA-Z0-9-]{1,80}$/.test(params.get("openai_run") || "") ? params.get("openai_run") : "";
  state.memoView = state.page === "memos" && params.get("memo_view") === "trash" ? "trash" : "";
  if (state.memoView === "trash") {
    state.page = "settings";
    state.memoView = "";
  }
  state.reminderDate = state.page === "reminders" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates", "future"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.get("tab") : "workspace");
  if (raw === "memos" && params.get("memo_view") === "trash") state.settingsTab = "workspace";
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
  state.articleOverviewMode = "published";
  state.account = params.get("account")?.trim() || "V\u5B57";
  state.filters = defaultFilters();
  for (const key2 of Object.keys(state.filters)) if (params.has(key2)) state.filters[key2] = params.get(key2);
  const allowed = { sort: ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"], order: ["asc", "desc"], platform: [
    "",
    "toutiao",
    "zhihu",
    "wechat",
    "other"
  ], topic: ["", "insurance", "entertainment", "unknown"], data_status: [
    "",
    "no_snapshot",
    "missing_reads",
    "missing_likes",
    "missing_comments",
    "incomplete",
    "zero_reads",
    "date_unverified"
  ], mode: ["", ...Object.keys(modeLabels)], group: [
    "",
    "account",
    "mode"
  ] };
  for (const [key2, values] of Object.entries(allowed)) if (!values.includes(state.filters[key2])) state.filters[key2] = defaultFilters()[key2];
  normalizeArticlePipelineFilters(state.filters);
  const int = (key2, def, max) => /^\d+$/.test(params.get(key2) || "") && Number(params.get(key2)) > 0 && Number(params.get(key2)) <= max ? Number(
    params.get(key2)
  ) : def;
  state.listPage = int("list_page", 1, 1e6);
  state.pageSize = int("page_size", 20, 200);
  state.topN = int("top_n", 5, 100);
  state.topPlatform = ["toutiao", "zhihu", "wechat", "other"].includes(params.get("top_platform")) ? params.get("top_platform") : "";
  state.columns = new Set(params.has("columns") ? params.get("columns").split(",").filter((c) => Object.hasOwn(articleColumns, c)) : defaultColumns);
}

// local-ui/frontend/web/ai-diagnosis-controller.mjs
init_client();

// local-ui/frontend/web/pages/ai-reports.mjs
function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI \u65E5\u62A5">
    <div>
      <div class="page-tabs segmented ai-daily-tabs" role="group" aria-label="AI \u65E5\u62A5\u6A21\u5757">
        <button class="btn" type="button" data-ai-daily-tab="reminders" aria-pressed="true">\u6BCF\u65E5\u63D0\u9192</button>
        <button class="btn" type="button" data-ai-daily-tab="reports" aria-pressed="false">AI\u6C47\u62A5</button>
      </div>
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-ai-report-month="-1" aria-label="\u4E0A\u4E2A\u6708">\u2039</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-ai-report-month="1" aria-label="\u4E0B\u4E2A\u6708">\u203A</button></div>
      <section data-ai-daily-panel="reminders"><p id="ai-reminder-status" role="status"></p><div id="ai-reminder-list"></div></section>
      <section data-ai-daily-panel="reports" hidden><p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-list" aria-live="polite"></div>
      </section>
    </div>
  </section>`;
}
var dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
var timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
function reportContent(value) {
  const content = String(value ?? "");
  const firstLine = content.split(/\r?\n/, 1)[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(firstLine) ? /* @__PURE__ */ new Date(`${firstLine}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== firstLine)
    return { workDate: null, body: content };
  return { workDate: firstLine, body: content.slice(firstLine.length).replace(/^\r?\n/, "") };
}
function reportDay(row) {
  const { workDate } = reportContent(row.content);
  const date = new Date(row.created_at);
  if (workDate) return workDate;
  if (!Number.isFinite(date.getTime())) return "";
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts2.year}-${parts2.month}-${parts2.day}`;
}
function reportGroup(author) {
  const name = String(author ?? "").trim().toLowerCase();
  if (["grok bot", "grok bot-\u5C0F\u5C0F\u9C7C"].includes(name)) return "Grok bot";
  if (name === "gemini") return "Gemini";
  if (["gpt", "chatgpt", "chatgpt-dot\u5C0F\u9C7C"].includes(name)) return "GPT";
  return "\u5176\u4ED6\u4F5C\u8005";
}
function reportAuthorClass(author) {
  const colors = { "Grok bot": "grok", Gemini: "gemini", GPT: "gpt", "\u5176\u4ED6\u4F5C\u8005": "other" };
  return `ai-report-author ai-report-author--${colors[reportGroup(author)]}`;
}
function paintAiCalendar(selectedDate2, visibleMonth3 = selectedDate2.slice(0, 7), selector = "#ai-reports") {
  const root2 = document.querySelector(selector);
  if (!root2) return;
  root2.querySelector("#ai-report-date-title").textContent = `${Number(visibleMonth3.slice(0, 4))}\u5E74${Number(visibleMonth3.slice(5, 7))}\u6708`;
  const first = /* @__PURE__ */ new Date(`${visibleMonth3}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  let calendar = '<div class="ai-calendar-grid">' + ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].map((d) => `<span>${d}</span>`).join("");
  calendar += "<span></span>".repeat(first.getUTCDay());
  for (let day3 = 1; day3 <= days; day3++) {
    const date = `${visibleMonth3}-${String(day3).padStart(2, "0")}`;
    calendar += `<button type="button" class="btn text" data-ai-report-select="${date}" aria-label="${date}" ${date === selectedDate2 ? 'aria-current="date"' : ""}>${day3}</button>`;
  }
  root2.querySelector("#ai-report-calendar").innerHTML = calendar + "</div>";
}
function paintAiReports(items, error = "", loading = false, selectedDate2 = dailyNotesToday(), visibleMonth3 = selectedDate2.slice(0, 7)) {
  const root2 = document.querySelector("#ai-reports");
  if (!root2) return;
  const status = root2.querySelector("#ai-report-list-status");
  status.textContent = error || (loading || items.length ? "" : "\u6682\u65E0\u6C47\u62A5");
  paintAiCalendar(selectedDate2, visibleMonth3);
  const rows = [];
  const groups = { "Grok bot": [], Gemini: [], GPT: [], "\u5176\u4ED6\u4F5C\u8005": [] };
  for (const row of items) {
    const date = new Date(row.created_at);
    const validDate2 = Number.isFinite(date.getTime());
    const submissionDay = validDate2 ? dateFormatter.format(date) : "\u65E5\u671F\u672A\u77E5";
    const { body } = reportContent(row.content);
    const stamp = validDate2 ? `${submissionDay} ${timeFormatter.format(date)}\uFF08\u5317\u4EAC\u65F6\u95F4\uFF09` : String(row.created_at ?? "\u672A\u77E5");
    const author = String(row.author ?? "");
    const group = reportGroup(author);
    groups[group].push(`<article class="card field-spaced" style="overflow-wrap:anywhere" title="\u63D0\u4EA4\u4E8E ${e(stamp)}"><p><strong class="${reportAuthorClass(author)}">${e(author)}\uFF1A</strong></p><div class="ai-report-markdown">${renderSafeMarkdown(body)}</div></article>`);
  }
  for (const [name, entries] of Object.entries(groups)) {
    if (name === "\u5176\u4ED6\u4F5C\u8005" && !entries.length) continue;
    const heading = name === "\u5176\u4ED6\u4F5C\u8005" ? `<h3 class="${reportAuthorClass(name)}">${name}</h3>` : "";
    rows.push(`<section>${heading}${entries.length ? entries.join("") : "<p>\u6682\u65E0\u6C47\u62A5</p>"}</section>`);
  }
  root2.querySelector("#ai-report-list").innerHTML = loading || error ? "" : rows.join("");
}
function paintAiDailyReminders(data2, error = "", loading = false) {
  const root2 = document.querySelector("#ai-reports");
  if (!root2) return;
  root2.querySelector("#ai-reminder-status").textContent = error || (loading ? "\u6B63\u5728\u8BFB\u53D6\u5DE5\u4F5C\u63D0\u9192\u2026" : "");
  const items = data2?.items || [];
  root2.querySelector("#ai-reminder-list").innerHTML = items.length ? items.map((row) => `<article class="card field-spaced" style="overflow-wrap:anywhere"><div class="ai-report-markdown">${renderSafeMarkdown(row.summary)}</div></article>`).join("") : loading || error ? "" : "<p>\u6682\u65E0\u5DE5\u4F5C\u63D0\u9192</p>";
}
function paintOpenAiDiary(items = [], { error = "", loading = false, owner: owner2 = true } = {}) {
  const root2 = document.querySelector("#ai-diagnosis");
  if (!root2) return;
  root2.querySelector("#openai-diary-status").textContent = error || (loading ? "\u6B63\u5728\u8BFB\u53D6\u5206\u6790\u8BB0\u5F55\u2026" : "");
  root2.querySelector("#openai-diary-list").innerHTML = !owner2 ? openAiLogin : loading || error ? "" : items.length ? items.map(renderOpenAiRun).join("") : "<p>\u8FD9\u4E00\u5929\u6CA1\u6709 OpenAI API \u5206\u6790\u8BB0\u5F55\u3002</p>";
}

// local-ui/frontend/web/openai-review-controller.mjs
init_client();
init_state();

// local-ui/frontend/web/core/openai-review-runner.mjs
function createOpenAiRunner({ request, storage: storage2, key: key2, onChange = () => {
}, uuid: uuid2 = () => crypto.randomUUID(), now = Date.now }) {
  let active2 = true;
  const state2 = { run: null, pendingId: "", notFound: false, busy: false, operation: "", startedAt: 0, error: "" };
  try {
    state2.pendingId = storage2.getItem(key2) || "";
  } catch {
  }
  state2.startedAt = openAiStartTime(storage2, key2, state2.pendingId);
  const change2 = () => {
    if (active2) onChange({ ...state2 });
  };
  const retain2 = (id2) => {
    storage2.setItem(key2, id2);
    if (storage2.getItem(key2) !== id2) throw new Error("\u65E0\u6CD5\u4FDD\u5B58\u5206\u6790\u8BF7\u6C42\u7F16\u53F7\uFF0C\u8BF7\u5141\u8BB8\u672C\u673A\u5B58\u50A8\u540E\u518D\u5F00\u59CB\u3002");
    state2.pendingId = id2;
    state2.startedAt = openAiStartTime(storage2, key2, id2);
  };
  const accept = (run2) => {
    if (!active2) return;
    if (state2.run?.id === run2?.id && openAiRunFinished(state2.run) && !openAiRunFinished(run2)) return;
    if (!run2?.id || typeof run2.status !== "string") throw new Error("\u5206\u6790\u72B6\u6001\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\uFF0C\u8BF7\u6838\u67E5\u72B6\u6001\u3002");
    state2.run = run2;
    state2.notFound = false;
    if (openAiRunFinished(run2)) {
      if (storage2.getItem(key2) === state2.pendingId) storage2.removeItem(key2);
      state2.pendingId = "";
    } else retain2(run2.id);
    state2.startedAt = Date.parse(run2.created_at) || state2.startedAt;
  };
  async function recover() {
    if (!active2 || state2.busy || !state2.pendingId) return;
    state2.busy = true;
    state2.operation = "check";
    state2.error = "";
    change2();
    try {
      accept(await request("/openai-review/runs/" + encodeURIComponent(state2.pendingId)));
    } catch (error) {
      state2.notFound = error.status === 404;
      state2.error = error.status === 404 ? "\u5C1A\u672A\u67E5\u5230\u8FD9\u6B21\u8BF7\u6C42\uFF0C\u8BF7\u7A0D\u540E\u6838\u67E5\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u63D0\u4EA4\u3002" : error.message || "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u7ED3\u679C\uFF0C\u8BF7\u6838\u67E5\u72B6\u6001\u3002";
    } finally {
      state2.busy = false;
      state2.operation = "";
      change2();
    }
  }
  const observe = createObserver({ state: state2, request, active: () => active2, accept, change: change2 });
  async function start(mode = "incremental", model = "") {
    if (!active2 || state2.busy || state2.pendingId || !["incremental", "full"].includes(mode)) return;
    state2.busy = true;
    state2.operation = "start";
    state2.error = "";
    change2();
    try {
      const existing = storage2.getItem(key2);
      if (existing) {
        retain2(existing);
        return;
      }
      const id2 = uuid2(), timing = JSON.stringify({ id: id2, at: now() });
      storage2.setItem(key2 + ":started", timing);
      if (storage2.getItem(key2 + ":started") !== timing) throw new Error("\u65E0\u6CD5\u4FDD\u5B58\u5206\u6790\u5F00\u59CB\u65F6\u95F4\uFF0C\u672A\u5F00\u59CB\u5206\u6790\u3002");
      retain2(id2);
      change2();
      const run2 = await request("/openai-review/runs", { method: "POST", body: { run_id: state2.pendingId, mode, ...model ? { model } : {} } });
      accept(run2);
    } catch (error) {
      if (!active2 || openAiRunFinished(state2.run) && !state2.pendingId) return;
      state2.error = state2.pendingId ? "\u8BF7\u6C42\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u6838\u67E5\u72B6\u6001\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u63D0\u4EA4\u3002" : error.message || "\u65E0\u6CD5\u4FDD\u5B58\u8BF7\u6C42\u7F16\u53F7\uFF0C\u672A\u5F00\u59CB\u5206\u6790\u3002";
      if (error.code === "OPENAI_REVIEW_IN_FLIGHT" && error.run_id) {
        retain2(error.run_id);
        state2.error = "\u5DF2\u6709\u5206\u6790\u8BF7\u6C42\uFF0C\u8BF7\u6838\u67E5\u72B6\u6001\u3002";
      }
      if ([
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_REVIEW_NOT_CONFIGURED",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "OPENAI_REVIEW_RATE_LIMIT",
        "OPENAI_REVIEW_INPUT_LIMIT",
        "OPENAI_REVIEW_NO_DATA",
        "OPENAI_REVIEW_SOURCE_INVALID",
        "VALIDATION_ERROR"
      ].includes(error.code)) {
        try {
          storage2.removeItem(key2);
        } catch {
        }
        state2.pendingId = "";
        state2.error = error.message;
      }
    } finally {
      state2.busy = false;
      state2.operation = "";
      change2();
    }
  }
  async function release() {
    if (!active2 || state2.busy || !state2.pendingId || !(state2.notFound || state2.run?.status === "uncertain")) return;
    state2.busy = true;
    state2.operation = "release";
    state2.error = "";
    change2();
    try {
      accept(await request("/openai-review/runs/" + encodeURIComponent(state2.pendingId) + "/release", {
        method: "POST",
        body: { acknowledgement: "provider_outcome_unknown_no_automatic_retry" }
      }));
    } catch (error) {
      state2.error = error.message || "\u89E3\u9664\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u6838\u67E5\u72B6\u6001\u3002";
      if (["OPENAI_REVIEW_RECOVERY_RATE_LIMIT", "OPENAI_REVIEW_PUBLIC_RATE_LIMIT"].includes(error.code))
        state2.error += " \u8BF7\u7A0D\u540E\u53EA\u8BFB\u6838\u67E5\u72B6\u6001\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u63D0\u4EA4\u3002";
    } finally {
      state2.busy = false;
      state2.operation = "";
      change2();
    }
  }
  return { state: state2, start, recover, observe, release, adopt(run2) {
    accept(run2);
    change2();
  }, dispose() {
    active2 = false;
  } };
}
function createObserver({ state: state2, request, active: active2, accept, change: change2 }) {
  let observing = false;
  return async function observe() {
    if (!active2() || observing || state2.operation !== "start" || !state2.pendingId || state2.run?.status === "uncertain") return;
    const id2 = state2.pendingId;
    observing = true;
    try {
      const run2 = await request("/openai-review/runs/" + encodeURIComponent(id2));
      if (active2() && state2.pendingId === id2 && run2?.id === id2) {
        accept(run2);
        change2();
      }
    } catch {
    } finally {
      observing = false;
      if (active2()) change2();
    }
  };
}

// local-ui/frontend/web/openai-review-controller.mjs
var session2 = "";
var runner;
var vm2 = {};
var registered2 = false;
var timer = null;
var loadSequence = 0;
var identity2 = () => `${runtime.sessionEpoch}:${state.me?.id || ""}:${Boolean(state.me?.publicBusiness)}`;
var current2 = () => session2 === identity2();
var clock = createOpenAiElapsedClock(() => {
  if (!current2() || (state.page !== "ai-diagnosis" || state.diagnosisTab !== "help") || document.visibilityState === "hidden") return null;
  const node2 = document.querySelector("#openai-review-panel [data-openai-elapsed]");
  return node2 ? { node: node2, startedAt: Number(node2.dataset.openaiElapsed) } : null;
});
function stopOpenAiReviewTimers() {
  clock.stop();
  clearTimeout(timer);
  timer = null;
}
function openAiReviewTimeout(path, options2 = {}) {
  return path === "/openai-review/runs" && options2.method === "POST" ? 21e4 : 75e3;
}
async function read2(path, options2 = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), openAiReviewTimeout(path, options2));
  try {
    return await apiNetwork(path, { ...options2, signal: controller.signal, suppressAuthRedirect: true });
  } finally {
    clearTimeout(timeout);
  }
}
function reset2() {
  if (session2 === identity2()) return;
  runner?.dispose();
  stopOpenAiReviewTimers();
  session2 = identity2();
  vm2 = { owner: openAiSessionAvailable(state.me), config: null, loading: false, error: "" };
  if (!vm2.owner) {
    runner = null;
    return;
  }
  const captured = session2;
  runner = createOpenAiRunner({
    request: read2,
    key: `haoduoyu.openai.run.v1:${state.me.id}:V\u5B57`,
    storage: {
      getItem: (key2) => localStorage.getItem(key2),
      setItem: (key2, value) => localStorage.setItem(key2, value),
      removeItem: (key2) => localStorage.removeItem(key2)
    },
    onChange(next2) {
      if (captured !== identity2() || session2 !== captured) return;
      const settled = openAiPendingRunSettled(vm2, next2);
      vm2 = { ...vm2, ...next2 };
      paintOpenAiReview();
      scheduleCheck();
      if (settled) document.dispatchEvent(new CustomEvent("openai-run-settled", {
        detail: { sessionEpoch: runtime.sessionEpoch, userId: state.me?.id, runId: next2.run.id }
      }));
    }
  });
  vm2 = { ...vm2, ...runner.state };
}
function paintOpenAiReview() {
  reset2();
  const node2 = document.querySelector("#openai-review-panel");
  if (node2) node2.innerHTML = renderOpenAiReviewPanel(vm2);
  clock.refresh();
}
function scheduleCheck() {
  clearTimeout(timer);
  timer = null;
  if (document.visibilityState === "hidden" || runner?.state.run?.status === "uncertain") return;
  if (!current2() || state.page !== "ai-diagnosis" || state.diagnosisTab !== "help" || !runner?.state.pendingId || runner.state.busy && runner.state.operation !== "start" || vm2.error) return;
  timer = setTimeout(() => {
    if (document.visibilityState !== "hidden" && current2() && state.page === "ai-diagnosis" && state.diagnosisTab === "help" && document.querySelector("#openai-review-panel"))
      void (runner.state.operation === "start" ? runner.observe() : runner.recover());
  }, 5e3);
}
async function loadOpenAiReview() {
  reset2();
  register2();
  if (!vm2.owner) {
    paintOpenAiReview();
    return;
  }
  const ticket = ++loadSequence, captured = session2;
  const fresh = () => ticket === loadSequence && captured === identity2();
  vm2.loading = true;
  vm2.config = null;
  vm2.error = "";
  paintOpenAiReview();
  try {
    const config = await read2("/openai-review/config");
    if (!fresh()) return;
    vm2.config = config;
    if (!config.supported_models?.some((model) => model.id === vm2.selectedModel)) vm2.selectedModel = config.default_model || config.model;
    if (runner.state.pendingId) await runner.recover();
    else {
      const page2 = await read2("/openai-review/runs?offset=0");
      if (!fresh()) return;
      const latest = page2?.items?.[0];
      if (latest) runner.adopt(latest);
    }
  } catch (error) {
    if (fresh()) vm2.error = error.message || "\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002";
  } finally {
    if (fresh()) {
      vm2.loading = false;
      paintOpenAiReview();
      scheduleCheck();
    }
  }
}
function register2() {
  if (registered2) return;
  registered2 = true;
  document.addEventListener("change", (event) => {
    if (event.target.id === "openai-model" && current2() && !runner?.state.busy && !runner?.state.pendingId && vm2.config?.supported_models?.some((model) => model.id === event.target.value)) vm2.selectedModel = event.target.value;
  });
  document.addEventListener("click", (event) => {
    const button2 = event.target.closest?.("#openai-review-panel [data-openai-action]");
    if (!button2 || button2.disabled || !current2() || !vm2.owner) return;
    const action = button2.dataset.openaiAction;
    if (action === "reload") {
      void loadOpenAiReview();
      return;
    }
    if (action === "check") {
      void runner.recover();
      return;
    }
    if (action === "release") {
      if (window.confirm("\u8FD9\u6B21\u8BF7\u6C42\u53EF\u80FD\u5DF2\u7ECF\u4EA7\u751F API \u8D39\u7528\uFF0C\u4F46\u7ED3\u679C\u65E0\u6CD5\u786E\u8BA4\u3002\u7ED3\u675F\u6838\u67E5\u4E0D\u4F1A\u91CD\u8BD5\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u53D1\u8D77\u65B0\u5206\u6790\u3002\u786E\u5B9A\u7ED3\u675F\uFF1F"))
        void runner.release();
      return;
    }
    if (!vm2.config?.configured || vm2.loading) return;
    if (action === "full" && !window.confirm("\u91CD\u65B0\u5206\u6790\u5168\u90E8\u5DF2\u767B\u8BB0\u6587\u7AE0\u548C\u6307\u6807\uFF0C\u4F1A\u4EA7\u751F\u4E00\u6B21\u65B0\u7684 API \u8C03\u7528\u3002\u7EE7\u7EED\u5417\uFF1F")) return;
    if (["start", "full"].includes(action)) void runner.start(action === "full" ? "full" : "incremental", vm2.selectedModel);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === `haoduoyu.openai.run.v1:${state.me?.id}:V\u5B57` && current2() && !runner?.state.busy) {
      stopOpenAiReviewTimers();
      if (state.page === "ai-diagnosis" && state.diagnosisTab === "help") void loadOpenAiReview();
    }
  });
  window.addEventListener("pagehide", stopOpenAiReviewTimers);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopOpenAiReviewTimers();
    else if (current2() && state.page === "ai-diagnosis" && state.diagnosisTab === "help") {
      clock.refresh();
      scheduleCheck();
    }
  });
}

// local-ui/frontend/web/ai-diagnosis-controller.mjs
var registered3 = false;
var sequence2 = 0;
var visibleMonth = "";
function renderAiDiagnosis() {
  return `<section id="ai-diagnosis" aria-label="AI\u8BCA\u65AD">
    <div class="page-tabs segmented" role="group" aria-label="AI\u8BCA\u65AD\u6A21\u5757">
      <button class="btn" type="button" data-diagnosis-tab="help">\u6C42\u52A9API</button>
      <button class="btn" type="button" data-diagnosis-tab="reports">\u8BCA\u65AD\u62A5\u544A</button></div>
    <section data-diagnosis-panel="help"><div class="card panel" id="openai-review-panel"></div></section>
    <section data-diagnosis-panel="reports" hidden>
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-diagnosis-month="-1" aria-label="\u4E0A\u4E2A\u6708">\u2039</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-diagnosis-month="1" aria-label="\u4E0B\u4E2A\u6708">\u203A</button></div>
      <p class="hint">\u6309\u5317\u4EAC\u65F6\u95F4\u5F52\u6863\uFF0C\u540C\u4E00\u5929\u6BCF\u6B21\u8BCA\u65AD\u5206\u522B\u4FDD\u7559\u3002</p>
      <p id="openai-diary-status" role="status" aria-live="polite"></p><div id="openai-diary-list"></div>
      <button class="btn" type="button" data-diagnosis-refresh>\u5237\u65B0\u8BCA\u65AD\u62A5\u544A</button>
    </section></section>`;
}
function selectTab() {
  const root2 = document.querySelector("#ai-diagnosis");
  if (!root2) return;
  for (const node2 of root2.querySelectorAll("[data-diagnosis-tab]")) node2.setAttribute("aria-pressed", String(node2.dataset.diagnosisTab === state.diagnosisTab));
  for (const node2 of root2.querySelectorAll("[data-diagnosis-panel]")) node2.hidden = node2.dataset.diagnosisPanel !== state.diagnosisTab;
}
async function loadAiDiagnosis() {
  register3();
  state.diagnosisTab ||= "help";
  selectTab();
  const ticket = ++sequence2, epoch = runtime.sessionEpoch;
  if (state.diagnosisTab === "help") {
    await loadOpenAiReview();
    return;
  }
  stopOpenAiReviewTimers();
  const date = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
  state.aiDailyDate = date;
  visibleMonth = date.slice(0, 7);
  paintAiCalendar(date, visibleMonth, "#ai-diagnosis");
  const current3 = () => ticket === sequence2 && epoch === runtime.sessionEpoch && state.page === "ai-diagnosis" && state.diagnosisTab === "reports";
  const owner2 = openAiSessionAvailable(state.me);
  paintOpenAiDiary([], { owner: owner2, loading: owner2 });
  if (!owner2) return;
  try {
    const items = await readOpenAiRuns((path) => apiNetwork(path, { suppressAuthRedirect: true }), date, current3);
    if (!current3() || !items) return;
    paintOpenAiDiary(items);
    if (state.openAiRun) document.getElementById("openai-run-" + state.openAiRun)?.focus();
  } catch (error) {
    if (current3()) paintOpenAiDiary([], { error: error.message || "\u8BCA\u65AD\u62A5\u544A\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002" });
  }
}
function register3() {
  if (registered3) return;
  registered3 = true;
  document.addEventListener("openai-run-settled", (event) => {
    if (event.detail?.sessionEpoch !== runtime.sessionEpoch || event.detail?.userId !== state.me?.id || state.page !== "ai-diagnosis" || state.diagnosisTab !== "reports") return;
    void loadAiDiagnosis();
  });
  document.addEventListener("click", (event) => {
    if (state.page !== "ai-diagnosis") return;
    const tab = event.target.closest?.("[data-diagnosis-tab]")?.dataset.diagnosisTab;
    if (["help", "reports"].includes(tab)) {
      state.diagnosisTab = tab;
      updateRoute(true);
      void loadAiDiagnosis();
      return;
    }
    if (event.target.closest?.("[data-diagnosis-refresh]")) {
      void loadAiDiagnosis();
      return;
    }
    const month = event.target.closest?.("[data-diagnosis-month]");
    if (month) {
      const date2 = /* @__PURE__ */ new Date(visibleMonth + "-01T00:00:00Z");
      date2.setUTCMonth(date2.getUTCMonth() + Number(month.dataset.diagnosisMonth));
      const next2 = date2.toISOString().slice(0, 7);
      if (validDailyNotesDate(next2 + "-01")) {
        visibleMonth = next2;
        paintAiCalendar(state.aiDailyDate, visibleMonth, "#ai-diagnosis");
      }
      return;
    }
    const date = event.target.closest?.("[data-ai-report-select]")?.dataset.aiReportSelect;
    if (validDailyNotesDate(date)) {
      state.aiDailyDate = date;
      state.openAiRun = "";
      updateRoute(true);
      void loadAiDiagnosis();
    }
  });
}

// local-ui/frontend/web/controller.mjs
init_client();

// local-ui/frontend/web/core/retry-after.mjs
var DEFAULT_RETRY_AFTER = 6e4;
function retryAfterDelay(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(DEFAULT_RETRY_AFTER, Math.ceil(value))) : DEFAULT_RETRY_AFTER;
}
function retryUntil(now, delay) {
  return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(0, now) + retryAfterDelay(delay));
}

// local-ui/frontend/web/controller.mjs
init_constants();

// local-ui/frontend/web/core/session-index-state.mjs
init_state();
var articleIndexes = /* @__PURE__ */ new Map();
function clearArticleIndexes() {
  runtime.articleIndexGeneration++;
  articleIndexes.clear();
  state.reviewArticles = [];
}
function resetSessionIndexes() {
  cancelPageRequests();
  runtime.sessionEpoch++;
  resetTodos();
  clearArticleIndexes();
}

// local-ui/frontend/web/controller.mjs
init_state();

// local-ui/frontend/web/pages/articles.mjs
init_client();
init_constants();

// local-ui/frontend/web/core/modal-request.mjs
init_client();
init_state();
async function modalRequest(path, ticket, version, context) {
  try {
    return await api(path, { context });
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return null;
    throw err;
  }
}

// local-ui/frontend/web/pages/articles.mjs
init_state();

// local-ui/frontend/web/ui/modal.mjs
init_state();

// local-ui/frontend/web/ui/popover.mjs
init_state();
function closePopover({ restoreFocus = true } = {}) {
  if (!runtime.activePopover) return;
  const { node: node2, trigger } = runtime.activePopover;
  runtime.activePopover = null;
  node2.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function popover(trigger, body, { menu = false, label: label3 = "\u8BF4\u660E" } = {}) {
  if (runtime.activePopover?.trigger === trigger) {
    closePopover();
    return;
  }
  closePopover();
  const id2 = trigger.getAttribute("aria-controls") || `popover-${++runtime.popoverId}`, node2 = document.createElement("div");
  trigger.setAttribute("aria-controls", id2);
  trigger.setAttribute("aria-expanded", "true");
  node2.id = id2;
  node2.className = "popover";
  node2.setAttribute("role", menu ? "menu" : "dialog");
  node2.setAttribute("aria-label", label3);
  node2.tabIndex = -1;
  node2.innerHTML = body;
  (trigger.closest("[role=dialog]") || document.body).append(node2);
  runtime.activePopover = { node: node2, trigger, menu };
  const anchor = trigger.getBoundingClientRect(), r = node2.getBoundingClientRect();
  node2.style.left = `var(--popover-left,${Math.max(16, Math.min(anchor.right - r.width, innerWidth - r.width - 16))}px)`;
  node2.style.top = `var(--popover-top,${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - r.height - 16))}px)`;
  (node2.querySelector('button,a[href],input:not([type=hidden]),select,[tabindex="0"]') || node2).focus();
}

// local-ui/frontend/web/ui/modal.mjs
function openModal(title, body, { drawer: drawer2 = false, context = "" } = {}) {
  cancelModalRequests();
  closePopover();
  runtime.modalRequestVersion++;
  if (!$("#overlay").contains(document.activeElement)) runtime.lastFocus = document.activeElement;
  $("#overlay").innerHTML = `<div class="modal-backdrop ${drawer2 ? "drawer-backdrop" : ""}"><section class="modal ${drawer2 ? "drawer" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div>${context}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="\u5173\u95ED">${icon("close", 20)}</button></header><div class="modal-body">${body}</div></section></div>`;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const field2 = $("input:not([type=checkbox]),select,textarea,button", $("#overlay"));
    field2?.focus();
  });
}
function closeModal() {
  cancelModalRequests();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  if (!$("#overlay")) return;
  const wasOpen = !!$("#overlay").firstChild;
  $("#overlay").innerHTML = "";
  document.body.style.overflow = "";
  if (wasOpen && runtime.lastFocus?.isConnected) runtime.lastFocus.focus();
}

// local-ui/frontend/web/ui/segmented.mjs
init_constants();
function segmented(action, items, selected, label3, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label3)}">${items.map(([value, text]) => `<button type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(
    text
  )}</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label3 = "\u5E73\u53F0") {
  return segmented(action, [["", "\u5168\u90E8"], ...Object.entries(platforms)], selected, label3, "platform");
}

// local-ui/frontend/web/ui/table.mjs
init_state();

// local-ui/frontend/web/pages/articles.mjs
var pipelineFilters = ["slot", "writer", "has_warnings", "has_pending_verify", "series_no_min", "series_no_max"];
var boolChoices = { true: "\u662F", false: "\u5426" };
var publishedArticle = (article) => !Object.hasOwn(article, "status") || article.status === "published";
function statusSelect(value = "draft_saved", allowUnknown = false) {
  const known = Object.hasOwn(statusLabels, value);
  const unknown = allowUnknown && !known;
  if (!unknown && !known) value = "draft_saved";
  return `<label class="form-field">\u72B6\u6001<select name="status" class="input" aria-label="\u6587\u7AE0\u72B6\u6001">
${unknown ? '<option value="" selected disabled>\u672A\u786E\u8BA4\uFF0C\u8BF7\u9009\u62E9\u72B6\u6001</option>' : ""}
${Object.entries(statusLabels).map(([key2, label3]) => `<option value="${e(key2)}" ${value === key2 ? "selected" : ""}>${e(label3)}</option>`).join("")}
</select></label>`;
}
function pipelineFilterFields(f) {
  return `${articleSelect("slot", "\u69FD\u4F4D", slotLabels, f.slot)}
${articleSelect("writer", "\u5199\u4F5C\u8005", writerLabels, f.writer)}${articleSelect("has_warnings", "\u6709\u8B66\u544A", boolChoices, f.has_warnings)}
${articleSelect("has_pending_verify", "\u6709\u660E\u786E\u5F85\u6838", boolChoices, f.has_pending_verify)}
${field("series_no_min", "\u7CFB\u5217\u7F16\u53F7\u81EA", "number", f.series_no_min, 'min="1" step="1"')}
${field("series_no_max", "\u7CFB\u5217\u7F16\u53F7\u81F3", "number", f.series_no_max, 'min="1" step="1"')}`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account = state.account } = {}) {
  return `<form id="filter-panel">${["platform", "data_status"].map((key2) => `<input type="hidden" name="${e(key2)}" value="${e(f[key2])}">`).join("")}
<h2>\u6587\u7AE0\u7B5B\u9009 <span class="badge">\u5E94\u7528\u540E\u751F\u6548</span></h2><div class="form-grid"><label class="form-field full">\u8FD0\u8425\u8D26\u53F7
<select name="account" class="input" aria-label="\u8FD0\u8425\u8D26\u53F7">${accountOptions(account)}</select></label>${pipelineFilterFields(f)}
${field("from", "\u53D1\u5E03\u81EA", "date", f.from)}${field("to", "\u53D1\u5E03\u81F3", "date", f.to)}
${Object.entries({ mode: "\u751F\u4EA7\u65B9\u5F0F", group: "\u5206\u7EC4" }).map(([key2, label3]) => articleSelect(key2, label3, articleChoices[key2], f[key2])).join("")}
<fieldset class="form-field full permission-fields"><legend>\u663E\u793A\u5B57\u6BB5</legend><div class="checkboxes">
${Object.entries(articleColumns).map(([key2, [label3]]) => `<label class="check-option"><input type="checkbox" name="columns"
value="${e(key2)}" ${c.has(key2) ? "checked" : ""}>${e(label3)}</label>`).join("")}</div></fieldset>
<div class="form-field full"><span>\u66F4\u591A\u6392\u5E8F</span><input type="hidden" name="sort" value="${e(f.sort)}">
<input type="hidden" name="order" value="${e(f.order)}"><div class="head-actions">${sortChoices(f, c)}</div></div>
<div class="form-field full"><label for="filter-view">\u5E38\u7528\u89C6\u56FE\uFF08\u7B5B\u9009\u548C\u5B57\u6BB5\uFF09</label><select id="filter-view" class="input">
<option value="">\u9009\u62E9\u89C6\u56FE\u540E\u5E94\u7528</option>${state.savedViews.map((v) => `<option value="${e(v.id)}">${e(v.name)}</option>`).join("")}
</select><button type="button" class="btn" data-action="save-view">\u4FDD\u5B58\u5DF2\u5E94\u7528\u89C6\u56FE</button></div></div>
<div class="form-actions"><button type="button" class="btn" data-action="reset-draft">\u91CD\u7F6E\u8349\u7A3F</button>
<button type="submit" class="btn">\u5E94\u7528</button></div></form>`;
}
function sortChoices(f, columns) {
  return Object.entries(articleColumns).filter(([, [, sort2]]) => sort2).map(([key2, [label3, sort2]]) => `<button type="button" class="btn small" data-action="draft-sort" data-visible="${sort2 === "published_at" || columns.has(key2)}"
data-sort="${e(sort2)}" aria-pressed="${f.sort === sort2}">${e(label3)} ${f.sort === sort2 ? f.order === "asc" ? "\u2191" : "\u2193" : "\u2195"}</button>`).join("") || "\u4F7F\u7528\u8868\u5934\u6392\u5E8F";
}
function articleDraft(form) {
  const values = new FormData(form), filters = { ...state.filters };
  for (const key2 of ["platform", "data_status", "from", "to", "mode", "group", "sort", "order", ...pipelineFilters]) {
    filters[key2] = String(values.get(key2) || "");
  }
  filters.topic = "";
  filters.status = "published";
  if (!Object.values(articleColumns).some(([, sort2]) => sort2 === filters.sort)) filters.sort = "published_at";
  if (!["asc", "desc"].includes(filters.order)) filters.order = "desc";
  return {
    filters: normalizeArticlePipelineFilters(filters),
    columns: new Set(values.getAll("columns").filter((c) => Object.hasOwn(articleColumns, c))),
    account: String(values.get("account") || "")
  };
}
function viewDraft(view2) {
  return { filters: normalizeArticlePipelineFilters({ ...defaultFilters(), ...Object.fromEntries(Object.entries(view2.filters).filter(([key2]) => Object.hasOwn(defaultFilters(), key2))) }), columns: /* @__PURE__ */ new Set([
    ...view2.columns.filter((key2) => Object.hasOwn(articleColumns, key2)),
    ...view2.version !== 2 && !view2.columns.includes("as_of") ? ["likes", "comments", "as_of"] : []
  ]), account: state.account };
}
function articleMenu(article) {
  return `<button role="menuitem" data-action="article-detail" data-id="${e(article.id)}">\u8BE6\u60C5</button>${safeURL(article.url) ? `<a role="menuitem" href="${e(article.url)}" target="_blank" rel="noopener noreferrer">\u539F\u6587 \u2197</a>` : ""}
<button role="menuitem" data-action="edit-article" data-id="${e(article.id)}">\u7F16\u8F91</button>${publishedArticle(article) ? `<button role="menuitem" data-action="review-article" data-id="${e(article.id)}">\u8865\u5145\u6570\u636E</button>` : ""}`;
}
function nullableSelect(name, label3, choices, value) {
  return `<label class="form-field">${e(label3)}<select class="input" name="${e(name)}"><option value="">\u672A\u6807\u6CE8</option>
${Object.entries(choices).map(([key2, text]) => `<option value="${e(key2)}" ${value === key2 ? "selected" : ""}>${e(text)}</option>`).join("")}
</select></label>`;
}
function articleMetadataFields(article) {
  const status = Object.hasOwn(article, "status") ? article.status : "published";
  return `${statusSelect(status, true)}${nullableSelect("slot", "\u69FD\u4F4D", slotLabels, article.slot)}
${nullableSelect("writer", "\u5199\u4F5C\u8005", writerLabels, article.writer)}${nullableSelect("illustrator", "\u914D\u56FE\u8005", illustratorLabels, article.illustrator)}
${field("run_dir", "\u6D41\u6C34\u7EBF\u6807\u8BC6\uFF08\u4FDD\u7559\u659C\u6760\uFF09", "text", article.run_dir, 'maxlength="512"')}
${field("run_date", "\u5B58\u7A3F\u65E5\u671F", "date", article.run_date)}${field("series_no", "\u7CFB\u5217\u7F16\u53F7", "number", article.series_no, 'min="1" step="1"')}
${field("char_count", "\u5B57\u6570", "number", article.char_count, 'min="0" step="1"')}
${field("subheading_count", "\u5C0F\u6807\u9898\u6570", "number", article.subheading_count, 'min="0" step="1"')}
${field("image_count", "\u56FE\u6570", "number", article.image_count, 'min="0" step="1"')}
${field("finished_at", "\u6D41\u6C34\u7EBF\u7ED3\u675F", "datetime-local", localDateTime(article.timings?.finished_at))}
${field("draft_pgc_id", "\u5934\u6761\u8349\u7A3F pgc_id", "text", article.draft_ref?.pgc_id, 'maxlength="300"')}
${field("draft_appmsgid", "\u516C\u4F17\u53F7\u8349\u7A3F appmsgid", "text", article.draft_ref?.appmsgid, 'maxlength="300"')}
${field("draft_editor_url", "\u8349\u7A3F\u7F16\u8F91\u94FE\u63A5\uFF08HTTP/HTTPS\uFF09", "url", article.draft_ref?.editor_url, 'placeholder="https://\u2026"')}`;
}
function articleForm(article, id2) {
  return `<form id="article-form" class="article-ledger article-ledger-form" data-id="${e(id2)}" data-version="${e(article.version || "")}">
<p class="form-context">\u5317\u4EAC\u65F6\u95F4</p><div class="form-grid">
${field("title", '\u6587\u7AE0\u6807\u9898 <span class="required">*</span>', "text", article.title, 'maxlength="300" required', true)}
<label class="form-field full">\u6240\u5C5E\u8FD0\u8425\u8D26\u53F7 <span class="required">*</span><select class="input" id="field-account_id"
name="account_id" required>${accountOptions(article.account_id, false, true)}</select></label>${articleMetadataFields(article)}
${field("url", "\u5DF2\u53D1\u5E03\u6587\u7AE0\u94FE\u63A5\uFF08\u53D1\u5E03\u65F6\u5FC5\u586B\uFF09", "url", article.url, 'placeholder="https://\u2026"', true)}
${field("published_at", "\u5B9E\u9645\u53D1\u5E03\u65F6\u95F4\uFF08\u53D1\u5E03\u65F6\u5FC5\u586B\uFF09", "datetime-local", localDateTime(article.published_at))}
${field("started_at", "\u6D41\u6C34\u7EBF\u5F00\u59CB\uFF08\u53EF\u9009\uFF09", "datetime-local", localDateTime(article.started_at))}
${nullableSelect("production_mode", "\u539F\u751F\u4EA7\u65B9\u5F0F", modeLabels, article.production_mode)}
${field("platform_article_id", "\u5E73\u53F0\u6587\u7AE0\u6807\u8BC6\uFF08\u53EF\u9009\uFF09", "text", article.platform_article_id)}
<label class="form-field full" for="field-summary">\u6587\u7AE0\u6982\u51B5<textarea class="input" name="summary" id="field-summary"
maxlength="10000">${e(article.summary)}</textarea></label><label class="form-field full" for="field-notes">\u5907\u6CE8
<textarea class="input" name="notes" id="field-notes" maxlength="20000">${e(article.notes)}</textarea></label>
</div>${formEnd(id2 ? "\u4FDD\u5B58\u4FEE\u6539" : "\u4FDD\u5B58\u6587\u7AE0")}</form>`;
}
async function articleModal(id2 = "") {
  const context = beginModalRequests(), ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id2) article = await modalRequest(`/articles/${encodeURIComponent(id2)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const active2 = state.accounts.filter((account) => account.active || account.id === article.account_id);
  if (!active2.length) {
    toast("\u8BF7\u5148\u6DFB\u52A0\u4E00\u4E2A\u542F\u7528\u7684\u8FD0\u8425\u8D26\u53F7\u3002", true);
    return;
  }
  openModal(id2 ? "\u7F16\u8F91\u6587\u7AE0" : "\u8BB0\u5F55\u6587\u7AE0", articleForm(article, id2));
  runtime.articleFormRecord = { record: article, sessionEpoch: runtime.sessionEpoch, ticket: runtime.modalRequestVersion };
}

// local-ui/frontend/web/pages/dashboard.mjs
init_constants();
init_state();
function dailyDates(data2) {
  return (data2.trend || []).filter((d) => (d.accounts || []).some((a) => Object.values(a.metrics || {}).some((v) => v != null)));
}
function renderDashboardSummary(data2) {
  const daily = dailyDates(data2);
  const selector = `<label class="form-field"><span>\u7EDF\u8BA1\u8D26\u53F7</span><select id="overview-account" class="input"><option value="">\u5168\u90E8\u8D26\u53F7</option>${state.accounts.map((a) => `<option value="${e(a.id)}" ${state.account === a.id ? "selected" : ""}>${e(accountLabel(a))}</option>`).join("")}</select></label>`;
  return `${selector}${renderCumulative(data2)}
 ${daily.length < 2 ? "" : `<details class="card trend-disclosure" data-state="trendOpen" ${state.trendOpen ? "open" : ""}><summary>\u8D8B\u52BF\u4E0E\u53D1\u5E03\u91CF</summary><div class="panel"><div class="chart-header"><h2>\u6BCF\u65E5\u65B0\u589E\u8D8B\u52BF ${dashboardInfo("trend", "\u8D8B\u52BF\u6570\u636E\u8986\u76D6")}</h2><label><span class="sr-only">\u8D8B\u52BF\u6307\u6807</span><select id="trend-metric" class="input">${Object.entries(metrics).map(([key2, label3]) => `<option value="${e(
    key2
  )}" ${state.trendMetric === key2 ? "selected" : ""}>${e(label3)}</option>`).join("")}</select></label></div>${renderTrend(
    data2
  )}<h3>\u672C\u7AD9\u53D1\u5E03\u91CF ${dashboardInfo("publication", "\u53D1\u5E03\u91CF\u53E3\u5F84")}</h3>${renderPublicationTrend(data2)}${segmented("trend-tab", [
    ["metrics", "\u6BCF\u65E5\u660E\u7EC6"],
    ["publication", "\u5404\u8D26\u53F7\u6BCF\u65E5\u53D1\u5E03\u91CF"]
  ], state.trendTab || "metrics", "\u8D8B\u52BF\u660E\u7EC6")}${renderDailyTable(data2)}</div></details>`}`;
}
function renderCumulative(data2) {
  const c = data2.cumulative || {}, rows = data2.top_articles || [], fresh = freshness(c);
  const interactions = c.totals?.likes == null || c.totals?.comments == null ? null : c.totals.likes + c.totals.comments;
  const stats = [["\u5DF2\u53D1\u5E03\u6587\u7AE0", num(c.article_count)], ["\u7D2F\u8BA1\u9605\u8BFB", num(c.totals?.reads)], ["\u7BC7\u5747\u9605\u8BFB", num(c.mean_reads)], ["\u4E92\u52A8\uFF08\u8D5E+\u8BC4\uFF09", num(
    interactions
  )], ["\u6570\u636E\u8986\u76D6", c.coverage == null ? "\u2014" : num(c.coverage * 100) + "%"]];
  return `<div class="overview-status" role="status"><span><i class="fresh-dot ${e(fresh.kind)}"></i>${e(fresh.label)}</span><div>${c.no_snapshot_count ? `<button class="btn text" data-action="missing-list" data-status="no_snapshot">\u672A\u91C7\u96C6 ${e(num(c.no_snapshot_count))} \u7BC7 \u2192</button>` : ""}</div></div>
 <dl class="dashboard-stats">${stats.map(([label3, value], i) => `<div class="stat"><dt>${e(label3)}${i === 4 ? dashboardInfo(
    "coverage",
    "\u6570\u636E\u8986\u76D6\u4E0E\u7EDF\u8BA1\u53E3\u5F84"
  ) : ""}</dt><dd class="${value === "\u2014" ? "missing-value" : ""}">${e(value)}</dd></div>`).join("")}</dl>
 <div class="dashboard-grid dashboard-results"><section class="card"><div class="section-heading"><h2>\u8D26\u53F7\u8868\u73B0</h2></div>${renderPlatformTable(data2.platform_comparison || [])}</section></div>
 <section class="card cumulative-top"><div class="section-heading"><h2 id="top-heading">\u9605\u8BFB Top 5</h2>${segmented("top-platform", [[
    "",
    "\u5168\u90E8"
  ], ...Object.entries(platforms).filter(([key2]) => key2 !== "other" || state.topPlatform === "other" || state.accounts.some((a) => a.platform === "other"))], state.topPlatform, "Top\u699C\u5E73\u53F0", "platform")}</div>${rows.length ? `${renderTopTable(rows.slice(0, 5))}${rows.length > 5 ? `<details class="top-rest"><summary class="table-footer">\u5C55\u5F00\u5176\u4F59 ${e(num(rows.length - 5))} \u7BC7</summary>${renderTopTable(
    rows.slice(5),
    5
  )}</details>` : ""}` : '<div class="empty inline-empty">\u6682\u65E0\u5DF2\u53D6\u5F97\u9605\u8BFB\u6570\u636E\u7684\u6587\u7AE0\u3002</div>'}<div class="table-footer"><a class="btn text" href="?page=articles&amp;sort=reads&amp;order=desc" data-action="all-top">\u67E5\u770B\u5168\u90E8 \u2192</a></div></section>`;
}
function renderPlatformTable(rows) {
  return rows.length ? `<div class="table-scroll"><table class="data-table dashboard-table platform-table"><thead><tr><th>\u8D26\u53F7</th><th>\u7BC7\u6570</th><th>\u7D2F\u8BA1\u9605\u8BFB</th><th>\u7BC7\u5747</th><th>\u4E2D\u4F4D\u6570</th></tr></thead><tbody>${[...rows].sort((a, b) => (b.totals?.reads ?? -1) - (a.totals?.reads ?? -1)).map((p) => {
    const accounts = state.accounts.filter((a) => a.platform === p.platform && (!state.account || state.account === a.id)), label3 = accounts.map((a) => accountLabel(a)).join("\uFF0C") || platforms[p.platform] || p.platform;
    return `<tr data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}"><td><span class="account-title">${platformLogo(p.platform)}<button class="article-link" data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}">${e(label3)}</button>${dashboardInfo(
      "platform",
      "\u8D26\u53F7\u8868\u73B0\u3001\u6700\u4F73\u6587\u7AE0\u4E0E\u8BA1\u5212",
      p.platform
    )}</span></td><td data-label="\u7BC7\u6570">${e(num(p.article_count))}</td><td data-label="\u7D2F\u8BA1\u9605\u8BFB">${e(num(p.totals?.reads))}</td><td data-label="\u7BC7\u5747">${e(num(p.mean_reads))}</td><td data-label="\u4E2D\u4F4D\u6570">${e(num(
      p.median_reads
    ))}</td></tr>`;
  }).join("")}</tbody></table></div>` : '<div class="empty inline-empty">\u6682\u65E0\u8D26\u53F7\u3002<button class="btn" data-action="new-account">\u6DFB\u52A0\u8D26\u53F7</button></div>';
}
function renderTopTable(rows, offset = 0) {
  const approvals = rows.some((a) => a.platform === "zhihu" || a.latest_metrics?.approvals != null);
  return `<div class="table-scroll"><table class="data-table dashboard-table top-table"><thead><tr><th>\u6587\u7AE0</th><th>\u8D26\u53F7</th><th>\u9605\u8BFB</th><th>\u70B9\u8D5E ${dashboardInfo(
    "metrics",
    "\u70B9\u8D5E\u4E0E\u8D5E\u540C\u53E3\u5F84",
    "top" + offset
  )}</th><th>\u8BC4\u8BBA</th>${approvals ? "<th>\u8D5E\u540C</th>" : ""}</tr></thead><tbody>${rows.map(
    (a, i) => `<tr><td class="title-cell"><span class="rank">${e(num(offset + i + 1))}</span><button class="article-link" data-action="article-detail" data-id="${e(a.id)}">${e(a.title)}</button></td><td>${platformLogo(a.platform)} ${e(a.account_name)}</td>${[
      "reads",
      "likes",
      "comments",
      ...approvals ? ["approvals"] : []
    ].map((key2) => `<td data-label="${e(metrics[key2])}">${dashboardMetric(
      a,
      key2
    )}</td>`).join("")}</tr>`
  ).join("")}</tbody></table></div>`;
}
function dashboardInfoBody(kind, id2) {
  const d = state.dashboard || {}, c = d.cumulative || {}, totals = d.totals || {};
  if (kind === "coverage") return `<p>${e(c.metric_note)}</p><p>\u7BC7\u5747\u5206\u6BCD\uFF1A\u6709\u9605\u8BFB\u6570\u636E ${e(num(c.data_article_count))} \u7BC7\u3002</p><p>\u622A\u81F3 ${e(time(c.as_of))} \xB7 \u91C7\u96C6 ${e(time(c.collected_at))}</p><p><button class="btn text" data-action="missing-list" data-status="missing_reads">\u7F3A\u9605\u8BFB ${e(num(c.missing_reads_count))} \u7BC7 \u2192</button><button class="btn text" data-action="missing-list" data-status="date_unverified">\u65E5\u671F\u5F85\u6838\u5B9E ${e(num(c.unverified_date_count))} \u7BC7 \u2192</button></p><p>\u70B9\u8D5E ${e(num(c.totals?.likes))} \xB7 \u8BC4\u8BBA ${e(num(c.totals?.comments))} \xB7 \u8D5E\u540C ${e(num(c.totals?.approvals))}\uFF1B\u4E92\u52A8\u4EC5\u5728\u8D5E\u3001\u8BC4\u5747\u53D6\u5F97\u65F6\u76F8\u52A0\u3002</p><p>\u81EA\u52A8\u5316\u5360\u6BD4 ${totals.article_count ? e(num(totals.automatic_count / totals.article_count * 100)) + "%" : "\u2014"} \xB7 \u8017\u65F6\u4E2D\u4F4D\u6570 ${e(duration(totals.median_duration_seconds))}</p>`;
  if (kind === "platform") {
    const p = (d.platform_comparison || []).find((p2) => p2.platform === id2) || {}, accounts = state.accounts.filter((a) => a.platform === id2 && (!state.account || state.account === a.id));
    return `<p>${accounts.length > 1 ? "\u540C\u5E73\u53F0\u591A\u8D26\u53F7\uFF0C\u8868\u4E2D\u4E3A\u5E73\u53F0\u6C47\u603B\uFF1B\u5404\u8D26\u53F7\u53EF\u5206\u522B\u8FDB\u5165\u6587\u7AE0\u5217\u8868\u3002" : "\u7D2F\u8BA1\u6307\u6807\u6765\u81EA\u8BE5\u5E73\u53F0\u6C47\u603B\u3002"}</p>${accounts.map((a) => `<button class="btn text" data-action="select-account" data-id="${e(a.id)}">${e(a.name)} \u2192</button>`).join(
      ""
    )}<p>\u8986\u76D6 ${p.coverage == null ? "\u2014" : e(num(p.coverage * 100)) + "%"} \xB7 \u622A\u81F3 ${e(time(p.as_of))}</p>${p.best_article ? `<p>\u6700\u4F73\u6587\u7AE0\uFF1A<button class="article-link" data-action="article-detail" data-id="${e(p.best_article.id)}">${e(p.best_article.title)}</button> \xB7 \u9605\u8BFB ${e(num(p.best_article.latest_metrics?.reads))}</p>` : "<p>\u6682\u65E0\u6709\u9605\u8BFB\u6570\u636E\u7684\u6587\u7AE0\u3002</p>"}`;
  }
  if (kind === "attention") {
    const a = (d.attention_articles || []).find((a2) => a2.id === id2);
    return `<p>${e(a?.attention?.reason)}</p><p>${e(a?.attention?.baseline)}</p>`;
  }
  if (kind === "series") return "<p>\u6309\u5B8C\u6574\u6807\u9898\u7F16\u53F7\u8BC6\u522B\uFF0C\u4EC5\u8BA1\u5DF2\u53D1\u5E03\u4E14\u65E5\u671F\u5DF2\u8BB0\u5F55\u7684\u6587\u7AE0\u3002\u7F16\u53F7\u8FDB\u5EA6\u4E0D\u4EE3\u8868\u672C\u7AD9\u6536\u5F55\u7BC7\u6570\u3002</p>";
  if (kind === "publication") return `<p>${e(d.publication_note)}</p>`;
  if (kind === "trend") return `<p>\u53EA\u7528\u771F\u5B9E\u6BCF\u65E5\u65B0\u589E\uFF0C\u4E0D\u4EE5\u7D2F\u8BA1\u5FEB\u7167\u8865\u96F6\u6216\u63D2\u503C\u3002</p>${(d.accounts || []).map((a) => `<p>${e(
    accountLabel(a)
  )}\uFF1A${e(num((d.trend || []).filter((day3) => day3.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] != null)).length))}/${e(num((d.trend || []).length))}\u5929\u6709\u8BE5\u6307\u6807\uFF1B\u7F3A\u65E5\u5904\u65AD\u5F00\u3002</p>`).join("")}`;
  return `<p>${e(c.metric_note || "likes\u4E3A\u70B9\u8D5E\uFF0Capprovals\u4E3A\u8D5E\u540C\uFF0C\u5206\u522B\u8BB0\u5F55\uFF1B\u672A\u91C7\u96C6\u3001\u672A\u53D6\u5F97\u548C\u771F\u5B9E0\u5206\u5F00\u3002")}</p><p>\u5468\u671F\u4EC5\u4F7F\u7528\u771F\u5B9E\u6BCF\u65E5\u65B0\u589E\uFF0C\u4E0D\u8865\u96F6\u3001\u4E0D\u63D2\u503C\u3002\u7D2F\u8BA1\u5FEB\u7167\u4E0D\u8865\u6BCF\u65E5\u6570\u636E\u3002</p>`;
}
function renderPublicationTrend(data2) {
  const rows = data2.publication_trend || [], max = Math.max(1, ...rows.map((r) => r.accounts.reduce((n, a) => n + a.count, 0)));
  return `<div class="publication-bars" aria-label="\u672C\u7AD9\u6BCF\u65E5\u53D1\u5E03\u91CF">${rows.map((row) => `<div><span>${e(row.date.slice(5))}</span><div class="publication-stack">${row.accounts.map((a) => `<i data-chart-height="${e(a.count / max * 80)}" data-chart-color="${e(platformColor((data2.accounts || []).find((v) => v.id === a.account_id)?.platform))}" title="${e(accountName(a.account_id))} ${e(num(a.count))}\u7BC7"></i>`).join(
    ""
  )}</div><strong>${e(num(row.accounts.reduce((n, a) => n + a.count, 0)))}</strong></div>`).join("")}</div>`;
}
function renderDailyTable(data2) {
  const publication = state.trendTab === "publication", rows = publication ? data2.publication_trend || [] : data2.trend || [], accounts = data2.accounts || [];
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>\u65E5\u671F</th>${accounts.map((a) => `<th>${e(accountLabel(a))}</th>`).join(
    ""
  )}</tr></thead><tbody>${rows.map((d) => `<tr><td>${e(d.date)}</td>${accounts.map((a) => {
    const r = d.accounts.find((r2) => r2.account_id === a.id), value = publication ? r?.count : r?.metrics?.[state.trendMetric];
    return `<td>${value == null ? "\u672A\u53D6\u5F97" : e(num(value))}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderTrend(data2) {
  const dates = data2.trend || [], accounts = data2.accounts || [], key2 = state.trendMetric, colors = accounts.map((a) => platformColor(a.platform));
  const all = dates.flatMap((d) => (d.accounts || []).map((a) => a.metrics?.[key2])).filter((v) => v != null);
  const dataDays = dates.filter((d) => d.accounts.some((a) => a.metrics?.[key2] != null)).length;
  const max = Math.max(...all.map(Number), 1), w = 620, h = 200, left = 45, plotW = 550, plotH = 150;
  const x = (i) => left + (dates.length > 1 ? i * plotW / (dates.length - 1) : plotW / 2), y = (v) => 12 + plotH - Number(v) / max * plotH;
  const drawing = all.length ? `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="\u771F\u5B9E\u6BCF\u65E5\u65B0\u589E\u8D8B\u52BF\uFF0C\u7F3A\u5931\u5904\u65AD\u5F00\uFF1B\u4E0B\u65B9\u53EF\u70B9\u6309\u65E5\u671F\u8BFB\u53D6\u6570\u503C">${[
    0,
    0.5,
    1
  ].map((t) => `<line x1="45" x2="595" y1="${12 + t * plotH}" y2="${12 + t * plotH}" stroke="var(--line)"/><text x="38" y="${16 + t * plotH}" text-anchor="end">${compact(max * (1 - t))}</text>`).join("")}${accounts.map((a, i) => {
    let prev = null;
    return dates.map((d, j) => {
      const value = d.accounts.find((p) => p.account_id === a.id)?.metrics?.[key2];
      if (value == null) {
        prev = null;
        return "";
      }
      const point = { x: x(j), y: y(value) }, line = prev ? `<line x1="${prev.x}" y1="${prev.y}" x2="${point.x}" y2="${point.y}" stroke="${e(
        colors[i % colors.length]
      )}" stroke-width="2"/>` : "";
      prev = point;
      return line + `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${e(colors[i % colors.length])}"><title>${e(a.name)} ${e(d.date)} ${num(
        value
      )}</title></circle>`;
    }).join("");
  }).join("")}${dates.filter((d, i) => i === 0 || i === dates.length - 1 || i === Math.floor(dates.length / 2)).map((d) => `<text x="${x(dates.indexOf(d))}" y="190" text-anchor="middle">${e(d.date.slice(5))}</text>`).join("")}</svg>` : "";
  const selected = dates.find((d) => d.date === state.trendDate) || dates.at(-1);
  return `${dataDays < 2 ? `<div class="empty inline-empty" role="status">\u6570\u636E\u4E0D\u8DB3\uFF1A${e(num(dataDays))}\u5929\u6709\u8BE5\u9879\u771F\u5B9E\u65E5\u6570\u636E\u3002</div>` : ""}${drawing}<div class="chart-legend">${accounts.map((a, i) => `<span><i class="legend-dot" data-chart-color="${e(colors[i % colors.length])}"></i>${e(accountLabel(a))}</span>`).join("")}</div><label class="trend-date-label">\u70B9\u6309\u67E5\u770B\u6BCF\u65E5\u8BFB\u6570<select id="trend-date" class="input">${dates.map((d) => `<option value="${e(d.date)}" ${selected?.date === d.date ? "selected" : ""}>${e(d.date)}</option>`).join("")}</select></label><div class="trend-readout" aria-live="polite">${selected ? `<strong>${e(selected.date)}</strong>${accounts.map((a) => {
    const row = selected.accounts.find((v) => v.account_id === a.id);
    return `<span>${e(a.name)}\uFF1A${row?.metrics?.[key2] == null ? "\u672A\u53D6\u5F97" : num(row.metrics[key2])} ${e(metrics[key2])}${row?.coverage?.source === "articles" ? "\uFF08\u4EC5\u5DF2\u5F55\u5165\u6587\u7AE0\uFF09" : ""}</span>`;
  }).join("")}` : "\u6682\u65E0\u65E5\u671F"}</div>`;
}

// local-ui/frontend/web/pages/login.mjs
init_state();

// local-ui/frontend/web/ui/entry.mjs
init_state();
function stopPageEntry() {
  try {
    runtime.entryObserver?.disconnect();
  } catch {
  }
  runtime.entryObserver = null;
  for (const block of runtime.entryBlocks) {
    block.classList?.remove("entry-ready", "entry-visible");
    block.style?.removeProperty("--entry-delay");
  }
  runtime.entryBlocks = [];
}
function animatePageEntry(container) {
  stopPageEntry();
  if (typeof IntersectionObserver !== "function" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  try {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const blocks = Array.from(container?.children || []).filter((block) => block.matches?.("section, details, .overview-status, .review-summary, .segmented"));
    if (!blocks.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (runtime.entryObserver !== observer) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("entry-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0, rootMargin: "0px 0px -8px 0px" });
    runtime.entryObserver = observer;
    runtime.entryBlocks = blocks;
    blocks.forEach((block, index) => {
      block.style.setProperty("--entry-delay", `${Math.min(index, 3) * 40}ms`);
      block.classList.add("entry-ready");
      observer.observe(block);
    });
  } catch {
    stopPageEntry();
  }
}
function applyChartStyles(container) {
  for (const node2 of container.querySelectorAll(".publication-bars i[data-chart-color],.legend-dot[data-chart-color]")) {
    const color = node2.dataset.chartColor;
    node2.style.setProperty("--plot-color", /^var\(--p-(?:toutiao|zhihu|wechat|other)\)$/.test(color) ? color : "var(--p-other)");
    if (node2.hasAttribute("data-chart-height")) {
      const height = Number(node2.dataset.chartHeight);
      node2.style.setProperty("--h", Number.isFinite(height) && height >= 0 && height <= 80 ? `${height}px` : "0px");
    }
  }
}
function replacePageContent(html, animate = false) {
  stopPageEntry();
  const content = $("#page-content");
  if (!content) return;
  content.innerHTML = html;
  applyChartStyles(content);
  if (animate) animatePageEntry(content);
}

// local-ui/frontend/web/pages/login.mjs
function renderLogin() {
  resetSessionIndexes();
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card"><div class="brand login-brand"><span class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">\u597D\u591A\u9C7C\u5DE5\u4F5C\u53F0</h1></div><form id="login-form" aria-label="\u8D26\u53F7\u767B\u5F55"><div class="form-field"><label for="username">\u8D26\u53F7</label><input class="input" id="username" name="username" autocomplete="username" required autofocus></div><div class="form-field"><label for="password">\u5BC6\u7801</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div><p class="form-message" role="alert"></p><button class="btn primary" type="submit">\u767B\u5F55 ${icon(
    "arrow",
    15
  )}</button></form></section></main>`;
}
function renderInitializationError(message, onRetry, { status } = {}) {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  const explanation = status === 429 ? "\u8BF7\u6C42\u8F83\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" : "\u672A\u80FD\u5B8C\u6210\u8FDE\u63A5\u6216\u8BFB\u53D6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002";
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card" role="alert"><div class="brand login-brand"><span class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">\u5DE5\u4F5C\u53F0\u6682\u65F6\u65E0\u6CD5\u6253\u5F00</h1></div><p>${explanation}</p><p>${e(message || "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002")}</p><button id="init-retry" class="btn primary" type="button">\u91CD\u65B0\u8FDE\u63A5</button></section></main>`;
  $("#init-retry")?.addEventListener("click", onRetry);
}

// local-ui/frontend/web/pages/settings.mjs
init_constants();
init_state();
function renderKeys(keys) {
  return `<section class="card">${keys.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>\u51ED\u8BC1\u540D\u79F0</th><th>\u8D26\u53F7\u8303\u56F4</th><th>\u6743\u9650</th><th>\u6700\u8FD1\u4F7F\u7528</th><th>\u72B6\u6001</th><th></th></tr></thead><tbody>${keys.map((k) => {
    let ids = k.account_ids || k.account_ids_json || [], permissions = k.permissions || k.permissions_json || [];
    if (typeof ids === "string") {
      try {
        ids = JSON.parse(ids);
      } catch {
        ids = [];
      }
    }
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions);
      } catch {
        permissions = [];
      }
    }
    return `<tr><td>${e(k.name)}<div class="cell-sub">\u521B\u5EFA ${e(time(k.created_at))}</div></td><td class="key-scope">${ids.map((id2) => e(accountName(
      id2
    ))).join("<br>") || "\u65E0\u8D26\u53F7\u6743\u9650"}</td><td>${permissions.map((p) => `<span class="badge ${p === "write" ? "up" : ""}">${p === "read" ? "\u8BFB\u53D6" : p === "write" ? "\u5199\u5165" : e(p)}</span>`).join(" ")}</td><td>${k.last_used_at ? e(time(k.last_used_at)) : "\u5C1A\u672A\u4F7F\u7528"}</td><td><span class="badge ${k.revoked_at ? "" : "up"}">${k.revoked_at ? "\u5DF2\u64A4\u9500" : "\u6709\u6548"}</span></td><td>${k.revoked_at ? "" : `<button class="btn small danger" data-action="revoke-key" data-id="${e(k.id)}" data-name="${e(k.name)}">\u64A4\u9500</button>`}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("\u6682\u65E0\u51ED\u8BC1", "\u4F9B\u81EA\u52A8\u5316\u5DE5\u5177\u6309\u8D26\u53F7\u8303\u56F4\u8BFB\u53D6\u6216\u5F55\u5165\u6570\u636E\u3002")}</section>`;
}
function auditLabel(action) {
  const labels2 = [
    ["\u5408\u5E76\u5B58\u7A3F", "PATCH /articles"],
    ["\u65B0\u589E\u6587\u7AE0", "article.create", "POST /articles"],
    ["\u4FEE\u6539\u6587\u7AE0", "article.update", "PUT /articles/:id"],
    [
      "\u8FFD\u52A0\u590D\u76D8\u5FEB\u7167",
      "observation.create",
      "POST /observations"
    ],
    ["\u586B\u5199\u6BCF\u65E5\u6570\u636E", "daily_metrics.upsert", "POST /daily-metrics"],
    [
      "\u6DFB\u52A0\u8D26\u53F7",
      "account.create",
      "POST /accounts"
    ],
    ["\u4FEE\u6539\u8D26\u53F7", "account.update", "PUT /accounts/:id"],
    [
      "\u521B\u5EFA AI \u51ED\u8BC1",
      "api_key.create",
      "api_key.created",
      "POST /api-keys"
    ],
    ["\u64A4\u9500 AI \u51ED\u8BC1", "api_key.revoke", "api_key.revoked", "DELETE /api-keys/:id"],
    [
      "\u4FEE\u6539\u5BC6\u7801",
      "auth.password",
      "auth.password_changed",
      "PUT /auth/password"
    ],
    ["\u767B\u5F55\u7F51\u7AD9", "auth.login", "POST /auth/login"],
    ["\u9000\u51FA\u767B\u5F55", "auth.logout", "POST /auth/logout"],
    ["\u521D\u59CB\u5316\u7F51\u7AD9", "auth.bootstrap"]
  ];
  const route2 = String(action || "").replace(/^(PUT|DELETE) \/(articles|accounts|api-keys)\/[^/]+$/, "$1 /$2/:id");
  return labels2.find((row) => row.includes(route2))?.[0] || route2 || "\u672A\u77E5\u64CD\u4F5C";
}
function renderSecurity() {
  return `<section class="card panel security-panel"><h2>\u767B\u5F55\u4E0E\u5B89\u5168</h2><p class="muted security-context">\u5F53\u524D\u767B\u5F55\uFF1A${e(state.me.username)}</p><form id="password-form"><div class="form-field"><label for="current-password">\u5F53\u524D\u5BC6\u7801</label><input class="input" type="password" id="current-password" name="currentPassword" autocomplete="current-password" required></div><div class="form-field field-spaced"><label for="new-password">\u65B0\u5BC6\u7801</label><input class="input" type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="12" required><span class="hint">\u81F3\u5C11 12 \u4F4D</span></div><div class="form-field field-spaced"><label for="confirm-password">\u518D\u6B21\u8F93\u5165\u65B0\u5BC6\u7801</label><input class="input" type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="12" required></div><p class="form-message" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">\u66F4\u65B0\u5BC6\u7801</button></div></form><div class="detail-section"><h3>\u6570\u636E\u5BFC\u51FA</h3><a class="btn" href="/api/v1/export" download>${icon("download", 14)}\u5BFC\u51FA\u53D1\u5E03\u8BB0\u5F55 CSV</a></div></section>`;
}
function renderAudit(audit, keys = []) {
  const actors = [...new Set(audit.map((r) => r.actor))], groups = [];
  const actor = (value) => state.me?.id && value === "user:" + state.me.id ? "\u6211" : keys.find((k) => value === "key:" + k.id)?.name || `${String(
    value
  ).startsWith("user:") ? "\u7528\u6237" : String(value).startsWith("key:") ? "\u672A\u8BC6\u522B\u51ED\u636E" : "\u672A\u77E5\u6765\u6E90"} ${num(actors.indexOf(value) + 1)}`;
  for (const row of audit) {
    const day22 = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "\u65E5\u671F\u672A\u77E5", label3 = auditLabel(row.action), last = groups.at(-1);
    if (last && day22 !== "\u65E5\u671F\u672A\u77E5" && last.day === day22 && last.actor === row.actor && last.label === label3) last.rows.push(row);
    else groups.push({ day: day22, actor: row.actor, label: label3, rows: [row] });
  }
  let day3 = "";
  return `<section class="card panel"><h2>\u6700\u8FD1\u64CD\u4F5C</h2><div class="audit-list">${groups.map((g) => {
    const heading = day3 === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "\u4ECA\u5929" : g.day === bjtDate(Date.now() - 864e5) ? "\u6628\u5929" : g.day)}</h3>`;
    day3 = g.day;
    return `${heading}<details class="audit-item"><summary><div><strong>${e(g.label)} \xD7${e(num(g.rows.length))}</strong><div class="audit-meta">${e(actor(g.actor))} \xB7 ${e(time(g.rows.at(-1).created_at, true))}${g.rows.length > 1 ? " \u2014 " + e(time(g.rows[0].created_at, true)) : ""}</div></div></summary><ol class="snapshot-timeline">${g.rows.map((r) => {
      const article = r.entity_id && typeof r.entity_label === "string" && r.entity_label ? r : null;
      return `<li>${e(auditLabel(r.action))} \xB7 <time datetime="${e(r.created_at)}" title="${e(time(r.created_at))}">${e(displayTime(r.created_at))}</time>${article ? `<br><span class="article-title">${e(article.entity_label)}</span>` : ""}</li>`;
    }).join("")}</ol></details>`;
  }).join("") || empty("\u6682\u65E0\u64CD\u4F5C\u8BB0\u5F55")}</div></section>`;
}
function keyModal() {
  if (!state.accounts.some((a) => a.active)) {
    toast("\u8BF7\u5148\u6DFB\u52A0\u4E00\u4E2A\u542F\u7528\u7684\u8FD0\u8425\u8D26\u53F7\u3002", true);
    return;
  }
  openModal("\u521B\u5EFA AI \u63A5\u5165\u51ED\u8BC1", `<form id="key-form"><div class="form-grid">${field(
    "name",
    '\u51ED\u8BC1\u540D\u79F0 <span class="required">*</span>',
    "text",
    "",
    'required maxlength="80"',
    true
  )}<fieldset class="form-field permission-fields"><legend class="field-label">\u5141\u8BB8\u8BBF\u95EE\u7684\u8D26\u53F7 <span class="required">*</span></legend><div class="checkboxes">${state.accounts.filter((a) => a.active).map((a) => `<label class="check-option"><input type="checkbox" name="account_ids" value="${e(a.id)}" ${state.account === a.id ? "checked" : ""}>${e(accountLabel(a))}</label>`).join("")}</div></fieldset><fieldset class="form-field permission-fields"><legend class="field-label">\u5141\u8BB8\u7684\u64CD\u4F5C</legend><div class="checkboxes"><label class="check-option"><input type="checkbox" name="permissions" value="read" checked>\u8BFB\u53D6\u6587\u7AE0\u4E0E\u6570\u636E</label><label class="check-option"><input type="checkbox" name="permissions" value="write">\u65B0\u589E\u4E0E\u66F4\u65B0\u6570\u636E</label></div></fieldset></div>${formEnd("\u521B\u5EFA\u51ED\u8BC1")}</form>`);
}

// local-ui/frontend/web/pages/todos.mjs
init_client();

// local-ui/frontend/web/core/todo-month.mjs
function todoMonthScopeTransition(snapshotOwner, nextOwner, previousReady, ready) {
  if (snapshotOwner !== nextOwner) return ready ? "replace-and-load" : "replace";
  if (previousReady === ready) return "none";
  return ready ? "resume" : "pause";
}
function todoMonthSeed(month, snapshot, loaded) {
  const days = {};
  if (snapshot?.days) {
    const last = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    for (let i = 1; i <= last.getUTCDate(); i++) {
      const date = `${month}-${String(i).padStart(2, "0")}`;
      days[date] = snapshot.days[date] || [];
    }
  }
  for (const day3 of loaded) {
    if (!snapshot?.days || day3.pending || day3.readAt > snapshot.verified_at) days[day3.date] = day3.items;
  }
  return days;
}
function createTodoMonthLoader({ read: read3, seed, active: active2, changed: changed4 = () => {
}, now = Date.now }) {
  let owner2 = "", current3 = null, cooldown = 0;
  const monthDays = (month) => {
    const end = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return end.getUTCDate();
  };
  const months = /* @__PURE__ */ new Map();
  function cancel(snapshot) {
    if (!snapshot?.controller) return;
    snapshot.controller.abort();
    snapshot.controller = null;
    snapshot.loading = false;
  }
  function open(month, nextOwner) {
    if (owner2 !== nextOwner) {
      cancel(current3);
      months.clear();
      owner2 = nextOwner;
      current3 = null;
      cooldown = 0;
    }
    if (current3?.month !== month) cancel(current3);
    let snapshot = months.get(month);
    if (!snapshot) {
      snapshot = { month, owner: owner2, days: /* @__PURE__ */ new Map(), fresh: /* @__PURE__ */ new Set(), revisions: /* @__PURE__ */ new Map(), expiresAt: 0, loading: false, error: "", retryAt: 0 };
      months.set(month, snapshot);
    }
    current3 = snapshot;
    const count2 = monthDays(month), deadline = Math.max(snapshot.retryAt, cooldown);
    if (snapshot.fresh.size === count2 && now() < snapshot.expiresAt) snapshot.error = "";
    const expired = snapshot.fresh.size === count2 && now() >= snapshot.expiresAt;
    if (expired) snapshot.fresh.clear();
    if (!snapshot.loading && snapshot.fresh.size < count2 && now() < deadline && !snapshot.error)
      snapshot.error = "\u8BF7\u6C42\u8F83\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
    if (!snapshot.loading && snapshot.fresh.size < count2 && now() >= deadline) {
      const controller = new AbortController();
      snapshot.controller = controller;
      snapshot.loading = true;
      snapshot.error = "";
      snapshot.promise = run2(snapshot, controller, expired);
    }
    return snapshot;
  }
  async function run2(snapshot, controller, expired) {
    const valid2 = () => snapshot.controller === controller && !controller.signal.aborted && active2(snapshot.owner);
    const count2 = monthDays(snapshot.month);
    const dates = Array.from({ length: count2 }, (_, i) => `${snapshot.month}-${String(i + 1).padStart(2, "0")}`);
    const revisions = new Map(snapshot.revisions);
    try {
      const initial2 = await seed(snapshot.month, snapshot.owner, { refresh: expired });
      if (!valid2()) return;
      if (initial2) for (const [date, items] of Object.entries(initial2)) {
        if (dates.includes(date) && Array.isArray(items) && !snapshot.fresh.has(date) && (snapshot.revisions.get(date) || 0) === (revisions.get(date) || 0)) {
          snapshot.days.set(date, items);
          snapshot.fresh.add(date);
        }
      }
      for (let start = 0; start < dates.length; start += 5) {
        const batch = dates.slice(start, start + 5).filter((date) => !snapshot.fresh.has(date));
        if (!batch.length) continue;
        const context = { controller, pending: /* @__PURE__ */ new Map() };
        const results = await Promise.allSettled(batch.map(async (date) => {
          const revision = revisions.get(date) || 0;
          const value = await read3(date, context);
          if (!Array.isArray(value?.items)) throw new Error("\u6708\u8BB0\u5F55\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u8BD5");
          if (valid2()) {
            if ((snapshot.revisions.get(date) || 0) === revision) snapshot.days.set(date, value.items);
            snapshot.fresh.add(date);
          }
          return value;
        }));
        if (!valid2()) return;
        let failure;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected") {
            const error = result.reason || new Error("\u6708\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
            if (!failure || error?.status === 429 && (failure.status !== 429 || (error.retryAfterMs || 6e4) > (failure.retryAfterMs || 6e4))) failure = error;
          }
        }
        if (failure) {
          if (failure.status === 429) {
            const deadline = Math.min(Number.MAX_SAFE_INTEGER - 1, now() + (failure.retryAfterMs || 6e4));
            cooldown = Math.max(cooldown, deadline);
            snapshot.retryAt = Math.max(snapshot.retryAt, deadline);
          }
          snapshot.error = failure.message || "\u6708\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
          break;
        }
      }
      if (snapshot.fresh.size === count2) snapshot.expiresAt = now() + 6e4;
    } catch (error) {
      if (valid2()) snapshot.error = error.message || "\u6708\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
    } finally {
      if (snapshot.controller === controller) {
        snapshot.controller = null;
        snapshot.loading = false;
        if (current3 === snapshot && active2(snapshot.owner)) changed4(snapshot);
      }
    }
  }
  function update(nextOwner, date, items) {
    if (owner2 !== nextOwner || !Array.isArray(items)) return false;
    const snapshot = months.get(date.slice(0, 7));
    if (!snapshot || JSON.stringify(snapshot.days.get(date)) === JSON.stringify(items)) return false;
    snapshot.days.set(date, items);
    snapshot.revisions.set(date, (snapshot.revisions.get(date) || 0) + 1);
    return true;
  }
  return { open, update, cancel: () => cancel(current3) };
}

// local-ui/frontend/web/pages/todos.mjs
init_runtime();
init_state();

// local-ui/frontend/web/pages/todo-templates.mjs
init_client();
init_state();

// local-ui/frontend/web/core/todo-templates-state.mjs
init_state();
var todoTemplatesState = { owner: "" };
function templateState() {
  const owner2 = todoOwner();
  if (todoTemplatesState.owner !== owner2) {
    Object.assign(todoTemplatesState, {
      owner: owner2,
      items: [],
      loaded: false,
      loading: false,
      sequence: 0,
      revision: 0,
      draft: "",
      create: null,
      adding: false,
      error: "",
      editing: null,
      editDraft: "",
      pending: /* @__PURE__ */ new Set(),
      readDate: "",
      readVersion: -1
    });
  }
  return todoTemplatesState;
}
function templateSessionActive(owner2) {
  return Boolean(state.me) && owner2 === todoOwner() && owner2 === todoTemplatesState.owner;
}
function mergeTodoTemplate(item) {
  const store = templateState(), index = store.items.findIndex((row) => row.id === item.id);
  if (index < 0) store.items.push(item);
  else if (store.items[index].version <= item.version) store.items[index] = item;
}

// local-ui/frontend/web/pages/todo-templates.mjs
function templateUnavailable(store, day3, id2) {
  return !store.loaded || !day3.loaded || day3.loading || day3.adding || store.pending.has(id2) || todoTemplateAdded(day3, id2) || [...day3.removals.values()].some((ticket) => ticket.phase === "restoring" && ticket.item.template_id === id2);
}
function inlineTodoTemplateContent(store) {
  const day3 = todoDay(), label3 = day3.date === bjtDate() ? "\u4ECA\u65E5\u5DF2\u6DFB\u52A0" : "\u5F53\u65E5\u5DF2\u6DFB\u52A0";
  const status = "";
  const error = store.error ? `<p class="form-message" role="alert">${e(store.error)}
<button class="btn text small" data-action="todo-reload">\u91CD\u65B0\u8BFB\u53D6</button></p>` : "";
  return status + error + store.items.map((item) => {
    const added = todoTemplateAdded(day3, item.id);
    return `<button type="button" class="todo-template-chip${added ? " is-added" : ""}" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="${e(added ? item.text + "\uFF0C" + label3 : "\u6DFB\u52A0\uFF1A" + item.text)}" ${templateUnavailable(store, day3, item.id) ? "disabled" : ""}>
<span class="todo-template-chip-text">${e(item.text)}</span>${added ? `<span class="todo-template-chip-status">${label3}</span>` : ""}</button>`;
  }).join("");
}
function inlineTodoTemplatesEmpty(store) {
  return store.loaded && !store.items.length && !store.loading && !store.error;
}
function renderInlineTodoTemplates() {
  const store = templateState();
  return `<div id="todo-inline-templates" class="todo-inline-templates" role="group" aria-label="\u5E38\u7528\u5F85\u529E"
aria-busy="${store.loading}" ${inlineTodoTemplatesEmpty(store) ? "hidden" : ""}>${inlineTodoTemplateContent(store)}</div>`;
}
function paintInlineTodoTemplates(store) {
  const root2 = $("#todo-inline-templates");
  if (!root2) return;
  const html = inlineTodoTemplateContent(store);
  if (root2.innerHTML !== html) root2.innerHTML = html;
  root2.hidden = inlineTodoTemplatesEmpty(store);
  root2.setAttribute("aria-busy", String(store.loading));
}
function todoTemplateRows(store) {
  const day3 = todoDay();
  const added = (id2) => todoTemplateAdded(day3, id2);
  const addedLabel = day3.date === bjtDate() ? "\u4ECA\u65E5\u5DF2\u6DFB\u52A0" : "\u5F53\u65E5\u5DF2\u6DFB\u52A0";
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="\u6DFB\u52A0\uFF1A${e(item.text)}" ${templateUnavailable(store, day3, item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>\u6539\u540D</button>
<button class="btn text small" data-action="todo-template-archive" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>\u5F52\u6863</button>
<button class="btn text small" data-action="todo-template-delete" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>\u5220\u9664</button></div>
<p class="todo-template-added" data-template-added ${added(item.id) ? "" : "hidden"}>${addedLabel}</p>
<p class="todo-template-progress"><span data-template-status>${item.habit_status === "habit" ? "\u4E60\u60EF" : "\u5F85\u529E"}</span> \xB7
<span data-template-count>\u8FD130\u5929\u5DF2\u5B8C\u6210 ${Number(item.completed_days || 0)} \u5929</span></p></li>`).join("");
}
function todoTemplateEditor(store) {
  if (!store.editing) return "";
  return `<form id="todo-template-edit-form" class="todo-template-form" data-id="${e(store.editing.id)}">
<label for="todo-template-edit-text" class="sr-only">\u4FEE\u6539\u5E38\u7528\u5F85\u529E</label>
<input id="todo-template-edit-text" class="input" name="text" maxlength="500" required value="${e(store.editDraft)}">
<button class="btn" type="submit">\u4FDD\u5B58</button><button class="btn text" type="button" data-action="todo-template-cancel">\u53D6\u6D88</button></form>`;
}
function renderTodoTemplates(floatingControl = "") {
  const store = templateState();
  return `<section id="todo-templates" class="daily-todo-templates todo-view" aria-label="\u5E38\u7528\u5F85\u529E" ${state.todoPanel === "templates" ? "" : "hidden"}>
<div class="todo-view-head">${floatingControl}</div>
<div class="todo-template-content">
<form id="todo-template-form" class="todo-template-form" ${store.editing ? "hidden" : ""}>
<label for="todo-template-text" class="sr-only">\u65B0\u5EFA\u5E38\u7528\u5F85\u529E</label>
<input id="todo-template-text" class="input" name="text" maxlength="500" required placeholder="\u65B0\u5EFA\u5E38\u7528\u5F85\u529E" value="${e(store.draft)}">
<button class="btn" type="submit">\u4FDD\u5B58</button></form><div id="todo-template-editor">${todoTemplateEditor(store)}</div>
<p id="todo-template-feedback" class="form-message" role="alert">${e(store.error)}</p>
<p id="todo-template-status" class="daily-todo-status" role="status"></p>
<ul id="todo-template-items" class="todo-template-items">${todoTemplateRows(store)}</ul>
<details><summary>\u5DF2\u5F52\u6863\u7684\u5E38\u7528\u5F85\u529E</summary><div id="todo-template-archived">${archivedRows(store)}</div></details></div></section>`;
}
function archivedRows(store) {
  if (store.archiveError) return `<p role="status">${e(store.archiveError)}</p>`;
  return (store.archived || []).map((item) => `<div class="todo-template-line"><span>${e(item.text)}</span>
<button class="btn text small" data-action="todo-template-restore-archive" data-id="${e(item.id)}"
${store.pending.has(item.id) ? "disabled" : ""}>\u6062\u590D</button></div>`).join("") || "<p>\u6682\u65E0\u5F52\u6863</p>";
}
function syncTemplateForm(root2, id2, value, pending) {
  const input = $(id2, root2);
  if (!input) return;
  if (input.value !== value) input.value = value;
  input.readOnly = pending;
  const button2 = $("button[type=submit]", input.form);
  if (button2) {
    button2.disabled = pending;
    button2.textContent = "\u4FDD\u5B58";
    button2.setAttribute("aria-busy", String(pending));
  }
}
function paintTodoTemplates() {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState();
  paintInlineTodoTemplates(store);
  const root2 = $("#todo-templates");
  if (!root2) return;
  const editor = $("#todo-template-editor", root2), form = $("#todo-template-edit-form", root2);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
  root2.dataset.loaded = String(store.loaded);
  const create = $("#todo-template-form", root2);
  if (create) create.hidden = Boolean(store.editing);
  syncTemplateForm(root2, "#todo-template-text", store.draft, store.adding);
  syncTemplateForm(root2, "#todo-template-edit-text", store.editDraft, store.pending.has(store.editing?.id));
  for (const [id2, html] of Object.entries({
    "todo-template-items": todoTemplateRows(store),
    "todo-template-feedback": e(store.error),
    "todo-template-status": "",
    "todo-template-archived": archivedRows(store)
  })) {
    const node2 = $("#" + id2, root2);
    if (node2 && node2.innerHTML !== html) node2.innerHTML = html;
  }
}
function templateReadActive(store, owner2, sequence5, version, date) {
  return templateSessionActive(owner2) && store.sequence === sequence5 && version === runtime.renderVersion && state.page === "todos" && date === todoDate();
}
async function loadTodoTemplates({ ensure = false } = {}) {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), date = todoDate(), version = runtime.renderVersion;
  if (ensure && (store.loaded && !store.error && !store.loading || store.loading && store.readDate === date && store.readVersion === version)) return;
  const owner2 = store.owner, sequence5 = ++store.sequence, revision = store.revision;
  store.readDate = date;
  store.readVersion = version;
  store.loading = true;
  store.error = "";
  paintTodoTemplates();
  try {
    const data2 = await api("/todo-templates");
    let archived;
    try {
      archived = await api("/todo-templates?archived=1");
      store.archiveError = "";
    } catch {
      store.archiveError = "\u5F52\u6863\u5217\u8868\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u8054\u7F51\u540E\u91CD\u8BD5\u3002";
    }
    if (!templateReadActive(store, owner2, sequence5, version, date)) return;
    if (revision !== store.revision) return loadTodoTemplates();
    store.items = data2.items;
    if (archived) store.archived = archived.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner2, sequence5, version, date) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateSessionActive(owner2) && store.sequence === sequence5) {
      store.loading = false;
      paintTodoTemplates();
    }
  }
}
async function archiveTodoTemplate(id2, restore = false) {
  const store = templateState(), owner2 = store.owner, item = (restore ? store.archived || [] : store.items).find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  store.pending.add(id2);
  store.revision++;
  store.error = "";
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id2)}/${restore ? "restore" : "archive"}`, { method: "POST", body: { version: item.version } });
    if (!templateSessionActive(owner2)) return;
    if (restore) {
      store.archived = (store.archived || []).filter((row) => row.id !== id2);
      mergeTodoTemplate(saved);
    } else {
      store.items = store.items.filter((row) => row.id !== id2);
      store.archived = [...store.archived || [], saved];
    }
    await loadTodoTemplates();
    await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner2)) store.error = error.status === 404 ? "\u5E38\u7528\u5F85\u529E\u53EF\u80FD\u4ECD\u5728\u540C\u6B65\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" : error.message;
  } finally {
    if (templateSessionActive(owner2)) {
      store.pending.delete(id2);
      store.revision++;
      paintTodoTemplates();
    }
  }
}
function inputTodoTemplate(target) {
  if (target.id === "todo-template-text") templateState().draft = target.value;
  if (target.id === "todo-template-edit-text") templateState().editDraft = target.value;
}
async function templateWriteError(error, store, owner2, editing3 = null) {
  if (!templateSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
  store.error = error.message;
  if (error.status === 409) {
    store.error = "\u8FD9\u9879\u5E38\u7528\u5F85\u529E\u5DF2\u66F4\u65B0\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u4FDD\u5B58\u3002";
    await loadTodoTemplates();
    if (!templateSessionActive(owner2) || !editing3 || store.editing !== editing3) return;
    const latest = store.items.find((item) => item.id === editing3.id);
    if (latest) editing3.version = latest.version;
  }
}
async function submitTodoTemplateForm({ data: data2 }) {
  const store = templateState(), owner2 = store.owner, text = String(data2.text || "").trim();
  if (store.adding || !state.me) return;
  store.draft = String(data2.text || "");
  if (!text || text.length > 500) {
    store.error = "\u8BF7\u586B\u5199 1\u2013500 \u5B57\u7684\u5E38\u7528\u5F85\u529E\u3002";
    paintTodoTemplates();
    return;
  }
  if (!store.create || store.create.text !== text) store.create = { id: crypto.randomUUID(), text };
  store.adding = true;
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const item = await api("/todo-templates", { method: "POST", body: store.create });
    if (!templateSessionActive(owner2)) return;
    mergeTodoTemplate(item);
    store.draft = "";
    store.create = null;
  } catch (error) {
    if (!templateSessionActive(owner2)) return;
    await templateWriteError(error, store, owner2);
    if (!templateSessionActive(owner2)) return;
    if (error.status === 410) {
      store.create = null;
      store.error = "\u8FD9\u4E2A\u6A21\u677F\u5DF2\u88AB\u5220\u9664\uFF0C\u8F93\u5165\u5DF2\u4FDD\u7559\uFF0C\u518D\u6B21\u4FDD\u5B58\u53EF\u65B0\u5EFA\u3002";
    }
  } finally {
    if (templateSessionActive(owner2)) {
      store.adding = false;
      store.revision++;
      paintTodoTemplates();
    }
  }
}
function editTodoTemplate(id2) {
  const store = templateState(), item = store.items.find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  store.editing = { id: id2, version: item.version };
  store.editDraft = item.text;
  store.error = "";
  paintTodoTemplates();
  $("#todo-template-edit-text")?.focus();
}
function cancelTodoTemplateEdit() {
  const store = templateState();
  if (store.pending.has(store.editing?.id)) return;
  store.editing = null;
  store.editDraft = "";
  paintTodoTemplates();
}
async function writeTodoTemplate(id2, text, remove = false) {
  const store = templateState(), owner2 = store.owner, item = store.items.find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  const editing3 = store.editing?.id === id2 ? store.editing : null;
  const version = remove ? item.version : editing3?.version;
  store.pending.add(id2);
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id2)}`, {
      method: remove ? "DELETE" : "PATCH",
      body: remove ? { version } : { text, version }
    });
    if (!templateSessionActive(owner2)) return;
    if (remove) store.items = store.items.filter((row) => row.id !== id2);
    else mergeTodoTemplate(saved);
    if (store.editing?.id === id2) store.editing = null;
    if (remove && state.page === "todos") await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner2)) await templateWriteError(error, store, owner2, editing3);
  } finally {
    if (templateSessionActive(owner2)) {
      store.pending.delete(id2);
      store.revision++;
      paintTodoTemplates();
    }
  }
}
async function submitTodoTemplateEdit({ form, data: data2 }) {
  const store = templateState(), text = String(data2.text || "").trim();
  store.editDraft = String(data2.text || "");
  if (!store.editing || store.editing.id !== form.dataset.id) return;
  if (!text || text.length > 500) {
    store.error = "\u8BF7\u586B\u5199 1\u2013500 \u5B57\u7684\u5E38\u7528\u5F85\u529E\u3002";
    paintTodoTemplates();
    return;
  }
  await writeTodoTemplate(store.editing.id, text);
}
async function useTodoTemplate(id2) {
  const store = templateState(), item = store.items.find((row) => row.id === id2);
  if (item && !templateUnavailable(store, todoDay(), id2)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if (state.page === "todos") void loadTodoTemplates();
}

// local-ui/frontend/web/pages/todo-actions.mjs
init_client();
init_state();
function todoBusy(day3, id2) {
  return day3.updates.has(id2) || day3.removals.has(id2) || day3.templateWrites.has(id2);
}
function todoActionContext({ id: id2, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner2)) return null;
  const day3 = todoDay(date), item = day3.items.find((row) => row.id === id2);
  return item ? { day: day3, item, owner: owner2 } : null;
}
function canOpenTodoMenu({ id: id2, date, anchor }) {
  const context = todoActionContext({ id: id2, date });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id2));
}
function openTodoMenu({ target, id: id2, date, anchor }) {
  date ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id: id2, date, anchor })) return;
  const { item, owner: owner2 } = todoActionContext({ id: id2, date });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id2)}" data-date="${e(date)}" data-owner="${e(owner2)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "\u53D6\u6D88\u5E38\u7528\u5F85\u529E" : "\u6DFB\u52A0\u4E3A\u5E38\u7528\u5F85\u529E";
  popover(trigger, `<button data-action="todo-note" ${attributes}>${item.note ? "\u7F16\u8F91\u5907\u6CE8" : "\u6DFB\u52A0\u5907\u6CE8"}</button>
<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>\u5220\u9664</button>`, { menu: true, label: "\u4E8B\u9879\u64CD\u4F5C" });
}
function openTodoNote(options2) {
  const context = todoActionContext({ ...options2, date: options2.date || options2.target?.dataset.date, owner: options2.owner || options2.target?.dataset.owner });
  if (!context || todoBusy(context.day, context.item.id)) return;
  const { item, day: day3, owner: owner2 } = context;
  openModal("\u5F85\u529E\u5907\u6CE8", `<form id="todo-note-form" data-id="${e(item.id)}" data-date="${e(day3.date)}"
data-owner="${e(owner2)}" data-version="${item.version}"><label for="todo-note-input">\u5907\u6CE8\u6216\u672A\u5B8C\u6210\u539F\u56E0</label>
<textarea id="todo-note-input" class="input" name="note" maxlength="4000" rows="5">${e(item.note || "")}</textarea>
<p class="form-message" role="alert"></p><button class="btn primary" type="submit">\u4FDD\u5B58</button></form>`);
}
async function submitTodoNote({ form, data: data2 }) {
  const context = todoActionContext({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner });
  if (!context) return;
  const button2 = form.querySelector("button[type=submit]"), message = form.querySelector(".form-message");
  if (button2.disabled) return;
  button2.disabled = true;
  message.textContent = "";
  try {
    const saved = await api(`/todos/${encodeURIComponent(context.item.id)}/note`, {
      method: "PATCH",
      body: { note: String(data2.note ?? ""), version: Number(form.dataset.version) }
    });
    if (!todoSessionActive(context.owner)) return;
    mergeTodo(context.day, saved);
    context.day.revision++;
    closeModal();
    paintTodos();
    await loadTodos();
  } catch (error) {
    message.textContent = error.status === 404 ? "\u8FD9\u9879\u5F85\u529E\u53EF\u80FD\u4ECD\u5728\u540C\u6B65\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u5907\u6CE8\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002" : error.message || "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
  } finally {
    button2.disabled = false;
  }
}
function renderTodoUndo(day3) {
  return [...day3.removals.entries()].map(([id2, ticket]) => {
    const label3 = ticket.phase === "deleting" ? "\u5220\u9664\u4E2D\u2026" : ticket.phase === "restoring" ? "\u6062\u590D\u4E2D\u2026" : "\u5DF2\u5220\u9664";
    return `<div class="todo-undo-entry"><span>${label3}\uFF1A${e(ticket.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id2)}" data-date="${e(day3.date)}"
data-owner="${e(todoOwner())}" ${ticket.phase === "ready" ? "" : "disabled"}>\u64A4\u9500</button></div>`;
  }).join("");
}
function expireTodoUndo(day3, id2, ticket, owner2) {
  clearTimeout(ticket.timer);
  ticket.timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day3.removals.get(id2) !== ticket || ticket.phase !== "ready") return;
    day3.removals.delete(id2);
    paintTodos();
  }, 8e3);
  ticket.timer?.unref?.();
}
async function todoActionFailure(day3, error, owner2) {
  if (!todoSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
  day3.error = error.message;
  if ([404, 409].includes(error.status) && day3.date === todoDate()) {
    day3.error = "\u8FD9\u9879\u8BA1\u5212\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u6838\u5BF9\u6700\u65B0\u5185\u5BB9\u540E\u518D\u64CD\u4F5C\u3002";
    await loadTodos();
  }
}
async function deleteTodo(options2) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day3, item, owner: owner2 } = context, ticket = { item, phase: "deleting", timer: null };
  day3.removals.set(item.id, ticket);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day3.date, version: item.version } });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day3, saved);
    ticket.item = saved;
    ticket.phase = "ready";
    expireTodoUndo(day3, item.id, ticket, owner2);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day3.removals.delete(item.id);
    await todoActionFailure(day3, error, owner2);
    if (todoSessionActive(owner2) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day3.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id: id2, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner2)) return;
  const day3 = todoDay(date), ticket = day3.removals.get(id2);
  if (!ticket || ticket.phase !== "ready") return;
  clearTimeout(ticket.timer);
  ticket.phase = "restoring";
  mergeTodo(day3, ticket.item);
  day3.error = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id2)}/restore`, {
      method: "POST",
      body: { date, version: ticket.item.version }
    });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day3, saved);
    day3.removals.delete(id2);
    setTodoNotice(day3, "\u5DF2\u6062\u590D");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    if (error.status === 409) day3.removals.delete(id2);
    else {
      ticket.phase = "ready";
      expireTodoUndo(day3, id2, ticket, owner2);
    }
    await todoActionFailure(day3, error, owner2);
    if (todoSessionActive(owner2) && ticket.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day3.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day3, item) {
  let request = day3.templateLinks.get(item.id);
  if (!request || request.version !== item.version || request.template_version !== (item.template_version || 0)) {
    request = {
      date: day3.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day3.templateLinks.set(item.id, request);
  }
  return request;
}
async function changeTodoTemplate(options2, remove = false) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day3, item, owner: owner2 } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day3.templateWrites.add(item.id);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day3, item)
    });
    if (!todoSessionActive(owner2)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day3, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day3.templateLinks.delete(item.id);
    setTodoNotice(day3, remove ? "\u5DF2\u53D6\u6D88\u5E38\u7528\uFF0C\u4E8B\u9879\u5DF2\u4FDD\u7559" : "\u5DF2\u6DFB\u52A0\u4E3A\u5E38\u7528");
    refreshOpenTodoTemplates();
    if (remove && day3.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner2)) {
      await todoActionFailure(day3, error, owner2);
      if (todoSessionActive(owner2) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day3.templateWrites.delete(item.id);
      day3.revision++;
      paintTodos();
    }
  }
}

// local-ui/frontend/web/pages/todo-preferences.mjs
init_client();
init_state();
function todoPreferences() {
  todoDay();
  return todosState.preferences;
}
function receiveTodoPreferences(mode, version) {
  const prefs = todoPreferences();
  if (!["strike", "hide"].includes(mode) || !Number.isInteger(version) || prefs.pending || version < prefs.version) return;
  prefs.mode = mode;
  prefs.version = version;
  prefs.loaded = true;
}
function todoCompletedMode() {
  const prefs = todoPreferences();
  return prefs.pending || prefs.mode;
}
function renderTodoPreferences() {
  const prefs = todoPreferences(), mode = todoCompletedMode();
  return `<div class="todo-list-options"><label for="todo-completed-mode">\u5B8C\u6210\u540E</label>
<select id="todo-completed-mode" class="input" ${prefs.pending || !prefs.loaded ? "disabled" : ""}>
<option value="strike" ${mode === "strike" ? "selected" : ""}>\u5212\u7EBF\u663E\u793A</option>
<option value="hide" ${mode === "hide" ? "selected" : ""}>\u9690\u85CF\u5DF2\u5B8C\u6210</option></select>
<p id="todo-preferences-error" class="form-message" role="alert">${e(prefs.error)}</p></div>`;
}
function paintTodoPreferences() {
  const input = $("#todo-completed-mode"), prefs = todoPreferences();
  if (!input) return;
  input.value = todoCompletedMode();
  input.disabled = Boolean(prefs.pending) || !prefs.loaded;
  const error = $("#todo-preferences-error");
  if (error) error.textContent = prefs.error;
}
async function loadTodoPreferences(context) {
  const prefs = todoPreferences(), owner2 = todoOwner();
  try {
    const saved = await api("/todo-preferences", { context });
    if (!todoSessionActive(owner2)) return;
    receiveTodoPreferences(saved.completed_mode, saved.version);
    prefs.error = "";
  } catch (error) {
    if (todoSessionActive(owner2) && !isRequestAbort(error) && !error.staleSession) prefs.error = error.message;
  } finally {
    if (todoSessionActive(owner2)) paintTodoPreferences();
  }
}
async function changeTodoCompletedMode(mode) {
  if (!state.me || !(state.page === "todos" || state.page === "settings" && state.settingsTab === "todo") || !["strike", "hide"].includes(mode)) return;
  const prefs = todoPreferences(), owner2 = todoOwner();
  if (prefs.pending || !prefs.loaded || mode === prefs.mode) {
    paintTodoPreferences();
    return;
  }
  prefs.pending = mode;
  prefs.error = "";
  paintTodos();
  paintTodoPreferences();
  try {
    const saved = await api("/todo-preferences", { method: "PATCH", body: { completed_mode: mode, version: prefs.version } });
    if (!todoSessionActive(owner2)) return;
    prefs.mode = saved.completed_mode;
    prefs.version = saved.version;
  } catch (error) {
    if (!todoSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
    prefs.error = error.message;
    if (error.status === 409) {
      try {
        const latest = await api("/todo-preferences");
        if (!todoSessionActive(owner2)) return;
        prefs.mode = latest.completed_mode;
        prefs.version = latest.version;
        prefs.error = "\u663E\u793A\u65B9\u5F0F\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u9009\u62E9\u3002";
      } catch (readError) {
        if (todoSessionActive(owner2) && !isRequestAbort(readError) && !readError.staleSession) prefs.error = readError.message;
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      prefs.pending = null;
      paintTodos();
      paintTodoPreferences();
    }
  }
}

// local-ui/frontend/web/pages/todos.mjs
init_runtime();
var todoClock = null;
var monthSnapshot = { month: "", owner: "", days: /* @__PURE__ */ new Map(), loading: false, error: "" };
var calendarStatus = "all";
var savingTimes = /* @__PURE__ */ new WeakMap();
var savingTimers = /* @__PURE__ */ new WeakMap();
var todoObservers = /* @__PURE__ */ new Set();
var monthDayOwners = /* @__PURE__ */ new WeakMap();
function monthOwner() {
  const offline = getOfflineRuntime();
  return JSON.stringify([todoOwner(), offline?.state.scope || null]);
}
var monthLoader = createTodoMonthLoader({
  read: (date, context) => api(`/todos?date=${encodeURIComponent(date)}`, { context }),
  active: (owner2) => owner2 === monthOwner() && todoSessionActive(todoOwner()),
  async seed(month, owner2, { refresh = false } = {}) {
    const loaded = [];
    if (todosState.owner === todoOwner()) for (const [date, day3] of todosState.days) {
      const stamp = monthDayOwners.get(day3);
      if (date.startsWith(month + "-") && day3.loaded && stamp?.owner === owner2 && (!refresh || todoPending(day3))) {
        loaded.push({ date, items: monthDayItems(day3), readAt: stamp.at, pending: todoPending(day3) });
      }
    }
    const offline = getOfflineRuntime(), scope = offline?.state.scope;
    if (!scope || offline.state.verifiedScope !== scope) return todoMonthSeed(month, null, loaded);
    let snapshot = null;
    try {
      snapshot = await offline.readTodoMonthSnapshot?.(month);
    } catch {
    }
    if (owner2 !== monthOwner() || !todoSessionActive(todoOwner()) || offline.state.scope !== scope || offline.state.verifiedScope !== scope) return {};
    return todoMonthSeed(month, snapshot, loaded);
  },
  changed(snapshot) {
    if (monthSnapshot !== snapshot || !todosVisible()) return;
    const node2 = $("#todo-calendar");
    if (node2) {
      node2.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    }
  }
});
function observeTodoChanges(callback) {
  todoObservers.add(callback);
  return () => todoObservers.delete(callback);
}
function notifyTodoChanges() {
  for (const callback of todoObservers) callback();
}
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today = date === bjtDate(), active2 = date === selected;
  const items = (monthSnapshot.month === date.slice(0, 7) && monthSnapshot.owner === monthOwner() ? monthSnapshot.days.get(date) || [] : []).filter((item) => !item.deleted_at);
  const shown = items.filter((item) => calendarStatus === "all" || Boolean(item.completed) === (calendarStatus === "done"));
  const content = shown.slice(0, 4).map((item) => `<span class="todo-calendar-task${item.completed ? " is-complete" : ""}">${item.completed ? "\u2713" : "\u25CB"} ${e(item.text)}</span>`).join("");
  const more = shown.length > 4 ? `<span class="todo-calendar-more">\u8FD8\u6709 ${shown.length - 4} \u9879</span>` : "";
  return `<button class="todo-calendar-day${active2 ? " is-selected" : ""}${today ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active2}"
${today ? 'aria-current="date"' : ""}><span class="todo-calendar-day-head"><strong>${Number(date.slice(-2))}</strong><small>${monthSnapshot.owner === monthOwner() && monthSnapshot.month === date.slice(0, 7) && monthSnapshot.days.has(date) ? shown.length + " \u9879" : ""}</small></span>${content}${more}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const cells = [...Array(blanks).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const index = Math.max(0, cells.indexOf(date));
  const weekIndex = Math.floor(index / 7);
  const visible3 = todosState.calendarView === "week" ? cells.slice(weekIndex * 7, weekIndex * 7 + 7) : cells;
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7).filter(Boolean));
  const all = [...monthSnapshot.days.values()].flat().filter((item) => !item.deleted_at), done = all.filter((item) => item.completed).length;
  const currentSnapshot = monthSnapshot.month === month && monthSnapshot.owner === monthOwner();
  const activeDays = [...monthSnapshot.days.values()].filter((items) => items.some((item) => !item.deleted_at)).length;
  const stats = !currentSnapshot || monthSnapshot.loading ? `<p class="todo-calendar-loading" role="status">\u6B63\u5728\u8BFB\u53D6\u672C\u6708\u5F85\u529E\u2026</p>` : monthSnapshot.error ? `<p role="alert">\u90E8\u5206\u65E5\u671F\u672A\u52A0\u8F7D\uFF1A${e(monthSnapshot.error)} <button class="btn text small" type="button" data-todo-calendar-retry>\u91CD\u8BD5\u7F3A\u5931\u65E5\u671F</button></p>` : `<div class="todo-calendar-stats">${[["\u603B\u4EFB\u52A1", all.length], ["\u5DF2\u5B8C\u6210", done], ["\u672A\u5B8C\u6210", all.length - done], ["\u6D3B\u8DC3\u5929\u6570", activeDays], ["\u5B8C\u6210\u7387", `${all.length ? Math.round(done / all.length * 100) : 0}%`]].map(([label3, value]) => `<span><small>${label3}</small><strong>${value}</strong></span>`).join("")}</div>`;
  return `<aside class="todo-calendar-sidebar"><label for="todo-calendar-month-input">\u6708\u4EFD</label><input id="todo-calendar-month-input" type="month" class="input" data-todo-calendar-month value="${e(month)}">
<label for="todo-calendar-week">\u5468\u65E5\u671F</label><select id="todo-calendar-week" class="input" data-todo-calendar-week>${weeks.map((week, i) => `<option value="${week[0]}" ${i === weekIndex ? "selected" : ""}>${week[0].slice(5)} \u2014 ${week.at(-1).slice(5)}</option>`).join("")}</select>
<label for="todo-calendar-status">\u4EFB\u52A1\u72B6\u6001</label><select id="todo-calendar-status" class="input" data-todo-calendar-status><option value="all" ${calendarStatus === "all" ? "selected" : ""}>\u5168\u90E8\u4EFB\u52A1</option><option value="open" ${calendarStatus === "open" ? "selected" : ""}>\u672A\u5B8C\u6210</option><option value="done" ${calendarStatus === "done" ? "selected" : ""}>\u5DF2\u5B8C\u6210</option></select></aside>
<div class="todo-calendar-main"><div class="todo-calendar-head"><div class="todo-calendar-navigation"><button class="icon-button" type="button" data-action="todo-calendar-prev" aria-label="\u4E0A\u4E00${todosState.calendarView === "week" ? "\u5468" : "\u6708"}" ${month === "0001-01" ? "disabled" : ""}>\u2039</button><span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}\u5E74${Number(month.slice(5))}\u6708</span><button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="\u4E0B\u4E00${todosState.calendarView === "week" ? "\u5468" : "\u6708"}" ${month === "9999-12" ? "disabled" : ""}>\u203A</button><button class="btn" type="button" data-action="todo-today">\u4ECA\u5929</button></div><div class="todo-calendar-views"><button type="button" class="btn" data-todo-calendar-view="week" aria-pressed="${todosState.calendarView === "week"}">\u5468</button><button type="button" class="btn" data-todo-calendar-view="month" aria-pressed="${todosState.calendarView !== "week"}">\u6708</button></div></div>${stats}
<div class="todo-calendar-scroll"><div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((day3) => `<span class="todo-calendar-weekday" aria-hidden="true">\u5468${day3}</span>`).join("")}
${visible3.map((day3) => day3 ? todoCalendarDay(day3, date) : '<span class="todo-calendar-blank" aria-hidden="true"></span>').join("")}</div></div></div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day3 = todoDay(), month = todoCalendarMonth(day3.date);
  if (todosState.calendarView === "week") {
    const anchor = day3.date.startsWith(month) ? day3.date : `${month}-01`;
    const weekDate = /* @__PURE__ */ new Date(`${anchor}T00:00:00Z`);
    weekDate.setUTCDate(weekDate.getUTCDate() + offset * 7);
    const next2 = weekDate.toISOString().slice(0, 10);
    if (validTodoDate(next2)) selectTodoDate(next2);
    return;
  }
  const date = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const nextMonth = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${nextMonth}-01`)) return;
  todosState.calendarMonth = nextMonth;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day3.date);
  void loadTodoMonth(nextMonth);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today = bjtDate();
  if (!calendar) return;
  if (!calendar.dataset.viewBound) {
    calendar.addEventListener("click", (event) => {
      const retry = event.target.closest("[data-todo-calendar-retry]");
      if (retry) {
        void loadTodoMonth(todoCalendarMonth(todoDay().date));
        return;
      }
      const button2 = event.target.closest("[data-todo-calendar-view]");
      if (!button2) return;
      todosState.calendarView = button2.dataset.todoCalendarView;
      calendar.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    });
    calendar.addEventListener("change", (event) => {
      if (event.target.matches("[data-todo-calendar-status]")) {
        calendarStatus = event.target.value;
        calendar.dataset.month = "";
        paintTodoCalendar(todoDay().date);
        return;
      }
      if (event.target.matches("[data-todo-calendar-week]")) {
        selectTodoDate(event.target.value);
        return;
      }
      if (!event.target.matches("[data-todo-calendar-month]")) return;
      const month2 = event.target.value;
      if (!validTodoDate(`${month2}-01`)) return;
      todosState.calendarMonth = month2;
      calendar.dataset.month = "";
      paintTodoCalendar(todoDay().date);
      void loadTodoMonth(month2);
    });
    calendar.dataset.viewBound = "true";
  }
  if (calendar.dataset.month === month && calendar.dataset.today === today) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
async function loadTodoMonth(month) {
  const snapshot = monthLoader.open(month, monthOwner());
  monthSnapshot = snapshot;
  if (todosVisible()) {
    const node2 = $("#todo-calendar");
    if (node2) {
      node2.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    }
  }
  await snapshot.promise;
}
function todoRow(item, day3) {
  const pending = todoBusy(day3, item.id);
  const completed = day3.updates.has(item.id) ? day3.updates.get(item.id) : item.completed;
  const removal = day3.removals.get(item.id), deleted = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted || completed && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day3.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day3.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>
${item.note ? `<p class="todo-note-text">\u5907\u6CE8\uFF1A${e(item.note)}</p>` : ""}

<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day3.date)}"
aria-label="\u4E8B\u9879\u64CD\u4F5C" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>\u22EF</button></li>`;
}
function todoForm(day3) {
  const label3 = day3.date === bjtDate() ? "\u4ECA\u5929\u60F3\u5B8C\u6210\u4EC0\u4E48\uFF1F" : "\u8FD9\u4E00\u5929\u7684\u8BA1\u5212";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day3.date)}" aria-label="\u6DFB\u52A0 ${e(day3.date)} \u7684\u8BA1\u5212">
<label for="todo-text" class="sr-only">${label3}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label3}" value="${e(day3.draft)}" >
<button class="btn primary" type="submit" ${day3.adding ? "disabled" : ""}>\u6DFB\u52A0</button></form>`;
}
function todoCaption(day3) {
  const today = day3.date === bjtDate();
  return `<time datetime="${e(day3.date)}" title="\u5317\u4EAC\u65F6\u95F4">${today ? "\u4ECA\u5929 \xB7 " : ""}${e(day3.date)}</time>`;
}
function floatingTodoSupported() {
  return typeof window !== "undefined" && typeof window.documentPictureInPicture?.requestWindow === "function";
}
function floatingTodoControl() {
  return `<div class="todo-floating-control"><button class="btn todo-floating-open" type="button" data-action="todo-floating" ${floatingTodoSupported() ? "" : "disabled"}>\u684C\u9762\u4FBF\u7B7E</button>
${floatingTodoSupported() ? "" : '<span class="todo-floating-support" role="status">\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u7F6E\u9876\u4FBF\u7B7E</span>'}</div>`;
}
function todoHeading(day3) {
  const selected = state.todoPanel || "today";
  return `<span id="todo-caption" hidden>${todoCaption(day3)}</span><nav class="todo-page-tabs" aria-label="\u5F85\u529E\u9875\u9762">
${[["today", "\u4ECA\u65E5"], ["future", "\u672A\u6765\u5F85\u529E"], ["history", "\u65E5\u5386"], ["templates", "\u5E38\u7528"]].map(([panel, label3]) => `<button class="btn todo-page-tab" type="button" data-action="todo-panel" data-panel="${panel === "today" ? "" : panel}"
  aria-current="${selected === panel ? "page" : "false"}" ${panel === "templates" ? 'aria-label="\u7BA1\u7406\u5E38\u7528"' : ""}>${label3}</button>`).join("")}</nav>
<div id="todo-floating-toolbar" ${state.todoPanel === "templates" ? "hidden" : ""}>${floatingTodoControl()}</div>`;
}
function renderTodoHistory(day3) {
  return `<section id="todo-history" class="todo-view" aria-label="\u5F85\u529E\u65E5\u5386" ${state.todoPanel === "history" ? "" : "hidden"}>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day3.date)}" data-today="${bjtDate()}">
${todoCalendar(day3.date)}</div></section>`;
}
function paintTodoPanels(root2) {
  const panel = state.todoPanel || "";
  for (const [id2, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"], ["todo-future", "future"]]) {
    const node2 = $("#" + id2, root2);
    if (node2) node2.hidden = id2 === "todo-main" ? ["templates", "future"].includes(panel) : panel !== value;
  }
  const floatingToolbar = $("#todo-floating-toolbar", root2);
  if (floatingToolbar) floatingToolbar.hidden = panel === "templates";
  root2?.querySelectorAll('[data-action="todo-panel"]').forEach((button2) => {
    button2.setAttribute("aria-current", button2.dataset.panel === panel ? "page" : "false");
  });
}
async function setTodoPanel(panel) {
  if (!todosVisible()) return;
  state.todoPanel = ["history", "templates", "future"].includes(panel) ? panel : "";
  if (state.todoPanel !== "history") monthLoader.cancel();
  if (!state.todoPanel) state.todoDate = "";
  updateRoute(true);
  paintTodos();
  if (state.todoPanel === "future") await loadUnscheduledTodos();
  else {
    await loadTodos();
    if (state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(todoDay().date));
  }
  const selector = state.todoPanel === "future" ? "#todo-future-text" : state.todoPanel ? state.todoPanel === "history" ? "#todo-calendar-month-input" : "#todo-template-text" : "#todo-text";
  $(selector)?.focus();
}
function todoPending(day3) {
  return Boolean(day3.adding || day3.updates.size || day3.templateWrites.size || [...day3.removals.values()].some((ticket) => ticket.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day3) {
  if (todoPending(day3) || day3.error || todoPreferences().error) return "";
  return day3.loading && !day3.loaded ? "" : day3.notice;
}
function paintTodoSaving(root2, day3) {
  const busy = todoPending(day3);
  root2.setAttribute("aria-busy", String(busy));
  if (!busy) {
    clearTimeout(savingTimers.get(day3));
    savingTimers.delete(day3);
    savingTimes.delete(day3);
    return;
  }
  if (!savingTimes.has(day3)) {
    savingTimes.set(day3, Date.now());
    savingTimers.set(day3, setTimeout(() => {
      if (todosVisible() && todoDay() === day3) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day3) >= 900) $("#todo-status", root2).textContent = "\u6B63\u5728\u540C\u6B65\u2026";
}
function pendingTodo(day3) {
  return day3.adding && day3.submitting ? `<li class="todo-pending-row" aria-label="\u5F85\u6DFB\u52A0">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day3.submitting.text)}</span></li>` : "";
}
function todoFeedback(day3) {
  const error = [day3.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day3.failedCreate ? `<span>\u300C${e(day3.failedCreate.text)}\u300D</span>
<button class="btn text small" data-action="todo-retry-add">\u91CD\u8BD5\u6DFB\u52A0</button>` : ""} <button class="btn text small" data-action="todo-reload">\u91CD\u65B0\u8BFB\u53D6</button>` : "";
}
function todoHistoryEmpty(day3) {
  return state.todoPanel === "history" && day3.loaded && !day3.items.some((item) => !item.deleted_at) ? "\u8FD9\u4E00\u5929\u8FD8\u6CA1\u6709\u5F85\u529E\u3002" : "";
}
function renderTodos() {
  const day3 = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day3.date)}" aria-label="\u6BCF\u65E5\u8BA1\u5212">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day3)}</div>
${renderTodoHistory(day3)}<div id="todo-main" ${["templates", "future"].includes(state.todoPanel) ? "hidden" : ""}><div id="todo-form-top"></div>${state.todoPanel === "history" ? "" : todoForm(day3)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day3)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day3)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day3)}</div>
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day3)}</p>
<ul id="todo-items" class="daily-todo-items">${day3.items.map((item) => todoRow(item, day3)).join("")}${pendingTodo(day3)}</ul><div id="todo-form-bottom"></div>${state.todoPanel === "history" ? todoForm(day3) : ""}</div>
${renderTodoTemplates(floatingTodoControl())}${renderUnscheduledTodos()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function monthDayItems(day3) {
  return day3.items.filter((item) => {
    const removal = day3.removals.get(item.id);
    return !removal || removal.phase === "restoring";
  }).map((item) => day3.updates.has(item.id) ? { ...item, completed: day3.updates.get(item.id) } : item);
}
function paintTodos() {
  notifyTodoChanges();
  const root2 = $("#daily-todos");
  if (!root2 || !todosVisible()) return;
  const day3 = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const stamp = monthDayOwners.get(day3);
  if (day3.loaded && stamp?.owner === monthOwner()) {
    if (stamp.revision !== day3.revision) {
      stamp.at = Date.now();
      stamp.revision = day3.revision;
    }
    if (monthLoader.update(monthOwner(), day3.date, monthDayItems(day3))) {
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
  }
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root2.dataset.date !== day3.date) {
    root2.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const form = $("#todo-form", root2), formSlot = $(state.todoPanel === "history" ? "#todo-form-bottom" : "#todo-form-top", root2);
  if (form && formSlot && formSlot.nextElementSibling !== form) formSlot.after(form);
  const parts2 = {
    "todo-caption": todoCaption(day3),
    "todo-status": todoStatus(day3),
    "todo-undo": renderTodoUndo(day3),
    "todo-items": day3.items.map((item) => todoRow(item, day3)).join("") + pendingTodo(day3),
    "todo-feedback": todoFeedback(day3),
    "todo-history-empty": todoHistoryEmpty(day3)
  };
  for (const [id2, html] of Object.entries(parts2)) {
    const node2 = $("#" + id2, root2);
    if (node2 && node2.innerHTML !== html) node2.innerHTML = html;
  }
  paintTodoCalendar(day3.date);
  const input = $("#todo-text", root2), button2 = $("#todo-form button[type=submit]", root2);
  const prompt = day3.date === bjtDate() ? "\u4ECA\u5929\u60F3\u5B8C\u6210\u4EC0\u4E48\uFF1F" : "\u8FD9\u4E00\u5929\u7684\u8BA1\u5212", label3 = $('label[for="todo-text"]', root2);
  if (input && input.value !== day3.draft) input.value = localEditorPaintValue(input, day3.draft);
  if (input) {
    input.readOnly = false;
    input.placeholder = prompt;
  }
  if (label3) label3.textContent = prompt;
  if (button2) {
    button2.disabled = day3.adding;
    button2.textContent = "\u6DFB\u52A0";
    button2.setAttribute("aria-busy", String(day3.adding));
  }
  paintTodoSaving(root2, day3);
  paintTodoPanels(root2);
  paintUnscheduledTodos();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root2) || $("[data-todo-id]", root2) || $("#todo-text", root2))?.focus();
  paintTodoTemplates();
}
function todoReadActive(owner2, version, date, day3, sequence5) {
  return todoSessionActive(owner2) && version === runtime.renderVersion && todoDate() === date && day3.sequence === sequence5 && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  if (context?.controller?.signal) {
    context.controller.signal.addEventListener("abort", () => monthLoader.cancel(), { once: true });
  }
  if (state.todoPanel === "future") {
    await loadUnscheduledTodos();
    return;
  }
  void loadTodoTemplates({ ensure: true });
  const day3 = todoDay(), date = day3.date, owner2 = todoOwner(), priorScope = getOfflineRuntime()?.state.scope || null, version = runtime.renderVersion;
  const sequence5 = ++day3.sequence, revision = day3.revision;
  day3.loading = true;
  day3.error = "";
  paintTodos();
  try {
    const data2 = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner2, version, date, day3, sequence5) || priorScope && priorScope !== getOfflineRuntime()?.state.scope) return;
    if (day3.revision !== revision) return loadTodos(context);
    receiveTodoPreferences(data2.completed_mode, data2.preferences_version);
    day3.items = data2.items;
    day3.loaded = true;
    monthDayOwners.set(day3, { owner: monthOwner(), at: Date.now(), revision: day3.revision });
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === date.slice(0, 7) && !monthSnapshot.loading) {
      monthSnapshot.days.set(date, data2.items);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner2, version, date, day3, sequence5) && !isRequestAbort(error) && !error.staleSession) day3.error = error.message;
  } finally {
    if (todoSessionActive(owner2) && day3.sequence === sequence5) {
      const visible3 = todoReadActive(owner2, version, date, day3, sequence5);
      day3.loading = false;
      paintTodos();
      if (visible3 && state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(date));
      if (!visible3 && todoObservers.size && date === bjtDate()) void loadFloatingToday();
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) {
    todoDay(date).draft = target.value;
    notifyTodoChanges();
  }
}
function showTodoFailure(day3, error) {
  if (!isRequestAbort(error) && !error.staleSession) day3.error = error.message;
}
function setTodoNotice(day3, text) {
  const owner2 = todoOwner(), version = ++day3.noticeVersion;
  day3.notice = text;
  const timer2 = setTimeout(() => {
    if (!todoSessionActive(owner2) || day3.noticeVersion !== version) return;
    day3.notice = "";
    if (day3.date === todoDate()) paintTodos();
  }, 2500);
  timer2?.unref?.();
}
async function saveTodo(day3, request, templateId = "") {
  const owner2 = todoOwner(), submittedDraft = day3.draft;
  const localDraftSnapshot = templateId ? null : localComposerRequestSnapshot(request, "todo", day3.date);
  day3.adding = true;
  day3.submitting = request;
  day3.failedCreate = null;
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request, localDraftSnapshot });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day3, item);
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === day3.date.slice(0, 7)) {
      monthSnapshot.days.set(day3.date, [...day3.items]);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (templateId) day3.templateCreates.delete(templateId);
    else {
      if (localComposerUnchanged(localDraftSnapshot) && day3.draft === submittedDraft && submittedDraft.trim() === request.text) day3.draft = "";
      day3.create = null;
    }
    setTodoNotice(day3, "\u5DF2\u6DFB\u52A0");
  } catch (error) {
    if (todoSessionActive(owner2)) {
      day3.failedCreate = request;
      showTodoFailure(day3, error);
      if (error.status === 410) {
        if (templateId) day3.templateCreates.delete(templateId);
        else day3.create = null;
        day3.error = "\u539F\u4E8B\u9879\u5DF2\u88AB\u5220\u9664\uFF0C\u8F93\u5165\u5DF2\u4FDD\u7559\uFF0C\u53EF\u518D\u6B21\u6DFB\u52A0\u3002";
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day3.adding = false;
      day3.submitting = null;
      day3.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day3 = todoDay();
  if (todosVisible() && day3.failedCreate && !day3.adding)
    await saveTodo(day3, day3.failedCreate, day3.failedCreate.template_id || "");
}
async function submitTodo({ form, data: data2 }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day3 = todoDay(form.dataset.date), text = String(data2.text || "").trim();
  if (day3.adding) return;
  day3.draft = String(data2.text || "");
  if (day3.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day3.error = "\u8BF7\u586B\u5199 1\u2013500 \u5B57\u7684\u8BA1\u5212\u3002";
    paintTodos();
    return;
  }
  if (!day3.create || day3.create.text !== text) day3.create = { id: crypto.randomUUID(), date: day3.date, text };
  await saveTodo(day3, day3.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day3 = todoDay();
  if (day3.adding || todoTemplateAdded(day3, template.id)) return;
  let request = day3.templateCreates.get(template.id);
  if (!request || request.text !== template.text) {
    request = { id: crypto.randomUUID(), date: day3.date, text: template.text, template_id: template.id };
    day3.templateCreates.set(template.id, request);
  }
  await saveTodo(day3, request, template.id);
}
async function toggleTodo(target, { floating = false } = {}) {
  if (!(floating ? Boolean(state.me) : todosVisible())) return;
  const day3 = todoDay(target.dataset.date), owner2 = todoOwner();
  const item = day3.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day3.date !== (floating ? bjtDate() : todoDate())) return;
  if (todoBusy(day3, item.id)) {
    target.checked = day3.updates.has(item.id) ? day3.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day3.updates.set(item.id, completed);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner2)) {
      mergeTodo(day3, updated);
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day3.updates.set(item.id, item.completed);
    showTodoFailure(day3, error);
    if (error.status === 409 && (floating || day3.date === todoDate())) {
      day3.error = "\u8FD9\u9879\u8BA1\u5212\u5DF2\u66F4\u65B0\uFF0C\u5DF2\u91CD\u65B0\u8BFB\u53D6\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\u3002";
      if (floating) {
        await loadFloatingToday();
        if (todoSessionActive(owner2)) day3.error = "\u8FD9\u9879\u8BA1\u5212\u5DF2\u66F4\u65B0\uFF0C\u5DF2\u91CD\u65B0\u8BFB\u53D6\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\u3002";
      } else await loadTodos();
      if (todoSessionActive(owner2) && item.template_id) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day3.updates.delete(item.id);
      day3.revision++;
      paintTodos();
    }
  }
}
async function loadFloatingToday() {
  if (!state.me) return;
  const date = bjtDate(), day3 = todoDay(date), owner2 = todoOwner();
  const sequence5 = ++day3.sequence, revision = day3.revision;
  const current3 = () => todoSessionActive(owner2) && date === bjtDate() && day3.sequence === sequence5;
  day3.loading = true;
  day3.error = "";
  paintTodos();
  try {
    const data2 = await api(`/todos?date=${encodeURIComponent(date)}`);
    if (!current3()) return;
    if (day3.revision !== revision) {
      void loadFloatingToday();
      return;
    }
    receiveTodoPreferences(data2.completed_mode, data2.preferences_version);
    day3.items = data2.items;
    day3.loaded = true;
  } catch (error) {
    if (current3() && !isRequestAbort(error) && !error.staleSession) day3.error = error.message;
  } finally {
    if (current3()) {
      day3.loading = false;
      paintTodos();
    }
  }
}
function selectTodoDate(date) {
  if (!validTodoDate(date) || state.page !== "todos") return;
  state.todoDate = date;
  todosState.calendarDate = date;
  todosState.calendarMonth = date.slice(0, 7);
  updateRoute(true);
  paintTodos();
  loadTodos();
}
function moveTodoDate(offset) {
  const date = /* @__PURE__ */ new Date(`${todoDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  selectTodoDate(date.toISOString().slice(0, 10));
}
function refreshTodos() {
  if (!todosVisible()) return;
  todoDay().error = "";
  todoPreferences().error = "";
  loadTodos();
}
function checkTodoDay() {
  if (!state.me || !syncTodoDay() || !todosVisible()) return;
  paintTodos();
  refreshOpenTodoTemplates();
  loadTodos();
}
function scheduleTodoClock() {
  clearTimeout(todoClock);
  const midnight = Date.parse(`${bjtDate()}T00:00:00+08:00`) + 864e5;
  todoClock = setTimeout(() => {
    checkTodoDay();
    scheduleTodoClock();
  }, Math.max(20, Math.min(6e4, midnight - Date.now() + 20)));
  todoClock?.unref?.();
}
function registerTodosClock() {
  onOfflineRuntime((offline) => {
    let previousReady;
    offline.subscribe(() => {
      const ready = Boolean(offline.state.scope && offline.state.verifiedScope === offline.state.scope);
      const action = todoMonthScopeTransition(monthSnapshot.owner, monthOwner(), previousReady, ready);
      previousReady = ready;
      if (!todosVisible() || state.todoPanel !== "history" || action === "none") return;
      monthLoader.cancel();
      const month = todoCalendarMonth(todoDay().date);
      if (action.startsWith("replace")) {
        monthSnapshot = { month, owner: monthOwner(), days: /* @__PURE__ */ new Map(), loading: false, error: "" };
      } else if (action === "pause") {
        monthSnapshot.loading = false;
        monthSnapshot.error = "\u8EAB\u4EFD\u8303\u56F4\u6682\u672A\u6838\u5B9E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
      }
      const node2 = $("#todo-calendar");
      if (node2) {
        node2.dataset.month = "";
        paintTodoCalendar(todoDay().date);
      }
      if (ready) void loadTodoMonth(month);
    });
  });
  window.addEventListener("haoduoyu-todos-reset", () => monthLoader.cancel());
  window.addEventListener("focus", checkTodoDay);
  document.addEventListener("visibilitychange", checkTodoDay);
  scheduleTodoClock();
}

// local-ui/frontend/web/core/notes-editor-view.mjs
var attentionPhases = ["unknown", "conflict", "oversize", "error"];
function noteDraftNeedsAttention(item) {
  return Boolean(item && (item.dirty || item.pending || attentionPhases.includes(item.phase)));
}
function noteEditorCanCollapse(item) {
  return Boolean(item && item.loaded && !item.loading && !item.composing && !noteDraftNeedsAttention(item) && (item.version > 0 || item.localBacked && item.localVersion > 0 || item.phase === "empty" && !item.draft.trim()));
}
function createNotesEditorView() {
  const views = /* @__PURE__ */ new Map();
  const page2 = (category, date) => {
    const key2 = category + ":" + date;
    if (!views.has(key2)) views.set(key2, { active: "", revision: 0, collapseRequested: false, explicit: false });
    return views.get(key2);
  };
  function activate(category, date, key2) {
    const view2 = page2(category, date);
    view2.active = key2;
    view2.revision++;
    view2.collapseRequested = false;
    view2.explicit = false;
    return view2;
  }
  function requestCollapse(category, date, key2, revision, { explicit = false } = {}) {
    const view2 = page2(category, date);
    if (view2.active !== key2 || view2.revision !== revision) return;
    view2.collapseRequested = true;
    view2.explicit = explicit;
  }
  function sync(category, date, items, legacy, { focused = false, composing = false } = {}) {
    const view2 = page2(category, date), item = view2.active === "legacy" ? legacy : items.find((value) => value.id === view2.active);
    if (view2.active && !item) activate(category, date, "");
    else if (view2.collapseRequested && (noteEditorCanCollapse(item) || view2.explicit && item && !item.pending) && !composing && (!focused || view2.explicit)) {
      activate(category, date, "");
    }
    return view2;
  }
  const clear = () => views.clear();
  return { page: page2, activate, requestCollapse, sync, clear };
}

// local-ui/frontend/web/offline/document.mjs
var documents = /* @__PURE__ */ new WeakMap();
var isLocalDocument = (value) => Boolean(value && documents.has(value));
var documentValue = (value) => documents.get(value)?.local || value;
var documentState = (value) => documents.get(value) || null;

// local-ui/frontend/web/core/note-entries-state.mjs
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var blocked = (item) => ["conflict", "unknown"].includes(item.phase);
var timestamp2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var noteValue = (value) => isLocalDocument(value) ? documentValue(value) : value;
var persistedVersion = (item) => item.localBacked ? item.localVersion : item.version;
var savedText = (item) => item.localBacked ? item.durableText : item.serverText;
var savedPhase = (item) => item.localBacked ? item.localQueued ? "queued" : "cached" : item.version ? "saved" : "empty";
var labelsOf = (value) => Array.isArray(value?.labels) ? value.labels : value?.label ? [value.label] : [];
var equalLabels = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
var validLabels = (labels2) => Array.isArray(labels2) && labels2.every(validNoteLabel) && new Set(labels2).size === labels2.length;
var validLegacyLabels = (labels2, category) => validLabels(labels2) && (category === "life" || labels2.length === 0) && labels2.every(validCustomNoteLabel);
var localFailure = (error) => error.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error.code || "");
function validNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validCustomNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value) && !["\u751F\u6D3B", "\u5DE5\u4F5C"].includes(value);
}
function checkedLocalDocument(value, category, date, id2) {
  const { local, server } = documentState(value);
  if (!local || !uuidPattern.test(local.id) || id2 && local.id !== id2 || local.category !== category || local.date !== date || typeof local.text !== "string" || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== "boolean" || typeof local.can_edit !== "boolean" || local.label != null && (category !== "life" || !validCustomNoteLabel(local.label))) throw new Error("\u672C\u673A\u8BB0\u5F55\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002");
  if (server) checkedEntry(server, category, date, local.id);
  return value;
}
function checkedEntry(value, category, date, id2) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date, id2);
  if (!value || !uuidPattern.test(value.id) || id2 && value.id !== id2 || value.category !== category || value.date !== date || typeof value.text !== "string" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || !timestamp2(value.created_at) || !timestamp2(value.updated_at) || typeof value.content_hash !== "string" || !value.content_hash || [2, 3].includes(value.labels_version) && !Array.isArray(value.labels) || value.labels !== void 0 && !(value.labels_version === 3 ? validLabels(value.labels) : validLegacyLabels(value.labels, category)) || value.label != null && (category !== "life" || !validCustomNoteLabel(value.label))) {
    throw new Error("\u8BB0\u5F55\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
  }
  return value;
}
function checkedCollection(value, category, date) {
  if (!value || value.category !== category || value.date !== date || !Array.isArray(value.entries) || value.entries.length > 200 || typeof value.can_edit !== "boolean") throw new Error("\u8BB0\u5F55\u5217\u8868\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
  const ids = /* @__PURE__ */ new Set();
  for (const raw of value.entries) {
    checkedEntry(raw, category, date);
    const entry = noteValue(raw);
    if (entry.deleted || ids.has(entry.id)) throw new Error("\u8BB0\u5F55\u5217\u8868\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
    ids.add(entry.id);
  }
  return value;
}
function createEntriesContext({
  category,
  load,
  loadEntry,
  loadOperation,
  put,
  remove,
  restore,
  loadVerified,
  onChange = () => {
  },
  onSaved = () => {
  },
  discardUnsent = async () => {
  },
  prepareDelete = async () => null,
  finishDelete = async () => {
  },
  uuid: uuid2 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 400,
  manualSave = false,
  multiLabels = false
}) {
  if (!["life", "work"].includes(category)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u5206\u7C7B\u3002");
  const pages = /* @__PURE__ */ new Map(), entries = /* @__PURE__ */ new Map();
  const context = {
    category,
    pages,
    entries,
    multiLabels,
    disposed: false,
    options: { load, loadEntry, loadOperation, loadVerified, put, remove, restore, onSaved, discardUnsent, prepareDelete, finishDelete, uuid: uuid2 }
  };
  const emit = () => {
    if (!context.disposed) onChange();
  };
  const page2 = (date) => {
    if (!validDailyNotesDate(date)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u65E5\u671F\u3002");
    if (!pages.has(date)) pages.set(date, {
      category,
      date,
      ids: [],
      loaded: false,
      loading: false,
      canEdit: false,
      error: "",
      sequence: 0,
      composerId: ""
    });
    return pages.get(date);
  };
  const entry = (id2) => entries.get(id2);
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  function makeEntry(id2, date, canEdit) {
    return {
      id: id2,
      category,
      date,
      loaded: true,
      loading: false,
      canEdit,
      serverText: "",
      draft: "",
      version: 0,
      createdAt: null,
      updatedAt: null,
      contentHash: "",
      label: "",
      labels: [],
      serverLabels: [],
      labelKnown: false,
      labelComplete: false,
      deleted: false,
      dirty: false,
      phase: "empty",
      error: "",
      remote: null,
      pending: null,
      timer: null,
      sequence: 0,
      writeEpoch: 0,
      composing: false,
      localVersion: 0,
      durableText: "",
      localBacked: false,
      localQueued: false,
      localOperation: null,
      localConflict: null,
      localCreatedAt: null,
      localUpdatedAt: null
    };
  }
  function adopt(item, value, preserve = false) {
    if (isLocalDocument(value)) return context.adoptLocal(item, value, preserve);
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? "" : value.text;
    item.version = value.version;
    item.createdAt = value.created_at;
    item.updatedAt = value.updated_at;
    item.labelComplete = [2, 3].includes(value.labels_version) && Array.isArray(value.labels);
    item.serverLabels = labelsOf(value);
    if (!preserve) item.labels = [...item.serverLabels];
    item.label = item.labels[0] || "";
    item.labelKnown = category === "work" || [2, 3].includes(value.labels_version) && Array.isArray(value.labels) || value.labels_version === 1 && Object.hasOwn(value, "label");
    item.contentHash = value.content_hash;
    item.deleted = value.deleted;
    item.localVersion = value.version;
    item.durableText = item.serverText;
    item.localBacked = false;
    item.localQueued = false;
    item.localOperation = null;
    item.localConflict = null;
    item.localCreatedAt = null;
    item.localUpdatedAt = null;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText || !equalLabels(item.labels, item.serverLabels);
    item.loaded = true;
  }
  function schedule(item) {
    stopTimer(item);
    if (!manualSave && !item.recoveredBaseline && !context.disposed && !context.autosavePaused && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !blocked(item) && !["error", "oversize"].includes(item.phase) && (persistedVersion(item) > 0 || item.draft.trim())) {
      item.timer = setTimer(() => {
        item.timer = null;
        void context.save(item.id);
      }, delay);
    }
  }
  function merge(item, value) {
    if (isLocalDocument(value)) return context.mergeLocal(item, value);
    if (item.localBacked && !item.localConflict && value.version < item.localVersion) return;
    if (item.localQueued && !item.localConflict && (value.deleted !== item.deleted || !value.deleted && (value.text !== item.durableText || (value.label || "") !== item.label))) {
      item.remote = value;
      return;
    }
    if (item.localBacked && (!blocked(item) || item.localConflict)) {
      const retainedConflictDraft = Boolean(item.localConflict && item.dirty);
      item.writeEpoch++;
      adopt(item, value, item.dirty);
      item.remote = null;
      item.phase = retainedConflictDraft ? "error" : item.dirty ? "dirty" : "saved";
      item.error = retainedConflictDraft ? "\u5DF2\u91C7\u7528\u7EBF\u4E0A\u7248\u672C\uFF0C\u540E\u7EED\u672A\u63D0\u4EA4\u8349\u7A3F\u4ECD\u4FDD\u7559\uFF1B\u8BF7\u6838\u5BF9\u540E\u624B\u52A8\u4FDD\u5B58\u3002" : "";
      return;
    }
    if (value.version < Math.max(item.version, item.remote?.version || 0)) return;
    item.writeEpoch++;
    item.canEdit = value.can_edit;
    if (blocked(item)) item.remote = value;
    else if (item.dirty && value.version !== item.version) {
      item.remote = value;
      item.phase = "conflict";
      item.error = "\u8FD9\u6761\u8BB0\u5F55\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u3002";
      stopTimer(item);
    } else {
      adopt(item, value, item.dirty);
      item.phase = item.dirty ? "dirty" : "saved";
      item.error = "";
    }
  }
  function dispose() {
    context.disposed = true;
    for (const item of entries.values()) stopTimer(item);
  }
  Object.assign(context, { page: page2, entry, emit, stopTimer, adopt, schedule, merge, makeEntry, dispose });
  return context;
}
function createEntryLocalActions(context) {
  const { adopt, stopTimer } = context;
  function adoptLocal(item, value, preserve = false) {
    const { local, server, operation, conflict } = documentState(value), draft = item.draft;
    if (server && server.version >= item.version) adopt(item, server, true);
    item.localVersion = local.version;
    item.durableText = local.deleted ? "" : local.text;
    item.labelComplete = false;
    item.labels = labelsOf(local);
    item.serverLabels = [...item.labels];
    item.label = item.labels[0] || "";
    item.labelKnown = item.category === "work" || local.labels_version === 1 && Object.hasOwn(local, "label");
    item.localBacked = true;
    item.localQueued = Boolean(operation);
    item.localOperation = operation;
    item.localConflict = conflict;
    item.localCreatedAt = local.created_at || null;
    item.localUpdatedAt = local.updated_at || null;
    item.canEdit = local.can_edit;
    item.deleted = local.deleted;
    item.loaded = true;
    item.draft = preserve ? draft : item.durableText;
    item.dirty = item.draft !== item.durableText;
    if (conflict) {
      let remote = null;
      try {
        if (conflict.remote) remote = checkedEntry(conflict.remote, item.category, item.date, item.id);
      } catch {
      }
      item.remote = remote;
      item.phase = "conflict";
      item.error = "\u672C\u673A\u4E0E\u7EBF\u4E0A\u5185\u5BB9\u5747\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u4ECE\u9876\u90E8\u540C\u6B65\u72B6\u6001\u5904\u7406\u51B2\u7A81\u3002";
      stopTimer(item);
    } else {
      item.remote = null;
      item.phase = item.dirty ? "dirty" : savedPhase(item);
      item.error = "";
    }
  }
  function mergeLocal(item, value) {
    const { local, operation, conflict, server } = documentState(value);
    if (local.version < persistedVersion(item) || item.pending) return;
    if (item.localQueued && !operation && !conflict) {
      if (server) context.merge(item, server);
      return;
    }
    item.writeEpoch++;
    adoptLocal(item, value, item.dirty || item.composing);
  }
  return { adoptLocal, mergeLocal };
}
function createEntryReadingActions(context) {
  const { category, page: page2, entry, entries, emit, adopt, merge, schedule, makeEntry } = context;
  const { load, loadEntry } = context.options;
  async function read3(date, options2 = {}) {
    const current3 = page2(date), sequence5 = ++current3.sequence;
    const epochs = new Map(current3.ids.map((id2) => [id2, entry(id2)?.writeEpoch]));
    current3.loading = true;
    current3.error = "";
    emit();
    try {
      const value = checkedCollection(await load(date, options2), category, date);
      if (context.disposed || sequence5 !== current3.sequence) return;
      current3.canEdit = value.can_edit;
      current3.labelsComplete = [2, 3].includes(value.labels_version);
      const found = /* @__PURE__ */ new Set();
      for (const raw of value.entries) {
        const visible3 = noteValue(raw);
        found.add(visible3.id);
        let item = entry(visible3.id);
        if (!item) {
          item = makeEntry(visible3.id, date, visible3.can_edit);
          entries.set(visible3.id, item);
          adopt(item, raw);
          if (!isLocalDocument(raw)) item.phase = "saved";
        } else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained2 = current3.ids.filter((id2) => {
        const item = entry(id2);
        return found.has(id2) || item.version === 0 || item.dirty || item.pending || item.deleted || item.localBacked || blocked(item) || item.writeEpoch !== epochs.get(id2);
      });
      current3.ids = [.../* @__PURE__ */ new Set([...retained2, ...value.entries.map((raw) => noteValue(raw).id)])];
      current3.loaded = true;
      await Promise.all(current3.ids.filter((id2) => !found.has(id2) && persistedVersion(entry(id2)) > 0 && (entry(id2).dirty || entry(id2).localBacked) && !entry(id2).pending).map((id2) => readOne(id2, options2)));
    } catch (error) {
      if (!context.disposed && sequence5 === current3.sequence) current3.error = error.message;
    } finally {
      if (!context.disposed && sequence5 === current3.sequence) {
        current3.loading = false;
        emit();
        for (const id2 of current3.ids) schedule(entry(id2));
      }
    }
  }
  async function readOne(id2, options2 = {}) {
    const item = entry(id2);
    if (!item || context.disposed) return;
    const sequence5 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedEntry(await loadEntry(id2, options2), category, item.date, id2);
      if (!context.disposed && sequence5 === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!blocked(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        emit();
        schedule(item);
      }
    }
  }
  return { read: read3, readOne };
}
function createEntryEditingActions(context) {
  const { page: page2, entry, entries, emit, stopTimer, schedule, makeEntry } = context;
  const { uuid: uuid2 } = context.options;
  function start(date, { label: label3 = "", labels: labels2 = label3 ? [label3] : [] } = {}) {
    const current3 = page2(date);
    if (!validLabels(labels2, context.category)) throw new Error("\u6807\u7B7E\u65E0\u6548\u3002");
    if (context.disposed || !current3.loaded || !current3.canEdit || date !== dailyNotesToday()) return;
    const existing = entry(current3.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted && existing.label === label3) return existing;
    const id2 = uuid2();
    if (!uuidPattern.test(id2) || entries.has(id2)) throw new Error("\u6682\u65F6\u65E0\u6CD5\u65B0\u5EFA\u8BB0\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    const item = makeEntry(id2, date, current3.canEdit);
    item.labels = [...labels2];
    item.label = item.labels[0] || "";
    item.labelKnown = true;
    item.labelComplete = true;
    entries.set(id2, item);
    current3.ids.push(id2);
    current3.composerId = id2;
    emit();
    return item;
  }
  function edit(id2, text, { composing = false } = {}) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || item.deleted || item.discarding || ["delete", "restore"].includes(item.pending?.kind)) return;
    item.draft = text;
    item.composing = composing;
    item.dirty = text !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!blocked(item)) item.phase = "oversize";
      item.error = "\u6587\u5B57\u8D85\u8FC7 64 KiB\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u7F29\u77ED\u540E\u518D\u4FDD\u5B58\u3002";
    } else if (!blocked(item)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : savedPhase(item);
      item.error = "";
    }
    emit();
    if (!composing) schedule(item);
  }
  function relabelDraft(id2, labels2 = []) {
    const item = entry(id2);
    if (typeof labels2 === "string") labels2 = labels2 ? [labels2] : [];
    if (!item || context.disposed || !item.canEdit || item.deleted || item.discarding || item.pending || (!item.labelKnown || context.multiLabels && !item.labelComplete) || !validLabels(labels2, context.category)) return false;
    item.labels = [...labels2];
    item.label = labels2[0] || "";
    item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    item.phase = item.dirty ? "dirty" : savedPhase(item);
    emit();
    return true;
  }
  return { start, edit, relabelDraft };
}
function createEntryRecoveryActions(context) {
  const { category, page: page2, entry, entries, makeEntry, stopTimer, emit } = context;
  function restoreDraft(raw) {
    if (!raw || raw.category !== category || !validDailyNotesDate(raw.date) || !uuidPattern.test(raw.id) || raw.label && !validNoteLabel(raw.label) || typeof raw.draft !== "string" || raw.draft.length > 262144 || context.disposed) return;
    const current3 = page2(raw.date);
    let item = entry(raw.id);
    if (item?.deleted || item && (item.pending || item.composing || item.dirty)) return item;
    const pendingDurable = item && raw.pending?.saveId && raw.pending.saveId === item.localOperation?.save_id;
    if (item && persistedVersion(item) > 0 && raw.draft === savedText(item) && (!raw.labels || equalLabels(raw.labels, item.serverLabels)) && (!raw.pending || pendingDurable)) return item;
    if (!item) {
      item = makeEntry(raw.id, raw.date, current3.canEdit);
      entries.set(item.id, item);
    }
    if (!persistedVersion(item)) {
      item.labels = validLabels(raw.labels, category) ? raw.labels : raw.label ? [raw.label] : [];
      item.label = item.labels[0] || "";
      item.labelKnown = raw.labelKnown === true;
      item.labelComplete = current3.labelsComplete === true;
    }
    if (!current3.ids.includes(item.id)) current3.ids.push(item.id);
    stopTimer(item);
    item.writeEpoch++;
    item.draft = raw.draft;
    if (validLabels(raw.labels, category)) item.labels = [...raw.labels];
    item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    item.recoveredBaseline = raw.recoveredBaseline || {
      version: raw.version ?? null,
      serverText: raw.serverText ?? null,
      contentHash: raw.contentHash ?? null,
      createdAt: raw.createdAt ?? null,
      updatedAt: raw.updatedAt ?? null,
      localVersion: raw.localVersion ?? null,
      durableText: raw.durableText ?? null
    };
    if (raw.pending && !pendingDurable) {
      const operation = raw.pending;
      const valid2 = ["put", "delete", "restore"].includes(operation.kind) && uuidPattern.test(operation.saveId) && Number.isSafeInteger(operation.version) && operation.version >= 0 && (operation.kind !== "put" || typeof operation.text === "string" && dailyNotesBytes(operation.text) <= DAILY_NOTES_MAX_BYTES && (!operation.labels || validLabels(operation.labels, category)) && (!operation.label || category === "life" && validCustomNoteLabel(operation.label)) && (!operation.expectedLabel || category === "life" && validCustomNoteLabel(operation.expectedLabel)));
      item.pending = valid2 ? {
        kind: operation.kind,
        version: operation.version,
        saveId: operation.saveId,
        ...operation.kind === "put" ? {
          text: operation.text,
          ...operation.labels ? { labels: operation.labels } : {},
          ...operation.label ? { label: operation.label } : {},
          ...operation.expectedLabel ? { expectedLabel: operation.expectedLabel } : {}
        } : {},
        uncertain: true,
        checking: false,
        retryReady: false
      } : { kind: "recovery-blocked", uncertain: true, invalid: true, checking: false, retryReady: false };
      item.phase = "unknown";
      item.error = valid2 ? "\u5DF2\u627E\u56DE\u672A\u786E\u8BA4\u7684\u539F\u4FDD\u5B58\uFF0C\u8BF7\u624B\u52A8\u6838\u5BF9\u7ED3\u679C\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u3002" : "\u65E7\u4FDD\u5B58\u51ED\u636E\u4E0D\u5B8C\u6574\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u4F9B\u67E5\u770B\u6216\u5BFC\u51FA\u3002";
    } else {
      item.phase = dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES ? "oversize" : "error";
      item.error = "\u5DF2\u627E\u56DE\u672A\u63D0\u4EA4\u8349\u7A3F\uFF0C\u8BF7\u6838\u5BF9\u540E\u624B\u52A8\u4FDD\u5B58\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u4E0A\u4F20\u3002";
    }
    emit();
    return item;
  }
  return { restoreDraft };
}
function createEntryWritingActions(context) {
  const { category, page: page2, entry, entries, emit, stopTimer, adopt, schedule } = context;
  const { put, remove, restore, uuid: uuid2, onSaved, discardUnsent, prepareDelete, finishDelete, loadVerified } = context.options;
  const matches = (value, operation) => value.version === operation.version + 1 && (operation.kind === "delete" ? value.deleted : operation.kind === "restore" ? !value.deleted : !value.deleted && value.text === operation.text && (!operation.labels || [2, 3].includes(value.labels_version) && equalLabels(value.labels, operation.labels) || value.labels_version === 1 && equalLabels(labelsOf(value), operation.labels)) && (!operation.label || value.labels_version === 1 && value.label === operation.label) && (!operation.expectedLabel || value.labels_version === 1 && value.label === operation.expectedLabel));
  function accepted(item, value, operation) {
    const preserve = operation.kind === "put" && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.remote = null;
    item.pending = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    onSaved(item.date);
    schedule(item);
  }
  function acceptedLocal(item, value, operation) {
    const local = documentValue(value);
    if (!matches(local, operation)) throw new Error("\u672C\u673A\u4FDD\u5B58\u7ED3\u679C\u9700\u8981\u91CD\u65B0\u6838\u5BF9\u3002");
    const preserve = operation.kind === "put" && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.pending = null;
    emit();
    onSaved(item.date);
    schedule(item);
  }
  async function send(item, operation) {
    stopTimer(item);
    item.pending = operation;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const body = { version: operation.version, save_id: operation.saveId };
      const options2 = operation.uncertain ? { offlineUnknown: true } : void 0;
      const raw = operation.kind === "delete" ? await remove(item.id, body, options2) : operation.kind === "restore" ? await restore(item.id, body, options2) : await put(item.id, {
        ...body,
        category: item.category,
        date: item.date,
        text: operation.text,
        ...operation.labels ? { labels: operation.labels } : operation.label ? { label: operation.label } : {}
      }, options2);
      if (context.disposed || item.pending !== operation) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) {
        acceptedLocal(item, value, operation);
        return;
      }
      if (!matches(value, operation)) throw new Error("\u4FDD\u5B58\u54CD\u5E94\u9700\u8981\u91CD\u65B0\u6838\u5BF9\u3002");
      accepted(item, value, operation);
      return value;
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (localFailure(error)) {
        item.pending = operation.uncertain ? operation : null;
        item.phase = operation.uncertain ? "unknown" : "error";
        item.error = operation.uncertain ? "\u539F\u4FDD\u5B58\u4ECD\u5F85\u6838\u5BF9\uFF0C\u672C\u673A\u63A5\u7BA1\u672A\u5B8C\u6210\uFF1A" + error.message : error.message;
        emit();
      } else if (error.status === 409 && (!error.code || ["VERSION_CONFLICT", "NOTE_ENTRY_DELETED"].includes(error.code))) {
        item.pending = null;
        item.phase = "conflict";
        item.error = error.message || "\u8FD9\u6761\u8BB0\u5F55\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
        emit();
        await context.readOne(item.id);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        operation.uncertain = true;
        item.phase = "unknown";
        item.error = "\u6B63\u5728\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
        emit();
        await context.reconcile(item.id);
      }
    }
  }
  async function save3(id2) {
    const item = entry(id2);
    if (!item) return;
    stopTimer(item);
    if (context.disposed || !item.canEdit || item.deleted || item.discarding || item.loading || item.pending || blocked(item) || !item.dirty || item.composing) return;
    if (item.recoveredBaseline) {
      const snapshot = { draft: item.draft, labels: [...item.labels], epoch: item.writeEpoch, version: persistedVersion(item) };
      item.loading = true;
      item.error = "\u6B63\u5728\u6838\u5BF9\u7EBF\u4E0A\u8BB0\u5F55\uFF0C\u672C\u673A\u8349\u7A3F\u4F1A\u4FDD\u7559\u3002";
      emit();
      try {
        if (!loadVerified) throw new Error("\u65E0\u6CD5\u76F4\u63A5\u6838\u5BF9\u7EBF\u4E0A\u8BB0\u5F55");
        const list2 = checkedCollection(await loadVerified(item.date), category, item.date);
        if (context.disposed || entry(id2) !== item || item.writeEpoch !== snapshot.epoch || item.draft !== snapshot.draft || !equalLabels(item.labels, snapshot.labels) || item.pending || item.composing || !item.canEdit || item.deleted || item.discarding) return;
        if (list2.entries.some(isLocalDocument)) throw new Error("\u65E0\u6CD5\u786E\u8BA4\u7EBF\u4E0A\u6700\u65B0\u72B6\u6001");
        const same2 = list2.entries.find((value) => value.id === id2);
        if (same2 && same2.text === snapshot.draft && equalLabels(labelsOf(same2), snapshot.labels)) {
          item.error = "\u7EBF\u4E0A\u5DF2\u6709\u8FD9\u6761\u8BB0\u5F55\uFF0C\u65E0\u9700\u91CD\u590D\u53D1\u9001\uFF1B\u672C\u673A\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002";
          return;
        }
        if (list2.entries.some((value) => value.id !== id2 && value.text === snapshot.draft)) {
          item.error = "\u7EBF\u4E0A\u6709\u5185\u5BB9\u76F8\u540C\u7684\u5176\u4ED6\u8BB0\u5F55\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u672C\u673A\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002";
          return;
        }
        if (!list2.can_edit || same2 && (same2.version !== item.recoveredBaseline.version || !item.recoveredBaseline.contentHash || same2.content_hash !== item.recoveredBaseline.contentHash) || !same2 && snapshot.version !== 0) {
          item.error = "\u7EBF\u4E0A\u72B6\u6001\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF1B\u672C\u673A\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002";
          return;
        }
      } catch {
        if (!context.disposed && entry(id2) === item) item.error = "\u65E0\u6CD5\u6838\u5BF9\u7EBF\u4E0A\u8BB0\u5F55\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u672C\u673A\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002";
        return;
      } finally {
        item.loading = false;
        emit();
      }
    }
    if (!persistedVersion(item) && item.date !== dailyNotesToday()) {
      item.phase = "error";
      item.error = "\u53EA\u80FD\u65B0\u589E\u5317\u4EAC\u65F6\u95F4\u5F53\u5929\u7684\u788E\u788E\u5FF5\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      emit();
      return;
    }
    if (!persistedVersion(item) && !item.draft.trim()) return;
    if (context.multiLabels && !item.labelComplete && !equalLabels(item.labels, item.serverLabels)) {
      item.phase = "error";
      item.error = "\u8BF7\u8054\u7F51\u6838\u5B9E\u5B8C\u6574\u6807\u7B7E\u540E\u518D\u4FDD\u5B58\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      emit();
      return;
    }
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = "oversize";
      item.error = "\u6587\u5B57\u8D85\u8FC7 64 KiB\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      emit();
      return;
    }
    return send(item, {
      kind: "put",
      version: persistedVersion(item),
      text: item.draft,
      saveId: uuid2(),
      ...context.multiLabels && item.labelComplete && (!persistedVersion(item) || !equalLabels(item.labels, item.serverLabels)) ? { labels: [...item.labels] } : {},
      ...!context.multiLabels && !persistedVersion(item) && item.label ? { label: item.label } : {},
      ...!context.multiLabels && item.label ? { expectedLabel: item.label } : {}
    });
  }
  async function deleteEntry(id2) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || item.discarding || item.pending || blocked(item) || item.deleted) return;
    if (!persistedVersion(item)) {
      stopTimer(item);
      item.discarding = true;
      emit();
      try {
        await discardUnsent(item);
      } catch (error) {
        item.discarding = false;
        item.phase = "error";
        item.error = "\u672C\u673A\u8349\u7A3F\u672A\u80FD\u6E05\u7406\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF1A" + error.message;
        emit();
        return;
      }
      if (context.disposed || entry(id2) !== item) return;
      const current3 = page2(item.date);
      current3.ids = current3.ids.filter((value) => value !== id2);
      entries.delete(id2);
      if (current3.composerId === id2) current3.composerId = "";
      emit();
      return;
    }
    item.discarding = true;
    emit();
    let prepared;
    try {
      prepared = await prepareDelete(item);
    } catch (error) {
      item.discarding = false;
      item.phase = "error";
      item.error = "\u672C\u673A\u8349\u7A3F\u672A\u80FD\u6838\u5BF9\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF1A" + error.message;
      emit();
      return;
    }
    if (context.disposed || entry(id2) !== item) return;
    item.discarding = false;
    const result = await send(item, { kind: "delete", version: persistedVersion(item), saveId: uuid2() });
    if (result && prepared) {
      try {
        await finishDelete(prepared, result);
      } catch {
      }
    }
  }
  async function restoreEntry(id2) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, { kind: "restore", version: persistedVersion(item), saveId: uuid2() });
  }
  return { matches, accepted, acceptedLocal, send, save: save3, deleteEntry, restoreEntry };
}
function createEntryResolutionActions(context) {
  const { category, entry, emit, stopTimer, adopt, matches, accepted, acceptedLocal } = context;
  const { load, loadEntry, loadOperation } = context.options;
  async function reconcile(id2) {
    const item = entry(id2), operation = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !operation || operation.checking) return;
    operation.checking = true;
    operation.retryReady = false;
    emit();
    try {
      const receipt = await loadOperation(operation.saveId);
      if (context.disposed || item.pending !== operation) return;
      if (!receipt || typeof receipt.found !== "boolean" || receipt.found && (receipt.id !== id2 || receipt.version !== operation.version + 1 || typeof receipt.content_hash !== "string")) {
        throw new Error("\u4FDD\u5B58\u51ED\u636E\u4E0D\u5B8C\u6574\u3002");
      }
      let value;
      try {
        value = checkedEntry(await loadEntry(id2), category, item.date, id2);
      } catch (error) {
        if (error.status !== 404 || receipt.found || operation.version !== 0 || operation.kind !== "put") throw error;
        const collection = checkedCollection(await load(item.date), category, item.date);
        value = collection.entries.find((raw) => noteValue(raw).id === id2);
        if (isLocalDocument(value)) throw new Error("\u539F\u4FDD\u5B58\u7ED3\u679C\u4ECD\u7531\u540C\u6B65\u961F\u5217\u6838\u5B9E\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
        if (!value) {
          if (context.disposed || item.pending !== operation) return;
          item.canEdit = collection.can_edit;
          operation.retryReady = collection.can_edit;
          item.error = operation.retryReady ? "\u670D\u52A1\u5668\u5C1A\u672A\u6536\u5230\u6B64\u4FDD\u5B58\uFF0C\u53EF\u91CD\u8BD5\uFF1B\u540E\u7EED\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002" : "\u4FDD\u5B58\u5C1A\u672A\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
          return;
        }
      }
      if (context.disposed || item.pending !== operation) return;
      if (isLocalDocument(value)) {
        if (documentState(value).operation?.save_id === operation.saveId) return acceptedLocal(item, value, operation);
        throw new Error("\u4FDD\u5B58\u7ED3\u679C\u4ECD\u7531\u540C\u6B65\u961F\u5217\u6838\u5B9E\uFF0C\u672C\u673A\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002");
      }
      item.canEdit = value.can_edit;
      if (receipt.found && receipt.content_hash === value.content_hash && receipt.version === value.version && matches(value, operation)) {
        accepted(item, value, operation);
      } else if (value.version > operation.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.error = "\u670D\u52A1\u5668\u5DF2\u6709\u66F4\u65B0\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u540E\u9009\u62E9\u3002";
      } else {
        item.remote = value;
        operation.retryReady = !receipt.found && value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ? "\u670D\u52A1\u5668\u5C1A\u65E0\u65B0\u7248\u672C\uFF0C\u53EF\u91CD\u8BD5\u539F\u4FDD\u5B58\uFF1B\u540E\u7EED\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002" : "\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u518D\u6B21\u6838\u5BF9\u3002";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) {
        item.error = "\u6838\u5BF9\u5931\u8D25\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF1A" + error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
      }
    } finally {
      operation.checking = false;
      emit();
    }
  }
  async function retryPending(id2) {
    const item = entry(id2), operation = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !item.canEdit || !operation?.retryReady || operation.checking) return;
    operation.retryReady = false;
    return context.send(item, operation);
  }
  function useServer(id2) {
    const item = entry(id2);
    if (item?.localConflict) {
      item.error = "\u8BF7\u4ECE\u9876\u90E8\u540C\u6B65\u72B6\u6001\u9009\u62E9\u7EBF\u4E0A\u7248\u672C\uFF0C\u672C\u673A\u539F\u6587\u4F1A\u4FDD\u7559\u3002";
      emit();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit();
  }
  async function useDraft(id2) {
    const item = entry(id2);
    if (item?.localConflict) {
      item.error = "\u51B2\u7A81\u7684\u4E24\u4EFD\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u4ECE\u9876\u90E8\u540C\u6B65\u72B6\u6001\u5904\u7406\u3002";
      emit();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit || item.remote.deleted) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    return context.save(id2);
  }
  return { reconcile, retryPending, useServer, useDraft };
}
function createNoteEntriesStore(options2) {
  const context = createEntriesContext(options2);
  Object.assign(context, createEntryLocalActions(context));
  Object.assign(
    context,
    createEntryReadingActions(context),
    createEntryEditingActions(context),
    createEntryWritingActions(context),
    createEntryRecoveryActions(context)
  );
  Object.assign(context, createEntryResolutionActions(context));
  const {
    category,
    pages,
    entries,
    page: page2,
    entry,
    start,
    read: read3,
    readOne,
    edit,
    relabelDraft,
    save: save3,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    dispose
  } = context;
  const pauseAutosave = () => {
    context.autosavePaused = true;
    for (const item of entries.values()) context.stopTimer(item);
    return () => {
      context.autosavePaused = false;
    };
  };
  return {
    category,
    pages,
    entries,
    page: page2,
    entry,
    start,
    read: read3,
    readOne,
    edit,
    relabelDraft,
    save: save3,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    pauseAutosave,
    dispose
  };
}

// local-ui/frontend/web/core/notes-month.mjs
function validNoteMonth(month) {
  return typeof month === "string" && /^\d{4}-\d{2}$/.test(month) && validDailyNotesDate(month + "-01");
}
function coalesceNoteMonthFlight(current3, next2) {
  if (!current3 || current3.root !== next2.root || current3.target !== next2.target || current3.expected !== next2.expected || current3.sequence !== next2.sequence) return false;
  if (next2.chosenDate) current3.chosenDate = next2.chosenDate;
  return true;
}
function shiftNoteMonth(month, delta) {
  if (!validNoteMonth(month) || !Number.isInteger(delta)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u6708\u4EFD\u3002");
  const date = /* @__PURE__ */ new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  const value = date.toISOString().slice(0, 7);
  if (!validNoteMonth(value)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u6708\u4EFD\u3002");
  return value;
}
function noteMonthWeeks(month) {
  if (!validNoteMonth(month)) throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u6708\u4EFD\u3002");
  const first = /* @__PURE__ */ new Date(month + "-01T12:00:00Z"), offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const weeks = Array.from({ length: Math.ceil((offset + last.getUTCDate()) / 7) }, () => Array(7).fill(null));
  for (let day3 = 1; day3 <= last.getUTCDate(); day3++)
    weeks[Math.floor((offset + day3 - 1) / 7)][(offset + day3 - 1) % 7] = month + "-" + String(day3).padStart(2, "0");
  return weeks;
}
function checkedNoteMonth(data2, month) {
  const fail3 = () => {
    throw new Error("\u6708\u8BB0\u5F55\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8054\u7F51\u91CD\u8BD5\u3002");
  };
  if (!validNoteMonth(month) || !data2 || data2.month !== month || data2.complete !== true || ![1, 2, 3].includes(data2.labels_version) || !Array.isArray(data2.days) || data2.days.length > 31) fail3();
  const result = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
  let total = 0;
  for (const day3 of data2.days) {
    if (!day3 || !validDailyNotesDate(day3.date) || !day3.date.startsWith(month + "-") || result.has(day3.date) || !Array.isArray(day3.items)) fail3();
    const items = day3.items.map((item) => {
      if (!item || typeof item.entity_id !== "string" || ids.has(item.entity_id) || !["note_entry", "legacy_daily_note"].includes(item.source) || !["life", "work"].includes(item.category) || data2.labels_version === 1 && (!Object.hasOwn(item, "label") || item.label !== null && (item.category !== "life" || !validCustomNoteLabel(item.label))) || data2.labels_version >= 2 && (!Array.isArray(item.labels) || item.labels.some((label3) => data2.labels_version === 3 ? !validNoteLabel(label3) : item.category !== "life" || !validCustomNoteLabel(label3)) || new Set(item.labels).size !== item.labels.length) || typeof item.text !== "string" || !item.text || !Object.hasOwn(item, "created_at") || item.created_at !== null && !Number.isFinite(Date.parse(item.created_at)) || item.source === "legacy_daily_note" && item.created_at !== null || !Number.isFinite(Date.parse(item.updated_at))) fail3();
      ids.add(item.entity_id);
      total++;
      const displayLabels = data2.labels_version === 3 ? item.labels : item.labels?.length ? item.labels : item.label ? [item.label] : [item.category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"];
      return { ...item, displayLabels, displayLabel: displayLabels.join("\u3001") };
    });
    result.set(day3.date, items);
  }
  if (total > 2e3) fail3();
  return result;
}

// local-ui/frontend/web/pages/daily-notes.mjs
function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden><div class="note-entry-head"><time id="notes-legacy-time" class="note-entry-time" hidden></time><span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div><p id="notes-message" class="notes-message" role="alert" hidden></p><div class="notes-sheet"><label for="notes-editor" class="sr-only">\u539F\u6709\u8BB0\u5F55\u5185\u5BB9</label><textarea id="notes-editor" class="notes-editor" aria-label="\u539F\u6709\u8BB0\u5F55\u6216\u4FDD\u7559\u8349\u7A3F\uFF0C\u53EA\u8BFB" readonly hidden></textarea><div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>\u8FD9\u6761\u8BB0\u5F55\u6CA1\u6709\u6587\u5B57\u3002</p></div><div class="notes-footer"><span id="notes-detail" class="notes-detail"></span><button class="btn text" type="button" data-notes-action="export-legacy" hidden>\u5BFC\u51FA\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F</button><div id="notes-write-actions" class="notes-write-actions" hidden><button class="btn" type="button" data-notes-action="save">\u7ACB\u5373\u4FDD\u5B58</button><button class="btn" type="button" data-notes-action="restore" hidden>\u6062\u590D\u539F\u6709\u8BB0\u5F55</button><button class="btn text" type="button" data-notes-action="delete">\u5220\u9664\u539F\u6709\u8BB0\u5F55</button></div></div><div id="notes-delete-confirm" class="notes-confirm" hidden><p>\u5220\u9664\u539F\u6709\u8BB0\u5F55\uFF1F</p><button class="btn" type="button" data-notes-action="cancel-delete">\u53D6\u6D88</button><button class="btn" type="button" data-notes-action="confirm-delete">\u786E\u8BA4\u5220\u9664</button></div><div id="notes-resolution" class="notes-resolution" hidden><button class="btn" type="button" data-notes-action="check">\u6838\u5BF9\u670D\u52A1\u5668\u7248\u672C</button><button class="btn" type="button" data-notes-action="retry" hidden>\u91CD\u8BD5\u540C\u4E00\u4FDD\u5B58</button><div id="notes-conflict-actions" hidden><p>\u670D\u52A1\u5668\u4E0A\u7684\u6587\u5B57\uFF1A</p><pre id="notes-remote"></pre><button class="btn" type="button" data-notes-action="use-server">\u91C7\u7528\u670D\u52A1\u5668\u5185\u5BB9</button><button class="btn" type="button" data-notes-action="use-draft">\u7528\u6B64\u8349\u7A3F\u4FDD\u5B58\u5230\u65B0\u7248\u672C</button></div></div></article>';
}
function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="\u788E\u788E\u5FF5" data-category="' + category + '"><div class="segmented" role="group" aria-label="\u788E\u788E\u5FF5\u89C6\u56FE"><button type="button" data-notes-view="today" aria-pressed="true">\u4ECA\u65E5\u788E\u788E\u5FF5</button><button type="button" data-notes-view="history" aria-pressed="false">\u5386\u53F2</button><button type="button" data-notes-view="labels" aria-pressed="false">\u6807\u7B7E</button></div><section id="notes-history" hidden aria-label="\u788E\u788E\u5FF5\u5386\u53F2"><div class="notes-calendar-layout"><aside class="notes-calendar-filters"><label>\u6708\u4EFD <input type="month" id="notes-history-month" class="input"></label><div class="notes-calendar-month-actions"><button type="button" class="notes-month-step" data-notes-month="prev" aria-label="\u4E0A\u4E2A\u6708" title="\u4E0A\u4E2A\u6708">\u2039</button><button type="button" class="notes-month-step" data-notes-month="next" aria-label="\u4E0B\u4E2A\u6708" title="\u4E0B\u4E2A\u6708">\u203A</button></div><label hidden>\u5468\u6B21 <select id="notes-history-week" class="input"><option value="">\u5168\u90E8\u5468\u6B21</option></select></label><label>\u6807\u7B7E <select id="notes-history-label" class="input"><option value="">\u5168\u90E8\u6807\u7B7E</option></select></label><label hidden>\u65E5\u671F <select id="notes-history-date" class="input"></select></label></aside><div class="notes-calendar-main"><div class="notes-history-views" role="group" aria-label="\u5386\u53F2\u663E\u793A\u65B9\u5F0F"><button type="button" data-history-display="calendar" aria-pressed="true">\u65E5\u5386</button><button type="button" data-history-display="timeline" aria-pressed="false">\u65F6\u95F4\u8F74</button><button type="button" class="notes-timeline-order" data-history-order="desc" aria-label="\u5207\u6362\u65F6\u95F4\u8F74\u6392\u5E8F" hidden>\u65F6\u95F4\uFF1A\u4ECE\u65B0\u5230\u65E7</button></div><p id="notes-history-summary" class="notes-calendar-summary"></p><p id="notes-history-status" role="status" aria-live="polite"></p><div class="notes-calendar-weekdays" aria-hidden="true"><span>\u4E00</span><span>\u4E8C</span><span>\u4E09</span><span>\u56DB</span><span>\u4E94</span><span>\u516D</span><span>\u65E5</span></div><div id="notes-history-grid" class="notes-calendar-grid"></div><div id="notes-history-list" class="notes-entry-list"></div></div></div></section><section id="notes-labels" hidden aria-label="\u6807\u7B7E\u7BA1\u7406"><div class="notes-categories"><label><span class="sr-only">\u65B0\u6807\u7B7E\u540D\u79F0</span><input id="notes-new-label" class="input" maxlength="64" placeholder="\u65B0\u6807\u7B7E"></label><button class="btn text" type="button" data-notes-action="create-label">\u6DFB\u52A0\u6807\u7B7E</button></div><p id="notes-label-status" role="status" aria-live="polite"></p><ul id="notes-label-list"></ul></section><div id="notes-today"><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="\u524D\u4E00\u5929">\u2039</button><label class="notes-date-label"><span class="sr-only">\u9009\u62E9\u788E\u788E\u5FF5\u65E5\u671F</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="\u540E\u4E00\u5929">\u203A</button><button class="btn text" type="button" data-notes-action="today">\u4ECA\u5929</button></div><div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>\uFF0B \u5199\u4E00\u6761</button><button class="btn text" type="button" data-notes-action="login" hidden>\u6240\u6709\u8005\u767B\u5F55</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite"></span></div><div class="notes-published"><div id="notes-entry-list" class="notes-entry-list"></div><article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden><div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">\u67E5\u770B\u539F\u6709\u8BB0\u5F55</button><button class="btn text" type="button" data-notes-action="export-legacy" hidden>\u5BFC\u51FA\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F</button></article></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-entry-message" class="notes-message" role="alert" hidden></p><section id="notes-composer" class="notes-composer" aria-label="\u5F53\u524D\u7F16\u8F91\u7684\u788E\u788E\u5FF5" hidden><div class="notes-composer-heading"><button class="btn text" type="button" data-notes-action="collapse">\u53D6\u6D88</button></div><div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section><p id="notes-entry-empty" class="notes-empty" hidden>\u8FD9\u4E00\u5929\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002</p><div id="notes-unpublished" class="notes-entry-list"></div></div></section>';
}
var statuses = {
  loading: "",
  dirty: "\u672A\u53D1\u9001",
  saving: "\u53D1\u9001\u4E2D\u2026",
  conflict: "\u8349\u7A3F\u6709\u51B2\u7A81",
  unknown: "\u4FDD\u5B58\u7ED3\u679C\u5F85\u6838\u5BF9",
  error: "\u6682\u672A\u4FDD\u5B58",
  oversize: "\u6587\u5B57\u8FC7\u957F",
  queued: "\u5DF2\u5B58\u672C\u673A\uFF0C\u5F85\u540C\u6B65",
  cached: "\u672C\u673A\u7F13\u5B58"
};
function retainedLegacy(item) {
  return Boolean(item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase));
}
function displayedText(item) {
  if (item.dirty || item.phase !== "queued" && noteDraftNeedsAttention(item)) return item.draft;
  return item.localBacked || item.localQueued || item.phase === "queued" ? item.durableText ?? item.draft : item.serverText;
}
function noteEntryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function paintTime(time2, value) {
  const actual = noteEntryTime(value);
  time2.textContent = actual;
  time2.hidden = !actual;
  if (actual) {
    time2.dateTime = value;
    time2.title = "\u4FEE\u6539\u65F6\u95F4\uFF08\u5317\u4EAC\u65F6\u95F4\uFF09\uFF1A" + new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } else {
    time2.removeAttribute("datetime");
    time2.removeAttribute("title");
  }
}
function paintEditorValue(editor, text) {
  if (editor.dataset.composing === "true" || editor.value === text) return;
  const active2 = typeof document !== "undefined" && document.activeElement === editor, start = editor.selectionStart, end = editor.selectionEnd, direction = editor.selectionDirection, scroll = editor.scrollTop;
  editor.value = localEditorPaintValue(editor, text);
  if (active2) {
    editor.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length), direction);
    editor.scrollTop = scroll;
  }
}
function paintDailyNotes(root2, item, { compatibility = false, editing: editing3 = false } = {}) {
  if (!root2) return;
  const find = (selector) => root2.querySelector(selector), editor = find("#notes-editor"), reader = find("#notes-reader");
  const retained2 = retainedLegacy(item);
  editor.dataset.date = item.date;
  editor.dataset.category = root2.dataset.category || dailyNotesRouteCategory();
  editor.hidden = !editing3 || !item.loaded || item.deleted && !retained2;
  editor.readOnly = true;
  editor.disabled = false;
  paintEditorValue(editor, item.draft);
  reader.hidden = !item.loaded || editing3 && (!item.deleted || retained2);
  reader.textContent = retained2 ? item.draft : item.deleted ? "\u539F\u6709\u8BB0\u5F55\u5DF2\u5220\u9664\u3002" : item.serverText;
  find("#notes-empty").hidden = !item.loaded || Boolean(item.serverText || retained2 && item.draft);
  const status = find(compatibility ? "#notes-legacy-status" : "#notes-status");
  status.textContent = retained2 ? statuses[item.phase] || "\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F" : item.deleted ? "\u539F\u6709\u8BB0\u5F55\u5DF2\u5220\u9664" : "\u539F\u6709\u8BB0\u5F55 \xB7 \u53EA\u8BFB";
  status.dataset.phase = item.phase;
  find("#notes-message").hidden = !item.error;
  find("#notes-message").textContent = item.error;
  find("#notes-detail").textContent = retained2 ? "\u539F\u6709\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u4EC5\u4F9B\u67E5\u770B\u4E0E\u5BFC\u51FA\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u4E0A\u4F20\u3002" : "\u539F\u6709\u9010\u65E5\u8BB0\u5F55\uFF0C\u53EA\u8BFB\u4FDD\u7559\u3002";
  find("#notes-write-actions").hidden = true;
  for (const action of ["save", "restore", "delete", "retry", "use-server", "use-draft", "confirm-delete"]) {
    const button2 = find('[data-notes-action="' + action + '"]');
    button2.hidden = true;
    button2.disabled = true;
  }
  find('#notes-legacy-card [data-notes-action="export-legacy"]').hidden = !retained2;
  find("#notes-delete-confirm").hidden = true;
  find("#notes-resolution").hidden = true;
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find("#notes-conflict-actions").hidden = true;
  find("#notes-remote").textContent = item.remote?.deleted ? "\uFF08\u539F\u6709\u8BB0\u5F55\u5DF2\u5220\u9664\uFF09" : item.remote?.text || "\uFF08\u7A7A\u767D\uFF09";
  if (compatibility) paintTime(find("#notes-legacy-time"), item.updatedAt);
}
function entryControlsMarkup() {
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions"><button class="btn note-entry-send" type="button" data-note-entry-action="save" aria-label="\u53D1\u9001"></button><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text" type="button" data-note-entry-action="restore" hidden>\u6062\u590D</button><button class="btn text" type="button" data-note-entry-action="delete">\u5220\u9664</button></div><div class="note-entry-confirm notes-confirm" hidden><p>\u5220\u9664\u8FD9\u6761\u8BB0\u5F55\uFF1F</p><button class="btn" type="button" data-note-entry-action="cancel-delete">\u53D6\u6D88</button><button class="btn" type="button" data-note-entry-action="confirm-delete">\u786E\u8BA4\u5220\u9664</button></div><div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C</button><button class="btn" type="button" data-note-entry-action="retry" hidden>\u91CD\u8BD5\u539F\u4FDD\u5B58</button><div class="note-entry-conflict" hidden><p>\u670D\u52A1\u5668\u4E0A\u7684\u6587\u5B57\uFF1A</p><pre></pre><button class="btn" type="button" data-note-entry-action="use-server">\u91C7\u7528\u670D\u52A1\u5668\u5185\u5BB9</button><button class="btn" type="button" data-note-entry-action="use-draft">\u7528\u6B64\u8349\u7A3F\u4FDD\u5B58</button></div></div>';
}
function createEntryElement(item, editing3) {
  const node2 = document.createElement("article");
  node2.className = "note-entry " + (editing3 ? "note-entry-editing" : "note-entry-saved");
  node2.dataset.noteEntry = item.id;
  node2.dataset.category = item.category;
  node2.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time"></time><span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing3 ? '<label class="sr-only" for="entry-' + e(item.id) + '">\u788E\u788E\u5FF5\u5185\u5BB9</label><textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) + '" placeholder="\u5199\u4E0B\u4E00\u70B9\u60F3\u8BF4\u7684\u8BDD\u2026" rows="3"></textarea><fieldset class="note-entry-labels"><legend>\u6807\u7B7E\uFF08\u53EF\u591A\u9009\uFF09</legend><div class="note-entry-label-options"></div></fieldset><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() : '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">\u7F16\u8F91</button>');
  return node2;
}
function paintEntrySummary(node2, item) {
  node2.dataset.category = item.category;
  node2.querySelector(".note-entry-label").textContent = !item.labelKnown || !item.labelComplete ? "\u6807\u7B7E\u5F85\u8054\u7F51\u6838\u5B9E" : (item.labels || []).join("\u3001");
  paintTime(node2.querySelector("time"), item.updatedAt);
  const status = node2.querySelector(".note-entry-status");
  status.textContent = statuses[item.phase] || (item.deleted ? "\u5DF2\u5220\u9664" : item.version ? "\u5DF2\u4FDD\u5B58" : "\u672A\u53D1\u9001");
  status.dataset.phase = item.phase;
  const message = node2.querySelector(".note-entry-message");
  message.textContent = item.error;
  message.hidden = !item.error;
}
function paintSavedEntry(node2, item) {
  paintEntrySummary(node2, item);
  node2.querySelector(".note-entry-send-feedback").textContent = item.manualSubmitted && !item.dirty && item.phase === "saved" ? "\u53D1\u9001\u6210\u529F" : "";
  const draft = noteDraftNeedsAttention(item), body = node2.querySelector(".note-entry-reader");
  body.textContent = item.deleted ? "\u8FD9\u6761\u8BB0\u5F55\u5DF2\u5220\u9664\u3002" : displayedText(item);
  body.classList.toggle("note-entry-draft-label", draft);
  node2.dataset.draft = String(draft);
  const edit = node2.querySelector('[data-note-entry-action="edit"]');
  edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? "\u7EE7\u7EED\u7F16\u8F91\u8349\u7A3F" : item.deleted ? "\u67E5\u770B" : "\u7F16\u8F91";
}
function paintEntryEditor(node2, item, confirmId, labels2, labelsVerified) {
  paintEntrySummary(node2, item);
  const find = (selector) => node2.querySelector(selector), editor = find("textarea");
  editor.dataset.date = item.date;
  editor.dataset.category = item.category;
  editor.hidden = item.deleted;
  editor.readOnly = !item.canEdit;
  editor.disabled = ["delete", "restore"].includes(item.pending?.kind);
  paintEditorValue(editor, item.draft);
  const fieldset = find(".note-entry-labels"), options2 = find(".note-entry-label-options");
  fieldset.hidden = item.deleted;
  fieldset.disabled = !item.canEdit || !item.labelComplete || !labelsVerified || Boolean(item.pending);
  fieldset.title = item.labelComplete && labelsVerified ? "" : "\u8BF7\u8054\u7F51\u6838\u5B9E\u6807\u7B7E\u72B6\u6001\u540E\u518D\u4FEE\u6539\u3002";
  const available = [.../* @__PURE__ */ new Set([...labels2, ...item.labels || []])];
  if (JSON.stringify([...options2.querySelectorAll("input")].map((input) => input.value)) !== JSON.stringify(available)) {
    options2.replaceChildren(...available.map((value) => {
      const label3 = document.createElement("label"), input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.noteLabel = item.id;
      label3.append(input, document.createTextNode(value));
      return label3;
    }));
  }
  for (const input of options2.querySelectorAll("input")) input.checked = (item.labels || []).includes(input.value);
  const reader = find(".note-entry-reader");
  reader.textContent = item.deleted ? "\u8FD9\u6761\u8BB0\u5F55\u5DF2\u5220\u9664\u3002" : item.serverText;
  reader.hidden = !item.deleted;
  find(".note-entry-actions").hidden = !item.canEdit;
  const busy = Boolean(item.pending) || ["conflict", "unknown"].includes(item.phase);
  const save3 = find('[data-note-entry-action="save"]');
  save3.hidden = item.deleted || !item.canEdit;
  const sendLabel = item.pending ? "\u53D1\u9001\u4E2D\u2026" : item.phase === "error" ? "\u91CD\u8BD5\u53D1\u9001" : "\u53D1\u9001";
  save3.setAttribute("aria-label", sendLabel);
  save3.setAttribute("title", sendLabel);
  save3.disabled = busy || !item.dirty || item.composing || item.phase === "oversize";
  const feedback = find(".note-entry-send-feedback");
  feedback.textContent = item.pending ? "\u53D1\u9001\u4E2D\u2026" : !item.manualSubmitted || item.dirty ? "" : item.phase === "queued" ? "\u5DF2\u5B58\u672C\u673A\uFF0C\u5F85\u540C\u6B65" : item.phase === "saved" ? "\u53D1\u9001\u6210\u529F" : "";
  find('[data-note-entry-action="delete"]').hidden = item.deleted;
  find('[data-note-entry-action="delete"]').disabled = busy;
  find('[data-note-entry-action="restore"]').hidden = !item.deleted;
  find('[data-note-entry-action="restore"]').disabled = busy;
  find(".note-entry-confirm").hidden = confirmId !== item.id;
  find(".note-entry-resolution").hidden = !["unknown", "conflict"].includes(item.phase) && item.phase !== "error";
  find('[data-note-entry-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-note-entry-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady || !item.canEdit;
  find(".note-entry-conflict").hidden = item.phase !== "conflict" || !item.remote;
  find(".note-entry-conflict pre").textContent = item.remote?.deleted ? "\uFF08\u8FD9\u6761\u8BB0\u5F55\u5DF2\u5220\u9664\uFF09" : item.remote?.text || "\uFF08\u7A7A\u767D\uFF09";
  find('[data-note-entry-action="use-draft"]').disabled = !item.remote?.can_edit || item.remote?.deleted;
}
var editorNodes = /* @__PURE__ */ new WeakMap();
function paintActiveEditor(root2, store, active2, legacy, confirmId, labels2, labelsVerified) {
  const host = root2.querySelector("#notes-active-entry");
  if (!editorNodes.has(root2)) editorNodes.set(root2, /* @__PURE__ */ new Map());
  const nodes = editorNodes.get(root2), item = store.entry(active2);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active2)) nodes.set(active2, createEntryElement(item, true));
    const node2 = nodes.get(active2);
    if (host.firstElementChild !== node2) host.replaceChildren(node2);
    paintEntryEditor(node2, item, confirmId, labels2, labelsVerified);
  }
  root2.querySelector("#notes-legacy-card").hidden = active2 !== "legacy";
  paintDailyNotes(root2, legacy, { compatibility: true, editing: active2 === "legacy" });
}
function paintLegacySummary(root2, legacy, active2) {
  const node2 = root2.querySelector("#notes-legacy-saved"), draft = retainedLegacy(legacy);
  let label3 = node2.querySelector(".note-entry-label");
  if (!label3) {
    label3 = document.createElement("span");
    label3.className = "note-entry-label";
    node2.querySelector(".note-entry-head").prepend(label3);
  }
  label3.textContent = root2.dataset.category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B";
  node2.hidden = active2 === "legacy" || !(legacy.version > 0 || draft);
  paintTime(node2.querySelector("time"), legacy.updatedAt);
  node2.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "\u539F\u6709\u8BB0\u5F55\u5DF2\u5220\u9664\u3002" : legacy.serverText;
  node2.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F" : "\u539F\u6709\u8BB0\u5F55 \xB7 \u53EA\u8BFB";
  node2.querySelector(".note-entry-status").dataset.phase = legacy.phase;
  node2.querySelector(".note-entry-message").textContent = legacy.error;
  node2.querySelector(".note-entry-message").hidden = !legacy.error;
  const edit = node2.querySelector('[data-notes-action="edit-legacy"]');
  edit.hidden = false;
  edit.textContent = draft ? "\u67E5\u770B\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F" : "\u67E5\u770B\u539F\u6709\u8BB0\u5F55";
  node2.querySelector('[data-notes-action="export-legacy"]').hidden = !draft;
}
function paintRetainedDrafts(root2, current3, drafts) {
  const box = root2.querySelector("#notes-drafts");
  const retained2 = [...new Set(drafts.filter((value) => value.date !== current3.date || value.category !== current3.category).map((value) => value.category + ":" + value.date))];
  box.hidden = !retained2.length;
  box.innerHTML = "<span>\u4FDD\u7559\u7684\u8349\u7A3F\uFF1A</span>" + retained2.map((key2) => {
    const [category, date] = key2.split(":");
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' + (category === "work" ? "\u5DE5\u4F5C " : "\u751F\u6D3B ") + e(date) + "</button>";
  }).join("");
}
function paintOtherLegacy(root2, list2, legacy, category) {
  let node2 = root2.querySelector("#notes-legacy-other");
  if (!node2) {
    node2 = document.createElement("article");
    node2.id = "notes-legacy-other";
    node2.className = "note-entry note-entry-saved notes-legacy-saved";
    node2.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-other-legacy">\u67E5\u770B\u539F\u6709\u8BB0\u5F55</button><button class="btn text" type="button" data-notes-action="export-other-legacy" hidden>\u5BFC\u51FA\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F</button>';
  }
  list2.append(node2);
  const draft = legacy && retainedLegacy(legacy);
  node2.hidden = !legacy || !(legacy.version > 0 || draft);
  if (!legacy) return;
  node2.querySelector(".note-entry-label").textContent = category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B";
  paintTime(node2.querySelector("time"), legacy.updatedAt);
  node2.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "\u539F\u6709\u8BB0\u5F55\u5DF2\u5220\u9664\u3002" : legacy.serverText;
  node2.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F" : "\u539F\u6709\u8BB0\u5F55 \xB7 \u53EA\u8BFB";
  const message = node2.querySelector(".note-entry-message");
  message.textContent = legacy.error;
  message.hidden = !legacy.error;
  const edit = node2.querySelector('[data-notes-action="edit-other-legacy"]');
  edit.dataset.legacyCategory = category;
  edit.textContent = draft ? "\u67E5\u770B\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F" : "\u67E5\u770B\u539F\u6709\u8BB0\u5F55";
  const exportButton = node2.querySelector('[data-notes-action="export-other-legacy"]');
  exportButton.dataset.legacyCategory = category;
  exportButton.hidden = !draft;
}
function paintNoteEntries(root2, store, current3, legacy, { drafts = [], confirmId = "", active: active2 = "", otherLegacy = null, otherCategory = "", labels: labels2 = [], labelsVerified = true } = {}) {
  const find = (selector) => root2.querySelector(selector), list2 = find("#notes-entry-list");
  root2.dataset.date = current3.date;
  const dateInput = find("#notes-date");
  if (dateInput.value !== current3.date) dateInput.value = current3.date;
  find('[data-notes-action="next"]').disabled = current3.date >= dailyNotesToday();
  const canEdit = current3.loaded && current3.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current3.loaded || current3.canEdit;
  find("#notes-entry-message").textContent = current3.error;
  find("#notes-entry-message").hidden = !current3.error;
  const items = current3.ids.map((id2) => store.entry(id2)).filter(Boolean);
  const saved = items.filter((item) => !item.deleted && item.id !== active2 && (item.version > 0 || item.localVersion > 0 || noteDraftNeedsAttention(item)));
  const unpublished = find("#notes-unpublished");
  const nodes = new Map([...list2.children, ...unpublished.children].filter((node2) => node2.dataset.noteEntry).map((node2) => [node2.dataset.noteEntry, node2])), wanted = new Set(saved.map((item) => item.id));
  for (const [id2, node2] of nodes) if (!wanted.has(id2)) node2.remove();
  for (const item of saved) {
    const node2 = nodes.get(item.id) || createEntryElement(item, false);
    (noteDraftNeedsAttention(item) ? unpublished : list2).append(node2);
    paintSavedEntry(node2, item);
    node2.dataset.sortTime = item.createdAt || item.localCreatedAt || "";
  }
  paintActiveEditor(root2, store, active2, legacy, confirmId, labels2, labelsVerified);
  paintLegacySummary(root2, legacy, active2);
  (retainedLegacy(legacy) ? unpublished : list2).append(root2.querySelector("#notes-legacy-saved"));
  root2.querySelector("#notes-legacy-saved").dataset.sortTime = legacy.updatedAt || "";
  paintOtherLegacy(root2, list2, otherLegacy, otherCategory);
  root2.querySelector("#notes-legacy-other").dataset.sortTime = otherLegacy?.updatedAt || "";
  if (otherLegacy && retainedLegacy(otherLegacy)) unpublished.append(root2.querySelector("#notes-legacy-other"));
  const composer = find("#notes-composer"), activeItem = active2 === "legacy" ? legacy : store.entry(active2);
  composer.hidden = !activeItem;
  composer.dataset.active = active2;
  find(".notes-published").hidden = Boolean(activeItem);
  unpublished.hidden = Boolean(activeItem);
  find('[data-notes-action="new"]').hidden = !canEdit || current3.date !== dailyNotesToday() || Boolean(activeItem);
  find('[data-notes-action="collapse"]').disabled = Boolean(activeItem?.pending || activeItem?.composing);
  const ordered2 = [...list2.children].sort((a, b) => String(a.dataset.sortTime || "").localeCompare(String(b.dataset.sortTime || "")));
  list2.append(...ordered2);
  find("#notes-entry-empty").hidden = !(current3.allLoaded ?? current3.loaded) || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 || noteDraftNeedsAttention(legacy) || Boolean(otherLegacy && (otherLegacy.version > 0 || noteDraftNeedsAttention(otherLegacy)));
  const unresolved2 = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  const status = find("#notes-status");
  status.textContent = !current3.loaded && current3.loading ? "" : current3.error ? "\u8BFB\u53D6\u5931\u8D25" : unresolved2 ? "\u6709\u672A\u53D1\u9001\u5185\u5BB9" : canEdit ? "" : current3.loaded ? "\u516C\u5F00\u53EA\u8BFB" : "";
  status.hidden = canEdit && !current3.error && !unresolved2;
  paintRetainedDrafts(root2, current3, drafts);
}

// local-ui/frontend/web/daily-notes-controller.mjs
init_client();
init_state();
init_runtime();

// local-ui/frontend/web/offline/conflict-draft-guards.mjs
var factories = /* @__PURE__ */ new Set();
var uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var changed = () => {
  throw Object.assign(new Error("\u672C\u673A\u8F93\u5165\u6216\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u4FDD\u7559\u539F\u6587\u5E76\u91CD\u65B0\u6BD4\u8F83\u3002"), { code: "OFFLINE_CONFLICT_CHANGED" });
};
var fields2 = (value, names) => value ? Object.fromEntries(names.filter((name) => value[name] !== void 0).map((name) => [name, value[name]])) : null;
var canonical2 = (value) => Array.isArray(value) ? value.map(canonical2) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key2) => [key2, canonical2(value[key2])])) : value;
var stable = (value) => JSON.stringify(canonical2(value));
function pendingIntent(value) {
  if (!value) return null;
  return {
    ...fields2(value, ["kind", "id", "method", "path", "version", "text", "saveId"]),
    body: fields2(value.body, ["version", "save_id", "title", "body", "group_id", "position", "category", "date", "text", "completed"]),
    snapshot: fields2(value.snapshot, ["title", "body", "group_id", "position", "category", "date", "text", "completed"])
  };
}
function draftSnapshot(value, kind) {
  if (!value) return null;
  return {
    ...fields2(value, kind === "memo" ? ["title", "body", "group_id", "position"] : ["draft"]),
    composing: value.composing === true,
    pending: pendingIntent(value.pending)
  };
}
function entityId(value, prefix) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const id2 = value.slice(prefix.length);
  return uuid.test(id2) ? id2.toLowerCase() : null;
}
function privateMemoJournals(storage2, owner2, id2) {
  if (!storage2 || typeof owner2 !== "string" || !owner2) changed();
  const prefix = "haoduoyu.memos.drafts.v1." + owner2 + ".", rows = [];
  try {
    const length = storage2.length;
    if (!Number.isSafeInteger(length) || length < 0) changed();
    for (let index = 0; index < length; index++) {
      const key2 = storage2.key(index);
      if (typeof key2 !== "string" || !key2.startsWith(prefix)) continue;
      const raw = JSON.parse(storage2.getItem(key2) || "{}");
      if (!Array.isArray(raw.drafts)) changed();
      const drafts = raw.drafts.filter((draft) => draft?.id === id2).map((draft) => draftSnapshot(draft, "memo"));
      if (drafts.length) rows.push([key2, drafts.sort((a, b) => stable(a).localeCompare(stable(b)))]);
    }
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    changed();
  }
}
function registerConflictDraftGuard(factory) {
  if (typeof factory !== "function") throw new TypeError("Conflict draft guard must be a factory");
  factories.add(factory);
  return () => factories.delete(factory);
}
function createMemoConflictDraftGuard({
  getStore,
  getIdentity,
  getStorage = () => globalThis.localStorage,
  getComposing = () => false
}) {
  return (entity_id) => {
    const id2 = entityId(entity_id, "memo-note:"), store = id2 && getStore();
    if (!store) return null;
    const identity4 = getIdentity(), owner2 = store.state.draftOwner;
    const snapshot = () => stable({
      draft: draftSnapshot(store.drafts.get(id2), "memo"),
      operation: store.state.operation?.pending?.id === id2 ? pendingIntent(store.state.operation.pending) : null,
      composing: getComposing(id2) === true,
      journals: privateMemoJournals(getStorage(), owner2, id2)
    });
    let initial2;
    try {
      initial2 = snapshot();
    } catch {
      changed();
    }
    return () => {
      if (store !== getStore() || identity4 !== getIdentity() || owner2 !== store.state.draftOwner) changed();
      try {
        if (snapshot() !== initial2) changed();
      } catch {
        changed();
      }
    };
  };
}
function createNoteConflictDraftGuard({ getStores, getIdentity, getComposing = () => false }) {
  return (entity_id) => {
    const id2 = entityId(entity_id, "note-entry:");
    if (!id2) return null;
    const find = () => [...getStores()].filter(([, store]) => store.entries.has(id2));
    const initialStores = find();
    if (!initialStores.length) return null;
    const identity4 = getIdentity();
    const snapshot = (rows) => stable({
      drafts: rows.map(([category, store]) => [category, draftSnapshot(store.entries.get(id2), "note")]),
      composing: getComposing(id2) === true
    });
    const initial2 = snapshot(initialStores);
    return () => {
      const current3 = find();
      if (identity4 !== getIdentity() || current3.length !== initialStores.length || current3.some(([category, store], index) => category !== initialStores[index][0] || store !== initialStores[index][1])) changed();
      if (snapshot(current3) !== initial2) changed();
    };
  };
}

// local-ui/frontend/web/daily-notes-controller.mjs
init_retained_drafts();
var notesStore;
var entryStore;
var notesIdentity = "";
var notesEventsRegistered = false;
var notesConfirmDate = "";
var notesConfirmEntry = "";
var notesActiveCategory = "";
var notesRefreshPaused = false;
var notesDraftError = "";
var notesDraftRevision = 0;
var notesView = "today";
var historyMonth = "";
var historyDate = "";
var historyDays = /* @__PURE__ */ new Map();
var historySequence = 0;
var historyActiveLoad = null;
var notesSelectedLabel = "\u751F\u6D3B";
var notesLabels = [];
var notesArchivedLabels = [];
var notesLabelsVerified = false;
var notesLabelIntent = null;
var notesArchiveIntent = null;
var notesLabelBusy = false;
var notesLabelMessage = "";
var notesLabelSequence = 0;
var notesStores = /* @__PURE__ */ new Map();
var entryStores = /* @__PURE__ */ new Map();
var editorViews = createNotesEditorView();
var floatingNoteObservers = /* @__PURE__ */ new Set();
var floatingNoteId = "";
var floatingNoteDate = "";
var floatingNoteCategory = "life";
var floatingComposingId = "";
function observeFloatingNotes(callback) {
  floatingNoteObservers.add(callback);
  return () => floatingNoteObservers.delete(callback);
}
var notesIdentityNow = () => JSON.stringify([
  runtime.sessionEpoch,
  state.me?.id || "",
  state.me?.publicBusiness === true,
  getOfflineRuntime()?.state.scope || ""
]);
var notesVisible = () => state.page === "notes" && notesIdentity === notesIdentityNow();
var draftFields = [
  "id",
  "date",
  "draft",
  "version",
  "serverText",
  "contentHash",
  "label",
  "labels",
  "labelKnown",
  "createdAt",
  "updatedAt",
  "dirty",
  "phase",
  "pending",
  "remote",
  "deleted",
  "localVersion",
  "durableText",
  "localBacked",
  "localQueued",
  "recoveredBaseline"
];
var hydratedDrafts = /* @__PURE__ */ new WeakMap();
var hydrationReady = /* @__PURE__ */ new WeakSet();
var entryIdentities = /* @__PURE__ */ new WeakMap();
var entryDraftRevision = createDraftRevisionTracker();
var legacyRecoveryGuard = createLegacyRecoveryGuard();
var entryRecoveryGuard = createEntryRecoveryGuard(draftFields);
var sendFeedbackTimers = /* @__PURE__ */ new WeakMap();
function scheduleSendFeedback(entries, expected) {
  for (const item of entries.entries.values()) {
    if (!item.manualSubmitted || item.phase !== "saved" || item.dirty || item.pending || sendFeedbackTimers.has(item)) continue;
    const attempt = item.manualSubmitted;
    const timer2 = setTimeout(() => {
      sendFeedbackTimers.delete(item);
      if (expected !== notesIdentityNow() || item.manualSubmitted !== attempt) return;
      item.manualSubmitted = null;
      paintDailyNotesPage();
    }, 2500);
    sendFeedbackTimers.set(item, timer2);
  }
}
function captureNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [["legacy", legacy.pages.values()], ["note_entry", entries.entries.values()]]) for (const item of values) {
    if (item.discarding || kind === "legacy" && legacyRecoveryGuard.unchanged(item)) continue;
    if (kind === "note_entry" && item.recoveredBaseline && !noteDraftNeedsAttention(item)) continue;
    const recoveryProof = kind === "note_entry" ? entryRecoveryGuard.proof(item) : null;
    rows.push({
      kind,
      category,
      ...Object.fromEntries(draftFields.filter((key2) => item[key2] !== void 0).map((key2) => [key2, item[key2]])),
      ...recoveryProof ? { recoveryProof } : {}
    });
  }
  return offline.retainDrafts(rows);
}
async function hydrateNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime(), expected = entryIdentities.get(entries);
  const active2 = () => expected === notesIdentityNow();
  if (!offline || !active2()) return;
  const seen = hydratedDrafts.get(entries) || /* @__PURE__ */ new Set();
  hydratedDrafts.set(entries, seen);
  const originals = new Map(entries.entries);
  const epochs = new Map([...entries.entries].map(([id2, item]) => [id2, item.writeEpoch]));
  const revisions = new Map([...entries.entries].map(([id2, item]) => [id2, entryDraftRevision(item)]));
  const entryDrafts = await visibleArchive();
  if (!active2()) return;
  for (const { raw, record } of entryDrafts) {
    if (!raw || raw.kind !== "note_entry" || raw.category !== category || seen.has(raw.id)) continue;
    const current3 = entries.entries.get(raw.id);
    if (current3 && originals.get(raw.id) !== current3) continue;
    if (!unchangedEntrySinceSnapshot(epochs, raw.id, current3, revisions.get(raw.id), current3 && entryDraftRevision(current3))) continue;
    if (current3 && (current3.pending || current3.composing || current3.dirty)) continue;
    const restored = entries.restoreDraft(raw);
    if (restored?.recoveredBaseline) entryRecoveryGuard.remember(restored, record);
    seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts("legacy");
  if (!active2()) return;
  for (const raw of legacyDrafts) {
    if (!raw) continue;
    const key2 = "legacy:" + raw.date;
    if (!raw || raw.category !== category || seen.has(key2)) continue;
    const item = legacy.page(raw.date);
    Object.assign(item, {
      draft: raw.draft,
      dirty: true,
      canEdit: false,
      phase: raw.phase || "error",
      pending: raw.pending || null,
      remote: raw.remote || null,
      error: "\u4FDD\u7559\u7684\u539F\u6709\u8349\u7A3F\u53EA\u8BFB\uFF0C\u53EF\u5BFC\u51FA\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u4E0A\u4F20\u3002"
    });
    legacyRecoveryGuard.remember(item);
    seen.add(key2);
  }
  hydrationReady.add(entries);
  await captureNotesDrafts(legacy, entries, category);
  await showRetainedArchive();
}
async function archivedDrafts() {
  const offline = getOfflineRuntime();
  return offline ? [...await offline.retainedDrafts("legacy"), ...await offline.retainedDrafts("note_entry")] : [];
}
var visibleArchiveFlight = null;
var visibleArchiveSequence = 0;
var visibleArchiveTimer;
function scheduleArchiveRefresh(expected, force = false) {
  if (!force && !document.querySelector("#notes-retained-archive")) return;
  clearTimeout(visibleArchiveTimer);
  visibleArchiveTimer = setTimeout(async () => {
    const revision = notesDraftRevision;
    try {
      await getOfflineRuntime()?.flushDrafts();
    } catch {
      return;
    }
    if (expected !== notesIdentityNow()) return;
    if (revision !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
    await showRetainedArchive();
  }, 300);
}
async function visibleArchive() {
  const identity4 = notesIdentityNow(), revision = notesDraftRevision;
  if (visibleArchiveFlight?.identity === identity4 && visibleArchiveFlight.revision === revision) return visibleArchiveFlight.promise;
  const promise = (async () => {
    const offline = getOfflineRuntime();
    if (!offline) return [];
    const snapshots2 = await offline.retainedDraftRecords("note_entry");
    const controller = new AbortController(), tombstones = /* @__PURE__ */ new Map();
    const active2 = () => !controller.signal.aborted && identity4 === notesIdentityNow();
    const ids = [...new Set(snapshots2.map((row) => row.data?.id).filter((id2) => /^[a-f0-9-]{36}$/i.test(id2 || "")))];
    let timer2, next2 = 0;
    await Promise.race([
      Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
        while (active2() && next2 < ids.length) {
          const id2 = ids[next2++];
          try {
            tombstones.set(id2, await apiNetwork(
              "/note-entries/" + encodeURIComponent(id2),
              { headers: { "X-Note-Labels-Version": "3" }, suppressAuthRedirect: true, signal: controller.signal }
            ));
          } catch {
          }
        }
      })),
      new Promise((resolve) => {
        timer2 = setTimeout(() => {
          controller.abort();
          resolve();
        }, 2e3);
      })
    ]).finally(() => clearTimeout(timer2));
    const rows = uniqueRetainedDrafts(snapshots2.map((record) => record.data).filter((row) => !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
    return identity4 === notesIdentityNow() ? rows.map((raw) => ({ raw, record: snapshots2.find((record) => record.data === raw) })) : [];
  })();
  visibleArchiveFlight = { identity: identity4, revision, promise };
  try {
    return await promise;
  } finally {
    if (visibleArchiveFlight?.promise === promise) visibleArchiveFlight = null;
  }
}
async function showRetainedArchive() {
  const expected = notesIdentityNow(), revision = notesDraftRevision, sequence5 = ++visibleArchiveSequence;
  const offline = getOfflineRuntime();
  const records = offline ? [...await offline.retainedDraftRecords("legacy"), ...await offline.retainedDraftRecords("note_entry")] : [];
  const root2 = document.querySelector("#daily-notes");
  if (!root2 || !notesVisible() || expected !== notesIdentityNow() || sequence5 !== visibleArchiveSequence) return;
  if (revision !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
  if (!records.length) {
    root2.querySelector("#notes-retained-archive")?.remove();
    return;
  }
  let box = root2.querySelector("#notes-retained-archive");
  if (!box) {
    box = document.createElement("details");
    box.id = "notes-retained-archive";
    box.className = "notes-drafts";
    const summary = document.createElement("summary");
    box.append(summary);
    const button2 = document.createElement("button");
    button2.className = "btn text";
    button2.type = "button";
    button2.dataset.notesAction = "export-drafts";
    button2.textContent = "\u5BFC\u51FA\u672C\u673A\u4FDD\u7559\u8349\u7A3F";
    box.append(button2);
    const body = document.createElement("div");
    body.className = "notes-retained-texts";
    box.append(body);
    box.addEventListener("toggle", async () => {
      if (!box.open || expected !== notesIdentityNow()) return;
      void showRetainedArchive();
    });
    root2.querySelector("#notes-drafts").after(box);
  }
  box.querySelector("summary").textContent = `\u672C\u673A\u4FDD\u7559\u8349\u7A3F\uFF08${records.length} \u4EFD\uFF09`;
  if (box.open) box.querySelector(".notes-retained-texts").replaceChildren(...records.map((record) => {
    const row = record.data, section = document.createElement("section"), pre = document.createElement("pre");
    pre.textContent = row && `${row.kind === "legacy" ? "\u539F\u6709\u8BB0\u5F55" : "\u6761\u76EE"} \xB7 ${row.category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"} \xB7 ${row.date}
${row.draft}`;
    const button2 = document.createElement("button");
    button2.type = "button";
    button2.className = "btn text";
    button2.textContent = "\u5220\u9664\u8FD9\u4EFD\u8349\u7A3F";
    button2.addEventListener("click", async () => {
      if (expected !== notesIdentityNow()) return;
      const activeItem = row?.kind === "note_entry" && entryStores.get(row.category)?.entry(row.id);
      if (activeItem && (activeItem.pending || activeItem.composing || activeItem.dirty && activeItem.draft === row.draft)) {
        notesDraftError = "\u8FD9\u4EFD\u8349\u7A3F\u6B63\u5728\u7F16\u8F91\u6216\u7B49\u5F85\u786E\u8BA4\uFF0C\u8BF7\u5148\u5904\u7406\u5F53\u524D\u7F16\u8F91\u5185\u5BB9\u3002";
        paintDailyNotesPage();
        return;
      }
      const preview = String(row?.draft || "").slice(0, 80);
      if (!confirm(`\u6C38\u4E45\u5220\u9664\u8FD9 1 \u4EFD\u672C\u673A\u8349\u7A3F\uFF1F\u5220\u9664\u540E\u65E0\u6CD5\u6062\u590D\u3002
${row?.category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"} \xB7 ${row?.date || ""}
${preview}`)) return;
      button2.disabled = true;
      try {
        await offline.discardSelectedDraft(record);
        if (row?.kind === "legacy" && expected === notesIdentityNow()) {
          const remaining = await offline.retainedDraftRecords("legacy");
          const item = notesStores.get(row.category)?.pages.get(row.date);
          const same2 = (candidate) => candidate.data?.category === row.category && candidate.data?.date === row.date && candidate.data?.draft === row.draft;
          if (expected === notesIdentityNow() && !remaining.some(same2) && item && legacyRecoveryGuard.unchanged(item) && item.draft === row.draft && !item.pending && !item.remote) {
            item.draft = item.serverText;
            item.dirty = false;
            item.error = "";
            item.phase = item.version ? "saved" : "empty";
            legacyRecoveryGuard.forget(item);
            paintDailyNotesPage();
          }
        }
        if (expected === notesIdentityNow()) {
          notesDraftRevision++;
          await showRetainedArchive();
        }
      } catch (error) {
        if (expected === notesIdentityNow()) {
          notesDraftError = error.message || "\u8349\u7A3F\u672A\u80FD\u5220\u9664\uFF0C\u8BF7\u91CD\u8BD5\u3002";
          paintDailyNotesPage();
          await showRetainedArchive();
        }
      } finally {
        button2.disabled = false;
      }
    });
    section.append(pre, button2);
    return section;
  }));
}
async function exportDraftArchive() {
  return toast("\u5F53\u524D\u7248\u672C\u6682\u4E0D\u652F\u6301\u6587\u4EF6\u5BFC\u51FA\uFF0C\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002", true);
  const expected = notesIdentityNow(), rows = await archivedDrafts();
  if (expected !== notesIdentityNow()) return;
  const text = JSON.stringify({ format: "haoduoyu-retained-drafts-v1", drafts: rows }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "\u597D\u591A\u9C7C\u672C\u673A\u4FDD\u7559\u8349\u7A3F.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function exportLegacyDraft(item, category) {
  return toast("\u5F53\u524D\u7248\u672C\u6682\u4E0D\u652F\u6301\u6587\u4EF6\u5BFC\u51FA\uFF0C\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002", true);
  const text = [
    "\u597D\u591A\u9C7C\u539F\u6709\u8BB0\u5F55\u8349\u7A3F\uFF08\u53EA\u8BFB\u4FDD\u7559\uFF09",
    "\u5206\u7C7B\uFF1A" + (category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B"),
    "\u65E5\u671F\uFF1A" + item.date,
    "\u72B6\u6001\uFF1A" + item.phase,
    "\u539F\u4FDD\u5B58\u6807\u8BC6\uFF1A" + (item.pending?.saveId || "\u65E0"),
    "",
    "\u5F53\u524D\u8349\u7A3F\uFF1A",
    item.draft,
    ...item.pending?.text !== void 0 ? ["", "\u539F\u672A\u786E\u8BA4\u63D0\u4EA4\uFF1A", item.pending.text] : []
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "\u539F\u6709\u788E\u788E\u5FF5\u8349\u7A3F-" + category + "-" + item.date + ".txt";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function ensureDailyNotesStore(category = dailyNotesRouteCategory(), select = true) {
  const next2 = notesIdentityNow();
  if (notesIdentity !== next2) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear();
    entryStores.clear();
    editorViews.clear();
    notesIdentity = next2;
    notesConfirmDate = "";
    notesConfirmEntry = "";
    notesRefreshPaused = false;
    notesDraftError = "";
    notesDraftRevision++;
    notesView = "today";
    historyMonth = "";
    historyDate = "";
    historyDays = /* @__PURE__ */ new Map();
    historySequence++;
    historyActiveLoad = null;
    notesSelectedLabel = "\u751F\u6D3B";
    notesLabels = [];
    notesArchivedLabels = [];
    notesLabelsVerified = false;
    notesLabelIntent = null;
    notesArchiveIntent = null;
    notesLabelBusy = false;
    notesLabelMessage = "";
    notesLabelSequence++;
    notesActiveCategory = "";
    floatingNoteId = "";
    floatingNoteDate = "";
    floatingNoteCategory = "life";
    floatingComposingId = "";
  }
  if (select && notesActiveCategory !== category) {
    if (category === "work") notesSelectedLabel = "\u5DE5\u4F5C";
    else if (notesSelectedLabel === "\u5DE5\u4F5C") notesSelectedLabel = "\u751F\u6D3B";
    notesActiveCategory = category;
    notesConfirmDate = "";
    notesConfirmEntry = "";
  }
  if (!notesStores.has(category)) {
    const expected = next2;
    const active2 = () => {
      if (notesIdentityNow() !== expected) {
        legacy.dispose();
        entries.dispose();
        throw new DOMException("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "AbortError");
      }
    };
    const request = async (path, options2) => {
      active2();
      const value = await api(path, options2);
      active2();
      return value;
    };
    const noteRequest = async (path, options2 = {}) => {
      active2();
      if (options2.method && options2.method !== "GET") {
        const date = options2.body?.date || dailyNotesRouteDate();
        await noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date));
      }
      const value = await apiNetwork(path, { ...options2, headers: { ...options2.headers, "X-Note-Labels-Version": "3" } });
      active2();
      if (value?.labels_version !== 3) throw Object.assign(
        new Error("\u670D\u52A1\u5668\u5C1A\u4E0D\u652F\u6301\u591A\u6807\u7B7E\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002"),
        { code: "NOTE_LABELS_VERSION", localNotSaved: !options2.method || options2.method === "GET" }
      );
      return value;
    };
    const noteRead = async (path) => {
      const cached = await request(path, { headers: { "X-Note-Labels-Version": "1" } });
      if (isLocalDocument(cached) || cached?.entries?.some(isLocalDocument)) return cached;
      try {
        return await noteRequest(path);
      } catch (error) {
        if (error.code === "NETWORK_UNAVAILABLE") return cached;
        throw error;
      }
    };
    const noteWrite = async (path, options2) => {
      try {
        return await noteRequest(path, options2);
      } catch (error) {
        if (error.code !== "NETWORK_UNAVAILABLE") throw error;
        const body = options2.body || {}, labels2 = body.labels;
        if (labels2)
          throw Object.assign(new Error("\u591A\u6807\u7B7E\u4FEE\u6539\u9700\u8981\u8054\u7F51\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002"), { code: "OFFLINE_MULTI_LABEL", localNotSaved: true });
        const { labels: ignored, ...legacyBody } = body;
        return request(path, { ...options2, offlineUnknown: true, body: legacyBody, headers: { "X-Note-Labels-Version": "1" } });
      }
    };
    const suffix = (separator) => category === "work" ? separator + "category=work" : "";
    const changed4 = () => {
      if (expected !== notesIdentityNow()) return;
      for (const item of entries.entries.values()) entryDraftRevision(item);
      scheduleSendFeedback(entries, expected);
      const revision = ++notesDraftRevision, saved = captureNotesDrafts(legacy, entries, category);
      if (!getOfflineRuntime()?.state.scope && [...entries.entries.values()].some((item) => item.dirty)) {
        notesDraftError = "\u672C\u673A\u8349\u7A3F\u4FDD\u5B58\u4E0D\u53EF\u7528\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u6216\u53D1\u9001\u540E\u518D\u79BB\u5F00\u3002";
      }
      if (saved) void saved.then(() => {
        if (expected !== notesIdentityNow() || revision !== notesDraftRevision || !notesDraftError || !getOfflineRuntime()?.state.scope) return;
        notesDraftError = "";
        paintDailyNotesPage();
      }).catch(() => {
        if (expected !== notesIdentityNow() || revision !== notesDraftRevision) return;
        notesDraftError = "\u8349\u7A3F\u672A\u80FD\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u5E76\u68C0\u67E5\u5B58\u50A8\u7A7A\u95F4\u3002";
        paintDailyNotesPage();
      });
      paintDailyNotesPage();
      scheduleArchiveRefresh(expected);
      return saved;
    };
    const readOnly = async () => {
      throw Object.assign(new Error("\u539F\u6709\u9010\u65E5\u8BB0\u5F55\u53EA\u8BFB\uFF0C\u8349\u7A3F\u53EF\u5BFC\u51FA\u3002"), { code: "LEGACY_READ_ONLY" });
    };
    const legacy = createDailyNotesStore({
      delay: 400,
      load: async (date) => ({ ...await request("/daily-notes?date=" + encodeURIComponent(date) + suffix("&")), can_edit: false }),
      put: readOnly,
      restore: readOnly,
      remove: readOnly,
      onChange: changed4,
      onSaved: changed4
    });
    const entries = createNoteEntriesStore({
      category,
      manualSave: true,
      multiLabels: true,
      load: (date) => noteRead("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
      loadVerified: (date) => noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
      loadEntry: (id2) => noteRead("/note-entries/" + encodeURIComponent(id2)),
      loadOperation: (id2) => noteRequest("/note-entries/operations/" + encodeURIComponent(id2)),
      put: (id2, body, options2) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options2, method: "PUT", body }),
      remove: (id2, body, options2) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options2, method: "DELETE", body }),
      restore: (id2, body, options2) => noteRequest("/note-entries/" + encodeURIComponent(id2) + "/restore", { ...options2, method: "POST", body }),
      prepareDelete: async (item) => {
        const offline = getOfflineRuntime();
        if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries)) return null;
        await offline.flushDrafts();
        if (expected !== notesIdentityNow()) throw new Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316");
        const row = { kind: "note_entry", category, ...Object.fromEntries(
          draftFields.filter((key2) => item[key2] !== void 0).map((key2) => [key2, structuredClone(item[key2])])
        ) };
        return { row, snapshots: await offline.retainedDraftRecords("note_entry") };
      },
      finishDelete: async ({ row, snapshots: snapshots2 }, result) => {
        const offline = getOfflineRuntime();
        if (offline && expected === notesIdentityNow()) {
          await offline.flushDrafts();
          await offline.purgeUserDeletedNoteDrafts(row, snapshots2, result, () => expected === notesIdentityNow());
          scheduleArchiveRefresh(expected, true);
        }
      },
      discardUnsent: async (item) => {
        const offline = getOfflineRuntime();
        if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries))
          throw new Error("\u672C\u673A\u8349\u7A3F\u6682\u4E0D\u53EF\u7528");
        await offline.flushDrafts();
        if (expected !== notesIdentityNow()) throw new Error("\u8EAB\u4EFD\u5DF2\u53D8\u5316");
        await offline.discardUnsentNoteDraft({ kind: "note_entry", category, ...Object.fromEntries(
          draftFields.filter((key2) => item[key2] !== void 0).map((key2) => [key2, item[key2]])
        ) });
      },
      onChange: changed4,
      onSaved: () => {
        changed4();
        scheduleArchiveRefresh(expected, true);
      }
    });
    entryIdentities.set(entries, expected);
    notesStores.set(category, legacy);
    entryStores.set(category, entries);
  }
  if (select) {
    notesStore = notesStores.get(category);
    entryStore = entryStores.get(category);
  }
  return notesStores.get(category);
}
async function readMixedNotes(date) {
  const expected = notesIdentityNow();
  ensureDailyNotesStore();
  for (const category of ["life", "work"]) ensureDailyNotesStore(category, false);
  const pairs = ["life", "work"].map((category) => ({ category, legacy: notesStores.get(category), entries: entryStores.get(category) }));
  await Promise.all(pairs.flatMap(({ legacy, entries }) => [legacy.read(date), entries.read(date)]));
  if (expected !== notesIdentityNow()) return;
  await Promise.all(pairs.map(({ category, legacy, entries }) => hydrateNotesDrafts(legacy, entries, category)));
  if (expected === notesIdentityNow() && date === dailyNotesRouteDate()) paintDailyNotesPage();
}
function retainedDrafts() {
  const result = [];
  for (const [category, store] of notesStores) for (const item of store.pages.values()) {
    if (item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase)) result.push({ category, ...item });
  }
  for (const [category, store] of entryStores) for (const item of store.entries.values()) {
    if (item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase)) result.push({ category, ...item });
  }
  return result;
}
function joinNotesErrors(values) {
  const messages = values.filter(Boolean).map(String);
  return messages.map((message, index) => index < messages.length - 1 ? message.replace(/[。；]+$/u, "") : message).join("\uFF1B");
}
function paintDailyNotesPage() {
  for (const callback of floatingNoteObservers) callback();
  if (!notesVisible() || notesRefreshPaused) return;
  const root2 = document.querySelector("#daily-notes");
  if (!root2 || !notesStore || !entryStore) return;
  root2.querySelector("#notes-today").hidden = notesView !== "today";
  root2.querySelector("#notes-history").hidden = notesView !== "history";
  root2.querySelector("#notes-labels").hidden = notesView !== "labels";
  for (const button2 of root2.querySelectorAll("[data-notes-view]"))
    button2.setAttribute("aria-pressed", String(button2.dataset.notesView === notesView));
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current3 = entryStore.page(date);
  root2.querySelector("#notes-label-status").textContent = notesLabelMessage;
  const archivedNames = new Set(notesArchivedLabels.map((row) => row.name));
  const activeLabels = [.../* @__PURE__ */ new Set(["\u751F\u6D3B", "\u5DE5\u4F5C", ...notesLabels])].filter((name) => !archivedNames.has(name));
  const paintLabels = (selector, names, action, buttonText) => {
    const list2 = root2.querySelector(selector);
    list2.replaceChildren(...names.map((name) => {
      const item = document.createElement("li"), text = document.createElement("span"), button2 = document.createElement("button");
      text.textContent = name;
      button2.type = "button";
      button2.className = "btn text";
      button2.dataset.notesAction = action;
      button2.dataset.labelName = name;
      button2.textContent = buttonText;
      button2.setAttribute("aria-label", buttonText + "\u6807\u7B7E " + name);
      button2.disabled = notesLabelBusy || !notesLabelsVerified;
      item.append(text, button2);
      return item;
    }));
  };
  paintLabels("#notes-label-list", activeLabels, "delete-label", "\u5220\u9664");
  root2.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy || !notesLabelsVerified;
  const otherCategory = category === "life" ? "work" : "life";
  const otherStore = entryStores.get(otherCategory), otherLegacy = notesStores.get(otherCategory)?.page(date);
  const otherPage = otherStore?.page(date);
  const mixedStore = { entry: (id2) => entryStore.entry(id2) || otherStore?.entry(id2) };
  const mixed = {
    ...current3,
    ids: [...current3.ids, ...otherPage?.ids || []],
    error: joinNotesErrors([
      current3.error,
      otherPage?.error && (otherCategory === "work" ? "\u5DE5\u4F5C\uFF1A" : "\u751F\u6D3B\uFF1A") + otherPage.error,
      legacy.error && (category === "work" ? "\u5DE5\u4F5C\u539F\u8BB0\u5F55\uFF1A" : "\u751F\u6D3B\u539F\u8BB0\u5F55\uFF1A") + legacy.error,
      otherLegacy?.error && (otherCategory === "work" ? "\u5DE5\u4F5C\u539F\u8BB0\u5F55\uFF1A" : "\u751F\u6D3B\u539F\u8BB0\u5F55\uFF1A") + otherLegacy.error
    ]),
    loading: current3.loading || Boolean(otherPage?.loading) || legacy.loading || Boolean(otherLegacy?.loading),
    allLoaded: current3.loaded && Boolean(otherPage?.loaded) && legacy.loaded && Boolean(otherLegacy?.loaded) && !current3.error && !otherPage?.error && !legacy.error && !otherLegacy?.error
  };
  mixed.ids.sort((a, b) => {
    const first = mixedStore.entry(a), second = mixedStore.entry(b);
    return String(first?.createdAt || first?.localCreatedAt || "").localeCompare(String(second?.createdAt || second?.localCreatedAt || "")) || a.localeCompare(b);
  });
  const host = root2.querySelector("#notes-composer"), view2 = editorViews.page(category, date), active2 = view2.active;
  const field2 = active2 === "legacy" ? root2.querySelector("#notes-editor") : host.querySelector('[data-note-entry-editor="' + active2 + '"]');
  const selected = editorViews.sync(
    category,
    date,
    mixed.ids.map((id2) => mixedStore.entry(id2)).filter(Boolean),
    legacy,
    { focused: host.contains(document.activeElement), composing: field2?.dataset.composing === "true" }
  );
  paintNoteEntries(
    root2,
    mixedStore,
    mixed,
    legacy,
    { drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active, otherLegacy, otherCategory, labels: activeLabels, labelsVerified: notesLabelsVerified }
  );
  if (notesDraftError) {
    const message = root2.querySelector("#notes-entry-message");
    message.textContent = notesDraftError;
    message.hidden = false;
  }
  if (mixed.ids.some((id2) => mixedStore.entry(id2)?.category === "life" && !mixedStore.entry(id2)?.labelKnown)) {
    const message = root2.querySelector("#notes-entry-message");
    if (message.hidden) {
      message.textContent = "\u90E8\u5206\u8BB0\u5F55\u6807\u7B7E\u5C1A\u672A\u6838\u5B9E\uFF0C\u8BF7\u8054\u7F51\u8BFB\u53D6\u540E\u67E5\u770B\u3002";
      message.hidden = false;
    }
  }
  root2.querySelector("#notes-delete-confirm").hidden = true;
}
async function readNoteLabels({ afterWrite = false } = {}) {
  if (notesLabelBusy && !afterWrite) return false;
  const expected = notesIdentityNow(), sequence5 = ++notesLabelSequence;
  try {
    const data2 = await apiNetwork("/note-entries/labels", { headers: { "X-Note-Labels-Version": "3", "X-Note-Labels-Archive": "1" } });
    if (expected !== notesIdentityNow() || sequence5 !== notesLabelSequence) return;
    if (data2?.labels_version !== 3 || !Array.isArray(data2?.labels) || !Array.isArray(data2?.archived_labels) || data2.labels.some((row) => !validCustomNoteLabel(row?.name)) || data2.archived_labels.some((row) => typeof row?.name !== "string" || !(row.name === "\u751F\u6D3B" || row.name === "\u5DE5\u4F5C" || validCustomNoteLabel(row.name)) || typeof row.archived_at !== "string" || !Number.isFinite(Date.parse(row.archived_at))))
      throw new Error("\u670D\u52A1\u5668\u672A\u63D0\u4F9B\u53EF\u6838\u5B9E\u7684\u5F52\u6863\u72B6\u6001\u3002");
    notesLabels = [...new Set(data2.labels.map((row) => row.name))];
    notesArchivedLabels = [...new Map(data2.archived_labels.map((row) => [row.name, row])).values()];
    notesLabelsVerified = true;
    notesLabelMessage = "";
    paintDailyNotesPage();
    return true;
  } catch (error) {
    if (expected !== notesIdentityNow() || sequence5 !== notesLabelSequence) return;
    notesLabelsVerified = false;
    notesLabelMessage = "\u6807\u7B7E\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u8054\u7F51\u540E\u91CD\u65B0\u6253\u5F00\u6807\u7B7E\u7BA1\u7406\uFF1A" + (error.message || "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
  }
  paintDailyNotesPage();
  return false;
}
function confirmLabelDeletion(name) {
  if (!name || notesLabelBusy || !notesLabelsVerified) return false;
  const builtin = name === "\u751F\u6D3B" || name === "\u5DE5\u4F5C";
  const consequence = builtin ? "\u6B64\u6807\u7B7E\u5C06\u4ECE\u53EF\u9009\u5217\u8868\u9690\u85CF\uFF0C\u5386\u53F2\u8BB0\u5F55\u548C\u6807\u7B7E\u5173\u8054\u4F1A\u4FDD\u7559\u3002" : "\u6B64\u6807\u7B7E\u53CA\u5DF2\u6709\u8BB0\u5F55\u4E2D\u7684\u6807\u7B7E\u5173\u8054\u5C06\u88AB\u6C38\u4E45\u5220\u9664\uFF0C\u6B63\u6587\u4FDD\u7559\u3002\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002";
  return window.confirm("\u786E\u5B9A\u5220\u9664\u6807\u7B7E\u201C" + name + "\u201D\u5417\uFF1F\n\n" + consequence);
}
async function deleteNoteLabel(name) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  if (!notesArchiveIntent || notesArchiveIntent.name !== name || notesArchiveIntent.action !== "delete")
    notesArchiveIntent = { name, action: "delete", save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesArchiveIntent, date = dailyNotesRouteDate();
  ++notesLabelSequence;
  notesLabelBusy = true;
  notesLabelMessage = "";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", {
      method: "POST",
      body: intent,
      headers: { "X-Note-Labels-Version": "3", "X-Note-Labels-Archive": "1" }
    });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 3 || saved.name !== name || saved.deleted !== true || !["deleted", "builtin-hidden"].includes(saved.mode)) throw new Error("\u670D\u52A1\u5668\u8FD4\u56DE\u7684\u72B6\u6001\u65E0\u6CD5\u6838\u5B9E\u3002");
    ++notesLabelSequence;
    notesLabelsVerified = false;
    const verified = await readNoteLabels({ afterWrite: true });
    if (expected !== notesIdentityNow()) return;
    if (verified) {
      const active2 = ["\u751F\u6D3B", "\u5DE5\u4F5C", ...notesLabels].includes(name) && !notesArchivedLabels.some((row) => row.name === name);
      if (active2) notesLabelMessage = "\u5220\u9664\u7ED3\u679C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u6838\u5BF9\u5F53\u524D\u6807\u7B7E\u3002";
      else {
        notesArchiveIntent = null;
        await readMixedNotes(date);
      }
    }
  } catch (error) {
    ++notesLabelSequence;
    if (expected === notesIdentityNow()) notesLabelMessage = "\u5220\u9664\u7ED3\u679C\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u8BD5\u6216\u91CD\u65B0\u6253\u5F00\u6807\u7B7E\u7BA1\u7406\u6838\u5B9E\uFF1A" + (error.message || "\u8BF7\u8054\u7F51\u540E\u91CD\u8BD5\u3002");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
async function createNoteLabel(root2) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  const input = root2.querySelector("#notes-new-label"), label3 = input.value.trim().normalize("NFC");
  if (!validCustomNoteLabel(label3)) {
    notesLabelMessage = "\u6807\u7B7E\u987B\u4E3A 1\u201332 \u4E2A\u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u53EB\u751F\u6D3B\u6216\u5DE5\u4F5C\u3002";
    paintDailyNotesPage();
    return;
  }
  if (notesArchivedLabels.some((row) => row.name === label3)) {
    notesLabelMessage = "\u8BE5\u6807\u7B7E\u540D\u79F0\u6682\u4E0D\u53EF\u7528\u3002";
    paintDailyNotesPage();
    return;
  }
  if (!notesLabelIntent || notesLabelIntent.name !== label3) notesLabelIntent = { name: label3, save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesLabelIntent;
  ++notesLabelSequence;
  notesLabelBusy = true;
  notesLabelMessage = "\u6B63\u5728\u6DFB\u52A0\u6807\u7B7E\u2026";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", { method: "POST", body: intent, headers: { "X-Note-Labels-Version": "2" } });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 2 || saved.name !== label3) throw new Error("\u6807\u7B7E\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u6838\u5B9E\uFF0C\u8BF7\u91CD\u8BD5\u539F\u8BF7\u6C42\u3002");
    notesLabels = [.../* @__PURE__ */ new Set([...notesLabels, label3])];
    notesLabelIntent = null;
    notesLabelMessage = "";
    input.value = "";
  } catch (error) {
    if (expected === notesIdentityNow()) notesLabelMessage = "\u6DFB\u52A0\u5931\u8D25\uFF0C\u8F93\u5165\u5DF2\u4FDD\u7559\uFF0C\u53EF\u91CD\u8BD5\uFF1A" + (error.message || "\u8BF7\u8054\u7F51\u540E\u91CD\u8BD5\u3002");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
function monthTime(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "";
}
function monthOptions(select, values, current3, allLabel) {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || allLabel;
    return option;
  }));
  select.value = values.includes(current3) ? current3 : "";
}
function makeMonthCard(date, items, selected) {
  const button2 = document.createElement("button");
  button2.type = "button";
  button2.className = "notes-calendar-day";
  if (!date) {
    button2.disabled = true;
    button2.classList.add("is-empty");
    return button2;
  }
  button2.dataset.notesHistoryDay = date;
  button2.setAttribute("aria-pressed", String(date === selected));
  button2.setAttribute("aria-label", date + "\uFF0C" + items.length + " \u6761\u8BB0\u5F55");
  const heading = document.createElement("span");
  heading.className = "notes-calendar-day-heading";
  heading.textContent = String(Number(date.slice(8)));
  button2.append(heading);
  return button2;
}
function paintHistoryRows(root2) {
  const label3 = root2.querySelector("#notes-history-label").value, weekValue = root2.querySelector("#notes-history-week").value;
  const weeks = noteMonthWeeks(historyMonth), selected = root2.querySelector("#notes-history-date").value;
  historyDate = selected;
  const grid = root2.querySelector("#notes-history-grid"), list2 = root2.querySelector("#notes-history-list");
  const shown = (item) => !label3 || (item.displayLabels || [item.displayLabel]).includes(label3);
  const visibleWeeks = weeks.filter((_, index) => !weekValue || Number(weekValue) === index + 1);
  grid.replaceChildren(...visibleWeeks.flatMap((week) => week.map((date) => makeMonthCard(date, (historyDays.get(date) || []).filter(shown), selected))));
  const timeline = root2.dataset.historyDisplay === "timeline";
  root2.querySelector(".notes-calendar-weekdays").hidden = timeline;
  grid.hidden = timeline;
  const order = root2.dataset.historyOrder === "asc" ? "asc" : "desc";
  const orderButton = root2.querySelector("[data-history-order]");
  orderButton.hidden = !timeline;
  orderButton.dataset.historyOrder = order;
  orderButton.textContent = order === "asc" ? "\u65F6\u95F4\uFF1A\u4ECE\u65E7\u5230\u65B0" : "\u65F6\u95F4\uFF1A\u4ECE\u65B0\u5230\u65E7";
  const card = (row) => {
    const article = document.createElement("article");
    article.className = "note-entry note-entry-saved";
    const heading = document.createElement("div");
    heading.className = "note-entry-head";
    heading.textContent = [row.displayLabel, monthTime(row.updated_at)].filter(Boolean).join(" \xB7 ");
    const text = document.createElement("div");
    text.className = "note-entry-reader";
    text.textContent = row.text;
    article.append(heading, text);
    return article;
  };
  let rows;
  if (timeline) {
    const direction = order === "asc" ? 1 : -1;
    const groups = [...historyDays.entries()].sort(([a], [b]) => direction * a.localeCompare(b)).map(([date, items]) => [date, items.filter(shown).sort((a, b) => direction * String(a.updated_at || "").localeCompare(String(b.updated_at || "")))]).filter(([, items]) => items.length);
    rows = groups.flatMap(([, items]) => items);
    list2.replaceChildren(...groups.map(([date, items]) => {
      const section = document.createElement("section");
      section.className = "notes-timeline-day";
      const heading = document.createElement("h3");
      heading.className = "notes-timeline-date";
      heading.textContent = date;
      section.append(heading, ...items.map(card));
      return section;
    }));
  } else {
    rows = (historyDays.get(selected) || []).filter(shown);
    list2.replaceChildren(...rows.map(card));
  }
  const total = [...historyDays.values()].flat().filter(shown).length;
  root2.querySelector("#notes-history-summary").textContent = historyMonth + " \xB7 " + total + " \u6761\u5DF2\u540C\u6B65\u8BB0\u5F55";
  root2.querySelector("#notes-history-status").textContent = rows.length ? "\u5F85\u540C\u6B65\u5185\u5BB9\u8BF7\u5728\u539F\u65E5\u671F\u67E5\u770B\u3002" : !total && !label3 ? "\u672C\u6708\u6CA1\u6709\u5DF2\u540C\u6B65\u8BB0\u5F55\u3002" : "\u6240\u9009\u65E5\u671F\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5DF2\u540C\u6B65\u8BB0\u5F55\u3002";
}
function applyHistoryMonth(root2, month, days, chosenDate) {
  const weeks = noteMonthWeeks(month), dates = weeks.flat().filter(Boolean);
  const dateSelect = root2.querySelector("#notes-history-date"), labelSelect = root2.querySelector("#notes-history-label");
  const oldLabel = labelSelect.value, oldDate = dateSelect.value;
  const selected = dates.includes(chosenDate) ? chosenDate : dates.includes(oldDate) ? oldDate : dates[0];
  historyMonth = month;
  historyDays = days;
  root2.dataset.historyLoadedMonth = month;
  root2.querySelector("#notes-history-month").value = month;
  monthOptions(dateSelect, dates, selected, "");
  monthOptions(root2.querySelector("#notes-history-week"), ["", ...weeks.map((_, index) => String(index + 1))], "", "\u5168\u90E8\u5468\u6B21");
  const labels2 = ["", .../* @__PURE__ */ new Set(["\u751F\u6D3B", "\u5DE5\u4F5C", ...[...days.values()].flat().flatMap((row) => row.displayLabels || [row.displayLabel])])];
  monthOptions(labelSelect, labels2, oldLabel, "\u5168\u90E8\u6807\u7B7E");
  paintHistoryRows(root2);
}
async function loadHistory(month = "", chosenDate = "") {
  const root2 = document.querySelector("#daily-notes"), expected = notesIdentityNow();
  if (!root2) return;
  const target = month || historyMonth || dailyNotesToday().slice(0, 7);
  if (coalesceNoteMonthFlight(historyActiveLoad, { root: root2, target, expected, sequence: historySequence, chosenDate })) return;
  const sequence5 = ++historySequence;
  historyActiveLoad = { root: root2, target, expected, sequence: sequence5, chosenDate };
  const active2 = () => notesVisible() && notesView === "history" && sequence5 === historySequence && expected === notesIdentityNow();
  const status = root2.querySelector("#notes-history-status");
  status.textContent = "";
  try {
    const value = await apiNetwork(
      "/note-entries/month?month=" + encodeURIComponent(target),
      { headers: { "X-Note-Labels-Version": "3" } }
    );
    const days = checkedNoteMonth(value, target);
    if (!active2()) return;
    applyHistoryMonth(root2, target, days, historyActiveLoad.chosenDate || historyDate || dailyNotesRouteDate());
  } catch (error) {
    if (!active2()) return;
    status.textContent = "\u6708\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FDD\u7559\u5F53\u524D\u5185\u5BB9\uFF1A" + (error.message || "\u8BF7\u8054\u7F51\u91CD\u8BD5\u3002");
    if (historyMonth) root2.querySelector("#notes-history-month").value = historyMonth;
  } finally {
    if (historyActiveLoad?.sequence === sequence5) historyActiveLoad = null;
  }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore();
  notesConfirmDate = "";
  notesConfirmEntry = "";
  setDailyNotesRouteDate(value);
  updateRoute(true);
  paintDailyNotesPage();
  await readMixedNotes(value);
}
function shiftedNotesDate(date, delta) {
  return new Date(Date.parse(date + "T12:00:00Z") + delta * 864e5).toISOString().slice(0, 10);
}
function openEditor(key2) {
  editorViews.activate(dailyNotesRouteCategory(), dailyNotesRouteDate(), key2);
  paintDailyNotesPage();
  const editor = key2 === "legacy" ? document.querySelector("#notes-editor") : document.querySelector('#notes-active-entry [data-note-entry-editor="' + key2 + '"]');
  editor?.focus();
  document.querySelector("#notes-composer")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}
function registerNotesInputEvents() {
  document.addEventListener("input", (event) => {
    if (!notesVisible()) return;
    const composing = event.isComposing || event.target.dataset.composing === "true";
    if (event.target.id === "notes-editor") notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value, { composing });
    else if (event.target.dataset.noteEntryEditor) {
      entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value, { composing });
    }
  });
  document.addEventListener("compositionstart", (event) => {
    if (notesVisible() && (event.target.id === "notes-editor" || event.target.dataset.noteEntryEditor)) event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (event.target.id !== "notes-editor" && !event.target.dataset.noteEntryEditor) return;
    event.target.dataset.composing = "false";
    if (!notesVisible()) return;
    if (event.target.id === "notes-editor") notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value);
    else entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value);
  });
  document.addEventListener("change", async (event) => {
    if (notesVisible() && event.target.dataset.noteLabel) {
      const itemId = event.target.dataset.noteLabel, source = [...entryStores.values()].find((store) => store.entry(itemId));
      const selected = [...event.target.closest(".note-entry-label-options").querySelectorAll("input:checked")].map((input) => input.value);
      if (!source?.relabelDraft(itemId, selected)) paintDailyNotesPage();
    } else if (notesVisible() && event.target.id === "notes-date") void selectDailyNotesDate(event.target.value);
    else if (notesVisible() && event.target.id === "notes-history-date") {
      const root2 = event.target.closest("#daily-notes"), week = root2.querySelector("#notes-history-week");
      if (week.value && !noteMonthWeeks(historyMonth)[Number(week.value) - 1]?.includes(event.target.value)) week.value = "";
      paintHistoryRows(root2);
    } else if (notesVisible() && event.target.id === "notes-history-week") {
      const root2 = event.target.closest("#daily-notes"), week = Number(event.target.value);
      const date = root2.querySelector("#notes-history-date"), dates = noteMonthWeeks(historyMonth)[week - 1];
      if (dates && !dates.includes(date.value)) date.value = dates.find(Boolean);
      paintHistoryRows(root2);
    } else if (notesVisible() && event.target.id === "notes-history-label") paintHistoryRows(event.target.closest("#daily-notes"));
    else if (notesVisible() && event.target.id === "notes-history-month" && validNoteMonth(event.target.value)) void loadHistory(event.target.value);
  });
}
async function handleEntryAction(target, entries) {
  const id2 = target.closest("[data-note-entry]")?.dataset.noteEntry, item = entries.entry(id2);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === "edit") openEditor(id2);
  else if (action === "save") {
    const attempt = /* @__PURE__ */ Symbol("note-send");
    item.manualSubmitted = attempt;
    const category = dailyNotesRouteCategory(), date = dailyNotesRouteDate();
    const revision = editorViews.page(category, date).revision;
    await entries.save(id2);
    if (!item.dirty && !item.pending && ["saved", "queued", "cached"].includes(item.phase)) {
      editorViews.requestCollapse(category, date, id2, revision, { explicit: true });
    }
    paintDailyNotesPage();
  } else if (action === "restore") await entries.restoreEntry(id2);
  else if (action === "delete") {
    notesConfirmEntry = id2;
    paintDailyNotesPage();
  } else if (action === "cancel-delete") {
    notesConfirmEntry = "";
    paintDailyNotesPage();
  } else if (action === "confirm-delete") {
    const view2 = editorViews.page(item.category, item.date), revision = view2.revision;
    notesConfirmEntry = "";
    await entries.deleteEntry(id2);
    if ((!entries.entry(id2) || entries.entry(id2).deleted && !entries.entry(id2).pending) && view2.active === id2 && view2.revision === revision)
      editorViews.activate(item.category, item.date, "");
    paintDailyNotesPage();
  } else if (action === "check") {
    if (item.phase === "unknown") await entries.reconcile(id2);
    else await entries.readOne(id2);
  } else if (action === "retry") await entries.retryPending(id2);
  else if (action === "use-server") entries.useServer(id2);
  else if (action === "use-draft") await entries.useDraft(id2);
}
async function handleNotesClick(event) {
  if (!notesVisible() || notesRefreshPaused) return;
  const root2 = document.querySelector("#daily-notes");
  const target = event.target.closest("[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action],[data-notes-view],[data-notes-month],[data-notes-history-day],[data-history-display],[data-history-order]");
  if (!target || !root2?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.historyOrder) {
    root2.dataset.historyOrder = target.dataset.historyOrder === "asc" ? "desc" : "asc";
    if (historyMonth) paintHistoryRows(root2);
    return;
  }
  if (target.dataset.historyDisplay) {
    root2.dataset.historyDisplay = target.dataset.historyDisplay;
    for (const button2 of root2.querySelectorAll("[data-history-display]")) button2.setAttribute("aria-pressed", String(button2 === target));
    if (historyMonth) paintHistoryRows(root2);
    return;
  }
  if (target.dataset.notesMonth) {
    const month = historyMonth || dailyNotesToday().slice(0, 7);
    await loadHistory(shiftNoteMonth(month, target.dataset.notesMonth === "prev" ? -1 : 1));
    return;
  }
  if (target.dataset.notesHistoryDay) {
    root2.querySelector("#notes-history-date").value = target.dataset.notesHistoryDay;
    paintHistoryRows(root2);
    return;
  }
  if (target.dataset.notesView) {
    notesView = ["history", "labels"].includes(target.dataset.notesView) ? target.dataset.notesView : "today";
    historySequence++;
    paintDailyNotesPage();
    if (notesView === "history") await loadHistory();
    else if (notesView === "labels") await readNoteLabels();
    return;
  }
  if (target.dataset.notesCategory) {
    notesSelectedLabel = target.dataset.notesCategory === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B";
    setDailyNotesRouteCategory(target.dataset.notesCategory);
    updateRoute(true);
    renderShell();
    return;
  }
  if (target.dataset.notesDate) {
    if (target.dataset.notesDraftCategory && target.dataset.notesDraftCategory !== dailyNotesRouteCategory()) {
      notesSelectedLabel = target.dataset.notesDraftCategory === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B";
      setDailyNotesRouteCategory(target.dataset.notesDraftCategory);
      setDailyNotesRouteDate(target.dataset.notesDate);
      updateRoute(true);
      renderShell();
    } else await selectDailyNotesDate(target.dataset.notesDate);
    return;
  }
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  if (target.dataset.noteEntryAction) {
    const id2 = target.closest("[data-note-entry]")?.dataset.noteEntry;
    const owner2 = [...entryStores.values()].find((candidate) => candidate.entry(id2));
    if (owner2) await handleEntryAction(target, owner2);
    return;
  }
  if (target.dataset.notesAction === "edit-other-legacy") {
    const category = target.dataset.legacyCategory;
    if (!["life", "work"].includes(category)) return;
    notesSelectedLabel = category === "work" ? "\u5DE5\u4F5C" : "\u751F\u6D3B";
    setDailyNotesRouteCategory(category);
    updateRoute(true);
    ensureDailyNotesStore();
    root2.dataset.category = category;
    openEditor("legacy");
    return;
  }
  if (target.dataset.notesAction === "export-other-legacy") {
    const category = target.dataset.legacyCategory;
    if (["life", "work"].includes(category)) exportLegacyDraft(notesStores.get(category).page(date), category);
    return;
  }
  const action = target.dataset.notesAction;
  if (action === "new") {
    const item = entries.start(date);
    if (item) openEditor(item.id);
  } else if (action === "create-label") await createNoteLabel(root2);
  else if (action === "delete-label" && confirmLabelDeletion(target.dataset.labelName)) await deleteNoteLabel(target.dataset.labelName);
  else if (action === "edit-legacy") openEditor("legacy");
  else if (action === "collapse") {
    const { active: active2, revision } = editorViews.page(dailyNotesRouteCategory(), date);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date, active2, revision, { explicit: true });
    paintDailyNotesPage();
  } else if (action === "previous" || action === "next") await selectDailyNotesDate(shiftedNotesDate(date, action === "previous" ? -1 : 1));
  else if (action === "login") renderLogin();
  else if (action === "today") await selectDailyNotesDate(dailyNotesToday());
  else if (action === "export-legacy") exportLegacyDraft(store.page(date), dailyNotesRouteCategory());
  else if (action === "export-drafts") await exportDraftArchive();
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true;
  registerNotesInputEvents();
  registerConflictDraftGuard(createNoteConflictDraftGuard({
    getStores: () => entryStores,
    getIdentity: notesIdentityNow,
    getComposing: (id2) => floatingComposingId === id2 || document.querySelector('[data-note-entry-editor="' + id2 + '"]')?.dataset.composing === "true"
  }));
  window.addEventListener("haoduoyu:capture-current-editors", (event) => {
    const detail = event.detail, expected = notesIdentity, root2 = document.querySelector("#daily-notes");
    if (!detail?.localSnapshot || expected !== notesIdentityNow()) return;
    for (const field2 of root2?.querySelectorAll("[data-note-entry-editor],#notes-editor") || []) {
      const raw = detail.snapshot(field2), category = raw.dataset.category, legacy = raw.id === "notes-editor";
      const id2 = legacy ? raw.dataset.date : raw.dataset.noteEntryEditor;
      const store = (legacy ? notesStores : entryStores).get(category);
      detail.stage({
        field: field2,
        key: JSON.stringify([legacy ? "legacy" : "entry", expected, category, id2]),
        valid: () => Boolean(store && notesIdentityNow() === expected && notesIdentity === expected && (legacy ? notesStores : entryStores).get(category) === store && document.querySelector("#daily-notes") === root2),
        apply: (value) => store.edit(id2, value.value, { composing: value.composing })
      });
    }
  });
  window.addEventListener("haoduoyu:before-refresh", (event) => {
    if (typeof event.detail?.waitUntil !== "function" || notesIdentity !== notesIdentityNow()) return;
    const resumes = [], expected = notesIdentityNow(), root2 = document.querySelector("#daily-notes");
    const controls = [...root2?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
    const field2 = root2?.querySelector("#notes-active-entry textarea"), readOnly = field2?.readOnly;
    const wasInert = root2?.inert;
    notesRefreshPaused = true;
    if (root2) root2.inert = true;
    for (const [control] of controls) control.disabled = true;
    if (field2) field2.readOnly = true;
    event.detail.onFailure?.(() => {
      for (const resume of resumes) resume();
      if (expected !== notesIdentityNow()) return;
      notesRefreshPaused = false;
      if (root2) root2.inert = wasInert;
      for (const [control, disabled] of controls) control.disabled = disabled;
      if (field2) field2.readOnly = readOnly;
      paintDailyNotesPage();
    });
    try {
      for (const store of entryStores.values()) resumes.push(store.pauseAutosave());
      if (!event.detail.localSnapshot) {
        if (field2) entryStores.get(field2.dataset.category)?.edit(
          field2.dataset.noteEntryEditor,
          field2.value,
          { composing: field2.dataset.composing === "true" }
        );
      }
      const offline = getOfflineRuntime();
      const writes = [...notesStores.keys()].map((category) => captureNotesDrafts(notesStores.get(category), entryStores.get(category), category));
      event.detail.waitUntil(Promise.allSettled(writes).then((results) => {
        const failed = results.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
        return offline?.flushDrafts();
      }).then(() => {
        if (expected !== notesIdentityNow()) throw new Error("REFRESH_IDENTITY_CHANGED");
      }));
    } catch (error) {
      event.detail.waitUntil(Promise.reject(error));
    }
  });
  onOfflineRuntime((offline) => {
    let signature2 = "";
    offline.subscribe((value) => {
      const next2 = JSON.stringify([value.pending, value.conflicts, value.lastSuccess, value.phase]);
      if (next2 === signature2 || value.phase === "syncing") return;
      signature2 = next2;
      if (notesVisible()) {
        for (const entries of entryStores.values())
          if (hydrationReady.has(entries)) void entries.read(dailyNotesRouteDate(), { localOnly: true });
      }
    });
  });
  document.addEventListener("click", (event) => {
    void handleNotesClick(event);
  });
  window.addEventListener("beforeunload", (event) => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if (retainedDrafts().some((item) => item.dirty || item.pending || item.phase === "unknown")) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
async function loadDailyNotes() {
  registerDailyNotesEvents();
  setDailyNotesRouteDate(dailyNotesRouteDate());
  ensureDailyNotesStore();
  const date = dailyNotesRouteDate(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected !== notesIdentityNow()) return;
  const historyRoot = document.querySelector("#daily-notes");
  if (notesView === "history" && (!historyMonth || historyRoot?.dataset.historyLoadedMonth !== historyMonth))
    void loadHistory(historyMonth, historyDate);
}
function selectedFloatingEntry(store, id2, date) {
  const item = id2 && store?.entry(id2);
  return item && item.date === date && !item.deleted ? item : null;
}
function captureLocalFloatingNote(detail, field2, composing) {
  const expected = notesIdentity, category = floatingNoteCategory, selectedId = floatingNoteId, selectedDate2 = floatingNoteDate;
  const store = entryStores.get(category), item = selectedFloatingEntry(store, selectedId, selectedDate2);
  const raw = detail.snapshot(field2), id2 = item?.id;
  detail.stage({
    field: field2,
    key: JSON.stringify(["entry", expected, category, id2 || "empty-floating"]),
    composing,
    valid: () => expected === notesIdentityNow() && expected === notesIdentity && store === entryStores.get(category) && selectedId === floatingNoteId && selectedDate2 === floatingNoteDate && category === floatingNoteCategory && Boolean(item || raw.value === ""),
    apply: (value) => {
      if (item) store.edit(id2, value.value, { composing: value.composing });
    }
  });
}
function floatingNotesSnapshot() {
  if (notesIdentity !== notesIdentityNow()) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory), page2 = entryStores.get("life")?.page(date);
  const item = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  const entries = [], errors = [];
  for (const category of ["life", "work"]) {
    const source = entryStores.get(category), current3 = source?.page(date);
    if (current3?.error) errors.push(current3.error);
    for (const id2 of current3?.ids || []) {
      const value = source.entry(id2);
      if (value && !value.deleted && (value.version || value.localVersion || value.dirty || value.pending)) entries.push(value);
    }
    const legacy = notesStores.get(category)?.page(date);
    if (legacy?.error) errors.push(legacy.error);
    if (legacy && (!legacy.deleted || legacy.dirty || legacy.pending) && (legacy.version || legacy.dirty || legacy.pending))
      entries.push({
        id: "legacy-" + category,
        category,
        legacy: true,
        draft: legacy.dirty ? legacy.draft : legacy.serverText,
        updatedAt: legacy.updatedAt
      });
  }
  entries.sort((a, b) => String(a.createdAt || a.localCreatedAt || a.updatedAt || "").localeCompare(
    String(b.createdAt || b.localCreatedAt || b.updatedAt || "")
  ));
  const archived = new Set(notesArchivedLabels.map((row) => row.name));
  return {
    date,
    page: page2,
    item,
    entries,
    error: errors.join("\uFF1B"),
    labels: [.../* @__PURE__ */ new Set(["\u751F\u6D3B", "\u5DE5\u4F5C", ...notesLabels])].filter((name) => !archived.has(name)),
    labelsVerified: notesLabelsVerified,
    labelError: notesLabelMessage,
    draftError: notesDraftError
  };
}
async function loadFloatingNotes() {
  if (!state.me) return;
  registerDailyNotesEvents();
  ensureDailyNotesStore();
  const date = dailyNotesToday(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected === notesIdentityNow()) {
    floatingNoteEntry(false);
    paintDailyNotesPage();
  }
}
function floatingNoteEntry(create = false) {
  if (!state.me || notesIdentity !== notesIdentityNow() || notesRefreshPaused) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory);
  if (!store) return null;
  const selected = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  if (selected) return selected;
  const page2 = store.page(date);
  const candidate = page2.ids.map((id2) => store.entry(id2)).find((item2) => item2 && !item2.version && !item2.localVersion && (item2.dirty || item2.pending || ["unknown", "conflict", "error", "oversize"].includes(item2.phase)));
  const item = candidate || (create ? store.start(date) : null);
  if (item) {
    floatingNoteId = item.id;
    floatingNoteDate = date;
  }
  return item;
}
function hasFloatingNoteDraft() {
  return retainedDrafts().some((item) => item.dirty || item.pending || item.phase === "unknown");
}
function selectFloatingNote(id2, category) {
  if (!["life", "work"].includes(category) || notesIdentity !== notesIdentityNow()) return;
  const item = entryStores.get(category)?.entry(id2);
  if (!item || item.date !== dailyNotesToday() || item.deleted) return;
  floatingNoteId = id2;
  floatingNoteDate = item.date;
  floatingNoteCategory = category;
  paintDailyNotesPage();
}
function newFloatingNote() {
  floatingNoteId = "";
  floatingNoteDate = "";
  floatingNoteCategory = "life";
  floatingNoteEntry(true);
  paintDailyNotesPage();
}
function markFloatingNoteComposing(value) {
  floatingComposingId = value ? floatingNoteId : "";
}
function editFloatingNote(text, composing = false) {
  const item = floatingNoteEntry(true);
  if (item) entryStores.get(item.category).edit(item.id, text, { composing });
}
function labelFloatingNote(labels2) {
  const item = floatingNoteEntry(true);
  if (!item || !notesLabelsVerified) return false;
  return entryStores.get(item.category).relabelDraft(item.id, labels2);
}
async function sendFloatingNote() {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store || item.date !== dailyNotesToday()) return;
  const selectedId = floatingNoteId, selectedDate2 = floatingNoteDate, selectedCategory = floatingNoteCategory;
  item.manualSubmitted = /* @__PURE__ */ Symbol("note-send");
  await store.save(item.id);
  if (floatingNoteId === selectedId && floatingNoteDate === selectedDate2 && floatingNoteCategory === selectedCategory && !item.dirty && !item.pending && ["saved", "queued", "cached"].includes(item.phase)) {
    floatingNoteId = "";
    floatingNoteDate = "";
    floatingNoteCategory = "life";
  }
  paintDailyNotesPage();
}
async function checkFloatingNote(retry = false) {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store) return;
  if (retry) await store.retryPending(item.id);
  else if (item.phase === "unknown") await store.reconcile(item.id);
  paintDailyNotesPage();
}

// local-ui/frontend/web/pages/memos.mjs
var button = (action, label3, extra = "") => '<button type="button" class="btn" data-memo-action="' + action + '" ' + extra + ">" + label3 + "</button>";
function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="\u957F\u671F\u5907\u5FD8\u5F55"><div class="memo-toolbar"><div class="memo-mobile-back">' + button("back-notes", "\u2039 \u8FD4\u56DE\u7B14\u8BB0") + '</div><div class="memo-toolbar-actions">' + button("exit-trash", "\u2039 \u8FD4\u56DE\u5DE5\u4F5C\u53F0\u8BBE\u7F6E", "hidden") + button("login", "\u6240\u6709\u8005\u767B\u5F55", "hidden") + "</div></div>" + button("empty-trash", "\u6E05\u7A7A\u56DE\u6536\u7AD9", "hidden") + '<p id="memo-error" class="memo-message" role="alert" hidden></p><div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' + button("operation-check", "\u6838\u5BF9\u64CD\u4F5C\u7ED3\u679C") + button("operation-retry", "\u91CD\u8BD5\u540C\u4E00\u64CD\u4F5C", "hidden") + '</div><section id="memo-recovery" class="memo-recovery" aria-label="\u627E\u56DE\u672C\u673A\u8349\u7A3F" hidden><div class="memo-panel-head"><h2>\u627E\u56DE\u672C\u673A\u8349\u7A3F</h2>' + button("close-recovery", "\u5173\u95ED") + '</div><p id="memo-recovery-status" role="status"></p><div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p><label for="memo-recovery-copy">\u8349\u7A3F\u6587\u5B57\uFF08\u53EF\u9009\u4E2D\u590D\u5236\uFF09</label><textarea id="memo-recovery-copy" readonly></textarea>' + button("restore-draft", "\u6062\u590D\u6B64\u8349\u7A3F\u5E76\u6838\u5BF9") + '</div></section><section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden><h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p><label id="memo-dialog-label" for="memo-dialog-title">\u540D\u79F0</label><input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off"><div class="memo-dialog-actions">' + button("cancel", "\u53D6\u6D88") + button("confirm", "\u786E\u8BA4") + '</div></section><div class="memo-layout"><aside class="memo-library" aria-label="\u5907\u5FD8\u5F55\u76EE\u5F55"><div class="memo-panel-head"><h2 id="memo-groups-heading">\u76EE\u5F55</h2>' + button("new-note", '<span class="memo-add-page-visual"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="m8 16 1-3 6.8-6.8 2 2L11 15l-3 1Z"/></svg><span>\u6DFB\u52A0\u9875</span></span>', 'hidden aria-label="\u6DFB\u52A0\u9875" title="\u6DFB\u52A0\u9875"') + '</div><div id="memo-group-list" class="memo-list"></div></aside><div id="memo-resizer" class="memo-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="\u8C03\u6574\u7B14\u8BB0\u5217\u8868\u5BBD\u5EA6" aria-controls="memo-group-list memo-document" aria-valuemin="160" aria-valuemax="480" aria-valuenow="240" title="\u62D6\u52A8\u8C03\u6574\u5217\u8868\u4E0E\u6B63\u6587\u6BD4\u4F8B\uFF1B\u65B9\u5411\u952E\u5FAE\u8C03\uFF0CHome / End \u5230\u8FB9\u754C"></div><article class="memo-editor" aria-label="\u7B14\u8BB0\u5185\u5BB9"><div id="memo-save-notice" class="memo-save-notice" hidden><span id="memo-status" role="status" aria-live="polite" hidden></span><span id="memo-note-error" role="alert" hidden></span><div id="memo-drafts" class="memo-drafts" hidden></div>' + button("recovery", "\u627E\u56DE\u672C\u673A\u8349\u7A3F", "hidden") + '</div><p id="memo-empty" class="memo-empty">\u9009\u62E9\u4E00\u7BC7\u7B14\u8BB0\uFF0C\u957F\u671F\u8BB0\u5F55\u5E38\u7528\u4FE1\u606F\u3002</p><div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title"><label for="memo-title" class="sr-only">\u7B14\u8BB0\u6807\u9898</label><input id="memo-title" class="memo-title" maxlength="120" placeholder="\u7B14\u8BB0\u6807\u9898" autocomplete="off"><h2 id="memo-read-title" class="memo-read-title" hidden></h2><time id="memo-edited-at" class="memo-edited-at" hidden></time></div>' + button("fullscreen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true"><path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'aria-label="\u653E\u5927\u6B63\u6587" title="\u653E\u5927\u6B63\u6587" aria-expanded="false"') + '</div><label for="memo-body" class="sr-only">\u7B14\u8BB0\u6B63\u6587</label><textarea id="memo-body" class="memo-body" placeholder="\u5199\u4E0B\u9700\u8981\u957F\u671F\u8BB0\u4F4F\u7684\u4FE1\u606F\u2026"></textarea><div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div><div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden><details class="memo-document-menu"><summary aria-label="\u7B14\u8BB0\u64CD\u4F5C">\u22EF</summary><div class="memo-context-actions">' + button("save", "\u7ACB\u5373\u4FDD\u5B58") + button("delete-note", "\u5220\u9664\u7B14\u8BB0") + button("restore-note", "\u6062\u590D\u7B14\u8BB0", "hidden") + '</div></details></div></div><div id="memo-resolution" class="memo-resolution" hidden>' + button("check", "\u6838\u5BF9\u670D\u52A1\u5668\u7ED3\u679C") + button("retry", "\u91CD\u8BD5\u540C\u4E00\u4FDD\u5B58", "hidden") + '<div id="memo-conflict" hidden><h3>\u670D\u52A1\u5668\u4E0A\u7684\u5185\u5BB9</h3><pre id="memo-remote"></pre>' + button("use-server", "\u91C7\u7528\u670D\u52A1\u5668\u5185\u5BB9") + button("use-draft", "\u7528\u6B64\u8349\u7A3F\u4FDD\u5B58\u5230\u65B0\u7248\u672C") + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="\u5907\u5FD8\u5F55\u6B63\u6587\u5168\u5C4F"></dialog></section>';
}
var phases = {
  dirty: "\u7B49\u5F85\u81EA\u52A8\u4FDD\u5B58",
  saving: "\u6B63\u5728\u4FDD\u5B58\u2026",
  unknown: "\u4FDD\u5B58\u7ED3\u679C\u5F85\u6838\u5BF9",
  conflict: "\u7248\u672C\u51B2\u7A81 \xB7 \u8349\u7A3F\u5DF2\u4FDD\u7559",
  queued: "\u5DF2\u4FDD\u5B58\u5230\u672C\u673A \xB7 \u7B49\u5F85\u540C\u6B65",
  offline: "\u79BB\u7EBF \xB7 \u8349\u7A3F\u4FDD\u7559\u5728\u672C\u673A",
  error: "\u6682\u672A\u4FDD\u5B58 \xB7 \u8349\u7A3F\u5DF2\u4FDD\u7559",
  oversize: "\u6B63\u6587\u8D85\u8FC7 64 KiB",
  loading: ""
};
function paintEditedTime(node2, item) {
  const local = item.localQueued && item.localUpdatedAt;
  const value = local || item.updated_at;
  const timestamp3 = value && Date.parse(value);
  node2.hidden = !Number.isFinite(timestamp3);
  node2.dateTime = node2.hidden ? "" : value;
  node2.textContent = node2.hidden ? "" : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp3);
}
function listButton(kind, row, current3, subtitle = "") {
  return '<button type="button" class="memo-list-item' + (row.id === current3 ? " is-selected" : "") + '" data-memo-' + kind + '="' + e(row.id) + '" aria-pressed="' + (row.id === current3) + '"><span>' + e(row.title) + "</span>" + (subtitle ? "<small>" + e(subtitle) + "</small>" : "") + "</button>";
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find((row) => row.id === note.group_id);
  const deleted = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? "" : s.trash ? button("restore-note", "\u6062\u590D", extra) : button("delete-note", "\xD7", extra + ' aria-label="\u5220\u9664' + e(note.title) + '" title="\u79FB\u81F3\u56DE\u6536\u7AD9"');
  const removed = note.deleted_at || group?.deleted_at;
  const days = removed ? Math.max(0, 30 - Math.floor((Date.now() - Date.parse(removed)) / 864e5)) : 0;
  const retention = s.trash ? '<small class="memo-retention">' + (days ? "30\u5929\u6062\u590D\u671F \xB7 \u5269\u4F59" + days + "\u5929" : "\u5DF2\u8D85\u8FC730\u5929") + "</small>" : "";
  return '<div class="memo-flat-row">' + listButton("note", note, s.noteId) + control + retention + "</div>";
}
function paintLists(root2, store) {
  const s = store.state, find = (q) => root2.querySelector(q);
  find("#memo-groups-heading").textContent = s.trash ? "\u56DE\u6536\u7AD9" : "";
  find("#memo-groups-heading").hidden = !s.trash || Boolean(root2.closest(".workbench-settings"));
  const notes = s.notes.filter((note) => {
    const group = s.groups.find((row) => row.id === note.group_id);
    return Boolean(note.deleted_at || group?.deleted_at) === s.trash;
  });
  const html = notes.map((note) => flatNoteRow(note, store)).join("") || '<p class="memo-empty">' + (s.trash ? "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684\u3002" : "\u70B9 \uFF0B \u5F00\u59CB\u8BB0\u5F55\u3002") + "</p>";
  const list2 = find("#memo-group-list");
  if (list2.innerHTML !== html) list2.innerHTML = html;
  find('[data-memo-action="new-note"]').hidden = !s.canEdit || s.trash;
  root2.querySelectorAll('.memo-flat-row button,[data-memo-action="new-note"]').forEach((button2) => {
    button2.disabled = Boolean(s.operation?.pending);
  });
}
function paintDrafts(root2, store) {
  const drafts = [...store.drafts.values()].filter((item) => ["unknown", "conflict", "offline", "error"].includes(item.phase) || item.id !== store.state.noteId && (item.dirty || item.pending));
  const box = root2.querySelector("#memo-drafts");
  box.hidden = store.state.trash || !store.state.canEdit || !drafts.length;
  box.innerHTML = "<span>\u672C\u673A\u4FDD\u7559\u7684\u8349\u7A3F\uFF1A</span>" + drafts.map((item) => '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || "\u672A\u547D\u540D\u7B14\u8BB0") + "</button>").join("");
}
function paintDocument(root2, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root2.querySelector(q);
  find("#memo-empty").hidden = Boolean(item);
  find("#memo-empty").textContent = s.trash ? "\u9009\u62E9\u7B14\u8BB0\u67E5\u770B" : "\u9009\u62E9\u4E00\u7BC7\u7B14\u8BB0";
  find("#memo-document").hidden = !item;
  if (!item) {
    find("#memo-note-error").hidden = true;
    find("#memo-note-error").textContent = "";
    return;
  }
  const group = s.groups.find((row) => row.id === item.group_id), deleted = Boolean(item.deleted_at || group?.deleted_at);
  const editable = s.canEdit && !deleted;
  const operation = s.operation?.pending;
  const structureBusy = operation && (operation.kind === "notes" && operation.id === item.id || operation.kind === "groups" && operation.id === item.group_id && operation.method === "DELETE");
  for (const field2 of ["title", "body"]) {
    const input = find("#memo-" + field2);
    input.hidden = !editable;
    input.disabled = Boolean(structureBusy || item.loading || item.pending && item.pending.method !== "PUT");
    if (input.dataset.composing !== "true" && input.value !== item[field2]) input.value = localEditorPaintValue(input, item[field2] || "");
    find("#memo-read-" + field2).hidden = editable;
    find("#memo-read-" + field2).textContent = item[field2] || (field2 === "body" ? "\u8FD9\u7BC7\u7B14\u8BB0\u8FD8\u6CA1\u6709\u6B63\u6587\u3002" : "\u672A\u547D\u540D\u7B14\u8BB0");
  }
  paintEditedTime(find("#memo-edited-at"), item);
  find("#memo-detail").textContent = deleted ? "\u5DF2\u5220\u9664 \xB7 \u53EF\u6062\u590D" : s.canEdit ? "" : "\u516C\u5F00\u53EA\u8BFB";
  find("#memo-note-actions").hidden = !s.canEdit;
  find('[data-memo-action="save"]').hidden = deleted;
  find('[data-memo-action="save"]').disabled = !item.dirty || Boolean(item.pending) || item.phase === "conflict";
  root2.querySelector('#memo-note-actions [data-memo-action="delete-note"]').hidden = true;
  const restore = root2.querySelector('#memo-note-actions [data-memo-action="restore-note"]');
  restore.hidden = !deleted;
  restore.disabled = Boolean(s.operation?.pending || item.pending);
  const expanded = find("#memo-fullscreen").open, zoom = find('[data-memo-action="fullscreen"]');
  zoom.setAttribute("aria-label", expanded ? "\u9000\u51FA\u5168\u5C4F" : "\u653E\u5927\u6B63\u6587");
  zoom.setAttribute("title", expanded ? "\u9000\u51FA\u5168\u5C4F" : "\u653E\u5927\u6B63\u6587");
  zoom.setAttribute("aria-expanded", String(expanded));
  find("#memo-note-error").hidden = !item.error;
  find("#memo-note-error").textContent = item.error || "";
  find("#memo-resolution").hidden = !["unknown", "conflict"].includes(item.phase);
  find('[data-memo-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady;
  find("#memo-conflict").hidden = item.phase !== "conflict" || !item.remote;
  find("#memo-remote").textContent = item.remote ? (item.remote.deleted_at ? "\uFF08\u5DF2\u5220\u9664\uFF09\n" : "") + item.remote.title + "\n\n" + item.remote.body : "";
  find('[data-memo-action="use-draft"]').disabled = !s.canEdit || !item.remote || Boolean(item.remote.deleted_at || group?.deleted_at);
}
function paintMemos(root2, store) {
  if (!root2) return;
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root2.querySelector(q);
  root2.dataset.pane = s.pane;
  const actual = phases[item?.phase] || "\u5DF2\u4FDD\u5B58", routine = ["dirty", "saving", "saved", "loading"].includes(item?.phase) || !item;
  find("#memo-status").textContent = s.loading ? "" : !s.canEdit ? "\u516C\u5F00\u53EA\u8BFB" : routine ? "\u81EA\u52A8\u4FDD\u5B58" : actual;
  find("#memo-status").hidden = s.loading || s.trash || s.canEdit && routine;
  find("#memo-status").setAttribute("aria-label", actual);
  find("#memo-status").dataset.phase = item?.phase || "saved";
  find("#memo-error").hidden = !s.error && !s.storageError;
  find("#memo-error").textContent = [s.error, s.storageError].filter(Boolean).join(" ");
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find("#memo-recovery").hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash || root2.closest(".workbench-settings") !== null;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== "editor";
  const operation = s.operation;
  find("#memo-operation").hidden = !operation?.error && operation?.phase !== "unknown";
  find("#memo-operation-text").textContent = operation?.error || (operation?.phase === "saving" ? "\u6B63\u5728\u4FDD\u5B58\u64CD\u4F5C\u2026" : "\u64CD\u4F5C\u7ED3\u679C\u5F85\u6838\u5BF9");
  find('[data-memo-action="operation-check"]').hidden = operation?.phase !== "unknown";
  find('[data-memo-action="operation-retry"]').hidden = operation?.phase !== "unknown" || !operation?.retryReady;
  paintLists(root2, store);
  paintDrafts(root2, store);
  paintDocument(root2, store);
  const recovery = find('[data-memo-action="recovery"]');
  recovery.hidden = !s.canEdit || s.trash || find("#memo-drafts").hidden && find("#memo-note-error").hidden && !["error", "offline", "unknown", "conflict"].includes(item?.phase);
  find("#memo-save-notice").hidden = find("#memo-status").hidden && find("#memo-note-error").hidden && find("#memo-drafts").hidden && recovery.hidden;
}

// local-ui/frontend/web/memos-controller.mjs
init_client();
init_state();

// local-ui/frontend/web/core/memos-local.mjs
var fields3 = ["group_id", "title", "body", "position"];
var changed2 = (a, b) => fields3.some((field2) => a[field2] !== b?.[field2]);
function memoLocalProtocol(context) {
  function reset3(item, value) {
    item.localVersion = value.version;
    item.localQueued = false;
    item.localOperation = null;
    item.localConflict = null;
    item.durable = Object.fromEntries(fields3.map((field2) => [field2, value[field2]]));
  }
  function accept(item, value, pending = null) {
    const document2 = documentState(value);
    if (!document2) return false;
    const local = document2.local, server = document2.server;
    if (local.id !== item.id || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.body !== "string")
      throw new Error("\u672C\u673A\u4FDD\u5B58\u8BB0\u5F55\u4E0D\u5B8C\u6574\uFF0C\u539F\u7A3F\u5DF2\u4FDD\u7559\u3002");
    const preserve = pending ? changed2(item, pending.snapshot || pending.body) : item.dirty;
    const concurrent = !pending && item.dirty && item.localVersion && item.localVersion !== local.version;
    if (!preserve) for (const field2 of fields3) item[field2] = local[field2];
    if (server && typeof server.body === "string") {
      item.server = { ...server };
      item.version = server.version;
      item.updated_at = server.updated_at;
    } else if (!item.server) item.version = 0;
    item.localVersion = local.version;
    item.localQueued = Boolean(document2.operation) || Boolean(document2.conflict);
    item.localOperation = document2.operation;
    item.localConflict = document2.conflict;
    item.localCreatedAt = local.created_at || null;
    item.localUpdatedAt = local.updated_at || null;
    item.durable = Object.fromEntries(fields3.map((field2) => [field2, local[field2]]));
    item.deleted_at = local.deleted_at || null;
    item.pending = null;
    item.writeEpoch++;
    item.dirty = changed2(item, local);
    item.phase = document2.conflict || concurrent ? "conflict" : item.dirty ? "dirty" : item.localQueued ? "queued" : "saved";
    item.remote = document2.conflict?.remote || (concurrent ? server : null);
    item.error = item.phase === "conflict" ? "\u4E24\u4EFD\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u540E\u5904\u7406\u3002" : "";
    context.upsert("notes", { ...local, version: item.version, localVersion: item.localVersion, localQueued: item.localQueued });
    context.emit();
    context.schedule(item);
    return true;
  }
  function row(value) {
    if (!isLocalDocument(value)) return value;
    const data2 = documentState(value), local = documentValue(value);
    return {
      ...local,
      version: data2.server?.version || 0,
      localVersion: local.version,
      localQueued: Boolean(data2.operation) || Boolean(data2.conflict),
      server: data2.server
    };
  }
  function index(value) {
    return { ...value, groups: value.groups.map(row), notes: value.notes.map(row) };
  }
  return { accept, reset: reset3, row, index };
}

// local-ui/frontend/web/core/memos-state.mjs
var MEMOS_MAX_BYTES = 65536;
var memoBytes = (value) => new TextEncoder().encode(value).length;
var idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var cleanTitle = (value) => typeof value === "string" && value.trim() && [...value].length <= 120;
var noteFields = ["group_id", "title", "body", "position"];
var changed3 = (item, value) => noteFields.some((field2) => item[field2] !== value[field2]);
var isUncertain = (item) => item.pending || ["unknown", "conflict"].includes(item.phase);
function checkedNote(value, id2) {
  if (!value || value.id !== id2 || !idPattern.test(value.group_id) || !cleanTitle(value.title) || typeof value.body !== "string" || memoBytes(value.body) > MEMOS_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.position))
    throw new Error("\u7B14\u8BB0\u8BFB\u53D6\u7ED3\u679C\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u6838\u5BF9\u3002");
  return value;
}
function newDraft(value) {
  return {
    ...value,
    dirty: false,
    phase: "saved",
    error: "",
    pending: null,
    remote: null,
    localVersion: value.version,
    localQueued: false,
    localOperation: null,
    localConflict: null,
    durable: null,
    autosaveHeld: false,
    server: { ...value },
    loading: false,
    sequence: 0,
    writeEpoch: 0,
    timer: null
  };
}
function validPending(value) {
  return value && ["groups", "notes"].includes(value.kind) && idPattern.test(value.id) && ["PUT", "POST", "DELETE"].includes(value.method) && value.path === "/memos/" + value.kind + "/" + value.id + (value.method === "POST" ? "/restore" : "") && value.body && idPattern.test(value.body.save_id) && Number.isSafeInteger(value.body.version) && value.body.version >= 0;
}
function recoveredDraft(raw) {
  if (!raw || !idPattern.test(raw.id) || !idPattern.test(raw.group_id) || typeof raw.title !== "string" || typeof raw.body !== "string" || raw.body.length > 262144 || !Number.isSafeInteger(raw.version) || raw.version < 0 || !Number.isSafeInteger(raw.position) || raw.position < 0 || raw.position > 1e6) return null;
  if (raw.pending && (!validPending(raw.pending) || raw.pending.kind !== "notes" || raw.pending.method !== "PUT" || raw.pending.id !== raw.id || raw.pending.body.group_id !== raw.group_id || typeof raw.pending.body.title !== "string" || typeof raw.pending.body.body !== "string")) return null;
  const item = {
    ...newDraft(raw),
    dirty: true,
    server: raw.server || null,
    remote: raw.remote || null,
    composing: false,
    autosaveHeld: true
  };
  item.pending = raw.pending ? { ...raw.pending, checking: false, retryReady: false } : null;
  item.phase = item.pending ? "unknown" : raw.phase === "conflict" ? "conflict" : "dirty";
  item.error = item.pending ? "\u4E0A\u6B21\u4FDD\u5B58\u7ED3\u679C\u5F85\u6838\u5BF9\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002" : "\u5DF2\u627E\u56DE\u6B64\u6D4F\u89C8\u5668\u4FDD\u7559\u7684\u8349\u7A3F\u3002";
  return item;
}
function makeContext(options2) {
  const { request, ownerId = "", storage: storage2, onChange = () => {
  }, uuid: uuid2 = () => globalThis.crypto.randomUUID(), delay = 700 } = options2;
  const state2 = {
    groups: [],
    notes: [],
    canEdit: false,
    loading: false,
    error: "",
    groupId: "",
    noteId: "",
    pane: "groups",
    trash: false,
    operation: null,
    storageError: ""
  };
  const context = { state: state2, drafts: /* @__PURE__ */ new Map(), request, ownerId, storage: storage2, uuid: uuid2, delay, disposed: false, hydrated: false, loadSequence: 0 };
  context.draftScope = options2.draftScope || uuid2();
  context.restoreDraftScope = options2.restoreDraftScope;
  context.storagePersistent = options2.storagePersistent !== false && Boolean(options2.draftScope);
  context.online = options2.online || (() => globalThis.navigator?.onLine !== false);
  context.durable = options2.durable === true;
  context.readLocal = options2.readLocal;
  context.resolveLocal = options2.resolveLocal;
  context.stop = (item) => {
    clearTimeout(item.timer);
    item.timer = null;
  };
  context.emit = () => {
    if (!context.disposed) {
      context.persist();
      onChange();
    }
  };
  context.writable = () => !context.disposed && state2.canEdit && idPattern.test(context.ownerId);
  context.blocked = (item) => {
    const pending = state2.operation?.pending;
    return pending && (pending.kind === "notes" && pending.id === item.id || pending.kind === "groups" && pending.method === "DELETE" && pending.id === item.group_id);
  };
  context.upsert = (kind, value) => {
    const list2 = state2[kind], index = list2.findIndex((row2) => row2.id === value.id);
    const row = { ...value };
    if (kind === "notes") delete row.body;
    if (index < 0) list2.push(row);
    else list2[index] = row;
    list2.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    if (kind === "notes") for (const group of state2.groups)
      group.active_note_count = state2.notes.filter((note) => note.group_id === group.id && !note.deleted_at && (note.version > 0 || note.localVersion > 0)).length;
  };
  context.schedule = (item) => {
    context.stop(item);
    if (!context.autosavePaused && !item.autosaveHeld && context.writable() && item.dirty && !item.loading && !item.composing && !isUncertain(item) && item.phase === "dirty")
      item.timer = setTimeout(() => {
        item.timer = null;
        void context.saveNote(item.id);
      }, delay);
  };
  context.dispose = () => {
    context.persist();
    context.disposed = true;
    for (const item of context.drafts.values()) context.stop(item);
    context.drafts.clear();
    state2.groups = [];
    state2.notes = [];
    state2.operation = null;
    state2.canEdit = false;
  };
  return context;
}
function persistence(context) {
  const key2 = () => "haoduoyu.memos.drafts.v1." + context.ownerId + "." + context.draftScope;
  const previousKey = () => context.restoreDraftScope ? "haoduoyu.memos.drafts.v1." + context.ownerId + "." + context.restoreDraftScope : null;
  function persist({ verify = false } = {}) {
    if (!context.writable()) {
      if (verify) throw new Error("\u5907\u5FD8\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u672A\u66F4\u65B0\u9875\u9762\u3002");
      return;
    }
    const drafts = [...context.drafts.values()].filter((item) => item.dirty || item.pending || item.phase === "conflict").slice(0, 200).map(({ timer: timer2, ...item }) => ({ ...item, loading: false }));
    try {
      if (!context.storage || verify && !context.storagePersistent) throw new Error("Draft storage unavailable");
      const value = JSON.stringify({ saved_at: (/* @__PURE__ */ new Date()).toISOString(), drafts, operation: context.state.operation });
      context.storage.setItem(key2(), value);
      if (verify && context.storage.getItem(key2()) !== value) throw new Error("Draft readback failed");
      context.state.storageError = context.storagePersistent ? "" : "\u6D4F\u89C8\u5668\u65E0\u6CD5\u8BB0\u4F4F\u6B64\u9875\u7B7E\uFF0C\u5237\u65B0\u540E\u53EF\u80FD\u65E0\u6CD5\u627E\u56DE\u8349\u7A3F\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u3002";
    } catch {
      context.state.storageError = "\u6D4F\u89C8\u5668\u65E0\u6CD5\u4FDD\u7559\u8349\u7A3F\uFF0C\u8BF7\u6682\u65F6\u4FDD\u6301\u6B64\u9875\u9762\u6253\u5F00\u3002";
      if (verify) throw new Error(context.state.storageError);
    }
  }
  function hydrate() {
    if (context.hydrated || !context.writable()) return;
    context.hydrated = true;
    try {
      const current3 = context.storage?.getItem(key2());
      const saved = JSON.parse(current3 ?? (previousKey() ? context.storage?.getItem(previousKey()) : null) ?? "{}");
      if (Array.isArray(saved.drafts)) for (const raw of saved.drafts.slice(0, 200)) {
        const item = recoveredDraft(raw);
        if (item) context.drafts.set(item.id, item);
      }
      if (validPending(saved.operation?.pending))
        context.state.operation = { ...saved.operation, phase: "unknown", checking: false, retryReady: false };
    } catch {
      context.state.storageError = "\u6D4F\u89C8\u5668\u8349\u7A3F\u8BFB\u53D6\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u539F\u8BB0\u5F55\u3002";
    }
  }
  async function recoverDraft(raw) {
    if (!context.writable()) return false;
    const item = recoveredDraft(raw);
    if (!item) {
      context.state.error = "\u8349\u7A3F\u683C\u5F0F\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u590D\u5236\u9884\u89C8\u4E2D\u7684\u6587\u5B57\u7559\u5B58\u3002";
      context.emit();
      return false;
    }
    const current3 = context.drafts.get(item.id);
    if (current3 && (current3.dirty || current3.pending)) {
      if (changed3(current3, item) || current3.version !== item.version || current3.pending?.body.save_id !== item.pending?.body.save_id) {
        context.state.error = "\u6B64\u7B14\u8BB0\u5DF2\u6709\u53E6\u4E00\u4EFD\u8349\u7A3F\uFF0C\u672A\u8986\u76D6\u3002\u8BF7\u5148\u590D\u5236\u9884\u89C8\u6587\u5B57\uFF0C\u518D\u5904\u7406\u5F53\u524D\u8349\u7A3F\u3002";
        context.emit();
        return false;
      }
    } else context.drafts.set(item.id, item);
    context.state.groupId = item.group_id;
    context.state.noteId = item.id;
    context.state.pane = "editor";
    context.emit();
    await context.selectNote(item.id);
    return true;
  }
  return { persist, hydrate, recoverDraft, flushDrafts: async () => persist({ verify: true }) };
}
function acceptNote(context, item, value, pending) {
  const preserve = changed3(item, pending.snapshot || pending.body);
  if (!preserve) for (const field2 of noteFields) item[field2] = value[field2];
  item.server = { ...value };
  item.version = value.version;
  item.deleted_at = value.deleted_at;
  item.updated_at = value.updated_at;
  item.pending = null;
  item.remote = null;
  item.error = "";
  context.local.reset(item, value);
  item.dirty = changed3(item, value);
  item.phase = item.dirty ? "dirty" : "saved";
  item.writeEpoch++;
  context.upsert("notes", value);
  context.emit();
  context.schedule(item);
}
function memoReads(context) {
  async function selectNote(id2, { open = true, select = true, local = false } = {}) {
    if (context.disposed || !idPattern.test(id2)) return;
    const { state: state2, drafts } = context;
    if (select) {
      state2.noteId = id2;
      if (open) state2.pane = "editor";
    }
    let item = drafts.get(id2);
    if (!item) {
      item = newDraft({ id: id2, title: "", body: "", version: 0 });
      drafts.set(id2, item);
    }
    if (select && item.group_id) state2.groupId = item.group_id;
    if (item.version === 0 && item.dirty && !item.localQueued && item.phase !== "conflict" && !(context.durable && item.autosaveHeld)) {
      context.emit();
      return;
    }
    const reschedule = context.durable && (item.localQueued || Boolean(item.timer));
    const sequence5 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos/notes/" + id2) : context.request("/memos/notes/" + id2));
      if (context.disposed || sequence5 !== item.sequence || epoch !== item.writeEpoch || item.pending) return;
      if (isLocalDocument(raw)) {
        context.local.accept(item, raw);
        return;
      }
      const value = checkedNote(raw, id2);
      if (select && state2.noteId === id2) state2.groupId = value.group_id;
      if (item.dirty && (item.localQueued ? item.localVersion : item.version) !== value.version || item.phase === "conflict") {
        item.remote = value;
        item.phase = "conflict";
        item.error = "\u670D\u52A1\u5668\u5DF2\u6709\u65B0\u7248\u672C\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u6838\u5BF9\u540E\u9009\u62E9\u3002";
      } else {
        const preserve = item.dirty;
        if (!preserve) for (const field2 of noteFields) item[field2] = value[field2];
        item.server = value;
        item.version = value.version;
        item.deleted_at = value.deleted_at;
        item.updated_at = value.updated_at;
        item.dirty = changed3(item, value);
        item.phase = item.dirty ? "dirty" : "saved";
        item.error = "";
        context.local.reset(item, value);
        context.upsert("notes", value);
      }
    } catch (error) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!isUncertain(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        context.emit();
        if (reschedule) context.schedule(item);
      }
    }
  }
  async function load({ local = false } = {}) {
    const { state: state2 } = context, sequence5 = ++context.loadSequence;
    state2.loading = true;
    state2.error = "";
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos") : context.request("/memos"));
      if (context.disposed || sequence5 !== context.loadSequence) return;
      if (!Array.isArray(raw?.groups) || !Array.isArray(raw.notes) || typeof raw.can_edit !== "boolean")
        throw new Error("\u5907\u5FD8\u5F55\u5217\u8868\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
      const value = context.local.index(raw);
      if (value.draft_scope && context.ownerId && value.draft_scope !== context.ownerId)
        throw new Error("\u5DE5\u4F5C\u533A\u5F52\u5C5E\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u6838\u5BF9\u672C\u673A\u8349\u7A3F\u3002");
      if (!context.ownerId && idPattern.test(value.draft_scope || "")) context.ownerId = value.draft_scope;
      state2.draftOwner = context.ownerId;
      state2.groups = value.groups;
      state2.notes = value.notes;
      state2.canEdit = value.can_edit === true && idPattern.test(context.ownerId);
      if (!state2.canEdit) {
        for (const item of context.drafts.values()) context.stop(item);
        context.drafts.clear();
        state2.operation = null;
      } else context.hydrate();
      if (!state2.groups.some((group) => group.id === state2.groupId && (state2.trash || !group.deleted_at)))
        state2.groupId = state2.groups.find((group) => state2.trash || !group.deleted_at)?.id || "";
      if (!state2.noteId) state2.noteId = state2.notes.find((note) => note.group_id === state2.groupId && (state2.trash || !note.deleted_at))?.id || "";
      if (state2.noteId) await selectNote(state2.noteId, { open: false, local });
    } catch (error) {
      if (!context.disposed && sequence5 === context.loadSequence) state2.error = error.message;
    } finally {
      if (!context.disposed && sequence5 === context.loadSequence) {
        state2.loading = false;
        context.emit();
      }
    }
  }
  async function selectGroup(id2) {
    const group = context.state.groups.find((row) => row.id === id2 && (context.state.trash || !row.deleted_at));
    if (!group) return;
    context.state.groupId = id2;
    context.state.noteId = "";
    context.state.pane = "notes";
    const note = context.state.notes.find((row) => row.group_id === id2 && (context.state.trash || !row.deleted_at));
    if (note) await selectNote(note.id, { open: false });
    context.emit();
  }
  return { load, selectNote, selectGroup };
}
function editing(context) {
  function edit(field2, value, { composing = false, retainPrivate = false } = {}) {
    const item = context.drafts.get(context.state.noteId);
    if (!context.writable() || !item || item.loading || !idPattern.test(item.group_id) || !["title", "body"].includes(field2) || item.deleted_at || context.blocked(item)) return;
    item.composing = composing;
    if (!retainPrivate) item.autosaveHeld = false;
    const baseline = item.localQueued ? item.durable : item.server;
    item[field2] = value;
    item.dirty = !baseline || changed3(item, baseline);
    context.stop(item);
    if (!isUncertain(item)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : "saved";
      item.error = "";
      if (!composing && (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES)) {
        item.phase = "error";
        item.error = "\u6807\u9898\u987B\u4E3A 1\u2013120 \u5B57\uFF0C\u6B63\u6587\u6700\u591A 64 KiB\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      }
    }
    context.emit();
    if (!composing) context.schedule(item);
  }
  async function sendNote(item, pending, { offlineUnknown = false } = {}) {
    context.stop(item);
    item.pending = pending;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    context.emit();
    try {
      const raw = await context.request(pending.path, {
        method: pending.method,
        body: pending.body,
        ...offlineUnknown ? { offlineUnknown: true } : {}
      });
      if (context.disposed || item.pending !== pending) return;
      if (isLocalDocument(raw)) {
        context.local.accept(item, raw, pending);
        return;
      }
      const value = checkedNote(raw, item.id);
      if (value.version !== pending.body.version + 1 || changed3(value, pending.body)) throw new Error("\u4FDD\u5B58\u54CD\u5E94\u9700\u8981\u91CD\u65B0\u6838\u5BF9\u3002");
      acceptNote(context, item, value, pending);
    } catch (error) {
      if (context.disposed || item.pending !== pending) return;
      if (error.status === 409) {
        item.pending = null;
        item.phase = "conflict";
        item.error = "\u7248\u672C\u51B2\u7A81\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u3002";
        await context.selectNote(item.id, { open: false, select: false });
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) context.state.canEdit = false;
      } else {
        item.phase = "unknown";
        item.error = "\u4FDD\u5B58\u7ED3\u679C\u5F85\u6838\u5BF9\u3002\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u5148\u67E5\u8BE2\u4FDD\u5B58\u6536\u636E\u3002";
      }
      context.emit();
    }
  }
  async function saveNote(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
    if (context.autosavePaused || !context.writable() || !item || !item.dirty || isUncertain(item) || item.loading || item.deleted_at || item.composing || context.blocked(item)) return;
    item.autosaveHeld = false;
    context.stop(item);
    if (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES) {
      item.phase = "error";
      item.error = "\u6807\u9898\u987B\u4E3A 1\u2013120 \u5B57\uFF0C\u6B63\u6587\u6700\u591A 64 KiB\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002";
      context.emit();
      return;
    }
    if (!context.online() && !context.durable) {
      item.phase = "offline";
      item.error = "\u5F53\u524D\u79BB\u7EBF\uFF0C\u8349\u7A3F\u4FDD\u7559\u5728\u6B64\u6D4F\u89C8\u5668\u3002\u8054\u7F51\u540E\u53EF\u7ACB\u5373\u4FDD\u5B58\u3002";
      context.emit();
      return;
    }
    const snapshot = Object.fromEntries(noteFields.map((field2) => [field2, item[field2]]));
    const body = { ...snapshot, title: snapshot.title.trim(), body: snapshot.body.replace(/\r\n?/g, "\n") };
    return sendNote(item, {
      kind: "notes",
      id: id2,
      path: "/memos/notes/" + id2,
      method: "PUT",
      body: { ...body, version: item.localQueued ? item.localVersion : item.version, save_id: context.uuid() },
      snapshot
    });
  }
  async function createNote(groupId, title = "\u65B0\u7B14\u8BB0") {
    if (!context.writable() || !context.state.groups.some((group) => group.id === groupId && !group.deleted_at)) return;
    const id2 = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.notes.map((note) => note.position)) + 1);
    const item = newDraft({ id: id2, group_id: groupId, title, body: "", position, version: 0, deleted_at: null });
    item.dirty = true;
    item.phase = "dirty";
    item.server = null;
    context.drafts.set(id2, item);
    context.state.groupId = groupId;
    context.state.noteId = id2;
    context.state.pane = "editor";
    context.upsert("notes", item);
    context.emit();
    await saveNote(id2);
    return id2;
  }
  return { edit, sendNote, saveNote, createNote };
}
function resolution(context) {
  async function checkNote(id2 = context.state.noteId) {
    const item = context.drafts.get(id2), pending = item?.pending;
    if (!context.writable() || !item) return;
    if (!pending) return context.selectNote(id2, { open: false });
    if (context.durable && pending.method === "PUT") return context.sendNote(item, pending, { offlineUnknown: true });
    if (pending.checking) return;
    pending.checking = true;
    pending.retryReady = false;
    context.emit();
    try {
      const receipt = await context.request("/memos/operations/" + pending.body.save_id);
      if (context.disposed || item.pending !== pending) return;
      if (receipt?.found === false) {
        pending.retryReady = true;
        item.error = "\u6682\u672A\u627E\u5230\u4FDD\u5B58\u6536\u636E\uFF1B\u53EF\u624B\u52A8\u91CD\u8BD5\u540C\u4E00\u4FDD\u5B58\uFF0C\u4E0D\u4F1A\u65B0\u5EFA\u91CD\u590D\u64CD\u4F5C\u3002";
        return;
      }
      if (receipt?.found !== true || receipt.kind !== "notes" || receipt.id !== id2) throw new Error("\u4FDD\u5B58\u6536\u636E\u4E0D\u5339\u914D\u3002");
      const value = checkedNote(await context.request("/memos/notes/" + id2), id2);
      if (context.disposed || item.pending !== pending) return;
      if (value.version === receipt.version && !changed3(value, pending.body)) acceptNote(context, item, value, pending);
      else {
        item.pending = null;
        item.remote = value;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "\u539F\u4FDD\u5B58\u5DF2\u8BB0\u5F55\uFF0C\u670D\u52A1\u5668\u968F\u540E\u53C8\u6709\u66F4\u65B0\u3002\u8BF7\u6838\u5BF9\u4E24\u4E2A\u7248\u672C\u3002";
      }
    } catch (error) {
      if (!context.disposed && item.pending === pending) item.error = "\u6838\u5BF9\u5931\u8D25\uFF0C\u4FDD\u7559\u8349\u7A3F\u5E76\u6682\u505C\u53D1\u9001\uFF1A" + error.message;
    } finally {
      pending.checking = false;
      context.emit();
    }
  }
  async function retryPending(id2 = context.state.noteId) {
    const item = context.drafts.get(id2), pending = item?.pending;
    if (!context.writable() || item?.phase !== "unknown" || !pending?.retryReady || pending.checking) return;
    pending.retryReady = false;
    return context.sendNote(item, pending);
  }
  function useServer(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict") return;
    if (item.localConflict && context.resolveLocal) return context.resolveLocal(item.localConflict.key, "use-server").then(() => {
      item.localQueued = false;
      item.localConflict = null;
      item.dirty = false;
      item.phase = "saved";
      return context.selectNote(id2, { open: false, local: true });
    });
    context.stop(item);
    const value = item.remote;
    Object.assign(item, newDraft(value));
    context.upsert("notes", value);
    context.emit();
  }
  async function useDraft(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict" || item.remote.deleted_at) return;
    if (item.localConflict) {
      item.error = "\u4E24\u4EFD\u5185\u5BB9\u4ECD\u4FDD\u7559\uFF0C\u8BF7\u5728\u540C\u6B65\u961F\u5217\u6838\u5BF9\u540E\u5904\u7406\u3002";
      context.emit();
      return;
    }
    item.server = item.remote;
    item.version = item.remote.version;
    item.remote = null;
    item.dirty = changed3(item, item.server);
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    context.emit();
    return context.saveNote(id2);
  }
  return { checkNote, retryPending, useServer, useDraft };
}
function operations(context) {
  async function sendOperation(pending) {
    const operation2 = { pending, phase: "saving", error: "", retryReady: false };
    context.state.operation = operation2;
    context.emit();
    try {
      const raw = await context.request(pending.path, { method: pending.method, body: pending.body });
      if (context.disposed || context.state.operation !== operation2) return;
      if (isLocalDocument(raw)) {
        context.upsert(pending.kind, context.local.row(raw));
        context.state.operation = null;
        context.emit();
        return;
      }
      const value = raw;
      if (value?.id !== pending.id || !Number.isSafeInteger(value.version)) throw new Error("\u64CD\u4F5C\u7ED3\u679C\u9700\u8981\u6838\u5BF9\u3002");
      context.upsert(pending.kind, value);
      context.state.operation = null;
      if (pending.kind === "notes") context.drafts.delete(pending.id);
      await context.load();
    } catch (error) {
      if (context.disposed || context.state.operation !== operation2) return;
      operation2.error = error.message;
      if (error.status >= 400 && error.status < 500) {
        operation2.phase = "error";
        operation2.pending = null;
      } else {
        operation2.phase = "unknown";
        operation2.error = "\u64CD\u4F5C\u7ED3\u679C\u5F85\u6838\u5BF9\uFF0C\u8BF7\u5148\u67E5\u8BE2\u4FDD\u5B58\u6536\u636E\uFF0C\u6682\u4E0D\u91CD\u590D\u64CD\u4F5C\u3002";
      }
      context.emit();
    }
  }
  async function operation(kind, id2, method, body) {
    if (!context.writable() || context.state.operation?.pending) return;
    if (!context.online() && !(context.durable && method === "PUT")) {
      context.state.operation = { phase: "offline", pending: null, error: "\u5F53\u524D\u79BB\u7EBF\uFF0C\u8BF7\u8054\u7F51\u540E\u91CD\u8BD5\u6B64\u64CD\u4F5C\u3002" };
      context.emit();
      return;
    }
    return sendOperation({
      kind,
      id: id2,
      method,
      path: "/memos/" + kind + "/" + id2 + (method === "POST" ? "/restore" : ""),
      body: { ...body, save_id: context.uuid() }
    });
  }
  async function checkOperation() {
    const value = context.state.operation, pending = value?.pending;
    if (!context.writable() || !pending || value.checking) return;
    value.checking = true;
    value.retryReady = false;
    context.emit();
    try {
      const receipt = await context.request("/memos/operations/" + pending.body.save_id);
      if (context.disposed || context.state.operation !== value) return;
      if (receipt?.found === false) {
        value.retryReady = true;
        value.error = "\u6682\u672A\u627E\u5230\u6536\u636E\uFF0C\u53EF\u624B\u52A8\u91CD\u8BD5\u540C\u4E00\u64CD\u4F5C\u3002";
      } else if (receipt?.found === true && receipt.id === pending.id && receipt.kind === pending.kind) {
        context.state.operation = null;
        await context.load();
      } else throw new Error("\u64CD\u4F5C\u6536\u636E\u4E0D\u5339\u914D\u3002");
    } catch (error) {
      if (!context.disposed && context.state.operation === value) value.error = "\u6838\u5BF9\u5931\u8D25\uFF1A" + error.message;
    } finally {
      value.checking = false;
      context.emit();
    }
  }
  async function retryOperation() {
    const value = context.state.operation;
    if (!context.writable() || !value?.pending || !value.retryReady || value.checking) return;
    return sendOperation(value.pending);
  }
  function recoverOperation(raw) {
    if (!context.writable() || !validPending(raw?.pending)) return false;
    if (context.state.operation?.pending) {
      context.state.error = "\u5F53\u524D\u5DF2\u6709\u5F85\u6838\u5BF9\u64CD\u4F5C\uFF0C\u8BF7\u5148\u6838\u5BF9\uFF0C\u672A\u66FF\u6362\u539F\u64CD\u4F5C\u3002";
      context.emit();
      return false;
    }
    context.state.operation = {
      ...raw,
      pending: { ...raw.pending },
      phase: "unknown",
      checking: false,
      retryReady: false,
      error: "\u5DF2\u627E\u56DE\u4E0A\u6B21\u64CD\u4F5C\uFF0C\u8BF7\u5148\u6838\u5BF9\u4FDD\u5B58\u6536\u636E\u3002"
    };
    context.emit();
    return true;
  }
  return { operation, checkOperation, retryOperation, recoverOperation };
}
function structure(context) {
  const pendingInGroup = (id2) => [...context.drafts.values()].some((item) => item.group_id === id2 && (item.dirty || item.pending));
  async function createGroup(title) {
    if (!cleanTitle(title)) return;
    const id2 = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.groups.map((group) => group.position)) + 1);
    await context.operation("groups", id2, "PUT", { title: title.trim(), position, version: 0 });
    if (context.state.groups.some((group) => group.id === id2)) await context.selectGroup(id2);
    return id2;
  }
  async function renameGroup(id2, title) {
    const group = context.state.groups.find((value) => value.id === id2);
    if (!group || group.deleted_at || !cleanTitle(title)) return;
    return context.operation("groups", id2, "PUT", {
      title: title.trim(),
      position: group.position,
      version: group.localQueued ? group.localVersion : group.version
    });
  }
  async function removeGroup(id2, confirmation) {
    const group = context.state.groups.find((value) => value.id === id2);
    if (!group || group.deleted_at) return;
    const snapshot = confirmation || group;
    if (["version", "title", "active_note_count"].some((field2) => snapshot[field2] !== group[field2])) {
      context.state.error = "\u5206\u7EC4\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u6807\u9898\u548C\u7B14\u8BB0\u6570\u91CF\u540E\u786E\u8BA4\u5220\u9664\u3002";
      context.emit();
      return;
    }
    if (group.localQueued || pendingInGroup(id2)) {
      context.state.error = "\u6B64\u5206\u7EC4\u8FD8\u6709\u672A\u540C\u6B65\u5185\u5BB9\uFF0C\u8BF7\u8054\u7F51\u540C\u6B65\u540E\u518D\u5220\u9664\u3002";
      context.emit();
      return;
    }
    return context.operation("groups", id2, "DELETE", {
      version: snapshot.version,
      confirm_title: snapshot.title,
      confirm_note_count: snapshot.active_note_count
    });
  }
  async function removeNote(id2) {
    if (!context.online()) {
      context.state.error = "\u5220\u9664\u7B14\u8BB0\u9700\u8054\u7F51\uFF1B\u672C\u673A\u6B63\u6587\u5DF2\u4FDD\u7559\u3002";
      context.emit();
      return;
    }
    const item = context.drafts.get(id2), note = context.state.notes.find((value) => value.id === id2);
    if (!note || note.deleted_at || note.localQueued || item && (item.dirty || item.pending || item.localQueued)) {
      context.state.error = "\u8BF7\u5148\u4FDD\u5B58\u6216\u6838\u5BF9\u7B14\u8BB0\u8349\u7A3F\uFF0C\u518D\u5220\u9664\u3002";
      context.emit();
      return;
    }
    return context.operation("notes", id2, "DELETE", { version: note.version });
  }
  async function restore(kind, id2) {
    if (!["groups", "notes"].includes(kind)) return;
    const value = context.state[kind].find((row) => row.id === id2);
    if (!value?.deleted_at) return;
    if (kind === "notes" && !context.state.groups.some((group) => group.id === value.group_id && !group.deleted_at)) {
      context.state.error = "\u8BF7\u5148\u6062\u590D\u6B64\u7B14\u8BB0\u6240\u5C5E\u7684\u5206\u7EC4\u3002";
      context.emit();
      return;
    }
    return context.operation(kind, id2, "POST", { version: value.version });
  }
  return { createGroup, renameGroup, removeGroup, removeNote, restore };
}
function createMemosStore(options2) {
  const context = makeContext(options2);
  context.local = memoLocalProtocol(context);
  Object.assign(context, persistence(context), memoReads(context), editing(context), resolution(context), operations(context), structure(context));
  const {
    state: state2,
    drafts,
    load,
    selectGroup,
    selectNote,
    edit,
    saveNote,
    createGroup,
    renameGroup,
    createNote,
    removeGroup,
    removeNote,
    restore,
    checkNote,
    useServer,
    useDraft,
    retryPending,
    checkOperation,
    retryOperation,
    recoverDraft,
    recoverOperation,
    flushDrafts,
    dispose
  } = context;
  const pauseAutosave = () => {
    const scheduled = [...drafts.values()].filter((item) => item.timer);
    context.autosavePaused = true;
    for (const item of drafts.values()) context.stop(item);
    return () => {
      if (!context.disposed) {
        context.autosavePaused = false;
        for (const item of scheduled) context.schedule(item);
      }
    };
  };
  return {
    state: state2,
    drafts,
    load,
    selectGroup,
    selectNote,
    edit,
    saveNote,
    createGroup,
    renameGroup,
    createNote,
    removeGroup,
    removeNote,
    restore,
    checkNote,
    useServer,
    useDraft,
    retryPending,
    checkOperation,
    retryOperation,
    recoverDraft,
    recoverOperation,
    pauseAutosave,
    flushDrafts,
    dispose
  };
}

// local-ui/frontend/web/memos-controller.mjs
init_runtime();

// local-ui/frontend/web/memos-recovery.mjs
var recoveries = [];
var selectedRecovery = -1;
function resetMemoRecovery() {
  recoveries = [];
  selectedRecovery = -1;
}
function recoverable(raw) {
  return raw && typeof raw.id === "string" && typeof raw.title === "string" && typeof raw.body === "string" && raw.body.length <= 262144 && (raw.dirty || raw.pending || raw.phase === "conflict");
}
function snapshots(storage2, ownerId) {
  const prefix = "haoduoyu.memos.drafts.v1." + ownerId, rows = [], seen = /* @__PURE__ */ new Set();
  const keys = [];
  for (let index = 0; index < Math.min(storage2.length, 1e3); index++) {
    const key2 = storage2.key(index);
    if (key2 === prefix || key2?.startsWith(prefix + ".")) keys.push(key2);
    if (keys.length === 200) break;
  }
  for (const key2 of keys) {
    try {
      const text = storage2.getItem(key2);
      if (!text || text.length > 8 * 1024 * 1024) continue;
      const value = JSON.parse(text);
      if (!Array.isArray(value.drafts)) continue;
      for (const raw of value.drafts.slice(0, 200).filter(recoverable)) {
        const fingerprint = JSON.stringify([raw.id, raw.title, raw.body, raw.version, raw.pending?.body?.save_id || ""]);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        rows.push({ raw, savedAt: value.saved_at || raw.updated_at || "", key: key2 });
      }
    } catch {
    }
  }
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 100);
}
function label2(row, index) {
  const timestamp3 = Date.parse(row.savedAt), date = Number.isFinite(timestamp3) ? new Date(timestamp3).toLocaleString() : "\u4FDD\u5B58\u65F6\u95F4\u672A\u77E5";
  return index + 1 + ". " + (row.raw.title || "\u672A\u547D\u540D\u7B14\u8BB0") + " \xB7 " + date + " \xB7 \u7248\u672C " + row.raw.version;
}
function openMemoRecovery(root2, store, ownerId) {
  if (!store.state.canEdit || !ownerId || !root2) return;
  resetMemoRecovery();
  const find = (q) => root2.querySelector(q);
  try {
    recoveries = snapshots(window.localStorage, ownerId);
  } catch {
    store.state.error = "\u65E0\u6CD5\u8BFB\u53D6\u6B64\u6D4F\u89C8\u5668\u4FDD\u5B58\u7684\u8349\u7A3F\u3002";
  }
  find("#memo-recovery").hidden = false;
  find("#memo-recovery-detail").hidden = true;
  find("#memo-recovery-list").innerHTML = recoveries.map((row, index) => '<button type="button" class="memo-recovery-item" data-memo-recovery="' + index + '">' + e(label2(row, index)) + "</button>").join("");
  find("#memo-recovery-status").textContent = recoveries.length ? "\u4EC5\u663E\u793A\u6B64\u6240\u6709\u8005\u5728\u672C\u673A\u4FDD\u7559\u7684\u6700\u8FD1 100 \u4EFD\u8349\u7A3F\u3002\u9009\u62E9\u540E\u53EF\u590D\u5236\u6587\u5B57\uFF1B\u6062\u590D\u524D\u4F1A\u6838\u5BF9\u670D\u52A1\u5668\u7248\u672C\u3002" : "\u6B64\u6D4F\u89C8\u5668\u6CA1\u6709\u627E\u5230\u53EF\u6062\u590D\u7684\u8349\u7A3F\u3002";
}
function selectMemoRecovery(root2, index) {
  const row = recoveries[index];
  if (!root2 || !row || !Number.isSafeInteger(index)) return;
  selectedRecovery = index;
  root2.querySelector("#memo-recovery-detail").hidden = false;
  root2.querySelector("#memo-recovery-selected").textContent = label2(row, index);
  root2.querySelector("#memo-recovery-copy").value = row.raw.title + "\n\n" + row.raw.body;
  root2.querySelector("#memo-recovery-copy").focus();
}
async function restoreMemoRecovery(root2, store) {
  const row = recoveries[selectedRecovery];
  if (!row || !store.state.canEdit) return;
  await store.recoverDraft(row.raw);
  root2.querySelector("#memo-recovery-status").textContent = store.state.error || "\u8349\u7A3F\u5DF2\u53D6\u56DE\u7F16\u8F91\u533A\u3002\u8BF7\u6838\u5BF9\u4FDD\u5B58\u72B6\u6001\uFF1B\u5B58\u5728\u670D\u52A1\u5668\u65B0\u7248\u672C\u65F6\u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u3002";
}

// local-ui/frontend/web/memos-controller.mjs
var memoStore;
var memoIdentity = "";
var memoEvents = false;
var memoDialog = null;
var memoDraftScope;
var memoCreating = false;
var memoTool = "";
var memoEditorFocus = null;
var memoDeleting = "";
var memoDeleteWait = null;
var memoOfflineRefresh = false;
var memoOfflineLoading = false;
var memoOfflineFlight = null;
var memoPendingCount = 0;
var memoConflictCount = 0;
var memoRefreshPaused = false;
var memoRefreshReady = false;
var memoPurgeIntent = null;
var memoPurgeBusy = false;
function requestMemoTool(tool) {
  memoTool = ["trash", "recovery"].includes(tool) ? tool : "";
}
function draftStorageScope() {
  if (memoDraftScope) return memoDraftScope;
  const generated = globalThis.crypto.randomUUID();
  try {
    const key2 = "haoduoyu.memos.tab.v1", saved = window.sessionStorage.getItem(key2);
    const previous = /^[a-f0-9-]{36}$/i.test(saved || "") ? saved : "";
    window.sessionStorage.setItem(key2, generated);
    memoDraftScope = { draftScope: generated, restoreDraftScope: previous, storagePersistent: true };
  } catch {
    memoDraftScope = { draftScope: generated, storagePersistent: false };
  }
  return memoDraftScope;
}
var currentIdentity = () => JSON.stringify([
  runtime.sessionEpoch,
  state.me?.id || "",
  state.me?.publicBusiness === true,
  getOfflineRuntime()?.state.scope || ""
]);
var settingsTrash = () => state.page === "settings" && state.settingsTab === "workspace";
var visible2 = () => (state.page === "memos" || settingsTrash()) && memoIdentity === currentIdentity();
function ensureStore() {
  const identity4 = currentIdentity();
  if (memoStore && memoIdentity === identity4) return memoStore;
  memoDeleteWait?.(true);
  memoDeleteWait = null;
  memoDeleting = "";
  memoEditorFocus = null;
  memoRefreshPaused = false;
  memoRefreshReady = false;
  memoStore?.dispose();
  memoIdentity = identity4;
  memoDialog = null;
  resetMemoRecovery();
  const active2 = () => {
    if (currentIdentity() !== identity4) throw new DOMException("\u767B\u5F55\u72B6\u6001\u5DF2\u7ECF\u6539\u53D8", "AbortError");
  };
  const request = async (path, options2) => {
    active2();
    const value = await api(path, options2);
    active2();
    return value;
  };
  let local;
  try {
    local = window.localStorage;
  } catch {
    local = null;
  }
  memoStore = createMemosStore({
    request,
    storage: local,
    ...draftStorageScope(),
    durable: true,
    online: () => true,
    readLocal: (path) => getOfflineRuntime()?.readMemo(path) || request(path),
    resolveLocal: (key2, choice2) => getOfflineRuntime().resolve(key2, choice2),
    ownerId: state.me?.publicBusiness ? "" : String(state.me?.id || ""),
    onChange: () => {
      if (identity4 === currentIdentity()) {
        memoDeleteWait?.();
        paintMemosPage();
        refreshDurableMemos();
      }
    }
  });
  return memoStore;
}
function refreshDurableMemos() {
  if (!memoOfflineRefresh || memoOfflineLoading || memoDeleting || memoRefreshPaused || !visible2() || !memoStore || memoStore.state.loading || [...memoStore.drafts.values()].some((item) => item.composing || item.pending || item.phase === "saving")) return;
  const store = memoStore;
  memoOfflineRefresh = false;
  memoOfflineLoading = true;
  memoOfflineFlight = Promise.resolve().then(() => store.load({ local: true })).finally(() => {
    memoOfflineLoading = false;
    memoOfflineFlight = null;
    if (store === memoStore) {
      paintMemosPage();
      refreshDurableMemos();
    }
  });
}
function paintDialog(root2) {
  const find = (query) => root2.querySelector(query), dialog = memoDialog;
  find("#memo-dialog").hidden = !dialog;
  if (!dialog) return;
  find("#memo-dialog-heading").textContent = dialog.heading;
  find("#memo-dialog-description").textContent = dialog.description || "";
  find("#memo-dialog-label").hidden = !dialog.input;
  find("#memo-dialog-title").hidden = !dialog.input;
  find('[data-memo-action="confirm"]').disabled = Boolean(dialog.saving);
  find('[data-memo-action="cancel"]').disabled = Boolean(dialog.saving);
}
function paintMemosPage() {
  if (!visible2() || !memoStore) return;
  const root2 = document.querySelector("#memos");
  if (!root2) return;
  paintMemos(root2, memoStore);
  paintDialog(root2);
  setupMemoSplit(root2);
  const purge = root2.querySelector('[data-memo-action="empty-trash"]');
  if (purge) {
    purge.hidden = !settingsTrash() || !state.me?.id;
    purge.disabled = memoPurgeBusy || memoStore.state.loading;
    purge.textContent = memoPurgeIntent?.identity === memoIdentity ? "\u6838\u5BF9\u6E05\u7A7A\u7ED3\u679C" : "\u6E05\u7A7A\u56DE\u6536\u7AD9";
  }
  if (memoRefreshPaused) {
    root2.inert = true;
    root2.querySelectorAll("button,input,select").forEach((control) => {
      control.disabled = true;
    });
    root2.querySelectorAll("#memo-title,#memo-body").forEach((field2) => {
      field2.readOnly = true;
    });
  }
  if (memoDeleting) root2.querySelectorAll('[data-memo-action="delete-note"]').forEach((button2) => {
    if (button2.dataset.memoTarget === memoDeleting) button2.disabled = true;
  });
  if (memoCreating) root2.querySelectorAll('[data-memo-action="new-group"],[data-memo-action="new-note"]').forEach((button2) => {
    button2.disabled = true;
  });
}
function openDialog(kind, id2 = "") {
  const s = memoStore.state, group = s.groups.find((row) => row.id === (id2 || s.groupId));
  const note = memoStore.drafts.get(id2 || s.noteId);
  const descriptions = {
    "new-group": { heading: "\u65B0\u5EFA\u5206\u7EC4", input: true, value: "" },
    "new-note": { heading: "\u65B0\u5EFA\u7B14\u8BB0", input: true, value: "\u65B0\u7B14\u8BB0" },
    "rename-group": { heading: "\u91CD\u547D\u540D\u5206\u7EC4", input: true, value: group?.title || "" },
    "delete-group": {
      heading: "\u5220\u9664\u6574\u4E2A\u5206\u7EC4\uFF1F",
      input: false,
      description: "\u201C" + (group?.title || "") + "\u201D\u53CA\u5176\u4E2D " + (group?.active_note_count || 0) + " \u7BC7\u7B14\u8BB0\u5C06\u4ECE\u516C\u5F00\u9875\u9762\u9690\u85CF\u3002\u53EF\u5728\u56DE\u6536\u7AD9\u6062\u590D\u6574\u4E2A\u5206\u7EC4\u3002"
    },
    "delete-note": {
      heading: "\u5220\u9664\u8FD9\u7BC7\u7B14\u8BB0\uFF1F",
      input: false,
      description: "\u201C" + (note?.title || "") + "\u201D\u5C06\u4ECE\u516C\u5F00\u9875\u9762\u9690\u85CF\u3002\u53EF\u5728\u56DE\u6536\u7AD9\u6062\u590D\u3002"
    },
    "use-draft": {
      heading: "\u7528\u8349\u7A3F\u66F4\u65B0\u670D\u52A1\u5668\u7248\u672C\uFF1F",
      input: false,
      description: "\u8BF7\u5148\u6838\u5BF9\u4E0B\u65B9\u670D\u52A1\u5668\u5185\u5BB9\u3002\u786E\u8BA4\u540E\uFF0C\u6B64\u8349\u7A3F\u4F1A\u4FDD\u5B58\u4E3A\u65B0\u7248\u672C\u3002"
    },
    "use-server": {
      heading: "\u91C7\u7528\u670D\u52A1\u5668\u5185\u5BB9\uFF1F",
      input: false,
      description: "\u5F53\u524D\u672C\u673A\u672A\u4FDD\u5B58\u7684\u8349\u7A3F\u5C06\u88AB\u66FF\u6362\uFF0C\u8BF7\u5148\u590D\u5236\u9700\u8981\u4FDD\u7559\u7684\u6587\u5B57\u3002"
    }
  };
  memoDialog = {
    kind,
    id: id2 || (kind.includes("group") ? s.groupId : s.noteId),
    ...descriptions[kind],
    groupSnapshot: group ? { version: group.version, title: group.title, active_note_count: group.active_note_count } : null
  };
  paintMemosPage();
  const input = document.querySelector("#memo-dialog-title");
  input.value = memoDialog.value || "";
  if (memoDialog.input) {
    input.focus();
    input.select();
  } else document.querySelector('[data-memo-action="cancel"]')?.focus();
}
async function confirmDialog() {
  const dialog = memoDialog;
  if (!dialog || dialog.saving) return;
  const title = document.querySelector("#memo-dialog-title")?.value.trim() || "";
  if (dialog.input && !title) {
    dialog.description = "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002";
    paintMemosPage();
    return;
  }
  dialog.saving = true;
  paintMemosPage();
  try {
    if (dialog.kind === "new-group") await memoStore.createGroup(title);
    else if (dialog.kind === "new-note") await memoStore.createNote(memoStore.state.groupId, title);
    else if (dialog.kind === "rename-group") await memoStore.renameGroup(dialog.id, title);
    else if (dialog.kind === "delete-group") await memoStore.removeGroup(dialog.id, dialog.groupSnapshot);
    else if (dialog.kind === "delete-note") await memoStore.removeNote(dialog.id);
    else if (dialog.kind === "use-draft") await memoStore.useDraft(dialog.id);
    else if (dialog.kind === "use-server") await memoStore.useServer(dialog.id);
    if (memoDialog === dialog) memoDialog = null;
  } finally {
    dialog.saving = false;
    paintMemosPage();
  }
}
async function clearMemoTrash() {
  if (!settingsTrash() || !state.me?.id || memoPurgeBusy) return;
  const owner2 = currentIdentity(), store = memoStore, offline = getOfflineRuntime();
  const safe = () => store === memoStore && owner2 === currentIdentity() && settingsTrash() && offline?.state?.online === true && Boolean(offline.state.verifiedScope) && !offline.state.pending && !offline.state.conflicts && !offline.state.unsupported && !store.state.operation?.pending && !store.state.loading && ![...store.drafts.values()].some((item) => item.dirty || item.pending || item.localQueued || item.composing);
  if (!safe()) throw new Error("\u8BF7\u5148\u8054\u7F51\u5E76\u5904\u7406\u6240\u6709\u5F85\u540C\u6B65\u64CD\u4F5C\u548C\u672A\u4FDD\u5B58\u8349\u7A3F\uFF0C\u518D\u6E05\u7A7A\u56DE\u6536\u7AD9\u3002");
  memoPurgeBusy = true;
  paintMemosPage();
  try {
    let intent = memoPurgeIntent?.identity === owner2 ? memoPurgeIntent : null;
    if (!intent) {
      const fresh = await apiNetwork("/memos");
      if (!safe()) throw new Error("\u6570\u636E\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5904\u7406\u5F85\u540C\u6B65\u64CD\u4F5C\u540E\u91CD\u8BD5\u3002");
      if (!Array.isArray(fresh?.groups) || !Array.isArray(fresh.notes) || !fresh.can_edit)
        throw new Error("\u56DE\u6536\u7AD9\u672A\u80FD\u5B8C\u6574\u8BFB\u53D6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
      const groups = fresh.groups.filter((x) => x.deleted_at);
      const deletedGroups = new Set(groups.map((x) => x.id));
      const notes = fresh.notes.filter((x) => x.deleted_at || deletedGroups.has(x.group_id));
      if (!groups.length && !notes.length) {
        store.state.error = "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684\u3002";
        return;
      }
      const lines = [...groups.map((x) => "\u5206\u7EC4\uFF1A" + x.title), ...notes.map((x) => "\u7B14\u8BB0\uFF1A" + x.title)];
      if (!window.confirm("\u5C06\u6C38\u4E45\u5220\u9664\u56DE\u6536\u7AD9\u4E2D " + groups.length + " \u4E2A\u5206\u7EC4\u548C " + notes.length + " \u7BC7\u7B14\u8BB0\uFF0C\u65E0\u6CD5\u6062\u590D\u3002\n\n" + lines.join("\n") + "\n\n\u786E\u5B9A\u6E05\u7A7A\u5417\uFF1F")) return;
      if (!safe()) throw new Error("\u6570\u636E\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u3002");
      intent = { identity: owner2, body: {
        groups: groups.map(({ id: id2, version }) => ({ id: id2, version })),
        notes: notes.map(({ id: id2, version }) => ({ id: id2, version })),
        save_id: crypto.randomUUID()
      } };
      memoPurgeIntent = intent;
    } else if (!window.confirm("\u4E0A\u6B21\u6E05\u7A7A\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002\u4F7F\u7528\u540C\u4E00\u8BF7\u6C42\u6838\u5BF9\u7ED3\u679C\u5417\uFF1F")) return;
    const result = await apiNetwork("/memos/trash/clear", { method: "POST", body: intent.body });
    if (owner2 !== currentIdentity()) return;
    if (result?.cleared !== true || result.groups !== intent.body.groups.length || result.notes !== intent.body.notes.length)
      throw new Error("\u670D\u52A1\u5668\u8FD4\u56DE\u7684\u6E05\u7A7A\u7ED3\u679C\u65E0\u6CD5\u6838\u5B9E\uFF0C\u8BF7\u91CD\u8BD5\u540C\u4E00\u8BF7\u6C42\u3002");
    memoPurgeIntent = null;
    store.state.noteId = "";
    store.state.groupId = "";
    await store.load();
    store.state.error = "\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A\u3002";
  } catch (error) {
    if (error.status === 409 || error.status === 403 || error.status === 401) memoPurgeIntent = null;
    throw error;
  } finally {
    memoPurgeBusy = false;
    paintMemosPage();
  }
}
async function createMemo(action, target) {
  if (memoCreating || !memoStore.state.canEdit) return;
  const store = memoStore;
  memoCreating = true;
  paintMemosPage();
  try {
    if (action === "new-group") await store.createGroup("\u672A\u547D\u540D\u5206\u7EC4");
    else {
      let group = store.state.groups.find((row) => row.id === store.state.groupId && !row.deleted_at) || store.state.groups.find((row) => !row.deleted_at);
      if (!group) {
        const id2 = await store.createGroup("\u7B14\u8BB0");
        group = store.state.groups.find((row) => row.id === id2 && !row.deleted_at);
      }
      if (!group || store !== memoStore || !visible2()) return;
      const pending = store.createNote(group.id, "\u672A\u547D\u540D\u7B14\u8BB0");
      paintMemosPage();
      const field2 = document.querySelector("#memo-title");
      if (visible2() && store === memoStore) {
        field2?.focus();
        field2?.select();
      }
      await pending;
    }
  } finally {
    memoCreating = false;
    paintMemosPage();
  }
  if (action === "new-group" && visible2() && store === memoStore)
    document.querySelector('[data-memo-action="new-group"]')?.focus();
}
async function selectVisibleMemo(store) {
  const s = store.state, selected = store.drafts.get(s.noteId);
  const rows = s.notes.filter((note) => Boolean(note.deleted_at || s.groups.find((group) => group.id === note.group_id)?.deleted_at) === s.trash);
  if (rows.some((note) => note.id === s.noteId)) return;
  s.noteId = rows[0]?.id || "";
  if (s.noteId) await store.selectNote(s.noteId, { open: false });
  else s.pane = "notes";
}
async function removeMemo(id2) {
  const store = memoStore, item = store.drafts.get(id2);
  if (memoDeleting || !store.state.canEdit) return;
  memoDeleting = id2;
  store.state.error = "";
  paintMemosPage();
  try {
    await memoOfflineFlight;
    if (item?.loading || item?.pending && item.phase === "saving") await new Promise((resolve) => {
      memoDeleteWait = (force) => {
        if (force || !item.loading && (!item.pending || item.phase !== "saving")) resolve();
      };
    });
    if (store !== memoStore || memoIdentity !== currentIdentity()) return;
    memoDeleteWait = null;
    if (item?.dirty && !item.pending) await store.saveNote(id2);
    if (item?.localQueued && navigator.onLine !== false) {
      await getOfflineRuntime()?.sync();
      await store.selectNote(id2, { open: false, select: false, local: true });
    }
    if (item?.dirty || item?.pending || item?.localQueued) {
      store.state.error = "\u672C\u673A\u6B63\u6587\u5DF2\u4FDD\u7559\uFF0C\u5220\u9664\u9700\u8054\u7F51\u5B8C\u6210\u540C\u6B65\u540E\u518D\u786E\u8BA4\u3002";
      return;
    }
    await store.removeNote(id2);
    await selectVisibleMemo(store);
  } finally {
    if (store === memoStore) {
      memoDeleting = "";
      memoDeleteWait = null;
      paintMemosPage();
      refreshDurableMemos();
    }
  }
}
async function restoreMemo(id2) {
  const store = memoStore, note = store.state.notes.find((row) => row.id === id2);
  if (!note) return;
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) await store.restore("groups", note.group_id);
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) return;
  if (note.deleted_at) await store.restore("notes", id2);
  await selectVisibleMemo(store);
}
function toggleMemoFullscreen(expanded) {
  const root2 = document.querySelector("#memos"), dialog = root2?.querySelector("#memo-fullscreen");
  if (!dialog) return;
  const editor = root2.querySelector(".memo-editor"), field2 = root2.contains(memoEditorFocus) ? memoEditorFocus : root2.querySelector("#memo-body");
  const selection = field2 ? { start: field2.selectionStart, end: field2.selectionEnd, direction: field2.selectionDirection, scroll: field2.scrollTop } : null;
  if (expanded ?? !dialog.open) {
    dialog.append(editor);
    dialog.showModal();
  } else {
    dialog.close();
    root2.querySelector(".memo-layout").append(editor);
  }
  paintMemosPage();
  if (field2 && !field2.hidden && !field2.disabled) {
    field2.focus({ preventScroll: true });
    field2.setSelectionRange(selection.start, selection.end, selection.direction);
    field2.scrollTop = selection.scroll;
  }
}
async function clickAction(action, target) {
  const store = ensureStore(), s = store.state;
  if (action === "empty-trash") return clearMemoTrash();
  if (["new-group", "new-note"].includes(action)) return createMemo(action, target);
  if (action === "delete-note") return removeMemo(target?.dataset.memoTarget || s.noteId);
  if (action === "restore-note") return restoreMemo(target?.dataset.memoTarget || s.noteId);
  if (action === "fullscreen") return toggleMemoFullscreen();
  if (["rename-group", "delete-group", "use-draft", "use-server"].includes(action)) {
    if (s.canEdit) openDialog(action, target?.dataset.memoTarget);
    return;
  }
  if (action === "cancel") memoDialog = null;
  else if (action === "confirm") await confirmDialog();
  else if (action === "login") {
    renderLogin();
    return;
  } else if (action === "refresh") await store.load();
  else if (action === "recovery") {
    if (document.querySelector("#memo-fullscreen")?.open) toggleMemoFullscreen(false);
    openMemoRecovery(document.querySelector("#memos"), store, store.state.draftOwner);
  } else if (action === "close-recovery") document.querySelector("#memo-recovery").hidden = true;
  else if (action === "restore-draft") await restoreMemoRecovery(document.querySelector("#memos"), store);
  else if (action === "save") await store.saveNote();
  else if (action === "check") await store.checkNote(s.noteId);
  else if (action === "retry") await store.retryPending(s.noteId);
  else if (action === "operation-check") await store.checkOperation();
  else if (action === "operation-retry") await store.retryOperation();
  else if (action === "restore-group") await store.restore("groups", target?.dataset.memoTarget || s.groupId);
  else if (action === "back-groups") s.pane = "groups";
  else if (action === "back-notes") s.pane = "notes";
  else if (action === "exit-trash") {
    navigate("settings", "workspace");
    return;
  } else if (action === "trash" && s.canEdit) {
    navigate("memos", "trash");
    return;
  }
  paintMemosPage();
}
function run(action) {
  Promise.resolve().then(action).catch((error) => {
    if (!visible2() || error.name === "AbortError" || error.staleSession) return;
    memoStore.state.error = error.message || "\u64CD\u4F5C\u5931\u8D25\uFF0C\u672A\u4FDD\u5B58\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002";
    paintMemosPage();
  });
}
function editing2(event, composing) {
  if (memoRefreshPaused || !visible2() || !["memo-title", "memo-body"].includes(event.target.id)) return;
  const root2 = document.querySelector("#memos");
  if (!root2?.contains(event.target)) return;
  memoStore.edit(
    event.target.id === "memo-title" ? "title" : "body",
    event.target.value,
    { composing: composing || event.target.dataset.composing === "true" }
  );
}
function captureLocalMemos(event) {
  const detail = event.detail, store = memoStore, expected = memoIdentity, root2 = document.querySelector("#memos");
  if (!detail?.localSnapshot || expected !== currentIdentity() || !store?.state.canEdit) return;
  const noteId = store.state.noteId;
  for (const field2 of root2?.querySelectorAll("#memo-title,#memo-body") || []) {
    const raw = detail.snapshot(field2), key2 = raw.id === "memo-title" ? "title" : "body";
    detail.stage({
      field: field2,
      key: JSON.stringify(["memo", expected, noteId, key2]),
      valid: () => store === memoStore && expected === currentIdentity() && store.state.noteId === noteId && document.querySelector("#memos") === root2,
      apply: (value) => store.edit(key2, value.value, { composing: value.composing, retainPrivate: true })
    });
  }
}
function preserveMemosBeforeRefresh(event) {
  if (typeof event.detail?.waitUntil !== "function" || memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
  const store = memoStore, expected = memoIdentity, resume = store.pauseAutosave(), root2 = document.querySelector("#memos");
  const controls = [...root2?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
  const fields4 = [...root2?.querySelectorAll("#memo-title,#memo-body") || []].map((field2) => ({ field: field2, value: event.detail.localSnapshot ? event.detail.snapshot(field2).value : field2.value, readOnly: field2.readOnly, composing: event.detail.localSnapshot ? event.detail.snapshot(field2).composing : field2.dataset.composing === "true" }));
  const focused = fields4.find((row) => row.field === document.activeElement)?.field;
  const selection = focused ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection, focused.scrollTop] : null;
  const wasInert = root2?.inert;
  memoRefreshPaused = true;
  memoRefreshReady = false;
  event.detail.onFailure?.(() => {
    resume();
    if (store !== memoStore || expected !== currentIdentity()) return;
    memoRefreshPaused = false;
    memoRefreshReady = false;
    if (root2) root2.inert = wasInert;
    for (const [control, disabled] of controls) control.disabled = disabled;
    for (const { field: field2, readOnly } of fields4) field2.readOnly = readOnly;
    paintMemosPage();
    refreshDurableMemos();
    if (focused?.isConnected && !focused.disabled) {
      focused.focus({ preventScroll: true });
      focused.setSelectionRange(...selection.slice(0, 3));
      focused.scrollTop = selection[3];
    }
  });
  try {
    const composing = fields4.some((row) => row.composing);
    if (!event.detail.localSnapshot) for (const { field: field2, value } of fields4) store.edit(field2.id === "memo-title" ? "title" : "body", value, { composing, retainPrivate: true });
    if (root2) root2.inert = true;
    for (const [control] of controls) control.disabled = true;
    for (const { field: field2 } of fields4) field2.readOnly = true;
    event.detail.waitUntil(store.flushDrafts().then(() => {
      if (store !== memoStore || expected !== currentIdentity()) throw new Error("REFRESH_IDENTITY_CHANGED");
      memoRefreshReady = true;
    }));
  } catch (error) {
    event.detail.waitUntil(Promise.reject(error));
  }
}
function registerEvents() {
  if (memoEvents) return;
  memoEvents = true;
  registerMemoSplitEvents();
  registerConflictDraftGuard(createMemoConflictDraftGuard({
    getStore: () => memoStore,
    getIdentity: currentIdentity,
    getStorage: () => window.localStorage,
    getComposing: (id2) => memoStore?.state.noteId === id2 && [...document.querySelectorAll("#memo-title,#memo-body")].some((field2) => field2.dataset.composing === "true")
  }));
  document.addEventListener("focusin", (event) => {
    if (visible2() && ["memo-title", "memo-body"].includes(event.target.id)) memoEditorFocus = event.target;
  });
  document.addEventListener("cancel", (event) => {
    if (visible2() && event.target.id === "memo-fullscreen") {
      event.preventDefault();
      toggleMemoFullscreen(false);
    }
  }, true);
  document.addEventListener("input", (event) => editing2(event, event.isComposing));
  document.addEventListener("compositionstart", (event) => {
    if (!memoRefreshPaused && visible2() && ["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (memoRefreshPaused) return;
    if (["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "false";
    editing2(event, false);
  });
  document.addEventListener("click", (event) => {
    if (!visible2()) return;
    const target = event.target.closest("[data-memo-action],[data-memo-group],[data-memo-note],[data-memo-draft],[data-memo-recovery]");
    if (!target || !document.querySelector("#memos")?.contains(target)) return;
    event.preventDefault();
    run(async () => {
      if (target.dataset.memoAction) return clickAction(target.dataset.memoAction, target);
      if (target.dataset.memoRecovery !== void 0) {
        selectMemoRecovery(document.querySelector("#memos"), Number(target.dataset.memoRecovery));
        return;
      }
      memoDialog = null;
      if (target.dataset.memoGroup) await memoStore.selectGroup(target.dataset.memoGroup);
      else await memoStore.selectNote(target.dataset.memoNote || target.dataset.memoDraft);
      paintMemosPage();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (!visible2() || !memoDialog || !document.querySelector("#memo-dialog")?.contains(event.target)) return;
    if (event.key === "Escape" && !memoDialog.saving) {
      memoDialog = null;
      paintMemosPage();
    }
    if (event.key === "Enter" && event.target.id === "memo-dialog-title") {
      event.preventDefault();
      run(confirmDialog);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (memoRefreshPaused && memoRefreshReady) return;
    if (memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
    if (memoStore.state.operation?.pending || [...memoStore.drafts.values()].some((item) => item.dirty || item.pending)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("haoduoyu:capture-current-editors", captureLocalMemos);
  window.addEventListener("haoduoyu:before-refresh", preserveMemosBeforeRefresh);
  window.addEventListener("online", () => {
    if (visible2()) paintMemosPage();
  });
  window.addEventListener("offline", () => {
    if (visible2()) paintMemosPage();
  });
  window.addEventListener("haoduoyu-offline-status", (event) => {
    const pending = event.detail?.pending || 0, conflicts = event.detail?.conflicts || 0;
    if (pending < memoPendingCount || conflicts !== memoConflictCount) memoOfflineRefresh = true;
    memoPendingCount = pending;
    memoConflictCount = conflicts;
    refreshDurableMemos();
  });
}
async function loadMemos() {
  registerEvents();
  const store = ensureStore();
  const trash = settingsTrash() || state.memoView === "trash";
  if (store.state.trash !== trash) {
    store.state.noteId = "";
    store.state.groupId = "";
    store.state.pane = "notes";
  }
  store.state.trash = trash;
  await store.load();
  await selectVisibleMemo(store);
  const tool = memoTool;
  memoTool = "";
  if (!tool && !store.state.trash && store.state.noteId) store.state.pane = "editor";
  if (tool && visible2() && store.state.canEdit) {
    if (tool === "trash") {
      store.state.trash = true;
      store.state.pane = "groups";
      store.state.groupId = "";
      store.state.noteId = "";
    }
    paintMemosPage();
    if (tool === "recovery") openMemoRecovery(document.querySelector("#memos"), store, store.state.draftOwner);
  }
  paintMemosPage();
}
var memoSplitRoot = null;
var memoSplitObserver = null;
var memoSplitRatio;
var memoSplitDrag = null;
var memoSplitStorage = "haoduoyu.memos.split-ratio.v1";
function applyMemoSplit(width = null, persist = false) {
  const root2 = memoSplitRoot, layout = root2?.querySelector(".memo-layout"), handle = root2?.querySelector("#memo-resizer");
  if (!root2?.isConnected || !layout || !handle) return;
  const mobile = window.innerWidth <= 760;
  handle.hidden = mobile;
  if (mobile) {
    root2.style.removeProperty("--memo-list-w");
    return;
  }
  const area = layout.clientWidth - 10, min = area < 400 ? 120 : 160;
  const max = Math.max(min, Math.floor(Math.min(480, area - 200, area * 0.65)));
  if (memoSplitRatio === void 0) {
    const saved = Number(storage.get(memoSplitStorage));
    memoSplitRatio = Number.isFinite(saved) && saved >= 0.1 && saved <= 0.8 ? saved : 0.16;
  }
  const value = Math.round(Math.max(min, Math.min(max, width ?? area * memoSplitRatio)));
  root2.style.setProperty("--memo-list-w", value + "px");
  for (const [name, number2] of Object.entries({ min, max, now: value })) handle.setAttribute("aria-value" + name, String(number2));
  handle.setAttribute("aria-valuetext", "\u7B14\u8BB0\u5217\u8868\u5BBD\u5EA6 " + value + " \u50CF\u7D20");
  if (width !== null) memoSplitRatio = value / area;
  if (persist) storage.set(memoSplitStorage, String(memoSplitRatio));
}
function setupMemoSplit(root2) {
  if (root2 === memoSplitRoot) return;
  memoSplitObserver?.disconnect();
  memoSplitRoot = root2;
  if (typeof ResizeObserver === "function") {
    memoSplitObserver = new ResizeObserver(() => applyMemoSplit());
    memoSplitObserver.observe(root2.querySelector(".memo-layout"));
  }
  applyMemoSplit();
}
function finishMemoSplit(cancel = false) {
  const drag = memoSplitDrag;
  if (!drag) return;
  memoSplitDrag = null;
  if (cancel) {
    memoSplitRatio = drag.ratio;
    applyMemoSplit();
  } else applyMemoSplit(Number(drag.handle.getAttribute("aria-valuenow")), true);
  drag.root.classList.remove("memo-resizing");
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startMemoSplit(event) {
  const handle = event.target.closest?.("#memo-resizer");
  if (!handle || handle.hidden || event.button !== 0 || event.isPrimary === false) return;
  event.preventDefault();
  finishMemoSplit();
  memoSplitDrag = {
    root: memoSplitRoot,
    handle,
    pointer: event.pointerId,
    x: event.clientX,
    width: Number(handle.getAttribute("aria-valuenow")),
    ratio: memoSplitRatio
  };
  memoSplitRoot.classList.add("memo-resizing");
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(event.pointerId);
}
function keyMemoSplit(event) {
  if (memoSplitDrag && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishMemoSplit(true);
    return;
  }
  const handle = event.target.closest?.("#memo-resizer");
  if (!handle || handle.hidden || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const value = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : Number(handle.getAttribute("aria-valuenow")) + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 32 : 16);
  applyMemoSplit(value, true);
}
function registerMemoSplitEvents() {
  document.addEventListener("pointerdown", startMemoSplit);
  document.addEventListener("pointermove", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) {
      event.preventDefault();
      applyMemoSplit(memoSplitDrag.width + event.clientX - memoSplitDrag.x);
    }
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit();
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit(true);
  });
  document.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit();
  });
  document.addEventListener("keydown", keyMemoSplit, true);
  window.addEventListener("resize", () => {
    finishMemoSplit(true);
    applyMemoSplit();
  });
}

// local-ui/frontend/web/ui/menu.mjs
init_state();
function syncMenu() {
  const phone = isMobileLayout(), open = Boolean($(".shell")?.classList.contains("menu-open")), side = $(".sidebar");
  if (side) side.inert = phone;
  const panel = $("#mobile-settings-menu");
  if (panel) {
    panel.hidden = !phone || !open;
    panel.inert = !phone || !open;
  }
  const trigger = $(".mobile-settings-trigger");
  if (trigger) {
    trigger.classList.toggle("active", state.page === "settings");
    if (state.page === "settings") trigger.setAttribute("aria-current", "page");
    else trigger.removeAttribute("aria-current");
  }
}
function setMenu(open) {
  const shell = $(".shell");
  if (!shell) return;
  closePopover();
  shell.classList.toggle("menu-open", open);
  $$("[data-action=menu]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
  syncMenu();
  if (open) {
    runtime.menuFocus = document.activeElement;
    $(isMobileLayout() ? "#mobile-settings-menu a[href]" : ".sidebar .brand")?.focus();
  } else if (runtime.menuFocus?.isConnected) {
    runtime.menuFocus.focus();
    runtime.menuFocus = null;
  }
}
function closeMobileMenuOutside(target) {
  if (!isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return;
  if (!target?.closest?.('#mobile-settings-menu,[data-action="menu"]')) setMenu(false);
}
function trapMobileMenuFocus(event) {
  if (event.key !== "Tab" || !isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return false;
  const panel = $("#mobile-settings-menu");
  if (!panel) return false;
  const nodes = $$("a[href],button:not(:disabled)", panel);
  if (!nodes.length) return false;
  const first = nodes[0], last = nodes.at(-1), outside = !panel.contains(document.activeElement);
  if (outside || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  return false;
}

// local-ui/frontend/web/ui/workbench.mjs
init_constants();
init_state();
var mediaPages = /* @__PURE__ */ new Set(["review"]);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page && (!item.category || item.category === dailyNotesRouteCategory());
  const query = item.id === "settings" ? "&amp;tab=workspace" : item.id === "review" ? "&amp;account=" + encodeURIComponent(item.account || state.account || "V\u5B57") : item.category ? "&amp;notes_category=" + item.category : "";
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" ${item.category ? `data-notes-category="${item.category}"` : ""}
title="${e(item.label)}"
class="${mobile ? "mobile-nav-item" : "nav-item"}${selected ? " active" : ""}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ""}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
function mediaNavigation(mobile = false) {
  const account = state.account || "V\u5B57";
  return navigationLink({ id: "review", icon: "chart", label: mobile ? "\u590D\u76D8" : "\u5185\u5BB9\u590D\u76D8", account }, mobile);
}
function renderMediaTabs() {
  return "";
}
function notesNavigation(mobile = false) {
  return navigationLink({ id: "notes", icon: "edit", label: "\u788E\u788E\u5FF5" }, mobile);
}
function sidebarNavigation() {
  return mediaNavigation() + nav.filter((item) => !mediaPages.has(item.id) && item.id !== "settings").map((item) => item.id === "notes" ? notesNavigation() : navigationLink(item)).join("");
}
function settingsNavigation() {
  return navigationLink(nav.find((item) => item.id === "settings"));
}
function mobileNavigation() {
  const items = [["todos", "\u5F85\u529E"], ["notes", "\u788E\u788E\u5FF5"]];
  return `<nav class="mobile-nav workbench-navigation" aria-label="\u5207\u6362\u6A21\u5757">${items.map(([id2, label3]) => navigationLink({ ...nav.find((item) => item.id === id2), label: label3 }, true)).join("")}${mediaNavigation(true)}${navigationLink(nav.find((item) => item.id === "ai-reports"), true)}${navigationLink(nav.find((item) => item.id === "ai-diagnosis"), true)}</nav>`;
}
function mobileSettingsMenu() {
  return `<nav id="mobile-settings-menu" class="mobile-settings-menu" aria-label="\u8BBE\u7F6E\u83DC\u5355" hidden>
${settingsNavigation()}${state.me?.publicBusiness ? "" : `<button class="btn text" data-action="logout">${icon("logout", 18)}\u9000\u51FA\u767B\u5F55</button>`}</nav>`;
}
function syncWorkbenchNavigation() {
  const active2 = mediaPages.has(state.page);
  for (const link of document.querySelectorAll("[data-nav=review]")) {
    link.classList.toggle("active", active2);
    if (active2) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const menu of document.querySelectorAll(".notes-nav,.mobile-notes-nav")) {
    menu.open = state.page === "notes" && menu.classList.contains("notes-nav");
    menu.classList.toggle("active", state.page === "notes");
    syncMediaExpanded(menu);
  }
  for (const link of document.querySelectorAll("[data-notes-category]")) {
    const selected = state.page === "notes" && link.dataset.notesCategory === dailyNotesRouteCategory();
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const mobile = document.querySelector(".mobile-media-nav");
  if (mobile) {
    mobile.open = false;
    mobile.classList.toggle("active", active2);
    syncMediaExpanded(mobile);
  }
}
function closeMediaNavigation(target = null) {
  for (const menu of document.querySelectorAll(".mobile-media-nav[open],.mobile-notes-nav[open]"))
    if (!target || !menu.contains(target)) {
      menu.open = false;
      syncMediaExpanded(menu);
    }
}
function syncMediaExpanded(menu) {
  menu?.querySelector?.("summary")?.setAttribute("aria-expanded", String(menu.open));
}
var sidebarWidthKey = "haoduoyu.workbench.sidebar-width.v1";
var sidebarPreference;
var sidebarDrag = null;
var sidebarResizeEvents = false;
function readSidebarWidth() {
  if (sidebarPreference === void 0) {
    const saved = Number(storage.get(sidebarWidthKey));
    sidebarPreference = Number.isFinite(saved) && saved >= 88 && saved <= 420 ? saved : null;
  }
  return sidebarPreference;
}
function sidebarWidthLimits(viewport, shellWidth) {
  if (viewport < 768) return null;
  const min = viewport < 1200 ? 88 : 200;
  return { min, max: Math.max(min, Math.min(420, Math.floor(shellWidth - (viewport < 1200 ? 420 : 540)))) };
}
function renderSidebarResizer() {
  return '<div id="sidebar-resizer" class="sidebar-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="\u8C03\u6574\u5BFC\u822A\u5BBD\u5EA6" aria-controls="site-nav main" aria-valuemin="200" aria-valuemax="420" aria-valuenow="232" title="\u62D6\u52A8\u8C03\u6574\u5BFC\u822A\u5BBD\u5EA6\uFF1B\u65B9\u5411\u952E\u5FAE\u8C03\uFF0CHome / End \u8C03\u5230\u6700\u5C0F / \u6700\u5927"></div>';
}
function applySidebarWidth(value = readSidebarWidth(), persist = false) {
  const shell = document.querySelector(".shell"), handle = document.querySelector("#sidebar-resizer");
  if (!shell?.style?.setProperty || !handle || typeof window.innerWidth !== "number") return null;
  const limits = sidebarWidthLimits(window.innerWidth, shell.clientWidth);
  handle.hidden = !limits;
  if (!limits) {
    shell.style.removeProperty("--sidebar-w");
    delete shell.dataset.sidebarExpanded;
    return null;
  }
  const fallback = window.innerWidth < 1200 ? 88 : 232;
  const width = Math.round(Math.max(limits.min, Math.min(limits.max, value ?? fallback)));
  shell.style.setProperty("--sidebar-w", width + "px");
  shell.dataset.sidebarExpanded = String(width >= 200);
  for (const [name, number2] of Object.entries({ min: limits.min, max: limits.max, now: width }))
    handle.setAttribute("aria-value" + name, String(number2));
  handle.setAttribute("aria-valuetext", "\u5BFC\u822A\u5BBD\u5EA6 " + width + " \u50CF\u7D20");
  if (persist) {
    sidebarPreference = width;
    storage.set(sidebarWidthKey, String(width));
  }
  return width;
}
function finishSidebarDrag(cancel = false) {
  const drag = sidebarDrag;
  if (!drag) return;
  sidebarDrag = null;
  if (cancel) {
    sidebarPreference = drag.preference;
    applySidebarWidth(drag.width);
  } else applySidebarWidth(Number(drag.handle.getAttribute("aria-valuenow")), true);
  drag.shell.classList.remove("sidebar-resizing");
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startSidebarDrag(event) {
  const handle = event.target.closest?.("#sidebar-resizer");
  if (!handle || event.button !== 0 || event.isPrimary === false || window.innerWidth < 768) return;
  event.preventDefault();
  finishSidebarDrag();
  const shell = handle.closest(".shell");
  sidebarDrag = {
    handle,
    shell,
    pointer: event.pointerId,
    x: event.clientX,
    width: Number(handle.getAttribute("aria-valuenow")),
    preference: readSidebarWidth()
  };
  shell.classList.add("sidebar-resizing");
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(event.pointerId);
}
function moveSidebarDrag(event) {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.pointer) return;
  event.preventDefault();
  applySidebarWidth(sidebarDrag.width + event.clientX - sidebarDrag.x);
}
function keySidebarResize(event) {
  if (sidebarDrag && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishSidebarDrag(true);
    return;
  }
  const handle = event.target.closest?.("#sidebar-resizer");
  if (!handle || handle.hidden || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const current3 = Number(handle.getAttribute("aria-valuenow")), step = event.shiftKey ? 32 : 16;
  const next2 = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : current3 + (event.key === "ArrowRight" ? step : -step);
  applySidebarWidth(next2, true);
}
function setupSidebarResize() {
  if (applySidebarWidth() === null && typeof window.innerWidth !== "number") return;
  if (sidebarResizeEvents) return;
  sidebarResizeEvents = true;
  document.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".media-nav,.mobile-media-nav,.notes-nav,.mobile-notes-nav")) syncMediaExpanded(event.target);
  }, true);
  document.addEventListener("pointerdown", startSidebarDrag);
  document.addEventListener("pointermove", moveSidebarDrag);
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag();
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(true);
  });
  document.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag();
  });
  document.addEventListener("keydown", keySidebarResize, true);
  window.addEventListener("resize", () => {
    finishSidebarDrag(true);
    applySidebarWidth();
    syncMobileViewport();
  });
}
var mobileViewportEvents = false;
function keepMobileInputVisible() {
  const field2 = document.activeElement, viewport = window.visualViewport;
  if (!isMobileLayout() || !viewport || !field2?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== field2 || !field2.isConnected) return;
    const rect = field2.getBoundingClientRect(), top = viewport.offsetTop || 0;
    if (rect.bottom > top + viewport.height - 16 || rect.top < top + 12) field2.scrollIntoView?.({ block: "nearest" });
  });
}
function syncMobileViewport() {
  const root2 = document.documentElement;
  if (!root2?.style?.setProperty) return;
  if (!isMobileLayout()) {
    for (const key2 of ["height", "top", "keyboard"]) root2.style.removeProperty("--mobile-viewport-" + key2);
    delete root2.dataset.mobileKeyboard;
    return;
  }
  const viewport = window.visualViewport, height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0;
  if (!Number.isFinite(height) || height <= 0) return;
  const editing3 = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  const keyboard = editing3 ? Math.max(0, (window.innerHeight || height) - height - top) : 0;
  root2.style.setProperty("--mobile-viewport-height", Math.round(height) + "px");
  root2.style.setProperty("--mobile-viewport-top", Math.round(top) + "px");
  root2.style.setProperty("--mobile-viewport-keyboard", Math.round(keyboard) + "px");
  root2.dataset.mobileKeyboard = String(keyboard > 80);
  keepMobileInputVisible();
}
function setupMobileViewport() {
  syncMobileViewport();
  if (mobileViewportEvents) return;
  mobileViewportEvents = true;
  window.visualViewport?.addEventListener("resize", syncMobileViewport);
  window.visualViewport?.addEventListener("scroll", syncMobileViewport);
  document.addEventListener("focusin", syncMobileViewport);
  document.addEventListener("focusout", () => requestAnimationFrame(syncMobileViewport));
}

// local-ui/frontend/web/pages/workbench-settings.mjs
function renderWorkbenchSettings() {
  return '<section class="workbench-settings"></section>';
}
function renderTodoSettings() {
  return `<section class="card panel todo-settings" aria-label="\u4ECA\u65E5\u5F85\u529E\u8BBE\u7F6E">${renderTodoPreferences()}</section>`;
}

// local-ui/frontend/web/pages/work-reminders.mjs
function renderWorkReminders() {
  return '<section id="work-reminders" aria-label="\u6BCF\u65E5\u5DE5\u4F5C\u63D0\u9192"><div class="reminder-toolbar"><label for="reminder-date" class="sr-only">\u63D0\u9192\u65E5\u671F</label><input id="reminder-date" class="input" type="date"><button type="button" class="btn text" data-reminder-today>\u4ECA\u5929</button></div><p id="reminder-error" role="alert" hidden></p><div id="reminder-list" aria-live="polite"></div></section>';
}
function paintWorkReminders(data2, error = "") {
  const root2 = document.querySelector("#work-reminders");
  if (!root2) return;
  const date = data2?.date || bjtDate(), field2 = root2.querySelector("#reminder-date");
  if (document.activeElement !== field2) field2.value = date;
  const message = root2.querySelector("#reminder-error");
  message.hidden = !error;
  message.textContent = error;
  const rows = data2?.items || [];
  root2.querySelector("#reminder-list").innerHTML = rows.length ? rows.map((row) => '<article class="card reminder-card"><time datetime="' + e(row.updated_at) + '">' + e(new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.updated_at))) + "</time><p>" + e(row.summary) + "</p></article>").join("") : data2?.loading ? "" : '<div class="card reminder-empty">\u6682\u65E0\u5DE5\u4F5C\u63D0\u9192</div>';
}

// local-ui/frontend/web/work-reminders-controller.mjs
init_client();
init_state();
var reminderSequence = 0;
var reminderEvents = false;
async function loadWorkReminders() {
  registerReminderEvents();
  const sequence5 = ++reminderSequence, session3 = runtime.sessionEpoch, date = state.reminderDate || bjtDate();
  const current3 = () => sequence5 === reminderSequence && session3 === runtime.sessionEpoch && state.page === "reminders";
  paintWorkReminders({ date, items: [], loading: true });
  try {
    const data2 = await api("/work-reminders?date=" + encodeURIComponent(date));
    if (current3()) paintWorkReminders(data2);
  } catch (error) {
    if (current3()) paintWorkReminders({ date, items: [] }, error.message || "\u63D0\u9192\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  }
}
function selectReminderDate(value) {
  if (!validTodoDate(value)) return;
  state.reminderDate = value;
  updateRoute(true);
  void loadWorkReminders();
}
function registerReminderEvents() {
  if (reminderEvents) return;
  reminderEvents = true;
  document.addEventListener("change", (event) => {
    if (state.page === "reminders" && event.target.id === "reminder-date") selectReminderDate(event.target.value);
  });
  document.addEventListener("click", (event) => {
    if (state.page === "reminders" && event.target.closest("[data-reminder-today]")) selectReminderDate(bjtDate());
  });
}

// local-ui/frontend/web/ai-reports-controller.mjs
init_client();
init_state();
var sequence3 = 0;
var registered4 = false;
var selectedDate = "";
var visibleMonth2 = "";
var pageSession = null;
function selectDailyTab(name) {
  if (!OPENAI_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root2 = document.querySelector("#ai-reports");
  if (!root2) return;
  for (const button2 of root2.querySelectorAll("[data-ai-daily-tab]"))
    button2.setAttribute("aria-pressed", String(button2.dataset.aiDailyTab === name));
  for (const panel of root2.querySelectorAll("[data-ai-daily-panel]"))
    panel.hidden = panel.dataset.aiDailyPanel !== name;
}
function aiReportsYesterday(today = dailyNotesToday()) {
  const date = /* @__PURE__ */ new Date(today + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function reportRank(author) {
  const value = String(author ?? "");
  if (/gpt/i.test(value)) return 0;
  if (/(?:^|[^a-z0-9])bot(?:$|[^a-z0-9])/i.test(value)) return 1;
  if (/gemini/i.test(value)) return 2;
  return 3;
}
var compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function sortAiReports(items) {
  return [...items].sort((a, b) => reportRank(a.author) - reportRank(b.author) || compareText(String(a.author ?? "").toLowerCase(), String(b.author ?? "").toLowerCase()) || compareText(String(a.created_at ?? ""), String(b.created_at ?? "")) || compareText(String(a.id ?? ""), String(b.id ?? "")));
}
function reportsForDailyDate(items, date) {
  return sortAiReports(items.filter((row) => reportDay(row) === aiReportsYesterday(date)));
}
async function readAllAiReports(read3, current3 = () => true) {
  const items = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; ; offset += 100) {
    const data2 = await read3("/ai-reports?offset=" + offset);
    if (!current3()) return null;
    if (!Array.isArray(data2?.items) || typeof data2.has_more !== "boolean" || data2.items.length > 100 || data2.has_more && data2.items.length !== 100)
      throw new Error("\u6C47\u62A5\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    for (const row of data2.items) if (!seen.has(row.id)) {
      seen.add(row.id);
      items.push(row);
    }
    if (!data2.has_more) return items;
  }
}
async function loadAiReports({ resetDate = false } = {}) {
  registerAiReportEvents();
  const session3 = runtime.sessionEpoch;
  if (pageSession !== session3 || resetDate) {
    pageSession = session3;
    selectedDate = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
    visibleMonth2 = selectedDate.slice(0, 7);
  }
  if (!selectedDate) selectedDate = dailyNotesToday();
  if (!visibleMonth2) visibleMonth2 = selectedDate.slice(0, 7);
  const ticket = ++sequence3, date = selectedDate;
  const current3 = () => ticket === sequence3 && session3 === runtime.sessionEpoch && state.page === "ai-reports";
  paintAiReports([], "", true, date, visibleMonth2);
  paintAiDailyReminders(null, "", true);
  selectDailyTab(state.aiDailyTab || "reminders");
  const report = readAllAiReports(api, current3).then((items) => {
    if (current3() && items) paintAiReports(reportsForDailyDate(items, date), "", false, date, visibleMonth2);
  }).catch((error) => {
    if (current3()) paintAiReports([], error.message || "\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", false, date, visibleMonth2);
  });
  const reminders = api("/work-reminders?date=" + encodeURIComponent(date)).then((data2) => {
    if (current3()) paintAiDailyReminders(data2);
  }).catch((error) => {
    if (current3()) paintAiDailyReminders(null, error.message || "\u63D0\u9192\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  });
  await Promise.all([report, reminders]);
}
function moveMonth(offset) {
  const d = /* @__PURE__ */ new Date(visibleMonth2 + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (!Number.isFinite(d.getTime())) return;
  const next2 = d.toISOString().slice(0, 7);
  if (validDailyNotesDate(next2 + "-01")) {
    visibleMonth2 = next2;
    paintAiCalendar(selectedDate, visibleMonth2);
  }
}
function registerAiReportEvents() {
  if (registered4) return;
  registered4 = true;
  document.addEventListener("click", (event) => {
    if (state.page !== "ai-reports") return;
    const tab = event.target.closest?.("[data-ai-daily-tab]")?.dataset.aiDailyTab;
    if (tab) {
      selectDailyTab(tab);
      updateRoute();
      if (tab === "openai") void loadAiReports();
    } else if (event.target.closest?.("[data-openai-diary-refresh]")) void loadAiReports();
    else if (event.target.closest?.("[data-ai-report-month]")) moveMonth(Number(event.target.closest("[data-ai-report-month]").dataset.aiReportMonth));
    else {
      const day3 = event.target.closest?.("[data-ai-report-select]")?.dataset.aiReportSelect;
      if (day3 && validDailyNotesDate(day3)) {
        selectedDate = day3;
        visibleMonth2 = day3.slice(0, 7);
        state.aiDailyDate = day3;
        state.openAiRun = "";
        updateRoute();
        void loadAiReports();
      }
    }
  });
}

// local-ui/frontend/web/core/review-data.mjs
var SNAPSHOT_NUMBERS = ["impressions", "fan_impressions", "reads", "fan_reads", "ctr", "completion_rate", "avg_read_seconds", "likes", "comments", "reposts", "shares", "favorites", "revenue"];
var SNAPSHOT_JSON = ["traffic_sources", "completion_curve", "audience"];
function parseJson(value, fallback = null) {
  if (value === null || value === void 0 || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function finiteNumber(value) {
  if (typeof value !== "number" && typeof value !== "string" || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : null;
}
function calendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? date : "";
}
var shanghaiClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function shanghaiParts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59 || match[6] !== "Z" && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59)) return null;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return null;
  return Object.fromEntries(shanghaiClock.formatToParts(stamp).map((part) => [part.type, part.value]));
}
function day(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts2 = shanghaiParts(value);
  return parts2 ? calendarDate(`${parts2.year.padStart(4, "0")}-${parts2.month}-${parts2.day}`) : "";
}
function reviewDateTime(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts2 = shanghaiParts(value), date = day(value);
  return parts2 && date ? `${date} ${parts2.hour}:${parts2.minute}` : "";
}
function shiftDay(value, amount) {
  const date = day(value);
  if (!date || !Number.isFinite(amount)) return "";
  return new Date(Date.parse(`${date}T00:00:00Z`) + amount * 864e5).toISOString().slice(0, 10);
}
function list(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function rules(value) {
  return list(parseJson(value, [])).filter((rule) => rule && typeof rule === "object" && typeof rule.rule_id === "string");
}
function normalizeReviewData(input = {}) {
  return {
    benchmarkAccounts: list(input.benchmarkAccounts || input["benchmark-accounts"]).filter(Boolean),
    benchmarkArticles: list(input.benchmarkArticles || input["benchmark-articles"]).filter(Boolean),
    notes: list(input.notes).filter(Boolean),
    accountHealth: list(input.accountHealth || input["account-health"]).filter(Boolean),
    articles: list(input.articles).filter(Boolean).map((article) => ({ ...article, image_count: finiteNumber(article.image_count) })),
    snapshots: list(input.snapshots).filter(Boolean).map((snapshot) => {
      const normalized = { ...snapshot };
      for (const field2 of SNAPSHOT_NUMBERS) normalized[field2] = finiteNumber(snapshot[field2]);
      for (const field2 of SNAPSHOT_JSON) normalized[field2] = parseJson(snapshot[field2]);
      return normalized;
    }),
    reports: list(input.reports).filter(Boolean).map((report) => ({
      ...report,
      verdicts: object(parseJson(report.verdicts, {})),
      findings: object(parseJson(report.findings, {})),
      metrics: object(parseJson(report.metrics, {}))
    })),
    playbooks: list(input.playbooks).filter(Boolean).map((playbook2) => ({ ...playbook2, rules: rules(playbook2.rules) }))
  };
}
function latestSnapshots(snapshots2 = [], cutoff = "9999-12-31") {
  const result = /* @__PURE__ */ new Map();
  for (const snapshot of list(snapshots2)) {
    const date = day(snapshot.snapshot_date);
    if (!date || date > cutoff || snapshot.article_id === null || snapshot.article_id === void 0) continue;
    const key2 = String(snapshot.article_id);
    const previous = result.get(key2);
    if (!previous || date > day(previous.snapshot_date) || date === day(previous.snapshot_date) && String(snapshot.id || "") > String(previous.id || "")) result.set(key2, snapshot);
  }
  return result;
}

// local-ui/frontend/web/pages/review-traffic-card.mjs
var valid = (value, max = Infinity) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
var count = (value) => {
  const n = valid(value);
  return n === null ? "\u2014" : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
};
var percent = (value) => {
  const n = valid(value, 100);
  return n === null ? "\u2014" : `${n.toFixed(1)}%`;
};
var duration2 = (value) => {
  const n = valid(value);
  if (n === null) return "\u2014";
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}\u5206${seconds % 60}\u79D2`;
};
function renderTrafficCard(snapshots2, articleId) {
  const matching = (Array.isArray(snapshots2) ? snapshots2 : []).filter((s) => String(s?.article_id) === String(articleId));
  const snapshot = latestSnapshots(matching).get(String(articleId));
  const primary = [
    ["\u5C55\u73B0\u91CF", count(snapshot?.impressions), "\u7C89\u4E1D\u5C55\u73B0\u91CF", count(snapshot?.fan_impressions)],
    ["\u9605\u8BFB\u91CF", count(snapshot?.reads), "\u7C89\u4E1D\u9605\u8BFB\u91CF", count(snapshot?.fan_reads)]
  ];
  const secondary = [
    ["\u70B9\u51FB\u7387", percent(snapshot?.ctr)],
    ["\u5E73\u5747\u9605\u8BFB\u5B8C\u6210\u7387", percent(snapshot?.completion_rate)],
    ["\u5E73\u5747\u9605\u8BFB\u65F6\u957F", duration2(snapshot?.avg_read_seconds)]
  ];
  return `<section class="review-traffic-card" aria-label="\u6587\u7AE0\u6D41\u91CF\u6570\u636E">${snapshot ? `<div class="review-traffic-date">\u6570\u636E\u65E5\u671F ${e(snapshot.snapshot_date)}</div>` : ""}<dl class="review-traffic-primary">${primary.map(([label3, value, subLabel, subValue]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd><div class="review-traffic-fan">${e(subLabel)} <span>${e(subValue)}</span></div></div>`).join("")}</dl><dl class="review-traffic-secondary">${secondary.map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl></section>`;
}

// local-ui/frontend/shared/review-analytics.mjs
var array = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
var id = (value) => String(value ?? "");
var compare3 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function parsed(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function finiteNumber2(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : null;
}
function calendarDate2(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : "";
}
var clock2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function parts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate2(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 || match[5] !== "Z" && (+match[5].slice(1, 3) > 23 || +match[5].slice(4, 6) > 59)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Object.fromEntries(clock2.formatToParts(stamp).map((part) => [part.type, part.value])) : null;
}
function day2(value) {
  if (calendarDate2(value)) return value;
  const p = parts(value);
  return p ? calendarDate2(`${p.year.padStart(4, "0")}-${p.month}-${p.day}`) : "";
}
function median(values = []) {
  const sorted = values.map(finiteNumber2).filter((value) => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}
var nonnegative = (value) => {
  const n = finiteNumber2(value);
  return n !== null && n >= 0 ? n : null;
};
var rate = (value) => {
  const n = nonnegative(value);
  return n !== null && n <= 100 ? n : null;
};
var validAge = (snapshot) => {
  const n = finiteNumber2(snapshot.age_hours);
  return n !== null && Number.isInteger(n) && n >= 12 && n <= 72;
};
function select24hSnapshot(snapshots2 = [], articleId) {
  return array(snapshots2).filter((snapshot) => snapshot && (articleId === void 0 || id(snapshot.article_id) === id(articleId)) && validAge(snapshot)).sort((a, b) => Math.abs(Number(a.age_hours) - 24) - Math.abs(Number(b.age_hours) - 24) || Number(a.age_hours) - Number(b.age_hours) || compare3(id(a.snapshot_date), id(b.snapshot_date)) || compare3(id(a.id), id(b.id)))[0] ?? null;
}
function normalizeRule(rule) {
  return rule && typeof rule === "object" && !Array.isArray(rule) ? { ...rule, status: rule.status ?? "candidate" } : null;
}
function normalizeRules(rules2) {
  return array(parsed(rules2, [])).map(normalizeRule).filter(Boolean);
}
function appliedRules(article, playbooks = []) {
  const version = finiteNumber2(article?.playbook_version_used);
  const specified = parsed(article?.applied_rule_ids, null);
  if (version === null || !Array.isArray(specified)) return [];
  const playbook2 = array(playbooks).filter((item) => item.account === article.account && finiteNumber2(item.version) === version).sort((a, b) => compare3(id(a.id), id(b.id)))[0];
  if (!playbook2) return [];
  const rules2 = normalizeRules(playbook2.rules ?? playbook2.rules_json);
  return rules2.filter((rule) => specified.includes(rule.rule_id));
}
function recentArticles(a, b) {
  const dateOrder = compare3(day2(b.published_at), day2(a.published_at));
  if (dateOrder) return dateOrder;
  const aTimed = Boolean(parts(a.published_at)), bTimed = Boolean(parts(b.published_at));
  return (aTimed && bTimed ? Date.parse(b.published_at) - Date.parse(a.published_at) : Number(bTimed) - Number(aTimed)) || compare3(id(a.id), id(b.id));
}
function quantile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}
function enrichArticles(data2 = {}, { account } = {}) {
  const articles = array(data2.articles).filter((article) => article && (account === void 0 || article.account === account));
  const rows = articles.map((article) => {
    const sample24h = select24hSnapshot(data2.snapshots, article.id);
    return {
      ...article,
      sample24h,
      reads_24h: nonnegative(sample24h?.reads),
      ctr_24h: rate(sample24h?.ctr),
      completion_24h: rate(sample24h?.completion_rate),
      applied_rules: appliedRules(article, data2.playbooks)
    };
  });
  const cohorts = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!cohorts.has(row.account)) {
      const samples = rows.filter((item) => item.account === row.account && item.reads_24h !== null).sort(recentArticles).slice(0, 30);
      const values = samples.map((item) => item.reads_24h).sort((a, b) => a - b);
      cohorts.set(row.account, { sample_count: values.length, low: quantile(values, 0.3), high: quantile(values, 0.8), sample_ids: samples.map((item) => item.id) });
    }
    const cohort = cohorts.get(row.account), reliable = cohort.sample_count >= 10 && row.reads_24h !== null;
    let verdict = null;
    if (row.reads_24h !== null) verdict = reliable ? row.reads_24h > cohort.high ? "\u7206" : row.reads_24h <= cohort.low && row.reads_24h < cohort.high ? "\u6251" : "\u4E2D" : row.reads_24h >= 1e3 ? "\u7206" : row.reads_24h <= 100 ? "\u6251" : "\u4E2D";
    Object.assign(row, { verdict, reliable, verdict_reliable: reliable, verdict_basis: {
      method: cohort.sample_count >= 10 ? "recent30_quantiles" : "fixed_thresholds",
      sample_count: cohort.sample_count,
      sample_ids: cohort.sample_ids,
      high_threshold: cohort.sample_count >= 10 ? cohort.high : 1e3,
      low_threshold: cohort.sample_count >= 10 ? cohort.low : 100,
      high_inclusive: cohort.sample_count < 10,
      low_inclusive: true,
      ties: "never_split",
      missing_reads: row.reads_24h === null
    } });
  }
  return rows.sort(recentArticles);
}

// local-ui/frontend/web/core/review-overview-metrics.mjs
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}
function metricSample(rows, valueOf, maximum = Infinity) {
  const entries = rows.map((row) => ({ value: finiteNumber(valueOf(row)), hours: finiteNumber(row.sample24h?.age_hours) })).filter(({ value, hours: hours2 }) => value !== null && value >= 0 && value <= maximum && hours2 !== null);
  const hours = entries.map((entry) => entry.hours);
  return { values: entries.map((entry) => entry.value), sample: {
    count: entries.length,
    minHours: hours.length ? Math.min(...hours) : null,
    maxHours: hours.length ? Math.max(...hours) : null
  } };
}
function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function reviewOverviewMetrics(data2, { account, range = "24h", now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const nowMs = instant(now);
  if (nowMs === null) throw new TypeError("now must be an explicit ISO timestamp");
  const today = day(now);
  const weekday = (/* @__PURE__ */ new Date(`${today}T00:00:00Z`)).getUTCDay();
  const monday = shiftDay(today, -((weekday + 6) % 7));
  const start = range === "last" ? shiftDay(monday, -7) : monday;
  const end = range === "last" ? shiftDay(monday, -1) : today;
  const rows = enrichArticles(data2, { account }).filter((row) => {
    const publishedDay = day(row.published_at);
    const publishedMs = instant(row.published_at);
    if (range === "24h") return publishedMs !== null && publishedMs >= nowMs - 864e5 && publishedMs <= nowMs;
    return Boolean(publishedDay && publishedDay >= start && publishedDay <= end && (range === "last" || publishedMs === null || publishedMs <= nowMs));
  });
  const hits = rows.filter((row) => row.verdict === "\u7206").length;
  const middle = rows.filter((row) => row.verdict === "\u4E2D").length;
  const flops = rows.filter((row) => row.verdict === "\u6251").length;
  const unknownVerdicts = rows.length > 0 && hits + middle + flops === 0;
  const reads = metricSample(rows, (row) => row.reads_24h);
  const ctr = metricSample(rows, (row) => row.ctr_24h, 100);
  const seconds = metricSample(rows, (row) => row.sample24h?.avg_read_seconds);
  const completion = metricSample(rows, (row) => row.completion_24h, 100);
  const judged = metricSample(rows, (row) => row.verdict ? row.reads_24h : null);
  return {
    count: rows.length,
    observedCount: rows.filter((row) => row.sample24h).length,
    hits: unknownVerdicts ? null : hits,
    middle: unknownVerdicts ? null : middle,
    flops: unknownVerdicts ? null : flops,
    readsMedian: median(reads.values),
    ctrMedian: median(ctr.values),
    avgReadSeconds: average(seconds.values),
    completion: average(completion.values),
    samples: { judged: judged.sample, readsMedian: reads.sample, ctrMedian: ctr.sample, avgReadSeconds: seconds.sample, completion: completion.sample }
  };
}
function reviewDuration(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return "\u2014";
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}\u5206${String(seconds % 60).padStart(2, "0")}\u79D2`;
}

// local-ui/frontend/web/core/review-list-metrics.mjs
var REVIEW_LIST_METRICS = Object.freeze([
  { key: "reads", label: "\u9605\u8BFB" },
  { key: "impressions", label: "\u5C55\u73B0\u91CF" },
  { key: "fan_impressions", label: "\u7C89\u4E1D\u5C55\u73B0\u91CF" },
  { key: "fan_reads", label: "\u7C89\u4E1D\u9605\u8BFB\u91CF" },
  { key: "ctr", label: "\u70B9\u51FB\u7387" },
  { key: "avg_read_seconds", label: "\u5E73\u5747\u9605\u8BFB\u65F6\u957F" },
  { key: "completion_rate", label: "\u5E73\u5747\u9605\u8BFB\u5B8C\u6210\u7387" }
]);
function formatReviewListMetric(observation, key2) {
  if (!REVIEW_LIST_METRICS.some((metric) => metric.key === key2)) return "\u2014";
  if (observation?.kind === "immature" && key2 === "reads") return "\u672A\u6EE124h";
  const number2 = finiteNumber(observation?.snapshot?.[key2]);
  if (number2 === null || number2 < 0) return "\u2014";
  if (key2 === "ctr" || key2 === "completion_rate") return number2 <= 100 ? `${number2.toFixed(1)}%` : "\u2014";
  if (key2 === "avg_read_seconds") return reviewDuration(number2);
  return number2 >= 1e4 ? `${(number2 / 1e4).toFixed(1)} \u4E07` : number2.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

// local-ui/frontend/web/pages/review-imitation.mjs
function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function renderImitation(row, data2, account) {
  if (!row || row.account !== account) return "";
  const reference = row.reference_article_id == null ? null : (data2.benchmarkArticles || []).find((item) => item.account === account && String(item.id) === String(row.reference_article_id));
  let value;
  if (reference) {
    const id2 = String(reference.id);
    const query = new URLSearchParams({ page: "review", account, review_section: "benchmarks", review_benchmark: id2 });
    value = `<a href="?${e(query.toString())}" data-review-benchmark="${e(id2)}">${e(reference.title || "\u672A\u547D\u540D\u6587\u7AE0")}</a>`;
  } else {
    const title = String(row?.sample_title || "").trim();
    const rawUrl = String(row?.sample_url || "").trim();
    const url = safeUrl(rawUrl);
    const label3 = title || (rawUrl ? "\u53C2\u8003\u6587\u7AE0" : "\u81EA\u9009\u9898");
    value = url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : e(label3);
  }
  return `<div class="review-imitation"><span>\u4EFF</span><div>${value}</div></div>`;
}

// local-ui/frontend/web/pages/review-benchmark-library.mjs
function safeUrl2(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function number(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return "\u2014";
  return n >= 1e4 ? `${(n / 1e4).toFixed(1)} \u4E07` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function articleLink(article, account) {
  const external2 = safeUrl2(article.url);
  const local = `?page=review&account=${encodeURIComponent(account)}&review_article=${encodeURIComponent(article.id)}`;
  return `<a href="${e(external2 || local)}"${external2 ? ' target="_blank" rel="noopener noreferrer"' : ""}>${e(article.title || "\u672A\u547D\u540D\u6587\u7AE0")}</a>`;
}
function renderBenchmarkLibrary(data2 = {}, account = "") {
  const accounts = new Map((data2.benchmarkAccounts || []).filter((item) => item.account === account).map((item) => [String(item.id), item]));
  const ownArticles = (data2.articles || []).filter((item) => item.account === account);
  const rows = (data2.benchmarkArticles || []).filter((item) => item.account === account && accounts.has(String(item.benchmark_account_id))).map((item) => ({ item, published: reviewDateTime(item.published_at) })).sort((a, b) => {
    const dayOrder = b.published.slice(0, 10).localeCompare(a.published.slice(0, 10));
    if (dayOrder) return dayOrder;
    const aTimed = a.published.length > 10, bTimed = b.published.length > 10;
    return Number(bTimed) - Number(aTimed) || (aTimed && bTimed ? Date.parse(b.item.published_at) - Date.parse(a.item.published_at) : 0) || String(a.item.id).localeCompare(String(b.item.id));
  });
  if (!rows.length) return '<section class="review-benchmark-library"><h3>\u7206\u6587\u5E93</h3><p class="review-note">\u6682\u65E0\u7206\u6587</p></section>';
  const headers = ["\u53D1\u5E03\u65F6\u95F4", "\u8D26\u53F7", "\u6807\u9898", "\u9605\u8BFB", "\u914D\u56FE\u6570", "\u6536\u5F55\u65E5\u671F", "\u5DF2\u4EFF"];
  const body = rows.map(({ item, published }) => {
    const owner2 = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl2(item.url);
    const title = e(item.title || "\u672A\u547D\u540D\u6587\u7AE0");
    const used = ownArticles.filter((article) => article.reference_article_id != null && String(article.reference_article_id) === String(item.id));
    const cells = [
      e(published || "\u672A\u77E5"),
      e(owner2.name || "\u672A\u547D\u540D\u8D26\u53F7"),
      target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(number(item.reads)),
      e(number(item.image_count)),
      e(reviewDateTime(item.collected_on) || "\u672A\u77E5"),
      used.length ? used.map((article) => articleLink(article, account)).join("") : "\u2014"
    ];
    return `<tr id="review-benchmark-${e(encodeURIComponent(item.id))}" tabindex="-1">${cells.map((cell, index) => `<td data-label="${headers[index]}">${cell}</td>`).join("")}</tr>`;
  }).join("");
  return `<section class="review-benchmark-library"><h3>\u7206\u6587\u5E93</h3><div class="review-benchmark-table-wrap"><table class="review-benchmark-table"><thead><tr>${headers.map((label3) => `<th scope="col">${label3}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

// local-ui/frontend/web/core/review-list-observation.mjs
function instant2(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}
var compare4 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function reviewListObservation(row, snapshots2 = [], now = (/* @__PURE__ */ new Date()).toISOString()) {
  if (row.sample24h) return { kind: "sample", snapshot: row.sample24h, reads: row.reads_24h, hours: finiteNumber(row.sample24h.age_hours) };
  const published = instant2(row.published_at);
  const candidates = (Array.isArray(snapshots2) ? snapshots2 : []).filter((snapshot) => String(snapshot?.article_id) === String(row.id)).map((snapshot) => {
    const explicitAge = finiteNumber(snapshot.age_hours);
    const observed2 = instant2(snapshot.observed_at) ?? instant2(snapshot.snapshot_date);
    const computedAge = published !== null && observed2 !== null ? (observed2 - published) / 36e5 : null;
    const hours = explicitAge !== null && Number.isInteger(explicitAge) && explicitAge >= 0 ? explicitAge : explicitAge === null ? computedAge : null;
    const reads = finiteNumber(snapshot.reads);
    return { snapshot, hours, observed: observed2, reads: reads !== null && reads >= 0 ? reads : null };
  }).filter((candidate) => candidate.hours !== null && candidate.hours > 72).sort((a, b) => a.hours - b.hours || (a.observed ?? Infinity) - (b.observed ?? Infinity) || compare4(String(a.snapshot.id ?? ""), String(b.snapshot.id ?? "")));
  const first = candidates.find((candidate) => candidate.reads !== null) || candidates[0];
  if (first) return { kind: "longtail", snapshot: first.snapshot, reads: first.reads, hours: first.hours };
  const nowMs = instant2(now);
  if (published !== null && nowMs !== null && nowMs >= published && nowMs - published < 12 * 36e5) return { kind: "immature", snapshot: null, reads: null, hours: null };
  return { kind: "missing", snapshot: null, reads: null, hours: null };
}
function reviewObservationHours(value) {
  const hours = finiteNumber(value);
  return hours === null ? "" : String(Number(hours.toFixed(4)));
}

// local-ui/frontend/web/pages/content-review.mjs
var REVIEW_VIEWS = [["overview", "\u603B\u89C8"], ["articles", "\u6587\u7AE0\u5E93"], ["playbook", "\u624B\u518C"]];
var percentageKeys = /* @__PURE__ */ new Set(["ctr", "completion_rate", "ctr_24h", "completion_24h", "hit_rate", "flop_rate", "median_ctr"]);
function reviewNumber(value, key2 = "") {
  const n = finiteNumber(value);
  if (n === null) return "\u2014";
  if (percentageKeys.has(key2)) return `${n.toFixed(1)}%`;
  return Math.abs(n) >= 1e4 ? `${(n / 1e4).toFixed(1)} \u4E07` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function safeReviewUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function inline2(text) {
  return String(text).split(/(\[[^\]\n]+\]\([^\)\n]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeReviewUrl(link[2]);
      return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(link[1]);
    }
    if (part.startsWith("**") && part.endsWith("**")) return `<strong>${e(part.slice(2, -2))}</strong>`;
    if (part.startsWith("`") && part.endsWith("`")) return `<code>${e(part.slice(1, -1))}</code>`;
    return e(part);
  }).join("");
}
function renderReviewMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  let list2 = false, code = false, out = "";
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (list2) {
        out += "</ul>";
        list2 = false;
      }
      out += code ? "</code></pre>" : "<pre><code>";
      code = !code;
      continue;
    }
    if (code) {
      out += e(line) + "\n";
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!list2) {
        out += "<ul>";
        list2 = true;
      }
      out += `<li>${inline2(item[1])}</li>`;
      continue;
    }
    if (list2) {
      out += "</ul>";
      list2 = false;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const h = Math.min(heading[1].length + 1, 5);
      out += `<h${h}>${inline2(heading[2])}</h${h}>`;
    } else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline2(line.replace(/^>\s?/, ""))}</blockquote>` : `<p>${inline2(line)}</p>`;
  }
  return out + (list2 ? "</ul>" : "") + (code ? "</code></pre>" : "");
}
var empty2 = (title, text = "") => `<div class="review-empty"><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ""}</div>`;
var options = (rows, value) => rows.map(([id2, label3]) => `<option value="${e(id2)}"${String(id2) === String(value) ? " selected" : ""}>${e(label3)}</option>`).join("");
var firstSentence = (value) => String(value || "").replace(/^#+\s*/gm, "").trim().match(/^[\s\S]*?[。！？!?](?:[”」』])?|^[^\n]+/)?.[0] || "";
function external(url, label3) {
  const safe = safeReviewUrl(url);
  return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : '<span class="review-note">\u672A\u63D0\u4F9B\u539F\u6587\u94FE\u63A5</span>';
}
function tag(verdict) {
  if (!["\u7206", "\u4E2D", "\u6251"].includes(verdict)) return "";
  const css = verdict === "\u7206" ? "hit" : verdict === "\u6251" ? "flop" : "middle";
  return `<span class="review-tag ${css}">${e(verdict)}</span>`;
}
function sampleFor(row, data2) {
  const reference = row.reference_article_id == null ? null : (data2.benchmarkArticles || []).find((item) => item.account === row.account && String(item.id) === String(row.reference_article_id));
  const title = reference?.title || row.sample_title || "";
  const url = safeReviewUrl(reference?.url) || safeReviewUrl(row.sample_url);
  const reads = finiteNumber(reference?.reads);
  return title || url ? { title, url, reads: reads !== null && reads >= 0 ? reads : null } : null;
}
function sampleLabel(row, data2) {
  const sample = sampleFor(row, data2);
  if (!sample) return "";
  const label3 = `\u4EFF\uFF1A${sample.title || "\u53C2\u8003\u6587\u7AE0"}${sample.reads == null ? "" : `\uFF08\u9605\u8BFB ${reviewNumber(sample.reads)}\uFF09`}`;
  const href = safeReviewUrl(sample.url);
  return `<span class="review-reference">${href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : e(label3)}</span>`;
}
var REVIEW_SECTIONS = [["benchmarks", "\u5BF9\u6807\u8D26\u53F7"], ["review", "\u89C4\u5219"]];
function v13Accounts(data2) {
  const accounts = data2.benchmarkAccounts || [];
  if (!accounts.length) return empty2("\u6682\u65E0\u5BF9\u6807\u8D26\u53F7");
  return accounts.map((account) => {
    const topic = String(account.topic_focus || "").trim();
    const rawPatterns = parseJson(account.title_patterns, []);
    const patterns = Array.isArray(rawPatterns) ? rawPatterns.filter((item) => typeof item === "string" && item.trim()) : [];
    const structure2 = String(account.structure_notes_md || "").trim();
    const structureParts = structure2.includes("\n") ? [structure2] : structure2.split(/(?<=。)(?=\S)/u);
    const details = [
      topic ? `<section class="review-account-feature"><h4>\u9009\u9898\u65B9\u5411</h4><div class="review-markdown">${renderReviewMarkdown(topic)}</div></section>` : "",
      patterns.length ? `<section class="review-account-feature"><h4>\u6807\u9898\u7279\u70B9</h4><div class="review-markdown">${patterns.map((item) => renderReviewMarkdown(item)).join("")}</div></section>` : "",
      structure2 ? `<section class="review-account-feature"><h4>\u5176\u4ED6\u7279\u70B9</h4><div class="review-markdown">${structureParts.map((part) => renderReviewMarkdown(part)).join("")}</div></section>` : ""
    ].join("");
    const profile = safeReviewUrl(account.profile_url);
    const name = e(account.name || "\u672A\u547D\u540D\u8D26\u53F7");
    return `<section class="review-v13-benchmark-group"><div class="review-v13-group-head"><h3>${profile ? `<a class="review-account-link" href="${e(profile)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name}</h3></div><div class="review-v13-account-features">${details || "<p>\u6682\u65E0\u7279\u70B9\u8BB0\u5F55</p>"}</div></section>`;
  }).join("");
}
function archives(data2, vm4) {
  const selected = REVIEW_SECTIONS.some(([id2]) => id2 === vm4.secondary) ? vm4.secondary : "benchmarks";
  const bodies = { benchmarks: v13Accounts(data2) + renderBenchmarkLibrary(data2, vm4.account), review: playbook(data2, vm4) };
  return `<section class="review-secondary"><div class="review-secondary-tabs" role="tablist" aria-label="\u590D\u76D8\u8D44\u6599">${REVIEW_SECTIONS.map(([id2, label3]) => `<button type="button" id="review-secondary-${id2}" role="tab" data-review-secondary="${id2}" aria-controls="review-secondary-panel" aria-selected="${selected === id2}" tabindex="${selected === id2 ? "0" : "-1"}">${label3}</button>`).join("")}</div><div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">${bodies[selected]}</div></section>`;
}
function overview(data2, vm4) {
  const rows = enrichArticles(data2, { account: vm4.account });
  const range = ["this", "last"].includes(vm4.filters?.metricsRange) ? vm4.filters.metricsRange : "this";
  const current3 = reviewOverviewMetrics(data2, { account: vm4.account, range, now: vm4.now || (/* @__PURE__ */ new Date()).toISOString() });
  const noSample = range !== "last" && current3.observedCount === 0;
  const value = (formatted) => noSample ? '<strong class="review-stat-empty">\u6570\u636E\u672A\u6EE124h</strong>' : `<strong>${e(formatted)}</strong>`;
  const cards = `<section class="review-overview-metrics" aria-label="\u6587\u7AE0\u6307\u6807"><div class="review-filters"><label>\u7EDF\u8BA1\u65F6\u95F4<select class="input" data-review-filter="metricsRange">${options([["this", "\u672C\u5468"], ["last", "\u4E0A\u5468"]], range)}</select></label><button class="btn text review-inline-refresh" type="button" data-review-action="refresh">\u5237\u65B0</button></div><div class="review-stats"><article class="review-stat"><span>\u53D1\u6587\u6570</span><strong>${e(current3.count)}<small>\u7BC7</small></strong></article><article class="review-stat"><span>\u7206 / \u4E2D / \u6251</span><strong>${e(reviewNumber(current3.hits))} / ${e(reviewNumber(current3.middle))} / ${e(reviewNumber(current3.flops))}</strong></article><article class="review-stat"><span>\u9605\u8BFB\u4E2D\u4F4D\u6570</span>${value(reviewNumber(current3.readsMedian))}</article><article class="review-stat"><span>CTR \u4E2D\u4F4D\u6570</span>${value(reviewNumber(current3.ctrMedian, "ctr"))}</article><article class="review-stat"><span>\u5E73\u5747\u9605\u8BFB\u65F6\u957F</span>${value(reviewDuration(current3.avgReadSeconds))}</article><article class="review-stat"><span>\u5E73\u5747\u9605\u8BFB\u5B8C\u6210\u7387</span>${value(reviewNumber(current3.completion, "completion_rate"))}</article></div></section>`;
  const articlePanel = articleListPanel(rows, vm4, data2);
  return cards + articlePanel + archives(data2, vm4, "", [], []);
}
function articleListPanel(rows, vm4, data2) {
  const expanded = Boolean(vm4.articlesExpanded);
  const toggle = `<button type="button" class="review-articles-toggle" data-review-action="toggle-articles"
aria-expanded="${expanded}" aria-controls="review-article-library"><span>\u6587\u7AE0\u5217\u8868</span>
<span class="review-article-count">${rows.length} \u7BC7</span><span class="review-article-toggle-label">${expanded ? "\u6536\u8D77 \u2191" : "\u5C55\u5F00 \u2193"}</span></button>`;
  const dock = `<div class="review-collapse-dock"><button class="btn" type="button" data-review-action="toggle-articles"
aria-expanded="${expanded}" aria-controls="review-article-library">\u6536\u8D77\u6587\u7AE0\u5217\u8868 \u2191</button></div>`;
  return `<section class="review-panel review-articles-panel" data-review-articles-expanded="${expanded}">
<div class="review-panel-head"><h2 class="review-articles-heading">\u6587\u7AE0\u5217\u8868</h2>${toggle}
<button class="btn text" type="button" data-review-action="toggle-fullscreen" aria-pressed="false">\u5168\u5C4F\u663E\u793A</button></div>
<div id="review-article-library" class="review-article-library">${articleLibrary(rows, vm4, data2)}</div>${dock}</section>`;
}
function articleLibrary(rows, vm4, data2 = {}) {
  const f = vm4.filters || {}, range = f.range || "30d", today = day(vm4.now || (/* @__PURE__ */ new Date()).toISOString()), from = range === "all" ? "" : shiftDay(today, range === "7d" ? -6 : -29);
  const selected = rows.filter((r) => (!from || day(r.published_at) && day(r.published_at) >= from && day(r.published_at) <= today) && (!f.from || day(r.published_at) >= f.from && day(r.published_at)) && (!f.to || day(r.published_at) <= f.to && day(r.published_at)) && (!f.verdict || r.verdict === f.verdict)).sort(recentArticles);
  const chosen = Array.isArray(vm4.metricColumns) ? vm4.metricColumns : ["reads"];
  const columns = REVIEW_LIST_METRICS.filter((metric) => chosen.includes(metric.key));
  const picker = `<details class="review-columns-picker" data-review-columns-picker${vm4.metricPickerOpen ? " open" : ""}><summary data-review-columns-trigger>\u663E\u793A\u6307\u6807</summary><div class="review-columns-menu">${REVIEW_LIST_METRICS.map((metric) => `<label><input type="checkbox" data-review-column="${e(metric.key)}"${chosen.includes(metric.key) ? " checked" : ""}>${e(metric.label)}</label>`).join("")}</div></details>`;
  const filters = `<div class="review-filters"><label>\u53D1\u5E03\u65F6\u95F4<select class="input" data-review-filter="range">${options([["7d", "\u8FD1 7 \u5929"], ["30d", "\u8FD1 30 \u5929"], ["all", "\u5168\u90E8\u65F6\u95F4"]], range)}</select></label><label>\u8868\u73B0\u5224\u5B9A<select class="input" data-review-filter="verdict">${options([["", "\u5168\u90E8\u5224\u5B9A"], ["\u7206", "\u7206"], ["\u4E2D", "\u4E2D"], ["\u6251", "\u6251"]], f.verdict || "")}</select></label>${picker}<span class="review-note">${selected.length} \u7BC7</span></div>`;
  if (!selected.length) return filters + empty2("\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u6587\u7AE0");
  const cells = (row) => {
    const observation = reviewListObservation(row, data2.snapshots, vm4.now || (/* @__PURE__ */ new Date()).toISOString());
    const age = observation.hours !== null ? `<span class="review-note review-observation-age">\u53D1\u5E03\u540E ${e(reviewObservationHours(observation.hours))} \u5C0F\u65F6</span>` : "";
    const metrics2 = columns.map((metric) => [metric.label, `${e(formatReviewListMetric(observation, metric.key))}${metric.key === "reads" ? age : ""}`]);
    const judgement = observation.kind === "longtail" ? '<span class="review-tag">\u957F\u5C3E</span>' : tag(row.verdict);
    const supplement = chosen.includes("reads") ? "" : observation.kind === "immature" ? "\u672A\u6EE124h" : age;
    return [
      ["\u53D1\u5E03\u65F6\u95F4", e(reviewDateTime(row.published_at) || "\u2014")],
      ["\u6807\u9898", `<button type="button" class="review-title-button" data-review-article="${e(row.id)}" aria-haspopup="dialog">${e(row.title || "\u672A\u547D\u540D\u6587\u7AE0")}</button>${sampleLabel(row, data2)}`],
      ...metrics2,
      ["\u5224\u5B9A", `${judgement}${supplement}`]
    ];
  };
  const wide = columns.length > 1;
  return filters + `<div class="review-table-wrap${wide ? " review-columns-wide" : ""}"${wide ? ` style="--review-columns-min:${520 + columns.length * 140}px"` : ""}><table class="review-table review-articles-table"><caption class="review-sr-only">\u6587\u7AE0\u8868\u73B0\uFF0C\u70B9\u51FB\u6587\u7AE0\u884C\u67E5\u770B\u8BE6\u7EC6\u6307\u6807\u4E0E\u5224\u5B9A\u4F9D\u636E</caption><thead><tr>${["\u53D1\u5E03\u65F6\u95F4", "\u6807\u9898", ...columns.map((metric) => metric.label), "\u5224\u5B9A"].map((t) => `<th scope="col">${e(t)}</th>`).join("")}</tr></thead><tbody>${selected.map((row) => `<tr data-review-row="${e(row.id)}">${cells(row).map(([label3, body]) => `<td data-label="${e(label3)}">${body}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function evidence(value) {
  if (value === null || value === void 0 || value === "") return "\u2014";
  if (typeof value !== "object") return String(value);
  if (!value.metric) return "\u2014";
  const labels2 = { ctr: "CTR", ctr_24h: "CTR", reads: "\u9605\u8BFB", reads_24h: "\u9605\u8BFB", completion_rate: "\u5B8C\u8BFB\u7387", completion_24h: "\u5B8C\u8BFB\u7387", avg_read_seconds: "\u5E73\u5747\u9605\u8BFB\u65F6\u957F" };
  const key2 = value.metric, label3 = labels2[key2] || key2;
  return `\u547D\u4E2D ${reviewNumber(value.n_with)} \u7BC7\uFF0C${label3} ${reviewNumber(value.with_median, key2)}\uFF1B\u672A\u547D\u4E2D ${reviewNumber(value.n_without)} \u7BC7\uFF0C${label3} ${reviewNumber(value.without_median, key2)}`;
}
var v13RuleGroups = [["keep_topic", "\u9009\u9898"], ["drop_topic", "\u653E\u5F03\u9009\u9898"], ["title", "\u6807\u9898"], ["body", "\u6B63\u6587"], ["audience", "\u8BFB\u8005"], ["checklist", "\u81EA\u68C0\u6E05\u5355"]];
function v13Evidence(rule) {
  const note = String(rule.evidence_note || "").trim();
  if (note) return firstSentence(note);
  if (rule.evidence === null || rule.evidence === void 0 || rule.evidence === "") return "";
  const value = evidence(rule.evidence);
  return value === "\u2014" ? "" : firstSentence(value);
}
function v13RuleRow(rule, index) {
  const text = String(rule.text || "").trim();
  return `<article class="review-v13-rule-row" id="review-rule-${e(encodeURIComponent(rule.rule_id || index))}"><span class="review-v13-rule-id">${e(rule.rule_id || index)}</span><div class="review-v13-rule-text">${e(text)}</div><span class="review-v13-rule-evidence">${e(v13Evidence(rule))}</span></article>`;
}
function playbook(data2, vm4) {
  const book = [...data2.playbooks || []].filter((p) => p.account === vm4.account && p.status === "active").sort((a, b) => Number(b.version) - Number(a.version) || String(b.published_on || "").localeCompare(String(a.published_on || "")))[0];
  if (!book) return empty2("\u6682\u65E0\u751F\u6548\u624B\u518C");
  const rules2 = Array.isArray(book.rules) ? book.rules : [];
  const lines = String(book.content_md || "").replace(/\r\n?/g, "\n").split("\n");
  const firstSection = lines.findIndex((line) => /^##\s/.test(line));
  const titleLines = firstSection < 0 ? lines : lines.slice(0, firstSection);
  const title = titleLines.map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim()).find(Boolean) || `\u89C4\u5219\u624B\u518C ${book.version}`;
  const content = (firstSection < 0 ? lines : lines.slice(0, firstSection)).filter((line) => !/^#\s/.test(line) && !/^\s*[-*_]{3,}\s*$/.test(line)).join("\n").trim();
  const intro = content ? `<div class="review-v13-intro review-markdown">${renderReviewMarkdown(content)}</div>` : "";
  const groups = v13RuleGroups.map(([id2, label3]) => {
    const group = rules2.filter((rule) => rule.section === id2);
    return `<details class="review-v13-rule-group" open><summary>${e(label3)} \xB7 ${group.length} \u6761</summary>${group.map((rule, index) => v13RuleRow(rule, index + 1)).join("")}</details>`;
  }).join("");
  const ungrouped = rules2.filter((rule) => !v13RuleGroups.some(([id2]) => id2 === rule.section));
  const other = ungrouped.length ? `<details class="review-v13-rule-group" open><summary>\u5176\u4ED6 \xB7 ${ungrouped.length} \u6761</summary>${ungrouped.map((rule, index) => v13RuleRow(rule, index + 1)).join("")}</details>` : "";
  return `<section class="review-v13-rules"><div class="review-v13-rule-meta"><h2>${e(title)}</h2><span class="review-note">\u751F\u6548\u4E8E ${e(day(book.published_on) || "\u2014")}</span><span class="review-note">\u5171 ${rules2.length} \u6761\u89C4\u5219</span></div>${intro}${groups}${other}</section>`;
}
function drawer(data2, rows, vm4) {
  if (!vm4.article) return "";
  const row = rows.find((r) => String(r.id) === String(vm4.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="\u5173\u95ED\u6587\u7AE0\u8BE6\u60C5">\u5173\u95ED <span aria-hidden="true">\xD7</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1">${close}<h2 id="review-detail-title">\u672A\u627E\u5230\u6587\u7AE0</h2><p>\u6587\u7AE0\u53EF\u80FD\u5DF2\u79FB\u9664\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u8D26\u53F7\u3002</p></aside></div>`;
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="\u5173\u95ED\u6587\u7AE0\u8BE6\u60C5"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">\u6587\u7AE0\u8BE6\u60C5</span>${close}</div><div class="review-detail-heading"><span class="review-note">${e(reviewDateTime(row.published_at) || "\u53D1\u5E03\u65F6\u95F4\u672A\u63D0\u4F9B")} \xB7 \u4E0A\u6D77\u65F6\u95F4</span><h2 id="review-detail-title">${e(row.title || "\u672A\u547D\u540D\u6587\u7AE0")}</h2><div class="review-detail-links">${tag(row.verdict)}${external(row.url, "\u67E5\u770B\u539F\u6587 \u2197")}</div></div>${renderTrafficCard(data2.snapshots, row.id)}${renderImitation(row, data2, vm4.account)}</aside></div>`;
}
function renderContentReview() {
  return '<section id="content-review" class="content-review" aria-label="\u5185\u5BB9\u590D\u76D8"><p class="review-status" role="status" aria-live="polite">\u6B63\u5728\u8BFB\u53D6\u5185\u5BB9\u590D\u76D8\u2026</p></section>';
}
function scopedReviewData(data2, account) {
  const result = { ...data2 };
  for (const key2 of ["articles", "reports", "playbooks", "benchmarkAccounts", "notes", "accountHealth"]) result[key2] = (data2[key2] || []).filter((row) => row.account === account);
  const benchmarkIds = new Set(result.benchmarkAccounts.map((row) => String(row.id)));
  result.benchmarkArticles = (data2.benchmarkArticles || []).filter((row) => benchmarkIds.has(String(row.benchmark_account_id)) && (row.account == null || row.account === account));
  const ids = new Set(result.articles.map((row) => String(row.id)));
  result.snapshots = (data2.snapshots || []).filter((row) => ids.has(String(row.article_id)));
  return result;
}
function renderContentReviewContent(data2, vm4) {
  data2 = scopedReviewData(data2, vm4.account);
  if (vm4.loading) return '<p class="review-status" role="status" aria-live="polite">\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u6570\u636E\u2026</p>';
  if (vm4.error) return `<div class="review-empty" role="alert"><strong>\u5185\u5BB9\u590D\u76D8\u8BFB\u53D6\u5931\u8D25</strong><p>${e(vm4.error)}</p><button class="btn" type="button" data-review-action="refresh">\u91CD\u65B0\u8BFB\u53D6</button></div>`;
  const rows = enrichArticles(data2, { account: vm4.account });
  const hasData = ["articles", "snapshots", "reports", "playbooks", "benchmarkAccounts", "benchmarkArticles", "notes"].some((key2) => data2[key2].length);
  const noDataPanel = "";
  const body = hasData ? overview(data2, vm4) : noDataPanel + empty2("\u6682\u65E0\u5185\u5BB9\u590D\u76D8\u6570\u636E") + '<button class="btn text" type="button" data-review-action="refresh">\u5237\u65B0</button>';
  return `<div class="review-body"${vm4.article ? " inert" : ""}>${body}</div>${drawer(data2, rows, vm4)}`;
}

// local-ui/frontend/web/review-controller.mjs
var columnStorageKey = "haoduoyu.review.columns.v1";
var REVIEW_METRIC_COLUMNS = Object.freeze(["reads", "impressions", "fan_impressions", "fan_reads", "ctr", "avg_read_seconds", "completion_rate"]);
function readReviewColumnPreference(raw) {
  try {
    const parsed2 = JSON.parse(raw);
    if (!Array.isArray(parsed2)) return ["reads"];
    const selected = REVIEW_METRIC_COLUMNS.filter((key2) => parsed2.includes(key2));
    return parsed2.length && !selected.length ? ["reads"] : selected;
  } catch {
    return ["reads"];
  }
}
var resources = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health"];
var data = normalizeReviewData();
var sequence4 = 0;
var registered5 = false;
var identity3 = "";
var pageContext2;
var vm3 = {
  account: "V\u5B57",
  view: "overview",
  secondary: "benchmarks",
  week: "this",
  date: "",
  start: "",
  end: "",
  periods: [],
  filters: {},
  metricColumns: readReviewColumnPreference(storage.get(columnStorageKey)),
  metricPickerOpen: false,
  articlesExpanded: false,
  article: "",
  version: "",
  compare: "",
  loading: true,
  error: ""
};
var root = () => typeof document === "undefined" ? null : document.querySelector("#content-review");
function staleRead(message = "\u590D\u76D8\u8D44\u6599\u5728\u8BFB\u53D6\u65F6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002") {
  return Object.assign(new Error(message), { code: "READ_REVISION_CHANGED" });
}
async function readReviewCollection(read3, resource, selectedAccount, current3 = () => true) {
  if (!resources.includes(resource)) throw new Error("\u672A\u77E5\u7684\u590D\u76D8\u8D44\u6599\u7C7B\u578B\u3002");
  const items = [], seen = /* @__PURE__ */ new Set(), foreignIds = /* @__PURE__ */ new Set();
  let revision;
  for (let offset = 0; ; offset += 100) {
    const page2 = await read3(`/review/${resource}?account=${encodeURIComponent(selectedAccount)}&offset=${offset}${revision === void 0 ? "" : `&read_revision=${encodeURIComponent(revision)}`}`);
    if (!current3()) return null;
    if (!Array.isArray(page2?.items) || typeof page2.has_more !== "boolean" || page2.items.length > 100 || page2.has_more && page2.items.length !== 100) throw new Error("\u590D\u76D8\u5206\u9875\u8D44\u6599\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
    if (page2.read_revision !== void 0) {
      if (revision !== void 0 && revision !== page2.read_revision) throw staleRead();
      revision = page2.read_revision;
    }
    for (const row of page2.items) {
      if (!row || typeof row !== "object" || row.id === null || row.id === void 0 || seen.has(String(row.id))) throw staleRead("\u590D\u76D8\u8D44\u6599\u5B58\u5728\u91CD\u590D\u6216\u65E0\u6548\u8BB0\u5F55\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
      seen.add(String(row.id));
      if (resource !== "snapshots" && row.account !== selectedAccount) {
        foreignIds.add(String(row.id));
        continue;
      }
      items.push(row);
    }
    if (!page2.has_more) return { items, read_revision: revision, foreignIds };
  }
}
async function readContentReviewData(read3, selectedAccount, current3 = () => true) {
  const results = await Promise.all(resources.map((name) => readReviewCollection(read3, name, selectedAccount, current3)));
  if (!current3() || results.some((result2) => result2 === null)) return null;
  const revisions = results.map((result2) => result2.read_revision).filter((value) => value !== void 0);
  if (revisions.length && revisions.some((value) => value !== revisions[0])) throw staleRead();
  const result = normalizeReviewData(Object.fromEntries(resources.map((key2, index) => [key2, results[index].items])));
  const articles = new Set(result.articles.map((row) => String(row.id)));
  const foreignArticles = results[0].foreignIds;
  if (result.snapshots.some((row) => !articles.has(String(row.article_id)) && !foreignArticles.has(String(row.article_id))))
    throw staleRead("\u5FEB\u7167\u5BF9\u5E94\u7684\u6587\u7AE0\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002");
  result.snapshots = result.snapshots.filter((row) => articles.has(String(row.article_id)));
  result.playbooks.sort((a, b) => String(b.published_on || "").localeCompare(String(a.published_on || "")) || String(b.version).localeCompare(String(a.version), void 0, { numeric: true }));
  result.reports.sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.id).localeCompare(String(a.id)));
  return result;
}
async function readContentReviewDataWithRetry(read3, selectedAccount, current3 = () => true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readContentReviewData(read3, selectedAccount, current3);
    } catch (error) {
      if (!current3()) return null;
      if (error.code !== "READ_REVISION_CHANGED" || attempt) throw error;
    }
  }
}
function reviewRoute2(href, defaultAccount = vm3.account) {
  const p = new URL(href).searchParams, legacy = p.get("review_view");
  const requested = p.get("tab") || (legacy === "playbooks" ? "playbook" : legacy);
  const view2 = REVIEW_VIEWS.some(([id2]) => id2 === requested) ? requested : "overview";
  const section = p.get("review_section");
  const benchmark = p.get("review_benchmark") || "";
  const secondary = benchmark ? "benchmarks" : REVIEW_SECTIONS.some(([id2]) => id2 === section) ? section : ["notes", "playbook"].includes(section) || view2 === "playbook" ? "review" : "benchmarks";
  return { account: p.get("account")?.trim() || defaultAccount, view: view2, secondary, week: p.get("review_week") === "last" ? "last" : "this", article: benchmark ? "" : p.get("review_article") || "", benchmark, version: p.get("review_version") || "" };
}
var route = () => reviewRoute2(location.href);
function writeRoute(values) {
  const url = new URL(location.href);
  for (const [key2, value] of Object.entries(values)) {
    const name = key2 === "view" ? "tab" : `review_${key2}`;
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  for (const key2 of ["review_view", "review_date", "review_period", "review_compare"]) url.searchParams.delete(key2);
  if (!url.searchParams.has("tab")) url.searchParams.set("tab", vm3.view);
  history.replaceState({}, "", url);
}
function syncViewFromRoute() {
  vm3 = { ...vm3, ...route(), loading: false, error: "" };
}
function focusBenchmark(id2) {
  if (!id2) return;
  const node2 = document.getElementById(`review-benchmark-${encodeURIComponent(id2)}`);
  if (!node2 || !root()?.contains(node2)) return;
  node2.scrollIntoView({ block: "start" });
  node2.focus({ preventScroll: true });
}
function positionReviewColumnsPicker() {
  const picker = root()?.querySelector("[data-review-columns-picker]");
  if (!picker?.open) return;
  const trigger = picker.querySelector("[data-review-columns-trigger]");
  const menu = picker.querySelector(".review-columns-menu");
  if (!trigger || !menu) return;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  let viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const nav2 = document.querySelector(".mobile-nav");
  if (nav2 && nav2.getClientRects().length && getComputedStyle(nav2).visibility !== "hidden") {
    const rect2 = nav2.getBoundingClientRect();
    if (rect2.bottom > viewportTop && rect2.top < viewportBottom) viewportBottom = Math.min(viewportBottom, rect2.top);
  }
  const rect = trigger.getBoundingClientRect();
  const gap = 8;
  const above = Math.max(0, rect.top - viewportTop - gap);
  const below = Math.max(0, viewportBottom - rect.bottom - gap);
  const placeUp = menu.scrollHeight + 2 > below && above > below;
  picker.dataset.reviewColumnsPlacement = placeUp ? "up" : "down";
  menu.style.setProperty("--review-columns-max-height", `${Math.floor(placeUp ? above : below)}px`);
}
var columnPositionFrame = 0;
function scheduleReviewColumnsPosition() {
  if (columnPositionFrame || !root()?.querySelector("[data-review-columns-picker][open]")) return;
  columnPositionFrame = requestAnimationFrame(() => {
    columnPositionFrame = 0;
    positionReviewColumnsPicker();
  });
}
var returnFocusId = "";
var returnScroll = 0;
function syncReviewFullscreen() {
  const node2 = root(), button2 = node2?.querySelector('[data-review-action="toggle-fullscreen"]');
  if (!button2) return;
  const active2 = node2.classList.contains("review-list-fullscreen");
  button2.textContent = active2 ? "\u9000\u51FA\u5168\u5C4F" : "\u5168\u5C4F\u663E\u793A";
  button2.setAttribute("aria-pressed", String(active2));
}
async function toggleReviewFullscreen() {
  const node2 = root();
  if (!node2) return;
  if (node2.classList.contains("review-list-fullscreen")) {
    node2.classList.remove("review-list-fullscreen");
    if (document.fullscreenElement === node2) await document.exitFullscreen().catch(() => {
    });
  } else {
    vm3.articlesExpanded = true;
    paintContentReviewPage();
    node2.classList.add("review-list-fullscreen");
    if (node2.requestFullscreen) await node2.requestFullscreen().catch(() => {
    });
  }
  syncReviewFullscreen();
}
async function toggleArticleList() {
  const node2 = root();
  if (!node2 || vm3.loading || vm3.error) return;
  const expanded = !vm3.articlesExpanded;
  if (!expanded && node2.classList.contains("review-list-fullscreen")) await toggleReviewFullscreen();
  vm3.articlesExpanded = expanded;
  vm3.metricPickerOpen = false;
  paintContentReviewPage();
  const button2 = root()?.querySelector(".review-articles-toggle");
  button2?.focus({ preventScroll: true });
  if (!expanded) root()?.querySelector(".review-articles-panel")?.scrollIntoView({ block: "start", behavior: "instant" });
}
function paintContentReviewPage() {
  const node2 = root();
  if (!node2) return;
  node2.innerHTML = renderContentReviewContent(data, vm3);
  syncReviewFullscreen();
  const dialog = node2.querySelector('[role="dialog"]');
  for (const child of node2.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector(".review-drawer-close")?.focus({ preventScroll: true });
  if (vm3.metricPickerOpen) positionReviewColumnsPicker();
}
async function loadContentReview(context) {
  registerEvents2();
  pageContext2 = context;
  const [{ apiNetwork: apiNetwork2 }, { state: state2, runtime: runtime2 }] = await Promise.all([Promise.resolve().then(() => (init_client(), client_exports)), Promise.resolve().then(() => (init_state(), state_exports))]);
  const requested = route(), currentIdentity2 = `${runtime2.sessionEpoch}:${state2.me?.id || ""}:${requested.account}`;
  if (identity3 !== currentIdentity2) {
    data = normalizeReviewData();
    vm3.filters = {};
    vm3.articlesExpanded = false;
    identity3 = currentIdentity2;
  }
  vm3 = { ...vm3, ...requested, loading: true, error: "" };
  paintContentReviewPage();
  const ticket = ++sequence4, epoch = runtime2.sessionEpoch;
  const current3 = () => ticket === sequence4 && epoch === runtime2.sessionEpoch && state2.page === "review" && route().account === requested.account && Boolean(root());
  const read3 = (path) => apiNetwork2(path, context ? { context } : {});
  try {
    const result = await readContentReviewDataWithRetry(read3, requested.account, current3);
    if (!current3() || !result) return;
    data = result;
    syncViewFromRoute();
    paintContentReviewPage();
    focusBenchmark(vm3.benchmark);
  } catch (error) {
    if (!current3() || error.name === "AbortError") return;
    vm3.loading = false;
    vm3.error = error.message || "\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
    paintContentReviewPage();
  }
}
function closeArticle() {
  vm3.article = "";
  writeRoute({ article: "" });
  paintContentReviewPage();
  const node2 = [...root()?.querySelectorAll("[data-review-article]") || []].find((el) => el.dataset.reviewArticle === returnFocusId);
  node2?.focus({ preventScroll: true });
  window.scrollTo({ top: returnScroll, behavior: "instant" });
}
function selectTab2(view2, focus = false) {
  vm3.view = view2;
  vm3.article = "";
  vm3.benchmark = "";
  writeRoute({ view: view2, article: "", benchmark: "" });
  paintContentReviewPage();
  if (focus) root()?.querySelector(`#review-tab-${view2}`)?.focus({ preventScroll: true });
}
function registerEvents2() {
  if (registered5 || typeof document === "undefined") return;
  registered5 = true;
  document.addEventListener("fullscreenchange", () => {
    const node2 = root();
    if (node2?.classList.contains("review-list-fullscreen") && !document.fullscreenElement && node2.dataset.nativeFullscreen === "true") {
      node2.classList.remove("review-list-fullscreen");
      node2.dataset.nativeFullscreen = "";
    } else if (node2 && document.fullscreenElement === node2) node2.dataset.nativeFullscreen = "true";
    syncReviewFullscreen();
  });
  document.addEventListener("toggle", (event) => {
    const picker = event.target;
    if (picker.matches?.("[data-review-columns-picker]") && root()?.contains(picker)) {
      vm3.metricPickerOpen = picker.open;
      if (picker.open) positionReviewColumnsPicker();
    }
  }, true);
  window.addEventListener("resize", scheduleReviewColumnsPosition, { passive: true });
  document.addEventListener("scroll", scheduleReviewColumnsPosition, { capture: true, passive: true });
  window.visualViewport?.addEventListener("resize", scheduleReviewColumnsPosition, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleReviewColumnsPosition, { passive: true });
  document.addEventListener("click", (event) => {
    const node2 = root();
    const picker = node2?.querySelector("[data-review-columns-picker]");
    if (picker?.open && !picker.contains(event.target)) {
      picker.open = false;
      vm3.metricPickerOpen = false;
    }
    const benchmarkLink = event.target.closest?.("a[data-review-benchmark]");
    if (benchmarkLink && node2?.contains(benchmarkLink)) {
      event.preventDefault();
      vm3.article = "";
      vm3.secondary = "benchmarks";
      vm3.benchmark = benchmarkLink.dataset.reviewBenchmark;
      writeRoute({ section: "benchmarks", article: "", benchmark: vm3.benchmark });
      paintContentReviewPage();
      focusBenchmark(vm3.benchmark);
      return;
    }
    if (event.target.closest?.("a")) return;
    const target = event.target.closest?.("button,[data-review-row]");
    if (!target || !node2?.contains(target)) return;
    if (target.dataset.reviewAction === "toggle-articles") {
      void toggleArticleList();
      return;
    }
    if (target.dataset.reviewAction === "toggle-fullscreen") {
      void toggleReviewFullscreen();
      return;
    }
    if (target.dataset.reviewAction === "show-health") {
      vm3.view = "overview";
      vm3.secondary = "attention";
      vm3.article = "";
      writeRoute({ view: "overview", section: "attention", article: "" });
      paintContentReviewPage();
      const history2 = node2.querySelector("#review-health-history");
      history2?.scrollIntoView({ behavior: "smooth", block: "start" });
      history2?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.reviewAction === "refresh") {
      void loadContentReview(pageContext2);
      return;
    }
    if (vm3.loading || vm3.error) return;
    if (target.dataset.reviewSecondary) {
      vm3.secondary = target.dataset.reviewSecondary;
      vm3.benchmark = "";
      writeRoute({ section: vm3.secondary, benchmark: "" });
      paintContentReviewPage();
      root()?.querySelector(`#review-secondary-${vm3.secondary}`)?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.reviewView) {
      selectTab2(target.dataset.reviewView, true);
      return;
    }
    if (target.dataset.reviewWeek) {
      vm3.week = target.dataset.reviewWeek;
      writeRoute({ week: vm3.week });
      paintContentReviewPage();
      root()?.querySelector(`[data-review-week="${vm3.week}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (target.dataset.reviewAction === "close-article") {
      closeArticle();
      return;
    }
    const article = target.dataset.reviewArticle || target.dataset.reviewRow;
    if (article) {
      returnFocusId = article;
      returnScroll = window.scrollY;
      vm3.article = article;
      vm3.benchmark = "";
      writeRoute({ article, benchmark: "" });
      paintContentReviewPage();
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    const node2 = root();
    if (!node2?.contains(target) || vm3.loading || vm3.error) return;
    const column = target.dataset.reviewColumn;
    if (column !== void 0) {
      if (!REVIEW_METRIC_COLUMNS.includes(column)) return;
      const selected = new Set(vm3.metricColumns);
      if (target.checked) selected.add(column);
      else selected.delete(column);
      vm3.metricColumns = REVIEW_METRIC_COLUMNS.filter((key3) => selected.has(key3));
      vm3.metricPickerOpen = true;
      storage.set(columnStorageKey, JSON.stringify(vm3.metricColumns));
      const scrollLeft = node2.querySelector(".review-table-wrap")?.scrollLeft || 0;
      const scrollY = window.scrollY;
      paintContentReviewPage();
      const current3 = root();
      const picker = current3?.querySelector("[data-review-columns-picker]");
      if (picker) picker.open = true;
      const table2 = current3?.querySelector(".review-table-wrap");
      if (table2) table2.scrollLeft = scrollLeft;
      current3?.querySelector(`[data-review-column="${column}"]`)?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY, behavior: "instant" });
      positionReviewColumnsPicker();
      return;
    }
    if (!target.dataset.reviewFilter) return;
    const key2 = target.dataset.reviewFilter;
    vm3.filters[key2] = target.value;
    paintContentReviewPage();
    root()?.querySelector(`[data-review-filter="${key2}"]`)?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (event) => {
    const node2 = root();
    if (!node2?.contains(event.target)) return;
    const dialog = node2.querySelector('[role="dialog"]');
    if (dialog) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeArticle();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')].filter((el) => !el.hidden && el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    const picker = node2.querySelector("[data-review-columns-picker]");
    if (event.key === "Escape" && picker?.open) {
      event.preventDefault();
      picker.open = false;
      vm3.metricPickerOpen = false;
      picker.querySelector("[data-review-columns-trigger]")?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Escape" && node2.classList.contains("review-list-fullscreen")) {
      event.preventDefault();
      void toggleReviewFullscreen();
      return;
    }
    if (event.target.matches("[data-review-secondary]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const ids = REVIEW_SECTIONS.map(([id2]) => id2), index = ids.indexOf(vm3.secondary);
      vm3.secondary = event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
      vm3.benchmark = "";
      writeRoute({ section: vm3.secondary, benchmark: "" });
      paintContentReviewPage();
      root()?.querySelector(`#review-secondary-${vm3.secondary}`)?.focus({ preventScroll: true });
      return;
    }
    if (event.target.matches("[data-review-view]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const ids = REVIEW_VIEWS.map(([id2]) => id2), index = ids.indexOf(vm3.view);
      selectTab2(event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length], true);
    }
  });
  window.addEventListener("popstate", () => {
    if (!root()) return;
    const next2 = route();
    if (next2.account !== vm3.account) void loadContentReview(pageContext2);
    else {
      syncViewFromRoute();
      paintContentReviewPage();
      focusBenchmark(vm3.benchmark);
    }
  });
}

// local-ui/frontend/web/controller.mjs
function mainContent() {
  return `<div id="page-header" class="page-head"></div>${state.page === "settings" ? segmented(
    "settings-tab",
    Object.entries(
      state.me?.publicBusiness ? { todo: settingsTabs.todo, openai: settingsTabs.openai } : Object.fromEntries(Object.entries(settingsTabs).filter(([key2]) => key2 !== "workspace"))
    ),
    state.settingsTab,
    "\u8BBE\u7F6E\u5206\u7C7B",
    "tab",
    "page-tabs"
  ) : ""}${state.page === "settings" && state.me?.publicBusiness && state.settingsTab !== "openai" ? '<p class="hint"><a href="?page=login">\u7BA1\u7406\u5458\u767B\u5F55</a></p>' : ""}${state.page === "settings" ? '<section class="card panel" aria-label="\u672C\u5730\u5F85\u5904\u7406"><h2>\u672C\u5730\u5F85\u5904\u7406</h2><p class="hint">\u5185\u5BB9\u53EA\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u7F51\u7AD9\u3002</p><div id="offline-settings-entry"></div></section>' : ""}${renderMediaTabs()}<div id="page-content"></div>`;
}
function reuseShell() {
  const shell = $(".shell"), main = $("#main");
  if (!main || shell?.dataset.session !== String(runtime.sessionEpoch) || shell.dataset.user !== state.me?.id) return false;
  setMenu(false);
  for (const link of $$(".nav-item,.mobile-nav-item", shell)) {
    const current3 = link.dataset.nav === state.page;
    link.classList.toggle("active", current3);
    if (current3) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  syncWorkbenchNavigation();
  main.innerHTML = mainContent();
  return true;
}
function renderShell() {
  redirectMobileArticlePage();
  if (state.page === "settings" && (state.settingsTab === "workspace" || state.me?.publicBusiness && !["todo", "openai"].includes(state.settingsTab)))
    state.settingsTab = "todo";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" class="sidebar" aria-label="\u4E3B\u8981\u5BFC\u822A"><div class="sidebar-brand"><a href="?page=review&amp;account=${e(encodeURIComponent(state.account || "V\u5B57"))}" class="brand" data-nav="review"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">\u597D\u591A\u9C7C\u5DE5\u4F5C\u53F0</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="\u5173\u95ED\u5BFC\u822A" aria-expanded="false" aria-controls="site-nav">${icon(
    "close"
  )}</button></div><nav class="nav-list" tabindex="0" aria-label="\u6A21\u5757\u5BFC\u822A">${sidebarNavigation()}</nav><div class="sidebar-bottom">${settingsNavigation()}${state.me.publicBusiness ? "" : `<div class="user-row"><span class="avatar">${e((state.me.username || "\u6211").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="\u9000\u51FA\u767B\u5F55" aria-label="\u9000\u51FA\u767B\u5F55">${icon("logout", 16)}</button>`}</div>`}</div></aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>\u597D\u591A\u9C7C\u5DE5\u4F5C\u53F0</span><button class="icon-button mobile-settings-trigger" data-action="menu" aria-label="\u8BBE\u7F6E\u83DC\u5355" aria-expanded="false" aria-controls="mobile-settings-menu">${icon("settings", 20)}</button>${mobileSettingsMenu()}</header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  setupSidebarResize();
  setupMobileViewport();
  renderPage();
}
function redirectMobileArticlePage() {
  const page2 = mobilePage(state.page);
  if (page2 === state.page) return false;
  state.page = page2;
  updateRoute();
  return true;
}
function handleResponsiveLayout() {
  syncMobileViewport();
  syncMenu();
  const redirected = redirectMobileArticlePage();
  if (redirected && state.me) renderShell();
  return redirected;
}
function navigateLink(page2) {
  const target = mobilePage(page2);
  const same2 = target === state.page && (target !== "memos" || !state.memoView) && (page2 !== "settings" || state.settingsTab === "workspace") && (page2 !== "todos" || !state.todoDate && !state.todoPanel);
  if (same2 && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page2);
}
function navigate(page2, tab) {
  page2 = mobilePage(page2);
  if (page2 === "memos" && tab === "trash") {
    page2 = "settings";
    tab = "workspace";
  }
  const legacy = Object.hasOwn(legacyPages, page2) ? legacyPages[page2] : null;
  if (legacy) page2 = "settings";
  if (!nav.some((n) => n.id === page2)) return;
  state.page = page2;
  if (page2 === "memos") state.memoView = tab === "trash" ? "trash" : "";
  if (page2 === "todos") {
    state.todoDate = "";
    state.todoPanel = "";
  }
  if (page2 === "settings") state.settingsTab = (legacy || tab) === "workspace" ? "todo" : legacy || (Object.hasOwn(settingsTabs, tab) ? tab : "todo");
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page2) {
  if (page2 === "review") return renderContentReview();
  if (page2 === "todos") return renderTodos();
  if (page2 === "notes") return renderDailyNotes();
  if (page2 === "memos") return renderMemos();
  if (page2 === "reminders") return renderWorkReminders();
  if (page2 === "ai-diagnosis") return renderAiDiagnosis();
  if (page2 === "ai-reports") return renderAiReports();
  if (page2 === "settings" && state.settingsTab === "workspace") return renderWorkbenchSettings();
  if (page2 === "settings" && state.settingsTab === "openai") return openAiSettingsPage();
  return skeleton();
}
function setPageBody(html, page2) {
  if (page2 === "review") {
    if (html) replacePageContent(html, true);
    else paintContentReviewPage();
  } else if (page2 === "todos") paintTodos();
  else if (page2 === "notes") paintDailyNotesPage();
  else if (page2 === "memos") paintMemosPage();
  else if (page2 === "settings" && state.settingsTab === "workspace") paintMemosPage();
  else if (page2 === "reminders" || page2 === "ai-reports" || page2 === "ai-diagnosis" || page2 === "settings" && state.settingsTab === "openai") return;
  else replacePageContent(html, true);
}
function publishedArticleLinks(html) {
  const query = new URLSearchParams({ page: "articles", status: "published", sort: "reads", order: "desc" });
  if (state.topPlatform) query.set("platform", state.topPlatform);
  if (state.account) query.set("account", state.account);
  return html.replace('href="?page=articles&amp;sort=reads&amp;order=desc"', `href="?${e(query.toString())}"`);
}
function renderMediaOverview(data2) {
  return publishedArticleLinks(renderDashboardSummary(data2));
}
async function renderPage() {
  stopOpenAiReviewTimers();
  if (redirectMobileArticlePage()) {
    renderShell();
    return;
  }
  stopPageEntry();
  closePopover({ restoreFocus: false });
  const version = ++runtime.renderVersion, page2 = state.page;
  const context = beginPageRequests();
  const counter = $("#page-count");
  if (counter) counter.hidden = true;
  const hasTodos = page2 === "todos";
  replacePageContent(pageLoading(page2));
  if (hasTodos) loadTodos(context);
  $("#page-content")?.setAttribute("aria-busy", "true");
  try {
    let html = "", data2;
    switch (page2) {
      case "todos":
        html = renderTodos();
        break;
      case "notes":
        await loadDailyNotes();
        break;
      case "memos":
        await loadMemos();
        break;
      case "reminders":
        await loadWorkReminders();
        break;
      case "ai-diagnosis":
        await loadAiDiagnosis();
        break;
      case "ai-reports":
        await loadAiReports({ resetDate: true });
        break;
      case "review":
        await loadContentReview(context);
        break;
      case "settings":
        if (state.settingsTab === "workspace") break;
        else if (state.settingsTab === "openai") {
          await loadOpenAiSettings();
        } else if (state.settingsTab === "todo") {
          await loadTodoPreferences(context);
          html = renderTodoSettings();
        } else if (state.settingsTab === "keys") {
          data2 = await api("/api-keys", { context });
          html = renderKeys(data2);
        } else if (state.settingsTab === "security") html = renderSecurity();
        else {
          const [audit, keys] = await Promise.all([api("/audit", { context }), api("/api-keys", { context })]);
          html = renderAudit(audit, keys);
        }
        break;
    }
    if (version === runtime.renderVersion && state.me) {
      setPageBody(html, page2);
      if (counter?.isConnected) {
        const count2 = null;
        counter.hidden = count2 == null;
        counter.textContent = count2 == null ? "" : num(count2);
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version === runtime.renderVersion && state.me) setPageBody(`<div class="card error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>\u672C\u6B21\u6570\u636E\u8BFB\u53D6\u5931\u8D25</h3><p>${e(err.message)}</p><button class="btn" data-action="refresh">${icon("refresh")}\u91CD\u65B0\u52A0\u8F7D</button></div>`, page2);
  } finally {
    if (version === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function reloadFilteredPage(focus = "[data-action=article-filter]") {
  state.listPage = 1;
  updateRoute();
  const version = runtime.renderVersion + 1;
  await renderPage();
  if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(focus)?.focus();
}
function applyArticleFilters(form) {
  const draft = articleDraft(form);
  state.filters = draft.filters;
  state.columns = draft.columns;
  state.account = draft.account;
  closePopover();
  reloadFilteredPage();
}
async function init({ freshLogin = false } = {}) {
  resetSessionIndexes();
  const initEpoch = runtime.sessionEpoch;
  try {
    try {
      const views = JSON.parse(storage.get("haoduoyu.views") || "[]");
      state.savedViews = Array.isArray(views) ? views.filter((v) => typeof v?.id === "string" && typeof v.name === "string" && v.filters && typeof v.filters === "object" && Array.isArray(v.columns)).slice(-20) : [];
    } catch {
      state.savedViews = [];
    }
    const me = await api("/auth/me");
    if (initEpoch !== runtime.sessionEpoch) return;
    state.me = me;
    if (me.publicBusiness && new URLSearchParams(location.search).get("page") === "login") {
      renderLogin();
      return;
    }
    const accounts = await api("/accounts");
    if (initEpoch !== runtime.sessionEpoch) return;
    state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - [
      "toutiao",
      "zhihu",
      "wechat",
      "other"
    ].indexOf(b.platform));
    readRoute();
    if (freshLogin) {
      state.trendOpen = false;
      state.attentionExpanded = false;
    }
    updateRoute();
    renderShell();
  } catch (err) {
    if (initEpoch !== runtime.sessionEpoch || err.staleSession || isRequestAbort(err)) return;
    if (err.status === 401 && !err.offlineScopeFailure) renderLogin();
    else {
      const retryAt = err.status === 429 ? retryUntil(Date.now(), err.retryAfterMs) : 0;
      let retrying = false;
      renderInitializationError(err.message, () => {
        if (retrying || Date.now() < retryAt) return;
        retrying = true;
        void init();
      }, { status: err.status });
    }
  }
}

// local-ui/frontend/web/events.mjs
init_state();

// local-ui/frontend/web/pages/article-verification.mjs
init_client();
init_state();
var copy = (value) => structuredClone(value);
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validArticle(value, id2) {
  return value?.id === id2 && Number.isSafeInteger(value.version) && value.version > 0 && (value.verify_items === null || Array.isArray(value.verify_items));
}
function verificationIntent(index, done) {
  return `\u7B2C ${index + 1} \u9879\u8BBE\u4E3A${done ? "\u5DF2\u5904\u7406" : "\u5F85\u5904\u7406"}`;
}
function createArticleVerificationStore({ article, load, put, uuid: uuid2 = () => crypto.randomUUID(), onChange = () => {
}, isCurrent = () => true }) {
  let current3 = copy(article), phase = "idle", message = "", pending = null, busy = false, retryReady = false;
  const snapshot = () => ({ article: copy(current3), phase, message, busy, retryReady });
  const notify = () => onChange(snapshot());
  function received(value) {
    if (!validArticle(value, current3.id)) throw new Error("\u8BE6\u60C5\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6838\u5BF9\u3002");
    current3 = copy(value);
  }
  async function reconcile(conflict = false) {
    let remote;
    try {
      remote = await load(current3.id);
    } catch {
      phase = "unknown";
      retryReady = false;
      message = "\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u3002";
      return false;
    }
    if (!validArticle(remote, current3.id)) {
      phase = "unknown";
      retryReady = false;
      message = "\u8BE6\u60C5\u8BFB\u53D6\u4E0D\u5B8C\u6574\uFF0C\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\u3002";
      return false;
    }
    if (pending && remote.version > pending.body.version && same(remote.verify_items, pending.body.verify_items)) {
      received(remote);
      pending = null;
      phase = "saved";
      retryReady = false;
      message = "\u5DF2\u6838\u5BF9\u670D\u52A1\u5668\u8BB0\u5F55\uFF0C\u5F53\u524D\u9009\u62E9\u5DF2\u4FDD\u5B58\u3002";
      return false;
    }
    if (conflict || pending && remote.version !== pending.body.version) {
      const intent = pending ? verificationIntent(pending.index, pending.done) : "\u672C\u6B21\u9009\u62E9";
      received(remote);
      pending = null;
      phase = "conflict";
      retryReady = false;
      message = `${intent}\u672A\u4FDD\u5B58\uFF1B\u5DF2\u663E\u793A\u6700\u65B0\u7248\u672C\uFF0C\u8BF7\u6838\u5BF9\u540E\u91CD\u65B0\u9009\u62E9\u3002`;
      return false;
    }
    received(remote);
    phase = pending ? "unknown" : "idle";
    retryReady = !!pending && same(remote.verify_items, pending.before);
    message = pending ? retryReady ? "\u539F\u4FDD\u5B58\u5C1A\u672A\u786E\u8BA4\uFF1B\u5DF2\u8BFB\u53D6\u5F53\u524D\u7248\u672C\uFF0C\u53EF\u663E\u5F0F\u91CD\u8BD5\u539F\u4FDD\u5B58\u3002" : "\u8BB0\u5F55\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\uFF1B\u4E0D\u4F1A\u91CD\u53D1\u4FDD\u5B58\u3002" : "";
    return retryReady;
  }
  async function send() {
    if (!isCurrent()) return;
    phase = "saving";
    message = "";
    retryReady = false;
    notify();
    let response;
    try {
      response = await put(current3.id, copy(pending.body), pending.key);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        pending = null;
        phase = "error";
        message = error.message || "\u4FDD\u5B58\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u6838\u5BF9\u540E\u91CD\u8BD5\u3002";
      } else await reconcile(error.status === 409);
      return;
    }
    if (!validArticle(response, current3.id) || response.version <= pending.body.version || !same(response.verify_items, pending.body.verify_items)) {
      await reconcile();
      return;
    }
    received({ ...current3, ...response });
    pending = null;
    phase = "saved";
    message = "";
    try {
      const remote = await load(current3.id);
      if (validArticle(remote, current3.id) && remote.version >= current3.version) {
        const matches = same(remote.verify_items, current3.verify_items);
        received(remote);
        if (!matches) {
          phase = "conflict";
          message = "\u4FDD\u5B58\u540E\u8BB0\u5F55\u53C8\u6709\u66F4\u65B0\uFF0C\u5DF2\u663E\u793A\u6700\u65B0\u5185\u5BB9\u3002";
        }
      }
    } catch {
      message = "\u5DF2\u4FDD\u5B58\uFF0C\u6700\u65B0\u8BE6\u60C5\u6682\u672A\u8BFB\u53D6\u3002";
    }
  }
  async function save3(index, done) {
    if (busy || pending || !Number.isSafeInteger(index) || typeof done !== "boolean" || !Array.isArray(current3.verify_items) || !current3.verify_items[index] || typeof current3.verify_items[index] !== "object") return;
    if (current3.verify_items[index].done === done) return;
    const items = copy(current3.verify_items);
    items[index].done = done;
    pending = { index, done, before: copy(current3.verify_items), body: { version: current3.version, verify_items: items }, key: uuid2() };
    busy = true;
    try {
      await send();
    } finally {
      busy = false;
      notify();
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    notify();
    try {
      await reconcile();
    } finally {
      busy = false;
      notify();
    }
  }
  async function retry() {
    if (busy || !pending) return;
    busy = true;
    notify();
    try {
      if (await reconcile()) await send();
    } finally {
      busy = false;
      notify();
    }
  }
  return { snapshot, save: save3, refresh, retry };
}
var binding = null;
function bindArticleVerification(article, { isCurrent, render }) {
  const epoch = runtime.sessionEpoch, value = { articleId: article.id, epoch, isCurrent, render, store: null };
  value.store = createArticleVerificationStore({
    article,
    isCurrent: () => binding === value && epoch === runtime.sessionEpoch && isCurrent(),
    load: (id2) => api(`/articles/${encodeURIComponent(id2)}`),
    put: (id2, body, key2) => api(`/articles/${encodeURIComponent(id2)}`, {
      method: "PUT",
      body,
      headers: { "Idempotency-Key": key2 }
    }),
    onChange: (state2) => {
      if (binding === value && epoch === runtime.sessionEpoch && isCurrent()) render(state2);
    }
  });
  binding = value;
  return value.store.snapshot();
}
function activeBinding() {
  return binding && binding.epoch === runtime.sessionEpoch && binding.isCurrent() ? binding : null;
}
async function handleArticleVerificationChange(target) {
  const active2 = activeBinding();
  if (!active2 || target.dataset.articleId !== active2.articleId) return;
  const index = Number(target.dataset.articleVerifyIndex);
  const value = target.type === "checkbox" ? target.checked : target.value === "true" ? true : target.value === "false" ? false : null;
  if (typeof value === "boolean") {
    try {
      await active2.store.save(index, value);
    } catch (error) {
      verificationFeedback(error);
    }
  }
}
function verificationFeedback(error) {
  if (!activeBinding()) return;
  const status = document.querySelector("#overlay [data-article-verify-status]");
  if (status) status.textContent = error.message || "\u8BE6\u60C5\u6682\u65F6\u65E0\u6CD5\u5237\u65B0\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6838\u5BF9\u3002";
}
async function refreshArticleVerification() {
  try {
    await activeBinding()?.store.refresh();
  } catch (error) {
    verificationFeedback(error);
  }
}
async function retryArticleVerification() {
  try {
    await activeBinding()?.store.retry();
  } catch (error) {
    verificationFeedback(error);
  }
}

// local-ui/frontend/web/ui/todo-gestures.mjs
function cancelTodoPress(gesture) {
  if (gesture.press) clearTimeout(gesture.press.timer);
  gesture.press = null;
}
function todoPressRow(target) {
  const row = target?.closest?.(".daily-todo-row");
  if (!row || target.closest("button,a,select,textarea,input:not([type=checkbox])")) return null;
  if (row.querySelector('input[aria-disabled="true"]')) return null;
  return row;
}
function todoPressEligible(gesture, press, x = press.x, y = press.y) {
  if (!press.row.isConnected || document.visibilityState === "hidden" || !press.row.getClientRects().length) return false;
  const rect = press.row.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  return gesture.isEligible({ id: press.id, date: press.date, anchor: press.row });
}
function openTodoPress(gesture, press) {
  if (gesture.press !== press) return;
  if (gesture.pointers.size !== 1 || !todoPressEligible(gesture, press)) {
    cancelTodoPress(gesture);
    return;
  }
  gesture.press = null;
  gesture.blocked = { pointerId: press.pointerId, row: press.row, x: press.x, y: press.y, until: Infinity };
  gesture.onOpen({ id: press.id, date: press.date, anchor: press.row });
}
function startTodoPress(gesture, event) {
  gesture.blocked = null;
  cancelTodoPress(gesture);
  if (!["touch", "pen"].includes(event.pointerType)) return;
  gesture.pointers.add(event.pointerId);
  if (gesture.pointers.size !== 1 || event.isPrimary === false || event.button !== 0) return;
  const row = todoPressRow(event.target);
  if (!row) return;
  const press = {
    row,
    id: row.dataset.id,
    date: row.dataset.date || row.querySelector("[data-date]")?.dataset.date,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timer: null
  };
  if (!press.id || !press.date || !todoPressEligible(gesture, press)) return;
  gesture.press = press;
  press.timer = setTimeout(() => openTodoPress(gesture, press), 650);
}
function moveTodoPress(gesture, event) {
  const press = gesture.press;
  if (!press || press.pointerId !== event.pointerId) return;
  const moved2 = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10;
  if (moved2 || !todoPressEligible(gesture, press, event.clientX, event.clientY)) cancelTodoPress(gesture);
}
function endTodoPress(gesture, event) {
  gesture.pointers.delete(event.pointerId);
  if (gesture.press?.pointerId === event.pointerId) cancelTodoPress(gesture);
  if (gesture.blocked?.pointerId === event.pointerId) gesture.blocked.until = Date.now() + 800;
}
function blockTodoPressClick(gesture, event) {
  const blocked2 = gesture.blocked;
  if (!blocked2 || Date.now() > blocked2.until || !event.pointerType && event.detail === 0) return;
  const samePointer = event.pointerId === blocked2.pointerId;
  const samePosition = Math.hypot(event.clientX - blocked2.x, event.clientY - blocked2.y) <= 25;
  if (!samePointer && !samePosition) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function blockTodoPressMenu(gesture, event) {
  if (event.pointerType === "mouse") return;
  const row = gesture.press?.row || (gesture.blocked && Date.now() <= gesture.blocked.until ? gesture.blocked.row : null);
  if (row?.contains(event.target)) event.preventDefault();
}
function resetTodoPress(gesture) {
  cancelTodoPress(gesture);
  gesture.pointers.clear();
  if (gesture.blocked) gesture.blocked.until = Date.now() + 800;
}
function registerTodoGestures(onOpen, isEligible = () => true) {
  const gesture = { onOpen, isEligible, press: null, blocked: null, pointers: /* @__PURE__ */ new Set() }, listeners = [];
  const listen = (target, name, handler, options2 = true) => {
    target.addEventListener(name, handler, options2);
    listeners.push(() => target.removeEventListener(name, handler, options2));
  };
  listen(document, "pointerdown", (event) => startTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointermove", (event) => moveTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointerup", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointercancel", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "click", (event) => blockTodoPressClick(gesture, event));
  listen(document, "contextmenu", (event) => blockTodoPressMenu(gesture, event));
  listen(document, "scroll", () => cancelTodoPress(gesture), { capture: true, passive: true });
  listen(document, "visibilitychange", () => resetTodoPress(gesture));
  listen(window, "blur", () => resetTodoPress(gesture));
  listen(window, "popstate", () => cancelTodoPress(gesture));
  return () => {
    resetTodoPress(gesture);
    for (const remove of listeners) remove();
  };
}

// local-ui/frontend/web/floating-workbench.mjs
init_state();
init_runtime();

// local-ui/frontend/web/offline/ui.mjs
init_runtime();

// local-ui/frontend/web/offline/conflict-decisions.mjs
init_db();
var own = (value, key2) => Object.hasOwn(value, key2);
var currentLocal = (row) => own(row, "review_local") ? row.review_local : row.local;
var currentRemote = (row) => own(row, "review_remote") ? row.review_remote : row.remote;
var canonical3 = (value) => Array.isArray(value) ? value.map(canonical3) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key2) => [key2, canonical3(value[key2])])) : value;
var stable2 = (value) => JSON.stringify(canonical3(value));
function conflictDecisionToken(conflict) {
  return stable2({
    key: conflict.key,
    local: currentLocal(conflict),
    remote: currentRemote(conflict),
    operation: conflict.operation,
    copy_required: conflict.copy_required === true,
    resolved_at: conflict.resolved_at
  });
}

// local-ui/frontend/web/offline/ui.mjs
function offlineStatusLabel(state2) {
  if (state2.unsupported) return "\u9700\u65B0\u7248";
  if (state2.conflicts) return "\u6709\u51B2\u7A81";
  if (!state2.online) return `\u79BB\u7EBF\uFF08${state2.pending || 0} \u6761\u5F85\u540C\u6B65\uFF09`;
  if (state2.error) return "\u540C\u6B65\u68C0\u67E5\u5931\u8D25";
  if (state2.phase === "syncing") return "\u6B63\u5728\u540C\u6B65\u2026";
  if (state2.pending) return `\u5F85\u540C\u6B65\uFF08${state2.pending} \u6761\uFF09`;
  return "\u67E5\u770B\u540C\u6B65\u72B6\u6001";
}
function textNode(document2, tag2, text, className) {
  const node2 = document2.createElement(tag2);
  node2.textContent = text;
  if (className) node2.className = className;
  return node2;
}
function readable(value) {
  if (!value) return "\uFF08\u7EBF\u4E0A\u5DF2\u4E0D\u5B58\u5728\uFF09";
  const text = value.body !== void 0 ? value.title + "\n" + value.body : value.text ?? value.title;
  if (typeof value.completed === "boolean") return `${text || ""}${value.date ? "\n\u65E5\u671F\uFF1A" + value.date : ""}
\u5B8C\u6210\uFF1A${value.completed ? "\u662F" : "\u5426"}
\u7248\u672C\uFF1A${value.version || ""}`;
  return typeof text === "string" ? text : JSON.stringify(value, null, 2);
}
var absent = (value) => !value || value.deleted || value.deleted_at;
var selectedLocal = (row) => Object.hasOwn(row, "review_local") ? row.review_local : row.local;
var selectedRemote = (row) => Object.hasOwn(row, "review_remote") ? row.review_remote : row.remote;
function conflictLocalChoiceLabel(conflict) {
  const local = selectedLocal(conflict), remote = selectedRemote(conflict), type = conflict.operation.entity_type;
  if (absent(local) && absent(remote)) return "\u786E\u8BA4\u5220\u9664\u7ED3\u679C";
  if (conflict.copy_required || absent(remote) || conflict.reason === "MEMO_GROUP_UNAVAILABLE" || type === "todo" && (local?.date !== remote.date || local?.text !== remote.text) || type === "unscheduled_todo" && local?.text !== remote.text || type === "note_entry" && (local?.date !== remote.date || local?.category !== remote.category) || type === "memo_note" && local?.group_id !== remote.group_id) return "\u53E6\u5B58\u672C\u5730\u526F\u672C";
  return "\u7528\u672C\u5730";
}
function conflictActions(document2, conflict, runtime2, refresh, requests) {
  const actions2 = document2.createElement("div");
  actions2.className = "offline-conflict-actions";
  const localLabel = conflictLocalChoiceLabel(conflict);
  for (const [choice2, label3] of [["use-local", localLabel], ["use-server", "\u7528\u7EBF\u4E0A"], ["keep-both", "\u4E24\u4EFD\u90FD\u7559"]]) {
    const button2 = textNode(document2, "button", label3, "btn text");
    button2.type = "button";
    button2.disabled = requests.busy(conflict.key);
    button2.addEventListener("click", async () => {
      const controller = requests.begin(conflict.key);
      if (!controller) return;
      for (const control of actions2.children) control.disabled = true;
      const cancel = textNode(document2, "button", "\u53D6\u6D88", "btn text");
      cancel.type = "button";
      cancel.addEventListener("click", () => controller.abort());
      actions2.append(cancel);
      try {
        const result = await runtime2.resolve(conflict.key, choice2, {
          signal: controller.signal,
          expected: conflictDecisionToken(conflict),
          copyConfirmed: localLabel === "\u53E6\u5B58\u672C\u5730\u526F\u672C"
        });
        requests.message(conflict.key, result.blocked ? result.resolution_message : "");
      } catch (error) {
        requests.message(conflict.key, error.name === "AbortError" ? "\u672C\u6B21\u9009\u62E9\u5DF2\u53D6\u6D88\uFF0C\u539F\u6587\u4ECD\u4FDD\u7559\u3002" : error.message);
      } finally {
        requests.end(conflict.key, controller);
        cancel.remove();
        await refresh();
      }
    });
    actions2.append(button2);
  }
  return actions2;
}
function conflictEvidence(document2, conflict) {
  const history2 = document2.createElement("details");
  history2.append(textNode(document2, "summary", "\u5148\u524D\u5BF9\u6BD4\uFF08\u539F\u6587\u4FDD\u7559\uFF09"));
  for (const row of conflict.remote_history || []) history2.append(textNode(document2, "pre", readable(row)));
  return history2;
}
function queueRows(document2, queue, runtime2, refresh, requests) {
  const root2 = document2.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root2.append(textNode(document2, "p", "\u6682\u65E0\u5F85\u5904\u7406\u5185\u5BB9\u3002"));
  const labels2 = {
    queued: "\u7B49\u5F85\u540C\u6B65",
    sending: "\u5F85\u540C\u6B65",
    unknown: "\u7ED3\u679C\u5F85\u6838\u5BF9",
    paused: "\u9700\u8054\u7F51\u6838\u5B9E\u8EAB\u4EFD",
    blocked: "\u9700\u5904\u7406",
    conflict: "\u6709\u51B2\u7A81"
  };
  for (const operation of queue.operations) {
    const item = textNode(
      document2,
      "p",
      `${operation.needs_upgrade ? "\u9700\u65B0\u7248" : labels2[operation.status] || "\u7B49\u5F85\u540C\u6B65"} \xB7 ${readable(operation.local)}`,
      "offline-queue-row"
    );
    if (operation.error) item.append(textNode(document2, "span", " \xB7 " + operation.error));
    root2.append(item);
  }
  for (const conflict of queue.conflicts) {
    const item = document2.createElement("article");
    item.className = "offline-conflict";
    item.append(
      textNode(document2, "h3", "\u4E24\u4EFD\u5185\u5BB9\u5DF2\u4FDD\u7559"),
      textNode(document2, "p", "\u672C\u673A\u5185\u5BB9"),
      textNode(document2, "pre", readable(selectedLocal(conflict))),
      textNode(document2, "p", "\u7EBF\u4E0A\u5185\u5BB9"),
      textNode(document2, "pre", readable(selectedRemote(conflict)))
    );
    if (conflict.remote_history?.length) item.append(conflictEvidence(document2, conflict));
    if (conflict.resolution_message) item.append(textNode(document2, "p", conflict.resolution_message));
    if (requests.message(conflict.key)) item.append(textNode(document2, "p", requests.message(conflict.key)));
    if (conflict.needs_upgrade) {
      item.append(textNode(document2, "p", "\u6B64\u672C\u673A\u64CD\u4F5C\u9700\u65B0\u7248\u9875\u9762\u5904\u7406\uFF0C\u539F\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002"));
      root2.append(item);
      continue;
    }
    if (conflict.resolution) {
      const labels3 = {
        queued: "\u9009\u62E9\u5DF2\u5B58\u672C\u673A\uFF0C\u6B63\u5728\u6838\u5BF9\u7EBF\u4E0A\u7ED3\u679C\u3002",
        conflict: "\u65B0\u4FDD\u5B58\u6709\u51B2\u7A81\uFF0C\u8BF7\u6838\u5BF9\u4E0B\u65B9\u7684\u65B0\u6BD4\u8F83\u5185\u5BB9\u3002",
        blocked: "\u65B0\u4FDD\u5B58\u6682\u672A\u5B8C\u6210\uFF0C\u539F\u6587\u4E0E\u9009\u62E9\u4ECD\u4FDD\u7559\u3002",
        paused: "\u9700\u8054\u7F51\u6838\u5B9E\u540E\u7EE7\u7EED\uFF0C\u539F\u6587\u4E0E\u9009\u62E9\u4ECD\u4FDD\u7559\u3002"
      };
      item.append(textNode(document2, "p", labels3[conflict.resolution.state] || "\u6B63\u5728\u6838\u5BF9\u7EBF\u4E0A\u7ED3\u679C\u3002"));
      root2.append(item);
      continue;
    }
    if (conflictLocalChoiceLabel(conflict) === "\u53E6\u5B58\u672C\u5730\u526F\u672C")
      item.append(textNode(document2, "p", "\u526F\u672C\u4F1A\u4F7F\u7528\u65B0\u8BB0\u5F55\uFF0C\u539F\u8BB0\u5F55\u4FDD\u6301\u539F\u72B6\u3002"));
    item.append(conflictActions(document2, conflict, runtime2, refresh, requests));
    root2.append(item);
  }
  return root2;
}
function pageAnnotation(document2, state2) {
  const page2 = new URL(document2.defaultView.location.href).searchParams.get("page") || "dashboard";
  const header = document2.querySelector("#page-header");
  let banner = document2.querySelector("#offline-page-note");
  let label3 = "";
  if (page2 === "settings" && !state2.online) label3 = "\u8BBE\u7F6E\u9700\u8054\u7F51\u540E\u4F7F\u7528\u3002";
  if (page2 === "todos" && state2.partial) label3 = "\u5F53\u524D\u4EC5\u663E\u793A\u672C\u673A\u5DF2\u4FDD\u5B58\u7684\u4E8B\u9879\uFF0C\u5B8C\u6574\u5217\u8868\u9700\u8054\u7F51\u8BFB\u53D6\u3002";
  if (page2 === "dashboard" && !state2.online && state2.cachedAt) label3 = "\u6570\u636E\u622A\u81F3 " + new Date(state2.cachedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  if (label3 && header) {
    if (!banner) {
      banner = textNode(document2, "p", "", "offline-page-note");
      banner.id = "offline-page-note";
      header.append(banner);
    }
    if (banner.textContent !== label3) banner.textContent = label3;
  } else banner?.remove();
  const content = document2.querySelector("#page-content");
  if (content) {
    const unavailable = page2 === "settings" && !state2.online;
    content.inert = unavailable;
    if (unavailable || content.dataset.offlineHidden === "true") content.hidden = unavailable;
    content.dataset.offlineHidden = String(unavailable);
  }
}
function mountRuntimeUI(runtime2, { document: document2, window: window2 }) {
  let state2 = { ...runtime2.state }, expanded = false, rendering = 0;
  const pending = /* @__PURE__ */ new Map(), messages = /* @__PURE__ */ new Map(), requests = {
    busy: (key2) => pending.has(key2),
    begin(key2) {
      if (pending.has(key2)) return null;
      const controller = new AbortController();
      pending.set(key2, controller);
      return controller;
    },
    end(key2, controller) {
      if (pending.get(key2) === controller) pending.delete(key2);
    },
    message(key2, value) {
      if (value !== void 0) messages.set(key2, value);
      return messages.get(key2) || "";
    },
    cancel() {
      for (const controller of pending.values()) controller.abort();
    }
  };
  const root2 = document2.createElement("section");
  root2.className = "offline-settings-panel";
  root2.setAttribute("aria-label", "\u672C\u5730\u5F85\u5904\u7406");
  const button2 = textNode(document2, "button", "", "btn text offline-settings-toggle");
  button2.type = "button";
  button2.setAttribute("aria-controls", "offline-queue");
  button2.setAttribute("aria-expanded", "false");
  const panel = document2.createElement("section");
  panel.id = "offline-queue";
  panel.className = "offline-queue";
  panel.setAttribute("aria-label", "\u672C\u673A\u5F85\u540C\u6B65\u5185\u5BB9\u4E0E\u51B2\u7A81");
  panel.hidden = true;
  root2.append(button2, panel);
  async function refreshQueue() {
    if (!expanded) return;
    const sequence5 = ++rendering, queue = await runtime2.queue();
    if (sequence5 !== rendering || !expanded) return;
    const title = textNode(document2, "h2", "\u672C\u673A\u4FDD\u5B58\u72B6\u6001");
    const details = document2.createDocumentFragment();
    if (state2.error) {
      const stages = { identity: "\u8EAB\u4EFD\u6838\u9A8C", outbox: "\u63D0\u4EA4\u961F\u5217", cache: "\u672C\u5730\u7F13\u5B58", snapshot: "\u670D\u52A1\u5668\u5FEB\u7167" };
      details.append(textNode(document2, "p", `${stages[state2.errorStage] || "\u540C\u6B65\u68C0\u67E5"}\u5931\u8D25\uFF1A${state2.error}`, "offline-sync-error"));
    }
    details.append(textNode(document2, "p", "\u8FD9\u662F\u72EC\u7ACB\u672C\u673A\u7248\u672C\uFF0C\u6CA1\u6709\u7EBF\u4E0A\u540C\u6B65\u6216\u4E0A\u4F20\u3002"));
    panel.replaceChildren(title, details, queueRows(document2, queue, runtime2, refreshQueue, requests));
  }
  function mount() {
    const host = document2.querySelector("#offline-settings-entry");
    if (host && !host.contains(root2)) host.append(root2);
    else if (!host && root2.isConnected) root2.remove();
    const label3 = state2.conflicts ? `\u67E5\u770B\u5F85\u5904\u7406\u9879\uFF08${state2.conflicts} \u9879\u51B2\u7A81\uFF09` : state2.pending ? `\u67E5\u770B\u5F85\u5904\u7406\u9879\uFF08${state2.pending} \u9879\uFF09` : "\u67E5\u770B\u5F85\u5904\u7406\u9879";
    root2.hidden = !state2.identity;
    if (button2.textContent !== label3) button2.textContent = label3;
    root2.dataset.phase = state2.conflicts ? "conflict" : state2.phase;
    pageAnnotation(document2, state2);
  }
  button2.addEventListener("click", () => {
    expanded = !expanded;
    panel.hidden = !expanded;
    button2.setAttribute("aria-expanded", String(expanded));
    if (!expanded) requests.cancel();
    if (expanded) void refreshQueue();
  });
  const unsubscribe = runtime2.subscribe((next2) => {
    state2 = next2;
    mount();
    if (expanded) void refreshQueue();
    window2.dispatchEvent(new CustomEvent("haoduoyu-offline-status", { detail: { pending: state2.pending, conflicts: state2.conflicts } }));
  });
  const observer = new MutationObserver(mount);
  observer.observe(document2.body, { childList: true, subtree: true });
  const stop = runtime2.start({ window: window2, document: document2 });
  mount();
  return () => {
    requests.cancel();
    unsubscribe();
    observer.disconnect();
    stop();
    root2.remove();
  };
}
function startOfflineUI({ document: document2 = globalThis.document, window: window2 = globalThis.window } = {}) {
  if (!document2?.body || !window2) return () => {
  };
  let stop = () => {
  };
  const unsubscribe = onOfflineRuntime((runtime2) => {
    stop();
    stop = mountRuntimeUI(runtime2, { document: document2, window: window2 });
  });
  return () => {
    unsubscribe();
    stop();
  };
}

// local-ui/frontend/web/floating-workbench.mjs
var activeWindow = null;
var opening = false;
function node(doc, tag2, text = "", className = "") {
  const result = doc.createElement(tag2);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}
function makeView(pip) {
  const doc = pip.document;
  doc.title = "\u597D\u591A\u9C7C\u684C\u9762\u4FBF\u7B7E";
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) doc.head.append(link.cloneNode());
  doc.body.className = "floating-workbench";
  const main = node(doc, "main", "", "floating-main");
  const head = node(doc, "header", "", "floating-head");
  head.append(node(doc, "time", "", "floating-date"));
  const close = node(doc, "button", "", "floating-close");
  close.type = "button";
  close.setAttribute("aria-label", "\u5173\u95ED\u4FBF\u7B7E");
  head.append(close);
  close.addEventListener("click", () => pip.close());
  const tabs = node(doc, "nav", "", "floating-tabs");
  tabs.setAttribute("aria-label", "\u4FBF\u7B7E\u5185\u5BB9");
  for (const [id2, text] of [["todos", "\u4ECA\u65E5\u5F85\u529E"], ["notes", "\u4ECA\u65E5\u788E\u788E\u5FF5"]]) {
    const button2 = node(doc, "button", text);
    button2.type = "button";
    button2.dataset.tab = id2;
    tabs.append(button2);
  }
  const offline = node(doc, "p", "", "floating-offline");
  offline.setAttribute("role", "status");
  const todo = node(doc, "section", "", "floating-panel");
  todo.dataset.panel = "todos";
  todo.append(node(doc, "h2", "\u2304  \u4ECA\u65E5\u5F85\u529E", "floating-group-title"));
  const todoMessage = node(doc, "p", "", "floating-message");
  todoMessage.setAttribute("role", "alert");
  const todoList = node(doc, "ul", "", "floating-list");
  todo.append(todoMessage, todoList);
  const notes = node(doc, "section", "", "floating-panel");
  notes.dataset.panel = "notes";
  notes.hidden = true;
  notes.append(node(doc, "h2", "\u2304  \u4ECA\u65E5\u788E\u788E\u5FF5", "floating-group-title"));
  const noteList = node(doc, "ul", "", "floating-note-list");
  const newNote = node(doc, "button", "\u5199\u4E00\u6761");
  newNote.type = "button";
  const notesInput = node(doc, "textarea");
  notesInput.placeholder = "\u5199\u4E0B\u4E00\u70B9\u60F3\u8BF4\u7684\u8BDD\u2026";
  notesInput.setAttribute("aria-label", "\u788E\u788E\u5FF5\u5185\u5BB9");
  notesInput.rows = 5;
  const labels2 = node(doc, "fieldset", "", "floating-labels");
  labels2.append(node(doc, "legend", "\u6807\u7B7E\uFF08\u53EF\u591A\u9009\uFF09"));
  const options2 = node(doc, "div");
  labels2.append(options2);
  const noteMessage = node(doc, "p", "", "floating-message");
  noteMessage.setAttribute("role", "status");
  const noteActions = node(doc, "div", "", "floating-actions");
  const send = node(doc, "button", "\u53D1\u9001");
  send.type = "button";
  const check2 = node(doc, "button", "\u6838\u5BF9\u4FDD\u5B58\u7ED3\u679C");
  check2.type = "button";
  check2.hidden = true;
  const retry = node(doc, "button", "\u91CD\u8BD5\u539F\u4FDD\u5B58");
  retry.type = "button";
  retry.hidden = true;
  noteActions.append(send, check2, retry);
  notes.append(noteList, newNote, notesInput, labels2, noteMessage, noteActions);
  main.append(head, tabs, offline, todo, notes);
  doc.body.replaceChildren(main);
  return {
    doc,
    head,
    tabs,
    offline,
    todo,
    todoMessage,
    todoList,
    notes,
    noteList,
    newNote,
    notesInput,
    labels: labels2,
    options: options2,
    noteMessage,
    send,
    check: check2,
    retry
  };
}
function paintTodo(view2) {
  const day3 = todoDay(bjtDate());
  view2.head.querySelector("time").textContent = day3.date;
  view2.todoMessage.textContent = day3.error || (!day3.loaded && day3.loading ? "\u6B63\u5728\u8BFB\u53D6\u5F85\u529E\u2026" : "");
  const fragment = view2.doc.createDocumentFragment();
  for (const item of day3.items) {
    const removal = day3.removals.get(item.id);
    if (item.deleted_at || removal && removal.phase !== "restoring") continue;
    const li = node(view2.doc, "li"), label3 = node(view2.doc, "label"), check2 = node(view2.doc, "input");
    check2.type = "checkbox";
    check2.dataset.todoId = item.id;
    check2.dataset.date = day3.date;
    check2.checked = day3.updates.has(item.id) ? day3.updates.get(item.id) : Boolean(item.completed);
    check2.disabled = !day3.loaded || todoBusy(day3, item.id);
    label3.append(check2, node(view2.doc, "span", item.text));
    li.append(label3);
    if (check2.checked) li.classList.add("is-complete");
    fragment.append(li);
  }
  if (!day3.items.some((item) => !item.deleted_at) && day3.loaded) fragment.append(node(view2.doc, "li", "\u4ECA\u5929\u8FD8\u6CA1\u6709\u5F85\u529E\u3002", "floating-empty"));
  view2.todoList.replaceChildren(fragment);
}
function paintNotes(view2) {
  const snap = floatingNotesSnapshot(), item = snap?.item, page2 = snap?.page;
  const previousDate = Boolean(item && item.date !== snap?.date);
  const text = item?.draft || "";
  const fragment = view2.doc.createDocumentFragment();
  for (const record of snap?.entries || []) {
    const row = node(view2.doc, "li");
    const content = record.legacy ? node(view2.doc, "div") : node(view2.doc, "button");
    if (!record.legacy) {
      content.type = "button";
      content.dataset.noteId = record.id;
      content.dataset.category = record.category;
    }
    const time2 = record.createdAt || record.localCreatedAt || record.updatedAt;
    const caption = time2 && Number.isFinite(Date.parse(time2)) ? new Intl.DateTimeFormat(
      "zh-CN",
      { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    ).format(new Date(time2)) : "";
    content.append(
      node(view2.doc, "small", [caption, record.legacy ? "\u539F\u6709\u8BB0\u5F55 \xB7 \u53EA\u8BFB" : record.dirty ? "\u8349\u7A3F" : ""].filter(Boolean).join(" \xB7 ")),
      node(view2.doc, "span", record.dirty ? record.draft : record.draft ?? record.serverText ?? "")
    );
    row.append(content);
    fragment.append(row);
  }
  view2.noteList.replaceChildren(fragment);
  view2.newNote.disabled = !page2?.loaded || !page2.canEdit;
  if ((view2.doc.activeElement !== view2.notesInput || !view2.doc.hasFocus()) && view2.notesInput.value !== text)
    view2.notesInput.value = localEditorPaintValue(view2.notesInput, text);
  view2.notesInput.disabled = !page2?.loaded || !page2.canEdit || item?.canEdit === false;
  view2.notesInput.readOnly = Boolean(view2.frozen);
  view2.labels.disabled = Boolean(view2.frozen) || !snap?.labelsVerified || !page2?.canEdit || Boolean(item?.pending) || item?.labelComplete === false;
  const current3 = [...view2.options.querySelectorAll("input")].map((input) => input.value);
  const available = [.../* @__PURE__ */ new Set([...snap?.labels || [], ...item?.labels || []])];
  if (JSON.stringify(current3) !== JSON.stringify(available)) {
    const fragment2 = view2.doc.createDocumentFragment();
    for (const name of available) {
      const label3 = node(view2.doc, "label"), input = node(view2.doc, "input");
      input.type = "checkbox";
      input.value = name;
      label3.append(input, node(view2.doc, "span", name));
      fragment2.append(label3);
    }
    view2.options.replaceChildren(fragment2);
  }
  for (const input of view2.options.querySelectorAll("input")) input.checked = Boolean(item?.labels?.includes(input.value));
  const blocked2 = item?.pending || item?.composing || ["unknown", "conflict", "oversize"].includes(item?.phase);
  view2.send.disabled = Boolean(view2.frozen) || !item?.dirty || Boolean(blocked2) || !item.canEdit || previousDate;
  view2.check.hidden = item?.phase !== "unknown";
  view2.check.disabled = Boolean(view2.frozen || item?.pending?.checking);
  view2.retry.hidden = item?.phase !== "unknown" || !item?.pending?.retryReady;
  view2.retry.disabled = Boolean(view2.frozen);
  view2.newNote.disabled ||= Boolean(view2.frozen);
  view2.noteMessage.textContent = item?.error || snap?.error || page2?.error || snap?.draftError || snap?.labelError || (previousDate ? `\u6B64\u8349\u7A3F\u5C5E\u4E8E ${item.date}\uFF0C\u8BF7\u5728\u539F\u65E5\u671F\u5904\u7406\uFF1B\u70B9\u51FB\u201C\u5199\u4E00\u6761\u201D\u53EF\u7EE7\u7EED\u4ECA\u65E5\u8BB0\u5F55\u3002` : !page2?.loaded ? "\u6B63\u5728\u8BFB\u53D6\u788E\u788E\u5FF5\u2026" : !page2.canEdit ? "\u5F53\u524D\u8EAB\u4EFD\u4E3A\u53EA\u8BFB\u3002" : item?.phase === "queued" ? "\u5DF2\u5B58\u672C\u673A\uFF0C\u5F85\u540C\u6B65\u3002" : "");
}
function bindOfflineStatus(view2, active2) {
  let unsubscribe = () => {
  };
  const stop = onOfflineRuntime((runtime2) => {
    unsubscribe();
    unsubscribe = runtime2.subscribe((value) => {
      if (active2()) view2.offline.textContent = [
        offlineStatusLabel(value),
        value.partial ? "\u4EC5\u663E\u793A\u672C\u673A\u5DF2\u4FDD\u5B58\u4E8B\u9879\uFF0C\u5B8C\u6574\u5217\u8868\u9700\u8054\u7F51\u8BFB\u53D6\u3002" : ""
      ].filter(Boolean).join(" ");
    });
  });
  return () => {
    stop();
    unsubscribe();
  };
}
function mountFloating(pip) {
  const view2 = makeView(pip), owner2 = todoOwner();
  let alive = true, tab = "todos", notesLoaded = false, composing = false, date = bjtDate();
  const active2 = () => alive && !pip.closed && todoSessionActive(owner2);
  const paint2 = () => {
    if (active2()) {
      paintTodo(view2);
      if (tab === "notes") paintNotes(view2);
    }
  };
  const stopTodos = observeTodoChanges(paint2), stopNotes = observeFloatingNotes(paint2);
  const stopRuntime = bindOfflineStatus(view2, active2);
  const beforeUnload = (event) => {
    if (active2() && hasFloatingNoteDraft()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const captureCurrent = (event) => {
    if (!active2() || !event.detail?.localSnapshot) return;
    event.detail.captureDocument(view2.doc, [view2.notesInput]);
    if (tab === "notes") captureLocalFloatingNote(event.detail, view2.notesInput, composing);
    else if (event.detail.snapshot(view2.notesInput).value) event.detail.fail(new Error("\u6D6E\u7A97\u9690\u85CF\u7684\u788E\u788E\u5FF5\u8F93\u5165\u5C1A\u672A\u91C7\u96C6\uFF0C\u8BF7\u6253\u5F00\u788E\u788E\u5FF5\u540E\u91CD\u8BD5\u3002"));
    else event.detail.protect(view2.notesInput);
  };
  window.addEventListener("haoduoyu:capture-current-editors", captureCurrent);
  const beforeRefresh = (event) => {
    if (!active2() || typeof event.detail?.waitUntil !== "function") return;
    if (composing) {
      event.detail.waitUntil(Promise.reject(new Error("\u8F93\u5165\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7ED3\u675F\u8F93\u5165\u540E\u518D\u5237\u65B0\u3002")));
      return;
    }
    const current3 = floatingNotesSnapshot()?.item;
    if (!event.detail.localSnapshot && tab === "notes" && view2.notesInput.value !== (current3?.draft || "")) editFloatingNote(view2.notesInput.value);
    view2.frozen = true;
    paint2();
    event.detail.onFailure?.(() => {
      view2.frozen = false;
      if (active2()) paint2();
    });
  };
  const reset3 = () => {
    if (alive) pip.close();
  };
  const focus = () => {
    if (active2()) {
      void loadFloatingToday();
      if (tab === "notes") void loadFloatingNotes();
    }
  };
  const timer2 = setInterval(() => {
    if (!active2()) {
      if (alive) pip.close();
      return;
    }
    if (date !== bjtDate()) {
      if (hasFloatingNoteDraft()) toast("\u524D\u4E00\u5929\u4ECD\u6709\u672A\u53D1\u9001\u5185\u5BB9\uFF0C\u8BF7\u786E\u8BA4\u4FDD\u5B58\u540E\u518D\u5173\u95ED\u4E3B\u9875\u9762\u3002");
      date = bjtDate();
      notesLoaded = false;
      void loadFloatingToday();
      if (tab === "notes") {
        notesLoaded = true;
        void loadFloatingNotes();
      }
    }
  }, 3e4);
  function cleanup() {
    if (!alive) return;
    if (composing && todoSessionActive(owner2)) {
      editFloatingNote(view2.notesInput.value, false);
      composing = false;
    }
    markFloatingNoteComposing(false);
    const draft = hasFloatingNoteDraft();
    window.removeEventListener("haoduoyu:capture-current-editors", captureCurrent);
    alive = false;
    clearInterval(timer2);
    stopTodos();
    stopNotes();
    stopRuntime();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("haoduoyu:before-refresh", beforeRefresh);
    window.removeEventListener("haoduoyu-todos-reset", reset3);
    pip.removeEventListener("focus", focus);
    if (activeWindow === pip) activeWindow = null;
    if (draft && todoSessionActive(owner2)) toast("\u672A\u53D1\u9001\u5185\u5BB9\u4ECD\u5728\u5F53\u524D\u9875\u9762\uFF0C\u8BF7\u786E\u8BA4\u4FDD\u5B58\u540E\u518D\u5173\u95ED\u4E3B\u9875\u9762\u3002");
  }
  view2.tabs.addEventListener("click", (event) => {
    const button2 = event.target.closest("button[data-tab]");
    if (!button2) return;
    tab = button2.dataset.tab;
    view2.todo.hidden = tab !== "todos";
    view2.notes.hidden = tab !== "notes";
    for (const control of view2.tabs.querySelectorAll("button")) control.setAttribute("aria-pressed", String(control === button2));
    if (tab === "notes" && !notesLoaded) {
      notesLoaded = true;
      void loadFloatingNotes();
    }
    paint2();
  });
  view2.todoList.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.todoId) void toggleTodo(input, { floating: true });
  });
  view2.newNote.addEventListener("click", () => {
    newFloatingNote();
    paint2();
    view2.notesInput.focus();
  });
  view2.noteList.addEventListener("click", (event) => {
    const button2 = event.target.closest("[data-note-id]");
    if (button2) selectFloatingNote(button2.dataset.noteId, button2.dataset.category);
  });
  view2.notesInput.addEventListener("compositionstart", () => {
    composing = true;
    markFloatingNoteComposing(true);
  });
  view2.notesInput.addEventListener("input", (event) => {
    editFloatingNote(view2.notesInput.value, composing || event.isComposing);
    if (composing || event.isComposing) markFloatingNoteComposing(true);
  });
  view2.notesInput.addEventListener("compositionend", () => {
    composing = false;
    editFloatingNote(view2.notesInput.value);
    markFloatingNoteComposing(false);
  });
  view2.options.addEventListener("change", () => {
    labelFloatingNote([...view2.options.querySelectorAll("input:checked")].map((input) => input.value));
    paint2();
  });
  view2.send.addEventListener("click", () => {
    void sendFloatingNote();
  });
  view2.check.addEventListener("click", () => {
    void checkFloatingNote();
  });
  view2.retry.addEventListener("click", () => {
    void checkFloatingNote(true);
  });
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("haoduoyu:before-refresh", beforeRefresh);
  window.addEventListener("haoduoyu-todos-reset", reset3);
  pip.addEventListener("focus", focus);
  pip.addEventListener("pagehide", cleanup, { once: true });
  view2.tabs.querySelector('[data-tab="todos"]').setAttribute("aria-pressed", "true");
  paint2();
  void loadFloatingToday();
}
async function openFloatingWorkbench() {
  if (!floatingTodoSupported()) {
    toast("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u7F6E\u9876\u4FBF\u7B7E\u3002", true);
    return;
  }
  if (activeWindow && !activeWindow.closed) {
    activeWindow.focus();
    return;
  }
  if (opening || !state.me) return;
  opening = true;
  try {
    const request = window.documentPictureInPicture.requestWindow({ width: 390, height: 520 });
    todoDay(bjtDate());
    const owner2 = todoOwner();
    const pip = await request;
    if (!todoSessionActive(owner2) || pip.closed) {
      if (!pip.closed) pip.close();
      return;
    }
    activeWindow = pip;
    try {
      mountFloating(pip);
    } catch (error) {
      activeWindow = null;
      pip.close();
      throw error;
    }
  } catch (error) {
    toast("\u65E0\u6CD5\u6253\u5F00\u7F6E\u9876\u4FBF\u7B7E\uFF1A" + (error?.message || "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"), true);
  } finally {
    opening = false;
  }
}

// local-ui/frontend/web/actions.mjs
init_client();
init_constants();
init_state();

// local-ui/frontend/web/pages/detail.mjs
init_constants();
init_state();
var articleStatus = { drafting: "\u64B0\u5199\u4E2D", illustrated: "\u5DF2\u914D\u56FE", draft_saved: "\u8349\u7A3F\u5DF2\u5B58", published: "\u5DF2\u53D1\u5E03", failed: "\u5931\u8D25" };
var articleWriter = { dedao: "\u5F97\u5230\u5927\u8111", gemini_web: "Gemini", human: "\u672C\u4EBA", other: "\u5176\u4ED6" };
var warningLabels2 = {
  TOUTIAO_TITLE_TOO_LONG: "\u5934\u6761\u6807\u9898\u8D85\u8FC7 30 \u5B57",
  CHAR_COUNT_OUT_OF_RANGE: "\u5B57\u6570\u4E0D\u5728 2000\u20132300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "\u5C0F\u6807\u9898\u4E0D\u5728 5\u20137",
  ENTERTAINMENT_IMAGES_TOO_FEW: "\u6587\u5A31\u56FE\u7247\u5C11\u4E8E 25 \u5F20",
  DRAFT_CREDENTIAL_MISSING: "\u8349\u7A3F\u51ED\u8BC1\u672A\u786E\u8BA4"
};
var isPublished2 = (a) => !Object.hasOwn(a, "status") || a.status === "published";
var observed = (value) => value === null || value === void 0 ? "\u672A\u53D6\u5F97" : String(value);
function safeDetailURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
function jsonText(value) {
  return JSON.stringify(value, null, 2) ?? "\u672A\u53D6\u5F97";
}
function readonlyJSON(label3, value) {
  return `<details class="detail-section article-ledger-json"><summary>${e(label3)}</summary><pre>${e(
    value === null || value === void 0 ? "\u672A\u53D6\u5F97" : jsonText(value)
  )}</pre></details>`;
}
function draftReference(a) {
  const ref = a.draft_ref || {}, ids = [["pgc_id", "\u5934\u6761\u8349\u7A3F"], ["appmsgid", "\u516C\u4F17\u53F7\u8349\u7A3F"]].filter(([key2]) => typeof ref[key2] === "string" && ref[key2].trim());
  return `<section class="detail-section"><h3>\u8349\u7A3F\u51ED\u8BC1</h3>${ids.map(([key2, label3]) => `<p>${e(label3)} \xB7 <code>${e(ref[key2])}</code></p>`).join("")}${safeDetailURL(ref.editor_url) ? `<p><a href="${e(ref.editor_url)}" target="_blank" rel="noopener noreferrer">\u8349\u7A3F\u7F16\u8F91\u94FE\u63A5 \u2197</a></p>` : ""}${!ids.length && !safeDetailURL(ref.editor_url) ? '<p class="cell-sub">\u672A\u786E\u8BA4</p>' : ""}<p class="cell-sub">\u94FE\u63A5\u53EA\u6821\u9A8C\u683C\u5F0F\uFF0C\u672A\u9A8C\u8BC1\u8FDC\u7AEF\u6743\u9650\u6216\u8349\u7A3F\u662F\u5426\u5B58\u5728\u3002</p></section>`;
}
function itemText(item) {
  const label3 = ["label", "description", "text", "message", "title", "key"].find((name) => typeof item[name] === "string" && item[name]);
  return label3 ? item[label3] : jsonText(item);
}
function verificationControl(a, item, index, disabled) {
  const attrs = `data-article-id="${e(a.id)}" data-article-verify-index="${index}" ${disabled ? "disabled" : ""}`;
  if (typeof item.done === "boolean") return `<label class="check-option"><input type="checkbox" ${attrs} ${item.done ? "checked" : ""}><span>${e(itemText(item))}</span><small>${item.done ? "\u5DF2\u5904\u7406" : "\u5F85\u5904\u7406"}</small></label>`;
  return `<label class="article-verify-unknown"><span>${e(itemText(item))}</span><span class="badge">\u672A\u786E\u8BA4</span><select class="input" aria-label="\u7B2C ${index + 1} \u9879\u5904\u7406\u72B6\u6001" ${attrs}><option value="" selected>\u672A\u786E\u8BA4\uFF0C\u8BF7\u660E\u786E\u9009\u62E9</option><option value="false">\u6807\u8BB0\u5F85\u5904\u7406</option><option value="true">\u6807\u8BB0\u5DF2\u5904\u7406</option></select></label>`;
}
function verificationSection(a, view2) {
  const items = Array.isArray(a.verify_items) ? a.verify_items : null;
  const disabled = view2.busy || view2.phase === "unknown";
  const stateLabel = { pending: "\u6709\u5F85\u5904\u7406\u9879", complete: "\u5DF2\u786E\u8BA4\u5904\u7406\u72B6\u6001", unknown: "\u72B6\u6001\u672A\u786E\u8BA4" }[a.verify_state] || "\u72B6\u6001\u672A\u786E\u8BA4";
  return `<section class="detail-section article-verification"><h3>\u5F85\u6838\u6E05\u5355 <span class="badge">${e(stateLabel)}</span></h3>${items ? items.length ? `<ul class="article-verification-items">${items.map((item, index) => `<li>${verificationControl(
    a,
    item,
    index,
    disabled
  )}<details><summary>\u539F\u59CB\u4FE1\u606F</summary><pre>${e(jsonText(item))}</pre></details></li>`).join("")}</ul>` : '<p class="cell-sub">\u6E05\u5355\u4E3A\u7A7A\uFF0C\u6CA1\u6709\u5DF2\u8BB0\u5F55\u7684\u5F85\u6838\u9879\u3002</p>' : '<p class="cell-sub">\u672A\u53D6\u5F97\u6E05\u5355\uFF0C\u4E0D\u80FD\u5224\u65AD\u662F\u5426\u5DF2\u5904\u7406\u3002</p>'}<p class="article-verify-status" data-article-verify-status role="status" aria-live="polite">${e(view2.message || "\u4FEE\u6539\u540E\u6309\u5F53\u524D\u7248\u672C\u4FDD\u5B58\u3002")}</p><div class="head-actions">${view2.phase === "unknown" ? `<button class="btn small" data-action="article-verify-refresh" ${view2.busy ? "disabled" : ""}>\u91CD\u65B0\u6838\u5BF9</button>${view2.retryReady ? `<button class="btn small" data-action="article-verify-retry" ${view2.busy ? "disabled" : ""}>\u91CD\u8BD5\u539F\u4FDD\u5B58</button>` : ""}` : ""}</div></section>`;
}
function articlePipelineFields(a) {
  const topic = a.slot === "gzh" ? "\u4FDD\u9669" : ["zh1", "zh2", "zh3", "tt1", "tt2", "tt3"].includes(a.slot) ? "\u6587\u5A31" : "\u672A\u6807\u6CE8";
  const seconds = a.started_at && a.timings?.finished_at ? (Date.parse(a.timings.finished_at) - Date.parse(a.started_at)) / 1e3 : null;
  return [
    ["\u72B6\u6001", articleStatus[a.status] || "\u672A\u786E\u8BA4"],
    ["\u69FD\u4F4D", a.slot || "\u672A\u6807\u6CE8"],
    ["\u9898\u6750", topic],
    ["\u5199\u4F5C\u8005", articleWriter[a.writer] || "\u672A\u6807\u6CE8"],
    ["\u914D\u56FE\u8005", a.illustrator || "\u672A\u6807\u6CE8"],
    ["\u5B57\u6570", observed(a.char_count)],
    ["\u5C0F\u6807\u9898", observed(a.subheading_count)],
    ["\u56FE\u6570", observed(a.image_count)],
    ["\u6D41\u6C34\u7EBF\u5F00\u59CB", displayTime(a.started_at)],
    ["\u6D41\u6C34\u7EBF\u7ED3\u675F", displayTime(a.timings?.finished_at)],
    ["\u6D41\u6C34\u7EBF\u603B\u8017\u65F6", Number.isFinite(seconds) && seconds >= 0 ? duration(seconds) : "\u672A\u53D6\u5F97"]
  ];
}
function renderArticleDetailBody(a, view2 = { phase: "idle", busy: false, retryReady: false, message: "" }) {
  const publication = isPublished2(a) ? displayTime(a.published_at) : hasRecordedUnknownMetrics(a) ? a.published_at ? displayTime(a.published_at) : "\u672A\u53D6\u5F97" : "\u672A\u53D1\u5E03";
  const info = [
    ["\u751F\u4EA7\u65B9\u5F0F", modeLabels[a.production_mode] || "\u672A\u8BB0\u5F55"],
    ["\u539F\u59CB\u53D1\u5E03\u65F6\u95F4", publication],
    ["\u5F55\u5165\u8005", a.recorded_by?.label || "\u672A\u8BB0\u5F55"],
    ["\u4FEE\u6539\u8005", a.last_modified_by?.label || "\u672A\u8BB0\u5F55"],
    ["\u5F55\u5165\u65F6\u95F4", displayTime(a.created_at)],
    ["\u4FEE\u6539\u65F6\u95F4", displayTime(a.updated_at)]
  ];
  return `<div class="article-ledger-detail" data-article-detail="${e(a.id)}"><div class="head-actions">${isPublished2(a) && safeDetailURL(a.url) ? `<a class="btn small" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">\u539F\u6587 \u2197</a>` : ""}<button class="btn small" data-action="edit-article" data-id="${e(a.id)}">\u7F16\u8F91</button>${isPublished2(a) ? `<button class="btn small primary" data-action="review-article" data-id="${e(a.id)}">+ \u8865\u5145\u6570\u636E</button>` : ""}</div><dl class="detail-grid">${articlePipelineFields(a).map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>${Array.isArray(a.warnings) && a.warnings.length ? `<p class="info-line warn">${a.warnings.map((code) => e(warningLabels2[code] || code)).join(" \xB7 ")}</p>` : ""}${draftReference(a)}${readonlyJSON("\u6837\u672C\u6765\u6E90", a.sample)}${readonlyJSON("\u9636\u6BB5\u65F6\u95F4\u7EBF", a.timings)}${readonlyJSON("\u963B\u585E\u8BB0\u5F55", a.blockers)}${verificationSection(a, view2)}${renderArticleAnalytics(a)}<details class="detail-section"><summary>\u8BB0\u5F55\u4FE1\u606F</summary><dl class="detail-grid">${info.map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl></details>${[["summary", "\u6982\u51B5"], ["notes", "\u5907\u6CE8"]].filter(([key2]) => typeof a[key2] === "string" && a[key2].trim()).map(([key2, label3]) => `<section class="detail-section"><h3>${e(label3)}</h3><p>${e(
    a[key2]
  )}</p></section>`).join("")}</div>`;
}
function renderArticleAnalytics(a) {
  const unconfirmed = hasRecordedUnknownMetrics(a);
  if (!isPublished2(a) && !unconfirmed) return '<section class="detail-section article-unpublished"><h3>\u9605\u8BFB\u4E0E\u590D\u76D8</h3><strong>\u672A\u53D1\u5E03</strong><p class="cell-sub">\u53D1\u5E03\u540E\u518D\u8BB0\u5F55\u9605\u8BFB\u6307\u6807\u548C\u590D\u76D8\u8282\u70B9\u3002</p></section>';
  const timeline = a.timeline || a.observations || [], nodes = a.nodes || [], missing2 = unconfirmed ? "\u672A\u53D6\u5F97" : "\u672A\u91C7\u96C6";
  const summary = unconfirmed && a.latest_metrics == null ? '<p class="cell-sub">\u6700\u65B0\u6C47\u603B\u6307\u6807\u672A\u53D6\u5F97\u3002</p>' : metricSummary(a);
  return `${unconfirmed ? '<section class="detail-section"><h3>\u72B6\u6001\u672A\u786E\u8BA4</h3><p>\u4EE5\u4E0B\u4E3A\u5DF2\u6709\u6307\u6807\u4E0E\u5386\u53F2\u8BB0\u5F55\u3002</p></section>' : ""}${summary}<p class="cell-sub">\u622A\u81F3 ${a.latest_metrics == null ? missing2 : e(displayTime(a.latest_as_of))} \xB7 \u91C7\u96C6\u4E8E ${a.latest_metrics == null ? missing2 : e(displayTime(a.latest_collected_at))}</p><section class="detail-section">${unconfirmed ? "" : `<h3>\u89C2\u5BDF\u8282\u70B9</h3><ol class="snapshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label3 = unknown ? "\u65E5\u671F\u5F85\u6838\u5B9E" : { recorded: "\u5DF2\u8BB0\u5F55", before_due: "\u8BB0\u5F55\u65E9\u4E8E\u8282\u70B9", not_due: "\u672A\u5230\u671F", not_collected: "\u672A\u91C7\u96C6" }[status] || "\u72B6\u6001\u672A\u77E5";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label3)}</span><small>${e(displayTime(
      n.snapshot?.as_of || n.due_at
    ))}</small></li>`;
  }).join("")}</ol>`}<h3>\u5FEB\u7167\u65F6\u95F4\u7EBF ${detailInfo(
    "\u6309\u622A\u81F3\u65F6\u95F4\u6392\u5E8F\uFF1B\u76F8\u90BB\u7D2F\u8BA1\u5FEB\u7167\u5DEE\u503C\u4E0D\u7B49\u540C\u6BCF\u65E5\u65B0\u589E\u3002\u8282\u70B9\u7C7B\u578B\u4E0D\u4EE3\u8868\u5148\u540E\u3002",
    "\u65F6\u95F4\u7EBF\u53E3\u5F84",
    "timeline"
  )}</h3>${timeline.length < 2 ? `<p class="insufficient">${timeline.length ? "\u53EA\u6709\u4E00\u671F\u6570\u636E\uFF0C\u6682\u4E0D\u663E\u793A\u589E\u957F\u3002" : unconfirmed ? "\u6CA1\u6709\u5DF2\u8BB0\u5F55\u7684\u5386\u53F2\u5FEB\u7167\u3002" : "\u5C1A\u672A\u91C7\u96C6\u5FEB\u7167\u3002"}</p>` : ""}<ol class="snapshot-timeline">${timeline.map((r) => `<li>${renderSnapshot(r)}${r.changes ? `<div class="snapshot-changes">${[
    "reads",
    "likes",
    "comments",
    "approvals"
  ].filter((key2) => metricData(r)[key2] != null).map((key2) => `<span>${e(metrics[key2])}${comparisonHTML(
    r.changes[key2]
  )}${detailInfo(r.changes[key2]?.reason || "\u6307\u6807\u672A\u53D6\u5F97", metrics[key2] + "\u53D8\u5316\u8BF4\u660E", r.id + "-" + key2)}</span>`).join(
    ""
  )}</div>` : ""}</li>`).join("")}</ol></section>`;
}
async function articleDetail(id2) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, a = await modalRequest(
    `/articles/${encodeURIComponent(id2)}`,
    ticket,
    version,
    context
  );
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  openModal(a.title, renderArticleDetailBody(a), { drawer: true, context: `<div class="account-title">${platformLogo(a.platform)}${e(
    a.account_name || accountName(a.account_id)
  )} \xB7 ${e(articleStatus[a.status] || "\u672A\u786E\u8BA4")}</div>` });
  const modal = runtime.modalRequestVersion, epoch = runtime.sessionEpoch;
  const isCurrent = () => modal === runtime.modalRequestVersion && version === runtime.renderVersion && epoch === runtime.sessionEpoch && document.querySelector("#overlay .article-ledger-detail")?.dataset.articleDetail === a.id;
  bindArticleVerification(a, { isCurrent, render(view2) {
    if (!isCurrent()) return;
    const focused = document.activeElement?.dataset?.articleVerifyIndex;
    document.querySelector("#overlay .article-ledger-detail").outerHTML = renderArticleDetailBody(view2.article, view2);
    document.querySelector("#modal-title").textContent = view2.article.title;
    if (focused !== void 0 && !view2.busy) Array.from(document.querySelectorAll("#overlay [data-article-verify-index]")).find((node2) => node2.dataset.articleVerifyIndex === focused)?.focus();
  } });
}

// local-ui/frontend/web/pages/reviews.mjs
init_client();

// local-ui/frontend/web/core/article-index.mjs
init_client();
init_state();
var indexRequests = /* @__PURE__ */ new WeakMap();
async function articleIndex(query = "", context) {
  const identity4 = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity4) throw Object.assign(new Error("\u7D22\u5F15\u4F1A\u8BDD\u5DF2\u5931\u6548"), { staleIndex: true });
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key2 = identity4 + ":" + params.toString();
  let pending = articleIndexes.get(key2);
  const owner2 = pending && indexRequests.get(pending);
  if (owner2 && !owner2.done && owner2.scope !== scope) pending = null;
  if (!pending) {
    const entry = { scope, done: false };
    pending = api("/articles?" + params, { context: scope }).then((rows2) => {
      entry.done = true;
      return Object.freeze(rows2.map((row) => Object.freeze(row)));
    });
    indexRequests.set(pending, entry);
    articleIndexes.set(key2, pending);
    if (articleIndexes.size > 10) articleIndexes.delete(articleIndexes.keys().next().value);
    pending.catch(() => {
      if (articleIndexes.get(key2) === pending) articleIndexes.delete(key2);
    });
  }
  const rows = await pending;
  if (generation !== runtime.articleIndexGeneration || identity4 !== state.me?.id) {
    if (!state.me || identity4 !== state.me.id) throw Object.assign(new Error("\u7D22\u5F15\u4F1A\u8BDD\u5DF2\u5931\u6548"), { staleIndex: true });
    return articleIndex(query, context);
  }
  return rows;
}

// local-ui/frontend/web/pages/reviews.mjs
init_constants();
init_state();
async function renderReviews(version = runtime.renderVersion, context, { isCurrent = () => true, compactFilters = false } = {}) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches = (id2) => !state.filters.platform || state.accounts.find((a) => a.id === id2)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version !== runtime.renderVersion || !isCurrent()) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version, context, { isCurrent, compactFilters });
  state.reviewArticles = articles;
  const account = (r) => r.account_id || articles.find((a) => a.id === r.article_id)?.account_id, records = rows.filter((r) => matches(account(
    r
  ))), due = dueRows.filter((r) => matches(r.account_id));
  state.reviewRecords = records;
  const tabs = `${segmented(
    "review-tab",
    [["pending", `\u5F85\u529E ${num(due.length)}`], ["observations", "\u6587\u7AE0\u5FEB\u7167"], ["daily", "\u6BCF\u65E5\u6570\u636E"]],
    tab,
    "\u6570\u636E\u7C7B\u578B",
    "tab",
    "page-tabs"
  )}${compactFilters ? "" : `<div class="review-summary">${platformFilter("review-platform", state.filters.platform, "\u6570\u636E\u5E73\u53F0")}${accountFilter()}</div>`}`;
  const items = pending ? due : records, columns = pending ? [["account", "\u8D26\u53F7"], ["due_kind", "\u89C2\u5BDF\u8282\u70B9"], ["due_at", "\u76EE\u6807\u65F6\u95F4"]] : [["account", "\u8D26\u53F7"], ...Object.entries(metrics).filter(([key2]) => records.some((r) => metricData(r)[key2] != null)).map(([key2, label3]) => [
    key2,
    ["likes", "approvals"].includes(key2) ? `${label3}\uFF08${key2}\uFF09` : label3
  ]), [
    tab === "observations" ? "as_of" : "source",
    tab === "observations" ? "\u6570\u636E\u622A\u81F3" : "\u6765\u6E90"
  ]];
  const cell = (r, key2) => key2 === "account" ? e(accountName(account(r))) : key2 === "due_kind" ? e(kindLabels[r.due_kind] || r.due_kind) : [
    "as_of",
    "due_at"
  ].includes(key2) ? e(displayTime(r[key2])) : key2 === "source" ? e(r.source || "\u672A\u6807\u6CE8\u6765\u6E90") : metricData(r)[key2] == null ? '<span class="missing-value">\u672A\u53D6\u5F97</span>' : e(num(metricData(r)[key2]));
  return tabs + `<section class="card">${items.length ? `<div class="table-scroll"><table class="data-table dashboard-table review-table"><thead><tr><th>${pending ? "\u6587\u7AE0" : tab === "observations" ? "\u6587\u7AE0\uFF0F\u89C2\u5BDF\u8282\u70B9" : "\u65E5\u671F\uFF0F\u7EDF\u8BA1\u8303\u56F4"}</th>${columns.map(([, label3]) => `<th>${e(label3)}</th>`).join("")}<th>\u64CD\u4F5C</th></tr></thead><tbody>${items.map((r) => {
    const id2 = pending ? r.id : r.article_id, a = articles.find((a2) => a2.id === id2);
    return `<tr><td class="title-cell">${id2 ? `<button class="article-link" data-action="article-detail" data-id="${e(id2)}">${e(r.title || r.article_title || a?.title || "\u6587\u7AE0\u8BB0\u5F55")}</button>` : e(r.date)}${pending ? "" : `<div class="cell-sub">${e(tab === "observations" ? kindLabels[r.kind] || r.kind : r.article_id ? r.date : "\u8D26\u53F7\u603B\u4F53")}</div>`}</td>${columns.map(([key2, label3]) => `<td data-label="${e(
      label3
    )}">${cell(r, key2)}</td>`).join("")}<td>${pending ? `<button class="btn small" data-action="review-article" data-id="${e(
      id2
    )}" data-kind="${e(r.due_kind)}">\u8865\u5F55\u5FEB\u7167</button>` : `<button class="btn small" data-action="record-detail" data-id="${e(r.id)}">\u8BE6\u60C5</button>`}</td></tr>`;
  }).join("")}</tbody></table></div><div class="table-footer">\u5171 ${e(num(items.length))} \u6761</div>` : empty(pending ? "\u6682\u65E0\u5230\u671F\u63D0\u9192" : "\u6682\u65E0\u8BB0\u5F55", "", pending ? "" : '<button class="btn" data-action="new-review">\u5F55\u5165\u6570\u636E</button>')}</section>`;
}
async function reviewRecordsModal() {
  openModal("\u6570\u636E\u8BB0\u5F55", '<div id="media-records" role="status"></div>', { drawer: true });
  const ticket = runtime.modalRequestVersion, version = runtime.renderVersion, context = beginModalRequests();
  const isCurrent = () => ticket === runtime.modalRequestVersion && version === runtime.renderVersion;
  try {
    const html = await renderReviews(version, context, { isCurrent, compactFilters: true });
    const root2 = document.querySelector("#media-records");
    if (isCurrent() && root2) {
      root2.innerHTML = html;
      root2.removeAttribute("role");
    }
  } catch (error) {
    const root2 = document.querySelector("#media-records");
    if (isCurrent() && root2) {
      root2.setAttribute("role", "alert");
      root2.textContent = error.message || "\u6570\u636E\u8BB0\u5F55\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
    }
  }
}
async function reviewModal(articleId = "", kind = "latest", indexRetry = false) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, generation = runtime.articleIndexGeneration;
  const directArticle = Boolean(articleId);
  let articles;
  try {
    articles = await articleIndex("", context);
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
    throw err;
  }
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  if (generation !== runtime.articleIndexGeneration) return reviewModal(articleId, kind, indexRetry);
  if (directArticle && !articles.some((a) => a.id === articleId)) {
    if (indexRetry) throw new Error("\u6587\u7AE0\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u8BBF\u95EE\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002");
    clearArticleIndexes();
    return reviewModal(articleId, kind, true);
  }
  if (!articleId && state.account) articleId = articles.find((a) => a.account_id === state.account)?.id || "";
  state.reviewArticles = articles;
  const daily = state.reviewTab === "daily" && !directArticle;
  if (!articles.length && !daily) {
    openModal("\u5F55\u5165\u590D\u76D8\u6570\u636E", empty("\u8BF7\u5148\u8BB0\u5F55\u6587\u7AE0", "", '<button class="btn primary" data-action="new-article">\u8BB0\u5F55\u53D1\u5E03</button>'));
    return;
  }
  const accountId = state.account || articles.find((a) => a.id === articleId)?.account_id || state.accounts.find((a) => a.active)?.id || "";
  openModal(daily ? "\u586B\u5199\u6BCF\u65E5\u65B0\u589E\u6570\u636E" : "\u8FFD\u52A0\u6587\u7AE0\u7D2F\u8BA1\u5FEB\u7167", `<form id="review-form" data-type="${daily ? "daily" : "observation"}"><p class="form-context">\u5317\u4EAC\u65F6\u95F4</p><div class="form-grid">${daily ? `<div class="form-field"><label for="review-account">\u6240\u5C5E\u8D26\u53F7 <span class="required">*</span></label><select class="input" name="account_id" id="review-account" required>${accountOptions(
    accountId,
    false,
    true
  )}</select></div><div class="form-field"><label for="review-article">\u7EDF\u8BA1\u8303\u56F4</label><select class="input" name="article_id" id="review-article"><option value="">\u8D26\u53F7\u603B\u4F53</option>${articles.filter((a) => a.account_id === accountId).map((a) => `<option value="${e(a.id)}">${e(
    a.title
  )}</option>`).join("")}</select></div>${field("date", '\u6570\u636E\u6240\u5C5E\u65E5\u671F <span class="required">*</span>', "date", bjtDate(), `max="${bjtDate()}" required`)}` : `<div class="form-field full"><label for="review-article">\u6587\u7AE0 <span class="required">*</span></label><select class="input" name="article_id" id="review-article" required>${articles.map((a) => `<option value="${e(a.id)}" ${a.id === articleId ? "selected" : ""}>${e(a.title)} \xB7 ${e(accountName(a.account_id))}</option>`).join("")}</select></div><div class="form-field"><label for="field-kind">\u89C2\u5BDF\u8282\u70B9</label><select class="input" id="field-kind" name="kind">${Object.entries(kindLabels).map(([key2, label3]) => `<option value="${key2}" ${key2 === kind ? "selected" : ""}>${label3}</option>`).join("")}</select></div>${field(
    "as_of",
    '\u6570\u636E\u622A\u81F3\u65F6\u95F4 <span class="required">*</span>',
    "datetime-local",
    localDateTime(/* @__PURE__ */ new Date()),
    "required"
  )}${field(
    "collected_at",
    '\u5B9E\u9645\u91C7\u96C6\u65F6\u95F4 <span class="required">*</span>',
    "datetime-local",
    localDateTime(/* @__PURE__ */ new Date()),
    "required"
  )}`}${field(
    "source",
    '\u6570\u636E\u6765\u6E90 <span class="required">*</span>',
    "text",
    "",
    'required maxlength="200"'
  )}<div class="form-field full"><span class="field-label">${daily ? "\u5F53\u5929\u65B0\u589E\u6307\u6807" : "\u7D2F\u8BA1\u6307\u6807"}</span><span class="hint">\u81F3\u5C11\u4E00\u9879\uFF1B\u7F3A\u5931\u7559\u7A7A\uFF0C\u771F\u5B9E\u4E3A\u96F6\u624D\u586B 0\u3002</span></div>${Object.entries(metrics).map(([key2, label3]) => field(
    `metric_${key2}`,
    label3,
    "number",
    "",
    'min="0" step="1" inputmode="numeric" placeholder="\u672A\u53D6\u5F97"'
  )).join("")}${daily ? "" : `<div class="form-field full"><label for="field-note">\u590D\u76D8\u5907\u6CE8</label><textarea class="input" name="note" id="field-note" maxlength="10000"></textarea></div>`}</div>${formEnd(daily ? "\u4FDD\u5B58\u6BCF\u65E5\u6570\u636E" : "\u8FFD\u52A0\u5FEB\u7167")}</form>`);
}

// local-ui/frontend/web/actions.mjs
function actionMissingList({ target }) {
  state.filters = { ...defaultFilters(), status: "published", data_status: target.dataset.status || "incomplete" };
  state.listPage = 1;
  navigate("articles");
  return;
}
function actionListPrev({}) {
  state.listPage = Math.max(1, state.listPage - 1);
  updateRoute();
  renderPage();
  return;
}
function actionListNext({}) {
  if (state.articleMeta?.has_more) {
    state.listPage++;
    updateRoute();
    renderPage();
  }
  return;
}
function actionSortColumn({ target }) {
  const key2 = target.dataset.sort;
  state.filters.order = state.filters.sort === key2 && state.filters.order === "desc" ? "asc" : "desc";
  state.filters.sort = key2;
  reloadFilteredPage('[data-sort="' + key2 + '"]');
  return;
}
function actionSaveView({ id: id2 }) {
  openModal("\u4FDD\u5B58\u5E38\u7528\u89C6\u56FE", `<form id="save-view-form">${field("name", '\u89C6\u56FE\u540D\u79F0 <span class="required">*</span>', "text", "", 'maxlength="80" required')}${formEnd("\u4FDD\u5B58\u89C6\u56FE")}</form>`);
  return;
}
function actionCloseModal({}) {
  closeModal();
  return;
}
function actionMenu({}) {
  setMenu(!$(".shell").classList.contains("menu-open"));
  return;
}
function actionSettingsTab({ target, action }) {
  if (Object.hasOwn(settingsTabs, target.dataset.tab)) {
    navigate("settings", target.dataset.tab);
    $("[data-action=settings-tab][data-tab=" + state.settingsTab + "]")?.focus();
  }
  return;
}
async function actionArticleFilter({ action }) {
  cancelModalRequests();
  runtime.modalRequestVersion++;
  const trigger = $("[data-action=article-filter]");
  if (trigger) popover(trigger, articleFilterPanel(), { label: "\u6587\u7AE0\u7B5B\u9009" });
  return;
}
function actionResetDraft({}) {
  $("#filter-panel").outerHTML = articleFilterPanel({ filters: defaultFilters(), columns: new Set(defaultColumns), account: "" });
  $("#filter-panel select")?.focus();
  return;
}
function actionDraftSort({ target }) {
  const draft = articleDraft($("#filter-panel"));
  draft.filters.order = draft.filters.sort === target.dataset.sort && draft.filters.order === "desc" ? "asc" : "desc";
  draft.filters.sort = target.dataset.sort;
  $("#filter-panel").outerHTML = articleFilterPanel(draft);
  $('#filter-panel [data-sort="' + target.dataset.sort + '"]')?.focus();
  return;
}
function actionArticlePlatform({ target, action }) {
  state.filters.platform = target.dataset.platform;
  reloadFilteredPage("[data-action=" + action + "][aria-pressed=true]");
  return;
}
function actionRemoveFilter({ target }) {
  if (target.dataset.filter === "account") state.account = "";
  else if (Object.hasOwn(defaultFilters(), target.dataset.filter)) state.filters[target.dataset.filter] = defaultFilters()[target.dataset.filter];
  reloadFilteredPage();
  return;
}
function actionArticleMenu({ target, id: id2 }) {
  const article = state.articles.find((a) => a.id === id2);
  if (article) popover(target, articleMenu(article), { menu: true, label: "\u6587\u7AE0\u64CD\u4F5C" });
  return;
}
function actionDetailInfo({ target }) {
  popover(target, `<p>${e(target.dataset.reason)}</p>`, { label: target.getAttribute("aria-label") });
  return;
}
function actionDashboardInfo({ target, id: id2 }) {
  popover(target, dashboardInfoBody(target.dataset.kind, id2), { label: target.getAttribute("aria-label") });
  return;
}
async function actionTopPlatform({ target, action }) {
  state.topPlatform = target.dataset.platform;
  updateRoute();
  await renderPage();
  if (!$("#overlay").firstChild && document.activeElement === document.body) $("[data-action=top-platform][aria-pressed=true]")?.focus();
  return;
}
function actionAllTop({ target, event, action }) {
  event.preventDefault();
  state.filters = {
    ...defaultFilters(),
    status: "published",
    platform: action === "all-top" ? state.topPlatform : target.dataset.platform,
    ...action === "all-top" ? { sort: "reads", order: "desc" } : {}
  };
  if (action !== "all-top") state.account = "";
  state.listPage = 1;
  navigate("articles");
  return;
}
async function actionNewDaily({}) {
  state.reviewTab = "daily";
  await reviewModal();
  return;
}
function actionTrendTab({ target, action }) {
  if (["metrics", "publication"].includes(target.dataset.tab)) {
    state.trendTab = target.dataset.tab;
    state.trendOpen = true;
    replacePageContent(renderMediaOverview(state.dashboard));
    $("[data-action=trend-tab][data-tab=" + state.trendTab + "]")?.focus();
  }
  return;
}
function actionPageMenu({ target, action }) {
  const records = ["dashboard", "articles"].includes(state.page) ? '<button data-action="media-records" role="menuitem">\u67E5\u770B\u6570\u636E\u8BB0\u5F55</button>' : "";
  popover(target, '<button data-action="refresh" role="menuitem">\u5237\u65B0\u6570\u636E</button>' + records + '<a href="/api/v1/export" download role="menuitem">\u5BFC\u51FA\u53D1\u5E03\u8BB0\u5F55 CSV</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">\u63A5\u5165\u6587\u6863 \u2197</a>', { menu: true, label: "\u9875\u9762\u64CD\u4F5C" });
  return;
}
function actionKeyHelp({ target }) {
  popover(target, "<p>\u4F9B\u81EA\u52A8\u5316\u5DE5\u5177\u6309\u8D26\u53F7\u8303\u56F4\u8BFB\u53D6\u6216\u5F55\u5165\u6570\u636E\uFF1B\u51ED\u636E\u521B\u5EFA\u540E\u4EC5\u663E\u793A\u4E00\u6B21\u3002</p>", { label: "AI \u51ED\u636E\u7528\u9014" });
  return;
}
async function actionLogout({}) {
  await api("/auth/logout", { method: "POST" });
  state.me = null;
  renderLogin();
  return;
}
function actionRefresh({}) {
  clearArticleIndexes();
  renderPage();
  return;
}
function actionOverviewPeriod({ target }) {
  if (["yesterday", "7d", "30d"].includes(target.dataset.period) && state.overviewPeriod !== target.dataset.period) {
    state.overviewPeriod = target.dataset.period;
    updateRoute();
    renderShell();
  }
  return;
}
function actionArticleOverviewMode({ target }) {
  const mode = target.dataset.mode;
  if (!["drafts", "published", "reconciliation"].includes(mode) || state.articleOverviewMode === mode) return;
  state.articleOverviewMode = mode;
  updateRoute(true);
  renderShell();
  $("[data-action=article-overview-mode][aria-pressed=true]")?.focus();
}
async function actionShowDue({}) {
  state.reviewTab = "pending";
  await reviewRecordsModal();
  return;
}
function actionToggleAttention({}) {
  state.attentionExpanded = !state.attentionExpanded;
  if (state.dashboard) {
    replacePageContent(renderMediaOverview(state.dashboard));
  }
  return;
}
async function actionNewArticle({}) {
  await articleModal();
  return;
}
async function actionEditArticle({ id: id2 }) {
  await articleModal(id2);
  return;
}
async function actionArticleDetail({ id: id2 }) {
  await articleDetail(id2);
  return;
}
async function actionReviewArticle({ target, id: id2 }) {
  await reviewModal(id2, target.dataset.kind || "latest");
  return;
}
async function actionNewReview({}) {
  await reviewModal();
  return;
}
async function actionReviewTab({ target, action }) {
  if (["pending", "observations", "daily"].includes(target.dataset.tab)) {
    state.reviewTab = target.dataset.tab;
    if ($("#media-records")) {
      await reviewRecordsModal();
      return;
    }
    updateRoute(true);
    const version = runtime.renderVersion + 1;
    await renderPage();
    if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(
      "[data-action=review-tab][data-tab=" + state.reviewTab + "]"
    )?.focus();
  }
  return;
}
function actionNewKey({}) {
  keyModal();
  return;
}
function actionSelectAccount({ id: id2 }) {
  state.filters = { ...defaultFilters(), status: "published" };
  state.account = id2;
  state.listPage = 1;
  navigate("articles");
  return;
}
function actionRecordDetail({ id: id2 }) {
  const row = state.reviewRecords.find((r) => r.id === id2);
  if (row) openModal("\u6570\u636E\u8BB0\u5F55\u8BE6\u60C5", `${renderSnapshot(row)}<p class="cell-sub record-context">${e(row.date ? "\u7EDF\u8BA1\u65E5\u671F\uFF1A" + row.date : "\u6570\u636E\u622A\u81F3\uFF1A" + time(row.as_of))}${row.updated_at ? " \xB7 \u66F4\u65B0\u4E8E " + e(time(row.updated_at)) : ""}</p>`);
  return;
}
function actionRevokeKey({ target, id: id2 }) {
  openModal("\u64A4\u9500 AI \u51ED\u8BC1", `<p class="revoke-context">\u64A4\u9500\u300C${e(target.dataset.name)}\u300D\u540E\u51ED\u8BC1\u7ACB\u5373\u5931\u6548\uFF0C\u5DF2\u6709\u6570\u636E\u4FDD\u7559\u3002</p><form id="revoke-form" data-id="${e(
    id2
  )}">${formEnd("\u786E\u8BA4\u64A4\u9500")}</form>`);
  return;
}
async function actionCopyToken({}) {
  const token = $("#created-token").textContent;
  try {
    await navigator.clipboard.writeText(token);
    toast("\u51ED\u8BC1\u5DF2\u590D\u5236\uFF0C\u8BF7\u5728\u5B89\u5168\u4F4D\u7F6E\u4FDD\u5B58\u3002");
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("#created-token"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    toast("\u5DF2\u9009\u4E2D\u51ED\u8BC1\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002");
  }
  return;
}
function actionResetFilters({}) {
  state.filters = defaultFilters();
  state.account = "";
  state.listPage = 1;
  updateRoute();
  renderShell();
  return;
}
var actions = {
  "media-menu": ({ event }) => {
    event.preventDefault();
    navigate("review");
  },
  "notes-menu": ({ event }) => {
    if (state.page !== "notes") {
      event.preventDefault();
      navigate("notes");
      document.querySelector(".mobile-notes-nav").open = true;
    }
  },
  "article-overview-mode": actionArticleOverviewMode,
  "media-records": reviewRecordsModal,
  "article-verify-retry": retryArticleVerification,
  "article-verify-refresh": refreshArticleVerification,
  "todo-floating": openFloatingWorkbench,
  "todo-menu": openTodoMenu,
  "todo-note": openTodoNote,
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id: id2 }) => useTodoTemplate(id2),
  "todo-template-edit": ({ id: id2 }) => editTodoTemplate(id2),
  "todo-template-archive": ({ id: id2 }) => archiveTodoTemplate(id2),
  "todo-template-restore-archive": ({ id: id2 }) => archiveTodoTemplate(id2, true),
  "todo-template-delete": ({ id: id2 }) => writeTodoTemplate(id2, void 0, true),
  "memo-tools": ({ target }) => {
    if (target.dataset.tool === "trash") navigate("settings", "workspace");
    else {
      requestMemoTool(target.dataset.tool);
      navigate("memos");
    }
  },
  "todo-panel": ({ target }) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({ id: id2 }) => deleteUnscheduledTodo(id2),
  "todo-future-schedule": ({ id: id2 }) => scheduleUnscheduledTodo(id2),
  "todo-retry-add": retryTodoCreate,
  "todo-panel-close": () => setTodoPanel(""),
  "todo-template-cancel": cancelTodoTemplateEdit,
  "todo-calendar-prev": () => moveTodoMonth(-1),
  "todo-calendar-next": () => moveTodoMonth(1),
  "todo-calendar-date": ({ target }) => selectTodoDate(target.dataset.date),
  "todo-prev": () => moveTodoDate(-1),
  "todo-next": () => moveTodoDate(1),
  "todo-today": () => selectTodoDate(bjtDate()),
  "todo-reload": refreshTodos,
  "missing-list": actionMissingList,
  "list-prev": actionListPrev,
  "list-next": actionListNext,
  "sort-column": actionSortColumn,
  "save-view": actionSaveView,
  "close-modal": actionCloseModal,
  "menu": actionMenu,
  "settings-tab": actionSettingsTab,
  "article-filter": actionArticleFilter,
  "reset-draft": actionResetDraft,
  "draft-sort": actionDraftSort,
  "article-platform": actionArticlePlatform,
  "review-platform": actionArticlePlatform,
  "remove-filter": actionRemoveFilter,
  "article-menu": actionArticleMenu,
  "detail-info": actionDetailInfo,
  "dashboard-info": actionDashboardInfo,
  "top-platform": actionTopPlatform,
  "all-top": actionAllTop,
  "select-platform": actionAllTop,
  "new-daily": actionNewDaily,
  "trend-tab": actionTrendTab,
  "page-menu": actionPageMenu,
  "key-help": actionKeyHelp,
  "logout": actionLogout,
  "refresh": actionRefresh,
  "overview-period": actionOverviewPeriod,
  "show-due": actionShowDue,
  "toggle-attention": actionToggleAttention,
  "new-article": actionNewArticle,
  "edit-article": actionEditArticle,
  "article-detail": actionArticleDetail,
  "review-article": actionReviewArticle,
  "new-review": actionNewReview,
  "review-tab": actionReviewTab,
  "new-key": actionNewKey,
  "select-account": actionSelectAccount,
  "record-detail": actionRecordDetail,
  "revoke-key": actionRevokeKey,
  "copy-token": actionCopyToken,
  "reset-filters": actionResetFilters
};

// local-ui/frontend/web/forms.mjs
init_client();
init_constants();
init_state();

// local-ui/frontend/web/pages/article-form.mjs
init_client();
init_constants();
init_state();
var textValue = (value) => typeof value === "string" ? value.trim() : "";
var objectValue = (value) => value && typeof value === "object" && !Array.isArray(value);
function articleFormCurrent(form, cache2 = runtime.articleFormRecord) {
  return !!cache2 && cache2 === runtime.articleFormRecord && cache2.sessionEpoch === runtime.sessionEpoch && cache2.ticket === runtime.modalRequestVersion && form.isConnected && (cache2.record?.id || "") === (form.dataset.id || "") && String(cache2.record?.version || "") === (form.dataset.version || "");
}
function articleFormRecord(form) {
  const cache2 = runtime.articleFormRecord, id2 = form.dataset.id || "";
  if (!articleFormCurrent(form, cache2) || !objectValue(cache2.record) || id2 && (!Number.isSafeInteger(cache2.record.version) || cache2.record.version < 1)) {
    throw new Error("\u8868\u5355\u8BB0\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u5173\u95ED\u540E\u91CD\u65B0\u6253\u5F00\u518D\u4FDD\u5B58\u3002");
  }
  return cache2;
}
function nullableNumber(value, label3, minimum = 0) {
  const raw = textValue(value);
  if (!raw) return null;
  const number2 = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number2) || number2 < minimum) {
    throw new Error(`${label3}\u8BF7\u586B\u5199${minimum ? "\u6B63" : "\u975E\u8D1F"}\u6574\u6570\uFF0C\u672A\u77E5\u65F6\u7559\u7A7A\u3002`);
  }
  return number2;
}
function choice(value, choices, label3, fallback = null) {
  const raw = textValue(value);
  if (!raw) return fallback;
  if (!Object.hasOwn(choices, raw)) throw new Error(`${label3}\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002`);
  return raw;
}
function articleTime(value, label3, original) {
  const raw = textValue(value);
  if (!raw) return null;
  const parts2 = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (!parts2) throw new Error(`${label3}\u8BF7\u586B\u5199\u6709\u6548\u7684\u5317\u4EAC\u65F6\u95F4\u3002`);
  const canonical4 = `${parts2[1]}T${parts2[2]}:${parts2[3] || "00"}.${(parts2[4] || "").padEnd(3, "0")}`;
  const stamp = /* @__PURE__ */ new Date(`${canonical4}+08:00`);
  if (!Number.isFinite(stamp.getTime()) || new Date(stamp.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical4) {
    throw new Error(`${label3}\u8BF7\u586B\u5199\u771F\u5B9E\u65E5\u671F\u548C\u65F6\u95F4\u3002`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp.toISOString();
}
function mergedObject(original, fields4) {
  if (original != null && !objectValue(original)) throw new Error("\u539F\u8BB0\u5F55\u7684 JSON \u5B57\u6BB5\u65E0\u6CD5\u5B89\u5168\u7F16\u8F91\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6838\u5BF9\u3002");
  const result = original == null ? {} : structuredClone(original);
  for (const [key2, value] of Object.entries(fields4)) {
    if (value !== null || Object.hasOwn(result, key2)) result[key2] = value;
  }
  return Object.keys(result).length || original != null ? result : null;
}
function publicationFields(data2, original, status) {
  const raw = textValue(data2.url), time2 = textValue(data2.published_at);
  if (status !== "published" && (raw || time2)) {
    throw new Error("\u672A\u53D1\u5E03\u72B6\u6001\u4E0D\u80FD\u4FDD\u7559\u516C\u5F00\u94FE\u63A5\u6216\u53D1\u5E03\u65F6\u95F4\uFF0C\u8BF7\u660E\u786E\u6E05\u7A7A\u53D1\u5E03\u4FE1\u606F\u6216\u9009\u62E9\u5DF2\u53D1\u5E03\u3002");
  }
  if (status !== "published") return { url: null, published_at: null };
  if (!raw || !time2 || !safeLedgerURL(raw)) throw new Error("\u5DF2\u53D1\u5E03\u6587\u7AE0\u987B\u586B\u5199\u771F\u5B9E\u7684 HTTP/HTTPS \u94FE\u63A5\u548C\u5B9E\u9645\u53D1\u5E03\u65F6\u95F4\u3002");
  const url = new URL(raw);
  url.hash = "";
  return { url: url.toString(), published_at: articleTime(time2, "\u5B9E\u9645\u53D1\u5E03\u65F6\u95F4", original.published_at) };
}
function buildArticleFormPayload(data2, original = {}) {
  const status = choice(data2.status, statusLabels, "\u6587\u7AE0\u72B6\u6001");
  if (!status) throw new Error("\u8BF7\u660E\u786E\u9009\u62E9\u6587\u7AE0\u72B6\u6001\uFF0C\u672A\u786E\u8BA4\u7684\u72B6\u6001\u4E0D\u4F1A\u81EA\u52A8\u4FDD\u5B58\u4E3A\u8349\u7A3F\u6216\u5DF2\u53D1\u5E03\u3002");
  const body = {
    account_id: textValue(data2.account_id),
    title: textValue(data2.title),
    status,
    ...publicationFields(data2, original, status),
    started_at: articleTime(data2.started_at, "\u6D41\u6C34\u7EBF\u5F00\u59CB", original.started_at),
    production_mode: choice(data2.production_mode, modeLabels, "\u751F\u4EA7\u65B9\u5F0F", "unknown"),
    summary: textValue(data2.summary),
    notes: textValue(data2.notes),
    platform_article_id: textValue(data2.platform_article_id) || null,
    slot: choice(data2.slot, slotLabels, "\u69FD\u4F4D"),
    writer: choice(data2.writer, writerLabels, "\u5199\u4F5C\u8005"),
    illustrator: choice(data2.illustrator, illustratorLabels, "\u914D\u56FE\u8005"),
    run_dir: textValue(data2.run_dir) || null,
    run_date: textValue(data2.run_date) || null,
    series_no: nullableNumber(data2.series_no, "\u7CFB\u5217\u7F16\u53F7", 1),
    char_count: nullableNumber(data2.char_count, "\u5B57\u6570"),
    subheading_count: nullableNumber(data2.subheading_count, "\u5C0F\u6807\u9898\u6570"),
    image_count: nullableNumber(data2.image_count, "\u56FE\u6570")
  };
  if (!body.account_id || !body.title) throw new Error("\u8BF7\u586B\u5199\u6587\u7AE0\u6807\u9898\u5E76\u9009\u62E9\u6240\u5C5E\u8FD0\u8425\u8D26\u53F7\u3002");
  if (body.published_at && body.started_at && body.started_at > body.published_at) {
    throw new Error("\u6D41\u6C34\u7EBF\u5F00\u59CB\u65F6\u95F4\u4E0D\u80FD\u665A\u4E8E\u53D1\u5E03\u65F6\u95F4\u3002");
  }
  const editor = textValue(data2.draft_editor_url);
  if (editor && !safeLedgerURL(editor)) throw new Error("\u8349\u7A3F\u7F16\u8F91\u94FE\u63A5\u8BF7\u4F7F\u7528\u6709\u6548\u7684 HTTP/HTTPS \u5730\u5740\u3002");
  body.draft_ref = mergedObject(original.draft_ref, {
    pgc_id: textValue(data2.draft_pgc_id) || null,
    appmsgid: textValue(data2.draft_appmsgid) || null,
    editor_url: editor || null
  });
  body.timings = mergedObject(original.timings, { finished_at: articleTime(data2.finished_at, "\u6D41\u6C34\u7EBF\u7ED3\u675F", original.timings?.finished_at) });
  if (original.id) body.version = original.version;
  return body;
}
function equalValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key2) => Object.hasOwn(b, key2) && equalValue(a[key2], b[key2]));
}
function savedArticle(value, pending) {
  return typeof value?.id === "string" && !!value.id && (!pending.id || value.id === pending.id) && Number.isSafeInteger(value.version) && value.version > (pending.body.version || 0) && Object.entries(pending.body).every(([key2, expected]) => key2 === "version" || equalValue(value[key2], expected));
}
function uncertainArticleSave(cache2, message) {
  cache2.saveAttempt.phase = "unknown";
  return new Error(message || "\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u5148\u5728\u6587\u7AE0\u5217\u8868\u6838\u5BF9\uFF1B\u5F53\u524D\u8868\u5355\u4E0D\u4F1A\u91CD\u590D\u63D0\u4EA4\uFF0C\u8BF7\u52FF\u91CD\u590D\u65B0\u5EFA\u3002");
}
async function reconcileArticleSave(cache2, request, isCurrent) {
  if (!cache2.saveAttempt.id) throw uncertainArticleSave(cache2);
  let remote;
  try {
    remote = await request(`/articles/${encodeURIComponent(cache2.saveAttempt.id)}`);
  } catch {
    if (!isCurrent()) return null;
    throw uncertainArticleSave(cache2, "\u4FDD\u5B58\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u5F53\u524D\u8868\u5355\u4E0D\u4F1A\u518D\u6B21\u63D0\u4EA4\u3002\u8BF7\u7A0D\u540E\u91CD\u65B0\u6253\u5F00\u8BB0\u5F55\u6838\u5BF9\u3002");
  }
  if (!isCurrent()) return null;
  if (savedArticle(remote, cache2.saveAttempt)) return remote;
  throw uncertainArticleSave(cache2, "\u4FDD\u5B58\u7ED3\u679C\u4E0E\u5F53\u524D\u8BB0\u5F55\u672A\u80FD\u786E\u8BA4\u4E00\u81F4\uFF0C\u5F53\u524D\u8868\u5355\u4E0D\u4F1A\u518D\u6B21\u63D0\u4EA4\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u6700\u65B0\u8BB0\u5F55\u6838\u5BF9\u3002");
}
async function saveArticleForm({ form, data: data2 }, { request = api, uuid: uuid2 = () => crypto.randomUUID() } = {}) {
  const cache2 = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache2);
  if (cache2.saveAttempt) throw new Error("\u6B64\u8868\u5355\u5DF2\u6709\u4FDD\u5B58\u8BF7\u6C42\uFF0C\u8BF7\u5173\u95ED\u540E\u6838\u5BF9\u6587\u7AE0\u5217\u8868\u6216\u6700\u65B0\u8BE6\u60C5\uFF0C\u4E0D\u8981\u91CD\u590D\u65B0\u5EFA\u3002");
  const body = buildArticleFormPayload(data2, cache2.record), id2 = form.dataset.id || "";
  cache2.saveAttempt = { id: id2, body: structuredClone(body), key: uuid2(), phase: "saving" };
  let value;
  try {
    value = await request(id2 ? `/articles/${encodeURIComponent(id2)}` : "/articles", {
      method: id2 ? "PUT" : "POST",
      body,
      headers: { "Idempotency-Key": cache2.saveAttempt.key }
    });
  } catch (error) {
    if (!isCurrent()) return null;
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 409 && error.code === "VERSION_CONFLICT") cache2.saveAttempt.phase = "conflict";
      else delete cache2.saveAttempt;
      throw error;
    }
    value = await reconcileArticleSave(cache2, request, isCurrent);
  }
  if (!isCurrent()) return null;
  if (!savedArticle(value, cache2.saveAttempt)) value = await reconcileArticleSave(cache2, request, isCurrent);
  if (!isCurrent()) return null;
  cache2.saveAttempt.phase = "saved";
  return value;
}

// local-ui/frontend/web/forms.mjs
async function submitSaveViewForm({ data: data2 }) {
  const saved = { id: crypto.randomUUID(), name: data2.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
  if (!saved.name) throw new Error("\u8BF7\u586B\u5199\u89C6\u56FE\u540D\u79F0\u3002");
  state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
  storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
  closeModal();
  await renderPage();
  return;
}
async function submitLoginForm({ data: data2 }) {
  await api("/auth/login", { method: "POST", body: { username: data2.username, password: data2.password } });
  await init({ freshLogin: true });
  return;
}
async function submitArticleForm({ form, data: data2 }) {
  const saved = await saveArticleForm({ form, data: data2 });
  if (!saved) return;
  closeModal();
  const epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  try {
    await renderPage();
  } catch {
    if (epoch === runtime.sessionEpoch && ticket === runtime.modalRequestVersion) {
      toast("\u6587\u7AE0\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u5217\u8868\u6682\u65F6\u65E0\u6CD5\u5237\u65B0\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u9875\u9762\u3002", true);
    }
  }
  return;
}
async function submitReviewForm({ form, data: data2 }) {
  const m = {};
  for (const key2 of Object.keys(metrics)) {
    const value = data2[`metric_${key2}`];
    if (value !== "" && value != null) m[key2] = Number(value);
  }
  if (!Object.keys(m).length) throw new Error("\u8BF7\u81F3\u5C11\u586B\u5199\u4E00\u4E2A\u5DF2\u53D6\u5F97\u7684\u6307\u6807\u3002");
  let body, path;
  if (form.dataset.type === "daily") {
    path = "/daily-metrics";
    body = { account_id: data2.account_id, article_id: data2.article_id || null, date: data2.date, metrics: m, source: data2.source.trim() };
  } else {
    path = "/observations";
    body = { article_id: data2.article_id, kind: data2.kind, as_of: iso(data2.as_of), collected_at: iso(data2.collected_at), metrics: m, source: data2.source.trim(), note: data2.note };
  }
  await api(path, { method: "POST", body });
  closeModal();
  await renderPage();
  return;
}
async function submitKeyForm({ form, data: data2, values }) {
  const ids = values.getAll("account_ids"), permissions = values.getAll("permissions");
  if (!ids.length) throw new Error("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u5141\u8BB8\u8BBF\u95EE\u7684\u8D26\u53F7\u3002");
  if (!permissions.length) throw new Error("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u79CD\u64CD\u4F5C\u6743\u9650\u3002");
  const result = await api("/api-keys", { method: "POST", body: { name: data2.name.trim(), account_ids: ids, permissions } });
  openModal("\u51ED\u8BC1\u5DF2\u521B\u5EFA \xB7 \u8BF7\u7ACB\u5373\u4FDD\u5B58", `<div class="info-line warn">${icon("key", 15)}<span>\u51ED\u8BC1\u4EC5\u663E\u793A\u4E00\u6B21\uFF0C\u8BF7\u5B89\u5168\u4FDD\u5B58\u3002</span></div><pre class="token-box" id="created-token">${e(result.token)}</pre><div class="form-actions"><button class="btn" data-action="copy-token">${icon(
    "copy",
    14
  )}\u590D\u5236\u51ED\u8BC1</button><button class="btn primary" data-action="close-modal">\u6211\u5DF2\u4FDD\u5B58</button></div>`);
  await renderPage();
  return;
}
async function submitRevokeForm({ form }) {
  await api(`/api-keys/${encodeURIComponent(form.dataset.id)}`, { method: "DELETE" });
  closeModal();
  toast("\u51ED\u8BC1\u5DF2\u64A4\u9500\u3002");
  await renderPage();
  return;
}
async function submitPasswordForm({ form, data: data2 }) {
  if (data2.newPassword !== data2.confirmPassword) throw new Error("\u4E24\u6B21\u8F93\u5165\u7684\u65B0\u5BC6\u7801\u4E0D\u4E00\u81F4\u3002");
  await api("/auth/password", { method: "PUT", body: { currentPassword: data2.currentPassword, newPassword: data2.newPassword } });
  form.reset();
  toast("\u5BC6\u7801\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u4F7F\u7528\u65B0\u5BC6\u7801\u767B\u5F55\u3002");
  state.me = null;
  renderLogin();
  return;
}
var forms = {
  "save-view-form": submitSaveViewForm,
  "login-form": submitLoginForm,
  "article-form": submitArticleForm,
  "review-form": submitReviewForm,
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (form.id === "todo-note-form") {
    event.preventDefault();
    await submitTodoNote({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (["todo-template-form", "todo-template-edit-form"].includes(form.id)) {
    event.preventDefault();
    const handler = form.id === "todo-template-form" ? submitTodoTemplateForm : submitTodoTemplateEdit;
    await handler({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-future-form") {
    event.preventDefault();
    await submitUnscheduledTodo({ data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-form") {
    event.preventDefault();
    await submitTodo({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (!form.matches("#login-form,#article-form,#review-form,#key-form,#password-form,#revoke-form,#article-filters,#save-view-form")) return;
  event.preventDefault();
  if (form.id === "article-filters") return;
  const button2 = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data2 = Object.fromEntries(
    values
  );
  if (button2?.disabled) return;
  if (message) message.textContent = "";
  if (button2) button2.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data: data2, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (form.id === "article-form" && !articleFormCurrent(form)) return;
    if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "\u8FD9\u6761\u8BB0\u5F55\u5DF2\u88AB\u5176\u4ED6\u4EBA\u6216 AI \u66F4\u65B0\u3002\u8BF7\u5173\u95ED\u540E\u91CD\u65B0\u6253\u5F00\uFF0C\u6838\u5BF9\u6700\u65B0\u5185\u5BB9\u518D\u4FDD\u5B58\u3002" : err.message;
    else toast(err.message, true);
  } finally {
    if (button2?.isConnected) button2.disabled = false;
  }
}

// local-ui/frontend/web/events.mjs
async function handleClick(event) {
  closeMobileMenuOutside(event.target);
  closeMediaNavigation(event.target);
  if (runtime.activePopover?.node.contains(event.target) && event.target.closest("[role=menuitem]")) closePopover();
  if (runtime.activePopover && !runtime.activePopover.node.contains(event.target) && !runtime.activePopover.trigger.contains(event.target)) {
    const control = event.target.closest('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])');
    closePopover();
    control?.focus();
  }
  const target = event.target.closest("[data-action],[data-nav]");
  if (!target) {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
    if (event.target.classList.contains("shell") && $(".shell").classList.contains("menu-open")) setMenu(false);
    return;
  }
  if (runtime.activePopover?.node.contains(target) && !["reset-draft", "draft-sort"].includes(target.dataset.action)) closePopover();
  if (target.dataset.nav) {
    event.preventDefault();
    if (target.dataset.notesCategory) {
      setDailyNotesRouteCategory(target.dataset.notesCategory);
      navigate("notes");
    } else navigateLink(target.dataset.nav);
    return;
  }
  const action = target.dataset.action, id2 = target.dataset.id;
  try {
    const handler = Object.hasOwn(actions, action) ? actions[action] : null;
    if (handler) await handler({ target, event, action, id: id2 });
  } catch (err) {
    if (!err.staleSession && !isRequestAbort(err)) toast(err.message, true);
  }
}
function handleChange(event) {
  const el = event.target;
  if (changeReconciliationFilters(el)) return;
  if (el.matches?.("[data-article-verify-index]")) {
    handleArticleVerificationChange(el);
    return;
  }
  if (el.id === "todo-completed-mode") {
    changeTodoCompletedMode(el.value);
    return;
  }
  if (el.dataset?.futureTodoId) {
    toggleUnscheduledTodo(el);
    return;
  }
  if (el.dataset?.futureDateId) {
    inputUnscheduledTodo(el);
    return;
  }
  if (el.dataset?.todoId) {
    toggleTodo(el);
    return;
  }
  if (el.id === "todo-date") {
    selectTodoDate(el.value);
    return;
  }
  if (el.id === "filter-view") {
    const view2 = state.savedViews.find((v) => v.id === el.value);
    if (view2) {
      $("#filter-panel").outerHTML = articleFilterPanel(viewDraft(view2));
      $("#filter-panel select")?.focus();
    }
  } else if (el.name === "columns" && el.closest("#filter-panel")) {
    $("#filter-panel").outerHTML = articleFilterPanel(articleDraft(el.form));
    $('#filter-panel input[value="' + el.value + '"]')?.focus();
  } else if (el.id === "global-account" || el.id === "overview-account") {
    state.account = el.value;
    state.listPage = 1;
    updateRoute();
    renderShell();
  } else if (el.id === "page-size") {
    state.pageSize = Number(el.value);
    state.listPage = 1;
    updateRoute();
    renderPage();
  } else if (el.id === "trend-date") {
    state.trendDate = el.value;
    state.trendOpen = true;
    replacePageContent(renderMediaOverview(state.dashboard));
  } else if (el.id === "trend-metric") {
    state.trendMetric = el.value;
    state.trendOpen = true;
    replacePageContent(renderMediaOverview(state.dashboard));
  } else if (el.closest("#article-filters") && el.name) {
    state.filters[el.name] = el.value;
    reloadFilteredPage("[name=" + el.name + "]");
  } else if (el.id === "review-account") {
    const select = $("#review-article");
    select.innerHTML = '<option value="">\u8D26\u53F7\u603B\u4F53</option>' + state.reviewArticles.filter((a) => a.account_id === el.value).map((a) => `<option value="${e(a.id)}">${e(a.title)}</option>`).join("");
  }
}
function handleToggle(event) {
  if (event.target.id === "todo-templates" && event.target.isConnected && event.target.open) loadTodoTemplates();
  const key2 = event.target.dataset?.state;
  if (event.target.isConnected && key2 === "trendOpen") state[key2] = event.target.open;
}
function handleInput(event) {
  const el = event.target;
  inputUnscheduledTodo(el);
  inputTodo(el);
  inputTodoTemplate(el);
}
function handleFilterSubmit(event) {
  if (event.target.id === "filter-panel") {
    event.preventDefault();
    applyArticleFilters(event.target);
  }
}
function handleKeydown(event) {
  if (trapMobileMenuFocus(event)) return;
  if (event.key === "Escape") closeMediaNavigation();
  if (runtime.activePopover) {
    if (event.key === "Tab") {
      const current3 = runtime.activePopover;
      setTimeout(() => {
        if (runtime.activePopover === current3 && !current3.node.contains(document.activeElement)) closePopover({ restoreFocus: false });
      }, 0);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
      return;
    }
    if (runtime.activePopover.menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = $$("[role=menuitem]", runtime.activePopover.node), i = items.indexOf(document.activeElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      return;
    }
  }
  if (event.key === "Escape" && $(".shell")?.classList.contains("menu-open")) {
    event.preventDefault();
    setMenu(false);
    return;
  }
  if (event.key === "Escape" && state.page === "todos" && state.todoPanel && !$("#overlay").firstChild) {
    event.preventDefault();
    void setTodoPanel("");
    return;
  }
  if (!$("#overlay").firstChild) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const nodes = $$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]', $(
      "#overlay"
    )).filter((el) => el.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
function handleResize() {
  handleResponsiveLayout();
  closePopover();
  if ($(".shell")?.classList.contains("menu-open")) setMenu(false);
  else syncMenu();
}
function handlePopstate() {
  closeModal();
  readRoute();
  if (state.me) {
    updateRoute();
    renderShell();
  }
}
function registerEvents3() {
  registerTodosClock();
  registerTodoGestures(openTodoMenu, canOpenTodoMenu);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("toggle", handleToggle, true);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", handleFilterSubmit);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("submit", handleFormSubmit);
  window.addEventListener("resize", handleResize);
  window.addEventListener("popstate", handlePopstate);
}

// local-ui/frontend/web/local/main.mjs
init_runtime();

// local-ui/frontend/web/local/capabilities.mjs
function missingLocalCapabilities(environment = globalThis) {
  return [
    ["IndexedDB", Boolean(environment.indexedDB?.open)],
    ["structuredClone", typeof environment.structuredClone === "function"],
    ["crypto.randomUUID", typeof environment.crypto?.randomUUID === "function"],
    ["crypto.subtle", typeof environment.crypto?.subtle?.digest === "function"],
    ["String.isWellFormed", typeof environment.String?.prototype?.isWellFormed === "function"],
    ["Object.hasOwn", typeof environment.Object?.hasOwn === "function"]
  ].filter(([, present]) => !present).map(([name]) => name);
}

// local-ui/frontend/web/local/main.mjs
var missing = missingLocalCapabilities(window);
if (missing.length) {
  const root2 = document.querySelector("#app") || document.body;
  root2.textContent = "\u5F53\u524D\u6D4F\u89C8\u5668\u7EC4\u4EF6\u7248\u672C\u8FC7\u65E7\uFF0C\u6682\u4E0D\u80FD\u5B89\u5168\u6253\u5F00\u672C\u673A\u6570\u636E\u3002Android \u8BF7\u66F4\u65B0 Android System WebView\uFF0CWindows \u8BF7\u66F4\u65B0 WebView2 \u540E\u91CD\u8BD5\u3002\u5DF2\u6709\u672C\u673A\u6570\u636E\u672A\u6E05\u9664\uFF0C\u8BF7\u52FF\u5378\u8F7D\u5E94\u7528\u6216\u6E05\u9664\u6570\u636E\u3002\u7F3A\u5C11\uFF1A" + missing.join("\u3001");
  root2.setAttribute("role", "alert");
} else {
  startOfflineUI();
  registerEvents3();
  window.addEventListener("haoduoyu:android-back", (event) => {
    const overlay = document.querySelector("#overlay");
    const popover2 = document.querySelector(".popover");
    if (overlay?.firstElementChild || popover2) {
      event.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    }
  });
  window.addEventListener("haoduoyu:local-draft-error", (event) => toast(event.detail.message, true));
  installLocalLifecycle({
    window,
    document,
    getRuntime: getLocalRuntime,
    getReadyRuntime: getOfflineRuntime,
    capture(detail) {
      const owner2 = todoOwner();
      for (const { field: field2, snapshot } of detail.editors()) {
        if (!["todo-text", "todo-future-text"].includes(snapshot.id)) continue;
        const kind = snapshot.id === "todo-text" ? "todo" : "future";
        const date = kind === "todo" ? snapshot.form.dataset.date : "";
        detail.stage({
          field: field2,
          key: JSON.stringify([kind, owner2, date]),
          valid: () => todoOwner() === owner2 && (kind !== "todo" || validTodoDate(date)),
          apply: (raw) => {
            if (kind === "todo") inputTodo(raw);
            else inputUnscheduledTodo(raw);
          }
        });
      }
    },
    reportError: (error) => toast(error?.message || "\u672C\u673A\u4FDD\u5B58\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u4FDD\u7559\u8F93\u5165\u3002", true)
  });
  init();
}
