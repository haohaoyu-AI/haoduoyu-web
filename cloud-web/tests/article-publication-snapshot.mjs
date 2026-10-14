// Optional parent evidence acceptance, actual Library bytes supplied separately.
// No production import and no file/record contents printed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const path=process.env.PUBLICATION_SNAPSHOT_PATH;assert.ok(path,'Set PUBLICATION_SNAPSHOT_PATH to the privately materialized parent JSON.');
const bytes=fs.readFileSync(path);assert.equal(bytes.length,27738);assert.equal(createHash('sha256').update(bytes).digest('hex'),'d6016223feb5d99b1ee2c11ec43dcc181573dcf61cc85a55dea17eaa79ff94ed');
const data=JSON.parse(bytes),records=data.records;assert.equal(records.length,8);
assert.equal(records.filter(r=>r.publication_status==='scheduled_pending').length,4);assert.equal(records.filter(r=>r.confirmed_published===true).length,1);assert.equal(records.filter(r=>r.publication_status==='private_draft_confirmed').length,1);assert.equal(records.filter(r=>r.publication_status==='current_status_unconfirmed').length,1);assert.equal(records.filter(r=>r.publication_status==='word_only_not_requested').length,1);
assert.ok(records.every(r=>r.published_at===null&&r.metrics_24h===null));assert.equal(data.time_conflict.timezone_confirmed,false);assert.equal(data.time_conflict.metrics_24h,null);assert.equal(data.time_conflict.published_at,null);
const published=records.find(r=>r.confirmed_published);assert.equal(published.toutiao_draft_id,data.time_conflict.article_id);assert.equal(published.cumulative_metrics.impressions,6258);assert.equal(published.cumulative_metrics.reads,26);assert.equal(published.cumulative_metrics.likes,0);assert.equal(published.cumulative_metrics.comments,0);assert.equal(published.snapshot_kind,'cumulative_time_unresolved');
assert.ok(records.filter(r=>r.publication_status==='scheduled_pending').every(r=>r.confirmed_published===false&&r.management_status_raw.includes('定时发布中')));
console.log('PASS exact private parent Library JSON/hash: 4 scheduled, 1 explicitly published with unresolved time and cumulative counters, 1 private, 1 unknown, 1 Word-only; all 24h/publication times null. Read-only offline evidence inspection, ZERO imports/platform actions.');
