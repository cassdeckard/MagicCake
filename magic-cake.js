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

const HERE = path.dirname(fileURLToPath(import.meta.url))
const USAGE = `Usage: magic-cake <layer1> <layer2> <out.mp4> [options]
       magic-cake <enemy>[-N] <out.mp4> [options]
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
  --crf <n>           x264 quality (default 18)`

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
  const flags = '--duration --audio --mux --size --fps --frameskip --aspect --mode --crf --list-enemies --completion --help'
  const body = `_magic_cake() {
  local cur prev; cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    --audio) COMPREPLY=($(compgen -f -- "$cur")); return;;
    --mode) COMPREPLY=($(compgen -W "fill fit stretch" -- "$cur")); return;;
    --aspect) COMPREPLY=($(compgen -W "0 16 48 64" -- "$cur")); return;;
    --completion) COMPREPLY=($(compgen -W "bash zsh" -- "$cur")); return;;
    --duration|--size|--fps|--frameskip|--crf|--list-enemies) return;;
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
if (pos.length === 2) { const b = resolveEnemy(pos[0]); pos.splice(0, 1, String(b[0]), String(b[1])) }
if (pos.length !== 3) die(USAGE)
const layer1 = Number(pos[0]); const layer2 = Number(pos[1]); const out = pos[2]
for (const l of [layer1, layer2]) if (!Number.isInteger(l) || l < 0 || l > 326) die('Layers must be integers 0-326')
const [W, H] = (opt.size || '1280x720').split('x').map(Number)
if (!W || !H) die('Bad --size, use WxH')
const fps = Number(opt.fps || 30)
const frameskip = Number(opt.frameskip || 1)
const aspect = Number(opt.aspect || 0)
if (![0, 16, 48, 64].includes(aspect)) die('--aspect must be 0, 16, 48 or 64')
const mode = opt.mode || 'fill'
let duration = Number(opt.duration || 60)
if (opt.audio) {
  const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', opt.audio]).toString().trim()
  duration = Number(d)
  if (!duration) die('Could not read audio duration')
}
if (opt.mux && !opt.audio) die('--mux needs --audio')
const totalFrames = Math.ceil(duration * fps)

const rom = new Rom(new Uint8Array(readFileSync(path.join(HERE, 'vendor/truncated_backgrounds.dat'))))
const layers = [new BackgroundLayer(layer1, rom), new BackgroundLayer(layer2, rom)]
// same alpha logic as the web demo (index.js + engine.animate)
let alpha = layer2 === 0 ? [1, 1] : [0.5, 0.5]
if (layer1 && !layer2) alpha = [1, 0]
if (!layer1 && layer2) alpha = [0, 1]

let vf
if (mode === 'fit') vf = `scale=${W}:${H}:flags=neighbor:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`
else if (mode === 'stretch') vf = `scale=${W}:${H}:flags=neighbor`
else vf = `scale=${W}:${H}:flags=neighbor:force_original_aspect_ratio=increase,crop=${W}:${H}`
vf += ',setsar=1,format=yuv420p'

const ff = ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${SNES_WIDTH}x${SNES_HEIGHT}`, '-r', String(fps), '-i', 'pipe:0']
if (opt.mux) ff.push('-i', opt.audio)
ff.push('-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(opt.crf || 18), '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
if (opt.mux) ff.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest')
ff.push(out)
const proc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] })
proc.on('error', e => die(`Could not start ffmpeg: ${e.message}`))
let ffExit = null
const done = new Promise(r => proc.on('close', c => { ffExit = c; r(c) }))

const dst = new Uint8ClampedArray(SNES_WIDTH * SNES_HEIGHT * 4)
const t0 = Date.now()
let tick = 0
for (let f = 0; f < totalFrames; f++) {
  if (ffExit !== null) break
  const bmp = renderLayers(layers, dst, aspect, tick, alpha)
  tick += frameskip
  const buf = Buffer.from(bmp.buffer ? new Uint8Array(bmp.buffer, bmp.byteOffset, bmp.byteLength) : Uint8Array.from(bmp))
  if (!proc.stdin.write(Buffer.from(buf))) await new Promise(r => proc.stdin.once('drain', r))
  if (f % fps === 0) process.stderr.write(`\rframe ${f}/${totalFrames}`)
}
proc.stdin.end()
const code = await done
const s = (Date.now() - t0) / 1000
process.stderr.write(`\rframe ${totalFrames}/${totalFrames}\n`)
if (code !== 0) die(`ffmpeg failed (exit ${code})`)
console.log(`Wrote ${out}: ${totalFrames} frames, ${W}x${H}@${fps}, layers ${layer1}/${layer2}, ${s.toFixed(1)}s (${(totalFrames / s).toFixed(0)} fps)`)
