// Pure synthetic PNGs; no image fetches, storage, Site tools, or production access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript'), pako = require('pako');
assert.equal(require('pako/package.json').version, '2.1.0');
const statistics = {instances: 0, pushes: 0, maxInput: 0, maxOutput: 0, output: 0};
class ObservedInflate extends pako.Inflate {
  constructor(options) { super(options); statistics.instances++; assert.equal(options.chunkSize, 16384); assert.equal(options.windowBits, 15); }
  push(chunk, final) {
    statistics.pushes++;
    statistics.maxInput = Math.max(statistics.maxInput, chunk.length);
    if (!this.observed) {
      this.observed = true;
      const onData = this.onData;
      this.onData = bytes => {
        statistics.maxOutput = Math.max(statistics.maxOutput, bytes.length);
        statistics.output += bytes.length;
        return onData(bytes);
      };
    }
    return super.push(chunk, final);
  }
}
const sourcePath = path.join(root, 'lib/word-raster.ts');
// Only export visibility changes in this test compilation. Production code is unchanged.
const source = fs.readFileSync(sourcePath, 'utf8') + '\nexport {PngRows as TestPngRows};\n';
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const module = {exports: {}};
vm.runInNewContext(compiled, {module, exports: module.exports, require: name => name === 'pako' ? {...pako, Inflate: ObservedInflate} : require(name), Uint8Array, Uint32Array, DataView}, {filename: sourcePath});
const {verifyWordRasterPixels: verify, TestPngRows, WORD_RASTER_INVALID: INVALID, WORD_RASTER_UNSUPPORTED: UNSUPPORTED, WORD_RASTER_LIMIT: LIMIT} = module.exports;

let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
function rejected(bytes, expected = INVALID) { assert.throws(() => verify(bytes), error => error.message === expected); }
function proof(width, height) { return {pixel_decode_verified: true, decode_version: 1, format: 'png', width, height}; }
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(kind, data = Buffer.alloc(0)) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(kind, 4, 'latin1'); out.set(data, 8);
  out.writeUInt32BE(crc(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
function ihdr(width = 1, height = 1, {color = 2, depth = 8, interlace = 0, compression = 0, filter = 0} = {}) {
  const data = Buffer.alloc(13); data.writeUInt32BE(width); data.writeUInt32BE(height, 4);
  data.set([depth, color, compression, filter, interlace], 8);
  return chunk('IHDR', data);
}
function png({width = 1, height = 1, header = {}, raw = Buffer.from([0, 255, 0, 0]), compressed = deflateSync(raw), idats = [compressed], before = [], after = []} = {}) {
  return Buffer.concat([signature, ihdr(width, height, header), ...before, ...idats.map(data => chunk('IDAT', data)), ...after, chunk('IEND')]);
}
function filterRow(filter, row, previous, channels) {
  const output = Buffer.alloc(row.length + 1); output[0] = filter;
  for (let at = 0; at < row.length; at++) {
    const left = at >= channels ? row[at - channels] : 0, up = previous?.[at] || 0, upperLeft = at >= channels ? previous?.[at - channels] || 0 : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    if (filter === 2) predictor = up;
    if (filter === 3) predictor = Math.floor((left + up) / 2);
    if (filter === 4) {
      const p = left + up - upperLeft, differences = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upperLeft)];
      predictor = differences[0] <= differences[1] && differences[0] <= differences[2] ? left : differences[1] <= differences[2] ? up : upperLeft;
    }
    output[at + 1] = (row[at] - predictor + 256) % 256;
  }
  return output;
}

