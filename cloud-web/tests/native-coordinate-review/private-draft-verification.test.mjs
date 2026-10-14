// Tests import production sources directly; no review-copy module is exercised.
// OFFLINE SYNTHETIC CONTRACT TESTS ONLY.
// These fixtures are not observations, real URLs, screenshots, host receipts,
// private drafts, successful imports, approvals, or evidence from either platform.
// The official-looking source labels exercise project receipt validation only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ACCOUNTS, NATIVE_CHANNEL, titleWriteDecision, verifyPrivateDraft} from '../../scripts/browser-upload/coordinate/src/coordinate-contract.js';

const PLATFORMS = ['toutiao', 'zhihu'];
const TITLE = '离线合成原标题：陈楚生的故事，完整标题应原样保留而不是截断或改写';
const BODY = Array.from({length: 23}, (_, index) => `离线合成正文第${index + 1}段：这是完整正文哈希测试材料，不能作为真实文章内容。`).join('\n');
const HASH = createHash('sha256').update(BODY).digest('hex');
const OTHER_HASH = createHash('sha256').update('离线合成正文采样片段').digest('hex');
const WORD_HASH = '1166925f3585033cf77741d1de594b2681d36260763c7ecc7e8aa35087b296e0';
const WORD_SIZE = 11947179;

function fixture(platform = 'toutiao') {
  const scope = {
    article_id: 'd29d424a-c09d-4db2-af4d-213ec41716d2', platform,
    target_account: ACCOUNTS[platform], browser_session: 'offline-session',
    executor_id: 'offline-executor', tab_id: `offline-${platform}-tab`, host_id: 'offline-host'
  };
  const draftId = platform === 'toutiao' ? '7312345678901234567' : '2082089809443566588';
  const draftUrl = platform === 'toutiao'
    ? `https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=${draftId}`
    : `https://zhuanlan.zhihu.com/p/${draftId}/edit`;
  const images = Array.from({length: 22}, (_, index) => ({
    id: `offline-image-${index + 1}`,
    before_anchor: `离线合成第${index + 1}图前完整正文锚点`,
    after_anchor: `离线合成第${index + 1}图后完整正文锚点`,
    ratio: (800 + index * 17) / (600 + index * 9), ratio_tolerance: 0.01
  }));
  // The known frozen SHA/size are used as comparison values only. This fixture
  // does not assert the Word exists at this synthetic path or read that file.
  const artifact = {absolute_path: '/offline-host/existing-frozen-word.docx', sha256: WORD_HASH, size_bytes: WORD_SIZE, host_id: scope.host_id};
  const source = {
    article_id: scope.article_id, host_id: scope.host_id,
    word_sha256: WORD_HASH, word_size_bytes: WORD_SIZE,
    original_title: TITLE, full_body_sha256: HASH, images
  };
  const saved = {
    ...scope, source: 'official_saved_draft_observation', channel: NATIVE_CHANNEL,
    saved: true, private: true, published: false, draft_id: draftId,
    draft_url: draftUrl, url_identity_verified: true, url_identity_evidence_ref: 'offline-saved-url-identity-evidence',
    pass_id: 'offline-save-pass', observed_at: '2026-10-11T08:00:00.000Z'
  };
  const readback = {
    ...scope, source: 'official_saved_draft_full_readback', independent: true,
    reopened: true, pass_id: 'offline-independent-readback-pass', draft_id: draftId,
    draft_url: draftUrl, url_identity_verified: true, url_identity_evidence_ref: 'offline-readback-url-identity-evidence',
    private: true, published: false, account_verified: true,
    account_evidence_ref: 'offline-account-evidence', observed_at: '2026-10-11T08:01:00.000Z',
    title: TITLE, full_body_sha256: HASH, coverage: 'full', text_evidence_ref: 'offline-full-text-evidence',
    images: images.map((image, index) => ({
      index, source_image_id: image.id, identity_match: true,
      identity_evidence_ref: `offline-image-${index + 1}-identity-evidence`, loaded: true,
      natural_width: 800 + index * 17, natural_height: 600 + index * 9,
      display_width: (800 + index * 17) / 2, display_height: (600 + index * 9) / 2,
      before_anchor: image.before_anchor, after_anchor: image.after_anchor
    }))
  };
  return {scope, artifact, source, saved, readback};
}

