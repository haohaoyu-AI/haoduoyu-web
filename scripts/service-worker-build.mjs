import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const shellAssetPaths = Object.freeze(['/', '/app.js', '/tokens.css', '/mobile.css', '/style.css',
  '/memos.css', '/glass.css', '/workbench.css', '/sw-update.css', '/favicon.svg', '/manifest.webmanifest']);
const START = '/* HAODUOYU_SHELL_START */';
const END = '/* HAODUOYU_SHELL_END */';
const PLACEHOLDER = '__HAODUOYU_SHELL_VERSION__';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = path => shellAssetPaths.includes(path) || /^\/[a-z0-9][a-z0-9._-]{0,99}\.css$/.test(path);

export function canonicalServiceWorkerSource(source) {
  assert.equal(source.split(START).length, 2, 'Exactly one SW configuration start marker is required');
  assert.equal(source.split(END).length, 2, 'Exactly one SW configuration end marker is required');
  const start = source.indexOf(START), end = source.indexOf(END);
  assert.ok(start < end, 'SW configuration markers must be ordered');
  return source.slice(0, start + START.length) + ' {} ' + source.slice(end);
}
export function canonicalShellIndex(source, paths = shellAssetPaths) {
  assert.ok(source.includes('</head>'), 'Shell index requires a head');
  assert.ok(paths.every(allowed), 'Only reviewed shell assets may be versioned');
  let index = source.replace(/<meta\b(?=[^>]*\bname=["']haoduoyu-shell-version["'])[^>]*>/gi, '')
    .replace(/^[ \t]*\r?\n/gm, '');
  if (!/<link\b(?=[^>]*\brel=["']manifest["'])/i.test(index))
    index = index.replace(/[ \t]*<\/head>/, '    <link rel="manifest" href="/manifest.webmanifest">\n  </head>');
  for (const tag of index.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href && new URL(href.replaceAll('&amp;', '&'), 'https://shell.invalid');
    assert.ok(url && url.origin === 'https://shell.invalid' && paths.includes(url.pathname),
      'Every linked stylesheet must be present in the reviewed shell assets');
  }
  index = index.replace(/\b(href|src)=(["'])(.*?)\2/g, (attribute, name, quote, raw) => {
    const url = new URL(raw.replaceAll('&amp;', '&'), 'https://shell.invalid');
    if (url.origin !== 'https://shell.invalid' || !paths.includes(url.pathname) || url.pathname === '/') return attribute;
    url.searchParams.set('__shell', PLACEHOLDER);
    return name + '=' + quote + (url.pathname + url.search + url.hash).replaceAll('&', '&amp;') + quote;
  });
  return index.replace(/[ \t]*<\/head>/, `    <meta name="haoduoyu-shell-version" content="${PLACEHOLDER}">\n  </head>`);
}
export function buildServiceWorkerAssets({indexHtml, swSource, assets}) {
  assert.ok(assets && typeof assets === 'object' && !Array.isArray(assets), 'Shell assets are a path-to-bytes object');
  const paths = ['/', ...Object.keys(assets).sort()];
  assert.equal(new Set(paths).size, paths.length, 'The index is supplied separately, never as an extra asset');
  assert.ok(paths.length <= 64 && paths.every(allowed), 'Unknown shell asset');
  assert.ok(shellAssetPaths.every(path => paths.includes(path)), 'Every shell CSS, script, manifest and favicon is required');
  for (const value of Object.values(assets))
    assert.ok(typeof value === 'string' || value instanceof Uint8Array, 'Shell assets must contain actual bytes');
  const worker = canonicalServiceWorkerSource(swSource), index = canonicalShellIndex(indexHtml, paths);
  const canonicalAssets = paths.map(url => ({url, sha256: sha256(url === '/' ? index : assets[url])}));
  const version = sha256(JSON.stringify({worker: sha256(worker), assets: canonicalAssets}));
  const finalIndex = index.replaceAll(PLACEHOLDER, version);
  const config = {version, assets: paths.map(url => ({url, sha256: sha256(url === '/' ? finalIndex : assets[url])}))};
  const finalWorker = worker.replace(START + ' {} ' + END, START + ' ' + JSON.stringify(config) + ' ' + END);
  return {version, indexHtml: finalIndex, swSource: finalWorker, config};
}
