'use client';

import ArticleListClear from '../../components/article-list-clear';
import { useCallback, useEffect, useRef, useState } from 'react';
import ClaudeConfig from '../../components/claude-config';
import StudioNav from '../../components/studio-nav';
import { mergeWritingItems, normalizeFlowItems, type WritingItem } from '../../components/writing-items';
import { focusPhase, writingFocusId, reconcileWritingFocus, readWritingFocus, saveWritingFocus, type WritingFocus } from '../../components/writing-focus';

const writingStates: Record<string, string> = {
  text_saved: '文字稿已保存，已完成',
  outline_pending: '待生成框架',
  outline_generating: '框架生成中',
  body_generating: '正文生成中',
  outline_review_pending: '待小鱼审核框架',
  approved: '框架通过，待正文',
  body_review_pending: '正文已存，待独立审改',
  revise: '框架需修改，本次已停止',
  blocked: '资料待补充，本次已停止',
  outline_failed: '框架未完成',
  body_failed: '正文未完成',
  finalized: '成稿已保存，已交给小鱼',
  handoff_pending: '成稿已保存，图文交接待恢复',
  handoff_running: '成稿已保存，图文交接中',
  handoff_unknown: '成稿已保存，交接状态待核验',
  state_unknown: '状态待核验',
  pending: '待选题',
  writing: '写作中',
  review_pending:'初稿已存，待独立审稿',
  rewrite_pending:'审稿已完成，待改稿',
  verify_pending:'改稿已完成，待独立复核',
  verified:'独立复核通过',
  review_failed:'审稿未通过',
  rewrite_failed:'改稿未完成',
  verification_failed:'复核未通过',
  verify_failed:'复核未完成',
  ready: '自动衔接待恢复',
  dispatching: '自动通知中',
  submitted: '已交给小鱼',
  failed: '未完成，待处理',
};

async function readResponse<T>(response: Response, fallback: string, validate: (body: Record<string, unknown>) => boolean): Promise<T> {
  if (response.status === 401) throw Object.assign(new Error('请使用本人 ChatGPT 账号登录'), { authRequired: true });
  if (response.status === 403) throw Object.assign(new Error('当前账号暂无访问权限，请核对本人账号'), { authRequired: true });
  const raw = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* Non-JSON error bodies use the friendly fallback. */ }
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    const safe = message && !/\n\s*at\s|\bBearer\s|-----BEGIN|SQLITE_|D1_ERROR/i.test(message)
      ? message.slice(0, 500)
      : fallback;
    throw new Error(safe);
  }
  if (!body || !validate(body)) throw new Error(fallback);
  return body as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function writerName(writer?: string | null) {
  if (writer === 'claude') return 'Claude';
  if (writer === 'gpt') return 'GPT';
  return '小鱼';
}

function runLabel(kind?: string | null) {
  if (kind?.startsWith('manual:')) return '手动双作者';
  if (kind === 'sample') return '试稿';
  if (kind === 'workflow_test') return '测试';
  if (kind === 'workflow_rewrite_v2') return 'V2 重写';
  return '';
}

