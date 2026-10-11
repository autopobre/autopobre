"""Builds engine loop banks (teste/assets/audio/loops_*.mp3 + .json) and idle loops (lenta_*.mp3 + .json).

The engine is played as most racing games do (engine-loops.js): a set of seamless loops, each a stretch of a
real recording at one rpm, throttle open ('on') or shut ('off'); the game speeds each loop up or down to the
wanted rpm and cross-fades between the two nearest. Nothing is cut into cycles: every loop sounds as it was
recorded. (Cutting recordings into firing cycles and re-assembling them, gerar_som_motor.py, came out sounding
like a glitch to the team.)

For each target rpm this script looks for the steadiest ~2 s of recording around that rpm in the right state
(revs rising for 'on', falling for 'off', or a held rev for both), evens out the little rise or fall left in
it (a time-varying resampling locked to the firing waveform, so the loop holds one pitch), makes its length a
whole number of engine cycles and cross-fades its end into its start. Idle loops are stretches of real idles.

Sources (Freesound previews in audios_originais/freesound/, licencas.txt there):
  loops_m3: 415275, 415276 by ikbenraar (CC BY 4.0): a BMW M3 (inline six) driven hard on an airstrip.
  loops_fusca: 674591 by jcharly97 (CC0): a VW T2 (Kombi, air-cooled flat four) driven, inside; 332695 by nhaudio
    (CC BY 4.0): a VW Type 2 revved and held high, standing.
  lenta_opala: 365175 by marfisa (CC0), a 1978 Opala six idling (inside); lenta_fusca: 365174 by marfisa (CC0),
  a 1977 Fusca idling.
The firing frequency is tracked (whitened spectrum, weighted first harmonics, Viterbi), put on the firing line
itself (fix_octaves) and checked again on each finished loop (line_check).
Usage: geo-venv python gerar_loops_motor.py [sources_dir] [name ...]   (numpy; ffmpeg: see find_ffmpeg)
"""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'pista_interlagos/teste/assets/audio'


def find_ffmpeg():
    """FFMPEG from the environment, else the portable one in an apps/ folder above the repository, else PATH."""
    if os.environ.get('FFMPEG'):
        return Path(os.environ['FFMPEG'])
    for parent in Path(__file__).resolve().parents:
        found = sorted(parent.glob('apps/ffmpeg-*/bin/ffmpeg.exe'))
        if found:
            return found[-1]
    return Path(shutil.which('ffmpeg') or 'ffmpeg')


FFMPEG = find_ffmpeg()
SR = 44100

SYNC = 4096
STEP = 1.12      # rpm ratio between neighbouring loops
WINDOW = 2.0     # s of recording wanted per loop (1.3 s accepted when nothing longer fits)
SPAN = .13       # most the revs may move inside a loop's stretch (log ratio), evened out afterwards
SEAM = .09       # s of cross-fade where a loop's end runs into its start
CONFIDENT = 2.0
SLOPE = .03      # 1/s of log rpm: rising faster is throttle open, falling faster throttle shut

LOOPS = {
    'loops_m3': {
        'title': 'BMW M3 inline six on an airstrip (ikbenraar, Freesound 415275 + 415276, CC BY 4.0)',
        'sources': [
            ('415276.ogg', [(0.5, 15.0), (15.0, 30.0), (48.0, 64.0), (66.0, 82.5), (82.5, 90.0)], None),
            ('415275.ogg', [(1.0, 20.0), (95.0, 160.0), (186.0, 210.0), (228.0, 255.0)], None),
        ],
        'fmin': 40, 'fmax': 400, 'order': 3, 'rpm': (900, 7400),
    },
    'loops_fusca': {
        'title': 'VW air-cooled flat four: T2 driven, inside (jcharly97 674591, CC0); Type 2 revved standing (nhaudio 332695, CC BY 4.0)',
        'sources': [
            ('674591.ogg', [(1.0, 46.5), (61.0, 168.0)], None),
            ('332695.ogg', [(15.2, 26.6), (28.6, 34.6)], 'hold'),
        ],
        'fmin': 30, 'fmax': 260, 'order': 2, 'rpm': (900, 7400),
    },
}
IDLES = {  # name: (file, start s, length s, rpm, firings per crank turn)
    'lenta_opala': ('365175.ogg', 42.0, 18.0, 790, 3),
    'lenta_fusca': ('365174.ogg', 10.0, 20.0, 840, 2),
}


