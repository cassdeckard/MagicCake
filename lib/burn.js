// magic-cake burn: bake an .ass file's subtitles into a YouTube-ready MP4.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BURN_USAGE = `Usage: magic-cake burn <script.ass> [out.mp4] [options]
  Burns the subtitles into the video and muxes the audio for YouTube.
  Video/audio default to the "Video File:" / "Audio File:" entries Aegisub saves
  in the .ass (relative to the .ass folder). Default out: <script>-youtube.mp4
Options:
  --video <file>     background video (overrides the .ass)
  --audio <file>     audio (overrides the .ass; default: the video's own audio
                     if Aegisub says "audio from video")
  --crf <n>          x264 quality (default 18; lower = better/bigger)
  --preset <name>    x264 preset (default slow)
  --fontsdir <dir>   extra fonts folder (default ~/Library/Fonts if it exists)
  --ffmpeg <path>    ffmpeg with libass (or env MAGIC_CAKE_FFMPEG)`

function die (m) { console.error(m); process.exit(1) }

// Escape a path for use inside a single-quoted filtergraph option value
// (ass=filename='...'). Two levels: filter option, then filtergraph.
export function filterPath (p) {
  const lvl1 = p.replace(/[\\':]/g, '\\$&')
  return lvl1.replace(/[\\'[\],;]/g, '\\$&')
}

export function parseAss (text) {
  const garbage = {}; const info = {}; let sec = ''
  let fx = 0; let templates = 0; let dialogue = 0
  for (const ln of text.split(/\r?\n/)) {
    const s = ln.match(/^\[(.*)\]\s*$/); if (s) { sec = s[1]; continue }
    const kv = ln.match(/^([^:;]+):\s?(.*)$/); if (!kv) continue
    const [, k, v] = kv
    if (sec === 'Aegisub Project Garbage') garbage[k.trim()] = v.trim()
    else if (sec === 'Script Info') info[k.trim()] = v.trim()
    else if (sec === 'Events' && (k === 'Dialogue' || k === 'Comment')) {
      const effect = (v.split(',')[8] || '').trim().toLowerCase()
      if (k === 'Dialogue') { dialogue++; if (effect === 'fx') fx++ }
      if (/^(template|code)\b/.test(effect)) templates++
    }
  }
  return { garbage, info, fx, templates, dialogue }
}

function findFfmpeg (explicit) {
  const cands = [explicit, process.env.MAGIC_CAKE_FFMPEG,
    '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg', '/usr/local/opt/ffmpeg-full/bin/ffmpeg', 'ffmpeg'].filter(Boolean)
  const tried = []
  for (const c of cands) {
    const r = spawnSync(c, ['-hide_banner', '-filters'], { encoding: 'utf8' })
    if (r.error) { if (c === explicit || c === process.env.MAGIC_CAKE_FFMPEG) tried.push(`${c}: not found`); continue }
    if (/^\s*\S+\s+ass\s/m.test(r.stdout)) return c
    tried.push(`${c}: no libass ('ass' filter missing)`)
    if (c === explicit) break
  }
  die(`No ffmpeg with subtitle support (libass) found.\n  ${tried.join('\n  ')}\n
Fix on macOS (Homebrew): install the full build. It sits alongside your regular
ffmpeg and magic-cake finds it automatically:
    brew install ffmpeg-full
