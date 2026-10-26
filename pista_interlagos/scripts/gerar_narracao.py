"""A circuit's history read aloud by a neural voice (edge-tts, or Chatterbox copying a person's voice from a clip),
for the player's recorded voices (track-history.js).

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
A voice read again keeps its place in the list; a new one goes last (--primeira puts it first: the default).

Chatterbox (Resemble AI, MIT, runs on this PC's GPU): --motor chatterbox --referencia <10-12 s clip of the voice>
(scripts/recortar_referencia_voz.py cuts one from a video) --nome stevan --rotulo Stevan, with apps/venv_chatterbox
python. pt uses the Brazilian Portuguese finetune (ResembleAI/Chatterbox-Multilingual-pt-br). It sometimes swallows a
word or babbles past the end, so every take is heard back by Whisper and read again with another seed until the words
match (--nota; the best take is kept); the takes and their marks stay in the cache.
The voice and settings heard and chosen at the bancada de voz (scripts/bancada_voz.py) come in with --preset <nome>
(referencias/voz_lab/presets.json). The model is the multilingual v3 (the user's pick by ear, 10-25: the Brazilian
finetune talked slowly and turned real voices into deep cartoons); --modelo ptbr takes the finetune, and with it
--decodificador original the base repo's decoder instead of the finetune's (the decoder gives the mould's timbre), and
--velocidade stretches every take afterwards with Rubber Band, the pitch kept (the finetune talks slowly: 10-12
characters a second against 14-16).
"""
import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

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
# Models downloaded once into the apps/ folder beside the other portable tools (Hugging Face reads HF_HOME on import).
APPS = next((parent / 'apps' for parent in Path(__file__).resolve().parents if (parent / 'apps').is_dir()), None)
if APPS:
    os.environ.setdefault('HF_HOME', str(APPS / 'huggingface'))


def story_lines(story, lang):
    out = subprocess.run([str(NODE), str(Path(__file__).with_name('falas_historia.mjs')), story, lang],
                         capture_output=True, check=True, cwd=ROOT)
    return json.loads(out.stdout.decode('utf-8'))['lines']


async def read_lines(lines, voice, rate, folder):
    """Each line's MP3 in the cache, read by the voice (four at a time, a few tries each)."""
    folder.mkdir(parents=True, exist_ok=True)
    gate = asyncio.Semaphore(4)

    import edge_tts

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


# ---- Chatterbox: a voice copied from a clip ----
LANG_TAGS = {'pt': 'pt-BR', 'en': 'en-US'}
WHISPER = 'openai/whisper-large-v3-turbo'


def device():
    import torch
    return 'cuda' if torch.cuda.is_available() else 'cpu'


def release():
    import gc
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# The Brazilian Portuguese finetune ships its text model and its own decoder (s3gen_v3); the voice encoder and the
# built-in voice come from the base repo. from_local wants them side by side, the decoder named s3gen.pt.
PT_BR, BASE = 'ResembleAI/Chatterbox-Multilingual-pt-br', 'ResembleAI/chatterbox'
PT_BR_FILES = {'t3_pt_br.safetensors': (PT_BR, 't3_pt_br.safetensors'),
               'grapheme_mtl_merged_expanded_v1.json': (PT_BR, 'grapheme_mtl_merged_expanded_v1.json'),
               've.pt': (BASE, 've.pt'), 'conds.pt': (BASE, 'conds.pt'), 'Cangjie5_TC.json': (BASE, 'Cangjie5_TC.json')}


def complete_decoder(source, target):
    """s3gen_v3 leaves out two fixed buffers that S3Gen builds itself (the mel filters and the window of its
    tokenizer): the decoder is saved again with them, as a new file (never through a link into the download cache)."""
    import torch
    from chatterbox.models.s3gen import S3Gen
    state = torch.load(source, map_location='cpu', weights_only=True)
    fresh = S3Gen().state_dict()
    missing = fresh.keys() - state.keys()
    if missing - {'tokenizer._mel_filters', 'tokenizer.window'}:
        raise RuntimeError(f'{source}: more than the fixed buffers missing: {sorted(missing)[:5]}')
    state.update({k: fresh[k] for k in missing})
    target.unlink(missing_ok=True)
    torch.save(state, target)


