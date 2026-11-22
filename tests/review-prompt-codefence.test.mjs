import test from 'node:test';
import assert from 'node:assert/strict';
import {playbookPromptBlocks, renderPromptPage, rulesIntroMarkdown} from '../web/pages/review-prompt-page.mjs';

test('playbookPromptBlocks keeps #### headings inside fenced code blocks without truncating', () => {
  const md = [
    '# 写作规则 v7',
    '',
    '#### B · 配图提示词（周版 2026-W45）',
    '- `PB3` 长文至少 25 张真实图；另加 1 张 AI 风格化海报。',
    '',
    '```',
    '【V字配图完整提示词】',
    '输出：article_img.docx；无需 render/、check.md 或 PASS。',
    '',
    '#### 初始提示一次讲清',
    '7. AI海报（横版 1536×1024，质量 high，只出1张）：',
    '   【每篇都变：风格（原 1 种保留 + 新增 5 种 = 共 6 种，和最近 2 张不同）】',
    '   - ① 复古版画海报风（原有保留）',
    '   - ② 现代财经杂志插画风（新增）',
    '   【每篇都变：场景与光影氛围（新增 8 种）】',
    '   【每篇都变：配色（原 5 套保留 + 新增 7 套 = 共 12 套）】',
    '   【每篇都变：构图（原 7 种保留 + 新增 5 种 = 共 12 种）】',
    '',
    '#### 本篇元数据（由拆分器按篇替换）',
    '- Title：title.txt 原文',
    '',
    '#### 完成后直接交付，不审核',
    '生成后直接排版交给导入环节。',
    '```',
    '',
    '#### C1 · 转移对话提示词 · V字',
    '请先加载并使用下面 3 个 skill。',
  ].join('\n');

  const blocks = playbookPromptBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].title, 'B · 配图提示词（周版 2026-W45）');
  assert.match(blocks[0].content, /#### 初始提示一次讲清/);
  assert.match(blocks[0].content, /7\. AI海报/);
  assert.match(blocks[0].content, /共 6 种/);
  assert.match(blocks[0].content, /共 12 套/);
  assert.match(blocks[0].content, /#### 本篇元数据/);
  assert.match(blocks[0].content, /#### 完成后直接交付，不审核/);
  assert.ok(blocks[0].content.endsWith('```'));

  assert.equal(blocks[1].title, 'C1 · 转移对话提示词 · V字');
  assert.equal(blocks[1].content, '请先加载并使用下面 3 个 skill。');
});

test('playbookPromptBlocks handles tilde fences and 4-backtick nested fences', () => {
  const md = [
    '#### 外层提示词',
    '````markdown',
    '```',
    '#### 内层不该切分',
    '```',
    '````',
    '~~~txt',
    '#### 波浪线代码块内不该切分',
    '~~~',
    '',
    '#### 下一个提示词',
    '正常内容',
  ].join('\n');

  const blocks = playbookPromptBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].title, '外层提示词');
  assert.match(blocks[0].content, /#### 内层不该切分/);
  assert.match(blocks[0].content, /#### 波浪线代码块内不该切分/);
  assert.equal(blocks[1].title, '下一个提示词');
  assert.equal(blocks[1].content, '正常内容');
});

test('inline backticks on a heading line do not trigger fence mode', () => {
  const md = [
    '#### 示例 `提示词` 卡片',
    '第一段 ```inline``` 说明',
    '#### 第二份提示词',
    '第二段内容',
  ].join('\n');

  const blocks = playbookPromptBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].title, '示例 `提示词` 卡片');
  assert.equal(blocks[1].title, '第二份提示词');
});

test('rulesIntroMarkdown ignores # and ## inside preface fences and stops outside', () => {
  const md = [
    '# 主标题',
    '导语说明',
    '```',
    '# 代码注释保留',
    '---',
    '## 假二级标题不截断',
    '```',
    '---',
    '## 第一部分',
    '正文规则',
  ].join('\n');

  const intro = rulesIntroMarkdown(md);
  assert.match(intro, /导语说明/);
  assert.match(intro, /# 代码注释保留/);
  assert.match(intro, /## 假二级标题不截断/);
  assert.doesNotMatch(intro, /第一部分/);
});

test('renderPromptPage renders the complete un-truncated prompt block in the card', () => {
  const html = renderPromptPage({
    prompts: [],
    playbooks: [{
      id: 'p1',
      account: 'V字',
      status: 'active',
      content_md: [
        '#### B · 配图提示词',
        '```',
        '#### 初始提示一次讲清',
        '7. AI海报：6 种风格与 12 套配色',
        '```',
      ].join('\n'),
    }],
  }, {account: 'V字'});
  assert.match(html, /7\. AI海报：6 种风格与 12 套配色/);
  assert.match(html, /共 <strong>1<\/strong> 份提示词/);
});
