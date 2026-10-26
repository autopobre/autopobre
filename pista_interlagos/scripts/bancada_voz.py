"""Bancada de voz: a local page to hear Chatterbox by ear before a whole narration is read (only a person hears what
sounds alien). Pick a voice mould (a clip: recorded at the microphone, sent as a file, or one already in the lab),
the classic settings (exaggeration, CFG/pace, temperature, seed and the advanced sampling ones), the model (the
Brazilian Portuguese finetune or the multilingual v3) and, for the finetune, its decoder or the original one (the
decoder gives the mould's timbre), a speed applied afterwards (Rubber Band, the pitch kept), a line of the story or any text; generate, listen, put a heart
on the good takes and delete the others (they go to takes/apagadas/, and Desfazer brings one back), and save the voice
and settings that work as a preset for gerar_narracao.py (--preset).

It does not retrain the model: Chatterbox copies a voice from the clip at every line, so "training" here is finding
the clip and the settings that sound right.

Everything it keeps (moulds, takes, hearts, presets) is in referencias/voz_lab/ of the main checkout: recordings of
people stay out of the repository (referencias/ is in .gitignore). Local only: 127.0.0.1, and nothing from another site.

Usage: apps/venv_chatterbox python bancada_voz.py [porta] [--pasta <lab>]   (default 8870, http://127.0.0.1:8870/;
       --pasta keeps another lab, as the checks do)
"""
import argparse
import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import numpy as np

from gerar_narracao import (FFMPEG, NODE, device, level, load_chatterbox, pronounced, read_aloud, release, stretch,
                            treat_mould, use_decoder, write_wav)

HERE = Path(__file__).resolve().parent
PAGE = HERE / 'bancada_voz.html'
MAX_UPLOAD = 300 * 1024 * 1024
SR = 24000
# top_p 0.95 as the finetune's own demo; velocidade 1 = as the model said it.
DEFAULTS = {'exagero': .5, 'cfg': .5, 'temperatura': .8, 'semente': 0, 'repeticao': 1.2, 'min_p': .05, 'top_p': .95, 'velocidade': 1.0,
            'pausa': .5}
# The multilingual v3 first and by default: the Brazilian finetune talked slowly and turned real voices into deep
# cartoons (the user's ear, 10-25).
MODELS = {'v3': 'multilíngue v3', 'ptbr': 'pt-br (feito para português do Brasil)'}
DECODERS = {'ptbr': 'do pt-br (v3)', 'original': 'original do Chatterbox'}


def main_checkout():
    """The main checkout (a worktree has no referencias/ of its own)."""
    try:
        common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=HERE,
                                capture_output=True, text=True, check=True).stdout.strip()
        return Path(common).parent
    except (OSError, subprocess.CalledProcessError):
        return HERE.parents[1]


ROOT = main_checkout()


def use_lab(folder):
    global LAB, MOULDS, TAKES, TAKES_JSON, PRESETS_JSON, GONE, GONE_JSON
    LAB = Path(folder)
    MOULDS, TAKES = LAB / 'vozes', LAB / 'takes'
    TAKES_JSON, PRESETS_JSON = LAB / 'takes.json', LAB / 'presets.json'
    GONE, GONE_JSON = TAKES / 'apagadas', LAB / 'apagadas.json'


use_lab(ROOT / 'referencias' / 'voz_lab')
BUILTIN = 'embutida'


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return default


def write_json(path, data):
    path.write_bytes(json.dumps(data, ensure_ascii=False, indent=1).encode('utf-8'))


def slug(text):
    import unicodedata
    text = unicodedata.normalize('NFD', text.lower())
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '_', text).strip('_')[:40] or 'voz'


def seed_lab():
    """The lab's first moulds: the clips cut for Stevan, Resemble's own Brazilian sample and the Antonio of the story."""
    MOULDS.mkdir(parents=True, exist_ok=True)
    GONE.mkdir(parents=True, exist_ok=True)
    # Takes from before the hearts kept stars: a star is a heart.
    takes = read_json(TAKES_JSON, [])
    if any('estrelas' in take for take in takes):
        for take in takes:
            stars = take.pop('estrelas', 0)
            take.setdefault('favorita', stars > 0)
        write_json(TAKES_JSON, takes)
    for clip in sorted((ROOT / 'referencias' / 'voz_stevan').glob('stevan_ref*.wav')):
        target = MOULDS / clip.name
        if not target.exists():
            shutil.copyfile(clip, target)
    antonio = MOULDS / 'antonio_molde.wav'
    mp3 = HERE.parent / 'teste/assets/historia/voz_interlagos_pt_antonio.mp3'
    if not antonio.exists() and mp3.exists():
        subprocess.run([str(FFMPEG), '-v', 'error', '-y', '-ss', '0.2', '-t', '12.1', '-i', str(mp3), '-ar', str(SR), '-ac', '1',
                        str(antonio)], check=True)