test('RGB and RGBA pixels round-trip all five filters with two-row reuse and split chunks', () => {
  for (const channels of [3, 4]) {
    const width = 3, filters = [0, 1, 2, 3, 4, 4], expected = filters.map((_, y) => Buffer.from(Array.from({length: width * channels}, (_, x) => (13 + 51 * x + 37 * y) & 255)));
    const filtered = expected.map((row, y) => filterRow(filters[y], row, expected[y - 1], channels));
    const rows = new TestPngRows(width, expected.length, channels);
    for (let y = 0; y < filtered.length; y++) {
      rows.consume(filtered[y].subarray(0, 2)); rows.consume(filtered[y].subarray(2));
      assert.deepEqual(Buffer.from(rows.previous), expected[y], 'Recovered samples must equal the original row');
    }
    rows.finish();
    assert.deepEqual(JSON.parse(JSON.stringify(verify(png({width, height: expected.length, header: {color: channels === 3 ? 2 : 6}, raw: Buffer.concat(filtered)})))), proof(width, expected.length));
  }
});
test('all predictors use zero neighbors at first row and left edge', () => {
  for (const channels of [3, 4]) for (const filter of [1, 2, 3, 4]) {
    const original = Buffer.from(Array.from({length: channels * 2}, (_, x) => (241 + x * 23) & 255));
    const rows = new TestPngRows(2, 1, channels);
    for (const byte of filterRow(filter, original, null, channels)) rows.consume(Uint8Array.of(byte));
    rows.finish(); assert.deepEqual(Buffer.from(rows.previous), original);
  }
});
test('zlib header split across IDAT chunks, empty IDATs, and nonzero byteOffset', () => {
  const compressed = deflateSync(Buffer.from([0, 12, 34, 56]));
  const image = png({idats: [compressed.subarray(0, 1), Buffer.alloc(0), compressed.subarray(1, 2), compressed.subarray(2), Buffer.alloc(0)]});
  const padded = Buffer.concat([Buffer.alloc(7, 0xaa), image, Buffer.alloc(9, 0xbb)]);
  assert.deepEqual(JSON.parse(JSON.stringify(verify(padded.subarray(7, 7 + image.length)))), proof(1, 1));
});
test('real compressed input crosses 512-byte pushes while output crosses row boundaries', () => {
  const width = 300, height = 20, raw = Buffer.alloc((width * 4 + 1) * height); let state = 157;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 4; x++) { state = (state * 1664525 + 1013904223) >>> 0; raw[y * (width * 4 + 1) + x] = state >>> 24; }
  const compressed = deflateSync(raw); assert.ok(compressed.length > 512);
  assert.deepEqual(JSON.parse(JSON.stringify(verify(png({width, height, header: {color: 6}, raw})))), proof(width, height));
  assert.ok(statistics.maxInput <= 512); assert.ok(statistics.maxOutput <= 16384);
});
test('optional RGB palette, transparency, and unknown ancillary chunks retain valid pixels', () => {
  verify(png({before: [chunk('PLTE', Buffer.from([1, 2, 3])), chunk('tRNS', Buffer.from([0, 255, 0, 0, 0, 0]))], after: [chunk('vpAg', Buffer.from([1, 2]))]}));
});

