/** Pure contracts for the issue-driven, two-author editorial workflow.
 * The v2/v3 workflow is deliberately untouched. These payloads retain its V3
 * fact/coverage checks; only short outline revisions have a separate schema.
 */
import {
 editorialErrors, editorialHashText, assertEditorialQualityCandidateAnchor, editorialStageInstruction, parseEditorialArtifact,
 parseEditorialJSONForFormat, type Article, type EditorialArtifact,
 type EditorialContext, type FactReport, type Outline, type ReviewReport,
 type RevisionReport,
} from './editorial-contract';

export const roundStages = ['outline', 'outline_review', 'outline_revision', 'body', 'structure_review', 'structure_revision', 'fact_check', 'fact_revision', 'final_verify'] as const;
export const editorialRoundStages = roundStages;
export type RoundStage = typeof roundStages[number];
export type RoundInputBinding = {version_id: string; sha256: string};
export type OutlineRevisionReport = {outline: Outline; decisions: RevisionReport['decisions']; changes: RevisionReport['changes']};
export type RoundArtifact = EditorialArtifact | OutlineRevisionReport;
export type RoundContext = EditorialContext & {
 /** Both records are required for an anchored review/revision. input_binding
  * describes the currently frozen version; bound_input_binding is copied from
  * the claimed round/receipt, not supplied by model-generated JSON. */
 input_binding?: RoundInputBinding;
 bound_input_binding?: RoundInputBinding;
};
export const roundErrors = {
 ...editorialErrors, binding: '编辑轮次与当前确切版本不一致',
 duplicate: '相同报告和版本已处理，不能重开修订轮',
 no_progress: '主笔未产生实际改善，停止新增收费轮次',
} as const;
const revisions = ['outline_revision', 'structure_revision', 'fact_revision'] as const;
const reviews = ['outline_review', 'structure_review', 'fact_check', 'final_verify'] as const;
const isRevision = (kind: RoundStage) => (revisions as readonly string[]).includes(kind);
const isReview = (kind: RoundStage) => (reviews as readonly string[]).includes(kind);
function fail(message: string = editorialErrors.invalid): never {throw new Error(message);}
function stage(value: unknown): asserts value is RoundStage {if (!(roundStages as readonly unknown[]).includes(value)) fail();}
function object(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getOwnPropertySymbols(value).length) fail();
 const keys = Object.getOwnPropertyNames(value);
 if (keys.length !== fields.length || keys.some(key => !fields.includes(key)) || fields.some(key => !Object.prototype.hasOwnProperty.call(value, key))) fail();
}
function text(value: unknown, max = 5000): asserts value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail();
}
function list(value: unknown, max: number): asserts value is unknown[] {
 if (!Array.isArray(value) || value.length > max || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) fail();
 for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) fail();
}
function binding(value: unknown): asserts value is RoundInputBinding {
 object(value, ['version_id', 'sha256']); text(value.version_id, 160);
 if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sha256)) fail(roundErrors.binding);
}
function stableValue(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
}

/** Preserve the established exact UTF-8 article hashing API. */
export const roundHashText = editorialHashText;
export const roundArtifactHash = (value: RoundArtifact | Article) => roundHashText(JSON.stringify(value));

/** Check both the round's claimed binding and the currently frozen input. */
export function assertRoundInputBinding(input: Article, current: RoundInputBinding, claimed: RoundInputBinding): void {
 binding(current); binding(claimed);
 if (current.version_id !== claimed.version_id || current.sha256 !== claimed.sha256 || current.sha256 !== roundArtifactHash(input)) fail(roundErrors.binding);
}
/** Preserve exact outline JSON bytes used for quotation and positional diffs. */
export function roundOutlineInput(outline: Outline): Article {return {title: outline.title, paragraphs: [JSON.stringify(outline)]};}

