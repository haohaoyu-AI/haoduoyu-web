'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import StudioNav from '../../../components/studio-nav';
import {
  ResearchRequestError, ResearchResultView, researchError, researchRunFrom, researchStateLabels, researchTime, useResearchClient,
  type ResearchResponse, type ResearchResult, type ResearchRun,
} from '../../../components/topics/ResearchPanel';

type HeldClaim = { research_id: string; token: string };
type PendingSave = { research_id: string; input_hash: string; result: ResearchResult };

function resultTemplate(run: ResearchRun): string {
  const titles = new Set<string>();
  const candidates = run.input.boards.filter((board) => board.platform.status === 'ok' && board.platform.fetched_at && Date.now() - Date.parse(board.platform.fetched_at) <= 86_400_000 && Date.parse(board.platform.fetched_at) <= Date.now() + 300_000).flatMap((board) => board.candidates).filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object');
  const additional = candidates.flatMap((candidate) => {
    if (typeof candidate.title !== 'string' || !candidate.title || candidate.title.length > 200 || titles.has(candidate.title)) return [];
    titles.add(candidate.title);
    return [{ title: candidate.title, url: null, note: '仅为本任务冻结的原榜线索，尚未进行网页核验。请核验后更新说明或移除。' }];
  }).slice(0, 20);
  return JSON.stringify({
    featured: [],
    additional,
    coverage: { notice: `模板依据第 ${run.generation} 次冻结输入生成，尚未开展网页核验。请记录实际查阅范围、近期文章去重范围与缺口。`, checked_at: new Date().toISOString() },
    shortfall: '尚未开展网页核验，没有可作为研究精选的选题。保存前请填写本次实际研究不足的原因。',
  }, null, 2);
}

const featuredShape = JSON.stringify({
  event_key: '', title: '', event_time: '', summary: '', analysis: '', angle: '',
  facts: [{ text: '', source_ids: [] }],
  sources: [{ id: '', url: '', title: '', published_at: null, accessed_at: '' }],
  candidate_ids: [],
}, null, 2);

