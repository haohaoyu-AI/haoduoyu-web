import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {matchArchiveItem} from '../src/review-archive-match.mjs';
import {createCoverFingerprint} from '../shared/review-cover-fingerprint.mjs';

const scope = {account:'V字', platform:'toutiao', kind:'article'};
const draftRef = (id, role = 'primary') => ({kind:'draft', platform_id:id, role});
const publicationRef = id => ({kind:'publication', platform_id:id});
const item = fields => ({...scope, id:'old', refs:[], original_title:'原稿标题', publication_status:'pending',
  production_status:'complete', association_status:'pending', ...fields});
const importPublication = fields => ({...scope, ref_kind:'publication', published_title:'最终发布标题',
  publication_status:'published', ...fields});
const paragraphs = [
  '工厂试验台在复验阶段更换陶瓷轴承，三号传感器在下午第一次测得回流口温度恢复到规定范围。',
  '后续检查记录了电机绕组和绝缘层的组装顺序，两位值班技师分别测量了固定夹具的偏心量。',
  '复核组最终把室温升高了六度，原来超过27.4%的重复故障都来自转轴停机后的冷却过程。',
];
const sources = [{title:'复核报告',url:'https://example.org/report'}, {title:'原始记录',url:'https://example.org/register'}];
const facts = {people:['林工'], events:['陶瓷轴承复验'], numbers:['27.4%','73摄氏度']};

test('exact scoped records keep distinct publication status, original titles, and all draft IDs', () => {
  const originalId = '7702864660600570431';
  const duplicateId = '7702864660600570432';
  const draft = item({refs:[draftRef(originalId),draftRef(duplicateId,'duplicate'),draftRef(duplicateId,'duplicate')]});
  const foreign = item({id:'foreign',account:'Z极客',refs:[draftRef(duplicateId)]});
  const otherPlatform = item({id:'other-platform',platform:'wechat',refs:[draftRef(duplicateId)]});
  const merged = item({id:'merged',merged_into:draft.id,refs:[draftRef(duplicateId)]});
  const linked = matchArchiveItem([draft,foreign,otherPlatform,merged], importPublication({platform_id:duplicateId}));
  assert.equal(linked.kind,'id');
  assert.equal(linked.confidence,'exact');
  assert.equal(linked.item,draft);
  assert.equal(linked.evidence.draft_reference,true);
  assert.equal(linked.evidence.primary_draft,false);
  assert.deepEqual(draft.refs.map(ref => ref.platform_id),[originalId,duplicateId,duplicateId]);
  assert.equal(draft.publication_status,'pending');
  assert.equal(draft.original_title,'原稿标题');
  const byPrimary = matchArchiveItem([draft],importPublication({platform_id:originalId}));
  assert.equal(byPrimary.evidence.primary_draft,true);
  assert.equal(matchArchiveItem([draft],importPublication({platform_id:Number(originalId)})).kind,'none');
  assert.equal(matchArchiveItem([draft],importPublication({platform_id:originalId,account:'Z极客'})).kind,'none');
  const duplicateDraft = matchArchiveItem([draft],{...scope,ref_kind:'draft',refs:[draftRef(duplicateId)]});
  assert.equal(duplicateDraft.evidence.primary_draft,false);
});

test('exact repeated publication identity does not say an original draft has been found', () => {
  const existing = item({original_title:null, publication_status:'published', refs:[publicationRef('article-77')]});
  const match = matchArchiveItem([existing],importPublication({platform_id:'article-77'}));
  assert.equal(match.kind,'id');
  assert.equal(match.evidence.publication_reference,true);
  assert.equal(match.evidence.draft_reference,false);
  assert.equal(match.item.association_status,'pending');
  const laterDraft = matchArchiveItem([existing],{...scope,ref_kind:'draft',platform_id:'article-77'});
  assert.equal(laterDraft.kind,'id');
  assert.equal(laterDraft.evidence.draft_reference,true);
});