Or point at any libass-enabled ffmpeg with --ffmpeg /path/to/ffmpeg or
MAGIC_CAKE_FFMPEG=/path/to/ffmpeg.`)
}

function probe (ff, file) {
  const fp = path.join(path.dirname(ff), 'ffprobe')
  const bin = ff.includes('/') && existsSync(fp) ? fp : 'ffprobe'
  const r = spawnSync(bin, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { encoding: 'utf8' })
  if (r.status !== 0) die(`Could not read ${file}:\n${r.stderr}`)
  const j = JSON.parse(r.stdout)
  return { dur: Number(j.format?.duration) || 0, audio: (j.streams || []).some(s => s.codec_type === 'audio'), video: (j.streams || []).some(s => s.codec_type === 'video') }
}

export async function burn (args) {
  const pos = []; const opt = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-h' || a === '--help') { console.log(BURN_USAGE); process.exit(0) }
    if (a.startsWith('--')) { if (i + 1 >= args.length) die(`Missing value for ${a}`); opt[a.slice(2)] = args[++i] } else pos.push(a)
  }
  if (pos.length < 1 || pos.length > 2) die(BURN_USAGE)
  const assPath = path.resolve(pos[0])
  if (!existsSync(assPath)) die(`No such file: ${assPath}`)
  const dir = path.dirname(assPath)
  const ass = parseAss(readFileSync(assPath, 'utf8'))
  const rel = p => path.resolve(dir, p.replace(/^~(?=\/)/, os.homedir()))

  let video = opt.video ? path.resolve(opt.video) : ass.garbage['Video File']
  if (!video) die('No video: the .ass has no "Video File:" entry (open a video in Aegisub and save), so pass --video <file>')
  if (!opt.video) {
    if (video.startsWith('?dummy')) die('The .ass uses Aegisub dummy video, which can\'t be burned. Render a background (magic-cake) and open it in Aegisub, or pass --video <file>')
    video = rel(video)
  }
  if (!existsSync(video)) die(`Video not found: ${video}`)
  let audio = opt.audio ? path.resolve(opt.audio) : ass.garbage['Audio File']
  if (audio && !opt.audio) audio = audio.startsWith('?video') ? null : rel(audio)
  if (audio && audio.startsWith('?')) die(`Unsupported audio entry "${audio}"; pass --audio <file>`)
  if (audio && !existsSync(audio)) die(`Audio not found: ${audio}`)
  const out = pos[1] ? path.resolve(pos[1]) : assPath.replace(/\.[^./]*$/, '') + '-youtube.mp4'
  if (out === video || out === audio) die('Output would overwrite an input')

  if (ass.templates && !ass.fx) console.error('Warning: the script has karaoke template lines but no generated "fx" lines.\n  Run Automation > Apply karaoke template in Aegisub and save first, or the karaoke effects won\'t show.')
  const ff = findFfmpeg(opt.ffmpeg)
  const vi = probe(ff, video)
  if (!vi.video) die(`${video} has no video stream`)
  const ai = audio ? probe(ff, audio) : null
  if (!audio && !vi.audio) console.error('Warning: no audio file and the video has no audio; output will be silent.')
  const dur = ai ? Math.min(ai.dur, vi.dur) : vi.dur
  if (ai && Math.abs(ai.dur - vi.dur) > 1) console.error(`Warning: audio is ${ai.dur.toFixed(2)}s but video is ${vi.dur.toFixed(2)}s; output is cut to the shorter (${dur.toFixed(2)}s).`)

  let fontsdir = opt.fontsdir
  if (!fontsdir) { const d = path.join(os.homedir(), 'Library/Fonts'); if (existsSync(d)) fontsdir = d }
  if (fontsdir) fontsdir = path.resolve(fontsdir)
  if (fontsdir && !existsSync(fontsdir)) die(`--fontsdir not found: ${fontsdir}`)
  const crf = String(Number(opt.crf ?? 18)); const preset = opt.preset || 'slow'
  const vf = `ass=filename=${filterPath(assPath)}${fontsdir ? `:fontsdir=${filterPath(fontsdir)}` : ''},` +
    'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,' +
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'
  const a = ['-hide_banner', '-loglevel', 'error', '-stats_period', '0.5', '-progress', 'pipe:1', '-nostats', '-y',
    '-i', video, ...(audio ? ['-i', audio] : []),
    '-map', '0:v:0', '-map', audio ? '1:a:0' : '0:a:0?',
    '-vf', vf, '-c:v', 'libx264', '-profile:v', 'high', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]
  console.error(`Video:  ${video}\nAudio:  ${audio || '(from video)'}\nFonts:  ${fontsdir || '(system)'}\nffmpeg: ${ff}\nOutput: ${out}`)
  const t0 = Date.now()
  const proc = spawn(ff, a, { stdio: ['ignore', 'pipe', 'inherit'] })
  let buf = ''
  proc.stdout.on('data', d => {
    buf += d; let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const ln = buf.slice(0, i); buf = buf.slice(i + 1)
      const m = ln.match(/^out_time_us=(\d+)/)
      if (m && dur) process.stderr.write(`\rburning ${Math.min(100, Number(m[1]) / 1e4 / dur).toFixed(1)}%   `)
    }
  })
  const code = await new Promise(r => proc.on('close', r))
  if (code === 0) process.stderr.write('\rburning 100.0%   ')
  process.stderr.write('\n')
  if (code !== 0) die(`ffmpeg failed (exit ${code})`)
  console.log(`Wrote ${out} (${dur.toFixed(1)}s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