def load_chatterbox(lang):
    """The multilingual model; Portuguese with its Brazilian finetune."""
    from huggingface_hub import hf_hub_download
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    if lang != 'pt':
        return ChatterboxMultilingualTTS.from_pretrained(device=device(), t3_model='v3')
    folder = (APPS or CACHE.parent) / 'modelos' / 'chatterbox-pt-br'
    folder.mkdir(parents=True, exist_ok=True)
    for name, (repo, source) in PT_BR_FILES.items():
        target = folder / name
        if not target.exists():
            got = hf_hub_download(repo, source)
            try:
                os.link(got, target)
            except OSError:
                shutil.copyfile(got, target)
    decoder = folder / 's3gen.pt'
    if not (folder / 's3gen.ok').exists():
        complete_decoder(hf_hub_download(PT_BR, 's3gen_v3.pt'), decoder)
        (folder / 's3gen.ok').write_text('s3gen_v3.pt + the fixed buffers\n')
    model = ChatterboxMultilingualTTS.from_local(folder, device(), t3_model='t3_pt_br.safetensors')
    # The finetune reads the text as written: its own demo (the Space ResembleAI/Chatterbox-Multilingual-TTS-pt-br)
    # keeps the case and the accented letters whole, while the multilingual tokenizer lowercases and splits them
    # (NFKD: "é" became "e" + a loose accent, "São" "sa" + a tilde + "o"), and the vowels came out wrong: a European
    # accent and an alien voice (user, 10-25).
    raw = model.tokenizer.text_to_tokens
    model.tokenizer.text_to_tokens = lambda text, language_id=None, **_: raw(text, language_id=language_id,
                                                                               lowercase=False, nfkd_normalize=False)
    return model


NUM_LANG = {'pt': 'pt_BR', 'en': 'en'}
SPOKEN = {'km': 'quilometros'}


# Words the voice reads wrong as written, respelled for it only (the captions keep the script's words). The letter S
# and the curve called Esse are "ésse": as written, the voice said the pronoun "êsse"; Emerson is "Émerson"; miolo is
# "miôlo", not "miólo"; the driver Hellé Nice is "Éle Níce", not "Naice" (user, 10-26).
PRONUNCIATION = {'pt': [(r'\bS\b', 'ésse'), (r'\bum esse\b', 'um ésse'), (r'(?<=[^.!?] )Esse\b', 'Ésse'),
                        (r'\bEmerson\b', 'Émerson'), (r'\b([Mm])iolo\b', r'\1iôlo'), (r'\bHellé Nice\b', 'Éle Níce')]}


def pronounced(text, lang):
    import re
    for pattern, spoken in PRONUNCIATION.get(lang, []):
        text = re.sub(pattern, spoken, text)
    return text


def spelled(text, lang):
    """Numbers in words for Chatterbox ("318" came out as "três, dezoito"); num2words' comma in "mil, novecentos"
    would read as a pause."""
    import re
    from num2words import num2words
    return re.sub(r'\d+', lambda m: num2words(int(m.group()), lang=NUM_LANG.get(lang, lang)).replace(',', ''), text)


