// Project receipt validators. These are NOT official CUA APIs or real observations.
// Definition/import has no browser, website, upload or publication side effects.
export const NATIVE_CHANNEL = 'native_file_dialog';
export const ACCOUNTS = Object.freeze({toutiao: '61556093362', zhihu: 'ren-zhe-ai-chi-yu-52'});
export const FROZEN_WORDS = Object.freeze({'d29d424a-c09d-4db2-af4d-213ec41716d2': Object.freeze({sha256: '1166925f3585033cf77741d1de594b2681d36260763c7ecc7e8aa35087b296e0', size_bytes: 11947179, image_count: 22})});
export const SCOPE_FIELDS = Object.freeze(['article_id', 'platform', 'target_account', 'browser_session', 'executor_id', 'tab_id', 'host_id']);
const HASH = /^[a-f0-9]{64}$/;
export function requireCondition(ok, code) { if (!ok) throw Error(code); }
export function bindScope(scope) {
  requireCondition(scope && SCOPE_FIELDS.every(key => typeof scope[key] === 'string' && scope[key].length > 0 && scope[key].length <= 180), 'scope_required');
  requireCondition(ACCOUNTS[scope.platform] === scope.target_account, 'target_account_mismatch');
  return Object.freeze(Object.fromEntries(SCOPE_FIELDS.map(key => [key, scope[key]])));
}
export function assertScope(receipt, scope) {
  requireCondition(receipt && SCOPE_FIELDS.every(key => receipt[key] === scope[key]), 'scope_changed');
}
export function bindArtifact(artifact, scope) {
  requireCondition(artifact && typeof artifact.absolute_path === 'string' && artifact.absolute_path.length <= 1024 && artifact.absolute_path.startsWith('/') && artifact.absolute_path.endsWith('.docx') && !artifact.absolute_path.split('/').some(part => part === '.' || part === '..') && !/[\u0000-\u001f\u007f\\]/.test(artifact.absolute_path) && HASH.test(artifact.sha256) && Number.isSafeInteger(artifact.size_bytes) && artifact.size_bytes > 0 && artifact.host_id === scope.host_id, 'frozen_same_host_word_required');
  const known = FROZEN_WORDS[scope.article_id];
  requireCondition(!known || (artifact.sha256 === known.sha256 && artifact.size_bytes === known.size_bytes), 'original_frozen_word_must_be_preserved');
  return Object.freeze({absolute_path: artifact.absolute_path, sha256: artifact.sha256, size_bytes: artifact.size_bytes, host_id: artifact.host_id});
}
export function assertFile(receipt, artifact) {
  requireCondition(receipt?.source === 'same_host_file_observation' && ['absolute_path', 'sha256', 'size_bytes', 'host_id'].every(key => receipt[key] === artifact[key]), 'word_identity_changed');
}
export function assertFresh(receipt, now, maxAge = 15000) {
  const observed = Date.parse(receipt?.observed_at), current = Date.parse(now());
  requireCondition(Number.isFinite(observed) && Number.isFinite(current) && observed <= current && current - observed <= maxAge, 'fresh_observation_required');
}
export function realDraftUrl(value, platform) {
  let url;
  try { url = new URL(value); } catch { throw Error('real_draft_url_required'); }
  const domains = platform === 'toutiao' ? ['mp.toutiao.com'] : ['zhuanlan.zhihu.com', 'www.zhihu.com'];
  requireCondition(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && domains.includes(url.hostname), 'real_draft_url_required');
  return url.href;
}
export function assertSavedUrl(value, platform, draftId) {
  requireCondition(typeof draftId === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(draftId) && !['unknown', 'pending', 'placeholder', 'undefined', 'loading'].includes(draftId.toLowerCase()), 'real_draft_identity_required');
  const url = new URL(realDraftUrl(value, platform));
  let segments;
  try { segments = url.pathname.split('/').map(decodeURIComponent); } catch { throw Error('real_draft_url_required'); }
  // No guessed platform route: a real observation must associate this exact ID
  // with its path segment or query value. ID-less URLs need a separate reviewed
  // contract and are conservatively unsupported by this review package.
  requireCondition(segments.includes(draftId) || Array.from(url.searchParams.values()).includes(draftId), 'url_draft_identity_mismatch');
  return url.href;
}
const evidence = value => typeof value === 'string' && value.trim().length > 0;
export function assertSnapshot(snapshot, scope, now, kind) {
  assertScope(snapshot, scope);
  assertFresh(snapshot, now);
  requireCondition(snapshot.source === 'official_host_screenshot' && snapshot.kind === kind && typeof snapshot.screenshot_id === 'string' && snapshot.screenshot_id.length > 0 && snapshot.screenshot_ref != null && typeof snapshot.scene_id === 'string' && snapshot.scene_id.length > 0, 'real_screenshot_required');
  // Geometry mapping must come from the host's documented coordinate system.
  // It is never inferred from a DOM rectangle, display size or guessed DPI.
  const geometry = snapshot.geometry;
  requireCondition(geometry?.source === 'documented_host_coordinate_mapping' && ['screenshot_width', 'screenshot_height', 'mouse_width', 'mouse_height'].every(key => Number.isFinite(geometry[key]) && geometry[key] > 0) && ['mouse_origin_x', 'mouse_origin_y'].every(key => Number.isFinite(geometry[key])), 'coordinate_mapping_required');
  if (kind === 'page') {
    requireCondition(snapshot.account_verified === true && snapshot.account_evidence_ref && snapshot.is_new_draft === true && snapshot.body_empty === true && snapshot.title === '', 'new_empty_editor_required');
    realDraftUrl(snapshot.editor_url, scope.platform);
  } else {
    requireCondition(snapshot.channel === NATIVE_CHANNEL && typeof snapshot.window_id === 'string' && snapshot.window_id && snapshot.modal === true && typeof snapshot.title === 'string' && snapshot.title.length > 0 && snapshot.owner_tab_id === scope.tab_id && snapshot.active === true && snapshot.active_window_id === snapshot.window_id, 'matching_native_dialog_required');
  }
}
export function coordinateFromDecision(decision, snapshot, semantic, now) {
  assertFresh(snapshot, now);
  requireCondition(decision?.snapshot === snapshot && decision.semantic === semantic && decision.unique === true && decision.visible === true && decision.unobscured === true && decision.enabled === true && decision.reviewed === true && typeof decision.evidence_ref === 'string' && decision.evidence_ref.length > 0 && ['visible_text', 'reviewed_visual_semantics'].includes(decision.evidence_kind), 'semantic_visible_target_required');
  const rect = decision.bounds;
  const g = snapshot.geometry;
  requireCondition(rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= g.screenshot_width && rect.y + rect.height <= g.screenshot_height, 'target_bounds_invalid');
  // A center is used only after the reviewed screenshot explicitly proves it clear.
  requireCondition(decision.center_unobscured === true, 'target_center_obscured');
  return Object.freeze({x: g.mouse_origin_x + (rect.x + rect.width / 2) * g.mouse_width / g.screenshot_width, y: g.mouse_origin_y + (rect.y + rect.height / 2) * g.mouse_height / g.screenshot_height, button: 'left', click_count: 1});
}
export function publicImportPermission(value, prepared, scope, artifact) {
  assertScope(value, scope);
  // The parent must produce this only AFTER real claim/reserve/consume and saving.
  // No credentials, claim token, reservation token or capability nonce enter CUA.
  const allowed = [...SCOPE_FIELDS, 'channel', 'execute_import', 'delivery_status', 'prepared_id', 'sha256', 'size_bytes'];
  requireCondition(Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key)), 'secret_or_unrecognized_import_field');
  const publicValue = Object.fromEntries(allowed.map(key => [key, value[key]]));
  assertScope(publicValue, scope);
  requireCondition(publicValue.channel === NATIVE_CHANNEL && publicValue.execute_import === true && publicValue.delivery_status === 'saving' && publicValue.prepared_id === prepared.prepared_id && publicValue.sha256 === artifact.sha256 && publicValue.size_bytes === artifact.size_bytes, 'native_import_permission_required');
  return Object.freeze(publicValue);
}
export function titleWriteDecision({is_new_draft, observed_title, original_title}) {
  requireCondition(evidence(original_title) && typeof observed_title === 'string', 'full_original_title_required');
  if (observed_title === original_title) return Object.freeze({write: false, value: original_title});
  requireCondition(is_new_draft === true && observed_title === '', 'existing_title_must_not_be_overwritten');
  return Object.freeze({write: true, value: original_title});
}
export function verifyPrivateDraft({scope: inputScope, artifact: inputArtifact, source, saved, readback}) {
  const scope = bindScope(inputScope), artifact = bindArtifact(inputArtifact, scope);
  assertScope(saved, scope); assertScope(readback, scope);
  requireCondition(source && source.article_id === scope.article_id && source.host_id === artifact.host_id && source.word_sha256 === artifact.sha256 && source.word_size_bytes === artifact.size_bytes && HASH.test(source.full_body_sha256) && evidence(source.original_title) && Array.isArray(source.images) && source.images.length > 0, 'frozen_full_source_required');
  requireCondition(!FROZEN_WORDS[scope.article_id] || source.images.length === FROZEN_WORDS[scope.article_id].image_count, 'original_image_manifest_must_be_preserved');
  requireCondition(saved.source === 'official_saved_draft_observation' && saved.saved === true && saved.private === true && saved.published === false && saved.channel === NATIVE_CHANNEL && typeof saved.draft_id === 'string' && saved.draft_id && !['new', 'unknown'].includes(saved.draft_id) && evidence(saved.pass_id), 'saved_private_draft_required');
  const url = assertSavedUrl(saved.draft_url, scope.platform, saved.draft_id);
  requireCondition(saved.url_identity_verified === true && evidence(saved.url_identity_evidence_ref), 'observed_url_draft_identity_required');
  requireCondition(readback.source === 'official_saved_draft_full_readback' && readback.independent === true && readback.reopened === true && evidence(readback.pass_id) && readback.pass_id !== saved.pass_id && readback.draft_id === saved.draft_id && assertSavedUrl(readback.draft_url, scope.platform, readback.draft_id) === url && readback.url_identity_verified === true && evidence(readback.url_identity_evidence_ref) && readback.private === true && readback.published === false && readback.account_verified === true && evidence(readback.account_evidence_ref), 'independent_same_private_draft_readback_required');
  const savedAt = Date.parse(saved.observed_at), readAt = Date.parse(readback.observed_at);
  requireCondition(Number.isFinite(savedAt) && Number.isFinite(readAt) && readAt >= savedAt, 'post_save_readback_required');
  requireCondition(readback.title === source.original_title && readback.full_body_sha256 === source.full_body_sha256 && readback.coverage === 'full' && evidence(readback.text_evidence_ref) && Array.isArray(readback.images) && readback.images.length === source.images.length, 'full_text_and_image_coverage_required');
  const identities = new Set();
  for (let index = 0; index < source.images.length; index++) {
    requireCondition(Object.hasOwn(source.images, index) && Object.hasOwn(readback.images, index), 'complete_dense_image_manifest_required');
    const image = source.images[index];
    const observed = readback.images[index];
    requireCondition(image && evidence(image.id) && !identities.has(image.id) && evidence(image.before_anchor) && evidence(image.after_anchor) && Number.isFinite(image.ratio) && image.ratio > 0 && Number.isFinite(image.ratio_tolerance) && image.ratio_tolerance >= 0 && image.ratio_tolerance <= 0.02, 'frozen_image_manifest_required');
    identities.add(image.id);
    requireCondition(observed?.index === index && observed.source_image_id === image.id && observed.identity_match === true && evidence(observed.identity_evidence_ref) && observed.loaded === true && ['natural_width', 'natural_height', 'display_width', 'display_height'].every(key => Number.isFinite(observed[key]) && observed[key] > 0) && observed.before_anchor === image.before_anchor && observed.after_anchor === image.after_anchor && Math.abs(observed.natural_width / observed.natural_height / image.ratio - 1) <= image.ratio_tolerance && Math.abs(observed.display_width / observed.display_height / image.ratio - 1) <= image.ratio_tolerance, 'individual_image_verification_failed');
  }
  // This helper covers body images only. Destination-specific acceptance (for
  // example the Zhihu cover) and genuine website verified/completion remain in
  // the original platform core and authenticated parent contract.
  return Object.freeze({...scope, channel: NATIVE_CHANNEL, body_images_verified: true, verification_scope: 'title_full_body_inline_images', platform_verified: false, draft_url: url, draft_id: saved.draft_id, image_count: source.images.length, readback_pass_id: readback.pass_id});
}
