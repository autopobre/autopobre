"""Build only approved game files into dist/. No dependencies beyond Python 3.10+.

By default the build is the main link's: without the multiplayer test room, the sound bench and the track editor.
Only the /dev/ address is built with --multiplayer, which brings them. --conta adds the accounts (sign in with Google),
only for dev.autopobre.com.br, whose /api/conta/ is the accounts server."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from publicacao import ROOT, PUBLIC_FILES, OPTIONAL_AUDIO, MULTIPLAYER, BANCADA, EDITOR, CONTA, DEV_PAGES, ROOM_SERVER, audio_manifest, contained_file, content_policy, security_headers


def build(multiplayer=False, conta=False):
    dist = ROOT / 'dist'
    # A previous build may be replaced, but unexpected files are never published or deleted.
    if dist.is_symlink() or (hasattr(dist, 'is_junction') and dist.is_junction()):
        raise ValueError('dist must be a regular directory')
    retired_files = {'assets/audio/race2.mp3', 'assets/texturas/asfalto_base_v1.png',
                     'assets/texturas/asfalto_diff_v2.jpg', 'assets/texturas/asfalto_nor_gl_v2.jpg', 'assets/texturas/asfalto_rough_v2.jpg', 'assets/texturas/asfalto_grao_v1.jpg',
                     'assets/abertura/abertura_stevan_opala99.png', 'assets/abertura/desclassificado_v1.png',
                     'assets/abertura/logo_auto_pobre_racing.png', 'assets/abertura/logo_auto_pobre_racing.webp', 'assets/branding/old_stock_preparada_v1.png',
                     'assets/piloto/referencia_frente.png', 'assets/fusca_v3.glb',
                     # The story's Antonio voices (edge-tts), retired when Bob's own voice became the only one (10-26).
                     'assets/historia/voz_interlagos_pt_antonio.mp3', 'assets/historia/voz_interlagos_pt_antonio.json',
                     'assets/historia/voz_interlagos_pt_antonio_rapido.mp3', 'assets/historia/voz_interlagos_pt_antonio_rapido.json'}
    expected = set(PUBLIC_FILES) | set(OPTIONAL_AUDIO) | retired_files | {'assets/audio/tracks.json', '_headers', '.nojekyll'}
    if dist.exists():
        for p in dist.rglob('*'):
            if p.is_symlink() or (hasattr(p, 'is_junction') and p.is_junction()):
                raise ValueError('dist contains a link')
            if p.is_file() and p.relative_to(dist).as_posix() not in expected:
                raise ValueError('dist contains an unexpected file; inspect it before building')
    payload = {out: contained_file(ROOT, src).read_bytes() for out, src in PUBLIC_FILES.items()
               if (multiplayer or out not in MULTIPLAYER + BANCADA + EDITOR) and (conta or out not in CONTA)}
    if not multiplayer:
        # main.js then never reads #desafio=NOME nor asks for multiplayer.js, which is not published.
        if payload['main.js'].count(b'const MULTIPLAYER=true;') != 1:
            raise ValueError('main.js: multiplayer switch not found; the build cannot leave the multiplayer out')
        payload['main.js'] = payload['main.js'].replace(b'const MULTIPLAYER=true;', b'const MULTIPLAYER=false;')
    if not conta:
        # main.js then never asks for conta.js nor /api/conta/, which only dev.autopobre.com.br has.
        if payload['main.js'].count(b'const CONTA=true;') != 1:
            raise ValueError('main.js: accounts switch not found; the build cannot leave the accounts out')
        payload['main.js'] = payload['main.js'].replace(b'const CONTA=true;', b'const CONTA=false;')
    tracks = audio_manifest()
    payload['assets/audio/tracks.json'] = json.dumps(tracks).encode('utf-8')
    for name in tracks:
        target = 'assets/audio/' + name
        payload[target] = contained_file(ROOT, OPTIONAL_AUDIO[target]).read_bytes()
    # One release tag prevents a cached old module from mixing with the new HUD/physics.
    version = hashlib.sha256(b''.join(payload[name] for name in sorted(payload) if Path(name).suffix in {'.js', '.css', '.html'})).hexdigest()[:12]
    module_import = re.compile(r'''((?:from\s*|import\s*\(\s*|import\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?[^'"]*)?(['"])''')
    for name in payload:
        if name.endswith('.js'):
            source = payload[name].decode('utf-8')
            payload[name] = module_import.sub(lambda m: m[1] + m[2] + '?v=' + version + m[3], source).encode('utf-8')
    html = payload['index.html'].decode('utf-8').replace('./node_modules/three/', './vendor/three/')
    html = re.sub(r'''((?:src|href)=["'][^"'?]+\.(?:js|css))(?:\?[^"']*)?(["'])''', lambda m: m[1] + '?v=' + version + m[2], html)
    policy = content_policy(html, multiplayer=multiplayer)
    html = html.replace('<link rel="icon"', '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n<meta name="referrer" content="no-referrer">\n<link rel="icon"', 1)
    payload['index.html'] = html.encode('utf-8')
    for page in DEV_PAGES:
        if page not in payload:
            continue
        # The /dev/ tool pages (sound bench, track editor) get the game's versioned script and its content policy
        # (no import map of their own).
        bench = payload[page].decode('utf-8')
        bench = re.sub(r'''((?:src|href)=["'][^"'?]+\.(?:js|css))(?:\?[^"']*)?(["'])''', lambda m: m[1] + '?v=' + version + m[2], bench)
        if bench.count('<link rel="icon"') != 1:
            raise ValueError(page + ': icon link not found for the content policy')
        bench = bench.replace('<link rel="icon"', '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n<meta name="referrer" content="no-referrer">\n<link rel="icon"', 1)
        payload[page] = bench.encode('utf-8')
    # Published, dados/ and exports/ sit beside index.html instead of one folder up.
    payload['main.js'] = payload['main.js'].replace(b'../dados/', b'./dados/').replace(b'../exports/interlagos_pista.glb', b'./exports/interlagos_pista.glb')
    if 'editor-tracado.js' in payload:
        payload['editor-tracado.js'] = payload['editor-tracado.js'].replace(b"'../dados/'", b"'./dados/'")
    # Fail closed on any other path that only resolves in the repository layout (an
    # uncorrected one fetches from the parent site: the /dev/ build read the main link's files).
    for name, data in payload.items():
        if name.endswith('.js') and re.search(rb'''['"`]\.\./(?:dados|exports)/''', data):
            raise ValueError('Repository-only data path in public file: ' + name)
    payload['_headers'] = ('/*\n' + ''.join(f'  {k}: {v}\n' for k, v in security_headers(html, multiplayer=multiplayer).items())).encode()
    payload['.nojekyll'] = b''
    # Fail closed on the room server in a build without the multiplayer (the main link).
    for name, data in payload.items():
        if not multiplayer and ROOM_SERVER.removeprefix('wss://').encode() in data:
            raise ValueError('Multiplayer room server in a build without the multiplayer: ' + name)
    # Fail closed on accidental workstation paths or credential-like literals in text.
    private = re.compile(rb'(?i)(?<![A-Za-z0-9])[a-z]:[\\/]|/Users/|/home/|file://[A-Za-z/]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{24,}')
    for name, data in payload.items():
        if Path(name).suffix in {'.js', '.json', '.html', '.css', '.svg'} and private.search(data):
            raise ValueError('Private data candidate in public file: ' + name)
    dist.mkdir(exist_ok=True)
    # Remove only known retired assets, optional songs removed by the owner, or the multiplayer, sound
    # bench and track editor files of an earlier --multiplayer build, and the accounts of a --conta one.
    for name in set(OPTIONAL_AUDIO) | retired_files | set(MULTIPLAYER) | set(BANCADA) | set(EDITOR) | set(CONTA):
        if name not in payload and (dist / name).is_file():
            contained_file(dist, name).unlink()
    for name, data in payload.items():
        p = dist / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    report = {'files': len(payload), 'bytes': sum(map(len, payload.values())), 'multiplayer': multiplayer, 'conta': conta, 'artifacts': {
        name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in payload.items()
    }}
    audit = ROOT / '.audit-local'
    audit.mkdir(exist_ok=True)
    (audit / 'publicacao.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"dist/: {report['files']} files, {report['bytes'] / 1000000:.1f} MB, "
          f"{'with the multiplayer, the sound bench and the track editor (/dev/ only)' if multiplayer else 'without the multiplayer'}"
          f"{', with the accounts (dev.autopobre.com.br only)' if conta else ''}. Publish only this directory.")
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--multiplayer', action='store_true', help='include the multiplayer test room and the sound bench (only for /dev/)')
    parser.add_argument('--conta', action='store_true', help='include the accounts, sign in with Google (only for dev.autopobre.com.br)')
    args = parser.parse_args()
    build(args.multiplayer, args.conta)
