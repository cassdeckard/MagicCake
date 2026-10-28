// CRT simulation for magic-cake. An independent CPU implementation (no shader
// code copied) inspired by the look and published parameters of crt-royale by
// TroggleMonkey (libretro slang-shaders, GPLv2+). See README.
//
// The source frame (SW x SH, e.g. 256x224) is treated as the CRT's signal:
// one Gaussian-ish beam per source row, horizontally reconstructed with a soft
// cubic filter, drawn at the OUTPUT resolution, then multiplied by a phosphor
// mask in output pixels, plus bloom/halation, curvature, rounded corners and
// a vignette. Per-pixel geometry is precomputed once; per-frame work runs in
// worker threads over horizontal bands using SharedArrayBuffers.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import os from 'node:os'

export const PRESETS = {
  none: null,
  royale: {
    gammaIn: 2.4, gammaOut: 2.2,
    sigmaMin: 0.13, sigmaMax: 0.34, sigmaPow: 1 / 3, // beam width vs. brightness (in scanlines)
    shapeMin: 2, shapeMax: 4, shapePow: 1 / 4, // generalized Gaussian: flatter, wider when bright
    mask: 'aperture', triad: 3, maskDim: 0.2, // unlit phosphor level
    bloom: 0.25, diffusion: 0.075, halation: 0.04,
    curvature: 0, corner: 0.03, vignette: 0.25,
    scanline: 1, gain: 1.15
  }
}
export const MASKS = ['aperture', 'slot', 'shadow']
const PAD = 2 // source padding columns on each side for the 4-tap filter
const NQ = 64, ND = 192, DR = 1.5 // beam LUT: color levels x row-distance bins over [-DR, DR]
const OUTQ = 4096