def level(pcm):
    """Every take at the same loudness (its voiced frames), the peak kept under -1 dB."""
    frames = pcm[:len(pcm) // 1200 * 1200].reshape(-1, 1200)
    rms = np.sqrt((frames ** 2).mean(1))
    voiced = rms[rms > rms.max() * .1]
    pcm = pcm * (10 ** (-18 / 20) / max(1e-6, np.sqrt((voiced ** 2).mean())))
    return pcm * min(1.0, .89 / max(1e-6, np.abs(pcm).max()))


def stretch(pcm, sr, tempo):
    """Faster or slower, the pitch and the formants kept (ffmpeg's Rubber Band)."""
    if abs(tempo - 1) < 1e-3:
        return pcm
    out = subprocess.run([str(FFMPEG), '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af',
                          f'rubberband=tempo={tempo}:transients=mixed:formant=preserved:pitchq=quality', '-f', 'f32le', '-'],
                         input=np.ascontiguousarray(pcm, np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32)


def use_decoder(model, which):
    """The Brazilian finetune's decoder (s3gen_v3, completed) or the base repo's original one."""
    import torch
    from huggingface_hub import hf_hub_download
    source = hf_hub_download(BASE, 's3gen.pt') if which == 'original' else (APPS or CACHE.parent) / 'modelos' / 'chatterbox-pt-br' / 's3gen.pt'
    model.s3gen.load_state_dict(torch.load(source, map_location='cpu', weights_only=True), strict=False)


# A studio voice's balance (the Antonio mould: third-octave long-term spectrum, dB against its 300-1000 Hz mean). A deep
# voice recorded close (Bob's, 10-25: 70% of the energy under 300 Hz, the 2-6 kHz band 15-20 dB down) came out of
# Chatterbox as a deep cartoon voice; brought to this balance it sounded like him (the user's ear, full correction
# better than half).
STUDIO_BALANCE = {63: -29.1, 79: -22.4, 100: -5.3, 126: 1.3, 159: 1.6, 200: -0.6, 252: 3.0, 318: 6.5, 400: 3.1, 504: 1.6,
                  635: -0.7, 800: -10.4, 1008: -10.2, 1270: -12.4, 1600: -14.3, 2016: -20.8, 2540: -18.6, 3200: -21.3,
                  4032: -21.0, 5080: -21.5, 6400: -24.3, 8064: -29.7, 10160: -37.2}


def treat_mould(pcm, sr, peak_db=-3.0):
    """A mould made ready as the user treats his recordings: the lows cut hard, the long-term balance brought to a
    studio voice's (±18 dB at most per third of an octave, the pitch untouched), the volume evened (ffmpeg's dynamic
    normaliser, then a gentle compressor) and the peak normalised to -3 dB."""
    import librosa
    from scipy.signal import fftconvolve, firwin2
    pcm = np.asarray(pcm, np.float32)
    spec = np.abs(librosa.stft(pcm, n_fft=4096, hop_length=1024)) ** 2
    energy = spec.sum(0)
    db = 10 * np.log10(spec[:, energy > np.percentile(energy, 40)].mean(1) + 1e-20)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    centres = np.array([c for c in STUDIO_BALANCE if c < sr / 2 * .92], float)
    have = np.array([10 * np.log10(np.mean(10 ** (db[(freqs >= c / 2 ** (1 / 6)) & (freqs < c * 2 ** (1 / 6))] / 10))) for c in centres])
    mid = (centres >= 300) & (centres <= 1000)
    gain = np.clip(np.array([STUDIO_BALANCE[int(c)] for c in centres]) - (have - have[mid].mean()), -18, 18)
    taps = firwin2(2049, np.concatenate([[0, 30, 50], centres, [sr / 2]]) / (sr / 2),
                   10 ** (np.concatenate([[-60, -40, gain[0]], gain, [gain[-1]]]) / 20))
    out = fftconvolve(pcm, taps, mode='same').astype(np.float32)
    out *= 10 ** (-20 / 20) / max(1e-9, float(np.sqrt(np.mean(out ** 2))))
    out = np.frombuffer(subprocess.run(
        [str(FFMPEG), '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af',
         'dynaudnorm=f=200:g=15:p=0.9:m=8,acompressor=threshold=-24dB:ratio=2.5:attack=10:release=200:knee=4', '-f', 'f32le', '-'],
        input=out.tobytes(), capture_output=True, check=True).stdout, np.float32)
    return out * (10 ** (peak_db / 20) / max(1e-9, float(np.abs(out).max())))


def write_wav(path, pcm, sr):
    import wave
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(pcm, -1, 1) * 32767).astype('<i2').tobytes())


def words(text, lang='pt'):
    """The words without accents, numbers spelled out (Whisper writes "318", "km" where the voice said them)."""
    import re
    import unicodedata
    text = re.sub(r'(\d)[.,](\d{3})', r'\1\2', text)
    text = spelled(text, lang).lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return [SPOKEN.get(w, w) for w in re.findall(r'[a-z]+', text)]