export default function ResearchHelperPage() {
  const { request, mounted } = useResearchClient();
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [researchId, setResearchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [verifiedOwner, setVerifiedOwner] = useState(false);
  const [feedback, setFeedback] = useState('正在读取已有任务…');
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [claims, setClaims] = useState<Record<string, HeldClaim>>({});
  const [resultJson, setResultJson] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [failureMessage, setFailureMessage] = useState('');
  const [retryCreate, setRetryCreate] = useState(false);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const lock = useRef(false);
  const current = useRef<ResearchRun | null>(null);
  const heldClaims = useRef<Record<string, HeldClaim>>({});
  const requestKey = useRef<string | null>(null);
  const renewalRequest = useRef<{research_id:string;key:string}|null>(null);
  const pendingSave = useRef<PendingSave | null>(null);
  const unfilledTemplate = useRef('');
  const readSequence = useRef(0);
  const ownerScope = useRef<string | null>(null);

  const resetIdentity = useCallback(() => {
    current.current = null; heldClaims.current = {}; requestKey.current = null; renewalRequest.current=null; pendingSave.current = null; unfilledTemplate.current = ''; ownerScope.current = null;
    setRun(null); setConnected(null); setResearchId(''); setClaims({}); setResultJson(''); setConfirmed(false); setFailureMessage(''); setRetryCreate(false); setPendingSaveId(null); setVerifiedOwner(false);
  }, []);

  const checkOwnerScope = useCallback((response: ResearchResponse) => {
    if (!response.owner_scope) throw new ResearchRequestError('未能确认任务所属账号，请重新读取状态');
    const changed = !!ownerScope.current && ownerScope.current !== response.owner_scope;
    if (changed) resetIdentity();
    ownerScope.current = response.owner_scope;
    return changed;
  }, [resetIdentity]);

  const installRun = useCallback((next: ResearchRun | null) => {
    if (!mounted.current) return;
    const changed = next?.id !== current.current?.id;
    current.current = next;
    setRun(next);
    if (next) setResearchId(next.id);
    if (changed) {
      const initialJson = next ? (next.result ? JSON.stringify(next.result, null, 2) : resultTemplate(next)) : '';
      unfilledTemplate.current = next?.result ? '' : initialJson;
      setResultJson(initialJson);
      setConfirmed(false);
      setFailureMessage('');
    }
    // A read, including an empty or failed read, must not discard a held token.
  }, [mounted]);

  const read = useCallback(async (id?: string) => {
    const sequence = ++readSequence.current;
    setVerifiedOwner(false);
    let response: ResearchResponse;
    try { response = await request(undefined, id); }
    catch (failure) {
      if (mounted.current && sequence === readSequence.current && failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0)) {
        resetIdentity(); setAuthRequired(true); setError(researchError(failure)); setFeedback('');
      }
      throw failure;
    }
    const next = researchRunFrom(response, !id);
    if (!mounted.current || sequence !== readSequence.current) return next;
    checkOwnerScope(response);
    installRun(next); setConnected(response.connected); setLoaded(true); setAuthRequired(false); setVerifiedOwner(true);
    if (next && ['completed', 'failed'].includes(next.state) && pendingSave.current?.research_id === next.id) {
      pendingSave.current = null; setPendingSaveId(null);
    }
    return next;
  }, [checkOwnerScope, installRun, mounted, request, resetIdentity]);

  const perform = useCallback(async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    readSequence.current += 1;
    setBusy(true); setError(''); setFeedback('处理中…');
    try { await work(); }
    catch (failure) {
      if (mounted.current) {
        setFeedback(''); setError(researchError(failure));
        if (failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0)) { setAuthRequired(true); resetIdentity(); }
      }
    } finally {
      lock.current = false;
      if (mounted.current) { setBusy(false); setLoaded(true); }
    }
  }, [mounted, resetIdentity]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get('id')?.trim() || undefined;
      if (id) setResearchId(id);
      void perform(async () => {
        const next = await read(id);
        if (mounted.current) setFeedback(next ? '已读取任务，未创建或认领新任务。' : '目前没有研究任务，可按需创建。');
      });
    }, 0);
    return () => { window.clearTimeout(timer); readSequence.current += 1; };
  }, [mounted, perform, read]);

  useEffect(() => {
    const verifyAccount = () => {
      if (lock.current || document.visibilityState === 'hidden') return;
      setVerifiedOwner(false);
      void perform(async () => {
        const response = await request();
        if (!mounted.current) return;
        if (checkOwnerScope(response)) {
          installRun(researchRunFrom(response, true)); setConnected(response.connected); setVerifiedOwner(true); setAuthRequired(false);
          setFeedback('账号已变化，已清除上一账号的任务资料与认领口令，并读取当前账号状态。');
        } else {
          await read(current.current?.id);
          setFeedback('已重新确认当前账号的任务状态。');
        }
      });
    };
    window.addEventListener('pageshow', verifyAccount);
    window.addEventListener('focus', verifyAccount);
    window.addEventListener('online', verifyAccount);
    return () => { window.removeEventListener('pageshow', verifyAccount); window.removeEventListener('focus', verifyAccount); window.removeEventListener('online', verifyAccount); };
  }, [checkOwnerScope, installRun, mounted, perform, read, request]);

  useEffect(() => {
    if (!run || run.state !== 'researching' || run.claimable || !run.claim_expires) return;
    const id = run.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const checkLease = async () => {
      if (stopped) return;
      if (!lock.current && document.visibilityState !== 'hidden' && current.current?.id === id) {
        try { await read(id); } catch { /* A failed state read never removes the held claim. */ }
      }
      if (!stopped) timer = setTimeout(checkLease, 15_000);
    };
    timer = setTimeout(checkLease, Math.min(15_000, Math.max(1000, Date.parse(run.claim_expires) - Date.now() + 500)));
    return () => { stopped = true; clearTimeout(timer); };
  }, [read, run]);

  function retainClaim(id: string, token: string) {
    // Retain synchronously before any read or state update can fail. Nothing is
    // written to URLs, browser storage, rendered JSON, or diagnostic output.
    heldClaims.current = { ...heldClaims.current, [id]: { research_id: id, token } };
    setClaims(heldClaims.current);
  }

  async function create() {
    if (!verifiedOwner || !ownerScope.current || authRequired) return;
    await perform(async () => {
      requestKey.current ??= crypto.randomUUID();
      try {
        const response = await request({ action: 'create', request_key: requestKey.current }, undefined, ownerScope.current);
        const next = researchRunFrom(response);
        if (!next) throw new ResearchRequestError('创建状态未确认');
        if (!mounted.current) return;
        checkOwnerScope(response);
        installRun(next); setConnected(response.connected); requestKey.current = null; setRetryCreate(false);
        setFeedback('本次热榜与近期文章已冻结。需要实际网页研究后才能保存核验结果。');
      } catch (failure) {
        if (mounted.current) setRetryCreate(true);
        if (failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0)) throw failure;
        setVerifiedOwner(false);
        try { await read(); } catch { /* Only a confirmed same-owner read permits a retry. */ }
        throw new Error(`${researchError(failure)}。重试将沿用同一请求编号，不会另开一轮。`);
      }
    });
  }

  async function claim() {
    const target = current.current;
    if (!target) return;
    await perform(async () => {
      const response = await request({ action: 'claim', research_id: target.id });
      checkOwnerScope(response);
      if (typeof response.claim_token === 'string' && response.claim_token) retainClaim(target.id, response.claim_token);
      const next = researchRunFrom(response);
      if (mounted.current) {
        installRun(next);
        setFeedback(response.claim_token ? '已认领。口令只保留在当前页面内存中，请保持本页打开并完成研究。' : heldClaims.current[target.id]?.token ? '已读回认领状态，当前持有的口令仍保留。' : '任务已有认领状态，本次未返回口令。请使用原认领页面或原认领口令，不要将重复认领当作恢复。');
      }
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = current.current;
    if (!target || !confirmed) return;
    await perform(async () => {
      if (pendingSave.current && pendingSave.current.research_id !== target.id) throw new Error('另一任务的保存结果尚未确认，请先读回那一任务。');
      let submission = pendingSave.current;
      if (!submission) {
        let parsed: unknown;
        try { parsed = JSON.parse(resultJson); } catch { throw new Error('研究结果不是有效 JSON，请检查后再保存。'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('研究结果必须是 JSON 对象。');
        if (unfilledTemplate.current && JSON.stringify(parsed) === JSON.stringify(JSON.parse(unfilledTemplate.current))) throw new Error('模板尚未填写，不能直接保存。请完成真实网页核验，并如实更新结果、核验范围与不足原因。');
        submission = { research_id: target.id, input_hash: target.input_hash, result: parsed as ResearchResult };
      }
      // Always read this exact run before a (re)submission. The newest task may
      // be unrelated, and a lost save response may already have committed.
      const latest = await read(target.id);
      if (!latest) throw new Error('没有读到该任务，已停止保存。');
      if (latest.state === 'completed') { setFeedback('该任务已经保存完成，本次只读回结果，没有再次提交。'); return; }
      if (latest.state !== 'researching' || latest.input_hash !== submission.input_hash) throw new Error('任务状态或冻结输入已变化，已停止保存，请核对读回结果。');
      const token = heldClaims.current[target.id]?.token;
      if (!token) throw new Error('缺少当前任务的认领口令，请在原认领页面继续。');
      pendingSave.current = submission; setPendingSaveId(target.id);
      try {
        const response = await request({ action: 'save', ...submission, claim_token: token });
        const saved = researchRunFrom(response);
        if (!saved || saved.state !== 'completed') throw new ResearchRequestError('保存结果未确认');
        if (!mounted.current) return;
        checkOwnerScope(response);
        installRun(saved); pendingSave.current = null; setPendingSaveId(null);
        setFeedback('研究结果已保存，选题页可读取本任务的最终结果。');
      } catch (failure) {
        if (!mounted.current) return;
        // Read back before presenting any retry, even when the POST failed.
        try {
          const saved = await read(target.id);
          if (saved?.state === 'completed') { setFeedback('保存响应曾中断，已读回确认研究结果保存成功，没有再次提交。'); return; }
          if (saved?.state === 'failed') throw new Error('任务已结束为失败状态，不能继续保存。');
        } catch { /* Keep both the original payload and held claim on read errors. */ }
        if (failure instanceof ResearchRequestError && failure.status !== null && failure.status >= 400 && failure.status < 500) {
          pendingSave.current = null; setPendingSaveId(null);
          throw failure;
        }
        throw new Error(`${researchError(failure)}。保存结果未确认；下次会先读取同一任务，确认未完成后才重试同一份结果。`);
      }
    });
  }

  async function fail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = current.current;
    if (!target) return;
    await perform(async () => {
      const latest = await read(target.id);
      if (latest && ['completed', 'failed'].includes(latest.state)) { setFeedback('任务已有最终状态，本次只读取，没有改写。'); return; }
      const token = heldClaims.current[target.id]?.token;
      if (!token) throw new Error('需要原认领口令才能记录失败。');
      try {
        const response = await request({ action: 'fail', research_id: target.id, claim_token: token, message: failureMessage.trim() });
        checkOwnerScope(response);
        installRun(researchRunFrom(response)); setFeedback('已记录本次研究失败及原因，没有生成替代结果。');
      } catch (failure) {
        try { const recovered = await read(target.id); if (recovered?.state === 'failed') { setFeedback('已读回确认失败原因保存成功。'); return; } } catch { /* Preserve the claim for recovery. */ }
        throw failure;
      }
    });
  }

  const token = run ? claims[run.id]?.token ?? '' : '';
  const terminal = !!run && ['completed', 'failed'].includes(run.state);
  return <main className="studio-main daily-run-page">
    <StudioNav current="topics" />
    <header className="site-header"><h1>本人选题研究页</h1><span className="edition">人工核验与结果回传</span></header>
    <p className="daily-run-note">创建任务只冻结本轮热榜与近期文章。研究者须实际打开公开网页，核实事件时间、事实和原始来源，再填写结果。此页不会自动调用模型，也不会生成文章或公开发布。</p>
    <p><a href="/topics">← 返回文娱热点雷达</a></p>
    {feedback && <p className="inline-feedback" role="status" aria-live="polite">{feedback}</p>}
    {error && <p className="error" role="alert">{error}{authRequired && <a href="/signin-with-chatgpt?return_to=%2Ftopics%2Fresearch-helper" target="_top">使用本人账号重新登录</a>}</p>}
    {connected === false && <p className="topic-risk-note">自动研究尚未连接。任务仍可在这里手动认领和回传；等待认领不代表网页已经核验。</p>}

    <section className="manual-work-section" aria-labelledby="research-read-title">
      <h2 id="research-read-title">1. 读取或创建任务</h2>
      <form className="daily-run-form" onSubmit={(event) => { event.preventDefault(); void perform(async () => { const next = await read(researchId.trim()); setFeedback(next ? '已读回该任务完整状态。' : '没有找到任务。'); }); }}>
        <label>研究任务编号<input name="research_id" value={researchId} onChange={(event) => setResearchId(event.target.value)} autoComplete="off" required disabled={busy} /></label>
        <div className="manual-actions" style={{ flexWrap: 'wrap' }}>
          <button type="submit" className="secondary" disabled={busy || !researchId.trim()}>读取这个任务</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void perform(async () => { const next = await read(); setFeedback(next ? '已读取最新任务。' : '目前没有研究任务。'); })}>读取最新任务</button>
          <button type="button" disabled={busy || !loaded || authRequired || !verifiedOwner || !!pendingSaveId || (!!run && !terminal && !retryCreate)} onClick={() => void create()}>{retryCreate ? '重试同一创建请求' : '刷新并创建研究'}</button>
        </div>
      </form>
      <p className="section-hint">刷新页面只读取已有状态。创建请求网络中断时，本页重试沿用同一编号；创建冷却为 60 秒。</p>
    </section>

    {run && <>
      <section className="manual-work-section" aria-labelledby="research-input-title">
        <h2 id="research-input-title">2. 完整冻结输入</h2>
        <p>{researchStateLabels[run.state]} · 第 {run.generation} 次 · 创建 {researchTime(run.created)} · 更新 {researchTime(run.updated)}（北京时间）</p>
        <p className="section-hint">通知状态：{run.dispatch_state}。请核对各来源抓取时间、缓存与失败标记，以及近期文章覆盖范围。旧缓存不作为本轮精选依据。</p>
        {run.error && <p className="error">{run.error}</p>}
        <label>任务编号、输入哈希与完整快照<textarea readOnly rows={18} aria-label="完整冻结研究输入" value={JSON.stringify({ research_id: run.id, input_hash: run.input_hash, input: run.input }, null, 2)} /></label>
        <details><summary>完整任务读取结果（含最终结果与错误）</summary><textarea readOnly rows={18} aria-label="完整研究任务读取结果" value={JSON.stringify(run, null, 2)} /></details>
        {run.state === 'queued' && <button type="button" className="secondary" disabled={busy || !verifiedOwner || authRequired} onClick={() => void perform(async () => {
          if (!verifiedOwner || !ownerScope.current || authRequired) return;
          try {
            const response = await request({ action: 'dispatch', research_id: run.id }, undefined, ownerScope.current);
            checkOwnerScope(response);
            if (response.run) installRun(researchRunFrom(response));
            setConnected(response.connected); setFeedback('已检查同一任务的通知投递状态；未创建新的研究任务。');
          } catch (failure) {
            setVerifiedOwner(false);
            if (!(failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0))) {
              try { await read(run.id); } catch { /* Retain the same task until a confirmed read succeeds. */ }
            }
            throw failure;
          }
        })}>重试待认领通知（至少间隔 60 秒）</button>}
      </section>

      <section className="manual-work-section" aria-labelledby="research-claim-title">
        <h2 id="research-claim-title">3. 认领并开展网页核验</h2>
        {run.owner_execution_blocked&&['completed','failed'].includes(run.state)&&<p className="section-hint">结果或失败原因已保存，原执行尚未可信结清。请通过正常只读执行预览核对终态与全部动作；结清前不会创建或认领下一篇研究。</p>}
        <button type="button" disabled={busy || !run.claimable} onClick={() => void claim()}>认领这一个任务</button>
        <button type="button" disabled={busy||run.state!=='researching'||!token} onClick={()=>void perform(async()=>{
          const target=current.current;if(!target||target.state!=='researching')throw Error('请先读取原任务');
          const held=heldClaims.current[target.id]?.token;if(!held)throw Error('需要原持有者凭据');
          if(renewalRequest.current?.research_id!==target.id)renewalRequest.current={research_id:target.id,key:crypto.randomUUID()};
          const response=await request({action:'renew',research_id:target.id,request_key:renewalRequest.current.key,claim_token:held});
          if(checkOwnerScope(response))throw Error('账号已变化，已停止原任务操作');installRun(researchRunFrom(response));renewalRequest.current=null;setFeedback('原任务已续期，执行者和凭据保持不变。');
        })}>续期原任务</button>
        <label>当前任务认领口令<input name="research_claim_token" type="password" value={token} autoComplete="off" spellCheck={false} disabled={busy || terminal} onChange={(event) => retainClaim(run.id, event.target.value)} /></label>
        <p className="section-hint">口令仅保留在当前页面内存，不会写入地址、浏览器存储或结果 JSON。请保持本页打开；读取失败不会清除已持有口令。</p>
        {run.state === 'researching' && !run.claimable && run.claim_expires && <p className="section-hint">本次提交有效至 {researchTime(run.claim_expires)}（北京时间）。{token ? '可用原凭据续期同一任务，包括已到期但未被安全恢复的任务。' : '请在原执行页面继续；凭据丢失时需要人工核查。'}更换执行者须先核验原执行结束与全部动作结清；当前可信终态连接尚未接通，不能仅因到期换人。</p>}
        <ol className="daily-run-note">
          <li>以冻结输入为范围，先检查当轮可用榜单；核对相同事件、近期文章和已有选题，避免重复。</li>
          <li>实际访问可信的公开来源。热榜标题、搜索摘要和猜测不足以证明事实；记录来源标题、完整 HTTPS 链接、发布时间与实际访问时间。</li>
          <li>精选最多 5 条。每条必须有事件时间、事实与来源对应关系；将爆点判断和写作建议与已核验事实分开。</li>
          <li>证据不足时如实减少精选并写明原因。未核验线索只能放在 additional 中，不得用旧结果、虚构来源或私人传闻补位。</li>
        </ol>
      </section>

      {!terminal && <section className="manual-work-section" aria-labelledby="research-save-title">
        <h2 id="research-save-title">4. 保存本次研究结果</h2>
        <p className="section-hint">下方模板仅使用本任务真实候选标题，初始精选为空，未编造研究事实。请填入实际研究结果后再保存。candidate_ids 取自冻结输入；additional 标题须与冻结候选完全一致。</p>
        <details><summary>精选条目字段格式与校验要求</summary>
          <p className="daily-run-note">把核验后的条目加入 featured 数组。event_key 不可重复，同一 candidate_id 不可分配到多条精选。sources 内 id 唯一，facts.source_ids 必须对应来源。event_time 填写已确认的事件时间，120 字以内；其他时间字段使用带时区 ISO 字符串，无法查到发布时间时 published_at 为 null。实际访问时间须符合本轮时间范围，不能伪造；checked_at 使用真实核验时间。不足 5 条时 shortfall 必须说明原因。</p>
          <textarea readOnly rows={16} aria-label="精选条目字段格式，空值需要填写" value={featuredShape} />
        </details>
        <form className="daily-run-form" onSubmit={save}>
          <label>研究结果 JSON<textarea name="research_result" rows={22} value={resultJson} onChange={(event) => { setResultJson(event.target.value); setConfirmed(false); }} required disabled={busy || !!pendingSaveId} spellCheck={false} /></label>
          <label className="manual-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} required />确认已如实记录实际网页核验与不足，未将模板或未核验线索伪装为事实，结果对应本任务冻结输入</label>
          {pendingSaveId && <p className="topic-risk-note">任务 {pendingSaveId} 的保存结果尚未确认。重试前会先读回同一任务；已完成则直接显示结果，否则仅重试原先提交的 JSON。</p>}
          <button type="submit" disabled={busy || !token || !confirmed || run.state !== 'researching'}>{pendingSaveId ? '核对后重试原保存' : '保存研究结果'}</button>
        </form>
        <details style={{ marginTop: 18 }}><summary>无法完成研究：记录失败原因</summary>
          <form className="daily-run-form" onSubmit={fail}>
            <label>具体阻塞或失败原因<textarea rows={3} value={failureMessage} onChange={(event) => setFailureMessage(event.target.value)} required maxLength={500} disabled={busy || !!pendingSaveId} /></label>
            <button type="submit" className="secondary" disabled={busy || !token || !failureMessage.trim() || !!pendingSaveId || run.state !== 'researching'}>记录本次研究失败</button>
          </form>
        </details>
      </section>}
      {run.state === 'completed' && <section className="manual-work-section" aria-labelledby="research-final-title"><h2 id="research-final-title">已保存的研究结果</h2><ResearchResultView key={run.id} run={run} /><label>最终结果完整 JSON<textarea readOnly rows={18} value={JSON.stringify(run.result, null, 2)} /></label></section>}
    </>}
  </main>;
}