function gammaFn (x, g) { return Math.pow(x, g) }
function lgamma1p (x) { // Gamma(1+x) for x in (0,1], Lanczos approximation enough for normalization
  const g = 7; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  let z = x; let a = c[0]; const t = z + g + 0.5
  for (let i = 1; i < 9; i++) a += c[i] / (z + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a
}

// Everything that only depends on sizes/settings.
function buildGeometry (p, SW, SH, W, H, mode) {
  // Screen rectangle in output pixels and the visible source window.
  let sx, sy, rx0 = 0, ry0 = 0, rw = W, rh = H
  if (mode === 'stretch') { sx = W / SW; sy = H / SH } else {
    const s = mode === 'fit' ? Math.min(W / SW, H / SH) : Math.max(W / SW, H / SH)
    sx = sy = s
    if (mode === 'fit') { rw = SW * s; rh = SH * s; rx0 = (W - rw) / 2; ry0 = (H - rh) / 2 }
  }
  // visible source window (centered)
  const vw = rw / sx, vh = rh / sy
  const u0 = (SW - vw) / 2, v0 = (SH - vh) / 2
  const N = W * H
  const g = {
    row: new Int16Array(N), dq: new Uint8Array(N), // nearest source row and its sub-row offset bin
    hx: new Int32Array(N), hw: new Float32Array(N * 4), // 4 taps (index into padded row)
    bw: new Float32Array(N), // vertical lerp weight toward row+1 for bloom sampling
    mul: new Float32Array(N), // corners * vignette * inside
    mask: new Float32Array(N * 3)
  }
  const k = p.curvature
  const asp = rw / rh
  const diag = Math.hypot(asp, 1)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      // normalized screen coords [-1,1]
      let nx = ((x + 0.5 - rx0) / rw) * 2 - 1
      let ny = ((y + 0.5 - ry0) / rh) * 2 - 1
      if (k > 0) { // barrel: points farther out sample farther out (screen bulges toward viewer)
        const px = nx * asp / diag, py = ny / diag
        const r2 = px * px + py * py
        const f = 1 + k * 0.28 * r2 + k * k * 0.06 * r2 * r2
        const z = 1 + k * 0.28 * 0.5 // keep the edge midpoints roughly in frame
        nx = nx * f / z; ny = ny * f / z
      }
      const ax = Math.abs(nx), ay = Math.abs(ny)
      // rounded-corner mask in screen units
      const cr = p.corner * 2
      const ex = Math.max(ax - (1 - cr * rh / rw), 0) * rw / rh, ey = Math.max(ay - (1 - cr), 0)
      const edge = cr > 0 ? cr - Math.hypot(ex, ey) : Math.min(1 - ax, 1 - ay)
      const inside = Math.min(1, Math.max(0, edge * (rh / 2) / 1.5 + 0.5)) * (ax <= 1 && ay <= 1 ? 1 : 0)
      const vig = 1 - p.vignette * Math.pow((nx * nx + ny * ny) / 2, 1.5)
      // source coords
      const u = u0 + (nx + 1) / 2 * vw
      const v = v0 + (ny + 1) / 2 * vh
      const onSrc = u >= 0 && u < SW && v >= 0 && v < SH
      g.mul[i] = onSrc ? inside * vig : 0
      const rn = Math.min(SH - 1, Math.max(0, Math.floor(v)))
      g.row[i] = rn
      const d = v - (rn + 0.5) // [-0.5,0.5]
      g.dq[i] = Math.max(0, Math.min(ND - 1, Math.round((d + DR) / (2 * DR) * (ND - 1))))
      g.bw[i] = d
      // horizontal: Catmull-Rom-ish softened (Keys B=1/3,C=1/3 Mitchell) on 4 taps
      const uc = Math.min(SW - 0.5, Math.max(0.5, u)) - 0.5
      const ui = Math.floor(uc); const t = uc - ui
      g.hx[i] = ui - 1 + PAD
      const B = 1 / 3, C = 1 / 3
      const w = [t + 1, t, 1 - t, 2 - t].map(a => a < 1
        ? ((12 - 9 * B - 6 * C) * a * a * a + (-18 + 12 * B + 6 * C) * a * a + (6 - 2 * B)) / 6
        : ((-B - 6 * C) * a * a * a + (6 * B + 30 * C) * a * a + (-12 * B - 48 * C) * a + (8 * B + 24 * C)) / 6)
      const ws = w[0] + w[1] + w[2] + w[3]
      for (let j = 0; j < 4; j++) g.hw[i * 4 + j] = w[j] / ws
      // phosphor mask (output pixel space, ignores curvature like a fixed mask)
      const T = p.triad, lo = p.maskDim
      let m = [lo, lo, lo]
      if (p.mask === 'aperture') { m[Math.floor((x % T) * 3 / T)] = 1 } else if (p.mask === 'slot') {
        const cell = Math.floor(x / T); const yy = (y + (cell & 1) * 2) % 4
        if (yy !== 3) m[Math.floor((x % T) * 3 / T)] = 1; else m = [lo * 0.6, lo * 0.6, lo * 0.6]
      } else { // shadow: offset dot rows
        const row2 = Math.floor(y / 2) & 1
        m[Math.floor(((x + row2 * Math.floor(T / 2)) % T) * 3 / T)] = 1
      }
      g.mask[i * 3] = m[0]; g.mask[i * 3 + 1] = m[1]; g.mask[i * 3 + 2] = m[2]
    }
  }
  // mask brightness compensation: average lit fraction
  let ms = 0; for (let i = 0; i < g.mask.length; i++) ms += g.mask[i]
  g.maskGain = 1 / (ms / g.mask.length)
  g.rowsPerPx = vh / rh // scanlines per output pixel (for antialiasing the beam)
  return g
}

function buildBeamLut (p, rowsPerPx) {
  // lut[c*ND + dq]: summed light at offset d from 3 neighbouring beams' centers?
  // No: per-beam profile; caller sums rows -1,0,+1 using offsets d+1, d, d-1.
  const lut = new Float32Array(NQ * ND * 3) // [c][dq][k] k=row offset -1,0,+1
  const ss = 5
  for (let ci = 0; ci < NQ; ci++) {
    const c = ci / (NQ - 1)
    let sig = p.sigmaMin + (p.sigmaMax - p.sigmaMin) * Math.pow(c, p.sigmaPow)
    const shp = p.shapeMin + (p.shapeMax - p.shapeMin) * Math.pow(c, p.shapePow)
    // weaker scanlines: widen toward a flat field
    sig = sig + (0.75 - sig) * (1 - p.scanline)
    const area = 2 * sig * lgamma1p(1 / shp)
    for (let di = 0; di < ND; di++) {
      const d = di / (ND - 1) * 2 * DR - DR
      for (let kk = -1; kk <= 1; kk++) {
        let acc = 0
        for (let s = 0; s < ss; s++) { // box-antialias over the output pixel's height
          const dd = d - kk + ((s + 0.5) / ss - 0.5) * rowsPerPx
          acc += Math.exp(-Math.pow(Math.abs(dd) / sig, shp))
        }
        lut[(ci * ND + di) * 3 + kk + 1] = acc / ss / area
      }
    }
  }
  return lut
}

