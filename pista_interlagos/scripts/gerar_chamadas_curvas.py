"""The copilot's corner names (corner-callouts.js) read by the narrator's voice: one MP3 per circuit with every
callout, their places in its JSON (assets/audio/curvas_<circuito>.mp3/.json). Reads with Chatterbox and a preset of
the bancada de voz, as gerar_narracao.py does for the stories (its pronunciation table, its Whisper check, its cache:
a name is read again only when its words or the voice change).

Usage: apps/venv_chatterbox python gerar_chamadas_curvas.py [circuito] [--preset bob_eq50_v3] [--nome bob]
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

from gerar_narracao import CACHE, FFMPEG, NODE, ROOT, SR, apply_preset, decode, read_chatterbox, trim, write_text

OUT = ROOT / 'pista_interlagos/teste/assets/audio'
PUBLICACAO = Path(__file__).with_name('publicacao.py')
LEAD, GAP = .1, .4


def callouts(circuit):
    out = subprocess.run([str(NODE), str(Path(__file__).with_name('chamadas_curvas.mjs')), circuit], capture_output=True,
                         check=True, cwd=ROOT)
    return json.loads(out.stdout.decode('utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('circuito', nargs='?', default='interlagos')
    parser.add_argument('--preset', default='bob_eq50_v3', help='a preset saved at the bancada de voz')
    parser.add_argument('--nome', default='bob', help="the voice's name, for the cache folder")
    parser.add_argument('--rotulo', default='Bob')
    parser.add_argument('--nota', type=float, default=.85)
    parser.add_argument('--tentativas', type=int, default=4)
    args = parser.parse_args()
    # The settings gerar_narracao.read_chatterbox reads, all from the preset.
    for key, value in dict(lang='pt', referencia=None, modelo='v3', exagero=.5, cfg=.5, temperatura=.8, repeticao=1.2, min_p=.05,
                           top_p=.95, semente=0, velocidade=1.0, decodificador='ptbr', pausa=.5).items():
        setattr(args, key, value)
    apply_preset(args)

    lines = callouts(args.circuito)
    read = read_chatterbox(lines, args, CACHE / f'curvas_{args.circuito}_{args.nome}')
    notes = [line['note'] for line in lines]
    print(f'{len(lines)} nomes, {read} lidos agora; nota mínima {min(notes):.2f}, média {sum(notes) / len(notes):.2f}')

    parts, clips, at = [np.zeros(int(LEAD * SR), np.float32)], {}, int(LEAD * SR)
    for line in lines:
        pcm = trim(decode(line['file']))
        clips[line['key']] = {'start': round(at / SR, 3), 'end': round((at + len(pcm)) / SR, 3), 'say': line['say']}
        parts += [pcm, np.zeros(int(GAP * SR), np.float32)]
        at += len(pcm) + int(GAP * SR)
    pcm = np.concatenate(parts)
    mp3 = OUT / f'curvas_{args.circuito}.mp3'
    subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame',
                    '-b:a', '64k', str(mp3)], input=pcm.tobytes(), check=True)
    head = {'circuit': args.circuito, 'voice': f'pt-BR-Chatterbox-{args.nome}', 'label': args.rotulo, 'source': 'chatterbox',
            'model': args.modelo, 'exaggeration': args.exagero}
    body = ',\n'.join(f' {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in clips.items())
    write_text(OUT / f'curvas_{args.circuito}.json', json.dumps(head, ensure_ascii=False)[:-1] + ',"clips":{\n' + body + '\n}}\n')
    longest = max(c['end'] - c['start'] for c in clips.values())
    print(f'{mp3.name}: {len(pcm) / SR:.1f} s, {mp3.stat().st_size / 1e3:.0f} kB; nome mais longo {longest:.2f} s')
    published = PUBLICACAO.read_text(encoding='utf-8')
    missing = [n for n in (f'audio/curvas_{args.circuito}.mp3', f'audio/curvas_{args.circuito}.json') if f"'{n}'" not in published]
    if missing:
        print('Faltam em publicacao.py (ASSETS): ' + ', '.join(missing))


if __name__ == '__main__':
    main()
