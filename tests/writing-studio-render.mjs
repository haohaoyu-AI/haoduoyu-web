// Run with: node --import tsx tests/writing-studio-render.mjs
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Writing from '../app/writing/page.tsx';
const html = renderToStaticMarkup(React.createElement(Writing));
assert.match(html, /<h2>写作台<\/h2>/);
assert.match(html, /href="\/writing\/outline-run"/);
assert.match(html, /<details class="writing-fold writing-history"><summary>最近文章/);
assert.doesNotMatch(html, /<details[^>]*\sopen(?:[ =]|>)/);
assert.doesNotMatch(html, /aria-label="本次写作"/);
assert.match(html, /<summary>写作提示词/);
assert.match(html, /<summary[^>]*>[\s\S]*Claude/);
assert.match(html, /aria-current="page">写作台/);
assert.doesNotMatch(html, /日更 · 08:00 北京时间/);
console.log('PASS: actual component SSR starts with native collapsed history/config/prompt, no fake current task, correct navigation and no implied resumed schedule.');
