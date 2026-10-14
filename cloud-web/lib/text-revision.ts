import {outlineWorkflowMutationFence} from './outline-flow';
import {readDailyEditorialDraft,dailySourceBinding,type DailySourceBinding} from './daily-editorial';
import {inspectCredentialValue} from './credential-boundary';
import {db} from './test-store';
import {readStepwiseTextTest, stepwiseKeys, stepwiseTextAuthorizationKey, stepwiseTextInstructions} from './stepwise-text';
import {hashText, type WritingInputSnapshot} from './writing-input';
import {assertStepwiseCredentialFree,protectPreparedArticleForOwner} from './claude';
import {effectiveWritingPrompt, effectiveWritingStyleVersion} from './writing-supplement';
import {parseClaudeArticle} from './claude-article-parser';

// Owner-attested, separately executed agent receipts only. No provider/queue API.
function outlineRevisionFence(snapshot:Snapshot,alias:string){const id=snapshot.daily_source?.outline_run_id?.split(':').at(-1);if(!id)return '1';if(!uuid(id))throw Error(revisionErrors.binding);return `EXISTS(SELECT 1 FROM outline_flows o WHERE o.id='${id}' AND o.owner=${alias}.owner AND ${outlineWorkflowMutationFence('o')})`;}
const namespace = 'text_revision';
const stages = ['review', 'rewrite', 'verify'] as const;
type Stage = typeof stages[number];
type Article = {title: string; paragraphs: string[]};
type Participant = {actor_id: string; model: string};
type Issue = {id: string; paragraph: number; quote: string; problem: string; recommendation: string; source_urls: string[]};
type Change = {issue_id: string; paragraph: number; quote: string; change: string};
type Check = {issue_id: string; paragraph: number; quote: string; resolved: boolean; reason: string};
type Report = {status: 'completed' | 'failed'; reason?: string; issues?: Issue[]; article?: Article; changes?: Change[]; passed?: boolean; checks?: Check[]; remaining_problems?: string[]};
type Snapshot = {
 daily_source?:DailySourceBinding; namespace_version: 1; flow_id: string; run_id: string; writer: 'xiaoyu' | 'claude'; day: string;
 scope: string; provider_model: string; prompt_version: string; writing_prompt: string;
 stage_system_prompts: Record<Stage, string>;
 writing_input: WritingInputSnapshot;
 initial: {version: 1; article: Article; body_sha256: string; source: string; actor_id: string; execution_id: string};
 participants: Record<Stage, Participant>;
 paid_scope: {id: string; potential_additional_calls: 3; approved_calls: 0; used_calls: 0; provider_enabled: false};
};
type Receipt = {stage: Stage; execution_id: string; actor_id: string; model: string; source: 'owner_attested_agent_result'; input_version: number; input_sha256: string; prompt_version: string; result_sha256: string; raw_result?: string; report: Report; completed_at: string};
type Root = {namespace_version: 1; snapshot_hash: string; results: Partial<Record<Stage, Receipt>>; confirmed_body_sha256?: string};
type Flow = {snapshot: Snapshot; row: {id: string; owner: string; day: string; state: string; response: string; created: string}; root: Root};
type Lease = {state: string; token: string; expires: string; article_id: string; input_snapshot: string};
export const revisionErrors = {
 invalid: '文字修订参数或阶段结果无效', confirm: '本阶段需要明确 confirm: true；请等待用户确认',
 missing: '未找到本人的文字修订流程', frozen: '文字修订输入或结果已冻结，只能原样只读回放',
 phase: '尚未到达本阶段，或前一阶段已失败；不能继续', binding: '版本、模型、执行来源或认领凭证不一致',
 independent: '审稿和复核必须由写作者之外的独立 agent 执行', expired: '阶段认领已过期，只能读取；不能重新认领',
 credentials: '阶段资料或结果含凭证，已停止', unknown: '文字修订状态未确认，请只读恢复',
} as const;
export function textRevisionPublicError(error: unknown) {
 const message = error && typeof error === 'object' && 'message' in error ? error.message : '';
 return typeof message === 'string' && Object.values(revisionErrors).some(x => x === message) ? message : revisionErrors.unknown;
}
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
const instant = () => new Date().toISOString();
const rootId = (owner: string, id: string) => `${namespace}:${owner}:${id}`;
const runKind = (id: string, stage: Stage) => `${namespace}:${id}:${stage}`;
function keys(value: unknown, names: string[]): asserts value is Record<string, unknown> {try {stepwiseKeys(value, names);} catch {throw Error(revisionErrors.invalid);}}
function confirm(value: Record<string, unknown>) {if (value.confirm !== true) throw Error(revisionErrors.confirm);}
function stageOf(value: unknown): Stage {if (!stages.some(x => x === value)) throw Error(revisionErrors.invalid); return value as Stage;}
function short(value: unknown, limit = 1000): asserts value is string {if (typeof value !== 'string' || !value.trim() || value.length > limit) throw Error(revisionErrors.invalid);}
async function configured(owner: string, model: string) {
 const c = await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(owner).first<{model: string; enabled: string}>();
 if (c?.enabled !== '1' || c.model !== model) throw Error(revisionErrors.binding);
}
async function tokenList(owner: string, snapshot: Snapshot) {
 const rows = await db().prepare('SELECT token FROM writing_runs WHERE owner=? AND (run_kind=? OR run_kind IN (?,?,?))').bind(owner, `stepwise_text:${snapshot.run_id}`, ...stages.map(s => runKind(snapshot.flow_id, s))).all<{token: string}>();
 return rows.results.map(x => x.token).filter(Boolean);
}
async function credentialFree(owner: string, value: unknown, tokens: string[] = [], daily=false) {
 try {if (inspectCredentialValue(value, tokens).hit) throw Error(revisionErrors.credentials); if(daily){if((await protectPreparedArticleForOwner(owner,value)).hit)throw Error(revisionErrors.credentials);}else await assertStepwiseCredentialFree(owner, value, tokens);} catch {throw Error(revisionErrors.credentials);}
}
async function flowFor(owner: string, id: unknown): Promise<Flow> {
 if (!uuid(id)) throw Error(revisionErrors.invalid);
 const b = await db().prepare('SELECT snapshot,input_hash FROM manual_writing_batches WHERE id=? AND owner=?').bind(id, owner).first<{snapshot: string; input_hash: string}>();
 if (!b) throw Error(revisionErrors.missing);
 const snapshot: Snapshot = JSON.parse(b.snapshot);
 if (snapshot.namespace_version !== 1 || snapshot.flow_id !== id || snapshot.scope !== (snapshot.daily_source?`${namespace}:daily-v1:${snapshot.daily_source.run_id}`:`${namespace}:${stepwiseTextAuthorizationKey}:${snapshot.run_id}:${snapshot.writer}`) || await hashText(b.snapshot) !== b.input_hash) throw Error(revisionErrors.frozen);
 if(snapshot.daily_source){const draft=await readDailyEditorialDraft(owner,snapshot.day,snapshot.writer,snapshot.daily_source.outline_run_id);if(JSON.stringify(dailySourceBinding(draft))!==JSON.stringify(snapshot.daily_source)||snapshot.run_id!==draft.row.run_id||snapshot.initial.body_sha256!==draft.row.initial_sha256||JSON.stringify(snapshot.initial.article)!==draft.row.initial_json||JSON.stringify(snapshot.writing_input)!==draft.row.input_snapshot)throw Error(revisionErrors.frozen);}
 const row = await db().prepare('SELECT id,owner,day,state,response,created FROM claude_attempts WHERE id=? AND owner=?').bind(rootId(owner, id), owner).first<Flow['row']>();
 if (!row) throw Error(revisionErrors.unknown);
 const envelope = JSON.parse(row.response), root: Root = envelope.text_revision;
 if (Object.keys(envelope).length !== 1 || root?.namespace_version !== 1 || root.snapshot_hash !== b.input_hash) throw Error(revisionErrors.frozen);
 await credentialFree(owner, {snapshot, root}, await tokenList(owner, snapshot),!!snapshot.daily_source);
 return {snapshot, row, root};
}
function nextStage(root: Root): Stage | null {
 for (const s of stages) {
  const r = root.results[s];
  if (!r) return s;
  if (r.report.status !== 'completed' || (s === 'verify' && !r.report.passed)) return null;
 }
 return null;
}
function phase(flow: Flow) {
 if (flow.root.confirmed_body_sha256) return 'user_confirmed';
 for (const s of stages) if (flow.root.results[s]?.report.status === 'failed') return `${s}_failed`;
 if (flow.root.results.verify?.report.passed === false) return 'verification_failed';
 return nextStage(flow.root) ? `${nextStage(flow.root)}_pending` : flow.snapshot.daily_source?'verified':'awaiting_user_confirmation';
}
const tasks: Record<Stage, string> = {
 review: '你是独立审稿者，不能冒充写作者自检。逐段核对冻结资料、框架、完整写作规则与事实推进，特别检查机械出处开头、中途自我宣告、自然口语与有根据的调侃幽默、短句与通常1–2句一段的手机阅读节奏；不能硬切语义，笑点不能编造或伤害困境中的人物。列出具体问题，段落从1计数，引用须在初稿对应段落中，来源URL仅可用冻结记录。返回JSON：{"status":"completed","issues":[{"id":"issue-1","paragraph":1,"quote":"原稿短引文","problem":"问题","recommendation":"修改建议","source_urls":[]}]}。没有问题时issues可为空。材料不足或执行失败返回{"status":"failed","reason":"insufficient_evidence"}。不写改稿。',
 rewrite: '你是重写者。依据独立审稿问题清单重写完整文章，不能只解释计划，也不能替审稿者宣告已通过。保留证据边界，实际落实四条表达规则（自然出处、融入分析的判断、娱乐号口语与有根据的幽默、短句与通常1–2句一段），不能硬切语义或写碎片口号；手机阅读节奏优先于旧长句长段默认规则。标题正文分离，正文2000–3000字，无图。每个问题须有一条具体变更，引用指向改稿段落。返回JSON：{"status":"completed","article":{"title":"标题","paragraphs":["正文"]},"changes":[{"issue_id":"issue-1","paragraph":1,"quote":"改稿短引文","change":"已实施变更"}]}。无法完成返回{"status":"failed","reason":"execution_failed"}。',
 verify: '你是独立复核者，不能是初稿作者或重写者。依据问题清单、原稿、改稿及变更逐项核验事实、框架、规则和2000–3000字；审稿结果不能被重写者的自我宣告代替。每个问题必须复核，引用须在改稿对应段落中。还要报告新引入的问题。返回JSON：{"status":"completed","passed":true,"checks":[{"issue_id":"issue-1","paragraph":1,"quote":"改稿短引文","resolved":true,"reason":"复核理由"}],"remaining_problems":[]}。仍有问题时passed=false并列出问题；执行失败返回{"status":"failed","reason":"execution_failed"}。通过仅进入待用户确认，不能投递。',
};
async function stageInput(flow: Flow, stage: Stage) {
 const s = flow.snapshot, version = stage === 'verify' ? 2 : 1;
 const article = version === 2 ? flow.root.results.rewrite?.report.article : s.initial.article;
 const system_prompt = s.stage_system_prompts[stage];
 const user_prompt = JSON.stringify({...((s.daily_source?.outline_run_id)?{approved_generation_input:s.writing_input.user_prompt}:{}),flow_id: s.flow_id, stage, input_version: version, topic: s.writing_input.topic, materials: s.writing_input.materials, outline: s.writing_input.outline, sources: s.writing_input.sources, initial_article: s.initial.article, article, review: flow.root.results.review?.report ?? null, changes: flow.root.results.rewrite?.report.changes ?? null});
 const bound = {flow_id: s.flow_id, stage, input_version: version, prompt_version: s.prompt_version, participant: s.participants[stage], system_prompt, user_prompt};
 return {...bound, input_sha256: await hashText(JSON.stringify(bound))};
}
async function leaseFor(owner: string, flow: Flow, stage: Stage) {
 return db().prepare('SELECT state,token,expires,article_id,input_snapshot FROM writing_runs WHERE owner=? AND day=? AND writer=? AND run_kind=?').bind(owner, flow.snapshot.day, flow.snapshot.writer, runKind(flow.snapshot.flow_id, stage)).first<Lease>();
}