function rejectsMutation(name, mutate) {
  for (const platform of PLATFORMS) {
    test(`offline ${platform}: reject ${name}`, () => {
      const data = fixture(platform);
      mutate(data, platform);
      assert.throws(() => verifyPrivateDraft(data));
    });
  }
}

test('offline title: only a confirmed new draft with an empty title receives the full original title', () => {
  const result = titleWriteDecision({is_new_draft: true, observed_title: '', original_title: TITLE});
  assert.deepEqual(result, {write: true, value: TITLE});
  assert.equal(Object.isFrozen(result), true);
});

for (const isNew of [true, false, undefined]) {
  test(`offline title: an existing exact original title needs no write (new=${isNew})`, () => {
    const result = titleWriteDecision({is_new_draft: isNew, observed_title: TITLE, original_title: TITLE});
    assert.deepEqual(result, {write: false, value: TITLE});
    assert.equal(Object.isFrozen(result), true);
  });
}

for (const isNew of [false, undefined, 'true', 1]) {
  test(`offline title: reject an old or unconfirmed empty-title draft (new=${isNew})`, () => {
    assert.throws(() => titleWriteDecision({is_new_draft: isNew, observed_title: '', original_title: TITLE}));
  });
}

for (const observed of ['既有草稿标题', TITLE.slice(0, 10), `${TITLE} `, ' ']) {
  test(`offline title: reject overwriting a nonempty title ${JSON.stringify(observed)}`, () => {
    assert.throws(() => titleWriteDecision({is_new_draft: true, observed_title: observed, original_title: TITLE}));
  });
}

for (const value of ['', ' ', '\n\t', null, undefined, 123]) {
  test(`offline title: reject missing or invalid original title ${JSON.stringify(value)}`, () => {
    assert.throws(() => titleWriteDecision({is_new_draft: true, observed_title: '', original_title: value}));
  });
}

test('offline title: reject a missing observed-title value', () => {
  assert.throws(() => titleWriteDecision({is_new_draft: true, original_title: TITLE}));
});

