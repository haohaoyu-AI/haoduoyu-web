import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
require.extensions['.css'] = (mod) => {
  mod.exports = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
};

function loadTsx(file) {
  const source = fs.readFileSync(file, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(javascript, file);
  return loaded.exports;
}

const { EaselTrendBoard } = loadTsx(path.resolve('components/topics/EaselTrendBoard.tsx'));
const pageSource = fs.readFileSync(path.resolve('app/topics/page.tsx'), 'utf8');
const boardSource = fs.readFileSync(path.resolve('components/topics/EaselTrendBoard.tsx'), 'utf8');
const cssSource = fs.readFileSync(path.resolve('components/topics/easel-trends.module.css'), 'utf8');
const loadPlatformStart = pageSource.indexOf('const loadPlatform = useCallback(');
const loadPlatformEnd = pageSource.indexOf('const loadHistory = useCallback(', loadPlatformStart);
assert.ok(loadPlatformStart >= 0 && loadPlatformEnd > loadPlatformStart, 'loadPlatform remains a separate callback');
const loadPlatformSource = pageSource.slice(loadPlatformStart, loadPlatformEnd);
assert.match(pageSource, /mergeEntertainmentBoards/, 'the page uses a merged entertainment view');
assert.match(loadPlatformSource, /\}, \[resetForAuth\]\);/, 'scope changes do not recreate the platform loader and restart the fetching effect');
assert.doesNotMatch(loadPlatformSource, /\bscopeFilter\b(?!Ref)/, 'platform loading reads the latest filter ref instead of capturing filter state');
assert.doesNotMatch(boardSource, /\b(fetch|localStorage|createIdea)\b/, 'the Easel-derived presentation component is read-only and has no fetching or persistence side effects');
assert.match(pageSource, /id=\{`topic-detail-\$\{suffix\}`\}/, 'cross-platform candidate details use unique instance-based DOM IDs');
assert.match(pageSource, /const boardPlatforms = \['toutiao', 'weibo'\]/, 'only the two requested sources are loaded');
assert.match(cssSource, /grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/, 'desktop uses the required three-column layout');
assert.match(cssSource, /@media \(max-width: 700px\)[\s\S]*?grid-template-columns: minmax\(0,1fr\)/, 'phone layouts collapse to one column');
assert.match(cssSource, /\.title\s*\{[^}]*white-space: normal/s, 'long titles can wrap without losing their text');
assert.match(cssSource, /\.hot\s*\{[^}]*white-space: nowrap/s, 'heat values cannot wrap into orphaned digits');
assert.match(cssSource, /\.hot\s*\{[^}]*color: var\(--muted\)/s, 'heat values use the shared secondary text color');
assert.match(cssSource, /\.rowItem\s*\{[^}]*border: 0/s, 'trend rows do not draw dividers');
assert.doesNotMatch(cssSource, /gradient\(|opacity: 0;/, 'no decorative gradients or hidden research entrances');
const makeRows = (total) => Array.from({ length: total }, (_, index) => ({
  row_id: `tt-${index + 1}`,
  title: index === 0 ? '置顶：超长中文标题用于验证单行标题依然保留完整全文' : `第 ${index} 条热榜标题 with a very long English continuation to test ellipsis`,
  rank: index === 0 ? null : index,
  metric: index === 0 ? '置顶' : index === 1 ? '12345678901234567890 次' : index === 2 ? '1234567' : null,
  url: index === 2 ? 'https://www.toutiao.com/trending/?topic=3' : null,
  label: index === 0 ? '置顶 · 热' : null,
}));

function markup({ expanded = false, total = 51, status = 'ok', copyEnabled = true } = {}) {
  const rows = makeRows(total);
  return renderToStaticMarkup(React.createElement(EaselTrendBoard, {
    id: 'board-toutiao', label: '今日头条', platformKey: 'toutiao', status,
    statusText: status === 'stale' ? '旧缓存' : status === 'not_implemented' ? '暂未接入' : status === 'error' ? '读取失败' : '已读取', metaText: '抓取 10/05 19:13',
    rows, expanded, refreshing: false, selectedRowId: 'tt-1',
    onRefresh() {}, onToggleExpanded() {}, onInspect() {}, onCopy() {},
    canCopy: () => copyEnabled, renderDetail: (row) => React.createElement('p', null, `研究详情：${row.title}`),
    error: status === 'stale' ? '此平台暂时无法读取；已有榜单保留。' : status === 'error' ? '此平台暂时无法读取。' : null,
  }));
}

const collapsed = markup();
assert.equal((collapsed.match(/<li\b/g) ?? []).length, 15, 'each board initially renders only 15 rows');
assert.match(collapsed, /查看更多（共 51 条）/);
assert.match(collapsed, /aria-controls="board-toutiao-rows"/);
assert.match(collapsed, /置顶/);
assert.match(collapsed, /12345678901234567890 次/);
assert.match(collapsed, /1234567/);
assert.match(collapsed, /https:\/\/www\.toutiao\.com\/trending/);
assert.match(collapsed, /<a[^>]+target="_blank"[^>]+rel="noreferrer"/);
assert.match(collapsed, /<button[^>]+aria-label="查看「置顶：超长中文标题/);
assert.match(collapsed, /复制「置顶：超长中文标题/);
assert.match(collapsed, /hidden=""/);

const expanded = markup({ expanded: true });
assert.equal((expanded.match(/<li\b/g) ?? []).length, 51, 'expanded official Toutiao fixture keeps every already-read row visible');
assert.match(expanded, /第 50 条热榜标题/);
assert.match(expanded, /榜位 50/);
assert.match(expanded, /收起为前 15 条/);

const stale = markup({ status: 'stale' });
assert.match(stale, /旧缓存 · 抓取 10\/05 19:13/);
assert.match(stale, /已有榜单保留/);
const noCandidate = markup({ total: 1, copyEnabled: false });
assert.doesNotMatch(noCandidate, /aria-label="展开并复制/);
assert.match(noCandidate, /class="copySpacer"/);
const failedEmptyBoard = markup({ total: 0, status: 'error' });
assert.match(failedEmptyBoard, /此平台暂时无法读取/);
assert.doesNotMatch(failedEmptyBoard, /原榜状态仍保留/);
const unsupportedEmptyBoard = markup({ total: 0, status: 'not_implemented' });
assert.match(unsupportedEmptyBoard, /暂未接入/);
assert.doesNotMatch(unsupportedEmptyBoard, /原榜状态仍保留/);

console.log('topics-ui fixtures passed: 15-row default, 51-row expansion, pinned rank, source links, hot values and no dead copy actions');
