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

## Credits
Rendering code in vendor/ is from gjtorikian/Earthbound-Battle-Backgrounds-JS
(license: vendor/LICENSE.txt), lightly adapted to run as plain Node ES modules
(.js import extensions, built-in padStart). Background data is from that repo's
truncated_backgrounds.dat.
