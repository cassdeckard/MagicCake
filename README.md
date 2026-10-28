# MagicCake — EarthBound battle backgrounds → video

Renders an EarthBound battle background (same layer numbers as
https://gjtorikian.online/Earthbound-Battle-Backgrounds-JS/) to an H.264 MP4 you can open
in Aegisub (Video > Open Video) or use under your karaoke subtitles.
Runs headless in Node: frames are rendered in memory and piped to ffmpeg. No npm installs needed.

## Setup (macOS)
    brew install node ffmpeg
    git clone https://github.com/cassdeckard/MagicCake && cd MagicCake && npm link   # installs the `magic-cake` command

## Usage
    magic-cake <layer1> <layer2> <out.mp4> [options]

| option | default | meaning |
|---|---|---|
| --duration SEC | 60 | length |
| --audio FILE | – | use the audio file's length (ffprobe) |
| --mux | off | also put that audio in the video (needs --audio) |
| --size WxH | 1280x720 | output size |
| --fps N | 30 | frame rate |
| --frameskip 1-10 | 1 | animation speed (web demo's Frameskip) |
| --aspect 0/16/48/64 | 0 | web demo's letterbox setting |
| --mode fill/fit/stretch | fill | fill = crop to cover 16:9, fit = black side bars, stretch = distort |
| --crf N | 18 | x264 quality (lower = better/bigger) |

Layers are 0–326 (0 = none). The web demo's default is 270 / 269.
Pixels are scaled with nearest-neighbor, so they stay crisp.

## Examples
    magic-cake 270 269 test.mp4 --duration 5
    magic-cake 50 300 nakamarra-bg.mp4 --audio "nakamarra.flac"
    magic-cake 50 300 preview.mp4 --audio song.flac --mux
    magic-cake 223 0 slow.mp4 --mode fit --fps 60

## Chaining backgrounds (switch at given times)

One continuous video, hard cut at each start time (rounded to the nearest frame at `--fps`). Each segment's animation restarts from 0, like a new battle.

```
magic-cake out.mp4 --chain "black-antoid@0 / 270,269@12.48 / 50,300@0:45.10" --audio song.flac
```

Segments are separated by `/`; each is `<spec>@<start>`, where spec is an enemy slug or `l1,l2` and start is seconds or `[h:]mm:ss.cc`. The first must start at 0; the last runs to `--duration` or the `--audio` length.

Or put them in a file, one `<start> <spec>` per line (`#` starts a comment):

```
# segs.txt
0        black-antoid
12.48    270,269
0:45.10  50 300
```

`magic-cake out.mp4 --chain-file segs.txt --duration 180`

## Aegisub macro: backgrounds per section

`automation/magic-cake.lua` turns your lyric Styles into sections (e.g. Intro / Verse / Chorus) and renders a background video that switches at each section.

**Install:** copy `automation/magic-cake.lua` to `~/Library/Application Support/Aegisub/automation/autoload/`, then restart Aegisub (or Automation > Automation… > Rescan Autoload Dir). magic-cake must be installed (`npm link`) along with node and ffmpeg; the macro adds `/opt/homebrew/bin` and `/usr/local/bin` to PATH, since apps launched from the Dock don't see your shell PATH.

**Use:** Automation > *Magic Cake: Generate section backgrounds*.
- Lyric lines are normal Dialogue lines plus karaoke source Comments (Effect `karaoke`). Templater output (`fx`), `template`/`code` lines and other comments are ignored; duplicates are counted once.
- Lines are sorted by start time, and back-to-back lines with the same Style form one section. A section starts at its first line (the first section starts at 0:00) and lasts until the next section starts. The last one runs to the end of the audio file, or 3 seconds past the last line if there's no audio.
- The dialog asks for a background per Style (enemy slug or `l1,l2`), the output path (default `<script>-bg.mp4` next to the .ass), size (default PlayResX×PlayResY), fps, audio (default: the loaded audio), extra options (e.g. `--mode fit`), and the magic-cake command (use a full path like `/opt/homebrew/bin/magic-cake` if it isn't found).
- Your choices are saved in the script as Comment lines with Effect `magic-cake`, so next time the dialog is pre-filled. **Save only** stores them without rendering.
- The log window shows the section list, the command and magic-cake's output. Automation scripts can't load video, so open the result with **Video > Open Video**.

## Burn subtitles for YouTube (`magic-cake burn`)

```
magic-cake burn nakamarra-karaoke.ass
magic-cake burn song.ass out.mp4 --video bg.mp4 --audio song.mp3 --crf 16 --preset slow
```

Bakes the .ass into the video and adds the audio, making an MP4 ready to upload to YouTube.
- **Video and audio** default to the `Video File:` / `Audio File:` paths that Aegisub saves in the .ass (they're relative to the .ass's folder). If the audio is "from video", the video's own audio is used. Dummy video gives an error, so pass `--video` instead.
- **Output** defaults to `<script>-youtube.mp4` next to the .ass. It's H.264 High, yuv420p, tagged BT.709, AAC 320k at 48 kHz, with `+faststart`. The length matches the shorter of the video and audio, with a warning if they differ by more than 1 s.
- **Fonts:** `~/Library/Fonts` is passed to libass if it exists, so your installed TTFs (Year Is 199X, Fourside, …) are used. Override it with `--fontsdir DIR`.
- Karaoke source Comments are ignored, as in Aegisub. If the file has template lines but no generated `fx` lines, you'll get a warning to run *Apply karaoke template* and save first.
- Shows its progress as a percentage.

**ffmpeg needs libass.** Homebrew's plain `ffmpeg` formula doesn't include it (it has no `ass`/`subtitles` filter). Install the full build:

```
brew install ffmpeg-full
```

It's keg-only, so it installs alongside the regular ffmpeg without replacing it, and magic-cake finds it automatically at `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`. To use some other ffmpeg, pass `--ffmpeg /path/to/ffmpeg` or set `MAGIC_CAKE_FFMPEG`.

### Aegisub macro: Export YouTube video

Copy `automation/magic-cake-export.lua` to the same `autoload/` folder, then run Automation > *Magic Cake: Export YouTube video*. It runs `magic-cake burn` on the **saved** .ass on disk, so save first. The dialog has fields for the output (default `<name>-youtube.mp4`), video and audio (prefilled from the loaded files; leave them blank to use the .ass's own), CRF, extra options (e.g. `--preset medium --ffmpeg /path`), and the magic-cake command. Your choices are saved as `opt:export-*` Comment lines with Effect `magic-cake`. Its output shows up in the log window.

## Tests

`test/chain_test.sh` checks the chain cuts land on the exact frames. `cd test && lua run_tests.lua && lua run_macro_mock.lua` tests the macro's section grouping against `test/sample.ass`, then runs the whole macro against a stubbed Aegisub API. `lua run_export_mock.lua <dir>` runs the export macro on a `<dir>/song.ass` (with its video, audio, and `fonts/`).

## Credits
Rendering code in vendor/ is from gjtorikian/Earthbound-Battle-Backgrounds-JS
(license: vendor/LICENSE.txt), lightly adapted to run as plain Node ES modules
(.js import extensions, built-in padStart). Background data is from that repo's
truncated_backgrounds.dat.

## Backgrounds by enemy name

Instead of two layer numbers, give an enemy slug (name lowercased, punctuation → hyphens):

```
magic-cake black-antoid out.mp4
magic-cake black-antoid-2 out.mp4 --audio song.flac
```

Enemies fought on several different backgrounds get `-1`, `-2`, … in order of first appearance
in the game's enemy-group table; the bare name is the same as `-1`. Exact full names win first,
so names that end in a number still work. Unknown names suggest the closest matches.

```
magic-cake --list-enemies            # every slug with its layer pair
magic-cake --list-enemies antoid     # filter
magic-cake --list-enemies --plain    # slugs only
```

The data lives in `data/enemies.json`, generated by `scripts/gen-enemies.mjs` from the
enemy tables in [MagicCake-archive](https://github.com/cassdeckard/MagicCake-archive)
(`public/data/enemy_groups.yml` and `enemy_configuration_table.yml`, CoilSnake dumps of the
EarthBound ROM). Regenerate with:

```
npm i --no-save js-yaml && node scripts/gen-enemies.mjs ../MagicCake-archive
```

## Shell completion

Completes enemy slugs, option flags and option values, and filenames for the output file.

**zsh** (macOS default) — add to `~/.zshrc`:

```
autoload -U compinit && compinit
eval "$(magic-cake --completion zsh)"
```

**bash** — with Homebrew's `bash-completion@2` installed:

```
magic-cake --completion bash > "$(brew --prefix)/etc/bash_completion.d/magic-cake"
```

or just add `eval "$(magic-cake --completion bash)"` to `~/.bashrc`.

## CRT look (`--crt royale`)

```
magic-cake 270 269 out.mp4 --crt royale --audio song.flac
magic-cake black-antoid-2 out.mp4 --crt royale --crt-mask slot --crt-bloom 0.4
```

Draws the background as if shown on a CRT: one scanline per row of the game's
256×224 picture (so 224 lines over the full frame, fewer when `--mode fill`
crops rows), beams that widen and flatten as they get brighter, a soft
horizontal reconstruction filter, an RGB phosphor mask drawn in output pixels
(with brightness compensation), bloom/halation and glass diffusion, gentle
barrel curvature, rounded corners and a vignette. It works with all three
`--mode`s (with `fit` the curved "tube" sits between the black bars).

| option | values | default |
|---|---|---|
| `--crt` | `none`, `royale` | `none` |
| `--crt-mask` | `aperture` (Trinitron stripes), `slot`, `shadow` | `aperture` |
| `--crt-curvature` | 0–1 (0 = flat) | 0 |
| `--crt-bloom` | 0–2 | 0.25 |
| `--crt-scanline` | 0–1 scanline strength | 1 |
| `--crt-triad` | phosphor triad width in output px, 2–12 | 3 |
| `--crt-threads` | worker threads | all cores |

Runs on the CPU in worker threads; about 30 fps at 1280×720 on an 8-core
machine including encoding (a 4-minute song ≈ 4 minutes). The phosphor mask is
pixel-exact, so keep the output at its final size; heavy scaling or very low
`--crf` values will blur or moiré it. Note that x264's 4:2:0 chroma subsampling
(and YouTube's re-encode) softens the colored mask stripes into a finer texture.

### Credit and licensing

The look is modeled on **crt-royale** by TroggleMonkey (libretro
`slang-shaders/crt/crt-royale`), whose user-settings.h documents the approach
and default parameters (CRT gamma ~2.4–2.5 in / 2.2 out, brightness-dependent
generalized-Gaussian beam widths, aperture grille / slot / shadow masks,
halation and diffusion, border rounding). crt-royale is licensed **GPLv2 or
later**, so none of its shader code was copied or translated here: `lib/crt.js`
is an independent implementation written from scratch, inspired by its
published design and parameter choices, and is MIT-licensed with the rest of
this repo.
