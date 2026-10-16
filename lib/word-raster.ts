import {Inflate} from 'pako';

export const WORD_RASTER_UNSUPPORTED = 'Word配图像素解码仅支持非交错8位RGB/RGBA PNG，请真实转换为该格式后重试';
export const WORD_RASTER_INVALID = 'Word配图像素解码失败，请核对真实图片';
export const WORD_RASTER_LIMIT = 'Word配图超过像素解码限额，请缩小真实图片后重试';

export type WordRasterVerification = {
  pixel_decode_verified: true;
  decode_version: 1;
  format: 'png';
  width: number;
  height: number;
};

const MAX_ENCODED = 20 * 1024 * 1024;
const MAX_PIXELS = 4_000_000;
const MAX_DIMENSION = 8192;
const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_CHUNKS = 4096;
const OUTPUT_CHUNK = 16 * 1024;
const INPUT_CHUNK = 512;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function invalid(): never { throw Error(WORD_RASTER_INVALID); }
function unsupported(): never { throw Error(WORD_RASTER_UNSUPPORTED); }
function tooLarge(): never { throw Error(WORD_RASTER_LIMIT); }

const crcTable = new Uint32Array(256);
for (let n = 0; n < crcTable.length; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  crcTable[n] = value >>> 0;
}
function crc32(bytes: Uint8Array, start: number, end: number) {
  let value = 0xffffffff;
  for (let at = start; at < end; at++) value = (value >>> 8) ^ crcTable[(value ^ bytes[at]) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function paeth(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const dl = Math.abs(estimate - left), du = Math.abs(estimate - up), dul = Math.abs(estimate - upperLeft);
  return dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
}

// All samples are reconstructed. Only these two rows are retained, never a bitmap.
class PngRows {
  private previous: Uint8Array;
  private current: Uint8Array;
  private offset = -1;
  private filter = 0;
  private rows = 0;
  private output = 0;
  private pixels = 0;
  private readonly rowBytes: number;
  readonly expected: number;

  constructor(private readonly width: number, private readonly height: number, private readonly channels: number) {
    this.rowBytes = width * channels;
    this.expected = (this.rowBytes + 1) * height;
    this.previous = new Uint8Array(this.rowBytes);
    this.current = new Uint8Array(this.rowBytes);
  }
  consume(chunk: Uint8Array) {
    this.output += chunk.length;
    if (this.output > this.expected || this.output > MAX_OUTPUT) invalid();
    for (let at = 0; at < chunk.length; at++) {
      if (this.offset === -1) {
        this.filter = chunk[at];
        if (this.filter > 4 || this.rows >= this.height) invalid();
        this.offset = 0;
        continue;
      }
      const left = this.offset >= this.channels ? this.current[this.offset - this.channels] : 0;
      const up = this.previous[this.offset];
      const upperLeft = this.offset >= this.channels ? this.previous[this.offset - this.channels] : 0;
      let predictor = 0;
      switch (this.filter) {
        case 1: predictor = left; break;
        case 2: predictor = up; break;
        case 3: predictor = Math.floor((left + up) / 2); break;
        case 4: predictor = paeth(left, up, upperLeft); break;
      }
      this.current[this.offset++] = (chunk[at] + predictor) & 255;
      if (this.offset === this.rowBytes) {
        // RGB/RGBA8 samples have no palette or packed-sample ambiguity.
        this.pixels += this.width;
        this.rows++;
        const oldPrevious = this.previous;
        this.previous = this.current;
        this.current = oldPrevious;
        this.offset = -1;
      }
    }
  }
  finish() {
    if (this.output !== this.expected || this.offset !== -1 || this.rows !== this.height || this.pixels !== this.width * this.height) invalid();
  }
}

// These counters are present in pinned pako 2.1.0 but absent from its public types.
type CountedInflate = Inflate & {ended: boolean; strm: {avail_in: number; total_in: number}};

/** Complete, bounded PNG sample decoding for the new Word recovery protocol. */
export function verifyWordRasterPixels(bytes: Uint8Array): WordRasterVerification {
  if (bytes.length > MAX_ENCODED) tooLarge();
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((byte, at) => bytes[at] !== byte)) unsupported();
  if (bytes.length < 33) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, channels = 0, chunkCount = 0;
  let ended = false, palette = false, transparency = false;
  let idatState: 'before' | 'inside' | 'after' = 'before';
  const idats: Uint8Array[] = [];
  let compressedBytes = 0;
  while (at < bytes.length) {
    if (++chunkCount > MAX_CHUNKS) tooLarge();
    if (bytes.length - at < 12) invalid();
    const length = view.getUint32(at);
    if (length > bytes.length - at - 12) invalid();
    for (let index = at + 4; index < at + 8; index++) {
      const char = bytes[index];
      if (!(char >= 65 && char <= 90) && !(char >= 97 && char <= 122)) invalid();
    }
    if (bytes[at + 6] & 32) invalid(); // PNG chunk type's reserved bit.
    const kind = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const dataAt = at + 8, end = dataAt + length + 4;
    if (crc32(bytes, at + 4, dataAt + length) !== view.getUint32(dataAt + length)) invalid();
    if (at === 8) {
      if (kind !== 'IHDR' || length !== 13) invalid();
      width = view.getUint32(dataAt); height = view.getUint32(dataAt + 4);
      const depth = bytes[dataAt + 8], color = bytes[dataAt + 9], interlace = bytes[dataAt + 12];
      if (!width || !height || bytes[dataAt + 10] !== 0 || bytes[dataAt + 11] !== 0 || interlace > 1) invalid();
      const depths: Record<number, number[]> = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]};
      if (!depths[color]?.includes(depth)) invalid();
      if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) unsupported();
      channels = color === 2 ? 3 : 4;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS || (width * channels + 1) * height > MAX_OUTPUT) tooLarge();
    } else if (kind === 'IHDR') invalid();
    if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') unsupported();
    if (kind === 'PLTE') {
      if (palette || transparency || idatState !== 'before' || !length || length % 3 !== 0 || length > 768) invalid();
      palette = true;
    } else if (kind === 'tRNS') {
      if (transparency || channels !== 3 || idatState !== 'before' || length !== 6) invalid();
      // The supported 8-bit profile requires unambiguous 8-bit transparency samples.
      if (bytes[dataAt] !== 0 || bytes[dataAt + 2] !== 0 || bytes[dataAt + 4] !== 0) invalid();
      transparency = true;
    } else if (kind === 'IDAT') {
      if (idatState === 'after') invalid();
      idatState = 'inside';
      idats.push(bytes.subarray(dataAt, dataAt + length));
      compressedBytes += length;
    } else {
      if (idatState === 'inside') idatState = 'after';
      if (kind === 'IEND') {
        if (length !== 0 || !idats.length || end !== bytes.length) invalid();
        ended = true;
        break;
      }
      if (kind !== 'IHDR' && kind !== 'PLTE' && kind !== 'tRNS' && !(bytes[at + 4] & 32)) invalid();
    }
    at = end;
  }
  if (!ended || compressedBytes < 6) invalid();
  let headerAt = 0;
  const zlibHeader = new Uint8Array(2);
  for (const idat of idats) {
    for (let index = 0; index < idat.length && headerAt < 2; index++) zlibHeader[headerAt++] = idat[index];
    if (headerAt === 2) break;
  }
  if ((zlibHeader[0] & 15) !== 8 || (zlibHeader[0] >>> 4) > 7 || ((zlibHeader[0] << 8) | zlibHeader[1]) % 31 !== 0 || (zlibHeader[1] & 32)) invalid();
  const rows = new PngRows(width, height, channels);
  const inflater = new Inflate({windowBits: 15, chunkSize: OUTPUT_CHUNK}) as CountedInflate;
  inflater.onData = chunk => {
    if (!(chunk instanceof Uint8Array) || chunk.length > OUTPUT_CHUNK) invalid();
    rows.consume(chunk);
  };
  let fed = 0;
  try {
    for (const idat of idats) for (let offset = 0; offset < idat.length; offset += INPUT_CHUNK) {
      if (inflater.ended) invalid();
      const chunk = idat.subarray(offset, offset + INPUT_CHUNK);
      fed += chunk.length;
      if (!inflater.push(chunk, fed === compressedBytes) || inflater.err !== 0 || inflater.strm.avail_in !== 0 || inflater.strm.total_in !== fed) invalid();
    }
    if (!inflater.ended || inflater.err !== 0 || fed !== compressedBytes) invalid();
    rows.finish();
  } catch {
    invalid();
  }
  return {pixel_decode_verified: true, decode_version: 1, format: 'png', width, height};
}
