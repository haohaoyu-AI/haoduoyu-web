import {icon} from '../core/dom.mjs';

export function renderWorkbenchSettings() {
  return `<section class="card workbench-settings"><h2>工作台设置</h2>
<p class="muted">整理内容与找回未保存的文字。</p><div class="workbench-setting-links">
<button class="btn" data-action="memo-tools" data-tool="trash">${icon('articles')}备忘录回收站</button>
<button class="btn text" data-action="memo-tools" data-tool="recovery">${icon('refresh')}找回未保存内容</button>
</div></section>`;
}
