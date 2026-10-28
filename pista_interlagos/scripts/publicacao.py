"""Explicit public file boundary shared by the build and local preview server."""
from pathlib import Path
import base64
import hashlib
import re

ROOT = Path(__file__).resolve().parents[2]
GAME = 'pista_interlagos/teste/'
MODULES = (
    'pilot-profile.js', 'ai-records.js', 'ai-record-references.js',
    'car-condition.js', 'fuel.js', 'pit-lane.js', 'interlagos-pit.js', 'pit-building.js', 'pit-box99.js', 'pit-crew.js', 'pit-textures.js', 'on-foot.js', 'free-walk.js', 'selfie.js', 'selfie.css', 'pitstop.js', 'pitstop.css',
    'circuits.js', 'curvelo-data.js', 'curvelo-scene.js', 'open-circuit.js', 'track-clearance.js', 'track-verge.js', 'interlagos-stands.js',
    'cliff-edge.js', 'cliff-fall.js', 'cliff-scenery.js', 'far-terrain.js', 'explosion.js',
    'drift-arena.js', 'drift-arena-world.js', 'drift-score.js', 'drift-physics.js', 'drift-arena-ai.js', 'drift-arena-props.js', 'drift-arena-mode.js', 'drift-arena-scene.js', 'drift-arena-stadium.js', 'arena.css',
    'sea-water.js', 'street-walls.js', 'floripa-bridges.js', 'floripa-landmarks.js', 'minhocao-structures.js', 'minhocao-landmarks.js', 'pampulha-estadios.js', 'pampulha-igrejinha.js', 'pampulha-fauna.js', 'pampulha-guanabara.js', 'pampulha-niemeyer.js', 'pampulha-orla.js', 'pampulha-barragem.js', 'pampulha-parques.js', 'pampulha-pontes.js', 'pampulha-futebol.js', 'futebol.css', 'flying-saucer.js', 'branch-layout.js', 'branch-scenery.js', 'branch-lane.js', 'closed-roads.js',
    'city-map.js', 'city-crowd.js', 'city-buildings.js', 'city-streets.js', 'street-closures.js', 'city-cars.js', 'city-furniture.js', 'beira-mar.js', 'city-life.js', 'city-traffic.js', 'city-race.js',
    'race-results.js', 'race-results.css', 'lap-records.js', 'ghost-lap.js', 'ghost-car.js', 'driving-line.js', 'driving-line-view.js', 'championship.js', 'championship-board.js', 'pistas.css',
    'race-roster.js', 'car-select.js', 'look-select.js', 'visual-shop.js', 'pilot-look.js', 'visual.css', 'car-garage.js', 'car-livery.js', 'fusca.js', 'fusca-cockpit.js', 'carros.css',
    'car-finish.js', 'car-reflections.js',
    "sound-effects.js", "game-music.js", "recorded-music.js", "race-field.js", "crash-parts.js", "settings.js", "settings.css", 'graphics-settings.js', 'graphics-panel.js', 'debug-overlay.js', 'perf-probe.js', 'car-lod.js', 'graficos.css', "mobile-controls.js", "mobile.css", "gamepad-controls.js", "wheel-controls.js", "wheel-panel.js", "key-bindings.js", "keys-panel.js", "pad-bindings.js", "pad-panel.js", "manual-gearbox.js", "brake-reverse.js",
    'main.js', 'player-preferences.js', 'physics.js', 'camera-return.js', 'car-audio.js', 'engine-loops.js', 'tyre-sounds.js', 'car-horn.js', 'sound-tuning.js', 'car-openings.js', 'cockpit.js', 'cockpit-materials.js', 'cockpit-instruments.js', 'cockpit-rear.js', 'cockpit-equipment.js',
    'driver.js', 'driver-rig.js', 'driver-controls.js', 'driver-helmet.js', 'rival-driver.js', 'family-phone.js',
    'camera-rig.js',
    'immersive-mode.js', 'immersive-state.js', 'immersive-visuals.js', 'tow-truck.js', 'flying-parts.js', 'story-career.js', 'story-scene.js',
    'track-history.js', 'corner-callouts.js', 'historia.css', 'historias.js', 'historia-interlagos.js', 'historia-interlagos-en.js','interlagos-1940.js', 'historia-midia.js',
    'sun-light.js', 'car-shadow.js',
    'contact-shadows.js', 'car-wheels.js',
    'race-action.js', 'verge-vegetation.js', 'skid-marks.js', 'track-surface.js', 'tyre-smoke.js', 'speed-particles.js', 'kerb-contact.js', 'side-mirrors.js', 'brake-lights.js', 'sky.js', 'weather.js', 'rain-climate.js', 'headlights.js', 'rain.js', 'windscreen-rain.js', 'floodlights.js', 'cinematic.js', 'sponsors.js', 'trackside.js', 'trackside-flags.js', 'tv-camera.js', 'intro-cinematic.js', 'landscape.js', 'lake-contact.js', 'lake-waves.js', 'tree-contact.js',
    'style.css', 'immersive.css', 'abertura.css', 'menus.css', 'index.html', 'sobre.html',
    'favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
)
# The multiplayer test room is published only under /dev/ (preparar_publicacao.py --multiplayer);
# the main link's build leaves these files and the room server out. The local preview serves them.
MULTIPLAYER = ('multiplayer.js', 'multiplayer-chat.js', 'multiplayer-standings.js', 'chat-text.js', 'saguao.js', 'convites.css', 'multiplayer.css', 'net-room.js', 'net-cars.js', 'net-link.js', 'net-verify.js')
# The sound bench, where the pilots tune the engines by ear: also only under /dev/ (the same --multiplayer build).
BANCADA = ('bancada-som.html', 'bancada-som.js')
# The track editor, where a circuit's centreline is painted or corrected over reference images: also only under /dev/.
# Its reference folders (fontes/<circuito>/referencias/) stay on the user's machine; the page opens them from disk.
EDITOR = ('editor-tracado.html', 'editor-tracado.js')
DEV_PAGES = ('bancada-som.html', 'editor-tracado.html', 'admin.html')
# Accounts (sign in with Google): only the dev.autopobre.com.br build (preparar_publicacao.py --conta), where the
# accounts server (conta-cloudflare) answers /api/conta/. The main link and the old /dev/ folder leave them out.
# The admin panel (admin.html) too: it reads the same server, which answers only an admin account.
CONTA = ('conta.js', 'conta.css', 'recordes-online.js', 'comandos-volta.js', 'admin.html', 'admin.js', 'admin.css')
ASSETS = (
    'branding/old_stock_preparada_v1.jpg',
    'branding/patrocinio_omp_v1.webp', 'branding/patrocinio_rtj_v1.webp', 'branding/patrocinio_eletric_v1.webp',
    'branding/apoiadores_porta_motorista_v1.jpg', 'branding/apoiadores_porta_passageiro_v1.jpg',
    'circuitos/cascavel_solo.jpg', 'circuitos/piracicaba_solo.jpg', 'circuitos/chapeco_solo.jpg', 'circuitos/brasilia_solo.jpg',
    'circuitos/goiania_solo.jpg', 'circuitos/guaratiba_solo.jpg', 'circuitos/velocitta_solo.jpg',
    'circuitos/chapada_solo.jpg', 'circuitos/chapada_medio.jpg', 'circuitos/chapada_longe.jpg',
    'circuitos/chapada_medio_relevo.bin', 'circuitos/chapada_longe_relevo.bin',
    'circuitos/floripa_solo.jpg', 'circuitos/floripa_medio.jpg', 'circuitos/floripa_longe.jpg',
    'circuitos/floripa_medio_relevo.bin', 'circuitos/floripa_longe_relevo.bin',
    'circuitos/minhocao_solo.jpg',
    'circuitos/pampulha_solo.jpg', 'circuitos/pampulha_medio.jpg', 'circuitos/pampulha_longe.jpg',
    'circuitos/pampulha_medio_relevo.bin', 'circuitos/pampulha_longe_relevo.bin',
    'circuitos/floripa_cidade.png',
    'opala99_assinaturas_omp.glb', 'opala99_seiva_danilo.glb', 'fusca_v2.glb', 'caminhonete_v1.glb', 'guincho_v1.glb',
    'abertura/desclassificado_v1.jpg', 'abertura/abertura_stevan_opala99.jpg', 'abertura/logo_auto_pobre_racing_v2.webp',
    # The menus' type (menus.css): Roboto Condensed, Inter and Barlow Condensed, each under the SIL Open Font License.
    'fontes/roboto-condensed-400-700.woff2', 'fontes/inter-700-800.woff2', 'fontes/barlow-condensed-600i.woff2', 'fontes/barlow-condensed-800i.woff2',
    'fontes/OFL_roboto_condensed.txt', 'fontes/OFL_inter.txt', 'fontes/OFL_barlow.txt',
    'piloto/capacete_publico.jpg', 'piloto/referencia_frente.jpg',
    # A história de Interlagos (historia-midia.js): pictures from Wikimedia Commons, credits in historia/creditos.txt.
    'historia/historia_aerea_1.jpg', 'historia/historia_aerea_2.jpg', 'historia/historia_brabham1977_1.jpg', 'historia/historia_emerson_1.jpg',
    'historia/historia_erundina_1.jpg', 'historia/historia_hamilton_1.jpg', 'historia/historia_hellenice_1.jpg', 'historia/historia_hellenice_2.jpg',
    'historia/historia_mapa_1.jpg', 'historia/historia_mapa_2.jpg', 'historia/historia_nascimento_1.jpg', 'historia/historia_opala_1.jpg',
    'historia/historia_pace_1.jpg', 'historia/historia_pace_2.jpg', 'historia/historia_pilotos1936_1.jpg', 'historia/historia_planta1936_1.jpg',
    'historia/historia_reta_1.jpg', 'historia/historia_senna_1.jpg', 'historia/historia_ssenna_1.jpg', 'historia/creditos.txt',
    # Its narration read by a neural voice (scripts/gerar_narracao.py, edge-tts): the lines in one MP3, their times in the JSON.
    'historia/vozes_interlagos.json', 'historia/voz_interlagos_pt_bob.mp3', 'historia/voz_interlagos_pt_bob.json',
    'audio/car_trying_to_start.mp3',
    'audio/loops_m3.mp3', 'audio/loops_m3.json', 'audio/loops_fusca.mp3', 'audio/loops_fusca.json',
    'audio/lenta_opala.mp3', 'audio/lenta_opala.json', 'audio/lenta_fusca.mp3', 'audio/lenta_fusca.json',
    'audio/pneus_estalos.mp3', 'audio/pneus_estalos.json', 'audio/buzinas.mp3', 'audio/buzinas.json',
    # The copilot's corner names (corner-callouts.js, scripts/gerar_chamadas_curvas.py).
    'audio/curvas_interlagos.mp3', 'audio/curvas_interlagos.json',
    'audio/curvas_chapeco.mp3', 'audio/curvas_chapeco.json',
    'audio/curvas_chapecooval.mp3', 'audio/curvas_chapecooval.json',
    'audio/curvas_curvelo.mp3', 'audio/curvas_curvelo.json',
    'audio/curvas_cascavel.mp3', 'audio/curvas_cascavel.json',
    'audio/curvas_piracicaba.mp3', 'audio/curvas_piracicaba.json',
    'audio/curvas_brasilia.mp3', 'audio/curvas_brasilia.json',
    'audio/curvas_goiania.mp3', 'audio/curvas_goiania.json',
    'audio/curvas_guaratiba.mp3', 'audio/curvas_guaratiba.json',
    'audio/curvas_velocitta.mp3', 'audio/curvas_velocitta.json',
    'audio/curvas_chapada.mp3', 'audio/curvas_chapada.json',
    'audio/curvas_floripa.mp3', 'audio/curvas_floripa.json',
    'audio/curvas_minhocao.mp3', 'audio/curvas_minhocao.json',
    'audio/curvas_pampulha.mp3', 'audio/curvas_pampulha.json',
    'texturas/asfalto_diff_v3.jpg', 'texturas/asfalto_nor_gl_v3.jpg', 'texturas/asfalto_rough_v3.jpg', 'texturas/asfalto_grao_v2.jpg',
    'texturas/asfalto_creditos.txt', 'texturas/cockpit_faixa_invent.png',
    'texturas/grama_diff_v1.jpg', 'texturas/grama_nor_gl_v1.jpg', 'texturas/mato_diff_v1.jpg',
    'texturas/brita_diff_v1.jpg', 'texturas/concreto_diff_v1.jpg', 'texturas/terreno_creditos.txt',
    'texturas/interior/aluminio_escovado_diff.jpg', 'texturas/interior/aluminio_escovado_nor_gl.jpg',
    'texturas/interior/aluminio_escovado_rough.jpg', 'texturas/interior/borracha_diff.jpg',
    'texturas/interior/borracha_nor_gl.jpg', 'texturas/interior/camurca_diff.jpg',
    'texturas/interior/camurca_nor_gl.jpg', 'texturas/interior/camurca_rough.jpg',
    'texturas/interior/carbono_diff.jpg', 'texturas/interior/carbono_nor_gl.jpg',
    'texturas/interior/chapa_xadrez_diff.jpg', 'texturas/interior/chapa_xadrez_nor_gl.jpg',
    'texturas/interior/chapa_xadrez_rough.jpg', 'texturas/interior/couro_painel_diff.jpg',
    'texturas/interior/couro_painel_nor_gl.jpg', 'texturas/interior/couro_painel_rough.jpg', 'texturas/interior/creditos.txt',
)
# The car screen's strip: a picture of each car of both grids (scripts/gerar_miniaturas_carros.py), the 99 in both paints.
CAR_THUMBS = {
    'opala': ('99', '73', '00', '7', '64', '2', '19', '51', '93', '312', '70', '9', '74', '88', '42'),
    'fusca': ('20', '86', '77', '29', '18', '3', '33', '5', '99', '39', '11', '4', '9', '79', '49'),
}
ASSETS += tuple(f'carros/miniaturas/{model}_{number}.webp' for model, numbers in CAR_THUMBS.items() for number in numbers) + ('carros/miniaturas/opala_99_seiva.webp',)
# The track screen's picture of each circuit at the golden hour (scripts/gerar_fotos_pistas.py).
CIRCUIT_SCENES = ('interlagos', 'cascavel', 'piracicaba', 'chapeco', 'brasilia', 'goiania', 'guaratiba', 'velocitta', 'chapada', 'floripa', 'minhocao', 'pampulha', 'curvelo')
ASSETS += tuple(f'circuitos/cenas/{circuit}.webp' for circuit in CIRCUIT_SCENES)
THREE = (
    'build/three.module.js', 'build/three.core.js',
    'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/utils/SkeletonUtils.js',
    'LICENSE',
)
PUBLIC_FILES = {name: GAME + name for name in MODULES + MULTIPLAYER + BANCADA + EDITOR + CONTA}
PUBLIC_FILES.update({'assets/' + name: GAME + 'assets/' + name for name in ASSETS})
PUBLIC_FILES.update({'vendor/three/' + name: GAME + 'node_modules/three/' + name for name in THREE})
PUBLIC_FILES.update({
    'dados/pista.json': 'pista_interlagos/dados/pista.json',
    'dados/pista_cascavel.json': 'pista_interlagos/dados/pista_cascavel.json',
    'dados/pista_piracicaba.json': 'pista_interlagos/dados/pista_piracicaba.json',
    'dados/pista_chapeco.json': 'pista_interlagos/dados/pista_chapeco.json',
    'dados/pista_chapecooval.json': 'pista_interlagos/dados/pista_chapecooval.json',
    'dados/pista_brasilia.json': 'pista_interlagos/dados/pista_brasilia.json',
    'dados/pista_goiania.json': 'pista_interlagos/dados/pista_goiania.json',
    'dados/pista_guaratiba.json': 'pista_interlagos/dados/pista_guaratiba.json',
    'dados/pista_velocitta.json': 'pista_interlagos/dados/pista_velocitta.json',
    'dados/pista_chapada.json': 'pista_interlagos/dados/pista_chapada.json',
    'dados/pista_floripa.json': 'pista_interlagos/dados/pista_floripa.json',
    'dados/pista_minhocao.json': 'pista_interlagos/dados/pista_minhocao.json',
    'dados/pista_pampulha.json': 'pista_interlagos/dados/pista_pampulha.json',
    'exports/interlagos_pista.glb': 'pista_interlagos/exports/interlagos_pista.glb',
})
AUDIO_NAMES = ('intro.mp3', 'race.mp3', 'patrocinio.mp3', 'turbo.mp3', 'hojenaodeu.mp3', 'energia.mp3')
OPTIONAL_AUDIO = {'assets/audio/' + name: GAME + 'assets/audio/' + name for name in AUDIO_NAMES}