test('69-byte PNG with legal CRC and filter 255 is rejected', () => { const bad = png({raw: Buffer.from([255, 255, 0, 0])}); rejected(bad); });
test('all invalid filters are rejected on later rows as well', () => { for (const filter of [5, 255]) rejected(png({height: 2, raw: Buffer.from([0, 1, 2, 3, filter, 4, 5, 6])})); });
test('short, extra, and incomplete final rows cannot be reported as decoded', () => { for (const raw of [[0, 1, 2], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6]]) rejected(png({height: raw.length === 7 ? 2 : 1, raw: Buffer.from(raw)})); });
test('bad CRC, truncated chunk, oversized chunk declaration, and trailing IEND bytes fail', () => {
  const good = png(), crcBad = Buffer.from(good); crcBad[crcBad.length - 1] ^= 1; rejected(crcBad);
  rejected(good.subarray(0, -1));
  const lengthBad = Buffer.from(good); lengthBad.writeUInt32BE(0xffffffff, 33); rejected(lengthBad);
  rejected(Buffer.concat([good, Buffer.from([0])]));
  rejected(Buffer.concat([good, chunk('IEND')]));
});
test('IHDR must be first and unique; IEND must be present and empty', () => {
  rejected(Buffer.concat([signature, chunk('tEXt'), png().subarray(8)]));
  rejected(png({before: [ihdr()]}));
  rejected(png().subarray(0, -12));
  rejected(Buffer.concat([png().subarray(0, -12), chunk('IEND', Buffer.from([0]))]));
});
test('IDAT chunks must be consecutive and contain a nonempty zlib stream', () => {
  const data = deflateSync(Buffer.from([0, 1, 2, 3]));
  rejected(Buffer.concat([signature, ihdr(), chunk('IDAT', data.subarray(0, 2)), chunk('tEXt'), chunk('IDAT', data.subarray(2)), chunk('IEND')]));
  rejected(png({idats: [Buffer.alloc(0)]}));
  rejected(Buffer.concat([signature, ihdr(), chunk('IEND')]));
});
test('unknown critical chunks, invalid chunk type, and reserved bit are rejected', () => { for (const kind of ['ABCD', 'tE1t', 'abca']) rejected(png({before: [chunk(kind)]})); });
test('PLTE/tRNS placement, duplicates, and lengths are enforced', () => {
  const palette = chunk('PLTE', Buffer.from([1, 2, 3])), transparency = chunk('tRNS', Buffer.alloc(6));
  rejected(png({before: [palette, palette]})); rejected(png({before: [chunk('PLTE')]})); rejected(png({before: [chunk('PLTE', Buffer.alloc(2))]}));
  rejected(png({after: [palette]})); rejected(png({before: [transparency, palette]})); rejected(png({before: [transparency, transparency]}));
  rejected(png({before: [chunk('tRNS', Buffer.alloc(5))]})); rejected(png({after: [transparency]}));
  for (const at of [0, 2, 4]) { const highSample = Buffer.alloc(6); highSample[at] = 1; rejected(png({before: [chunk('tRNS', highSample)]})); }
  rejected(png({header: {color: 6}, raw: Buffer.alloc(5), before: [transparency]}));
});
test('invalid IHDR parameters and zero dimensions are rejected', () => {
  for (const header of [{color: 1}, {color: 2, depth: 4}, {color: 3, depth: 16}, {interlace: 2}, {compression: 1}, {filter: 1}]) rejected(png({header}));
  rejected(png({width: 0})); rejected(png({height: 0}));
});
test('unsupported valid PNG profiles, APNG, JPEG, WebP and GIF share a constant error', () => {
  for (const header of [{depth: 16}, {color: 0}, {color: 3}, {color: 4}, {interlace: 1}]) rejected(png({header}), UNSUPPORTED);
  rejected(png({before: [chunk('acTL', Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]))]}), UNSUPPORTED);
  for (const data of [Buffer.from([255, 216, 255, 217]), Buffer.from('RIFF0000WEBP'), Buffer.from('GIF89a')]) rejected(data, UNSUPPORTED);
});
test('Adler corruption, missing checksum, missing BFINAL, and invalid stored NLEN fail', () => {
  const stored = deflateSync(Buffer.from([0, 1, 2, 3]), {level: 0}); assert.equal(stored[2] & 1, 1);
  const badAdler = Buffer.from(stored); badAdler[badAdler.length - 1] ^= 1;
  const missingFinal = Buffer.from(stored); missingFinal[2] &= 254;
  const badNlen = Buffer.from(stored); badNlen[5] ^= 1;
  for (const compressed of [badAdler, stored.subarray(0, -4), missingFinal, badNlen]) rejected(png({compressed}));
});
test('zlib header checks reject wrong CM, bad FCHECK, oversized window, and FDICT', () => {
  const stored = deflateSync(Buffer.from([0, 1, 2, 3]), {level: 0});
  const badCheck = Buffer.from(stored); badCheck[1] ^= 1;
  const headers = [[0x79, 0], [0x88, 0], [0x78, 0x20]].map(([cmf, base]) => { let flg = base; while (((cmf << 8) | flg) % 31 !== 0) flg++; return Buffer.concat([Buffer.from([cmf, flg]), stored.subarray(2)]); });
  for (const compressed of [badCheck, ...headers]) rejected(png({compressed}));
});
test('trailing zlib bytes and concatenated empty stream cannot hide after complete pixels', () => {
  const data = deflateSync(Buffer.from([0, 1, 2, 3]));
  rejected(png({compressed: Buffer.concat([data, Buffer.from([0])])}));
  rejected(png({idats: [data, Buffer.from([0])]}));
  rejected(png({compressed: Buffer.concat([data, deflateSync(Buffer.alloc(0))])}));
  rejected(png({idats: [data, deflateSync(Buffer.alloc(0))]}));
});
test('1 MiB synthetic inflate bomb aborts at the first fixed-size output chunk', () => {
  const pushes = statistics.pushes, output = statistics.output;
  rejected(png({compressed: deflateSync(Buffer.alloc(1024 * 1024), {level: 9})}));
  assert.equal(statistics.pushes - pushes, 1); assert.equal(statistics.output - output, 16384);
});
test('4M pixels and 8192 axis are accepted at the exact boundaries', () => {
  const width = 2000, height = 2000;
  assert.deepEqual(JSON.parse(JSON.stringify(verify(png({width, height, raw: Buffer.alloc((width * 3 + 1) * height)})))), proof(width, height));
  assert.deepEqual(JSON.parse(JSON.stringify(verify(png({width: 8192, raw: Buffer.alloc(8192 * 3 + 1)})))), proof(8192, 1));
  assert.deepEqual(JSON.parse(JSON.stringify(verify(png({height: 8192, raw: Buffer.alloc(4 * 8192)})))), proof(1, 8192));
});
test('pixel, axis, encoded-byte and chunk-count excess fail before inflate allocation', () => {
  const count = statistics.instances;
  for (const image of [png({width: 2001, height: 2000}), png({width: 8193}), png({height: 8193}), Buffer.alloc(20 * 1024 * 1024 + 1), png({idats: Array.from({length: 4097}, () => Buffer.alloc(0))})]) rejected(image, LIMIT);
  assert.equal(statistics.instances, count);
});
console.log(JSON.stringify({passed, synthetic_only: true, dependency: 'pako@2.1.0', max_input_push: statistics.maxInput, max_output_chunk: statistics.maxOutput, pixel_samples_reconstructed: true}));