def story_lines():
    try:
        out = subprocess.run([str(NODE), str(HERE / 'falas_historia.mjs'), 'interlagos', 'pt'], capture_output=True,
                             check=True, cwd=HERE.parents[1])
        return [line['say'] for line in json.loads(out.stdout.decode('utf-8'))['lines']]
    except (OSError, subprocess.CalledProcessError, ValueError):
        return []


class Lab:
    """The model on the GPU (one at a time), its built-in voice kept, one generation at a time."""

    def __init__(self):
        self.lock = threading.Lock()
        self.model = self.kind = self.builtin = None
        self.mould = self.decoder = None

    def load(self, kind):
        if self.kind == kind:
            return
        self.model = self.builtin = None
        release()
        if kind == 'v3':
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            self.model = ChatterboxMultilingualTTS.from_pretrained(device=device(), t3_model='v3')
        else:
            self.model = load_chatterbox('pt')
        self.kind, self.builtin, self.mould, self.decoder = kind, self.model.conds, None, 'ptbr' if kind == 'ptbr' else 'original'

    def generate(self, text, voice, kind, decoder, settings):
        import torch
        with self.lock:
            t0 = time.time()
            self.load(kind)
            m = self.model
            # The decoder also reads the mould (its speaker encoder): the mould is prepared again after a swap.
            if kind == 'ptbr' and decoder != self.decoder:
                use_decoder(m, decoder)
                self.decoder, self.mould = decoder, None
            exag = float(settings['exagero'])
            if voice == BUILTIN:
                m.conds = self.builtin
                self.mould = None
            elif self.mould != (voice, exag):
                m.prepare_conditionals(str(MOULDS / voice), exaggeration=exag)
                self.mould = (voice, exag)
            torch.manual_seed(int(settings['semente']))
            wav = read_aloud(m, pronounced(text, 'pt'), 'pt', float(settings['pausa']), exaggeration=exag,
                             cfg_weight=float(settings['cfg']), temperature=float(settings['temperatura']),
                             repetition_penalty=float(settings['repeticao']), min_p=float(settings['min_p']), top_p=float(settings['top_p']))
            pcm = level(stretch(wav, m.sr, float(settings['velocidade'])))
            return pcm, m.sr, time.time() - t0


LABO = Lab()


def mould_list():
    out = [{'id': BUILTIN, 'nome': 'Sem clone: voz embutida do Chatterbox', 'audio': None}]
    for p in sorted(MOULDS.glob('*.wav')):
        out.append({'id': p.name, 'nome': p.stem.replace('_', ' '), 'audio': f'/vozes/{p.name}'})
    return out


