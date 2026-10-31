export function todoMonthScopeTransition(snapshotOwner, nextOwner, previousReady, ready) {
  if (snapshotOwner !== nextOwner) return ready ? 'replace-and-load' : 'replace';
  if (previousReady === ready) return 'none';
  return ready ? 'resume' : 'pause';
}

export function todoMonthSeed(month, snapshot, loaded) {
  const days = {};
  if (snapshot?.days) {
    const last = new Date(`${month}-01T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    for (let i = 1; i <= last.getUTCDate(); i++) {
      const date = `${month}-${String(i).padStart(2, '0')}`;
      days[date] = snapshot.days[date] || [];
    }
  }
  for (const day of loaded) {
    if (!snapshot?.days || day.pending || day.readAt > snapshot.verified_at) days[day.date] = day.items;
  }
  return days;
}

// Each account/session owns its calendar cache. A cancelled month retains only
// completed reads and resumes missing dates when opened again.
export function createTodoMonthLoader({read, seed, active, changed = () => {}, now = Date.now}) {
  let owner = '', current = null, cooldown = 0;
  const monthDays = month => {
    const end = new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    return end.getUTCDate();
  };
  const months = new Map();
  function cancel(snapshot) {
    if (!snapshot?.controller) return;
    snapshot.controller.abort(); snapshot.controller = null; snapshot.loading = false;
  }
  function open(month, nextOwner) {
    if (owner !== nextOwner) {
      cancel(current); months.clear(); owner = nextOwner; current = null; cooldown = 0;
    }
    if (current?.month !== month) cancel(current);
    let snapshot = months.get(month);
    if (!snapshot) {
      snapshot = {month, owner, days: new Map(), fresh: new Set(), revisions: new Map(), expiresAt: 0, loading: false, error: '', retryAt: 0};
      months.set(month, snapshot);
    }
    current = snapshot;
    const count = monthDays(month), deadline = Math.max(snapshot.retryAt, cooldown);
    if (snapshot.fresh.size === count && now() < snapshot.expiresAt) snapshot.error = "";
    const expired = snapshot.fresh.size === count && now() >= snapshot.expiresAt;
    if (expired) snapshot.fresh.clear();
    if (!snapshot.loading && snapshot.fresh.size < count && now() < deadline && !snapshot.error)
      snapshot.error = '请求较多，请稍后重试。';
    if (!snapshot.loading && snapshot.fresh.size < count && now() >= deadline) {
      const controller = new AbortController();
      snapshot.controller = controller; snapshot.loading = true; snapshot.error = '';
      snapshot.promise = run(snapshot, controller, expired);
    }
    return snapshot;
  }
  async function run(snapshot, controller, expired) {
    const valid = () => snapshot.controller === controller && !controller.signal.aborted && active(snapshot.owner);
    const count = monthDays(snapshot.month);
    const dates = Array.from({length: count}, (_, i) => `${snapshot.month}-${String(i + 1).padStart(2, '0')}`);
    const revisions = new Map(snapshot.revisions);
    try {
      const initial = await seed(snapshot.month, snapshot.owner, {refresh: expired});
      if (!valid()) return;
      if (initial) for (const [date, items] of Object.entries(initial)) {
        if (dates.includes(date) && Array.isArray(items) && !snapshot.fresh.has(date) &&
            (snapshot.revisions.get(date) || 0) === (revisions.get(date) || 0)) {
          snapshot.days.set(date, items); snapshot.fresh.add(date);
        }
      }
      for (let start = 0; start < dates.length; start += 5) {
        const batch = dates.slice(start, start + 5).filter(date => !snapshot.fresh.has(date));
        if (!batch.length) continue;
        const context = {controller, pending: new Map()};
        const results = await Promise.allSettled(batch.map(async date => {
          const revision = revisions.get(date) || 0;
          const value = await read(date, context);
          if (!Array.isArray(value?.items)) throw new Error('月记录读取不完整，请重试');
          if (valid()) {
            if ((snapshot.revisions.get(date) || 0) === revision) snapshot.days.set(date, value.items);
            snapshot.fresh.add(date);
          }
          return value;
        }));
        if (!valid()) return;
        let failure;
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'rejected') {
            const error = result.reason || new Error('月记录读取失败，请重试');
            if (!failure || error?.status === 429 && (failure.status !== 429 ||
                (error.retryAfterMs || 60000) > (failure.retryAfterMs || 60000))) failure = error;
          }
        }
        if (failure) {
          if (failure.status === 429) {
            const deadline = Math.min(Number.MAX_SAFE_INTEGER - 1, now() + (failure.retryAfterMs || 60000));
            cooldown = Math.max(cooldown, deadline); snapshot.retryAt = Math.max(snapshot.retryAt, deadline);
          }
          snapshot.error = failure.message || '月记录读取失败，请重试';
          break;
        }
      }
      if (snapshot.fresh.size === count) snapshot.expiresAt = now() + 60000;
    } catch (error) {
      if (valid()) snapshot.error = error.message || '月记录读取失败，请重试';
    } finally {
      if (snapshot.controller === controller) {
        snapshot.controller = null; snapshot.loading = false;
        if (current === snapshot && active(snapshot.owner)) changed(snapshot);
      }
    }
  }
  function update(nextOwner, date, items) {
    if (owner !== nextOwner || !Array.isArray(items)) return false;
    const snapshot = months.get(date.slice(0, 7));
    if (!snapshot || JSON.stringify(snapshot.days.get(date)) === JSON.stringify(items)) return false;
    snapshot.days.set(date, items);
    snapshot.revisions.set(date, (snapshot.revisions.get(date) || 0) + 1);
    return true;
  }
  return {open, update, cancel: () => cancel(current)};
}