test('competing exact archive items, different publication IDs, and long-form/micro conflicts are explicit', () => {
  const original = item({refs:[draftRef('shared')]});
  const second = item({id:'another',refs:[draftRef('shared','duplicate')]});
  const incoming = importPublication({platform_id:'shared'});
  assert.deepEqual(matchArchiveItem([original,second],incoming),{kind:'ambiguous',confidence:'pending',
    candidates:['another','old'],evidence:{reason:'platform_id'}});
  assert.deepEqual(matchArchiveItem([original],{...incoming,kind:'micro'}),{kind:'conflict',confidence:'pending',
    candidates:['old'],evidence:{reason:'content_kind'}});
  const published = {...original,refs:[draftRef('shared'),publicationRef('first-publication')]};
  assert.equal(matchArchiveItem([published],incoming).evidence.reason,'different_publication_id');
  assert.equal(matchArchiveItem([original],{...incoming,refs:[publicationRef('additional')]}).kind,'conflict');
});

test('different IDs use draft passages and ordered sources with title only as an auxiliary cue', () => {
  const original = item({refs:[draftRef('draft-id')], original_body:paragraphs.join('\n\n'), sources, match_evidence:facts});
  const incoming = importPublication({platform_id:'publication-id', sources, match_evidence:facts,
    published_body:['从试产到重复试验，研究组先比较了三种固定结构，最后决定重新排列传感器。',...paragraphs.slice(1)].join('\n\n')});
  const match = matchArchiveItem([original],incoming);
  assert.equal(match.kind,'corroborated');
  assert.equal(match.item.id,'old');
  assert.equal(match.confidence,'strong');
  assert.deepEqual(match.evidence,{body:true,sources:2,cover:false,facts:true,numbers:2,title:false});
  assert.equal(matchArchiveItem([{...original,refs:[...original.refs,publicationRef('another-publication')]}],incoming).kind,'none');
  for (const publication_status of ['published','deleted']) {
    assert.equal(matchArchiveItem([{...original,publication_status}],incoming).kind,'none');
  }
  const second = {...original,id:'another',original_title:incoming.published_title};
  assert.deepEqual(matchArchiveItem([original,second],incoming),{kind:'ambiguous',confidence:'pending',
    candidates:['another','old'],evidence:{reason:'article_evidence'}});
});

test('pending work may match on preserved evidence even when its titles and platform IDs were not recorded', () => {
  const match_evidence = {...facts,body:paragraphs.join('\n\n')};
  const existing = item({original_title:null,match_evidence});
  assert.equal(matchArchiveItem([existing],importPublication({match_evidence})).kind,'corroborated');
});

test('same topic and title cannot associate separate articles', () => {
  const original = item({original_body:paragraphs.join('\n\n'), sources, match_evidence:facts});
  const differentWork = ['质检组只比较成品的锈蚀速度，将样件分成四组后分别投入潮湿的库房，按检定表顺序检查。',
    '这次试验观察的是大型钢板在运输过程中的表面颜色变化，设备功率和冷却时间并未纳入本轮统计。'].join('\n');
  const sameTopic = importPublication({published_title:original.original_title, sources, match_evidence:facts,published_body:differentWork});
  assert.equal(matchArchiveItem([original],sameTopic).kind,'none');
  assert.equal(matchArchiveItem([original],importPublication({published_title:original.original_title})).kind,'none');
});

test('micro posts reuse JPEG/WebP fingerprints as corroboration without requiring long-form text', () => {
  const transforms = JSON.parse(readFileSync(new URL('fixtures/review-cover-transforms.json', import.meta.url), 'utf8'));
  const [jpeg, webp] = transforms.map(({width,height,deflated_rgba}) =>
    createCoverFingerprint({data:inflateSync(Buffer.from(deflated_rgba,'base64')),width,height}));
  assert.notEqual(jpeg,webp);
  const original = item({kind:'micro',refs:[draftRef('draft-id')],sources,cover:{fingerprint:jpeg},match_evidence:facts});
  const incoming = importPublication({kind:'micro',platform_id:'micro-id',sources,cover:{fingerprint:webp},match_evidence:facts});
  const match = matchArchiveItem([original],incoming);
  assert.equal(match.kind,'corroborated');
  assert.equal(match.evidence.cover,true);
  assert.equal(matchArchiveItem([original],{...incoming,sources:[...sources].reverse()}).kind,'none');
});
