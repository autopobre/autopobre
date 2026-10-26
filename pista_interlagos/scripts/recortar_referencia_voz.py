"""A clean clip of one person's voice cut from a video or a long recording, for Chatterbox's voice copy
(gerar_narracao.py --motor chatterbox --referencia <clip>).

Whisper transcribes the recording word by word; the words make phrases (split where the speaker pauses), and every
run of phrases of about --segundos is a candidate. Chatterbox's own voice encoder tells the voices apart: the person
is the voice heard longest. The clip is the candidate in that voice with no long pause, the quietest background (the
floor between words), nothing clipped, ending at the end of a sentence if it can. The best clip and the next two are
written (<saida>.wav, <saida>_2.wav, <saida>_3.wav) with what each one says in <saida>.txt, to listen and pick.
Recordings of people stay out of the repository (referencias/ is in .gitignore).

Usage: apps/venv_chatterbox python recortar_referencia_voz.py <gravacao> <saida.wav> [--segundos 11] [--pular 0]
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np

from gerar_narracao import FFMPEG, WHISPER, device, release, write_wav

SR_IN = 16000   # what Whisper and the voice encoder hear
SR_OUT = 24000  # what Chatterbox takes in
FRAME = .05


def decode(path, sr):
    raw = subprocess.run([str(FFMPEG), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def transcribe(pcm):
    """The words with their times."""
    import torch
    from transformers import pipeline
    asr = pipeline('automatic-speech-recognition', model=WHISPER, device=device(),
                   dtype=torch.float16 if device() == 'cuda' else torch.float32)
    out = asr({'raw': pcm, 'sampling_rate': SR_IN}, return_timestamps='word', chunk_length_s=30, batch_size=1,
              generate_kwargs={'language': 'pt', 'task': 'transcribe'}, ignore_warning=True)
    del asr
    release()
    return [{'start': c['timestamp'][0], 'end': c['timestamp'][1], 'text': c['text'].strip()}
            for c in out['chunks'] if c['timestamp'][0] is not None and c['timestamp'][1] is not None]


def phrases(words, pause=.3):
    """Words joined into phrases, a new one wherever the speaker pauses longer than `pause`."""
    out = []
    for w in words:
        if out and w['start'] - out[-1]['end'] <= pause:
            out[-1]['end'] = w['end']
            out[-1]['text'] += ' ' + w['text']
        else:
            out.append(dict(w))
    return out


def voice_encoder():
    import torch
    from huggingface_hub import hf_hub_download
    from chatterbox.models.voice_encoder import VoiceEncoder
    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(hf_hub_download('ResembleAI/chatterbox', 've.pt'), map_location='cpu', weights_only=True))
    return ve.to(device()).eval()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('gravacao')
    parser.add_argument('saida')
    parser.add_argument('--segundos', type=float, default=11, help='Chatterbox hears the first 10 s of the clip')
    parser.add_argument('--pular', type=float, default=0, help='seconds at the start to skip (an opening with music)')
    args = parser.parse_args()
    out = Path(args.saida).with_suffix('')
    out.parent.mkdir(parents=True, exist_ok=True)

    pcm = decode(args.gravacao, SR_IN)
    said = phrases([w for w in transcribe(pcm) if w['start'] >= args.pular])
    print(f'{len(pcm) / SR_IN / 60:.1f} min, {len(said)} frases')

    # Every run of phrases of about the length asked, with no pause over 0.6 s inside.
    frames = len(pcm) // int(FRAME * SR_IN)
    db = 20 * np.log10(np.sqrt((pcm[:frames * int(FRAME * SR_IN)].reshape(frames, -1) ** 2).mean(1) + 1e-12))
    peak = np.abs(pcm)
    windows = []
    for i in range(len(said)):
        for j in range(i, len(said)):
            if j > i and said[j]['start'] - said[j - 1]['end'] > .6:
                break
            total = said[j]['end'] - said[i]['start']
            if total > args.segundos + 2:
                break
            if total >= args.segundos - 1:
                a, b = said[i]['start'], said[j]['end']
                seg = db[int(a / FRAME):int(b / FRAME)]
                text = ' '.join(s['text'] for s in said[i:j + 1])
                windows.append({'start': a, 'end': b, 'text': text, 'floor': float(np.percentile(seg, 8)),
                                'voice': float(np.percentile(seg, 90)),
                                'clipped': int((peak[int(a * SR_IN):int(b * SR_IN)] > .99).sum()),
                                'sentence': text.rstrip()[-1:] in '.!?'})
                break
    if not windows:
        raise SystemExit('nenhum trecho do tamanho pedido')

    # Who speaks: the voice heard most, found again from the candidates that sound most like the first guess.
    ve = voice_encoder()
    embeds = ve.embeds_from_wavs([pcm[int(w['start'] * SR_IN):int(w['end'] * SR_IN)] for w in windows], sample_rate=SR_IN)
    del ve
    release()
    embeds = embeds / np.linalg.norm(embeds, axis=1, keepdims=True)
    centre = embeds.sum(0)
    for _ in range(3):
        centre /= np.linalg.norm(centre)
        sims = embeds @ centre
        centre = embeds[sims >= np.median(sims)].sum(0)
    centre /= np.linalg.norm(centre)
    sims = embeds @ centre
    same = float(np.percentile(sims, 25))
    print(f'{len(windows)} candidatos; semelhança com a voz principal: mediana {np.median(sims):.2f}, corte {same:.2f}')
    for w, s in zip(windows, sims):
        w['sim'] = float(s)
        w['score'] = (w['voice'] - w['floor']) + 40 * (w['sim'] - same) - (10 if w['clipped'] > 20 else 0) + (2 if w['sentence'] else 0)
    windows = [w for w in windows if w['sim'] >= same]
    windows.sort(key=lambda w: -w['score'])
    picked = []
    for w in windows:
        if all(w['end'] <= p['start'] or w['start'] >= p['end'] for p in picked):
            picked.append(w)
        if len(picked) == 3:
            break
    if not picked:
        raise SystemExit('nenhum trecho limpo do tamanho pedido')

    full = decode(args.gravacao, SR_OUT)
    notes = []
    for k, w in enumerate(picked):
        clip = full[max(0, int((w['start'] - .1) * SR_OUT)):int((w['end'] + .15) * SR_OUT)].copy()
        clip *= .89 / max(1e-6, np.abs(clip).max())  # peak at -1 dB
        name = out.with_name(out.name + ('' if k == 0 else f'_{k + 1}')).with_suffix('.wav')
        write_wav(name, clip, SR_OUT)
        m, s = divmod(w['start'], 60)
        notes.append(f'{name.name}: {int(m)}:{s:04.1f} a {w["end"] - w["start"]:.1f} s, fundo {w["floor"]:.0f} dB, '
                     f'semelhança {w["sim"]:.2f}\n  "{w["text"]}"')
        print(notes[-1])
    out.with_suffix('.txt').write_bytes(('\n'.join(notes) + '\n').encode('utf-8'))


if __name__ == '__main__':
    main()
