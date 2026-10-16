'use client';

import ArticleListClear from '../components/article-list-clear';
import ArticleContentClear from '../components/article-content-clear';
import WordStageProgress, {mergeWordProgress} from '../components/word-stage-progress';
import type {WordProgress} from '../lib/word-progress-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import StudioNav from '../components/studio-nav';
import type {UploadProgress} from '../components/upload-progress';
import { publishComplete, publishStatus, platformProgress, articleHandlingSummary, safeDiagnosticText, safeDraftLink, safeRecordId, reconcilePublishFocus, readPublishFocus, savePublishFocus, type PublishFocus, type DraftDelivery } from '../components/publish-focus';

type Delivery = DraftDelivery;
type Article = {
  id: string;
  title: string;
  filename?: string | null;
  created?: string | null;
  state: string;
  error?: string | null;
  draft_url?: string | null;
  toutiao_verified_readback?: boolean | number;
  has_result?: boolean;
  generated?: boolean;
  output_mode?: string | null;
  deletion_supported?: boolean;
  list_section?: 'work' | 'recent';
  deliveries?: Delivery[];
  upload_progress?: UploadProgress[];
  word_progress?: WordProgress | null;
  word_progress_unavailable?: boolean;
  word_progress_deferred?: boolean;
  notification_state?: string | null;
  recovery?: { unfinished: boolean; can_notify: boolean; can_retry?: boolean; waiting_for_executor?: boolean; lease_expires: string | null };
};

const deliveryStates: Record<string, string> = {
  pending: '待处理',
  saving: '保存中',
  saved: '草稿已保存',
  needs_login: '需要登录',
  needs_verification: '待核验',
  failed: '未完成',
};
const activeStates = ['queued', 'processing', 'word_ready', 'toutiao_saving'];
const articleDisplayStates=['uploaded','queued','processing','word_ready','toutiao_saving','completed','failed','needs_login','needs_verification','deleting','text_saved'];
class DisplayError extends Error {}

async function readResponse<T>(response: Response, fallback: string, validate: (body: Record<string, unknown>) => boolean): Promise<T> {
  if (response.status === 401) throw Object.assign(new DisplayError('请使用本人 ChatGPT 账号登录'), { authRequired: true });
  if (response.status === 403) throw Object.assign(new DisplayError('当前账号暂无访问权限，请核对本人账号'), { authRequired: true });
  const raw = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* Non-JSON error bodies are handled with a friendly fallback. */ }
  if (!response.ok) throw new DisplayError(fallback);
  if (!body || !validate(body)) throw new DisplayError(fallback);
  return body as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof DisplayError ? error.message : fallback;
}

function beijingDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function platformName(platform: string) {
  if (platform === 'toutiao') return '头条';
  if (platform === 'zhihu') return '知乎';
  if (platform === 'baijiahao') return '百家号';
  return '其他平台';
}

