// Pure local configuration: never contacts Cloudflare or provisions resources.
import assert from 'node:assert/strict';

export function cloudflareConfig(runtime, env = {}) {
  const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_D1_DATABASE_NAME', 'CLOUDFLARE_SITE_ORIGIN'];
  const supplied = keys.filter(key => env[key]);
  const configured = supplied.length === keys.length;
  assert.ok(supplied.length === 0 || configured, 'Cloudflare configuration requires all four documented values');
  const name = env.CLOUDFLARE_WORKER_NAME || 'haoduoyu-matrix';
  assert.match(name, /^[a-z0-9][a-z0-9-]{0,62}$/);
  if (configured) {
    assert.match(env.CLOUDFLARE_ACCOUNT_ID, /^[a-f0-9]{32}$/);
    assert.match(env.CLOUDFLARE_D1_DATABASE_ID, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    assert.match(env.CLOUDFLARE_D1_DATABASE_NAME, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
    const origin = new URL(env.CLOUDFLARE_SITE_ORIGIN);
    assert.equal(origin.protocol, 'https:');
    assert.equal(origin.origin, env.CLOUDFLARE_SITE_ORIGIN);
  }
  const publicVars = {};
  if (env.PUBLIC_BUSINESS_MODE === '1') {
    assert.match(env.PUBLIC_BUSINESS_USER_ID || '', /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    const accounts = JSON.parse(env.PUBLIC_BUSINESS_ACCOUNT_IDS || 'null');
    assert.ok(Array.isArray(accounts) && accounts.length <= 50 && new Set(accounts).size === accounts.length);
    assert.ok(accounts.every(value => typeof value === 'string' && value.length > 0 && value.length <= 100));
    Object.assign(publicVars, {PUBLIC_BUSINESS_MODE: '1', PUBLIC_BUSINESS_USER_ID: env.PUBLIC_BUSINESS_USER_ID,
      PUBLIC_BUSINESS_ACCOUNT_IDS: JSON.stringify(accounts)});
  }
  return {
    configured,
    config: {
      name, main: 'index.js', ...runtime,
      account_id: configured ? env.CLOUDFLARE_ACCOUNT_ID : '<approved-account-id>',
      workers_dev: false, preview_urls: false,
      vars: {SITE_ORIGIN: configured ? env.CLOUDFLARE_SITE_ORIGIN : 'https://example.invalid', ...publicVars},
      d1_databases: [{binding: 'DB',
        database_name: configured ? env.CLOUDFLARE_D1_DATABASE_NAME : '<approved-database-name>',
        database_id: configured ? env.CLOUDFLARE_D1_DATABASE_ID : '<approved-database-id>',
        migrations_dir: './migrations'}],
    },
  };
}