def audio_manifest():
    files = []
    for name in AUDIO_NAMES:
        path = ROOT / GAME / 'assets/audio' / name
        if path.exists():
            contained_file(ROOT, GAME + 'assets/audio/' + name)
            files.append(name)
    return files


def contained_file(root, relative):
    """No symlinks/junctions, parent traversal or files outside the selected root."""
    root = root.resolve()
    parts = Path(relative).parts
    if Path(relative).is_absolute() or '..' in parts:
        raise ValueError('Invalid public path')
    path = root
    for part in parts:
        path /= part
        if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
            raise ValueError('Links are not public files')
    if not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError('Public file is missing or outside its root')
    return path


# The multiplayer room server (sala-cloudflare), the page's only connection outside its own origin;
# the same address as ROOM_SERVER in teste/net-link.js. The local preview also allows wrangler dev.
# A build without the multiplayer connects to nothing outside its origin.
ROOM_SERVER = 'wss://sala.autopobre.com.br'
LOCAL_ROOM_SERVER = 'ws://127.0.0.1:8787'


def content_policy(html, dev=False, multiplayer=True):
    inline = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    if not inline:
        raise ValueError('Missing import map')
    digest = base64.b64encode(hashlib.sha256(inline[1].encode()).digest()).decode()
    return (
        "default-src 'self'; "
        f"script-src 'self' 'sha256-{digest}'; "
        "script-src-attr 'none'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        f"connect-src 'self' blob:{' ' + ROOM_SERVER if multiplayer else ''}{' ' + LOCAL_ROOM_SERVER if dev else ''}; "
        "font-src 'self'; media-src 'self' blob:; worker-src 'none'; "
        "object-src 'none'; base-uri 'none'; form-action 'none'"
    )


def security_headers(html, dev=False, multiplayer=True):
    return {
        'Content-Security-Policy': content_policy(html, dev, multiplayer) + "; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    }
