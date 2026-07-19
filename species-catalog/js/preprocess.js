/**
 * Canvas-based OCR pre-processing pipeline.
 *
 * Tesseract accuracy on real 조경업체 거래명세서 photos/scans varies wildly
 * with input quality: shadow, low DPI, JPEG compression, tilted phone shots.
 * This module runs a fixed, dependency-free pipeline before every OCR call
 * so downstream stages get a consistent input:
 *
 *   1. 2× upscale (imageSmoothingQuality:"high") — small font recovery
 *   2. Grayscale (Rec. 601 luma) — Tesseract ignores color anyway
 *   3. Contrast stretch (0.5 % percentile clip) — kills washed-out shots
 *   4. Unsharp mask — recovers character edges softened by resample
 *
 * We deliberately DO NOT threshold (bilevel loses anti-aliasing on
 * photos → worse OCR) and DO NOT deskew (small rotations Tesseract
 * handles internally; large ones need a heavy CV lib we don't want).
 *
 * All functions are pure: no storage / DOM outside the working canvas
 * they build and return.
 */

// Guard against runaway memory on huge inputs — a 6000×6000 upscaled to
// 12k is 576 MB RGBA. Clamp the longest side to this after scaling.
const PREPROCESSED_MAX_DIM = 3200;

// ============================================================
// Public API
// ============================================================

/**
 * Run the OCR preprocessing pipeline on a source image.
 *
 * @param {Blob|File|HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {{ scale?: number }} [opts]
 * @returns {Promise<HTMLCanvasElement>} preprocessed canvas, ready for
 *          `Tesseract.recognize(canvas)`.
 */
export async function preprocessForOcr(source, opts = {}) {
  const scale  = opts.scale ?? 2;
  const canvas = await sourceToCanvas(source, scale);
  const ctx    = canvas.getContext("2d", { willReadFrequently: true });
  const img    = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data   = img.data;

  grayscaleInPlace(data);
  contrastStretchInPlace(data);
  unsharpMaskInPlace(img, /* amount */ 0.6);

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Encode a canvas as a small JPEG data URL suitable for a Debug Panel
 * thumbnail (~30-80 KB). Keeps aspect ratio; downscales longest side to
 * `maxWidth` first (default 320 px).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ maxWidth?: number, quality?: number }} [opts]
 * @returns {string} data:image/jpeg;base64,...
 */
export function canvasToThumbnailDataUrl(canvas, opts = {}) {
  const maxWidth = opts.maxWidth ?? 320;
  const quality  = opts.quality  ?? 0.6;
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return "";
  const s = Math.min(1, maxWidth / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(h * s));
  const tc = document.createElement("canvas");
  tc.width  = tw;
  tc.height = th;
  const ctx = tc.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(canvas, 0, 0, tw, th);
  return tc.toDataURL("image/jpeg", quality);
}

/**
 * Draw an arbitrary source (File/Blob/Image/Canvas) into a fresh canvas
 * at 2× (or whatever `scale`), letting the canvas' built-in high-quality
 * interpolation do bicubic-ish upsampling for us.
 */
async function sourceToCanvas(source, scale) {
  let bitmap;
  let srcW, srcH;

  if (source instanceof HTMLCanvasElement) {
    // PDF pipeline already rendered at 2× scale — treat as 1× to avoid double.
    return source.width && source.height ? source : source;
  } else if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    bitmap = source;
    srcW = source.naturalWidth  || source.width;
    srcH = source.naturalHeight || source.height;
  } else if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    bitmap = source;
    srcW = source.width; srcH = source.height;
  } else if (source instanceof Blob) {
    bitmap = await createImageBitmap(source);
    srcW = bitmap.width; srcH = bitmap.height;
  } else {
    throw new Error("preprocessForOcr: unsupported source type");
  }

  let dw = Math.max(1, Math.round(srcW * scale));
  let dh = Math.max(1, Math.round(srcH * scale));
  const longest = Math.max(dw, dh);
  if (longest > PREPROCESSED_MAX_DIM) {
    const s = PREPROCESSED_MAX_DIM / longest;
    dw = Math.max(1, Math.round(dw * s));
    dh = Math.max(1, Math.round(dh * s));
  }

  const canvas = document.createElement("canvas");
  canvas.width  = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  return canvas;
}

// ============================================================
// Filter primitives (all in-place on ImageData buffer)
// ============================================================

/** Rec.601 luma → single gray value replicated to R/G/B. Alpha untouched. */
function grayscaleInPlace(data) {
  for (let i = 0; i < data.length; i += 4) {
    const g = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}

/**
 * Linear stretch (v - lo) * 255 / (hi - lo) where [lo, hi] are the
 * 0.5% / 99.5% percentiles of the gray channel. Skips constant images.
 */
function contrastStretchInPlace(data) {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

  const clip = Math.max(1, Math.round(n * 0.005));
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++)   { acc += hist[v]; if (acc >= clip) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--)  { acc += hist[v]; if (acc >= clip) { hi = v; break; } }
  if (hi <= lo + 5) return;   // near-constant image — leave alone

  const range = hi - lo;
  for (let i = 0; i < data.length; i += 4) {
    let v = data[i];
    v = v <= lo ? 0
      : v >= hi ? 255
      : Math.round((v - lo) * 255 / range);
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

/**
 * 3×3 unsharp mask (single convolution): out = c·center − a·(N+S+E+W)
 * where c = 1 + 4a. `amount` in [0.3, 1.0] — 0.6 = mild sharpen without
 * halo artifacts on ordinary photos.
 */
function unsharpMaskInPlace(img, amount) {
  const w = img.width, h = img.height;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const a = amount;
  const c = 1 + 4 * a;
  const stride = w * 4;

  // Copy borders unchanged; convolve interior.
  out.set(src.subarray(0, stride));                         // top row
  out.set(src.subarray(src.length - stride), src.length - stride); // bottom row

  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * stride;
    // Left + right border pixels of this row: copy raw.
    out[rowOff]     = src[rowOff];
    out[rowOff + 1] = src[rowOff + 1];
    out[rowOff + 2] = src[rowOff + 2];
    out[rowOff + 3] = src[rowOff + 3];
    const rightOff = rowOff + stride - 4;
    out[rightOff]     = src[rightOff];
    out[rightOff + 1] = src[rightOff + 1];
    out[rightOff + 2] = src[rightOff + 2];
    out[rightOff + 3] = src[rightOff + 3];

    for (let x = 1; x < w - 1; x++) {
      const idx = rowOff + x * 4;
      const p  = src[idx];
      const pu = src[idx - stride];
      const pd = src[idx + stride];
      const pl = src[idx - 4];
      const pr = src[idx + 4];
      let v = c * p - a * (pu + pd + pl + pr);
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      out[idx] = out[idx + 1] = out[idx + 2] = v;
      out[idx + 3] = src[idx + 3];
    }
  }
  src.set(out);
}
