// Standalone composer journal. No account credentials, server data or transport.
// A memory view is only an editing cache: completion requires committed readback.
const FORMAT = 'haoduoyu-local-composer-v1';
const errorFor = cause => Object.assign(new Error('本机草稿尚未确认保存，请保留输入，不要关闭或清除数据。', {cause}),
  {code:'LOCAL_DRAFT_FAILURE', localNotSaved:true});
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T00:00:00Z')) &&
  new Date(date+'T00:00:00Z').toISOString().slice(0,10) === date;
export function createComposerJournal({db, scope, uuid = () => crypto.randomUUID(), onError = () => {}}) {
  if (!db?.transaction || typeof scope !== 'string' || !scope) throw new TypeError('Explicit durable draft scope required');
  const cache = new Map(), failures = new Map(), snapshots = new WeakSet(), requests = new WeakMap();
  let ready = false, tail = Promise.resolve();
  function key(kind, identity = '') {
    if (!(kind === 'todo' && validDate(identity) || kind === 'future' && identity === ''))
      throw new TypeError('Unknown local composer identity');
    return JSON.stringify([scope, FORMAT, kind, identity]);
  }
  function verify(row) {
    return row && row.format === FORMAT && row.scope === scope && typeof row.text === 'string' && row.text.length <= 262144 &&
      typeof row.writeId === 'string' && row.key === key(row.kind, row.identity);
  }
  async function initialize() {
    const rows = await db.transaction(['meta'], 'readonly', tx => tx.getAll('meta'));
    for (const row of rows) if (row.format === FORMAT && row.scope === scope) {
      if (!verify(row)) throw errorFor(new Error('Invalid composer record'));
      cache.set(row.key, row);
    }
    ready = true;
  }
  function read(kind, identity = '') {
    if (!ready) throw errorFor(new Error('Composer storage not initialized'));
    return cache.get(key(kind, identity))?.text || '';
  }
  function enqueue(row) {
    const work = tail.then(async () => {
      await db.transaction(['meta'], 'readwrite', tx => tx.put('meta', row));
      const actual = await db.transaction(['meta'], 'readonly', tx => tx.get('meta', row.key));
      if (JSON.stringify(actual) !== JSON.stringify(row)) throw new Error('Composer readback mismatch');
      // A later edit may still be in flight, but this revision is durably proven.
      failures.delete(row.key);
    }).catch(cause => {
      const error = errorFor(cause); failures.set(row.key, {writeId:row.writeId,error}); onError(error); throw error;
    });
    tail = work.catch(() => {}); work.catch(() => {});
    return work;
  }
  function set(kind, identity, text) {
    read(kind, identity);
    if (typeof text !== 'string' || text.length > 262144) throw errorFor(new Error('Composer text exceeds safe limit'));
    const id = key(kind, identity), current = cache.get(id);
    if (current?.text === text && !failures.has(id)) return tail;
    const revision = (current?.revision || 0) + 1;
    if (!Number.isSafeInteger(revision)) throw errorFor(new Error('Composer revision overflow'));
    const row = {key:id, format:FORMAT, scope, kind, identity, text, revision, writeId:uuid()+':'+revision};
    cache.set(id, row); return enqueue(row);
  }
  async function flush() {
    // Await the moving tail: another synchronous editor collector can enqueue work.
    let observed;
    do { observed = tail; await observed; } while (observed !== tail);
    if (failures.size) throw [...failures.values()][0].error;
    const expected = [...cache.values()];
    await db.transaction(['meta'], 'readonly', async tx => {
      for (const row of expected) if (JSON.stringify(await tx.get('meta', row.key)) !== JSON.stringify(row))
        throw errorFor(new Error('Composer verification mismatch'));
    });
  }
  function snapshot(kind, identity = '') {
    const id = key(kind, identity); read(kind, identity);
    const row = cache.get(id), value = Object.freeze({key:id, scope, kind, identity, text:row?.text || '', revision:row?.revision || 0, writeId:row?.writeId || null});
    snapshots.add(value); return value;
  }
  function requestSnapshot(request, kind, identity = '') {
    if (!request || typeof request !== 'object') throw errorFor(new Error('Missing create request identity'));
    const payload = JSON.stringify([kind,identity,request.id,request.date ?? null,request.text]);
    let saved = requests.get(request);
    if (!saved) { saved = {value:snapshot(kind,identity),payload}; requests.set(request,saved); }
    if (saved.payload !== payload) throw errorFor(new Error('Create request payload changed'));
    const {value} = saved;
    if (value.kind !== kind || value.identity !== identity || value.text.trim() !== request.text ||
        kind === 'todo' && identity !== request.date) throw errorFor(new Error('Create request differs from its original composer snapshot'));
    return value;
  }
  function matches(value) {
    if (!snapshots.has(value)) return false;
    const current = cache.get(value.key);
    return (current?.writeId || null) === value.writeId && (current?.text || '') === value.text;
  }
  function unchangedSince(value) {
    return snapshots.has(value) && (matches(value) || cache.get(value.key)?.writeId === 'consumed:'+value.writeId);
  }
  function wasConsumed(value) {
    // Only accept() after the item/receipt transaction has committed can create
    // this cache tombstone. A newer revision, even identical text, is not proof.
    const current = snapshots.has(value) && cache.get(value.key);
    return Boolean(current && value.writeId && current.text === '' && current.writeId === 'consumed:'+value.writeId);
  }
  function commitHook(value) {
    if (!snapshots.has(value)) throw errorFor(new Error('Unknown composer snapshot'));
    return async tx => {
      const current = await tx.get('meta', value.key);
      if ((current?.writeId || null) !== value.writeId || (current?.text || '') !== value.text) return;
      // This tombstone is committed in exactly the same transaction as the item.
      await tx.put('meta', {key:value.key, format:FORMAT, scope, kind:value.kind, identity:value.identity,
        text:'', revision:value.revision, writeId:'consumed:'+value.writeId});
    };
  }
  function accept(value) {
    if (!matches(value)) return false;
    cache.set(value.key, {key:value.key, format:FORMAT, scope, kind:value.kind, identity:value.identity,
      text:'', revision:value.revision, writeId:'consumed:'+value.writeId});
    return true;
  }
  function bind(object, property, kind, identity = '') {
    read(kind, identity);
    Object.defineProperty(object, property, {enumerable:true, configurable:true,
      get:() => read(kind, identity), set:text => { void set(kind, identity, text); }});
    return object;
  }
  return {initialize,read,set,flush,snapshot,requestSnapshot,matches,unchangedSince,wasConsumed,commitHook,accept,bind};
}