def decode(path):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def running_median(a, size):
    """Median over the last axis in a window of `size` bins (numpy only)."""
    pad = size // 2
    p = np.pad(a, [(0, 0)] * (a.ndim - 1) + [(pad, pad)], mode='edge')
    win = np.lib.stride_tricks.sliding_window_view(p, size, axis=-1)
    return np.median(win, axis=-1)


def track(x, fmin, fmax):
    """Firing frequency every 10 ms: whitened spectrum, weighted sum of the first harmonics, Viterbi path."""
    hop, n, nfft = SR // 100, 2048, 16384
    frames = np.arange(0, len(x) - n, hop)
    win = np.hanning(n)
    df = SR / nfft
    top = int(fmax * 4.2 / df) + 4
    lg = np.empty((len(frames), top), np.float32)
    for j, i in enumerate(frames):
        lg[j] = np.log(np.abs(np.fft.rfft(x[i:i + n] * win, nfft))[:top] + 1e-7)
    wh = np.clip(lg - running_median(lg, int(60 / df) | 1), 0, None)
    cands = np.exp(np.linspace(np.log(fmin), np.log(fmax), 360))
    sal = np.zeros((len(frames), len(cands)), np.float32)
    # The firing line is the strongest; its own harmonics weigh less. Half-orders (a six's 1.5th) would win a
    # plain harmonic sum and halve the frequency.
    for k, w in zip(range(1, 5), (1, .5, .3, .2)):
        b = np.round(cands * k / df).astype(int)
        sal += w * np.maximum.reduce([wh[:, np.clip(b + d, 0, top - 1)] for d in (-1, 0, 1)])
    lc = np.log(cands)
    jump = np.abs(lc[:, None] - lc[None, :])
    trans = np.where(jump <= .07, -jump * 12, -1e9).astype(np.float32)
    dp = sal[0].copy()
    back = np.zeros(sal.shape, np.int32)
    for t in range(1, len(frames)):
        tot = dp[None, :] + trans
        back[t] = np.argmax(tot, 1)
        dp = tot[np.arange(len(cands)), back[t]] + sal[t]
    path = np.zeros(len(frames), int)
    path[-1] = int(np.argmax(dp))
    for t in range(len(frames) - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    f = cands[path]
    conf = sal[np.arange(len(frames)), path] / (np.median(sal, 1) + 1e-6)
    times = (frames + n / 2) / SR
    return times, f, conf


def smooth(a, size):
    k = np.hanning(size + 2)[1:-1]
    k /= k.sum()
    return np.convolve(np.pad(a, size // 2, mode='edge'), k, mode='valid')[:len(a)]


def upsample4(seg):
    """4x band-limited upsampling (FFT zero-padding), so linear reading in between is clean."""
    n = len(seg)
    spec = np.fft.rfft(seg)
    big = np.zeros(4 * n // 2 + 1, complex)
    big[:len(spec)] = spec
    return np.fft.irfft(big, 4 * n) * 4


def flatten(x, times, f, t0, t1, hz_out):
    """The stretch [t0, t1] read at a time-varying rate so its firing frequency holds at hz_out."""
    i0, i1 = int(t0 * SR), int(t1 * SR)
    n = np.arange(i0, i1)
    fs = np.interp(n / SR, times, f)
    phase = np.cumsum(fs) / SR
    seg = x[i0:i1].astype(np.float64)
    # Lock the integrated phase to the recording's own firing waveform (slowly), as for the firing marks.
    period = int(SR / np.median(fs))
    z = seg * np.exp(-2j * np.pi * phase)
    k = np.hanning(6 * period + 1)
    theta = smooth(np.unwrap(np.angle(np.convolve(z, k / k.sum(), mode='same'))), int(.12 * SR))
    locked = np.maximum.accumulate(phase + theta / (2 * np.pi))
    count = int((locked[-1] - locked[0]) * SR / hz_out)
    pos = np.interp(locked[0] + np.arange(count) * hz_out / SR, locked, np.arange(len(seg)))
    up = upsample4(seg)
    return np.interp(pos * 4, np.arange(len(up)), up).astype(np.float32)


def seamless(y, hz, cycle):
    """A whole number of engine cycles, its end cross-faded (equal power) into its start."""
    s = int(SEAM * SR)
    per = cycle * SR / hz
    k = max(1, int((len(y) - s) / per))
    length = int(round(k * per))
    if length + s > len(y):
        return None
    t = np.linspace(0, np.pi / 2, s)
    body = y[:length].copy()
    body[:s] = y[:s] * np.sin(t) + y[length:length + s] * np.cos(t)
    return body


def tuned(body, hz):
    """The loop's actual firing frequency near hz: harmonic sum over a finely zero-padded spectrum, so two
    neighbouring loops cross-fade at the same pitch (a few percent off and they beat)."""
    n = 1 << 20
    spec = np.log(np.abs(np.fft.rfft(body * np.hanning(len(body)), n)) + 1e-9)
    df = SR / n
    cands = hz * np.linspace(.94, 1.06, 1201)
    score = sum(w * np.interp(cands * k / df, np.arange(len(spec)), spec) for k, w in zip(range(1, 7), (1, .6, .45, .35, .3, .25)))
    return float(cands[int(np.argmax(score))])


def fix_octaves(x, times, f, top):
    """Put the tracked line on the firing frequency itself. The tracker can settle on half of it (a six's 1.5th
    order) or twice it, and slide between them: the M3's long pull came out at half its revs up to 77 s and
    right after, so loops labelled 1100-3500 rpm sounded at twice that (their strongest line sat at twice the
    label) next to correctly labelled ones. Here, every 10 ms, the strongest of the lines at half, once and twice
    the tracked frequency is taken as the firing (ties favour once, +3 dB), decided over 0.6 s stretches."""
    n = 4096
    win = np.hanning(n)
    df = SR / n
    pick = np.zeros(len(times))
    for j, t in enumerate(times):
        i = int(t * SR) - n // 2
        if i < 0 or i + n > len(x):
            continue
        spec = np.abs(np.fft.rfft(x[i:i + n] * win))
        levels = []
        for m, bias in ((.5, 0), (1, 3), (2, 0)):
            k = f[j] * m / df
            w = max(1, int(k * .015))
            levels.append(20 * np.log10(spec[max(0, int(k) - w):int(k) + w + 1].max() + 1e-9) + bias)
        pick[j] = (-1, 0, 1)[int(np.argmax(levels))]
    size = int(.6 / float(np.median(np.diff(times)))) | 1
    pad = np.pad(pick, size // 2, mode='edge')
    octave = np.median(np.lib.stride_tricks.sliding_window_view(pad, size), axis=-1)
    f = f * 2.0 ** np.round(octave)
    f[f > top] /= 2
    return f


def find_windows(cfg, src_dir):
    """Each source decoded and tracked: (file, audio, times, firing Hz, confidence, rpm slope, usable, kind)."""
    tracks = []
    for file, ranges, kind in cfg['sources']:
        x = decode(src_dir / file)
        x = x / max(1e-6, np.percentile(np.abs(x), 99.9))
        times, f, conf = track(x, cfg['fmin'], cfg['fmax'])
        f = smooth(f, 7)
        if kind != 'hold':
            f = smooth(fix_octaves(x, times, f, cfg['rpm'][1] * cfg['order'] / 60), 7)
        slope = smooth(np.gradient(np.log(f), times), 15)
        inside = np.zeros(len(times), bool)
        for a, b in ranges:
            inside |= (times >= a) & (times <= b)
        tracks.append((file, x, times, f, conf, slope, inside, kind))
    return tracks


def candidates(tracks, layer, hz, previous):
    """Stretches of recording around hz in the layer's state, best first: longest window that fits (2, 1.3,
    then 0.9 s, allowing more movement of the revs), steadiest, surest, near the previous loop's pull."""
    for window, span_max in ((WINDOW, SPAN), (1.3, SPAN), (.9, .2)):
        found = []
        for ti, (file, x, times, f, conf, slope, inside, kind) in enumerate(tracks):
            near = np.flatnonzero(inside & (np.abs(np.log(f / hz)) < .015))
            for j in near[::5]:
                sel = (times >= times[j] - window / 2) & (times <= times[j] + window / 2)
                if times[j] - window / 2 < times[0] or not inside[sel].all():
                    continue
                span = np.abs(np.log(f[sel] / hz)).max()
                sure = (conf[sel] > CONFIDENT).mean()
                rise = slope[sel].mean()
                if span > span_max or sure < .85:
                    continue
                if not (kind == 'hold' or (rise > SLOPE if layer == 'on' else rise < -SLOPE)):
                    continue
                score = span + .3 * (1 - sure) + (.05 if kind == 'hold' else 0)
                # Neighbouring loops from the same pull keep the sound's character as the revs climb.
                if previous:
                    score += .06 if ti != previous[0] else .06 * min(1, abs(times[j] - previous[1]) / 15)
                found.append((score, ti, times[j] - window / 2, times[j] + window / 2, span, sure))
        found.sort()
        # Overlapping stretches of the same moment are one candidate.
        kept = []
        for c in found:
            if all(c[1] != k[1] or abs(c[2] - k[2]) > .5 for k in kept):
                kept.append(c)
        yield from kept[:12]


def line_check(body, hz):
    """True when the loop's strongest line among fractions of hz is hz itself (or within 4 dB of it): a loop
    whose strongest line sits elsewhere was tracked on another order and would sound at the wrong revs."""
    n = 1 << 19
    spec = np.abs(np.fft.rfft(body * np.hanning(len(body)), n))
    df = SR / n

    def level(fh):
        k = int(fh / df)
        w = max(3, int(fh * .01 / df))
        return 20 * np.log10(spec[max(0, k - w):k + w + 1].max() + 1e-12)
    levels = {r: level(hz * r) for r in (.5, 2 / 3, .75, 1, 1.5, 2)}
    return levels[1] >= max(levels.values()) - 4


def write(name, title, pieces, meta):
    parts = [np.zeros(SYNC, np.float32), np.array([.9], np.float32), np.zeros(SYNC, np.float32)]
    pos = 2 * SYNC + 1
    places = []
    for body in pieces:
        places.append([pos, pos + len(body)])
        guard = body[:int(.05 * SR)]
        gap = np.zeros(int(.03 * SR), np.float32)
        parts += [body, guard, gap]
        pos += len(body) + len(guard) + len(gap)
    audio = np.concatenate(parts)
    audio[2 * SYNC + 1:] *= .89 / np.percentile(np.abs(audio[2 * SYNC + 1:]), 99.95)
    audio = np.clip(audio, -1, 1)
    mp3 = OUT / f'{name}.mp3'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(mp3)],
                   input=audio.astype(np.float32).tobytes(), check=True)
    (OUT / f'{name}.json').write_text(json.dumps({'title': title, 'sampleRate': SR, 'click': SYNC, **meta(places)}, separators=(',', ':')))
    return mp3.stat().st_size // 1024


def build_loops(name, cfg, src_dir):
    tracks = find_windows(cfg, src_dir)
    cycle, order = 2 * cfg['order'], cfg['order']
    lo, hi = cfg['rpm']
    targets = [lo * STEP ** i for i in range(int(np.log(hi / lo) / np.log(STEP)) + 1)]
    pieces, loops = [], []
    for layer in ('on', 'off'):
        previous = None
        for rpm in targets:
            hz = rpm * order / 60
            for score, ti, a, b, span, sure in candidates(tracks, layer, hz, previous):
                file, x, times, f = tracks[ti][:4]
                body = seamless(flatten(x, times, f, a, b, hz), hz, cycle)
                if body is None or not line_check(body, hz):
                    continue
                body *= 10 ** (-20 / 20) / np.sqrt(np.mean(body ** 2))
                actual = tuned(body, hz) * 60 / order
                pieces.append(body)
                loops.append({'rpm': round(actual), 'layer': layer, 'aimed': round(rpm), 'file': file, 'at': round(float(a), 2), 'span': round(float(span), 3)})
                print(f'{layer:3s} {rpm:5.0f} rpm (measured {actual:5.0f}, {100 * (actual / rpm - 1):+5.1f}%)  {file} {a:6.1f}-{b:6.1f} s  revs move {span * 100:4.1f}%  sure {sure:.0%}  loop {len(body) / SR:.2f} s')
                previous = (ti, (a + b) / 2)
                break

    def meta(places):
        for loop, place in zip(loops, places):
            loop['start'], loop['end'] = place
        return {'order': cfg['order'], 'loops': loops}
    print(name, write(name, cfg['title'], pieces, meta), 'KB,', len(loops), 'loops')


def build_idle(name, spec, src_dir):
    file, start, length, rpm, per_turn = spec
    x = decode(src_dir / file)
    a, n, s = int(start * SR), int(length * SR), int(.4 * SR)
    seg = x[a:a + n + s].astype(np.float32)
    t = np.linspace(0, np.pi / 2, s)
    body = seg[:n].copy()
    body[:s] = seg[:s] * np.sin(t) + seg[n:n + s] * np.cos(t)
    body *= 10 ** (-20 / 20) / np.sqrt(np.mean(body ** 2))
    size = write(name, f'idle loop from Freesound {file[:-4]}', [body], lambda places: {'rpm': rpm, 'loop': places[0]})
    print(name, size, 'KB,', length, 's at', rpm, 'rpm')


if __name__ == '__main__':
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'audios_originais/freesound'
    wanted = sys.argv[2:]
    for name, cfg in LOOPS.items():
        if not wanted or name in wanted:
            build_loops(name, cfg, src)
    for name, spec in IDLES.items():
        if not wanted or name in wanted:
            build_idle(name, spec, src)
