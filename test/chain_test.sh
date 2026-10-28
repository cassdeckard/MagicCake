#!/usr/bin/env bash
# Renders a 3-segment clip and checks that the picture cuts exactly at frames 60 (2.0s) and 120 (4.0s).
set -e; cd "$(dirname "$0")/.."; T=$(mktemp -d)
node magic-cake.js "$T/c.mp4" --chain "black-antoid@0 / 270,269@2 / 50,300@0:04.0" --duration 6 --size 320x180 >/dev/null 2>&1
ffmpeg -v error -i "$T/c.mp4" -f rawvideo -pix_fmt gray - > "$T/c.raw"
python3 - "$T/c.raw" <<'PY'
import sys; d=open(sys.argv[1],'rb').read(); n=320*180; fr=[d[i*n:(i+1)*n] for i in range(len(d)//n)]
diff=lambda f: sum(abs(a-b) for a,b in zip(fr[f-1],fr[f]))/n
assert len(fr)==180, len(fr)
for cut in (60,120):
    near=[diff(f) for f in range(cut-4,cut+5) if f!=cut]
    print(f"frame {cut}: diff {diff(cut):.1f} vs max neighbour {max(near):.1f}")
    assert diff(cut) > 3*max(near)
print("CHAIN TEST PASSED")
PY
