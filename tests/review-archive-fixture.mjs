import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

export async function archiveFixture(t, options = {}) {
  const app = await fixture(t, options);
  const session = await app.login();
  const owner = (await app.request('/api/v1/auth/me', {session})).data.id;
  const env = {DB: app.db, SITE_ORIGIN: app.origin, DAILY_NOTES_OWNER_ID: owner, PUBLIC_BUSINESS_MODE: '1'};

  async function request(path, {method = 'GET', body, auth = true, headers: extraHeaders, environment = env} = {}) {
    const headers = new Headers(extraHeaders);
    if (auth) {
      headers.set('Cookie', session.cookie);
      headers.set('X-CSRF-Token', session.csrfToken);
    }
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      headers.set('Origin', app.origin);
      headers.set('X-Public-Business', '1');
    }
    const response = await worker.fetch(new Request(`${app.origin}/api/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), environment);
    return {status: response.status, ...await response.json()};
  }

  const revision = async () => (await app.db.prepare('SELECT revision FROM matrix_control WHERE id=1').first()).revision;
  return {db: app.db, owner, session, env, request, revision, origin: app.origin};
}