function outlineRevision(value: unknown, context: RoundContext): OutlineRevisionReport {
 object(value, ['outline', 'decisions', 'changes']);
 const input = context.input_article;
 if (!input || !context.previous_report) fail(editorialErrors.context);
 // Reuse the existing outline/review validators, never its 2000-char body gate.
 const previous = parseEditorialArtifact('outline_review', JSON.stringify(context.previous_report), context) as ReviewReport;
 const output = parseEditorialArtifact('outline', JSON.stringify(value.outline), context) as Outline;
 const projected = roundOutlineInput(output);
 list(value.decisions, previous.issues.length);
 if (value.decisions.length !== previous.issues.length) fail(editorialErrors.revision);
 const addressed = new Set<string>();
 for (const decision of value.decisions) {
  object(decision, ['issue_id', 'action', 'reason']); text(decision.issue_id, 80); text(decision.reason);
  if (!['accepted', 'rejected'].includes(decision.action as string) || addressed.has(decision.issue_id) || !previous.issues.some(issue => issue.id === decision.issue_id)) fail(editorialErrors.revision);
  addressed.add(decision.issue_id);
 }
 list(value.changes, 2); const changed = new Set<number>();
 for (const change of value.changes) {
  object(change, ['paragraph', 'before', 'after', 'reason']); text(change.reason);
  if (change.paragraph !== 0 && change.paragraph !== 1) fail(editorialErrors.revision);
  const before = change.paragraph === 0 ? input.title : input.paragraphs[0];
  const after = change.paragraph === 0 ? projected.title : projected.paragraphs[0];
  if (change.before !== before || change.after !== after || before === after || changed.has(change.paragraph)) fail(editorialErrors.revision);
  changed.add(change.paragraph);
 }
 for (const index of [0, 1]) if ((index === 0 ? input.title !== projected.title : input.paragraphs[0] !== projected.paragraphs[0]) !== changed.has(index)) fail(editorialErrors.revision);
 const genuineChange = roundRevisionProgress('outline_revision', value as OutlineRevisionReport).changed;
 for (const decision of value.decisions as RevisionReport['decisions']) {
  const issue = previous.issues.find(item => item.id === decision.issue_id)!;
  if (decision.action === 'accepted' && (!genuineChange || ((issue.type === 'fact' || issue.type === 'expression') && !changed.has(issue.paragraph)))) fail(editorialErrors.revision);
 }
 return value as OutlineRevisionReport;
}

export function parseRoundArtifact(kind: RoundStage, raw: string, context: RoundContext): RoundArtifact {
 stage(kind);
 if (context.validation_version !== undefined && context.validation_version !== 3) fail(editorialErrors.context);
 const checked = {...context, validation_version: 3 as const};
 if (checked.quality_candidate_anchor !== undefined && !['structure_review', 'fact_check', 'structure_revision'].includes(kind)) fail(editorialErrors.context);
 if (isReview(kind) || isRevision(kind)) {
  if (!checked.input_article || !checked.input_binding || !checked.bound_input_binding) fail(editorialErrors.context);
  assertRoundInputBinding(checked.input_article, checked.input_binding, checked.bound_input_binding);
  if (checked.quality_candidate_anchor !== undefined) {
   assertEditorialQualityCandidateAnchor(checked);
   if (checked.quality_candidate_anchor.version_id !== checked.input_binding.version_id || checked.quality_candidate_anchor.sha256 !== checked.input_binding.sha256) fail(roundErrors.binding);
  }
 }
 const artifact = kind === 'outline_revision'
  ? outlineRevision(parseEditorialJSONForFormat(raw), checked)
  : parseEditorialArtifact(kind, raw, checked);
 if (isRevision(kind)) {
  const progress = roundRevisionProgress(kind, artifact);
  if (progress.accepted > 0 && !progress.changed) fail(editorialErrors.revision);
 }
 return artifact;
}

export type ConsumedRoundReport = {kind: RoundStage; input_version_id: string; input_sha256: string; report_sha256: string};
export type RoundTransitionContext = {
 input_binding?: RoundInputBinding;
 report_sha256?: string;
 consumed_reports?: ConsumedRoundReport[];
};
export type RoundTransition = {state: 'continue' | 'verified' | 'blocked' | 'no_progress' | 'duplicate'; next_kind: RoundStage | null; new_round: boolean; needs_writer: boolean; reason: string};
/** Mechanical evidence of progress, not a claim of semantic correctness.
 * The next independent review must still establish whether issues are fixed. */
export function roundRevisionProgress(kind: RoundStage, artifact: RoundArtifact): {changed: boolean; accepted: number; rejected: number; no_progress: boolean} {
 stage(kind); if (!isRevision(kind)) fail(editorialErrors.context);
 const revision = artifact as RevisionReport | OutlineRevisionReport;
 const changed = revision.changes.some(change => {
  if (kind === 'outline_revision' && change.paragraph === 1) {
   return stableValue(parseEditorialJSONForFormat(change.before)) !== stableValue(parseEditorialJSONForFormat(change.after));
  }
  return change.before.replace(/\s/gu, '') !== change.after.replace(/\s/gu, '');
 });
 const accepted = revision.decisions.filter(decision => decision.action === 'accepted').length;
 return {changed, accepted, rejected: revision.decisions.length - accepted, no_progress: !changed};
}
export function roundNeedsWriter(kind: RoundStage, report: RoundArtifact): boolean {
 stage(kind);
 if (kind === 'outline' || kind === 'body') return true;
 if (!isReview(kind)) return false;
 const found = report as ReviewReport & FactReport;
 return found.issues.length > 0 && (kind === 'outline_review' || kind === 'structure_review' ? found.decision === 'revise' : found.passed === false);
}
export const needsRoundWriter = roundNeedsWriter;
/** Only strict, parsed artifacts may enter this helper. Persistence must commit
 * the consumed report and next round together with a CAS/unique-key boundary.
 * Counts are intentionally unbounded; new paid revisions require new issues. */