export default function Home() {
  const [items, setItems] = useState<Article[]>([]);
  const [focus, setFocus] = useState<PublishFocus | null>(null);
  const focusRef = useRef<PublishFocus | null>(null);
  const focusRestored = useRef(false);
  const requestedSummaryFocus = useRef<string | null>(null);
  const [actionBusy, setActionBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState('');
  const [networkOffline,setNetworkOffline]=useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteIdInput, setDeleteIdInput] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState('');
  const [fileName, setFileName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const sequence = useRef(0);
  const readLock = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const [reading, setReading] = useState(false);
  const [pendingTotal, setPendingTotal] = useState<number|null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const nextOffsetRef = useRef<number | null>(null);
  const pagesRef = useRef<number[]>([0]);
  const itemsRef = useRef(items); itemsRef.current = items;
  const progressEpoch = useRef(0);
  const progressQueue = useRef<string[]>([]);
  const progressQueued = useRef(new Set<string>());
  const progressReads = useRef(new Map<string,AbortController>());
  const progressReadAt = useRef(new Map<string,number>());
  const progressMounted = useRef(true);
  const [progressReading,setProgressReading] = useState(new Set<string>());
  const resetProgressReads = useCallback((updateState=true) => {
    progressEpoch.current++;
    for(const controller of progressReads.current.values())controller.abort();
    progressReads.current.clear();progressQueue.current=[];progressQueued.current.clear();progressReadAt.current.clear();
    if(updateState)setProgressReading(new Set());
  },[]);
  const readArticleProgress = useCallback((id:string,force=false) => {
    const eligible=(article:Article|undefined)=>!!article&&article.state!=='deleting'&&article.output_mode!=='text_only';
    if(!progressMounted.current||!eligible(itemsRef.current.find(article=>article.id===id))||progressQueued.current.has(id)||progressReads.current.has(id))return;
    if(!force&&Date.now()-(progressReadAt.current.get(id)||0)<8000)return;
    progressQueue.current.push(id);progressQueued.current.add(id);
    const syncReading=()=>setProgressReading(new Set([...progressQueued.current,...progressReads.current.keys()]));
    function pump(){
      while(progressReads.current.size<2&&progressQueue.current.length){
        const nextId=progressQueue.current.shift()!;progressQueued.current.delete(nextId);
        if(!eligible(itemsRef.current.find(article=>article.id===nextId)))continue;
        const controller=new AbortController(),epoch=progressEpoch.current,progressAtDispatch=itemsRef.current.find(article=>article.id===nextId)?.word_progress||null,inputAtDispatch=progressAtDispatch?.input_sha256||null;
        const advancedSinceDispatch=(prior:WordProgress|null|undefined)=>!!prior&&(!progressAtDispatch||prior.input_sha256!==inputAtDispatch||(prior.attempt?.attempt_id||null)!==(progressAtDispatch.attempt?.attempt_id||null)||(prior.attempt?.generation||0)!==(progressAtDispatch.attempt?.generation||0)||prior.version>progressAtDispatch.version||Date.parse(prior.read_at)>Date.parse(progressAtDispatch.read_at));
        progressReads.current.set(nextId,controller);progressReadAt.current.set(nextId,Date.now());
        void (async()=>{
          try{
            const response=await fetch(`/api/articles/${encodeURIComponent(nextId)}/word-progress`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
            const body=await readResponse<{article_id:string;output_mode:string|null;word_progress:WordProgress|null;word_progress_unavailable:false}>(response,'暂时无法读取 Word 进度',value=>{
              if(value.article_id!==nextId||value.word_progress_unavailable!==false)return false;
              if(value.output_mode==='text_only')return value.word_progress===null;
              const p=value.word_progress as WordProgress|undefined;
              return value.output_mode===null&&!!p&&p.contract_version===1&&p.target_kind==='article'&&p.target_id===nextId&&typeof p.input_sha256==='string'&&typeof p.version==='number'&&Number.isFinite(Date.parse(p.read_at))&&Array.isArray(p.steps)&&p.steps.length===6;
            });
            if(controller.signal.aborted||epoch!==progressEpoch.current||!progressMounted.current)return;
            setItems(previous=>previous.map(article=>{
              if(article.id!==nextId||!eligible(article))return article;
              const prior=article.word_progress,next=body.word_progress;
              if(!next&&advancedSinceDispatch(prior))return article;
              if(prior&&next&&prior.input_sha256!==inputAtDispatch&&prior.input_sha256!==next.input_sha256)return article;
              if(prior&&next&&prior.input_sha256!==next.input_sha256&&Date.parse(next.read_at)<=Date.parse(prior.read_at))return article;
              const progress=prior&&next&&prior.input_sha256===next.input_sha256?mergeWordProgress(prior,next):next;
              return {...article,output_mode:body.output_mode,word_progress:progress,word_progress_unavailable:false,word_progress_deferred:false};
            }));
          }catch(error){
            if(controller.signal.aborted||epoch!==progressEpoch.current||!progressMounted.current)return;
            const needsAuth=!!(error&&typeof error==='object'&&'authRequired' in error&&error.authRequired);
            if(needsAuth){
              resetProgressReads();readController.current?.abort();sequence.current++;readLock.current=false;
              itemsRef.current=[];setItems([]);setConnected(null);setAuthRequired(true);setLoadError(errorMessage(error,'请使用本人账号登录'));setReading(false);setRefreshing(false);
              focusRef.current=null;setFocus(null);requestedSummaryFocus.current=null;
              try{savePublishFocus(window.sessionStorage,null);}catch{/* Storage is optional. */}
              pagesRef.current=[0];nextOffsetRef.current=null;setNextOffset(null);setPendingTotal(0);
              return;
            }
            setItems(previous=>previous.map(article=>{
              if(article.id!==nextId)return article;
              const prior=article.word_progress;
              if(advancedSinceDispatch(prior))return article;
              return {...article,word_progress_unavailable:true,word_progress_deferred:false};
            }));
          }finally{
            if(progressReads.current.get(nextId)===controller)progressReads.current.delete(nextId);
            if(epoch===progressEpoch.current&&progressMounted.current){pump();syncReading();}
          }
        })();
      }
      syncReading();
    }
    pump();
  },[resetProgressReads]);
  useEffect(()=>{
    progressMounted.current=true;
    return()=>{progressMounted.current=false;resetProgressReads(false);};
  },[resetProgressReads]);
  useEffect(()=>{
    if(networkOffline||authRequired||loadError)return;
    // Business processing status prioritizes a read, never proves an execution grant.
    for(const article of items)if(article.state==='processing'&&article.output_mode!=='text_only'&&(article.word_progress_deferred||article.word_progress_unavailable||!article.word_progress))readArticleProgress(article.id);
  },[items,networkOffline,authRequired,loadError,readArticleProgress]);

  const load = useCallback(async (manual = false, more = false) => {
    if (readLock.current) return;
    readLock.current = true;
    setReading(true);
    const seq = ++sequence.current;
    const abort = new AbortController();
    readController.current = abort;
    if (manual) {
      progressReadAt.current.clear();
      setRefreshing(true);
      setUploadFeedback('');
    }
    try {
      const pages=more&&nextOffsetRef.current!==null?[...pagesRef.current,nextOffsetRef.current]:pagesRef.current;
      const merged=new Map<string,Article>();
      let data:{items:Article[];connected:boolean;pending_total?:number;next_offset?:number|null}={items:[],connected:false};
      for(const offset of pages){
      const response = await fetch(offset?`/api/articles?pending_offset=${offset}`:'/api/articles', { cache: 'no-store', signal: AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]) });
      data = await readResponse<typeof data>(response, '暂时无法读取文章', body =>
        typeof body.connected === 'boolean' && Array.isArray(body.items) && body.items.every(item =>
          !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.state === 'string'
        )
      );
      for(const item of data.items)merged.set(item.id,item);
      }
      data.items=[...merged.values()];
      if (seq === sequence.current) {
        pagesRef.current=pages;
        nextOffsetRef.current=typeof data.next_offset==='number'?data.next_offset:null;
        setNextOffset(nextOffsetRef.current);
        setPendingTotal(typeof data.pending_total==='number'&&Number.isSafeInteger(data.pending_total)&&data.pending_total>=0?data.pending_total:null);
        if (!focusRestored.current) {
          try { focusRef.current = readPublishFocus(window.sessionStorage); } catch { /* Storage is optional. */ }
          focusRestored.current = true;
        }
        const nextFocus = reconcilePublishFocus(focusRef.current, data.items);
        focusRef.current = nextFocus;
        setFocus(nextFocus);
        try { savePublishFocus(window.sessionStorage, nextFocus); } catch { /* Storage is optional. */ }
        setItems(previous=>{const prior=new Map(previous.map(item=>[item.id,item]));return data.items.map(item=>{
          const previousItem=prior.get(item.id),before=previousItem?.word_progress,next=item.word_progress;
          if((item.word_progress_unavailable||item.word_progress_deferred)&&!next)return {...item,word_progress:before||null,word_progress_unavailable:item.word_progress_deferred?!!previousItem?.word_progress_unavailable:!!item.word_progress_unavailable};
          return before&&next&&before.input_sha256===next.input_sha256?{...item,word_progress:mergeWordProgress(before,next)}:item;
        });});
        setConnected(data.connected);
        setLoadError('');
        setAuthRequired(false);
        setLoaded(true);
        if (manual) setUploadFeedback('已刷新');
      }
    } catch (error: unknown) {
      if (abort.signal.aborted || seq !== sequence.current) return;
      if (seq === sequence.current) {
        setConnected(null);
        setLoadError(errorMessage(error, '暂时无法读取文章'));
        const needsAuth = !!(error && typeof error === 'object' && 'authRequired' in error && error.authRequired);
        setAuthRequired(needsAuth);
        if (needsAuth) {
          resetProgressReads();itemsRef.current=[];
          requestedSummaryFocus.current = null;
          focusRef.current = null;
          setFocus(null);
          try { savePublishFocus(window.sessionStorage, null); } catch { /* Storage is optional. */ }
          setItems([]);
          setConnected(null);
          setUploadFeedback('');
          setFileName('');
          pagesRef.current=[0];
          nextOffsetRef.current=null;
          setNextOffset(null);
          setPendingTotal(0);
          if (file.current) file.current.value = '';
        }
        setLoaded(true);
      }
    } finally {
      if (seq === sequence.current) {
        readLock.current = false;
        setReading(false);
        if (manual) setRefreshing(false);
      }
    }
  }, [resetProgressReads]);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      requestedSummaryFocus.current = null;
      focusRef.current = null;
      focusRestored.current = false;
      setFocus(null);
      readController.current?.abort();
      resetProgressReads();itemsRef.current=[];
      sequence.current += 1;
      readLock.current = false;
      setItems([]);
      setConnected(null);
      setLoadError('');
      setAuthRequired(false);
      setUploadFeedback('');
      setPendingDelete(null);
      setDeleteIdInput('');
      setDeleteAcknowledged(false);
      setDeleteFeedback('');
      setFileName('');
      setReading(false);
      setRefreshing(false);
      setLoaded(false);
      if (file.current) file.current.value = '';
      void load();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pageshow', handlePageShow);
      readController.current?.abort();
      sequence.current += 1;
      readLock.current = false;
    };
  }, [load,resetProgressReads]);
  const running = items.some(article => activeStates.includes(article.state) || (article.recovery?.unfinished&&['sending','delivered'].includes(article.notification_state||'')) || (article.deliveries || []).some(delivery => ['pending', 'saving', 'needs_verification'].includes(delivery.state)));
  useEffect(()=>{const offline=()=>setNetworkOffline(true),online=()=>{setNetworkOffline(false);void load();};setNetworkOffline(!navigator.onLine);window.addEventListener('offline',offline);window.addEventListener('online',online);return()=>{window.removeEventListener('offline',offline);window.removeEventListener('online',online);};},[load]);
  useEffect(() => {
    const id = window.setInterval(() => { void load(); }, running ? 8000 : 15000);
    return () => window.clearInterval(id);
  }, [running, load]);

  async function upload() {
    const chosen = file.current?.files?.[0];
    if (!chosen) { setUploadFeedback('请选择文章'); return; }
    if (lock.current) return;
    lock.current = true;
    setActionBusy('upload');
    setUploadFeedback('正在上传…');
    let responseReceived = false;
    let successStatus = false;
    try {
      const form = new FormData();
      form.append('article', chosen);
      const response = await fetch('/api/articles', { method: 'POST', headers: { 'x-xiaoyu-upload': '1' }, body: form,signal:AbortSignal.timeout(120000) });
      responseReceived = true;
      successStatus = response.ok;
      const uploaded = await readResponse<{ id: string }>(response, '上传未完成', body => typeof body.id === 'string' && body.id.length > 0);
      if (file.current) file.current.value = '';
      setFileName('');
      setUploadFeedback('文章已上传');
      activateArticle(uploaded.id);
      await load();
    } catch (error: unknown) {
      if (!responseReceived || successStatus) {
        await load();
        setUploadFeedback('上传结果待核实，请先查看文章列表再重试');
      } else {
        setUploadFeedback(errorMessage(error, '上传未完成'));
      }
    } finally {
      lock.current = false;
      setActionBusy('');
    }
  }

  async function submit(id: string, retry: boolean) {
    if (lock.current) return;
    lock.current = true;
    setActionBusy(id);
    activateArticle(id);
    setUploadFeedback(retry ? '正在重试通知…' : '正在交给小鱼…');
    let responseReceived = false;
    let successStatus = false;
    try {
      const response = await fetch(`/api/articles/${id}/submit`, { method: 'POST', headers: { 'x-xiaoyu-upload': '1' },signal:AbortSignal.timeout(45000) });
      responseReceived = true;
      successStatus = response.ok;
      const data = await readResponse<{ id: string; state: string; notification?: {state:string} }>(response, '提交未完成，请先刷新核对', body => typeof body.id === 'string' && typeof body.state === 'string');
      await load();
      setUploadFeedback(data.notification?.state==='delivered' ? '已提交，等待小鱼接手。无需再次点击。' : '提交结果待核实，请查看处理进度');
    } catch (error: unknown) {
      await load();
      setUploadFeedback(!responseReceived || successStatus
        ? '提交结果待核实，请查看文章处理进度'
        : errorMessage(error, '提交未完成，请先刷新核对'));
    } finally {
      lock.current = false;
      setActionBusy('');
    }
  }

  function openDeleteConfirmation(article: Article) {
    setDeleteFeedback('');
    setDeleteIdInput('');
    setDeleteAcknowledged(false);
    setPendingDelete({ id: article.id, title: article.title });
  }

  async function deletePermanently(article: Article) {
    if (!pendingDelete || pendingDelete.id !== article.id || lock.current) return;
    lock.current = true;
    setActionBusy(article.id);
    setDeleteFeedback('正在删除本站这篇文章…');
    try {
      const response = await fetch(`/api/articles/${article.id}/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-xiaoyu-upload': '1' },
        body: JSON.stringify({
          article_id: article.id,
          confirm_article_id: deleteIdInput,
          confirm_title: pendingDelete.title,
          confirm_permanent: deleteAcknowledged,
        }),
      });
      const result = await readResponse<{ deleted: boolean; already_deleted?: boolean }>(response, '删除未完成，请刷新核对后再试', body => body.deleted === true);
      setPendingDelete(null);
      setDeleteIdInput('');
      setDeleteAcknowledged(false);
      setDeleteFeedback('');
      await load();
      setUploadFeedback(result.already_deleted ? '这篇文章此前已删除' : '这篇文章及本站副本已永久删除');
    } catch (error: unknown) {
      setDeleteFeedback(errorMessage(error, '删除未完成，请刷新核对后再试'));
      await load();
    } finally {
      lock.current = false;
      setActionBusy('');
    }
  }

  function commitFocus(next: PublishFocus) {
    focusRef.current = next;
    setFocus(next);
    try { savePublishFocus(window.sessionStorage, next); } catch { /* Storage is optional. */ }
  }
  function activateArticle(id: string) {
    // Only an explicit user action requests keyboard focus; polling never does.
    requestedSummaryFocus.current = id;
    const before = focusRef.current || {seen:items.map(article => article.id),current:{}};
    const row = items.find(article => article.id === id);
    commitFocus({...before,current:{...before.current,[id]:{complete:row ? publishComplete(row) : false,open:true}}});
  }
  function toggleArticle(id: string, open: boolean) {
    const before = focusRef.current;
    if (!before?.current[id] || before.current[id].open === open) return;
    commitFocus({...before,current:{...before.current,[id]:{...before.current[id],open}}});
  }
  function renderArticle(article: Article) {
    const displayId=safeRecordId(article.id);
    const knownArticleId=displayId!=='编号未展示'&&!displayId.startsWith('localword_');
    const domKey=knownArticleId?displayId:`unknown-${items.indexOf(article)}`;
    const isSubmitting = actionBusy === article.id;
    const deliveries = article.deliveries || [];
    const alreadyNotified=['sending','delivered','unknown'].includes(article.notification_state||'');
    const initialHelp=article.state==='uploaded'&&!alreadyNotified;
    const retry=article.recovery?.can_retry??(article.notification_state==='unknown'||(!alreadyNotified&&(['failed','needs_login','needs_verification'].includes(article.state)||deliveries.some(d=>['failed','needs_login','needs_verification'].includes(d.state)))));
    const showHelp=!article.generated&&article.output_mode!=='text_only'&&(article.recovery?.can_notify??!['processing','word_ready','toutiao_saving','completed','deleting','text_saved'].includes(article.state))&&(initialHelp||retry);
    const waitingForExecutor=article.recovery?.waiting_for_executor||(article.state==='queued'&&article.notification_state!=='unknown'&&!retry);
    const drafts=(['toutiao','zhihu'] as const).map(platform=>({platform,...platformProgress(article,platform)}));
    const handling=articleHandlingSummary(article);
    const otherDeliveries = deliveries.filter(delivery => delivery.platform !== 'toutiao' && delivery.platform !== 'zhihu');
    return (
        <article>
          <div className="card-top">
            <h3>{article.title}</h3>
            <span className="badge" data-state={articleDisplayStates.includes(article.state)?article.state:'unknown'}>{publishStatus({...article,word_progress_unavailable:article.word_progress_unavailable||networkOffline||!!loadError||progressReading.has(article.id)})}</span>
          </div>
          {(article.filename || article.created) && (
            <p className="metadata">
              {beijingDate(article.created)}
            </p>
          )}
          {handling&&<p className="helper-text" role="status">{handling.reason} {handling.help}</p>}
          {article.state!=='deleting'&&article.output_mode!=='text_only'&&<WordStageProgress article={article} progress={article.word_progress} unavailable={article.word_progress_unavailable} deferred={article.word_progress_deferred} reading={progressReading.has(article.id)} onReadProgress={()=>readArticleProgress(article.id,true)} readError={!!loadError} networkOffline={networkOffline}/>}

          {article.state !== 'deleting' && article.state !== 'text_saved' && article.output_mode !== 'text_only' && <section className="platforms" aria-label="平台草稿状态">
            <p className="platforms-heading">私人草稿</p>
            {drafts.map(draft=><div className="platform-result" key={draft.platform} data-state={draft.state}>
              <div className="platform-row"><span><strong>{platformName(draft.platform)}</strong> · {draft.label}</span>{draft.url&&<a href={draft.url} target="_blank" rel="noreferrer">打开{platformName(draft.platform)}草稿</a>}</div>
              <p className="platform-guidance">{draft.reason} <span>{draft.help}</span></p>
            </div>)}
            {otherDeliveries.map(delivery => (
              <div className="platform-row" key={delivery.platform} data-state={Object.hasOwn(deliveryStates,delivery.state)?delivery.state:'unknown'}>
                <span><strong>{platformName(delivery.platform)}</strong> · {Object.hasOwn(deliveryStates,delivery.state)?deliveryStates[delivery.state]:'待核实'}</span>
                {safeDraftLink(delivery.draft_url,delivery.platform) && <a href={safeDraftLink(delivery.draft_url,delivery.platform)!} target="_blank" rel="noreferrer">打开{platformName(delivery.platform)}草稿</a>}
              </div>
            ))}
          </section>}

          {(article.error||article.filename||article.recovery?.lease_expires||deliveries.some(delivery=>delivery.message)||article.upload_progress?.some(value=>value.diagnostic))&&<details className="processing-details article-technical-details"><summary>处理记录</summary>
            <p className="processing-log">文章编号：{safeRecordId(article.id)}{article.filename?' · 原文件信息保留在后台审计记录。':''}</p>
            {article.error&&<p className={`processing-log${article.state==='failed'?' is-error':''}`}>{safeDiagnosticText(article.error)}</p>}
            {deliveries.filter(delivery=>delivery.message).map(delivery=><p className="processing-log" key={delivery.platform}>{platformName(delivery.platform)}：{safeDiagnosticText(delivery.message)}</p>)}
            {article.upload_progress?.some(value=>value.diagnostic)&&<p className="processing-log">平台操作诊断保留在后台审计记录；处理指引以各平台状态为准。</p>}
            {article.recovery?.lease_expires&&Number.isFinite(Date.parse(article.recovery.lease_expires))&&<p className="processing-log">任务认领保留至 {new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(article.recovery.lease_expires))}。若您已确认原执行结束，可让小鱼核对并恢复这篇文章，无需等到占用到期。恢复需要您的明确授权，并保留已有 Word 和草稿；重导仍须单独许可。</p>}
          </details>}

          {article.state === 'uploaded' && connected === false && <p className="error card-error">连接暂不可用，文章已保存</p>}
          {waitingForExecutor&&<p className="helper-text">已提交，等待小鱼接手。无需再次点击，处理进度会自动更新。</p>}
          {(article.notification_state==='unknown'||(article.notification_state==='sending'&&retry))&&article.recovery?.can_notify&&<p className="helper-text">提交结果未确认，文章和已有成果已保存；请先核对处理进度。</p>}
          {showHelp && connected !== true && !(article.state === 'uploaded' && connected === false) && <p className="error card-error">{connected === false ? '连接暂不可用，暂不能重试通知' : '连接状态未确认，暂不能提交'}</p>}
          {article.state === 'deleting' && <p className="error card-error">删除尚未完成，文章处理已停止。核对编号后可继续清理剩余的本站副本；外部平台内容不受此操作影响。</p>}
          <div className="actions">
            {article.state === 'text_saved' && <a className="action-link" href="/writing">阅读文字稿</a>}
            {!focus?.current[article.id] && <button className="secondary" type="button" onClick={() => activateArticle(article.id)}>在工作区查看</button>}
            {showHelp && (
              <button type="button" onClick={() => void submit(article.id, retry)} disabled={!!actionBusy || connected !== true}>
                {isSubmitting ? '提交中…' : (retry ? '重试求助' : '求助小鱼')}
              </button>
            )}
            {article.state !== 'deleting' && article.output_mode !== 'text_only' && article.has_result && knownArticleId && <a className="action-link" href={`/api/articles/${article.id}/download`}>下载 Word</a>}
            {article.deletion_supported && <button className="secondary" type="button" onClick={() => openDeleteConfirmation(article)} disabled={!!actionBusy}>
              {article.state === 'deleting' ? '继续删除' : '永久删除'}
            </button>}
          </div>
          {pendingDelete?.id === article.id && <section className="delete-confirmation" aria-labelledby={`delete-title-${domKey}`} aria-describedby={`delete-description-${domKey}`}>
            <h4 id={`delete-title-${domKey}`}>确认永久删除这篇文章</h4>
            <p id={`delete-description-${domKey}`}>将永久删除《{article.title}》这篇尚未制作 Word 或投递平台的上传稿在本站保存的原文、正文和状态记录。生成稿或已进入平台交付的稿件不支持此入口；外部平台上的内容也不会被删除。</p>
            <p className="delete-id"><strong>仅此文章编号：</strong> {displayId}</p>
            <label className="delete-id-field" htmlFor={`delete-id-${domKey}`}>输入完整文章编号以确认
              <input id={`delete-id-${domKey}`} type="text" autoComplete="off" spellCheck={false} value={deleteIdInput} onChange={event => setDeleteIdInput(event.target.value)} disabled={!!actionBusy} />
            </label>
            <label className="delete-check"><input type="checkbox" checked={deleteAcknowledged} onChange={event => setDeleteAcknowledged(event.target.checked)} disabled={!!actionBusy} /> 我确认永久删除这篇文章在本站的副本</label>
            {deleteFeedback && <p className={deleteFeedback.startsWith('正在') ? 'inline-feedback' : 'error'} role={deleteFeedback.startsWith('正在') ? 'status' : 'alert'}>{deleteFeedback}</p>}
            <div className="actions">
              <button type="button" onClick={() => void deletePermanently(article)} disabled={!!actionBusy || deleteIdInput !== article.id || !deleteAcknowledged}>
                {actionBusy === article.id ? '删除中…' : '永久删除本站副本'}
              </button>
              <button className="secondary" type="button" onClick={() => { setPendingDelete(null); setDeleteFeedback(''); }} disabled={!!actionBusy}>取消</button>
            </div>
          </section>}
        </article>
    );
  }
  const currentItems = items.filter(article => focus?.current[article.id]);
  const recentItems = items.filter(article => article.list_section === 'recent');
  const historyItems = recentItems.filter(article => !focus?.current[article.id]);
  const workItems = items.filter(article => article.list_section !== 'recent' && !focus?.current[article.id]);
  function cleared(ids: string[]) {
    resetProgressReads();itemsRef.current=itemsRef.current.filter(row=>!ids.includes(row.id));
    readController.current?.abort(); sequence.current++; readLock.current=false; setReading(false);
    setItems(previous=>previous.filter(row=>!ids.includes(row.id)));
    pagesRef.current=[0]; nextOffsetRef.current=null;
    if (focusRef.current) {const next={...focusRef.current,current:{...focusRef.current.current}};for(const id of ids)delete next.current[id];commitFocus(next);}
    void load(true);
  }

  return (
    <main className="studio-main publish-page">
      <StudioNav current="publish" />

      <div className="page-heading">
        <h2>配图发布</h2>
        <button className="secondary" type="button" onClick={() => void load(true)} disabled={refreshing || reading || !!actionBusy}>
          {refreshing ? '刷新中…' : reading ? '读取中…' : '刷新'}
        </button>
      </div>

      <section className="upload-box" aria-labelledby="upload-title" aria-busy={actionBusy === 'upload'}>
        <h3 id="upload-title" className="visually-hidden">上传文章</h3>
        <div className="upload">
          <div className="file-picker">
            <label className="file-label" htmlFor="article">选择文章</label>
            <input
              ref={file}
              id="article"
              type="file"
              accept=".docx,.txt"
              disabled={!!actionBusy || !loaded}
              aria-describedby="file-hint selected-file"
              onChange={event => {
                setFileName(event.target.files?.[0]?.name || '');
                setUploadFeedback('');
              }}
            />
            <p id="selected-file" className="file-name">{fileName?(/\.docx$/i.test(fileName)?'已选择 DOCX 文件':/\.txt$/i.test(fileName)?'已选择 TXT 文件':'已选择文章文件'):'尚未选择文件'}</p>
          </div>
          <button type="button" onClick={upload} disabled={!!actionBusy || !loaded}>
            {actionBusy === 'upload' ? '上传中…' : '上传文章'}
          </button>
        </div>
        <p id="file-hint" className="helper-text">DOCX / TXT · 纯正文 · 20MB 以内</p>
        {uploadFeedback && <p className="inline-feedback" role="status" aria-live="polite">{uploadFeedback}</p>}
      </section>

      {loadError && <div className="error" role="alert">
        <p>{loadError}{items.length ? '；已保留此前读取的文章，状态尚未更新' : ''}</p>
        {authRequired && <a href="/signin-with-chatgpt?return_to=%2F" target="_top">使用本人账号登录</a>}
      </div>}
      {!loaded && <p className="section-hint" role="status">正在读取…</p>}
      <ArticleContentClear disabled={!loaded||reading||!!actionBusy||!!loadError} onDeleted={cleared}/>
      {currentItems.length > 0 && <section className="publish-current" aria-label="本次配图发布">
        {currentItems.map(article => <details key={article.id} className="publish-fold publish-current-item" open={focus!.current[article.id].open} onToggle={event => toggleArticle(article.id, event.currentTarget.open)}>
          <summary ref={node => {
            if (node && requestedSummaryFocus.current === article.id) {
              requestedSummaryFocus.current = null;
              node.focus();
            }
          }}><span className="publish-focus-title">本次 · {article.title}</span><span className="publish-focus-status" role="status">{publishStatus({...article,word_progress_unavailable:article.word_progress_unavailable||networkOffline||!!loadError||progressReading.has(article.id)})}</span></summary>
          {renderArticle(article)}
        </details>)}
      </section>}
      {workItems.length > 0 && <section aria-label="正在执行与等待处理" className="publish-work">
        <h3>正在执行与等待处理</h3>
        <p className="section-hint">{pendingTotal===null?'待处理数量暂未确认':`${pendingTotal} 篇待处理`}；最近文章清空保留此区</p>
        <ul className="article-list">{workItems.map(article=><li key={article.id} className="article-card">{renderArticle(article)}</li>)}</ul>
        {nextOffset!==null&&<button className="secondary" type="button" disabled={reading||!!actionBusy} onClick={()=>void load(true,true)}>加载更多待处理文章</button>}
      </section>}
      {nextOffset!==null&&workItems.length===0&&<button className="secondary" type="button" disabled={reading||!!actionBusy} onClick={()=>void load(true,true)}>加载更多待处理文章</button>}
      <details className="publish-fold publish-history">
        <summary>最近文章<span className="section-hint">非执行 · 最新 5 篇</span></summary>
        <ArticleListClear scope="publish" articleIds={recentItems.map(article=>article.id)} disabled={!loaded||reading||!!actionBusy||!!loadError} onDeleted={cleared}/>
        {historyItems.length ? <ul className="article-list">{historyItems.map(article => <li key={article.id} className="article-card">{renderArticle(article)}</li>)}</ul>
          : loaded && !loadError ? <p className="section-hint">{currentItems.length ? '本次文章显示在上方工作区' : '上传后的文章会保留在这里'}</p> : null}
      </details>
    </main>
  );
}
