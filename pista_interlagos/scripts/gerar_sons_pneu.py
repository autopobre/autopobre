"""Builds teste/assets/audio/pneus_estalos.mp3 + .json: tyre loops and exhaust pops from free recordings.

One MP3 holds, after a sync click (the game finds it to undo the MP3 encoder's delay, as for the engine bank):
  canta    a tyre singing at its limit, looped (a big sedan cornering hard round the microphone)
  arrasta  a tyre screeching in a slide or spin, looped (a burnout)
  estalos  single exhaust pops for a lift at high revs (a car's anti-lag crackle)
The JSON gives each one's place in samples. The engine's rumble under the squeals is filtered away (the game's
own engine plays).

Sources (Freesound previews in audios_originais/freesound/, all CC0):
  71739 and 71740 by audible-edge (Chrysler LHS tire squeal 04, Nissan Maxima burnout)
  797835 by modusmogulus (Car Antilag)
Usage: geo-venv python gerar_sons_pneu.py [sources_dir]
"""
from pathlib import Path
import json
import subprocess
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gerar_loops_motor import FFMPEG, OUT, ROOT, SR, decode  # noqa: E402

SYNC = 4096
LOOPS = {  # name: (file, start s, loop length s, high-pass Hz)
    'canta': ('71739.ogg', 11.0, 2.0, 450),
    'arrasta': ('71740.ogg', 3.6, 2.2, 600),
}
POPS = ('797835.ogg', [1.10, 1.39, 1.58, 1.78, 1.98, 2.19, 5.28, 6.74, 6.91, 7.11], .2)
CROSS = .25  # s of loop seam


def high_pass(x, hz):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / np.sqrt(1 + (hz / np.maximum(f, 1)) ** 8)  # 4th-order-like slope
    return np.fft.irfft(spec, len(x)).astype(np.float32)


def loop(x, start, length):
    """A seamless loop: the stretch's last CROSS seconds fade into its first (equal power)."""
    a, n, c = int(start * SR), int(length * SR), int(CROSS * SR)
    seg = x[a:a + n + c].copy()
    t = np.linspace(0, np.pi / 2, c)
    body = seg[:n].copy()
    body[:c] = seg[:c] * np.sin(t) + seg[n:n + c] * np.cos(t)
    return body


def main(src):
    parts = [np.zeros(SYNC, np.float32), np.array([.9], np.float32), np.zeros(SYNC, np.float32)]
    pos = 2 * SYNC + 1
    data = {'title': 'Tyres and exhaust pops (audible-edge 71739, 71740; modusmogulus 797835; CC0)', 'sampleRate': SR,
            'click': SYNC, 'loops': {}, 'pops': []}

    def add(chunk, gap=.08):
        nonlocal pos
        start = pos
        parts.append(chunk.astype(np.float32))
        parts.append(np.zeros(int(gap * SR), np.float32))
        pos += len(chunk) + int(gap * SR)
        return start

    for name, (file, start, length, hp) in LOOPS.items():
        x = high_pass(decode(src / file), hp)
        body = loop(x, start, length)
        body *= 10 ** (-14 / 20) / np.sqrt(np.mean(body ** 2))
        # A short guard after the loop end (its own beginning again) keeps the resampler's look-ahead seamless.
        s = add(np.concatenate([body, body[:int(.05 * SR)]]))
        data['loops'][name] = [s, s + len(body)]
    file, starts, length = POPS
    x = high_pass(decode(src / file), 60)
    for t in starts:
        a = int((t - .01) * SR)
        pop = x[a:a + int(length * SR)].copy()
        pop *= np.minimum(1, np.linspace(3, 0, len(pop)) ** 1.5)  # natural tail, faded out
        pop *= .7 / np.max(np.abs(pop))
        s = add(pop, .04)
        data['pops'].append([s, s + len(pop)])
    audio = np.clip(np.concatenate(parts), -1, 1)
    mp3 = OUT / 'pneus_estalos.mp3'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '112k', '-map_metadata', '-1', str(mp3)],
                   input=audio.tobytes(), check=True)
    (OUT / 'pneus_estalos.json').write_text(json.dumps(data, separators=(',', ':')))
    print(mp3.name, mp3.stat().st_size // 1024, 'KB', round(len(audio) / SR, 2), 's;', data['loops'], len(data['pops']), 'pops')


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'audios_originais/freesound')