export function roundTransition(kind: RoundStage, artifact: RoundArtifact, context: RoundTransitionContext = {}): RoundTransition {
 stage(kind);
 const result = (state: RoundTransition['state'], next: RoundStage | null, newRound: boolean, reason: string): RoundTransition => ({state, next_kind: next, new_round: newRound, needs_writer: next !== null && (next === 'outline' || next === 'body' || isRevision(next)), reason});
 if (isReview(kind)) {
  if (!context.input_binding) fail(editorialErrors.context);
  binding(context.input_binding);
  const reportHash = roundArtifactHash(artifact);
  if (context.report_sha256 !== undefined && context.report_sha256 !== reportHash) fail(roundErrors.binding);
  // Same kind/version cannot be reopened even with cosmetically altered report
  // wording. A final_verify on the same article is a distinct mandatory stage.
  if (context.consumed_reports?.some(item => item.kind === kind && (item.report_sha256 === reportHash || item.input_version_id === context.input_binding!.version_id || item.input_sha256 === context.input_binding!.sha256))) return result('duplicate', null, false, roundErrors.duplicate);
 }
 if (isRevision(kind)) {
  if (roundRevisionProgress(kind, artifact).no_progress) return result('no_progress', null, false, roundErrors.no_progress);
  return result('continue', kind === 'outline_revision' ? 'outline_review' : kind === 'structure_revision' ? 'structure_review' : 'final_verify', true, '主笔已产生完整实际变更，独立审查确切新版本');
 }
 if (kind === 'outline') return result('continue', 'outline_review', false, '独立检查完整框架');
 if (kind === 'body') return result('continue', 'structure_review', false, '独立检查完整正文');
 if (kind === 'outline_review' || kind === 'structure_review') {
  const review = artifact as ReviewReport;
  if (review.decision === 'pass') return result('continue', kind === 'outline_review' ? 'body' : 'fact_check', false, '当前确切版本已通过本阶段独立审查');
  if (roundNeedsWriter(kind, artifact)) return result('continue', kind === 'outline_review' ? 'outline_revision' : 'structure_revision', false, '具体锚定问题需要主笔修订');
  return result('blocked', null, false, '缺少可落实的锚定问题或必要证据，停止收费');
 }
 const report = artifact as FactReport;
 if (report.passed) return kind === 'final_verify' ? result('verified', null, false, '确切最终标题和全文独立复核通过') : result('continue', 'final_verify', false, '事实检查通过，仍需确切全文终审');
 if (roundNeedsWriter(kind, artifact)) return result('continue', 'fact_revision', false, '完整事实核验发现具体锚定问题，需要主笔修订');
 return result('blocked', null, false, '事实核验未通过且缺少可落实的锚定问题，停止收费');
}
export const nextRoundStage = roundTransition;

export function roundStageInstruction(kind: RoundStage): string {
 stage(kind);
 const roundRule = '本流程为问题驱动的双作者编辑轮次；不限制有效轮数，但相同报告或相同确切版本不得重开同类收费轮。所有报告只针对本轮冻结的确切version_id和sha256，不沿用旧版锚点或coverage。主笔对每个issue_id只作一次accepted或rejected并给出具体理由。修订必须提供真实完整changes；全部拒绝且原文未改善则进入no_progress，不能盲目追加收费轮。独立审查者不得替主笔改写，不自行编造通过。';
 const outlineShape='框架字段title、core_argument、opening、turn、ending及分节heading、argument必须为字符串，opening不得为对象。只输出JSON，不使用Markdown围栏，也不在JSON前后附说明。结构示例（示例内容和ID必须替换为本篇冻结材料）：{"title":"标题","core_argument":"核心判断","opening":"具体钩子及必要背景","sections":[{"heading":"分节标题","target_chars":2200,"fact_ids":["F01"],"source_ids":["S01"],"argument":"事实与论证推进"}],"turn":"有依据的转弯","ending":"具体结尾","target_chars":2200,"source_ids":["S01"],"fact_gaps":{"blocked":false,"items":[]}}。缺口存在时items必须完整填写并blocked=true，不为通过格式删缺口。';
 if (kind !== 'outline_revision') return `${editorialStageInstruction(kind)}\n${roundRule}${kind==='outline'?'\n'+outlineShape:''}`;
 return `${editorialStageInstruction('outline')}\n${roundRule}\n${outlineShape}\n你是框架主笔修订者。不要写正文，不能套用2000–3000字正文最短长度来凑框架。返回{outline:完整框架对象,decisions:[{issue_id,action:"accepted"|"rejected",reason}],changes:[{paragraph,before,after,reason}]}。outline必须遵守生成框架的全部字段、事实ID、公开来源和事实缺口契约。逐条回应独立框架审稿全部issues，不遗漏或重复。changes为位置0的完整标题与位置1的完整框架JSON的确切前后文本；发生变化的位置恰好记录一次，不列未变化位置，不以摘要、字段差异或计划替代完整JSON。accepted必须有实际变更，fact或expression问题必须改动锚定位置。修订后重新独立检查框架，只有明确pass才可写正文。`;
}
export const editorialRoundStageInstruction = roundStageInstruction;
