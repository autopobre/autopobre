"""A circuit's history read aloud by a neural voice (edge-tts), for the player's recorded voices (track-history.js).

Every line the story says (scripts/falas_historia.mjs) is read once into audios_originais/narracao/ (a cache: a line
is read again only when its words, the voice or the rate change), trimmed of its silences and laid end to end, with a
pause between lines, in one MP3 beside the story's pictures:
  teste/assets/historia/voz_<historia>_<lang>_<nome>.mp3   the lines
  teste/assets/historia/voz_<historia>_<lang>_<nome>.json  where each line starts and ends, and its words
  teste/assets/historia/vozes_<historia>.json              the story's recorded voices, the player's default first
New files also go in scripts/publicacao.py (ASSETS); the script says which are missing.

Usage: apps/venv_apps python gerar_narracao.py [historia] [--lang pt] [--voz pt-BR-AntonioNeural] [--nome antonio]
       [--rotulo Antonio] [--rate +0%]      (edge-tts and numpy; ffmpeg and node: see find_tool)
The rate: +0% is the voice's own pace, the story's default (the user's pick, 10-22, over +15%, the pace the player
gives Edge's online voices, kept as "Antonio rápido": --nome antonio_rapido --rotulo "Antonio rápido" --rate +15%).
A voice read again keeps its place in the list; a new one goes last.
"""
import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import edge_tts
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'pista_interlagos/teste/assets/historia'
CACHE = ROOT / 'audios_originais/narracao'
PUBLICACAO = Path(__file__).with_name('publicacao.py')
SR = 24000
# Silence kept around each line's words, and the pause laid between lines: the player stops a line at its end, so
# the pause is also the margin for a late stop (0.3 s at 2×).
LEAD, HEAD, TAIL, GAP = .2, .05, .12, .6
THRESHOLD = 10 ** (-42 / 20)


def find_tool(env, pattern, name):
    """The tool from the environment, else the portable one in an apps/ folder above the repository, else PATH."""
    if os.environ.get(env):
        return Path(os.environ[env])
    for parent in Path(__file__).resolve().parents:
        found = sorted(parent.glob(pattern))
        if found:
            return found[-1]
    return Path(shutil.which(name) or name)


FFMPEG = find_tool('FFMPEG', 'apps/ffmpeg-*/bin/ffmpeg.exe', 'ffmpeg')
NODE = find_tool('NODE', 'apps/node-*/node.exe', 'node')


def story_lines(story, lang):
    out = subprocess.run([str(NODE), str(Path(__file__).with_name('falas_historia.mjs')), story, lang],
                         capture_output=True, check=True, cwd=ROOT)
    return json.loads(out.stdout.decode('utf-8'))['lines']


async def read_lines(lines, voice, rate, folder):
    """Each line's MP3 in the cache, read by the voice (four at a time, a few tries each)."""
    folder.mkdir(parents=True, exist_ok=True)
    gate = asyncio.Semaphore(4)

    async def one(line):
        key = hashlib.sha1(f'{voice}|{rate}|{line["say"]}'.encode('utf-8')).hexdigest()[:16]
        path = folder / f'{key}.mp3'
        line['file'] = path
        if path.exists() and path.stat().st_size:
            return False
        async with gate:
            for attempt in range(4):
                try:
                    part = path.with_suffix('.part')
                    await edge_tts.Communicate(line['say'], voice, rate=rate).save(str(part))
                    part.replace(path)
                    return True
                except Exception as error:  # the service drops a request now and then
                    if attempt == 3:
                        raise RuntimeError(f'{line["key"]}: {error}') from error
                    await asyncio.sleep(2 + 3 * attempt)

    read = await asyncio.gather(*(one(line) for line in lines))
    return sum(read)


def decode(path):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def trim(pcm):
    """The words with a breath of silence each side, faded in and out over 5 ms."""
    loud = np.flatnonzero(np.abs(pcm) > THRESHOLD)
    if not loud.size:
        raise ValueError('a line came back silent')
    pcm = pcm[max(0, loud[0] - int(HEAD * SR)):min(len(pcm), loud[-1] + int(TAIL * SR))].copy()
    fade = min(int(.005 * SR), len(pcm) // 2)
    pcm[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    pcm[len(pcm) - fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return pcm


def write_text(path, text):
    path.write_bytes(text.encode('utf-8'))  # LF, as the repository keeps them


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('historia', nargs='?', default='interlagos')
    parser.add_argument('--lang', default='pt')
    parser.add_argument('--voz', default='pt-BR-AntonioNeural')
    parser.add_argument('--nome', default='antonio')
    parser.add_argument('--rotulo', default='Antonio')
    parser.add_argument('--rate', default='+0%')
    args = parser.parse_args()

    base = f'voz_{args.historia}_{args.lang}_{args.nome}'
    lines = story_lines(args.historia, args.lang)
    read = asyncio.run(read_lines(lines, args.voz, args.rate, CACHE / base))
    print(f'{len(lines)} falas, {read} lidas agora pela voz {args.voz} ({args.rate}), {len(lines) - read} do cache')

    parts, entries, at, speech = [np.zeros(int(LEAD * SR), np.float32)], [], int(LEAD * SR), 0.0
    for line in lines:
        pcm = trim(decode(line['file']))
        entries.append({'key': line['key'], 'start': round(at / SR, 3), 'end': round((at + len(pcm)) / SR, 3), 'say': line['say']})
        parts += [pcm, np.zeros(int(GAP * SR), np.float32)]
        at += len(pcm) + int(GAP * SR)
        speech += len(pcm) / SR
    pcm = np.concatenate(parts)

    mp3 = OUT / f'{base}.mp3'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '64k', str(mp3)], input=pcm.tobytes(), check=True)
    chars = sum(len(line['say']) for line in lines)
    head = {'story': args.historia, 'lang': args.lang, 'voice': args.voz, 'label': args.rotulo, 'rate': args.rate,
            'source': 'edge-tts', 'chars': chars, 'speech': round(speech, 3)}
    body = ',\n'.join(' ' + json.dumps(e, ensure_ascii=False) for e in entries)
    write_text(OUT / f'{base}.json', json.dumps(head, ensure_ascii=False)[:-1] + ',"lines":[\n' + body + '\n]}\n')

    index_path = OUT / f'vozes_{args.historia}.json'
    index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else []
    entry = {'lang': args.lang, 'voice': args.voz, 'label': args.rotulo, 'src': f'assets/historia/{base}'}
    index = [entry if e['src'] == entry['src'] else e for e in index] + ([] if any(e['src'] == entry['src'] for e in index) else [entry])
    write_text(index_path, '[\n' + ',\n'.join(' ' + json.dumps(e, ensure_ascii=False) for e in index) + '\n]\n')

    print(f'{mp3.name}: {len(pcm) / SR / 60:.1f} min ({speech / 60:.1f} min de fala, {chars / speech:.1f} caracteres/s), '
          f'{mp3.stat().st_size / 1e6:.1f} MB')
    published = PUBLICACAO.read_text(encoding='utf-8')
    missing = [n for n in (f'historia/{base}.mp3', f'historia/{base}.json', f'historia/vozes_{args.historia}.json')
               if f"'{n}'" not in published]
    if missing:
        print('Faltam em publicacao.py (ASSETS): ' + ', '.join(missing))


if __name__ == '__main__':
    main()