// ---- per-band kernel (runs in workers) ----
function kernel (st, y0, y1) {
  const { g, lut, W, SW, SH, src, blur, out, outLut, p } = st
  const RW = SW + 2 * PAD
  const gain = g.maskGain * p.gain
  const bloomK = p.bloom, diffK = p.diffusion + p.halation
  for (let y = y0; y < y1; y++) {
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const o = i * 4
      const mul = g.mul[i]
      if (mul <= 0) { out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255; continue }
      const rn = g.row[i], dq = g.dq[i], hx = g.hx[i], hw = i * 4
      const w0 = g.hw[hw], w1 = g.hw[hw + 1], w2 = g.hw[hw + 2], w3 = g.hw[hw + 3]
      let r = 0, gg = 0, b = 0, br = 0, bgc = 0, bb = 0
      const d = g.bw[i]
      for (let k = -1; k <= 1; k++) {
        const ry = rn + k
        if (ry < 0 || ry >= SH) continue
        let s = (ry * RW + hx) * 3
        let cr = w0 * src[s] + w1 * src[s + 3] + w2 * src[s + 6] + w3 * src[s + 9]
        let cg = w0 * src[s + 1] + w1 * src[s + 4] + w2 * src[s + 7] + w3 * src[s + 10]
        let cb = w0 * src[s + 2] + w1 * src[s + 5] + w2 * src[s + 8] + w3 * src[s + 11]
        if (cr < 0) cr = 0; if (cg < 0) cg = 0; if (cb < 0) cb = 0
        const kk = k + 1
        r += cr * lut[((Math.min(cr, 1) * (NQ - 1) + 0.5 | 0) * ND + dq) * 3 + kk]
        gg += cg * lut[((Math.min(cg, 1) * (NQ - 1) + 0.5 | 0) * ND + dq) * 3 + kk]
        b += cb * lut[((Math.min(cb, 1) * (NQ - 1) + 0.5 | 0) * ND + dq) * 3 + kk]
        // blurred (bloom) image, linear between rows
        const bwk = k === 0 ? 1 - Math.abs(d) : (k === 1 ? (d > 0 ? d : 0) : (d < 0 ? -d : 0))
        if (bwk > 0) {
          br += bwk * (w0 * blur[s] + w1 * blur[s + 3] + w2 * blur[s + 6] + w3 * blur[s + 9])
          bgc += bwk * (w0 * blur[s + 1] + w1 * blur[s + 4] + w2 * blur[s + 7] + w3 * blur[s + 10])
          bb += bwk * (w0 * blur[s + 2] + w1 * blur[s + 5] + w2 * blur[s + 8] + w3 * blur[s + 11])
        }
      }
      const m = i * 3
      // phosphors: masked beam; bloom fills unlit phosphors from bright neighbours
      r = r * g.mask[m] * gain; gg = gg * g.mask[m + 1] * gain; b = b * g.mask[m + 2] * gain
      r = (r * (1 - diffK) + br * diffK + bloomK * br * br * g.mask[m] * gain) * mul
      gg = (gg * (1 - diffK) + bgc * diffK + bloomK * bgc * bgc * g.mask[m + 1] * gain) * mul
      b = (b * (1 - diffK) + bb * diffK + bloomK * bb * bb * g.mask[m + 2] * gain) * mul
      // soft shoulder instead of hard clip
      r = r > 0.8 ? 0.8 + 0.2 * Math.tanh((r - 0.8) / 0.2) : r
      gg = gg > 0.8 ? 0.8 + 0.2 * Math.tanh((gg - 0.8) / 0.2) : gg
      b = b > 0.8 ? 0.8 + 0.2 * Math.tanh((b - 0.8) / 0.2) : b
      out[o] = outLut[(r * (OUTQ - 1) + 0.5) | 0]
      out[o + 1] = outLut[(gg * (OUTQ - 1) + 0.5) | 0]
      out[o + 2] = outLut[(b * (OUTQ - 1) + 0.5) | 0]
      out[o + 3] = 255
    }
  }
}