export async function createTextRevision(owner: string, value: unknown) {
 keys(value, ['run_id', 'writer', 'writer_actor_id', 'writer_execution_id', 'participants', 'expected_provider_model', 'expected_prompt_version', 'confirm']); confirm(value);
 if (!uuid(value.run_id) || !uuid(value.writer_actor_id) || !uuid(value.writer_execution_id) || !['xiaoyu', 'claude'].includes(String(value.writer)) || value.expected_prompt_version !== effectiveWritingStyleVersion) throw Error(revisionErrors.binding);
 const writerActor = String(value.writer_actor_id).toLowerCase(), writerExecution = String(value.writer_execution_id).toLowerCase();
 keys(value.participants, [...stages]);
 const participants = {} as Record<Stage, Participant>;
 for (const stage of stages) {const p = value.participants[stage]; keys(p, ['actor_id', 'model']); if (!uuid(p.actor_id)) throw Error(revisionErrors.binding); short(p.model, 120); participants[stage] = {actor_id: p.actor_id.toLowerCase(), model: p.model};}
 for (const stage of ['review', 'verify'] as const) if ([writerActor, participants.rewrite.actor_id].includes(participants[stage].actor_id)) throw Error(revisionErrors.independent);
 const source = await readStepwiseTextTest(owner, {run_id: value.run_id});
 if (!source.snapshot || !source.writers || !source.run_id || !source.day) throw Error(revisionErrors.missing);
 const writer = value.writer as Snapshot['writer'], output = source.writers[writer].output;
 if (source.writers[writer].attempt_state !== 'completed' || !output?.article || !output.body_sha256 || value.expected_provider_model !== source.snapshot.model) throw Error(revisionErrors.phase);
 if (await hashText(JSON.stringify(output.article)) !== output.body_sha256) throw Error(revisionErrors.frozen);
 const scope = `${namespace}:${stepwiseTextAuthorizationKey}:${source.run_id}:${writer}`;
 const old = await db().prepare('SELECT id FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner, scope).first<{id: string}>();
 if (old) {
  const stored = await flowFor(owner, old.id), s = stored.snapshot;
  if (s.initial.actor_id.toLowerCase() !== writerActor || s.initial.execution_id.toLowerCase() !== writerExecution || JSON.stringify(Object.fromEntries(stages.map(stage => [stage, {...s.participants[stage], actor_id: s.participants[stage].actor_id.toLowerCase()}]))) !== JSON.stringify(participants) || s.prompt_version !== value.expected_prompt_version || s.provider_model !== value.expected_provider_model) throw Error(revisionErrors.frozen);
  return {created: false, read_only: true, ...await readTextRevision(owner, {flow_id: old.id})};
 }
 await configured(owner, source.snapshot.model);
 const id = crypto.randomUUID();
 const stage_system_prompts = Object.fromEntries(stages.map(stage => [stage, effectiveWritingPrompt + '\n\n' + stepwiseTextInstructions + '\n\n本阶段只执行下面的独立阶段任务，输出格式以阶段JSON约定为准，不能触发后续阶段。\n' + tasks[stage]])) as Record<Stage, string>;
 const snapshot: Snapshot = {namespace_version: 1, flow_id: id, run_id: source.run_id, writer, day: source.day, scope, provider_model: source.snapshot.model, prompt_version: effectiveWritingStyleVersion, writing_prompt: effectiveWritingPrompt, stage_system_prompts, writing_input: source.snapshot.writers[writer], initial: {version: 1, article: output.article, body_sha256: output.body_sha256, source: output.source, actor_id: writerActor, execution_id: writerExecution}, participants, paid_scope: {id: `${namespace}:paid:${id}`, potential_additional_calls: 3, approved_calls: 0, used_calls: 0, provider_enabled: false}};
 await credentialFree(owner, snapshot, await tokenList(owner, snapshot));
 const raw = JSON.stringify(snapshot), hash = await hashText(raw), root: Root = {namespace_version: 1, snapshot_hash: hash, results: {}};
 const inserted = await db().batch([
  db().prepare('INSERT OR IGNORE INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').bind(id, owner, scope, source.day, hash, raw, instant()),
  db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'revision_open',?,? FROM manual_writing_batches WHERE id=? AND owner=?").bind(rootId(owner, id), JSON.stringify({text_revision: root}), instant(), id, owner),
 ]);
 if (!inserted[0].meta.changes) return createTextRevision(owner, value);
 return {created: true, read_only: false, ...await readTextRevision(owner, {flow_id: id})};
}
export async function createDailyTextRevision(owner:string,value:unknown,outlineRunId?:string){
 keys(value,['day','writer','writer_actor_id','writer_execution_id','participants','expected_prompt_version','confirm']);confirm(value);
 if(typeof value.day!=='string'||!['xiaoyu','claude'].includes(String(value.writer))||!uuid(value.writer_actor_id)||!uuid(value.writer_execution_id))throw Error(revisionErrors.invalid);
 const draft=await readDailyEditorialDraft(owner,value.day,String(value.writer),outlineRunId);
 if(value.expected_prompt_version!==draft.input.prompt_version)throw Error(revisionErrors.binding);
 const writerActor=value.writer_actor_id.toLowerCase(),writerExecution=value.writer_execution_id.toLowerCase();
 keys(value.participants,[...stages]);const participants={} as Record<Stage,Participant>;
 for(const stage of stages){const p=value.participants[stage];keys(p,['actor_id','model']);if(!uuid(p.actor_id))throw Error(revisionErrors.binding);short(p.model,120);participants[stage]={actor_id:p.actor_id.toLowerCase(),model:p.model};}
 for(const stage of ['review','verify'] as const)if([writerActor,participants.rewrite.actor_id].includes(participants[stage].actor_id))throw Error(revisionErrors.independent);
 const scope=`${namespace}:daily-v1:${draft.row.run_id}`;
 const old=await db().prepare('SELECT id FROM manual_writing_batches WHERE owner=? AND authorization_key=?').bind(owner,scope).first<{id:string}>();
 if(old){const flow=await flowFor(owner,old.id);if(flow.snapshot.initial.actor_id!==writerActor||flow.snapshot.initial.execution_id!==writerExecution||JSON.stringify(flow.snapshot.participants)!==JSON.stringify(participants))throw Error(revisionErrors.frozen);return {created:false,read_only:true,...await readTextRevision(owner,{flow_id:old.id})};}
 let providerModel='agent_initial_text';
 if(draft.row.writer==='claude'){
  const attempt=await db().prepare("SELECT response FROM claude_attempts WHERE id=? AND owner=? AND state='completed'").bind(draft.row.provider_attempt_id,owner).first<{response:string}>();
  if(!attempt)throw Error(revisionErrors.phase);const actual=JSON.parse(attempt.response);
  if(JSON.stringify(parseClaudeArticle(actual.text).article)!==draft.row.initial_json||actual.snapshot?.article_id!==draft.row.article_id)throw Error(revisionErrors.binding);
  providerModel=actual.requested_model;
 }
 const id=crypto.randomUUID();
 const stage_system_prompts=Object.fromEntries(stages.map(stage=>[stage,draft.input.writing_prompt+'\n\n日更独立审改阶段：仅执行此阶段，禁止调用收费provider，禁止配图或投递。复核通过由专用服务器入口交接私人草稿，不代表用户已经审阅。\n'+tasks[stage].replace('通过仅进入待用户确认，不能投递。','通过仅登记为verified，由专用入口完成后续交接；本阶段不投递。')])) as Record<Stage,string>;
 const snapshot:Snapshot={daily_source:dailySourceBinding(draft),namespace_version:1,flow_id:id,run_id:draft.row.run_id,writer:draft.row.writer,day:draft.row.day,scope,provider_model:providerModel,prompt_version:draft.input.prompt_version,writing_prompt:draft.input.writing_prompt,stage_system_prompts,writing_input:draft.input,initial:{version:1,article:draft.article,body_sha256:draft.row.initial_sha256,source:draft.row.initial_source,actor_id:writerActor,execution_id:writerExecution},participants,paid_scope:{id:`${namespace}:paid:${id}`,potential_additional_calls:3,approved_calls:0,used_calls:0,provider_enabled:false}};
 await credentialFree(owner,snapshot,await tokenList(owner,snapshot),true);
 const raw=JSON.stringify(snapshot),hash=await hashText(raw),root:Root={namespace_version:1,snapshot_hash:hash,results:{}};
 const saved=await db().batch([
  db().prepare(outlineRunId?`INSERT OR IGNORE INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) SELECT ?,?,?,?,?,?,? FROM outline_flows o WHERE id=? AND owner=? AND ${outlineWorkflowMutationFence('o')}`:'INSERT OR IGNORE INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').bind(id,owner,scope,draft.row.day,hash,raw,instant(),...(outlineRunId?[outlineRunId.split(':').at(-1),owner]:[])),
  db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'revision_open',?,? FROM manual_writing_batches WHERE id=? AND owner=?").bind(rootId(owner,id),JSON.stringify({text_revision:root}),instant(),id,owner),
 ]);
 if(!saved[0].meta.changes){if(outlineRunId)await readDailyEditorialDraft(owner,value.day,String(value.writer),outlineRunId);return createDailyTextRevision(owner,value,outlineRunId);}
 return {created:true,read_only:false,...await readTextRevision(owner,{flow_id:id})};
}
export async function createOutlineTextRevision(owner:string,value:unknown){
 keys(value,['run_id','writer_actor_id','writer_execution_id','participants','expected_prompt_version','confirm']);confirm(value);
 if(!uuid(value.run_id))throw Error(revisionErrors.invalid);
 const run=await db().prepare("SELECT w.id,w.day FROM writing_runs w JOIN outline_flows o ON w.run_kind='outline_flow:'||o.id AND w.owner=o.owner AND w.article_id=o.article_id WHERE o.id=? AND o.owner=? AND o.writing_input=w.input_snapshot AND o.state IN ('body_review_pending','final_saved','finalized')").bind(value.run_id,owner).first<{id:string;day:string}>();
 if(!run)throw Error(revisionErrors.phase);
 const {run_id,...args}=value;void run_id;
 return createDailyTextRevision(owner,{...args,day:run.day,writer:'claude'},run.id);
}
export async function readTextRevision(owner: string, value: unknown) {
 keys(value, ['flow_id']); const flow = await flowFor(owner, value.flow_id), stage = nextStage(flow.root);
 const lease = stage ? await leaseFor(owner, flow, stage) : null;
 const current_phase = lease ? Date.parse(lease.expires) <= Date.now() ? `${stage}_expired` : `${stage}_claimed` : phase(flow);
 return {flow_id: flow.snapshot.flow_id, current_phase, snapshot: flow.snapshot, initial_version: flow.snapshot.initial, results: flow.root.results, rewritten_version: flow.root.results.rewrite?.report.article ? {version: 2, article: flow.root.results.rewrite.report.article, source: 'agent_text', participant: flow.snapshot.participants.rewrite, body_sha256: await hashText(JSON.stringify(flow.root.results.rewrite.report.article))} : null, pending_input: stage ? await stageInput(flow, stage) : null, pending_item_id: lease?.article_id ?? null, confirmed_body_sha256: flow.root.confirmed_body_sha256 ?? null, automatic_retry: false, paid_scope: flow.snapshot.paid_scope};
}
export async function claimTextRevisionStage(owner: string, value: unknown) {
 keys(value, ['flow_id', 'stage', 'expected_version', 'expected_model', 'expected_prompt_version', 'confirm']); confirm(value);
 const flow = await flowFor(owner, value.flow_id), stage = stageOf(value.stage);
 if (nextStage(flow.root) !== stage) throw Error(revisionErrors.phase);
 const input = await stageInput(flow, stage);
 if (value.expected_version !== input.input_version || value.expected_model !== input.participant.model || value.expected_prompt_version !== input.prompt_version) throw Error(revisionErrors.binding);
 if(!flow.snapshot.daily_source)await configured(owner, flow.snapshot.provider_model);
 const token = crypto.randomUUID(), item = crypto.randomUUID(), expires = new Date(Date.now() + 7200000).toISOString();
 const inserted = await db().prepare(`INSERT OR IGNORE INTO writing_runs(id,owner,day,writer,run_kind,style_version,state,token,expires,article_id,input_snapshot,created,updated) SELECT ?,owner,day,?,?,?,'revision_claimed',?,?,?,?,?,? FROM claude_attempts WHERE id=? AND owner=? AND response=? AND state='revision_open' AND (?=1 OR EXISTS (SELECT 1 FROM claude_settings WHERE owner=? AND model=? AND enabled='1')) AND ${outlineRevisionFence(flow.snapshot,'claude_attempts')}`).bind(`${rootId(owner, flow.snapshot.flow_id)}:${stage}`, flow.snapshot.writer, runKind(flow.snapshot.flow_id, stage), input.prompt_version, token, expires, item, JSON.stringify(input), instant(), instant(), flow.row.id, owner, flow.row.response, flow.snapshot.daily_source?1:0, owner, flow.snapshot.provider_model).run();
 const lease = await leaseFor(owner, flow, stage); if (!lease) throw Error(revisionErrors.unknown);
 if (!inserted.meta.changes) return {claimed: false, read_only: true, item_id: lease.article_id, state: Date.parse(lease.expires) <= Date.now() ? 'expired' : lease.state};
 return {claimed: true, flow_id: flow.snapshot.flow_id, stage, item_id: item, token, expires, prompts: input, source: 'owner_attested_agent_result'};
}
function articleOf(value: unknown): Article {
 keys(value, ['title', 'paragraphs']); short(value.title, 120);
 if (!Array.isArray(value.paragraphs) || value.paragraphs.length < 1 || value.paragraphs.length > 160) throw Error(revisionErrors.invalid);
 for (const p of value.paragraphs) short(p, 1000);
 const article = parseClaudeArticle(JSON.stringify(value)).article, length = article.paragraphs.join('').replace(/\s/g, '').length;
 if (length < 2000 || length > 3000) throw Error(revisionErrors.invalid); return article;
}
function anchor(value: Record<string, unknown>, article: Article) {
 if (!Number.isInteger(value.paragraph) || Number(value.paragraph) < 1 || Number(value.paragraph) > article.paragraphs.length) throw Error(revisionErrors.invalid);
 short(value.quote, 300); if (!article.paragraphs[Number(value.paragraph) - 1].includes(value.quote)) throw Error(revisionErrors.invalid);
}
function reportOf(flow: Flow, stage: Stage, value: unknown): Report {
 keys(value, ['status', 'reason', ...(stage === 'review' ? ['issues'] : stage === 'rewrite' ? ['article', 'changes'] : ['passed', 'checks', 'remaining_problems'])]);
 if (value.status === 'failed') {keys(value, ['status', 'reason']); if (!['execution_failed', 'insufficient_evidence', 'invalid_input'].includes(String(value.reason))) throw Error(revisionErrors.invalid); return value as Report;}
 if (value.status !== 'completed' || value.reason !== undefined) throw Error(revisionErrors.invalid);
 const issueIds = flow.root.results.review?.report.issues?.map(x => x.id) ?? [];
 if (stage === 'review') {
  if (!Array.isArray(value.issues) || value.issues.length > 40) throw Error(revisionErrors.invalid);
  const seen = new Set();
  for (const issue of value.issues) {keys(issue, ['id', 'paragraph', 'quote', 'problem', 'recommendation', 'source_urls']); short(issue.id, 60); if (!/^[a-zA-Z0-9_-]+$/.test(issue.id) || seen.has(issue.id)) throw Error(revisionErrors.invalid); seen.add(issue.id); anchor(issue, flow.snapshot.initial.article); short(issue.problem); short(issue.recommendation); if (!Array.isArray(issue.source_urls) || issue.source_urls.length > 12 || issue.source_urls.some(url => !flow.snapshot.writing_input.sources?.some(s => s.url === url))) throw Error(revisionErrors.invalid);}
 } else {
  const article = stage === 'rewrite' ? articleOf(value.article) : flow.root.results.rewrite?.report.article;
  if (!article) throw Error(revisionErrors.phase);
  if (stage === 'rewrite') {value.article = article; if ((!flow.snapshot.daily_source||issueIds.length>0)&&JSON.stringify(article) === JSON.stringify(flow.snapshot.initial.article)) throw Error(revisionErrors.invalid);}
  const items = stage === 'rewrite' ? value.changes : value.checks;
  if (!Array.isArray(items) || items.length !== issueIds.length) throw Error(revisionErrors.invalid);
  const seen = new Set();
  for (const item of items) {keys(item, ['issue_id', 'paragraph', 'quote', ...(stage === 'rewrite' ? ['change'] : ['resolved', 'reason'])]); short(item.issue_id, 60); if (!issueIds.includes(item.issue_id) || seen.has(item.issue_id)) throw Error(revisionErrors.invalid); seen.add(item.issue_id); anchor(item, article); short(stage === 'rewrite' ? item.change : item.reason); if (stage === 'verify' && typeof item.resolved !== 'boolean') throw Error(revisionErrors.invalid);}
  if (stage === 'verify') {if (typeof value.passed !== 'boolean' || !Array.isArray(value.remaining_problems) || value.remaining_problems.length > 40) throw Error(revisionErrors.invalid); for (const p of value.remaining_problems) short(p); if (value.passed && (value.remaining_problems.length || items.some(x => !x.resolved))) throw Error(revisionErrors.invalid);}
 }
 return value as Report;
}
export async function saveTextRevisionStage(owner: string, value: unknown) {
 keys(value, ['flow_id', 'stage', 'item_id', 'token', 'execution_id', 'actor_id', 'expected_model', 'expected_version', 'expected_prompt_version', 'input_sha256', 'raw_result', 'confirm']); confirm(value);
 const flow = await flowFor(owner, value.flow_id), stage = stageOf(value.stage), lease = await leaseFor(owner, flow, stage);
 if (!lease || !uuid(value.token) || lease.token !== value.token || lease.article_id !== value.item_id || !uuid(value.execution_id)) throw Error(revisionErrors.binding);
 const input = JSON.parse(lease.input_snapshot), participant = flow.snapshot.participants[stage];
 if (typeof value.actor_id !== 'string' || value.actor_id.toLowerCase() !== participant.actor_id.toLowerCase() || value.expected_model !== participant.model || value.expected_version !== input.input_version || value.expected_prompt_version !== input.prompt_version || value.input_sha256 !== input.input_sha256) throw Error(revisionErrors.binding);
 const executionId = value.execution_id.toLowerCase();
 const protectedTokens = await tokenList(owner, flow.snapshot);
 if (protectedTokens.some(token => token.toLowerCase() === executionId)) throw Error(revisionErrors.credentials);
 short(value.raw_result, 40000);
 const resultHash = await hashText(JSON.stringify({raw_result: value.raw_result, execution_id: executionId, input_sha256: value.input_sha256, actor_id: value.actor_id.toLowerCase(), model: value.expected_model}));
 const previous = flow.root.results[stage];
 if (previous) {if (previous.result_sha256 !== resultHash && previous.result_sha256 !== await hashText(JSON.stringify({raw_result: value.raw_result, execution_id: value.execution_id, input_sha256: value.input_sha256, actor_id: value.actor_id, model: value.expected_model}))) throw Error(revisionErrors.frozen); return {saved: true, read_only: true, ...await readTextRevision(owner, {flow_id: flow.snapshot.flow_id})};}
 if (nextStage(flow.root) !== stage) throw Error(revisionErrors.phase);
 if (lease.state !== 'revision_claimed' || Date.parse(lease.expires) <= Date.now()) throw Error(revisionErrors.expired);
 if (executionId === flow.snapshot.initial.execution_id.toLowerCase() || Object.values(flow.root.results).some(x => x.execution_id.toLowerCase() === executionId)) throw Error(revisionErrors.independent);
 if (JSON.stringify(input) !== JSON.stringify(await stageInput(flow, stage))) throw Error(revisionErrors.frozen);
 if(!flow.snapshot.daily_source)await configured(owner, flow.snapshot.provider_model);
 let report: Report, raw: string | undefined = value.raw_result;
 try {await credentialFree(owner, raw, await tokenList(owner, flow.snapshot),!!flow.snapshot.daily_source); const parsed = JSON.parse(raw); await credentialFree(owner, parsed, await tokenList(owner, flow.snapshot),!!flow.snapshot.daily_source); report = reportOf(flow, stage, parsed);}
 catch (error: unknown) {const code = textRevisionPublicError(error); report = {status: 'failed', reason: code === revisionErrors.credentials ? 'credential_detected' : 'invalid_result'}; if (code === revisionErrors.credentials) raw = undefined;}
 const receipt: Receipt = {stage, execution_id: executionId, actor_id: participant.actor_id, model: participant.model, source: 'owner_attested_agent_result', input_version: input.input_version, input_sha256: input.input_sha256, prompt_version: input.prompt_version, result_sha256: resultHash, ...(raw === undefined ? {} : {raw_result: raw}), report, completed_at: instant()};
 const root: Root = {...flow.root, results: {...flow.root.results, [stage]: receipt}}, response = JSON.stringify({text_revision: root});
 await credentialFree(owner, {receipt, root}, protectedTokens,!!flow.snapshot.daily_source);
 const receiptId = `${namespace}:receipt:${owner}:${executionId}`;
 const saved = await db().batch([
  db().prepare(`UPDATE claude_attempts SET response=? WHERE id=? AND owner=? AND response=? AND NOT EXISTS (SELECT 1 FROM claude_attempts WHERE id=? COLLATE NOCASE AND owner=?) AND EXISTS (SELECT 1 FROM writing_runs WHERE owner=? AND run_kind=? AND token=? AND article_id=? AND state='revision_claimed' AND expires>?) AND (?=1 OR EXISTS (SELECT 1 FROM claude_settings WHERE owner=? AND model=? AND enabled='1')) AND ${outlineRevisionFence(flow.snapshot,'claude_attempts')}`).bind(response, flow.row.id, owner, flow.row.response, receiptId, owner, owner, runKind(flow.snapshot.flow_id, stage), value.token, value.item_id, instant(), flow.snapshot.daily_source?1:0, owner, flow.snapshot.provider_model),
  db().prepare("INSERT OR IGNORE INTO claude_attempts(id,owner,day,state,response,created) SELECT ?,owner,day,'revision_receipt',?,? FROM claude_attempts WHERE id=? AND owner=? AND response=?").bind(receiptId, JSON.stringify({text_revision_receipt: {flow_id: flow.snapshot.flow_id, stage, result_sha256: resultHash}}), instant(), flow.row.id, owner, response),
  db().prepare("UPDATE writing_runs SET state='revision_saved',updated=? WHERE owner=? AND run_kind=? AND token=? AND EXISTS (SELECT 1 FROM claude_attempts WHERE id=? AND owner=? AND response=?)").bind(instant(), owner, runKind(flow.snapshot.flow_id, stage), value.token, flow.row.id, owner, response),
 ]);
 if (!saved[0].meta.changes) {const current = await flowFor(owner, flow.snapshot.flow_id); if (current.root.results[stage]?.result_sha256 !== resultHash) throw Error(revisionErrors.frozen);}
 return {saved: true, read_only: !saved[0].meta.changes, ...await readTextRevision(owner, {flow_id: flow.snapshot.flow_id})};
}
export async function confirmTextRevision(owner: string, value: unknown) {
 keys(value, ['flow_id', 'expected_version', 'expected_body_sha256', 'confirm']); confirm(value);
 const flow = await flowFor(owner, value.flow_id), article = flow.root.results.rewrite?.report.article;
 if(flow.snapshot.daily_source)throw Error(revisionErrors.invalid);
 if (!article || flow.root.results.verify?.report.status !== 'completed' || flow.root.results.verify.report.passed !== true || value.expected_version !== 2 || value.expected_body_sha256 !== await hashText(JSON.stringify(article))) throw Error(revisionErrors.phase);
 if (flow.root.confirmed_body_sha256) return {confirmed: true, read_only: true, ...await readTextRevision(owner, {flow_id: flow.snapshot.flow_id})};
 const root = {...flow.root, confirmed_body_sha256: value.expected_body_sha256};
 const update = await db().prepare('UPDATE claude_attempts SET response=? WHERE id=? AND owner=? AND response=?').bind(JSON.stringify({text_revision: root}), flow.row.id, owner, flow.row.response).run();
 if (!update.meta.changes) {const current = await flowFor(owner, flow.snapshot.flow_id); if (current.root.confirmed_body_sha256 !== value.expected_body_sha256) throw Error(revisionErrors.frozen);}
 return {confirmed: true, read_only: !update.meta.changes, ...await readTextRevision(owner, {flow_id: flow.snapshot.flow_id})};
}

const string = {type: 'string'}, confirmation = {type: 'boolean', const: true};
const participantSchema = {type: 'object', properties: {actor_id: string, model: string}, required: ['actor_id', 'model'], additionalProperties: false};
const properties = {flow_id: string, stage: {type: 'string', enum: stages}, expected_version: {type: 'integer', enum: [1, 2]}, expected_model: string, expected_prompt_version: string, confirm: confirmation};
const tool = (name: string, description: string, p: object, readOnly = false) => ({name, description, inputSchema: {type: 'object', properties: p, required: Object.keys(p), additionalProperties: false}, annotations: {readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false}});
export const textRevisionTools = [
 tool('create_outline_text_revision','Create genuine independent review/rewrite/verification for a new approved-outline Claude body, using its exact saved draft and evidence. No provider requests.',{run_id:string,writer_actor_id:string,writer_execution_id:string,participants:{type:'object',properties:{review:participantSchema,rewrite:participantSchema,verify:participantSchema},required:[...stages],additionalProperties:false},expected_prompt_version:string,confirm:confirmation}),
 tool('create_daily_text_revision','Freeze an independent zero-provider review/rewrite/verify flow for a newly saved daily initial draft. Preserves exact initial output and sources. Attest actual independent agents; verified is not user-confirmed.',{day:string,writer:{type:'string',enum:['xiaoyu','claude']},writer_actor_id:string,writer_execution_id:string,participants:{type:'object',properties:{review:participantSchema,rewrite:participantSchema,verify:participantSchema},required:[...stages],additionalProperties:false},expected_prompt_version:string,confirm:confirmation}),
 tool('create_text_revision', 'After user confirmation, freeze one independent text revision workflow per author of this fixed stepwise test. Requires an already saved initial draft and explicitly attested agent identities/model labels. Three additional potential paid calls are isolated with approved=used=0; no provider API is enabled.', {run_id: string, writer: {type: 'string', enum: ['xiaoyu', 'claude']}, writer_actor_id: string, writer_execution_id: string, participants: {type: 'object', properties: {review: participantSchema, rewrite: participantSchema, verify: participantSchema}, required: [...stages], additionalProperties: false}, expected_provider_model: string, expected_prompt_version: string, confirm: confirmation}),
 tool('read_text_revision', 'Read frozen draft versions, separate review issues, rewrite changes, independent verification and current phase. Never returns a token or causes a model request.', {flow_id: string}, true),
 tool('claim_text_revision_stage', 'After explicit user confirmation, claim the next independent agent stage once and return its token and complete frozen input. No retry, renewal, paid request or self-review. Reviewer/verifier must differ from the initial writer and rewriter.', properties),
 tool('save_text_revision_stage', 'After explicit user confirmation, save the exact separately executed agent result bound to its actor, execution, model, input hash and version. JSON must follow the claimed stage schema. Failed/invalid/credential results stop; exact replay is read-only. Agent results never claim to be Claude provider output.', {...properties, item_id: string, token: string, execution_id: string, actor_id: string, input_sha256: string, raw_result: string}),
 tool('confirm_text_revision', 'Only after independent verification passes and the user explicitly confirms the rewritten body, mark version 2 confirmed. Does not create Word, images, articles, events or platform drafts.', {flow_id: string, expected_version: {type: 'integer', const: 2}, expected_body_sha256: string, confirm: confirmation}),
];
export async function textRevisionCall(owner: string, name: string, args: unknown) {
 if(name==='create_outline_text_revision')return createOutlineTextRevision(owner,args);
 if(name==='create_daily_text_revision')return createDailyTextRevision(owner,args);
 if (name === 'create_text_revision') return createTextRevision(owner, args);
 if (name === 'read_text_revision') return readTextRevision(owner, args);
 if (name === 'claim_text_revision_stage') return claimTextRevisionStage(owner, args);
 if (name === 'save_text_revision_stage') return saveTextRevisionStage(owner, args);
 if (name === 'confirm_text_revision') return confirmTextRevision(owner, args);
 throw Error(revisionErrors.invalid);
}
