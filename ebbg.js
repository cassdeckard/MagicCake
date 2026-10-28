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
const USAGE = `Usage: node ebbg.js <layer1> <layer2> <out.mp4> [options]
  layer1, layer2      0-326 (0 = none). Web demo default: 270 269
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
const args = process.argv.slice(2)
const pos = []; const opt = {}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0) }
  if (a === '--mux') opt.mux = true
  else if (a.startsWith('--')) { if (i + 1 >= args.length) die(`Missing value for ${a}`); opt[a.slice(2)] = args[++i] } else pos.push(a)
}
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
