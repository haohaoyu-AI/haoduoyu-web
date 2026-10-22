import assert from 'node:assert/strict';

const native = Symbol('native statement');
export function countingDb(db, {before, after} = {}) {
  const entries = [];
  async function execute(sql, action) {
    const write = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
    const metadata = write && /^\s*UPDATE matrix_api_keys SET last_used_at\b/i.test(sql);
    const row = {sql, write, metadata, control: /\bmatrix_control\b/.test(sql)};
    await before?.(sql);
    entries.push(row);
    const result = await action();
    assert.equal(typeof result.meta?.rows_written, 'number', 'real D1 rows_written receipt required');
    Object.assign(row, {changes: write ? result.meta.changes : 0, rows_written: result.meta.rows_written, rows_read: result.meta.rows_read});
    await after?.(sql, result);
    return result;
  }
  function wrap(statement, sql) {
    return {
      [native]: statement, sql,
      bind(...values) {return wrap(statement.bind(...values), sql);},
      all: (...args) => execute(sql, () => statement.all(...args)),
      run: (...args) => execute(sql, () => statement.run(...args)),
      async first(column) {
        // Same SQL, all() instead of first() solely to retain the D1 receipt.
        const result = await execute(sql, () => statement.all());
        const first = result.results[0] ?? null;
        return column === undefined ? first : first?.[column] ?? null;
      },
    };
  }
  return {
    entries,
    prepare: sql => wrap(db.prepare(sql), sql),
    async batch(statements) {
      const rows = statements.map(statement => ({sql: statement.sql,
        write: /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(statement.sql),
        metadata: /^\s*UPDATE matrix_api_keys SET last_used_at\b/i.test(statement.sql),
        control: /\bmatrix_control\b/.test(statement.sql)}));
      entries.push(...rows);
      const results = await db.batch(statements.map(statement => statement[native]));
      results.forEach((result, i) => {
        assert.equal(typeof result.meta?.rows_written, 'number');
        Object.assign(rows[i], {changes: rows[i].write ? result.meta.changes : 0, rows_written: result.meta.rows_written, rows_read: result.meta.rows_read});
      });
      return results;
    },
    totals() {return {sql: entries.length, control: entries.filter(row => row.control).length,
      write_statements: entries.filter(row => row.write).length,
      business_control_writes: entries.filter(row => row.write && !row.metadata).length,
      metadata_writes: entries.filter(row => row.metadata).length,
      matched_changes: entries.filter(row => row.write).every(row => typeof row.changes === 'number')
        ? entries.filter(row => row.write).reduce((sum, row) => sum + row.changes, 0) : null,
      d1_rows_read: entries.every(row => typeof row.rows_read === 'number')
        ? entries.reduce((sum, row) => sum + row.rows_read, 0) : null,
      d1_rows_written: entries.every(row => typeof row.rows_written === 'number')
        ? entries.reduce((sum, row) => sum + row.rows_written, 0) : null};},
  };
}

export async function writableValues(db) {
  // Measurement bookends use the underlying DB, outside request SQL counts.
  const control = (await db.prepare('SELECT * FROM matrix_control ORDER BY id').all()).results;
  const keys = (await db.prepare('SELECT id,last_used_at FROM matrix_api_keys ORDER BY id').all()).results;
  return new Map([...control.map(row => ['control:' + row.id, JSON.stringify(row)]),
    ...keys.map(row => ['key:' + row.id, JSON.stringify(row)])]);
}
export function changedValues(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key)).length;
}