for (const platform of PLATFORMS) {
  test(`offline ${platform}: accept independent private-draft full-text and all 22 individual-image checks`, () => {
    const data = fixture(platform);
    const result = verifyPrivateDraft(data);
    assert.deepEqual(result, {
      ...data.scope, channel: NATIVE_CHANNEL, body_images_verified: true,
      verification_scope: 'title_full_body_inline_images', platform_verified: false, draft_url: data.saved.draft_url,
      draft_id: data.saved.draft_id, image_count: 22, readback_pass_id: data.readback.pass_id
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.hasOwn(result, 'verified'), false, 'inline checks cannot assert full platform verification');
    assert.equal('completed' in result, false, 'the project validator cannot manufacture a website completed write');
  });
}

test('offline zhihu: missing cover never turns inline-image checks into full platform verification', () => {
  const data = fixture('zhihu');
  delete data.saved.cover;
  delete data.readback.cover;
  const result = verifyPrivateDraft(data);
  assert.equal(result.body_images_verified, true);
  assert.equal(result.verification_scope, 'title_full_body_inline_images');
  assert.equal(result.platform_verified, false);
  assert.equal(Object.hasOwn(result, 'verified'), false);
  assert.equal(Object.hasOwn(result, 'completed'), false);
  assert.equal(Object.hasOwn(result, 'cover_verified'), false);
});

rejectsMutation('wrong saved account', data => { data.saved.target_account = 'offline-other-account'; });
rejectsMutation('wrong readback account', data => { data.readback.target_account = 'offline-other-account'; });
rejectsMutation('matching receipts bound to the wrong target account', data => {
  data.scope.target_account = data.saved.target_account = data.readback.target_account = 'offline-other-account';
});
rejectsMutation('artifact from a different host', data => { data.artifact.host_id = 'offline-other-host'; });
rejectsMutation('artifact has a different frozen Word hash', data => { data.artifact.sha256 = OTHER_HASH; });
rejectsMutation('artifact has a different frozen Word size', data => { data.artifact.size_bytes += 1; });
rejectsMutation('artifact has an invalid hash', data => { data.artifact.sha256 = 'not-a-hash'; });
rejectsMutation('artifact has a zero size', data => { data.artifact.size_bytes = 0; });
rejectsMutation('artifact path is relative', data => { data.artifact.absolute_path = 'existing-frozen-word.docx'; });
rejectsMutation('artifact path is not a Word document', data => { data.artifact.absolute_path = '/offline-host/existing-frozen-word.txt'; });
rejectsMutation('missing frozen artifact', data => { delete data.artifact; });
rejectsMutation('source manifest bound to another article', data => { data.source.article_id = 'offline-other-article'; });
rejectsMutation('source manifest bound to another host', data => { data.source.host_id = 'offline-other-host'; });
rejectsMutation('source manifest bound to another Word hash', data => { data.source.word_sha256 = OTHER_HASH; });
rejectsMutation('source manifest bound to another Word size', data => { data.source.word_size_bytes += 1; });
rejectsMutation('source manifest missing Word hash', data => { delete data.source.word_sha256; });
rejectsMutation('source manifest missing Word size', data => { delete data.source.word_size_bytes; });
rejectsMutation('cross-platform receipt', data => { data.readback.platform = data.scope.platform === 'toutiao' ? 'zhihu' : 'toutiao'; });
rejectsMutation('wrong article identity', data => { data.readback.article_id = 'offline-other-article'; });
rejectsMutation('different host', data => { data.readback.host_id = 'offline-other-host'; });
rejectsMutation('different tab', data => { data.readback.tab_id = 'offline-other-tab'; });
rejectsMutation('unverified account', data => { data.readback.account_verified = false; });
rejectsMutation('missing account evidence', data => { delete data.readback.account_evidence_ref; });
rejectsMutation('unconfirmed saved result', data => { data.saved.saved = false; });
rejectsMutation('browser chooser channel', data => { data.saved.channel = 'browser_filechooser'; });
rejectsMutation('nonofficial saved source', data => { data.saved.source = 'offline_mock'; });
rejectsMutation('nonofficial full readback source', data => { data.readback.source = 'offline_mock'; });

for (const field of ['saved', 'readback']) {
  rejectsMutation(`${field} nonprivate state`, data => { data[field].private = false; });
  rejectsMutation(`${field} published state`, data => { data[field].published = true; });
  rejectsMutation(`${field} unknown publication state`, data => { delete data[field].published; });
  rejectsMutation(`${field} URL identity unverified`, data => { data[field].url_identity_verified = false; });
  rejectsMutation(`${field} missing URL identity evidence`, data => { delete data[field].url_identity_evidence_ref; });
  for (const value of ['', ' ', true, {}, 42]) {
    rejectsMutation(`${field} invalid URL identity evidence ${JSON.stringify(value)}`, data => { data[field].url_identity_evidence_ref = value; });
  }
}

rejectsMutation('readback reuses the save pass', data => { data.readback.pass_id = data.saved.pass_id; });
rejectsMutation('nonindependent readback', data => { data.readback.independent = false; });
rejectsMutation('readback without reopen', data => { data.readback.reopened = false; });
rejectsMutation('missing saved pass identity', data => { delete data.saved.pass_id; });
rejectsMutation('blank saved pass identity', data => { data.saved.pass_id = ' '; });
rejectsMutation('missing readback pass identity', data => { delete data.readback.pass_id; });
rejectsMutation('nonstring readback pass identity', data => { data.readback.pass_id = 42; });
rejectsMutation('different reopened draft identity', data => { data.readback.draft_id = '9999999999999999999'; });
rejectsMutation('different reopened draft URL', (data, platform) => {
  data.readback.draft_url = platform === 'toutiao'
    ? 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=9999999999999999999'
    : 'https://zhuanlan.zhihu.com/p/9999999999999999999/edit';
});
rejectsMutation('readback before saving', data => { data.readback.observed_at = '2026-10-11T07:59:59.999Z'; });
rejectsMutation('invalid saved observation time', data => { data.saved.observed_at = 'not-a-date'; });
rejectsMutation('invalid readback observation time', data => { data.readback.observed_at = 'not-a-date'; });

for (const url of [
  'not-a-url', 'http://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=7312345678901234567',
  'https://example.test/draft/7312345678901234567',
  'https://mp.toutiao.com.evil.test/profile_v4/graphic/publish?pgc_id=7312345678901234567',
  'https://user:secret@mp.toutiao.com/profile_v4/graphic/publish?pgc_id=7312345678901234567'
]) {
  rejectsMutation(`bad URL ${url}`, data => { data.saved.draft_url = data.readback.draft_url = url; });
}
rejectsMutation('fragment URL', data => { data.saved.draft_url = data.readback.draft_url = `${data.saved.draft_url}#offline`; });
rejectsMutation('nondefault HTTPS port', data => {
  data.saved.draft_url = data.readback.draft_url = data.saved.draft_url.replace('.com/', '.com:8443/');
});
rejectsMutation('platform homepage URL', (data, platform) => {
  data.saved.draft_url = data.readback.draft_url = platform === 'toutiao' ? 'https://mp.toutiao.com/' : 'https://zhuanlan.zhihu.com/';
});
rejectsMutation('new editor URL presented as a saved draft', (data, platform) => {
  data.saved.draft_url = data.readback.draft_url = platform === 'toutiao'
    ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write';
});
rejectsMutation('draft identity does not match the URL', data => { data.saved.draft_id = data.readback.draft_id = '9999999999999999999'; });
rejectsMutation('URL contains only a partial draft identity', data => {
  data.saved.draft_url = data.readback.draft_url = data.saved.draft_url.replace(data.saved.draft_id, `${data.saved.draft_id}99`);
});
for (const id of ['new', 'unknown', '', ' ', 'pending', 'placeholder', 'null', 'undefined', '0']) {
  rejectsMutation(`placeholder draft identity ${JSON.stringify(id)}`, data => { data.saved.draft_id = data.readback.draft_id = id; });
}

rejectsMutation('wrong full original title', data => { data.readback.title = TITLE.slice(0, 10); });
rejectsMutation('sample hash substituted for the full body hash', data => { data.readback.full_body_sha256 = OTHER_HASH; });
rejectsMutation('invalid source body hash', data => { data.source.full_body_sha256 = 'not-a-hash'; });
rejectsMutation('missing source original title', data => { delete data.source.original_title; });
rejectsMutation('blank source original title despite a matching readback', data => { data.source.original_title = data.readback.title = ' '; });
rejectsMutation('empty source image manifest', data => { data.source.images = []; });
rejectsMutation('one source manifest hole with an unverified corresponding image', data => {
  delete data.source.images[10];
  delete data.readback.images[10];
});
rejectsMutation('all source and readback images replaced by sparse arrays with length 22', data => {
  data.source.images = Array(22);
  data.readback.images = Array(22);
});
rejectsMutation('sampled text coverage', data => { data.readback.coverage = 'sample'; });
rejectsMutation('only first and last text coverage', data => { data.readback.coverage = 'first_and_last'; });
rejectsMutation('missing text evidence', data => { delete data.readback.text_evidence_ref; });
rejectsMutation('missing image readback', data => { delete data.readback.images; });
rejectsMutation('one middle image missing', data => { data.readback.images.splice(10, 1); });
rejectsMutation('several images missing', data => { data.readback.images.splice(2, 5); });
rejectsMutation('last image missing', data => { data.readback.images.pop(); });
rejectsMutation('additional image inserted', data => { data.readback.images.push({...data.readback.images[0]}); });

for (const index of [0, 10, 21]) {
  rejectsMutation(`image ${index + 1} identity mismatch`, data => { data.readback.images[index].source_image_id = 'offline-wrong-image'; });
  rejectsMutation(`image ${index + 1} identity unconfirmed`, data => { data.readback.images[index].identity_match = false; });
  rejectsMutation(`image ${index + 1} identity evidence missing`, data => { delete data.readback.images[index].identity_evidence_ref; });
  rejectsMutation(`image ${index + 1} before anchor mismatch`, data => { data.readback.images[index].before_anchor = 'offline-wrong-before-anchor'; });
  rejectsMutation(`image ${index + 1} after anchor mismatch`, data => { data.readback.images[index].after_anchor = 'offline-wrong-after-anchor'; });
  rejectsMutation(`image ${index + 1} not loaded`, data => { data.readback.images[index].loaded = false; });
  rejectsMutation(`image ${index + 1} order mismatch`, data => { data.readback.images[index].index = (index + 1) % 22; });
  rejectsMutation(`image ${index + 1} distorted ratio`, data => { data.readback.images[index].natural_width *= 1.1; });
  rejectsMutation(`image ${index + 1} display stretched despite unchanged natural dimensions`, data => { data.readback.images[index].display_width *= 1.1; });
}
rejectsMutation('middle image positions swapped while the count stays 22', data => {
  [data.readback.images[10], data.readback.images[11]] = [data.readback.images[11], data.readback.images[10]];
});
rejectsMutation('one image duplicated while the count stays 22', data => { data.readback.images[21] = {...data.readback.images[0], index: 21}; });

for (const key of ['natural_width', 'natural_height', 'display_width', 'display_height']) {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '800', undefined]) {
    rejectsMutation(`invalid ${key} ${String(value)}`, data => { data.readback.images[10][key] = value; });
  }
}

