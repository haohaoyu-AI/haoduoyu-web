'use client';

import ArticleWorkspaceAction from '../components/article-workspace-action';
import WordStageProgress, {mergeWordProgress,validateWordProgressDto} from '../components/word-stage-progress';
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
  // Client provenance: populated only by a successful per-card GET, never by a list DTO.
  word_progress_readback?: WordProgress | null;
  word_progress_readback_started_at?: number;
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
const uploadFenceStorageKey=(owner:string)=>`haoduoyu-unconfirmed-original-upload-v1:${owner}`;
const submissionFenceStorageKey=(owner:string)=>`haoduoyu-unconfirmed-article-submit-v1:${owner}`;
const clientReadOrder=()=>typeof performance==='object'&&typeof performance.now==='function'?performance.now():Date.now();
async function originalFileSha256(chosen:File){
  const bytes=await chosen.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}

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
  const [fileName, setFileName] = useState('');
  const [uploadBlocked,setUploadBlocked]=useState(false);
  const [checkingFile,setCheckingFile]=useState(false);
  const [unconfirmedSubmissions,setUnconfirmedSubmissions]=useState(new Set<string>());
  const unknownUploads=useRef(new Map<string,Set<string>>());
  const restoredUploadOwners=useRef(new Set<string>());
  const unknownSubmissions=useRef(new Map<string,{owner:string;afterSequence:number;refused:boolean}>());
  const restoredSubmissionOwners=useRef(new Set<string>());
  const selectedFileSha=useRef<string|null>(null);
  const fileSelection=useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const sequence = useRef(0);
  const readLock = useRef(false);
  const listReadConfirmed=useRef(false);
  const readController = useRef<AbortController | null>(null);
  const [reading, setReading] = useState(false);
  const [pendingTotal, setPendingTotal] = useState<number|null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [ownerScope,setOwnerScope]=useState<string|null>(null);
  const ownerScopeRef=useRef<string|null>(null);
  const actionEpoch=useRef(0);
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
  const invalidatePrivateScope=useCallback((message='登录账号已变化，请重新读取文章列表',needsAuth=true)=>{
    resetProgressReads();readController.current?.abort();sequence.current++;readLock.current=false;listReadConfirmed.current=false;actionEpoch.current++;fileSelection.current++;
    ownerScopeRef.current=null;setOwnerScope(null);itemsRef.current=[];setItems([]);
    focusRef.current=null;setFocus(null);requestedSummaryFocus.current=null;focusRestored.current=true;
    try{savePublishFocus(window.sessionStorage,null);}catch{/* Storage is optional. */}
    pagesRef.current=[0];nextOffsetRef.current=null;setNextOffset(null);setPendingTotal(0);
    setConnected(null);setAuthRequired(needsAuth);setLoadError(message);setReading(false);setRefreshing(false);setLoaded(true);
    setUploadFeedback('');setFileName('');setActionBusy('');setUploadBlocked(false);setCheckingFile(false);setUnconfirmedSubmissions(new Set());selectedFileSha.current=null;lock.current=false;
    if(file.current)file.current.value='';
  },[resetProgressReads]);
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
        const controller=new AbortController(),epoch=progressEpoch.current,startedAt=clientReadOrder(),progressAtDispatch=itemsRef.current.find(article=>article.id===nextId)?.word_progress||null,inputAtDispatch=progressAtDispatch?.input_sha256||null;
        const advancedSinceDispatch=(prior:WordProgress|null|undefined)=>!!prior&&(!progressAtDispatch||prior.input_sha256!==inputAtDispatch||(prior.attempt?.attempt_id||null)!==(progressAtDispatch.attempt?.attempt_id||null)||(prior.attempt?.generation||0)!==(progressAtDispatch.attempt?.generation||0)||prior.version>progressAtDispatch.version||Date.parse(prior.read_at)>Date.parse(progressAtDispatch.read_at));
        progressReads.current.set(nextId,controller);progressReadAt.current.set(nextId,Date.now());
        void (async()=>{
          try{
            const response=await fetch(`/api/articles/${encodeURIComponent(nextId)}/word-progress`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
            const body=await readResponse<{article_id:string;output_mode:string|null;word_progress:WordProgress|null;word_progress_unavailable:false}>(response,'暂时无法读取 Word 进度',value=>{
              if(value.article_id!==nextId||value.word_progress_unavailable!==false)return false;
              if(value.output_mode==='text_only')return value.word_progress===null;
              const p=value.word_progress;
              return value.output_mode===null&&validateWordProgressDto(p)&&p.target_kind==='article'&&p.target_id===nextId;
            });
            if(controller.signal.aborted||epoch!==progressEpoch.current||!progressMounted.current)return;
            setItems(previous=>previous.map(article=>{
              if(article.id!==nextId||!eligible(article))return article;
              const prior=article.word_progress,next=body.word_progress;
              if(!next&&advancedSinceDispatch(prior))return article;
              if(prior&&next&&prior.input_sha256!==inputAtDispatch&&prior.input_sha256!==next.input_sha256)return article;
              if(prior&&next&&prior.input_sha256!==next.input_sha256&&Date.parse(next.read_at)<=Date.parse(prior.read_at))return article;
              const progress=prior&&next&&prior.input_sha256===next.input_sha256?mergeWordProgress(prior,next):next;
              return {...article,output_mode:body.output_mode,word_progress:progress,word_progress_readback:next,word_progress_readback_started_at:startedAt,word_progress_unavailable:false,word_progress_deferred:false};
            }));
          }catch(error){
            if(controller.signal.aborted||epoch!==progressEpoch.current||!progressMounted.current)return;
            const needsAuth=!!(error&&typeof error==='object'&&'authRequired' in error&&error.authRequired);
            if(needsAuth){
              invalidatePrivateScope(errorMessage(error,'请使用本人账号登录'));
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
  },[invalidatePrivateScope]);
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
    if (readLock.current) return {confirmed:false as const};
    readLock.current = true;
    listReadConfirmed.current=false;
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
      let batchOwner=ownerScopeRef.current;
      let data:{owner_scope?:string;items:Article[];connected:boolean;pending_total?:number;next_offset?:number|null}={items:[],connected:false};
      for(const offset of pages){
      if(abort.signal.aborted||seq!==sequence.current||!progressMounted.current)return {confirmed:false as const};
      const response = await fetch(offset?`/api/articles?pending_offset=${offset}`:'/api/articles', { cache: 'no-store', signal: AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]) });
      data = await readResponse<typeof data>(response, '暂时无法读取文章', body =>
        typeof body.connected === 'boolean' && Array.isArray(body.items) && body.items.every(item =>
          !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.state === 'string'
        )
      );
      if(abort.signal.aborted||seq!==sequence.current||!progressMounted.current)return {confirmed:false as const};
      if(typeof data.owner_scope!=='string'||!/^[a-f0-9]{64}$/.test(data.owner_scope)||batchOwner&&batchOwner!==data.owner_scope)throw Object.assign(new DisplayError('登录账号已变化，请重新读取文章列表'),{scopeInvalid:true});
      batchOwner=data.owner_scope;
      for(const item of data.items){
        // Lists cannot manufacture the independent per-card GET receipt.
        const listed={...item};delete listed.word_progress_readback;delete listed.word_progress_readback_started_at;
        if(listed.word_progress!=null&&!validateWordProgressDto(listed.word_progress)){
          listed.word_progress=null;listed.word_progress_unavailable=true;listed.word_progress_deferred=false;
        }
        merged.set(item.id,listed);
      }
      }
      data.items=[...merged.values()];
      if (seq === sequence.current) {
        ownerScopeRef.current=batchOwner;setOwnerScope(batchOwner);
        listReadConfirmed.current=true;
        const uploadFences=unknownUploads.current.get(batchOwner!)||new Set<string>();
        if(!restoredUploadOwners.current.has(batchOwner!)){
          restoredUploadOwners.current.add(batchOwner!);
          try{
            const saved:unknown=JSON.parse(window.sessionStorage.getItem(uploadFenceStorageKey(batchOwner!))||'[]');
            if(Array.isArray(saved))for(const value of saved)if(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))uploadFences.add(value);
          }catch{/* A failed optional storage read never removes an in-memory fence. */}
        }
        unknownUploads.current.set(batchOwner!,uploadFences);
        setUploadBlocked(!!selectedFileSha.current&&uploadFences.has(selectedFileSha.current));
        if(!restoredSubmissionOwners.current.has(batchOwner!)){
          restoredSubmissionOwners.current.add(batchOwner!);
          try{
            const saved:unknown=JSON.parse(window.sessionStorage.getItem(submissionFenceStorageKey(batchOwner!))||'[]');
            if(Array.isArray(saved))for(const value of saved){
              if(!value||typeof value!=='object'||!('id' in value)||typeof value.id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id))continue;
              if(!unknownSubmissions.current.has(value.id))unknownSubmissions.current.set(value.id,{owner:batchOwner!,afterSequence:seq,refused:'refused' in value&&value.refused===true});
            }
          }catch{/* Storage cannot release an existing in-memory submission fence. */}
        }
        for(const item of data.items){
          const pending=unknownSubmissions.current.get(item.id);
          // A pre-existing poll, an uploaded/null projection or an absent row
          // cannot prove what happened to the submitted request.
          if(pending?.owner===batchOwner&&seq>pending.afterSequence&&(pending.refused?data.connected===true:item.recovery?.can_notify===true&&item.recovery?.can_retry===true))unknownSubmissions.current.delete(item.id);
        }
        persistSubmissionFences(batchOwner!);
        setUnconfirmedSubmissions(new Set([...unknownSubmissions.current].filter(([,pending])=>pending.owner===batchOwner).map(([id])=>id)));
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
          const listed={...item,word_progress_readback:previousItem?.word_progress_readback,word_progress_readback_started_at:previousItem?.word_progress_readback_started_at};
          if((item.word_progress_unavailable||item.word_progress_deferred)&&!next)return {...listed,word_progress:before||null,word_progress_unavailable:item.word_progress_deferred?!!previousItem?.word_progress_unavailable:!!item.word_progress_unavailable};
          return before&&next&&before.input_sha256===next.input_sha256?{...listed,word_progress:mergeWordProgress(before,next)}:listed;
        });});
        setConnected(data.connected);
        setLoadError('');
        setAuthRequired(false);
        setLoaded(true);
        if (manual) setUploadFeedback(uploadFences.size?'已刷新；仍有原稿上传结果未确认，请只读核对已有列表，勿重传同一原稿。':'已刷新');
        return {confirmed:true as const,owner:batchOwner!,sequence:seq};
      }
    } catch (error: unknown) {
      if (abort.signal.aborted || seq !== sequence.current) return {confirmed:false as const};
      if (seq === sequence.current) {
        setConnected(null);
        setLoadError(errorMessage(error, '暂时无法读取文章'));
        const needsAuth = !!(error && typeof error === 'object' && 'authRequired' in error && error.authRequired);
        const invalidScope=!!(error&&typeof error==='object'&&'scopeInvalid' in error&&error.scopeInvalid);
        setAuthRequired(needsAuth);
        if(needsAuth||invalidScope)invalidatePrivateScope(errorMessage(error,'请使用本人账号登录'));
        setLoaded(true);
      }
    } finally {
      if (seq === sequence.current) {
        readLock.current = false;
        setReading(false);
        if (manual) setRefreshing(false);
      }
    }
    return {confirmed:false as const};
  }, [invalidatePrivateScope]);

  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 0);
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      requestedSummaryFocus.current = null;
      focusRef.current = null;
      focusRestored.current = false;
      setFocus(null);
      ownerScopeRef.current=null;setOwnerScope(null);actionEpoch.current++;fileSelection.current++;lock.current=false;setActionBusy('');listReadConfirmed.current=false;
      pagesRef.current=[0];nextOffsetRef.current=null;setNextOffset(null);setPendingTotal(0);
      readController.current?.abort();
      resetProgressReads();itemsRef.current=[];
      sequence.current += 1;
      readLock.current = false;
      setItems([]);
      setConnected(null);
      setLoadError('');
      setAuthRequired(false);
      setUploadFeedback('');
      setFileName('');
      setUploadBlocked(false);setCheckingFile(false);setUnconfirmedSubmissions(new Set());selectedFileSha.current=null;
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

  function persistUploadFences(owner:string){
    try{
      const values=[...(unknownUploads.current.get(owner)||[])];
      if(values.length)window.sessionStorage.setItem(uploadFenceStorageKey(owner),JSON.stringify(values));
      else window.sessionStorage.removeItem(uploadFenceStorageKey(owner));
    }catch{/* Optional storage failure never releases the mounted-page fence. */}
  }
  function markUploadPending(owner:string,sha:string){
    const values=unknownUploads.current.get(owner)||new Set<string>();values.add(sha);unknownUploads.current.set(owner,values);persistUploadFences(owner);
  }
  function clearKnownUpload(owner:string,sha:string){unknownUploads.current.get(owner)?.delete(sha);persistUploadFences(owner);}
  function markSubmissionPending(owner:string,id:string,refused=false){
    unknownSubmissions.current.set(id,{owner,afterSequence:sequence.current,refused});
    // Persist before POST. A reload must not turn a still-unanswered notification
    // into permission to send another wake; only a later normal recovery GET can.
    persistSubmissionFences(owner);
    setUnconfirmedSubmissions(new Set([...unknownSubmissions.current].filter(([,pending])=>pending.owner===owner).map(([target])=>target)));
  }
  function persistSubmissionFences(owner:string){
    try{
      const values=[...unknownSubmissions.current].filter(([,pending])=>pending.owner===owner).map(([id,pending])=>({id,refused:pending.refused}));
      if(values.length)window.sessionStorage.setItem(submissionFenceStorageKey(owner),JSON.stringify(values));
      else window.sessionStorage.removeItem(submissionFenceStorageKey(owner));
    }catch{/* Optional storage failure keeps the mounted-page fence. */}
  }
  async function selectArticle(chosen:File|undefined){
    const selection=++fileSelection.current,epoch=actionEpoch.current,owner=ownerScopeRef.current;
    selectedFileSha.current=null;setFileName(chosen?.name||'');setUploadBlocked(false);setUploadFeedback('');
    if(!chosen){setCheckingFile(false);return;}
    setCheckingFile(true);
    try{
      const sha=await originalFileSha256(chosen);
      if(selection!==fileSelection.current||epoch!==actionEpoch.current||owner!==ownerScopeRef.current||!progressMounted.current)return;
      selectedFileSha.current=sha;
      const blocked=!!owner&&!!unknownUploads.current.get(owner)?.has(sha);setUploadBlocked(blocked);
      if(blocked)setUploadFeedback('本原稿上传结果未确认；请只读核对已有文章，勿重传同一原稿。');
    }catch{
      if(selection===fileSelection.current&&epoch===actionEpoch.current&&owner===ownerScopeRef.current&&progressMounted.current){setUploadBlocked(true);setUploadFeedback('暂时无法核对文件，请重新选择原稿。');}
    }finally{if(selection===fileSelection.current&&epoch===actionEpoch.current&&progressMounted.current)setCheckingFile(false);}
  }

  async function upload() {
    const chosen = file.current?.files?.[0];
    if (!chosen) { setUploadFeedback('请选择文章'); return; }
    if (lock.current||checkingFile||readLock.current||!listReadConfirmed.current||!ownerScopeRef.current||!navigator.onLine) return;
    const ownerAtDispatch=ownerScopeRef.current,epoch=actionEpoch.current;
    const live=()=>progressMounted.current&&epoch===actionEpoch.current&&ownerAtDispatch===ownerScopeRef.current;
    lock.current = true;
    setActionBusy('upload');
    setUploadFeedback('正在上传…');
    let responseReceived = false;
    let successStatus = false;
    let sha:string|null=null,postStarted=false;
    try {
      sha=await originalFileSha256(chosen);
      if(!live())return;
      selectedFileSha.current=sha;
      if(unknownUploads.current.get(ownerAtDispatch)?.has(sha)){setUploadBlocked(true);setUploadFeedback('本原稿上传结果未确认；请只读核对已有文章，勿重传同一原稿。');return;}
      const form = new FormData();
      form.append('article', chosen);
      // Persist only the byte fingerprint before sending, so a reload cannot
      // turn an in-flight request into permission to send this original again.
      markUploadPending(ownerAtDispatch,sha);postStarted=true;
      const response = await fetch('/api/articles', { method: 'POST', headers: { 'x-xiaoyu-upload': '1','x-article-owner-scope':ownerAtDispatch }, body: form,signal:AbortSignal.timeout(120000) });
      responseReceived = true;
      successStatus = response.ok;
      const uploaded = await readResponse<{ id: string }>(response, '上传未完成', body => typeof body.id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id));
      if(!live())return;
      clearKnownUpload(ownerAtDispatch,sha);selectedFileSha.current=null;setUploadBlocked(false);
      if (file.current) file.current.value = '';
      setFileName('');
      setUploadFeedback('文章已上传');
      activateArticle(uploaded.id);
      await load();
    } catch (error: unknown) {
      if(!live())return;
      if(error&&typeof error==='object'&&'authRequired' in error&&error.authRequired){if(sha)clearKnownUpload(ownerAtDispatch,sha);invalidatePrivateScope(errorMessage(error,'请使用本人账号登录'));return;}
      if(!postStarted){setUploadFeedback('暂时无法核对文件，请重新选择原稿。');return;}
      setUploadBlocked(true);
      await load();
      if(!live())return;
      setUploadFeedback(!responseReceived||successStatus?'上传结果待核实；请只读核对已有文章，勿重传同一原稿。':'上传未完成，保存结果尚未核对；请只读刷新，勿重传同一原稿。');
    } finally {
      if(live()){lock.current = false;setActionBusy('');}
    }
  }

  async function submit(id: string, retry: boolean) {
    if (lock.current||readLock.current||!listReadConfirmed.current||!ownerScopeRef.current||!navigator.onLine||unknownSubmissions.current.get(id)?.owner===ownerScopeRef.current||!itemsRef.current.some(article=>article.id===id)) return;
    const ownerAtDispatch=ownerScopeRef.current,epoch=actionEpoch.current;
    const live=()=>progressMounted.current&&epoch===actionEpoch.current&&ownerAtDispatch===ownerScopeRef.current;
    lock.current = true;
    setActionBusy(id);
    activateArticle(id);
    setUploadFeedback(retry ? '正在重试通知…' : '正在交给小鱼…');
    let responseReceived = false;
    let successStatus = false;
    try {
      markSubmissionPending(ownerAtDispatch,id);
      const response = await fetch(`/api/articles/${id}/submit`, { method: 'POST', headers: { 'x-xiaoyu-upload': '1' },signal:AbortSignal.timeout(45000) });
      responseReceived = true;
      successStatus = response.ok;
      if(response.status===409){
        const refusal=await response.clone().json().catch(()=>null) as {error?:unknown}|null;
        if(refusal?.error==='文章处理连接尚未启用，文章已安全保存')throw Object.assign(new DisplayError('连接暂不可用，文章已保存；请刷新核对连接后再求助'),{submissionRefused:true});
      }
      const data = await readResponse<{ id: string; state: string; notification?: {state:string} }>(response, '提交未完成，请先刷新核对', body => body.id === id && typeof body.state === 'string');
      if(!live())return;
      markSubmissionPending(ownerAtDispatch,id);
      await load();
      if(!live())return;
      setUploadFeedback(data.notification?.state==='delivered' ? '已提交，等待小鱼接手。无需再次点击。' : '提交结果待核实，请查看处理进度');
    } catch (error: unknown) {
      if(!live())return;
      if(error&&typeof error==='object'&&'authRequired' in error&&error.authRequired){invalidatePrivateScope(errorMessage(error,'请使用本人账号登录'));return;}
      markSubmissionPending(ownerAtDispatch,id,!!(error&&typeof error==='object'&&'submissionRefused' in error&&error.submissionRefused));
      await load();
      if(!live())return;
      setUploadFeedback(!responseReceived || successStatus
        ? '提交结果待核实，请查看文章处理进度'
        : errorMessage(error, '提交未完成，请先刷新核对'));
    } finally {
      if(live()){lock.current = false;setActionBusy('');}
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
          {article.state!=='deleting'&&article.output_mode!=='text_only'&&<WordStageProgress article={article} progress={article.word_progress} readback={article.word_progress_readback} readbackStartedAt={article.word_progress_readback_started_at} unavailable={article.word_progress_unavailable} deferred={article.word_progress_deferred} reading={progressReading.has(article.id)} onReadProgress={()=>readArticleProgress(article.id,true)} onAuthRequired={()=>{if(ownerScope&&ownerScopeRef.current===ownerScope)invalidatePrivateScope();}} readError={!!loadError} networkOffline={networkOffline}/>}

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
          {waitingForExecutor&&<p className="helper-text">请求已保存，尚未开始处理。进度会自动更新。</p>}
          {unconfirmedSubmissions.has(article.id)&&showHelp&&<p className="helper-text">本次提交回执尚未核对；请刷新读取同一任务，暂不重复求助。</p>}
          {(article.notification_state==='unknown'||(article.notification_state==='sending'&&retry))&&article.recovery?.can_notify&&<p className="helper-text">提交结果未确认，文章和已有成果已保存；请先核对处理进度。</p>}
          {showHelp && connected !== true && !(article.state === 'uploaded' && connected === false) && <p className="error card-error">{connected === false ? '连接暂不可用，暂不能重试通知' : '连接状态未确认，暂不能提交'}</p>}
          {article.state === 'deleting' && <p className="error card-error">删除尚未完成，文章处理已停止。核对编号后可继续清理剩余的本站副本；外部平台内容不受此操作影响。</p>}
          <div className="actions">
            <ArticleWorkspaceAction key={ownerScope||'unread'} ids={[article.id]} titles={{[article.id]:article.title}} ownerScope={ownerScope||undefined} onScopeInvalid={()=>{if(ownerScope&&ownerScopeRef.current===ownerScope)invalidatePrivateScope();}} disabled={!ownerScope||!!actionBusy||reading||!!loadError} onChanged={ids=>{if(ownerScope&&ownerScopeRef.current===ownerScope)cleared(ids);}}/>
            {article.state === 'text_saved' && <a className="action-link" href="/article-data">查看文章数据</a>}
            {!focus?.current[article.id] && <button className="secondary" type="button" onClick={() => activateArticle(article.id)}>在工作区查看</button>}
            {showHelp && (
              <button type="button" onClick={() => void submit(article.id, retry)} disabled={!ownerScope||!!actionBusy||reading||!!loadError||networkOffline||unconfirmedSubmissions.has(article.id)||connected !== true}>
                {isSubmitting ? '提交中…' : (retry ? '重试求助' : '求助小鱼')}
              </button>
            )}
            {article.state !== 'deleting' && article.output_mode !== 'text_only' && article.has_result && knownArticleId && <a className="action-link" href={`/api/articles/${article.id}/download`}>下载 Word</a>}
          </div>

        </article>
    );
  }
  const currentItems = items.filter(article => focus?.current[article.id]);

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
              disabled={!!actionBusy || !loaded || !ownerScope || authRequired}
              aria-describedby="file-hint selected-file"
              onChange={event => {void selectArticle(event.target.files?.[0]);}}
            />
            <p id="selected-file" className="file-name">{fileName?(/\.docx$/i.test(fileName)?'已选择 DOCX 文件':/\.txt$/i.test(fileName)?'已选择 TXT 文件':'已选择文章文件'):'尚未选择文件'}</p>
          </div>
          <button type="button" onClick={upload} disabled={!!actionBusy||checkingFile||uploadBlocked||reading||!!loadError||networkOffline||!loaded||!ownerScope||authRequired}>
            {actionBusy === 'upload' ? '上传中…' : checkingFile?'核对文件中…':'上传文章'}
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
      <ArticleWorkspaceAction key={ownerScope||'unread'} label="一键清空当前列表" ids={items.map(article=>article.id)} titles={Object.fromEntries(items.map(article=>[article.id,article.title]))} ownerScope={ownerScope||undefined} onScopeInvalid={()=>{if(ownerScope&&ownerScopeRef.current===ownerScope)invalidatePrivateScope();}} disabled={!ownerScope||!loaded||reading||!!actionBusy||!!loadError} onChanged={ids=>{if(ownerScope&&ownerScopeRef.current===ownerScope)cleared(ids);}}/>
      <p className="helper-text">清空会保留尚未安全结束的任务。已完成文章和可恢复文章见<a href="/article-data">文章数据</a>。</p>
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
      {workItems.length > 0 && <section aria-label="当前处理文章" className="publish-work">
        <h3>当前处理文章</h3>
        <p className="section-hint">{pendingTotal===null?'待处理数量暂未确认':`${pendingTotal} 篇待处理`}</p>
        <ul className="article-list">{workItems.map(article=><li key={article.id} className="article-card">{renderArticle(article)}</li>)}</ul>
        {nextOffset!==null&&<button className="secondary" type="button" disabled={reading||!!actionBusy} onClick={()=>void load(true,true)}>加载更多待处理文章</button>}
      </section>}
      {nextOffset!==null&&workItems.length===0&&<button className="secondary" type="button" disabled={reading||!!actionBusy} onClick={()=>void load(true,true)}>加载更多待处理文章</button>}

    </main>
  );
}
