// Shared synthetic fixtures for actual SQLite and isolated workerd D1 tests.
// No production IDs, source text, credentials, external services or renderer.
import {randomUUID, createHash} from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const owner = label => `synthetic-phase-pool-${label}-${randomUUID()}`;
export const withoutOwner = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'owner'));
export const base = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['owner', 'execution_id', 'request_key', 'epoch', 'execution_scope'].includes(key)));
export const native = value => ({[value.target_kind === 'article' ? 'article_id' : 'job_id']: value.target_id,
  claim_token: value.claim_token, execution_token: value.execution_token});

export async function seed(db, who, kind = 'article') {
  const claim = randomUUID(), id = (kind === 'local_word' ? 'localword_' : '') + randomUUID();
  const created = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  let raw;
  if (kind === 'article') {
    raw = JSON.stringify(['Synthetic title', 'Synthetic body']);
    await db.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id, who, 'Synthetic title', 'synthetic.docx', `articles/${id}/source`, raw, created, 'processing', claim, expires).run();
  } else {
    const request = randomUUID(), original = hash(JSON.stringify(['Synthetic title', 'Synthetic body']));
    raw = JSON.stringify({request_key: request, filename: 'synthetic.docx', source_sha256: original,
      title: 'Synthetic title', leading_blank_paragraphs: 0, paragraphs: ['Synthetic body'], subheading_indices: [], original_sha256: original});
    const manifest = JSON.stringify({contract_version: 1, author: 'local_desktop_frozen_source', input_sha256: hash(raw),
      prompt_sha256: hash('local-word-only-v1'), original_sha256: original, sources_sha256: hash('[]'), sources: [], frozen_at: created, layout: null});
    await db.prepare("INSERT INTO local_word_jobs(id,owner,request_key,source_kind,output_mode,destinations_json,filename,title,leading_blank_paragraphs,source_sha256,original_sha256,input_sha256,input_json,artifact_manifest,state,created,updated,claim_hash,claim_expires,dispatch_state,dispatch_attempts) VALUES(?,?,?,'local_desktop','word_only','[]',?,?,0,?,?,?,?,?,'processing',?,?,?,?,'pending',0)")
      .bind(id, who, request, 'synthetic.docx', 'Synthetic title', original, original, hash(raw), raw, manifest,
        created, created, hash(claim), expires).run();
  }
  return {owner: who, target_kind: kind, target_id: id, claim_token: claim, input_sha256: hash(raw),
    execution_token: randomUUID(), execution_id: randomUUID(), request_key: randomUUID()};
}

export function operations(w, p) {
  const read = job => w.wordRecoveryCall(job.owner, 'read_word_recovery', {target_kind: job.target_kind, target_id: job.target_id});
  const view = job => w.wordRecoveryView(job.owner, job.target_kind, job.target_id);
  const acquire = (job, scope) => w.wordRecoveryCall(job.owner, 'acquire_word_execution', {
    ...withoutOwner(job), ...(scope ? {execution_scope: scope} : {})});
  const receipt = (job, key = job.request_key) => w.wordRecoveryCall(job.owner, 'read_word_execution_receipt', {
    target_kind: job.target_kind, target_id: job.target_id, request_key: key});
  const intent = async (job, value) => w.setWordIntent(job.owner, {target_kind: job.target_kind, target_id: job.target_id,
    input_sha256: job.input_sha256, expected_version: (await view(job)).version, intent: value});
  const transitionArgs = async (job, scope) => {
    const current = await view(job);
    return {...base(job), execution_id: job.execution_id, request_key: randomUUID(), epoch: current.epoch,
      expected_version: current.version, next_execution_token: randomUUID(), execution_scope: scope};
  };
  const transition = (job, args) => w.wordRecoveryCall(job.owner, 'transition_word_execution', args);
  const adoptTransition = (job, args, result) => {
    if (!result.acquired) throw Error('SYNTHETIC_TRANSITION_NOT_GRANTED');
    job.execution_token = args.next_execution_token;
    job.request_key = args.request_key;
    job.epoch = result.epoch;
  };
  const progress = async (job, stage, state, observation, extra = {}) => {
    const current = await p.readWordProgress(job.owner, job.target_kind, job.target_id);
    const event = {...base(job), expected_version: current.version, event_id: randomUUID(), stage, state, observation, ...extra};
    const result = await p.recordWordProgress(job.owner, event);
    return {event, result};
  };
  return {read, view, acquire, receipt, intent, transitionArgs, transition, adoptTransition, progress};
}