for (const key of ['account_evidence_ref', 'text_evidence_ref']) {
  for (const value of ['', ' ', true, {}, 42]) {
    rejectsMutation(`invalid readback ${key} ${JSON.stringify(value)}`, data => { data.readback[key] = value; });
  }
}
for (const value of ['', ' ', true, {}, 42]) {
  rejectsMutation(`invalid image identity evidence ${JSON.stringify(value)}`, data => { data.readback.images[10].identity_evidence_ref = value; });
}

rejectsMutation('duplicate image identity in the frozen manifest', data => {
  data.source.images[21].id = data.source.images[0].id;
  data.readback.images[21].source_image_id = data.source.images[0].id;
});
rejectsMutation('missing source identity', data => { delete data.source.images[10].id; });
rejectsMutation('blank source identity despite a matching observed identity', data => {
  data.source.images[10].id = data.readback.images[10].source_image_id = ' ';
});
rejectsMutation('missing source before anchor', data => { delete data.source.images[10].before_anchor; });
rejectsMutation('blank source before anchor despite a matching observed anchor', data => {
  data.source.images[10].before_anchor = data.readback.images[10].before_anchor = ' ';
});
rejectsMutation('missing source after anchor', data => { delete data.source.images[10].after_anchor; });
rejectsMutation('blank source after anchor despite a matching observed anchor', data => {
  data.source.images[10].after_anchor = data.readback.images[10].after_anchor = ' ';
});
for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1.5', undefined]) {
  rejectsMutation(`invalid source aspect ratio ${String(value)}`, data => { data.source.images[10].ratio = value; });
}
for (const value of [-0.01, 0.020001, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '0.01', undefined]) {
  rejectsMutation(`invalid or overwide ratio tolerance ${String(value)}`, data => { data.source.images[10].ratio_tolerance = value; });
}

for (const platform of PLATFORMS) {
  test(`offline ${platform}: accept a small declared ratio deviation within the narrow tolerance`, () => {
    const data = fixture(platform);
    data.readback.images[10].natural_width *= 1.005;
    const result = verifyPrivateDraft(data);
    assert.equal(result.body_images_verified, true);
    assert.equal(result.verification_scope, 'title_full_body_inline_images');
    assert.equal(result.platform_verified, false);
    assert.equal(Object.hasOwn(result, 'verified'), false);
  });
  test(`offline ${platform}: zero tolerance requires the exact source ratio`, () => {
    const data = fixture(platform);
    data.source.images[10].ratio_tolerance = 0;
    const result = verifyPrivateDraft(data);
    assert.equal(result.body_images_verified, true);
    assert.equal(result.verification_scope, 'title_full_body_inline_images');
    assert.equal(result.platform_verified, false);
    assert.equal(Object.hasOwn(result, 'verified'), false);
    data.readback.images[10].natural_width *= 1.000001;
    assert.throws(() => verifyPrivateDraft(data));
  });
}