def mark(said, heard, lang='pt'):
    """How well what Whisper heard matches the line, 0 to 1 (word by word)."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, words(said, lang), words(heard, lang)).ratio()


def load_model(kind, lang, decoder='ptbr'):
    if kind == 'v3':
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        return ChatterboxMultilingualTTS.from_pretrained(device=device(), t3_model='v3')
    model = load_chatterbox(lang)
    if decoder == 'original':
        use_decoder(model, 'original')
    return model


def apply_preset(args):
    """The bancada de voz's preset: its mould (none = the model's built-in voice), model and settings."""
    common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=Path(__file__).parent,
                            capture_output=True, text=True, check=True).stdout.strip()
    presets = json.loads((Path(common).parent / 'referencias/voz_lab/presets.json').read_text(encoding='utf-8'))
    if args.preset not in presets:
        raise SystemExit(f'preset {args.preset} not found (there are: {", ".join(presets)})')
    p = presets[args.preset]
    args.referencia, args.modelo = p['referencia'], p.get('modelo', 'v3')
    args.exagero, args.cfg, args.temperatura = float(p['exagero']), float(p['cfg']), float(p['temperatura'])
    args.semente, args.repeticao, args.min_p, args.top_p = int(p['semente']), float(p['repeticao']), float(p['min_p']), float(p['top_p'])
    args.velocidade, args.decodificador = float(p.get('velocidade', 1)), p.get('decodificador', 'ptbr')
    args.pausa = float(p.get('pausa', args.pausa))


def read_aloud(model, text, lang, pause=.5, **settings):
    """A line through Chatterbox. At a colon it is read in parts and a pause of `pause` seconds laid between them:
    Chatterbox turns ':' into a comma, a short breath, and the user wanted a longer one there (10-26). 0 = one piece."""
    import re
    parts = [p for p in re.split(r'(?<=:)\s+', text) if p.strip()] if pause > 0 else [text]
    pieces = [model.generate(spelled(part, lang), language_id=lang, **settings).squeeze().cpu().numpy() for part in parts]
    if len(pieces) == 1:
        return pieces[0]
    gap = np.zeros(int(pause * model.sr), np.float32)
    joined = []
    for i, piece in enumerate(pieces):
        joined += ([gap] if i else []) + [trim(piece)]
    return np.concatenate(joined)


def read_chatterbox(lines, args, folder):
    """Each line's WAV in the cache, read by Chatterbox in the reference's voice; every take heard back by Whisper
    and marked; lines below --nota read again with the next seed (up to --tentativas takes), the best take kept."""
    folder.mkdir(parents=True, exist_ok=True)
    notes_path = folder / 'notas.json'
    notes = json.loads(notes_path.read_text(encoding='utf-8')) if notes_path.exists() else {}
    ref = Path(args.referencia) if args.referencia else None
    ref_hash = hashlib.sha1(ref.read_bytes()).hexdigest()[:12] if ref else 'embutida'
    params = (f'chatterbox|{args.modelo}|{args.lang}|{ref_hash}|{args.exagero}|{args.cfg}|{args.temperatura}|'
              f'{args.repeticao}|{args.min_p}|{args.top_p}|{args.semente}|{args.velocidade}|{args.decodificador}')
    for line in lines:
        # A respelled line is a new reading (its own stem); the others keep their takes.
        spoken = pronounced(line['say'], args.lang)
        key = f'{params}|{line["say"]}' + (f'|{spoken}' if spoken != line['say'] else '') + (f'|pausa {args.pausa}' if ':' in spoken else '')
        line['stem'], line['spoken'] = hashlib.sha1(key.encode('utf-8')).hexdigest()[:16], spoken

    def takes(line):
        return sorted(folder.glob(f'{line["stem"]}_s*.wav'), key=lambda p: int(p.stem.split('_s')[1]))

    def best(line):
        marked = [(notes.get(p.name, -1), p) for p in takes(line)]
        return max(marked, default=(-1, None), key=lambda m: m[0])

    read = 0
    for round_ in range(args.tentativas):
        todo = [line for line in lines if best(line)[0] < args.nota and len(takes(line)) < args.tentativas]
        if todo:
            import torch
            model = load_model(args.modelo, args.lang, args.decodificador)
            if ref:
                model.prepare_conditionals(str(ref), exaggeration=args.exagero)
            for i, line in enumerate(todo):
                seed = len(takes(line))
                torch.manual_seed(args.semente + seed)
                wav = read_aloud(model, line['spoken'], args.lang, args.pausa, exaggeration=args.exagero, cfg_weight=args.cfg,
                                 temperature=args.temperatura, repetition_penalty=args.repeticao, min_p=args.min_p, top_p=args.top_p)
                pcm = stretch(wav, model.sr, args.velocidade)
                write_wav(folder / f'{line["stem"]}_s{seed}.wav', level(pcm), model.sr)
                read += 1
                print(f'  rodada {round_ + 1}: {i + 1}/{len(todo)} {line["key"]}', flush=True)
            del model
            release()
        if hear(lines, folder, notes, args.lang, args.velocidade):
            write_text(notes_path, json.dumps(notes, ensure_ascii=False, indent=0))
        if not todo:
            break
    for line in lines:
        note, path = best(line)
        if path is None:
            raise RuntimeError(f'{line["key"]}: no take')
        line['file'], line['note'] = path, note
    low = [f'{line["key"]} ({line["note"]:.2f})' for line in lines if line['note'] < args.nota]
    if low:
        print('Abaixo da nota depois de todas as tentativas (fica a melhor): ' + ', '.join(low))
    return read


def hear(lines, folder, notes, lang, speed=1.0):
    """Whisper hears every take not yet marked; True when it marked some."""
    todo = [(line, p) for line in lines for p in folder.glob(f'{line["stem"]}_s*.wav') if p.name not in notes]
    if not todo:
        return False
    import torch
    from transformers import pipeline
    asr = pipeline('automatic-speech-recognition', model=WHISPER, device=device(),
                   dtype=torch.float16 if device() == 'cuda' else torch.float32)
    for line, p in todo:
        pcm = decode(p)
        if not (np.abs(pcm) > THRESHOLD).any():
            notes[p.name] = 0.0
            continue
        heard = asr({'raw': pcm, 'sampling_rate': SR}, generate_kwargs={'language': lang, 'task': 'transcribe'})['text']
        secs = len(trim(pcm)) / SR
        # Babbling past the end or stalling shows in the pace too: a line takes 8 to 22 characters a second (times the
        # speed asked: stretched takes are faster by design).
        pace = len(line['say']) / secs
        # Heard against the respelled words ("ésse"), which Whisper writes either way: the better of the two.
        said = max(mark(line['say'], heard, lang), mark(line.get('spoken', line['say']), heard, lang))
        notes[p.name] = round(said * (1 if 8 * speed <= pace <= 22 * speed else .5), 3)
    del asr
    release()
    return True


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
    parser.add_argument('--motor', choices=('edge', 'chatterbox'), default='edge')
    parser.add_argument('--referencia', help='Chatterbox: the clip whose voice is copied (10-12 s of clean speech)')
    parser.add_argument('--exagero', type=float, default=.5, help='Chatterbox: expressiveness (0.25-2)')
    parser.add_argument('--cfg', type=float, default=.5, help='Chatterbox: how closely it keeps the pace; ~0.3 for fast talkers')
    parser.add_argument('--temperatura', type=float, default=.8)
    parser.add_argument('--repeticao', type=float, default=1.2, help='Chatterbox: repetition penalty')
    parser.add_argument('--min-p', dest='min_p', type=float, default=.05)
    parser.add_argument('--top-p', dest='top_p', type=float, default=.95, help="0.95, as the finetune's own demo")
    parser.add_argument('--velocidade', type=float, default=1.0, help='Chatterbox: every take faster or slower afterwards, the pitch kept')
    parser.add_argument('--pausa', type=float, default=.5, help='Chatterbox: the pause at a colon, in seconds (0 = the model\'s own)')
    parser.add_argument('--decodificador', choices=('ptbr', 'original'), default='ptbr', help="Chatterbox pt-br: the finetune's decoder or the base one")
    parser.add_argument('--semente', type=int, default=0, help="Chatterbox: the first take's seed (the next takes add 1)")
    parser.add_argument('--modelo', choices=('v3', 'ptbr'), default='v3', help='Chatterbox: the multilingual v3 or the Brazilian finetune')
    parser.add_argument('--preset', help="Chatterbox: a preset saved at the bancada de voz (voice, model, settings)")
    parser.add_argument('--nota', type=float, default=.85, help='Chatterbox: the least a take may score when heard back')
    parser.add_argument('--tentativas', type=int, default=4)
    parser.add_argument('--primeira', action='store_true', help="first in the story's list: the player's default voice")
    args = parser.parse_args()

    base = f'voz_{args.historia}_{args.lang}_{args.nome}'
    lines = story_lines(args.historia, args.lang)
    if args.motor == 'chatterbox':
        if args.preset:
            apply_preset(args)
        elif not args.referencia:
            parser.error('--motor chatterbox needs --referencia or --preset')
        args.voz = f'{LANG_TAGS.get(args.lang, args.lang)}-Chatterbox-{args.nome}'
        read = read_chatterbox(lines, args, CACHE / base)
        notes = [line['note'] for line in lines]
        print(f'{len(lines)} falas, {read} lidas agora pelo Chatterbox; nota mínima {min(notes):.2f}, média {sum(notes) / len(notes):.2f}')
    else:
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
    head = {'story': args.historia, 'lang': args.lang, 'voice': args.voz, 'label': args.rotulo,
            **({'rate': args.rate, 'source': 'edge-tts'} if args.motor == 'edge' else
               {'source': 'chatterbox', 'model': args.modelo, 'exaggeration': args.exagero, 'cfg': args.cfg}),
            'chars': chars, 'speech': round(speech, 3)}
    body = ',\n'.join(' ' + json.dumps(e, ensure_ascii=False) for e in entries)
    write_text(OUT / f'{base}.json', json.dumps(head, ensure_ascii=False)[:-1] + ',"lines":[\n' + body + '\n]}\n')

    index_path = OUT / f'vozes_{args.historia}.json'
    index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else []
    entry = {'lang': args.lang, 'voice': args.voz, 'label': args.rotulo, 'src': f'assets/historia/{base}'}
    if args.primeira:
        index = [entry] + [e for e in index if e['src'] != entry['src']]
    else:
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
