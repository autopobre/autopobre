"""Builds teste/assets/audio/buzinas.mp3 + .json: the Opala's and the Fusca's horns from free recordings.

Each horn is cut into three stretches the game plays as one (car-horn.js): the press (from silence to the full note),
a short loop of the steady note that lasts as long as the key is held, and the letting go (the note dying away). The
loop's end runs into its start and into the letting go without a seam: its last SEAM seconds fade into what comes
before its start, and the letting go's first SEAM seconds fade from the loop's start into the recording's own end.
One MP3 holds both, after a sync click (the game finds it to undo the MP3 encoder's delay, as for the tyres).

Sources (Freesound previews in audios_originais/freesound/):
  opala  217138 by lonemonk, a 1964 Chrysler's pair of horns, low and high (CC BY 4.0). The Opala's own were a pair
         by Arno, one low and one high, the same the Brazilian Dodges had (opaleiros' forums).
  fusca  734253 by yfjesse, a 1974 Volkswagen Bug's horn (CC0).
Usage: geo-venv python gerar_buzinas.py [sources_dir]
"""
from pathlib import Path
import json
import subprocess
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gerar_loops_motor import FFMPEG, OUT, ROOT, SR, decode  # noqa: E402

SYNC = 4096
SEAM = .025  # s of cross-fade at the loop's seams
HORNS = {  # name: (file, steady note from-to s in the recording, loop about s, letting go s, loudness dB(A) of the note)
    'opala': ('217138.ogg', (.085, .225), .09, .55, -14.5),    # the pair, a little louder than the Fusca's single horn
    'fusca': ('734253.ogg', (.115, .300), .10, .32, -16),
}


def loudness(x):
    """dB(A): the level as the ear weighs it (the Fusca's note is high and thin, the Opala's low and full)."""
    f2 = np.fft.rfftfreq(len(x), 1 / SR) ** 2
    a = 12194 ** 2 * f2 ** 2 / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2) + 1e-9)
    y = np.fft.irfft(np.fft.rfft(x) * a * 10 ** (2 / 20), len(x))
    return 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12)


def onset(x):
    """Where the horn starts: the first 5 ms within 30 dB of the loudest, less 5 ms."""
    hop = int(.005 * SR)
    rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, 'valid'))[::hop]
    first = int(np.argmax(rms > rms.max() * 10 ** (-30 / 20)))
    return max(0, (first - 1) * hop)


def best_loop(x, a, b, length):
    """The loop in the steady note [a, b) (samples) whose end best runs into its start: start s, length n."""
    seam, best = int(SEAM * SR), (-2, a, int(length * SR))
    for n in range(int(length * .8 * SR), int(length * 1.25 * SR)):
        for s in range(a + seam, b - n - seam, 8):
            u, v = x[s - seam:s], x[s + n - seam:s + n]  # what runs into the start, and the loop's own end
            c = float(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-9))
            if c > best[0]:
                best = (c, s, n)
    return best


def horn(x, steady, length, release):
    a = onset(x)
    lo, hi = int(steady[0] * SR), int(steady[1] * SR)
    corr, s, n = best_loop(x, lo, hi, length)
    seam = int(SEAM * SR)
    w = np.linspace(0, 1, seam, dtype=np.float32)
    # The loop: its last seconds become what comes before its start, so its end runs into its start.
    loop = x[s:s + n].copy()
    loop[-seam:] = x[s + n - seam:s + n] * (1 - w) + x[s - seam:s] * w
    # The letting go: from the loop's start into the recording's end of the steady note and its dying away.
    e = hi - seam
    tail = x[e:e + int(release * SR)].copy()
    tail[:seam] = x[s:s + seam] * (1 - w) + tail[:seam] * w
    fade = np.ones(len(tail), np.float32)
    k = int(len(tail) * .45)
    fade[-k:] = np.linspace(1, 0, k) ** 2
    tail *= fade
    press = x[a:s]
    return press, loop, tail, corr


def main(src):
    parts = [np.zeros(SYNC, np.float32), np.array([.9], np.float32), np.zeros(SYNC, np.float32)]
    pos = 2 * SYNC + 1
    data = {'title': 'Horns: Opala (lonemonk 217138, CC BY 4.0), Fusca (yfjesse 734253, CC0)', 'sampleRate': SR,
            'click': SYNC, 'horns': {}}
    for name, (file, steady, length, release, loud) in HORNS.items():
        press, loop, tail, corr = horn(decode(src / file), steady, length, release)
        gain = 10 ** ((loud - loudness(np.tile(loop, 8))) / 20)
        whole = np.concatenate([press, loop, tail]) * gain
        peak = np.max(np.abs(whole))
        if peak > .97:
            whole *= .97 / peak
        start = pos
        parts.append(whole.astype(np.float32))
        parts.append(np.zeros(int(.1 * SR), np.float32))
        pos += len(whole) + int(.1 * SR)
        data['horns'][name] = {'start': start, 'loop': [start + len(press), start + len(press) + len(loop)],
                               'end': start + len(whole)}
        print(name, 'press', round(len(press) / SR, 3), 's, loop', round(len(loop) / SR, 3), 's (seam match',
              round(corr, 3), '), letting go', round(len(tail) / SR, 3), 's, peak', round(float(np.max(np.abs(whole))), 2))
    audio = np.clip(np.concatenate(parts), -1, 1)
    mp3 = OUT / 'buzinas.mp3'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '112k', '-map_metadata', '-1', str(mp3)],
                   input=audio.tobytes(), check=True)
    (OUT / 'buzinas.json').write_text(json.dumps(data, separators=(',', ':')))
    print(mp3.name, mp3.stat().st_size // 1024, 'KB', round(len(audio) / SR, 2), 's;', data['horns'])


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'audios_originais/freesound')
