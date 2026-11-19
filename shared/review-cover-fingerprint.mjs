const SIZE = 12;
const PREFIX = 'cover-v1:';
const CHANNELS = 3;
const LENGTH = SIZE * SIZE * CHANNELS;
const fingerprintPattern = /^cover-v1:[0-9a-f]{864}$/u;

/** Average decoded RGB over a fixed grid. Area sampling preserves low-frequency
 * image content across independent resizing and changes in codec or quality. */
export function createCoverFingerprint({data, width, height}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < SIZE || height < SIZE ||
      width * height > 16_000_000 || !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      data.length !== width * height * 4) {
    throw new TypeError('Expected bounded 8-bit RGBA image data');
  }
  let result = PREFIX;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = pixelCell(data, width, x * width / SIZE, y * height / SIZE, (x + 1) * width / SIZE, (y + 1) * height / SIZE);
      for (const channel of cell) result += Math.round(channel).toString(16).padStart(2, '0');
    }
  }
  return result;
}

function pixelCell(data, width, left, top, right, bottom) {
  const sum = [0, 0, 0];
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    const height = Math.min(y + 1, bottom) - Math.max(y, top);
    for (let x = Math.floor(left); x < Math.ceil(right); x++) {
      const area = height * (Math.min(x + 1, right) - Math.max(x, left));
      const index = (y * width + x) * 4;
      const opacity = data[index + 3] / 255;
      for (let c = 0; c < CHANNELS; c++) sum[c] += area * (data[index + c] * opacity + 255 * (1 - opacity));
    }
  }
  return sum.map(value => value / ((right - left) * (bottom - top)));
}

/** Browser-side producer for local image files. The Worker compares fingerprints
 * without retrieving potentially untrusted image URLs or changing image records. */
export async function fingerprintCoverImage(image) {
  if (!(image instanceof Blob) || !image.type.startsWith('image/') || image.size > 12_000_000) {
    throw new TypeError('Expected a local image of at most 12 MB');
  }
  const bitmap = await createImageBitmap(image, {resizeWidth: 96, resizeHeight: 96, resizeQuality:'high'});
  try {
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) :
      Object.assign(document.createElement('canvas'), {width:bitmap.width, height:bitmap.height});
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return createCoverFingerprint(context.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    bitmap.close();
  }
}

export function isCoverFingerprint(value) {
  return typeof value === 'string' && fingerprintPattern.test(value);
}

function cellDistance(colors, one, two) {
  let total = 0;
  for (let c = 0; c < CHANNELS; c++) total += Math.abs(colors[one + c] - colors[two + c]);
  return total / CHANNELS;
}

function informative(colors) {
  let contrast = 0;
  for (let i = 0; i < LENGTH; i += CHANNELS) {
    if ((i / CHANNELS) % SIZE > 0) contrast += cellDistance(colors, i, i - CHANNELS);
    if (i >= SIZE * CHANNELS) contrast += cellDistance(colors, i, i - SIZE * CHANNELS);
  }
  return contrast / (2 * SIZE * (SIZE - 1)) >= 4;
}

function fingerprintColors(fingerprint) {
  return fingerprint.slice(PREFIX.length).match(/../gu).map(pair => Number.parseInt(pair, 16));
}

export function similarCoverFingerprints(left, right) {
  if (!isCoverFingerprint(left) || !isCoverFingerprint(right)) return false;
  const a = fingerprintColors(left);
  const b = fingerprintColors(right);
  if (!informative(a) || !informative(b)) return false;
  let distance = 0;
  let distinctlyDifferentCells = 0;
  for (let i = 0; i < LENGTH; i += CHANNELS) {
    let cell = 0;
    for (let c = 0; c < CHANNELS; c++) cell += Math.abs(a[i + c] - b[i + c]);
    distance += cell;
    if (cell / CHANNELS > 35) distinctlyDifferentCells++;
  }
  return distance / LENGTH <= 16 && distinctlyDifferentCells <= 12;
}
