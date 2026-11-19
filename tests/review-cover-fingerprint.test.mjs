import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {createCoverFingerprint, isCoverFingerprint, similarCoverFingerprints} from '../shared/review-cover-fingerprint.mjs';
import {matchPublishedDraft} from '../shared/review-draft-match.mjs';

const transforms = JSON.parse(readFileSync(new URL('fixtures/review-cover-transforms.json', import.meta.url), 'utf8'));

function originalPixel(x, y) {
  if (x >= 14 && x <= 68 && y >= 19 && y <= 82) return (x + y) % 8 < 4 ? [210, 81, 44] : [225, 102, 58];
  if ((x - 105) ** 2 + (y - 33) ** 2 < 500) return [238, 210, 76];
  if (y > 75 && x > 56) return [33, 119, 75];
  return [26 + Math.floor(x / 4), 45 + Math.floor(y / 4), 125 + Math.floor((x + y) / 5)];
}

function originalCover(pixel = originalPixel) {
  const width = 144;
  const height = 108;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  return createCoverFingerprint({data, width, height});
}

function transformedCover({width, height, deflated_rgba}) {
  // These pixels were decoded after Lanczos resizing and lossy JPEG or WebP
  // encoding at the listed quality. Deflate simply keeps the test fixture small.
  const data = inflateSync(Buffer.from(deflated_rgba, 'base64'));
  return createCoverFingerprint({data, width, height});
}

test('perceptual cover comparison accepts resize and real JPEG or WebP recompression', () => {
  const original = originalCover();
  assert.equal(isCoverFingerprint(original), true);
  for (const transform of transforms) {
    const transformed = transformedCover(transform);
    assert.notEqual(original, transformed, transform.codec);
    assert.equal(similarCoverFingerprints(original, transformed), true, transform.codec);
  }
  const mirrored = originalCover((x, y) => originalPixel(143 - x, y));
  const blank = originalCover(() => [52, 65, 200]);
  assert.equal(similarCoverFingerprints(original, mirrored), false);
  assert.equal(similarCoverFingerprints(blank, blank), false);
  assert.equal(similarCoverFingerprints(original, 'https://example.org/cover.jpg'), false);
});

test('visually matching covers corroborate scoped sources and facts without overriding contradictory content', () => {
  const common = {source_urls:['https://example.org/source1','https://example.org/source2'],people:['林工'],numbers:['27.4%']};
  const draft = {id:'draft',account:'V字',platform_article_id:'old-id',publish_status:'pending',title:'原稿标题',
    match_evidence:{...common,cover_fingerprint:originalCover()}};
  const incoming = {account:'V字',platform_article_id:'new-id',title:'发布标题',
    match_evidence:{...common,cover_fingerprint:transformedCover(transforms[0])}};
  assert.equal(matchPublishedDraft([draft], incoming).evidence.cover, true);
  assert.equal(matchPublishedDraft([draft], {...incoming,match_evidence:{cover_fingerprint:incoming.match_evidence.cover_fingerprint}}).kind,'none');
  const draftBody = '工厂试验台在复验阶段更换陶瓷轴承，三号传感器在下午第一次测得回流口温度恢复到规定范围。后续检查记录了电机绕组和绝缘层的组装顺序，两位值班技师分别测量了固定夹具的偏心量。';
  const differentBody = '质检组只比较成品的锈蚀速度，将样件分成四组后分别投入潮湿的库房，再按检定表顺序检查。此次试验观察钢板在运输过程中的表面颜色变化，设备功率和冷却时间未纳入统计。';
  assert.equal(matchPublishedDraft([{...draft,match_evidence:{...draft.match_evidence,body:draftBody}}],
    {...incoming,match_evidence:{...incoming.match_evidence,body:differentBody}}).kind,'none');
});