class Handler(SimpleHTTPRequestHandler):
    server_version = 'BancadaVoz'
    sys_version = ''

    def log_message(self, *args):
        pass

    def allowed(self):
        port = self.server.server_port
        if self.headers.get('Host', '').lower() not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            return False
        return self.headers.get('Sec-Fetch-Site') not in {'cross-site', 'same-site'}

    def reply(self, code, body, kind='application/json; charset=utf-8'):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def file(self, path, kind):
        if not path.is_file():
            return self.reply(404, {'erro': 'não encontrado'})
        self.reply(200, path.read_bytes(), kind)

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, {'erro': 'só nesta máquina'})
        url = urlsplit(self.path)
        path = unquote(url.path)
        if path in ('/', '/index.html'):
            return self.file(PAGE, 'text/html; charset=utf-8')
        if path == '/api/estado':
            return self.reply(200, {'vozes': mould_list(), 'modelos': MODELS, 'decodificadores': DECODERS, 'padrao': DEFAULTS, 'carregado': LABO.kind,
                                    'falas': self.server.lines, 'takes': read_json(TAKES_JSON, [])[-200:],
                                    'presets': read_json(PRESETS_JSON, {}), 'pasta': str(LAB)})
        for prefix, folder in (('/vozes/', MOULDS), ('/takes/', TAKES)):
            if path.startswith(prefix):
                name = path[len(prefix):]
                if '/' in name or '\\' in name or not name.endswith('.wav'):
                    return self.reply(404, {'erro': 'não encontrado'})
                return self.file(folder / name, 'audio/wav')
        self.reply(404, {'erro': 'não encontrado'})

    def body(self, limit=1024 * 1024):
        size = int(self.headers.get('Content-Length') or 0)
        if size > limit:
            raise ValueError('arquivo grande demais')
        return self.rfile.read(size)

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {'erro': 'só nesta máquina'})
        url = urlsplit(self.path)
        try:
            if url.path == '/api/gerar':
                return self.reply(200, self.generate(json.loads(self.body())))
            if url.path == '/api/voz':
                return self.reply(200, self.new_mould(parse_qs(url.query), self.body(MAX_UPLOAD)))
            if url.path == '/api/tratar':
                return self.reply(200, self.treat(json.loads(self.body()).get('voz', '')))
            if url.path == '/api/favorita':
                return self.reply(200, self.favourite(json.loads(self.body())))
            if url.path == '/api/apagar':
                return self.reply(200, self.delete(set(json.loads(self.body()).get('ids', []))))
            if url.path == '/api/limpar':
                return self.reply(200, self.delete({t['id'] for t in read_json(TAKES_JSON, []) if not t.get('favorita')}))
            if url.path == '/api/desfazer':
                return self.reply(200, self.undo(set(json.loads(self.body()).get('ids', []))))
            if url.path == '/api/preset':
                return self.reply(200, self.preset(json.loads(self.body())))
        except Exception as error:  # shown on the page, the server keeps running
            return self.reply(400, {'erro': str(error)})
        self.reply(404, {'erro': 'não encontrado'})

    def generate(self, q):
        text = str(q.get('texto', '')).strip()[:600]
        voice, kind, decoder = q.get('voz', BUILTIN), q.get('modelo', 'v3'), q.get('decodificador', 'ptbr')
        if not text:
            raise ValueError('escreva um texto')
        if kind not in MODELS or decoder not in DECODERS or (voice != BUILTIN and not (MOULDS / voice).is_file()):
            raise ValueError('voz, modelo ou decodificador desconhecido')
        settings = {k: q.get(k, v) for k, v in DEFAULTS.items()}
        if not .5 <= float(settings['velocidade']) <= 2:
            raise ValueError('velocidade fora de 0,5 a 2')
        pcm, sr, secs = LABO.generate(text, voice, kind, decoder, settings)
        take = {'id': uuid.uuid4().hex[:12], 'quando': time.strftime('%Y-%m-%d %H:%M:%S'), 'texto': text, 'voz': voice,
                'modelo': kind, 'decodificador': decoder if kind == 'ptbr' else 'original', 'ajustes': settings,
                'segundos': round(len(pcm) / sr, 2), 'tempo': round(secs, 1), 'favorita': False}
        write_wav(TAKES / f'{take["id"]}.wav', pcm, sr)
        takes = read_json(TAKES_JSON, [])
        takes.append(take)
        write_json(TAKES_JSON, takes)
        return take

    def new_mould(self, query, data):
        """A clip recorded or sent: 12 s of speech from the second asked (the silence before the first word cut), mono
        24 kHz; treated (treat_mould: lows cut, studio balance, even volume, peak -3 dB) unless tratar=0, else peak -1 dB."""
        if len(data) < 1000:
            raise ValueError('áudio vazio')
        name = slug(query.get('nome', ['voz'])[0])
        start = max(0.0, float(query.get('inicio', ['0'])[0] or 0))
        raw = LAB / f'_envio_{uuid.uuid4().hex[:8]}'
        raw.write_bytes(data)
        try:
            out = subprocess.run([str(FFMPEG), '-v', 'error', '-ss', str(start), '-t', '20', '-i', str(raw), '-ac', '1',
                                  '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        finally:
            raw.unlink(missing_ok=True)
        pcm = np.frombuffer(out, np.float32)
        # The model copies the pace of the mould's first 6 s: a recording that began with 2 s of silence came out slow
        # (bob_ref_1, 10-25). The clip starts 0.1 s before the first word: the first 0.2 s mostly voiced (a click of the
        # microphone at the start is not a word).
        hop = SR // 50
        frames = pcm[:len(pcm) // hop * hop].reshape(-1, hop)
        if len(frames) > 10:
            db = 20 * np.log10(np.sqrt((frames ** 2).mean(1)) + 1e-9)
            voiced = np.convolve((db > db.max() - 30).astype(float), np.ones(10), 'valid') >= 6
            if voiced.any():
                pcm = pcm[max(0, int(np.argmax(voiced)) * hop - SR // 10):]
        pcm = pcm[:SR * 12]
        if len(pcm) < SR * 3:
            raise ValueError('menos de 3 segundos de áudio')
        treated = query.get('tratar', ['1'])[0] != '0'
        target = self.free_name(name)
        write_wav(target, treat_mould(pcm, SR) if treated else pcm * (.89 / max(1e-6, np.abs(pcm).max())), SR)
        return {'id': target.name, 'segundos': round(len(pcm) / SR, 1), 'tratado': treated}

    @staticmethod
    def free_name(name):
        target = MOULDS / f'{name}.wav'
        k = 2
        while target.exists():
            target = MOULDS / f'{name}_{k}.wav'
            k += 1
        return target

    def treat(self, voice):
        """A mould already in the lab, treated into a new one beside it (<nome>_tratado)."""
        source = MOULDS / voice
        if voice == BUILTIN or '/' in voice or '\\' in voice or not source.is_file():
            raise ValueError('escolha um molde gravado')
        import librosa
        pcm, _ = librosa.load(str(source), sr=SR)
        target = self.free_name(f'{source.stem}_tratado')
        write_wav(target, treat_mould(pcm, SR), SR)
        return {'id': target.name}

    def favourite(self, q):
        takes = read_json(TAKES_JSON, [])
        for take in takes:
            if take['id'] == q.get('id'):
                take['favorita'] = bool(q.get('favorita'))
        write_json(TAKES_JSON, takes)
        return {'ok': True}

    def delete(self, ids):
        """Takes out of the list into takes/apagadas/ (kept, so Desfazer or a person can bring them back)."""
        takes, gone = read_json(TAKES_JSON, []), read_json(GONE_JSON, [])
        out = [t for t in takes if t['id'] in ids]
        for take in out:
            wav = TAKES / f'{take["id"]}.wav'
            if wav.exists():
                wav.replace(GONE / wav.name)
        write_json(TAKES_JSON, [t for t in takes if t['id'] not in ids])
        write_json(GONE_JSON, gone + out)
        return {'apagadas': [t['id'] for t in out]}

    def undo(self, ids):
        takes, gone = read_json(TAKES_JSON, []), read_json(GONE_JSON, [])
        back = [t for t in gone if t['id'] in ids]
        for take in back:
            wav = GONE / f'{take["id"]}.wav'
            if wav.exists():
                wav.replace(TAKES / wav.name)
        write_json(TAKES_JSON, sorted(takes + back, key=lambda t: t['quando']))
        write_json(GONE_JSON, [t for t in gone if t['id'] not in ids])
        return {'takes': read_json(TAKES_JSON, [])[-200:]}

    def preset(self, q):
        """The voice and settings saved by name, for gerar_narracao.py --preset <nome>."""
        name = slug(q.get('nome', ''))
        voice = q.get('voz', BUILTIN)
        if voice != BUILTIN and not (MOULDS / voice).is_file():
            raise ValueError('voz desconhecida')
        presets = read_json(PRESETS_JSON, {})
        presets[name] = {'voz': voice, 'referencia': None if voice == BUILTIN else str(MOULDS / voice),
                         'modelo': q.get('modelo', 'v3'), 'decodificador': q.get('decodificador', 'ptbr'),
                         **{k: q.get(k, v) for k, v in DEFAULTS.items()}}
        write_json(PRESETS_JSON, presets)
        return {'nome': name, 'presets': presets}


class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    request_queue_size = 64


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('porta', nargs='?', type=int, default=8870)
    parser.add_argument('--pasta', help='another lab folder (default referencias/voz_lab of the main checkout)')
    args = parser.parse_args()
    if args.pasta:
        use_lab(args.pasta)
    seed_lab()
    server = Server(('127.0.0.1', args.porta), Handler)
    server.lines = story_lines()
    print(f'Bancada de voz: http://127.0.0.1:{args.porta}/  (pasta {LAB})', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