function WritingArticle({ item }: { item: WritingItem }) {
  const paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs : [];
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const wordCount = paragraphs.join('').replace(/\s/g, '').length;
  const label = runLabel(item.run_kind);
  return <article>
    <div className="card-top">
      <h3>{item.title || '正在挑选今天的文娱话题'}</h3>
      <span className="badge" data-state={item.state}>{writingStates[focusPhase(item)] || '待核实'}</span>
    </div>
    <p className="metadata">
      {item.final_source==='agent_text'?`${writerName(item.writer)}初稿 · 独立agent修订`:writerName(item.writer)}{item.day ? ` · ${item.day}` : ''}{label ? ` · ${label}` : ''}{wordCount ? ` · ${wordCount} 字` : ''}
    </p>
    {item.error && <details className="writing-error"><summary>查看未完成原因</summary><p className="error card-error">{item.error}</p></details>}
    <div className="article-actions">
    {paragraphs.length > 0 && (
      <details className="article-preview">
        <summary>阅读全文</summary>
        <div className="article-body">{paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>
      </details>
    )}
    {sources.length > 0 && (
      <details className="sources">
        <summary>资料来源</summary>
        <div>{sources.map((source, sourceIndex) => (
          <p key={`${source.url}-${sourceIndex}`}>
            <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
            {source.published && <span className="source-date"> · {source.published}</span>}
          </p>
        ))}</div>
      </details>
    )}
      {item.task_id && <a className="action-link" href="/writing/outline-run">{focusPhase(item).startsWith('handoff_') ? '查看图文交接与恢复状态' : '查看框架与审核进度'}</a>}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      {paragraphs.length > 0 && item.output_mode !== 'text_only' && focusPhase(item) !== 'text_saved' && <a className="action-link" href="/">查看配图进度</a>}
      {item.output_mode !== 'text_only' && item.has_result && <a className="action-link" href={`/api/articles/${item.article_id}/download`}>下载 Word</a>}
    </div>
  </article>;
}

export default function Writing() {
  const [focus, setFocus] = useState<WritingFocus | null>(null);
  const focusRef = useRef<WritingFocus | null>(null);
  const focusRestored = useRef(false);
  const [items, setItems] = useState<WritingItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [flowError, setFlowError] = useState('');
  const previousFlow = useRef<WritingItem[]>([]);
  const [authRequired, setAuthRequired] = useState(false);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const pagesRef=useRef<number[]>([0]);
  const nextOffsetRef=useRef<number|null>(null);

  const load = useCallback(async (manual = false, replace = false, more = false) => {
    if (inFlight.current && !replace) return;
    if (replace) {
      controller.current?.abort();
      sequence.current += 1;
      inFlight.current = false;
    }
    inFlight.current = true;
    setReading(true);
    if (manual) setRefreshing(true);
    const requestId = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    try {
      const pages=more&&nextOffsetRef.current!==null?[...pagesRef.current,nextOffsetRef.current]:pagesRef.current;
      let data:{items:WritingItem[];prompt:string;prompt_version:string;next_offset?:number|null}={items:[],prompt:'',prompt_version:''};
      const allItems:WritingItem[]=[];
      for(const offset of pages){
        const response=await fetch(offset?`/api/writing?work_offset=${offset}`:'/api/writing',{cache:'no-store',signal:abort.signal});
        data=await readResponse<typeof data>(response,'暂时无法读取文章',body=>typeof body.prompt==='string'&&typeof body.prompt_version==='string'&&Array.isArray(body.items)&&body.items.every(item=>!!item&&typeof item==='object'&&typeof item.state==='string'&&Array.isArray(item.paragraphs)&&Array.isArray(item.sources)));
        allItems.push(...data.items);
      }
      data.items=[...new Map(allItems.map(item=>[writingFocusId(item)||item.article_id,item])).values()];
      let flowItems = previousFlow.current;
      let flowMessage = '';
      try {
        const flowResponse = await fetch('/api/writing/outline-flow', { cache: 'no-store', signal: abort.signal });
        const flow = await readResponse<{ items: unknown[] }>(flowResponse, '暂时无法读取框架流程', body => Array.isArray(body.items));
        flowItems = normalizeFlowItems(flow.items);
      } catch (error) {
        if (abort.signal.aborted) throw error;
        if (error && typeof error === 'object' && 'authRequired' in error) throw error;
        flowMessage = '框架流程暂时无法更新；请刷新核对';
      }
      const recentIds=new Set(data.items.filter(item=>item.list_section==='recent').map(item=>item.article_id));
      const combined = mergeWritingItems(data.items, flowItems.filter(item=>item.list_section!=='recent'||recentIds.has(item.article_id)));
      if (requestId === sequence.current) {
        pagesRef.current=pages;nextOffsetRef.current=typeof data.next_offset==='number'?data.next_offset:null;setNextOffset(nextOffsetRef.current);
        previousFlow.current = flowItems;
        setFlowError(flowMessage);
        if (!focusRestored.current) {
          try { focusRef.current = readWritingFocus(window.sessionStorage); } catch { /* Browser storage is optional. */ }
          focusRestored.current = true;
        }
        let startedTask = '';
        try { startedTask = window.sessionStorage.getItem('writing-studio-started-task') || ''; } catch { /* Browser storage is optional. */ }
        const nextFocus = reconcileWritingFocus(focusRef.current, combined, startedTask ? [startedTask] : []);
        if (startedTask && combined.some(item => writingFocusId(item) === startedTask)) {
          try { window.sessionStorage.removeItem('writing-studio-started-task'); } catch { /* Browser storage is optional. */ }
        }
        focusRef.current = nextFocus;
        setFocus(nextFocus);
        try { saveWritingFocus(window.sessionStorage, nextFocus); } catch { /* Browser storage is optional. */ }
        setItems(combined);
        setPrompt(data.prompt);
        setPromptVersion(data.prompt_version);
        setLoadError('');
        setAuthRequired(false);
      }
    } catch (error: unknown) {
      if (abort.signal.aborted || requestId !== sequence.current) return;
      setLoadError(errorMessage(error, '暂时无法读取文章'));
      const needsAuth = !!(error && typeof error === 'object' && 'authRequired' in error && error.authRequired);
      setAuthRequired(needsAuth);
      if (needsAuth) {
        focusRef.current = null;
        previousFlow.current = [];
        setFlowError('');
        try { window.sessionStorage.removeItem('writing-studio-started-task'); } catch { /* Browser storage is optional. */ }
        setFocus(null);
        try { saveWritingFocus(window.sessionStorage, null); } catch { /* Browser storage is optional. */ }
        setItems([]);
        setPrompt('');
        setPromptVersion('');
      }
    } finally {
      if (requestId === sequence.current) {
        inFlight.current = false;
        setReading(false);
        setRefreshing(false);
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(); }, 15000);
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      previousFlow.current = [];
      focusRef.current = null;
      focusRestored.current = false;
      setFocus(null);
      setFlowError('');
      setItems([]);
      setPrompt('');
      setPromptVersion('');
      setLoadError('');
      setAuthRequired(false);
      setLoaded(false);
      void load(false, true);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.removeEventListener('pageshow', handlePageShow);
      sequence.current += 1;
      controller.current?.abort();
      inFlight.current = false;
    };
  }, [load]);

  function toggleCurrent(id: string, open: boolean) {
    const before = focusRef.current;
    if (!before?.current[id] || before.current[id].open === open) return;
    const next = { ...before, current: { ...before.current, [id]: { ...before.current[id], open } } };
    focusRef.current = next;
    setFocus(next);
    try { saveWritingFocus(window.sessionStorage, next); } catch { /* Browser storage is optional. */ }
  }
  const recentItems = items.filter(item => item.list_section === 'recent');
  const workItems = items.filter(item => item.list_section !== 'recent' && !(writingFocusId(item) && focus?.current[writingFocusId(item)!]));
  function cleared(ids: string[]) {
    previousFlow.current=previousFlow.current.filter(item=>!ids.includes(item.article_id||''));
    setItems(previous=>previous.filter(item=>!ids.includes(item.article_id||'')));
    pagesRef.current=[0];nextOffsetRef.current=null;setNextOffset(null);
    void load(true,true);
  }
  const currentItems = items.filter(item => writingFocusId(item) && focus?.current[writingFocusId(item)!]);

  return (
    <main className="studio-main writing-page">
      <StudioNav current="writing" />

      <div className="topics-heading">
        <div>
          <h2>写作台</h2>
          <p className="section-hint">专注本次写作</p>
        </div>
        <div className="heading-actions">
        <a className="primary-link" href="/writing/editorial-run">查看自动写作进度</a>
        <a className="action-link" href="/writing/outline-run">查看旧框架批次</a>
        <button className="secondary" type="button" onClick={() => void load(true)} disabled={refreshing || reading}>
          {refreshing ? '刷新中…' : reading ? '读取中…' : '刷新'}
        </button>
        </div>
      </div>

      {loadError && (
        <div className="error" role="alert">
          <p>{loadError}{items.length ? '；已保留此前读取的文章，状态尚未更新' : ''}</p>
          {authRequired && <a href="/signin-with-chatgpt?return_to=%2Fwriting" target="_top">使用本人账号登录</a>}
        </div>
      )}
      {flowError && <p className="error" role="status">{flowError}</p>}
      {!loaded && <p className="section-hint" role="status">正在读取…</p>}

      {currentItems.length > 0 && <section className="writing-current" aria-label="本次写作">
        {currentItems.map(item => {
          const id = writingFocusId(item)!;
          const phase = focusPhase(item);
          return <details key={id} className="writing-fold writing-current-item" open={focus!.current[id].open}
            onToggle={event => toggleCurrent(id, event.currentTarget.open)}>
            <summary><span className="writing-focus-title">本次 · {item.title || `${writerName(item.writer)}正在选题`}</span>
              <span className="writing-focus-status" data-failed={['failed', 'blocked', 'revise', 'handoff_pending', 'handoff_unknown', 'state_unknown'].includes(phase) || phase.endsWith('_failed')} role="status">{writingStates[phase] || '待核实'}</span>
            </summary>
            <WritingArticle item={item} />
          </details>;
        })}
      </section>}

      {workItems.length>0&&<section aria-label="正在执行与等待处理" className="writing-work"><h3>正在执行与等待处理</h3><p className="section-hint">此区不参与清空</p><ul className="article-list">{workItems.map((item,index)=><li key={writingFocusId(item)||index} className="article-card"><WritingArticle item={item}/></li>)}</ul>{nextOffset!==null&&<button className="secondary" type="button" disabled={reading} onClick={()=>void load(true,false,true)}>加载更多待处理写作</button>}</section>}
      {nextOffset!==null&&workItems.length===0&&<button className="secondary" type="button" disabled={reading} onClick={()=>void load(true,false,true)}>加载更多待处理写作</button>}
      <details className="writing-fold writing-history">
        <summary>最近文章<span className="section-hint">非执行 · 最新 5 篇</span></summary>
        <ArticleListClear scope="writing" articleIds={[...new Set(recentItems.map(item=>item.article_id).filter((id):id is string=>!!id))].slice(0,5)} disabled={!loaded||reading||!!loadError||!!flowError} onDeleted={cleared}/>
        {recentItems.length ? <ul className="article-list">
          {recentItems.filter(item=>!(writingFocusId(item) && focus?.current[writingFocusId(item)!])).slice(0, 5).map((item, index) => <li key={writingFocusId(item) || `${item.day}-${item.writer}-${index}`} className="article-card"><WritingArticle item={item} /></li>)}
        </ul> : loaded && !loadError ? <p className="section-hint">文章生成后会显示在这里</p> : null}
        <p><a className="action-link" href="/writing/manual-run">查看原手动双作者批次</a></p>
      </details>

      <section className="settings-section" aria-label="低频设置">
        {!authRequired && <ClaudeConfig />}
        <details className="style-prompt">
          <summary>写作提示词{promptVersion ? ` · ${promptVersion}` : ''}</summary>
          <p>固定三项：精简写作风格、孙杨肖战文笔范文、Word文字排版。每篇先从热榜选题、核验资料并编好框架，再写文。</p>
          <pre>{prompt}</pre>
        </details>
      </section>
    </main>
  );
}