function setupState (p, SW, SH, W, H, mode, shared) {
  const g = buildGeometry(p, SW, SH, W, H, mode)
  const lut = buildBeamLut(p, g.rowsPerPx)
  const outLut = new Uint8Array(OUTQ)
  for (let i = 0; i < OUTQ; i++) outLut[i] = Math.round(255 * Math.pow(i / (OUTQ - 1), 1 / p.gammaOut))
  const RW = SW + 2 * PAD
  return { g, lut, outLut, p, W, H, SW, SH,
    src: new Float32Array(shared.src), blur: new Float32Array(shared.blur), out: new Uint8Array(shared.out), RW }
}

if (!isMainThread && workerData && workerData.crtWorker) {
  const { p, SW, SH, W, H, mode, shared } = workerData
  const st = setupState(p, SW, SH, W, H, mode, shared)
  parentPort.postMessage('ready')
  parentPort.on('message', ([y0, y1]) => { kernel(st, y0, y1); parentPort.postMessage('done') })
}

export async function createCrt (opts, SW, SH, W, H, mode) {
  const base = PRESETS[opts.preset]
  if (!base) return null
  const p = { ...base }
  for (const k of ['mask', 'curvature', 'bloom', 'scanline', 'triad']) if (opts[k] !== undefined) p[k] = opts[k]
  const RW = SW + 2 * PAD
  const shared = {
    src: new SharedArrayBuffer(RW * SH * 3 * 4), blur: new SharedArrayBuffer(RW * SH * 3 * 4),
    out: new SharedArrayBuffer(W * H * 4)
  }
  const src = new Float32Array(shared.src), blur = new Float32Array(shared.blur), out = new Uint8Array(shared.out)
  const tmp = new Float32Array(RW * SH * 3)
  const inLut = new Float32Array(256)
  for (let i = 0; i < 256; i++) inLut[i] = gammaFn(i / 255, p.gammaIn)
  const nw = Math.max(1, Math.min(opts.threads || os.cpus().length, 16))
  const workers = []
  await Promise.all(Array.from({ length: nw }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { crtWorker: true, p, SW, SH, W, H, mode, shared } })
    w.once('message', () => resolve()); w.once('error', reject); workers.push(w)
  })))
  const bands = workers.map((_, j) => [Math.floor(j * H / nw), Math.floor((j + 1) * H / nw)])
  function boxBlur (a, b, rad, horiz) { // a -> b, separable box blur, edge clamp
    const n = horiz ? SW : SH, m = horiz ? SH : SW
    for (let q = 0; q < m; q++) for (let c = 0; c < 3; c++) {
      const idx = t => ((horiz ? q * RW + PAD + t : t * RW + PAD + q) * 3 + c)
      let acc = 0
      for (let t = -rad; t <= rad; t++) acc += a[idx(Math.min(n - 1, Math.max(0, t)))]
      for (let t = 0; t < n; t++) {
        b[idx(t)] = acc / (2 * rad + 1)
        acc += a[idx(Math.min(n - 1, t + rad + 1))] - a[idx(Math.max(0, t - rad))]
      }
    }
  }
  return {
    params: p,
    async process (rgba) {
      // linearize into padded rows (edge pixels repeated)
      for (let y = 0; y < SH; y++) for (let x = -PAD; x < SW + PAD; x++) {
        const sxp = Math.min(SW - 1, Math.max(0, x)); const s = (y * SW + sxp) * 4; const d = (y * RW + x + PAD) * 3
        src[d] = inLut[rgba[s]]; src[d + 1] = inLut[rgba[s + 1]]; src[d + 2] = inLut[rgba[s + 2]]
      }
      // bloom/halation source: ~Gaussian via 3 box passes each way
      blur.set(src)
      for (let k = 0; k < 2; k++) { boxBlur(blur, tmp, 3, true); boxBlur(tmp, blur, 3, true); boxBlur(blur, tmp, 3, false); boxBlur(tmp, blur, 3, false) }
      for (let y = 0; y < SH; y++) for (let c = 0; c < 3; c++) { // pad columns
        for (let x = 0; x < PAD; x++) { blur[(y * RW + x) * 3 + c] = blur[(y * RW + PAD) * 3 + c]; blur[(y * RW + PAD + SW + x) * 3 + c] = blur[(y * RW + PAD + SW - 1) * 3 + c] }
      }
      await Promise.all(workers.map((w, j) => new Promise(r => { w.once('message', r); w.postMessage(bands[j]) })))
      return Buffer.from(out) // copy
    },
    close () { for (const w of workers) w.terminate() }
  }
}
