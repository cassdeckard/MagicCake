#!/usr/bin/env node
// Render an EarthBound battle background to video. Rendering code vendored from
// https://github.com/gjtorikian/Earthbound-Battle-Backgrounds-JS (see vendor/LICENSE.txt).
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Rom from './vendor/rom/rom.js'
import BackgroundLayer from './vendor/rom/background_layer.js'
import { renderLayers, SNES_WIDTH, SNES_HEIGHT } from './vendor/engine.js'
import { createCrt, PRESETS, MASKS } from './lib/crt.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const USAGE = `Usage: magic-cake <layer1> <layer2> <out.mp4> [options]
       magic-cake <enemy>[-N] <out.mp4> [options]
       magic-cake <out.mp4> --chain "<spec>@<t> / ..." | --chain-file <file> [options]
       magic-cake --list-enemies [filter] [--plain]
       magic-cake --completion <bash|zsh>
  layer1, layer2      0-326 (0 = none). Web demo default: 270 269
  enemy               enemy slug, e.g. black-antoid; -2, -3... picks its other backgrounds
Options:
  --duration <sec>    length in seconds (default 60)
  --audio <file>      take duration from this audio file (ffprobe)
  --mux               also put that audio into the output video
  --size <WxH>        output size (default 1280x720)
  --fps <n>           frames per second (default 30)
  --frameskip <1-10>  animation speed, like the web demo (default 1)
  --aspect <0|16|48|64>  web demo letterbox setting (default 0 = full)
  --mode <fill|fit|stretch>  fill = crop to cover (default), fit = black bars
  --crf <n>           x264 quality (default 18)
  --crt <none|royale> CRT TV look (scanlines, phosphor mask, bloom, curvature);
                      inspired by RetroArch's crt-royale. Default none
  --crt-mask <aperture|slot|shadow>   phosphor mask (default aperture)
  --crt-curvature <0-1>  screen curvature (default 0.35, 0 = flat)
  --crt-bloom <0-1>   glow around bright areas (default 0.25)
  --crt-scanline <0-1>  scanline strength (default 1)
  --crt-triad <px>    phosphor triad width in output pixels (default 3)
  --crt-threads <n>   worker threads (default: all CPU cores)
  --chain "<spec>@<t> / <spec>@<t> ..."   switch backgrounds at times (hard cut,
                      animation restarts each segment). spec = enemy slug or l1,l2;
                      t = seconds or [h:]mm:ss.cc. First segment must start at 0.
                      Usage: magic-cake out.mp4 --chain "black-antoid@0 / 270,269@12.48"
  --chain-file <file> same, one "<start> <spec>" per line (# comments ok)`

function die (m) { console.error(m); process.exit(1) }
const ENEMIES = JSON.parse(readFileSync(path.join(HERE, 'data/enemies.json'), 'utf8')).enemies
function allSlugs () {
  const r = []
  for (const [s, e] of Object.entries(ENEMIES)) { r.push([s, e.bgs[0]]); if (e.bgs.length > 1) e.bgs.forEach((b, i) => r.push([`${s}-${i + 1}`, b])) }
  return r
}
function lev (a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
function resolveEnemy (q) {
  q = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (ENEMIES[q]) return ENEMIES[q].bgs[0] // exact full name first (handles names ending in digits)
  const m = q.match(/^(.*)-(\d+)$/)
  if (m && ENEMIES[m[1]]) {
    const bgs = ENEMIES[m[1]].bgs; const n = Number(m[2])
    if (n >= 1 && n <= bgs.length) return bgs[n - 1]
    die(`${m[1]} has ${bgs.length} background(s); use ${m[1]}${bgs.length > 1 ? '-1..-' + bgs.length : ''}`)
  }
  const sugg = Object.keys(ENEMIES).map(s => [s, lev(q, s) - (s.includes(q) ? 3 : 0)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0])
  die(`Unknown enemy "${q}". Did you mean: ${sugg.join(', ')}?\nSee magic-cake --list-enemies`)
}
const argv0 = process.argv.slice(2)
if (argv0[0] === '--list-enemies') {
  const plain = argv0.includes('--plain'); const f = argv0.slice(1).find(a => a !== '--plain')
  for (const [s, b] of allSlugs()) if (!f || s.includes(f.toLowerCase())) console.log(plain ? s : `${s.padEnd(32)} ${b[0]} ${b[1]}`)
  process.exit(0)
}
if (argv0[0] === '--completion') {
  const sh = argv0[1]; if (!['bash', 'zsh'].includes(sh)) die('Usage: magic-cake --completion <bash|zsh>')
  const flags = '--chain --chain-file --duration --audio --mux --size --fps --frameskip --aspect --mode --crf --crt --crt-mask --crt-curvature --crt-bloom --crt-scanline --crt-triad --crt-threads --list-enemies --completion --help'
  const body = `_magic_cake() {
  local cur prev; cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    --audio|--chain-file) COMPREPLY=($(compgen -f -- "$cur")); return;;
    --mode) COMPREPLY=($(compgen -W "fill fit stretch" -- "$cur")); return;;
    --crt) COMPREPLY=($(compgen -W "${Object.keys(PRESETS).join(' ')}" -- "$cur")); return;;
    --crt-mask) COMPREPLY=($(compgen -W "${MASKS.join(' ')}" -- "$cur")); return;;
    --crt-curvature|--crt-bloom|--crt-scanline|--crt-triad|--crt-threads) return;;
    --aspect) COMPREPLY=($(compgen -W "0 16 48 64" -- "$cur")); return;;
    --completion) COMPREPLY=($(compgen -W "bash zsh" -- "$cur")); return;;
    --duration|--size|--fps|--frameskip|--crf|--list-enemies) return;;
    --chain) local w="\${cur##*/}"; w="\${w# }"; local pre="\${cur%"$w"}"
      COMPREPLY=($(compgen -P "$pre" -W "${allSlugs().map(x => x[0]).join(' ')}" -- "$w")); compopt -o nospace 2>/dev/null; return;;
  esac
  if [[ "$cur" == -* ]]; then COMPREPLY=($(compgen -W "${flags}" -- "$cur")); return; fi
  local i n=0
  for ((i=1; i<COMP_CWORD; i++)); do
    case "\${COMP_WORDS[i]}" in --mux) ;; --*) ((i++));; *) ((n++));; esac
  done
  if ((n == 0)); then COMPREPLY=($(compgen -W "${allSlugs().map(x => x[0]).join(' ')}" -- "$cur"))
  else COMPREPLY=($(compgen -f -- "$cur")); fi
}
complete -o filenames -F _magic_cake magic-cake`
  console.log(sh === 'zsh' ? `autoload -U +X bashcompinit && bashcompinit\n${body}` : body)
  process.exit(0)
}
const args = argv0
const pos = []; const opt = {}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0) }
  if (a === '--mux') opt.mux = true
  else if (a.startsWith('--')) { if (i + 1 >= args.length) die(`Missing value for ${a}`); opt[a.slice(2)] = args[++i] } else pos.push(a)
}
function parseTime (t) {
  const p = String(t).trim().split(':').map(Number)
  if (!p.length || p.some(x => !Number.isFinite(x))) die(`Bad time "${t}"`)
  return p.reduce((a, x) => a * 60 + x, 0)
}
function parseSpec (sp) {
  sp = sp.trim()
  let m = sp.match(/^(\d+)\s*[, ]\s*(\d+)$/)
  const b = m ? [Number(m[1]), Number(m[2])] : resolveEnemy(sp)
  for (const l of b) if (!Number.isInteger(l) || l < 0 || l > 326) die(`Layers must be integers 0-326 (in "${sp}")`)
  return b
}
let segs
if (opt.chain || opt['chain-file']) {
  const raw = []
  if (opt.chain) for (const part of opt.chain.split('/')) {
    if (!part.trim()) continue
    const i = part.lastIndexOf('@'); if (i < 0) die(`Chain segment "${part.trim()}" needs @<start time>`)
    raw.push([part.slice(i + 1), part.slice(0, i)])
  }
  if (opt['chain-file']) for (const ln of readFileSync(opt['chain-file'], 'utf8').split(/\r?\n/)) {
    const l = ln.replace(/#.*/, '').trim(); if (!l) continue
    const m = l.match(/^(\S+)\s+(.+)$/); if (!m) die(`Bad chain-file line "${l}" (want "<start> <spec>")`)
    raw.push([m[1], m[2]])
  }
  if (pos.length !== 1) die('With --chain/--chain-file give just the output file')
  segs = raw.map(([t, sp]) => ({ t: parseTime(t), b: parseSpec(sp), spec: sp.trim() })).sort((a, b) => a.t - b.t)
  if (!segs.length) die('Empty chain')
  if (segs[0].t !== 0) die('First chain segment must start at 0')
} else {
  if (pos.length === 2) { const b = resolveEnemy(pos[0]); pos.splice(0, 1, String(b[0]), String(b[1])) }
  if (pos.length !== 3) die(USAGE)
  segs = [{ t: 0, b: parseSpec(pos[0] + ',' + pos[1]), spec: pos[0] + ',' + pos[1] }]
  pos.splice(0, 2)
}
const out = pos[0]
const [W, H] = (opt.size || '1280x720').split('x').map(Number)
if (!W || !H) die('Bad --size, use WxH')
const fps = Number(opt.fps || 30)
const frameskip = Number(opt.frameskip || 1)
const aspect = Number(opt.aspect || 0)
if (![0, 16, 48, 64].includes(aspect)) die('--aspect must be 0, 16, 48 or 64')
const mode = opt.mode || 'fill'
if (!['fill', 'fit', 'stretch'].includes(mode)) die('--mode must be fill, fit or stretch')
const crtName = opt.crt || 'none'
if (!(crtName in PRESETS)) die(`--crt must be one of: ${Object.keys(PRESETS).join(', ')}`)
if (opt['crt-mask'] && !MASKS.includes(opt['crt-mask'])) die(`--crt-mask must be one of: ${MASKS.join(', ')}`)
function num01 (k, lo = 0, hi = 1) {
  if (opt[k] === undefined) return undefined
  const v = Number(opt[k]); if (!Number.isFinite(v) || v < lo || v > hi) die(`--${k} must be a number ${lo}-${hi}`)
  return v
}
const crtOpts = { preset: crtName, mask: opt['crt-mask'], curvature: num01('crt-curvature'), bloom: num01('crt-bloom', 0, 2), scanline: num01('crt-scanline'), triad: num01('crt-triad', 2, 12), threads: num01('crt-threads', 1, 64) }
let duration = Number(opt.duration || 60)
if (opt.audio) {
  const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', opt.audio]).toString().trim()
  duration = Number(d)
  if (!duration) die('Could not read audio duration')
}
if (opt.mux && !opt.audio) die('--mux needs --audio')
const totalFrames = Math.ceil(duration * fps)

const rom = new Rom(new Uint8Array(readFileSync(path.join(HERE, 'vendor/truncated_backgrounds.dat'))))
function makeSeg (l1, l2) {
  // same alpha logic as the web demo (index.js + engine.animate)
  let alpha = l2 === 0 ? [1, 1] : [0.5, 0.5]
  if (l1 && !l2) alpha = [1, 0]
  if (!l1 && l2) alpha = [0, 1]
  return { layers: [new BackgroundLayer(l1, rom), new BackgroundLayer(l2, rom)], alpha }
}
for (const sg of segs) { sg.frame = Math.round(sg.t * fps); Object.assign(sg, makeSeg(sg.b[0], sg.b[1])) }
if (segs.length > 1 && segs[segs.length - 1].frame >= totalFrames) die('A chain segment starts after the video ends (check --duration/--audio)')

const crt = await createCrt(crtOpts, SNES_WIDTH, SNES_HEIGHT, W, H, mode)
let vf
if (crt) vf = 'null'
else if (mode === 'fit') vf = `scale=${W}:${H}:flags=neighbor:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
else if (mode === 'stretch') vf = `scale=${W}:${H}:flags=neighbor`
else vf = `scale=${W}:${H}:flags=neighbor:force_original_aspect_ratio=increase,crop=${W}:${H}`
vf += ',setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'

const ff = ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', crt ? `${W}x${H}` : `${SNES_WIDTH}x${SNES_HEIGHT}`, '-r', String(fps), '-i', 'pipe:0']
if (opt.mux) ff.push('-i', opt.audio)
ff.push('-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(opt.crf || 18), '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart')
if (opt.mux) ff.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest')
ff.push(out)
const proc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] })
proc.on('error', e => die(`Could not start ffmpeg: ${e.message}`))
let ffExit = null
const done = new Promise(r => proc.on('close', c => { ffExit = c; r(c) }))

const dst = new Uint8ClampedArray(SNES_WIDTH * SNES_HEIGHT * 4)
const t0 = Date.now()
let tick = 0; let si = 0
for (let f = 0; f < totalFrames; f++) {
  if (ffExit !== null) break
  while (si + 1 < segs.length && f >= segs[si + 1].frame) { si++; tick = 0 }
  const bmp = renderLayers(segs[si].layers, dst, aspect, tick, segs[si].alpha)
  tick += frameskip
  const raw = bmp.buffer ? new Uint8Array(bmp.buffer, bmp.byteOffset, bmp.byteLength) : Uint8Array.from(bmp)
  const buf = crt ? await crt.process(raw) : Buffer.from(raw)
  if (!proc.stdin.write(buf)) await new Promise(r => proc.stdin.once('drain', r))
  if (f % fps === 0) process.stderr.write(`\rframe ${f}/${totalFrames}`)
}
proc.stdin.end()
if (crt) crt.close()
const code = await done
const s = (Date.now() - t0) / 1000
process.stderr.write(`\rframe ${totalFrames}/${totalFrames}\n`)
if (code !== 0) die(`ffmpeg failed (exit ${code})`)
console.log(`Wrote ${out}: ${totalFrames} frames, ${W}x${H}@${fps}, ${segs.map(g => `${g.b[0]}/${g.b[1]}@${g.t}`).join(' | ')}${crt ? `, crt ${crtName}` : ''}, ${s.toFixed(1)}s (${(totalFrames / s).toFixed(0)} fps)`)
