import {db} from './test-store';
import {hashText} from './writing-input';
import {protectEditorialRequestCredentials,readEditorialRequest} from './editorial-request';

export type DailyEditorialWriter = 'xiaoyu' | 'claude';
const writers: DailyEditorialWriter[] = ['xiaoyu', 'claude'];
const writerStages = ['outline', 'body', 'structure_revision', 'fact_revision'];
const invalid = '日更新链路前置核验参数无效';
function dateKey(value: unknown): string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error(invalid);
 const date = new Date(value + 'T00:00:00.000Z');
 if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw Error(invalid);
 return value;
}
export function dailyEditorialDay(time = new Date()) {
 return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(time);
}
/** Stable across restarts, models and grant revisions. This is an idempotency key,
 * never a fee grant or a signature proving a user/automation authorized work. */
export async function dailyEditorialRequestKey(owner: string, day: string, writer: DailyEditorialWriter) {
 if (typeof owner !== 'string' || !owner || !writers.includes(writer)) throw Error(invalid);
 dateKey(day);
 // RFC UUIDv5 in a fixed application namespace; SHA-1 is an identifier
 // construction here, never authentication or permission evidence.
 const namespace = Uint8Array.from('801041ae95b44e2b8fbda7fa4e255ac2'.match(/../g)!.map(hex => parseInt(hex, 16)));
 const name = new TextEncoder().encode(JSON.stringify(['daily-editorial', 1, owner, day, writer]));
 const bytes = new Uint8Array(namespace.length + name.length);bytes.set(namespace);bytes.set(name, namespace.length);
 const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('');
 const hex = digest.slice(0, 12) + '5' + digest.slice(13, 16) + ((parseInt(digest[16], 16) & 3) | 8).toString(16) + digest.slice(17, 32);
 return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

type ExistingRequest = {id: string; input_json: string; input_sha256: string; state: string; flow_id: string | null};
/** Provider-free, mutation-free preflight. Intentionally has no confirm/approve
 * input: neither a schedule reference nor confirm=true upgrades a legacy grant. */
export async function readDailyEditorialAdapter(owner: string, value: unknown = {}) {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['day', 'writer'].includes(key))) throw Error(invalid);
 const args = value as {day?: unknown; writer?: unknown};
 const day = args.day === undefined ? dailyEditorialDay() : dateKey(args.day);
 if (args.writer !== undefined && !writers.includes(args.writer as DailyEditorialWriter)) throw Error(invalid);
 const selected = args.writer === undefined ? writers : [args.writer as DailyEditorialWriter];
 const config = await db().prepare('SELECT model,enabled FROM claude_settings WHERE owner=?').bind(owner).first<{model: string; enabled: string}>();
 await protectEditorialRequestCredentials(owner, config ? {model: config.model} : {});
 const items = [];
 for (const writer of selected) {
  const requestKey = await dailyEditorialRequestKey(owner, day, writer);
  const legacy = await db().prepare("SELECT id,article_id,state FROM writing_runs WHERE owner=? AND day=? AND writer=? AND run_kind='daily'").bind(owner, day, writer).first<{id: string; article_id: string; state: string}>();
  const request = await db().prepare('SELECT id,input_json,input_sha256,state,flow_id FROM editorial_requests WHERE owner=? AND request_key=?').bind(owner, requestKey).first<ExistingRequest>();
  let requestInspection: 'not_found' | 'single_article_scope' | 'unknown_binding' = 'not_found';
  let canonicalRequest: {state: string; flow_id: string | null} | null = null;
  if (request) {
   requestInspection = 'unknown_binding';
   try {
    const input = JSON.parse(request.input_json);
    await protectEditorialRequestCredentials(owner, input);
    const canonical = await readEditorialRequest(owner, {request_id: request.id});
    if (canonical.current?.request_id === request.id && typeof canonical.current.state === 'string' && (canonical.current.flow_id === null || typeof canonical.current.flow_id === 'string') && await hashText(request.input_json) === request.input_sha256 && input.request_id === request.id && input.contract_version === 1 && input.scope === 'one_public_entertainment_article' && input.authorization?.max_provider_requests === 4 && JSON.stringify(input.authorization.allowed_writer_stages) === JSON.stringify(writerStages)) {
     requestInspection = 'single_article_scope';
     canonicalRequest = {state: canonical.current.state, flow_id: canonical.current.flow_id};
    }
   } catch { /* Do not expose an unsafe packet or claim an unknown grant is valid. */ }
  }
  const blockers = [
   ...(legacy ? ['existing_legacy_daily_slot'] : []),
   ...(requestInspection === 'unknown_binding' ? ['existing_request_binding_unknown'] : []),
   ...(requestInspection === 'single_article_scope' ? ['single_article_grant_is_not_daily_recurring'] : []),
   ...(writer === 'xiaoyu' && requestInspection === 'single_article_scope' ? ['existing_request_author_is_claude_not_xiaoyu'] : []),
   ...(writer === 'xiaoyu' ? ['agent_writer_route_missing'] : ['daily_currency_budget_not_defined_or_enforceable', 'issue_driven_revision_loops_not_implemented']),
   'daily_recurring_grant_binding_not_implemented',
   'durable_cloud_execution_not_verified',
  ];
  items.push({writer, writer_kind: writer === 'xiaoyu' ? 'agent_writer' : 'claude_provider', day, request_key: requestKey, state: 'blocked', execution_ready: false,
   existing_daily: legacy ? {run_id: legacy.id, article_id: legacy.article_id, state: legacy.state, read_only: true} : null,
   existing_request: request ? {request_id: request.id, flow_id: canonicalRequest?.flow_id ?? null, state: canonicalRequest?.state ?? 'unknown', raw_diagnostic: {row_state: request.state, row_flow_id: request.flow_id, authoritative: false}, inspection: requestInspection, frozen_writer: requestInspection === 'single_article_scope' ? 'claude_provider' : 'unknown', read_only: true} : null,
   blockers, legacy_scope: writer === 'claude' ? {max_provider_requests_per_day: 1, max_output_tokens: 14000} : {yylx_provider_requests: 0},
   current_writer_route_supported: writer === 'claude', configured_model: writer === 'claude' && config?.enabled === '1' ? config.model : null,
   supported_provider_stages: writer === 'claude' ? writerStages : [],
   proposed_daily_provider_requests: writer === 'claude' ? null : 0, proposed_call_count_policy: writer === 'claude' ? 'issue_driven_no_fixed_count_cap_requires_owner_bound_recurring_grant' : 'zero_yylx', proposed_budget_is_authorization: false,
   currency_budget_enforcement: 'not_verified', may_create_request: false, may_claim_legacy_slot: false, may_dispatch: false});
 }
 const result = {timezone: 'Asia/Shanghai', day, read_only: true, creates_work: false, changes_legacy_quota: false, items,
  missing_approval: '需明确并可执行的每日人民币费用上限；不设固定次数的新范围须落成独立owner-bound recurring授权，不能改旧grant。请求数/token cap不保证金额硬上限，须核实费率与可执行预算。',
  missing_implementation: '真实小鱼writer提交接口、daily recurring授权与日期作者绑定、真实独审问题驱动且逐轮幂等的必要修订循环、持久云执行及真实验收。恢复08计划不补齐这些条件。'};
 await protectEditorialRequestCredentials(owner, result);
 return result;
}
const tool = {name: 'read_daily_editorial_adapter', description: 'Provider-free read-only daily preflight for both real author identities. Derives stable owner/Beijing-date/writer request keys, reads existing exact slots, reports unsupported agent writer route and missing recurring cost/budget authorization. Never creates a request/grant/flow, claims legacy quota, emits an event, calls provider/models metadata, resumes schedules or treats confirm=true as authority.', inputSchema: {type: 'object', properties: {day: {type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$'}, writer: {type: 'string', enum: writers}}, required: [], additionalProperties: false}, annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false}};
export const dailyEditorialAdapterTools = [tool];
