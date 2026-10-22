"""Pasta de referencias de Guaratiba para o editor de traçado (fontes/guaratiba/referencias/, fora do repositorio).

    python referencias_guaratiba.py

O autodromo ainda e projeto e nao tem planta publicada: a unica fonte do traçado e o render aereo oficial (Populous /
Driven International). A camera dele foi achada em 22/10/2026 casando, no render, a Av. Dom Joao VI (OSM), a borda
arredondada da mata a nordeste do terreno (dica da equipe: foi ela que fez todas as tentativas convergirem) e as duas
retas paralelas, sobre a ortofoto de 2025 do IPP; uma mistura meio a meio da ortofoto projetada com o render casa a mata,
o Rio Piraque, a avenida e o bairro. Com ela o render vira a vista de cima (homografia do chao, z = 0).

Baixa o render, o limite da Operacao Urbana Consorciada do Autodromo (setor I) e a ortofoto 2025 do IPP e grava
camadas.json com: o render visto de cima, a ortofoto, o render original em perspectiva e as linhas de apoio. Imagens
so para conferencia local; nao distribuir.
"""
import json
from io import BytesIO

import numpy as np
import requests
from PIL import Image

from config import pasta_fontes

RENDER = 'https://driven-international.com/wp-content/uploads/2026/01/POPULOUS-Rio-MSP-Render-AERIAL-scaled.png'
IPP = 'https://pgeo3.rio.rj.gov.br/arcgis/rest/services'
OUC = IPP + '/Urbanismo/IU_Operacoes_urbanas_temp/MapServer/59/query'
ORTO = IPP + '/Imagens/Mosaico_2025/ImageServer/exportImage'
AGENTE = {'User-Agent': 'autopobre-circuitos/1.0'}
# Camera ajustada (UTM 23S): ponto mirado no chao (cx, cy), distancia ate ele, inclinacao para baixo, rumo (0 = norte,
# horario), rolagem e abertura horizontal, em graus, para o render de 2560 x 1027 px.
CAMERA = {'cx': 641954.797, 'cy': 7456942.092, 'dist': 1679.976, 'pitch': 23.958, 'yaw': 22.195, 'roll': 1.799, 'fov': 58.086}
W, H = 2560, 1027
ORIGEM = np.array([641950.0, 7457050.0])
# Vista de cima: caixa UTM e metros por pixel.
X0, Y0, X1, Y1, RES = 641400, 7456350, 642550, 7457800, 0.5


def homografia(c):
    """(X - origem, Y - origem, 1) no chao -> pixel do render."""
    yaw, pitch, roll = np.radians([c['yaw'], c['pitch'], c['roll']])
    f = (W / 2) / np.tan(np.radians(c['fov'] / 2))
    fwd = np.array([np.sin(yaw) * np.cos(pitch), np.cos(yaw) * np.cos(pitch), -np.sin(pitch)])
    right = np.array([np.cos(yaw), -np.sin(yaw), 0.0])
    up = np.cross(right, fwd)
    cr, sr = np.cos(roll), np.sin(roll)
    right, up = cr * right + sr * up, -sr * right + cr * up
    cam = np.array([c['cx'], c['cy'], 0.0]) - fwd * c['dist']
    R = np.vstack([right, -up, fwd])
    t = -R @ (cam - np.r_[ORIGEM, 0])
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    Hm = K @ np.c_[R[:, 0], R[:, 1], t]
    return Hm / Hm[2, 2]


def vista_de_cima(render, Hm):
    """O render no chao: cada pixel da caixa UTM busca o seu ponto no render (bilinear)."""
    w, h = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
    X, Y = np.meshgrid(X0 + (np.arange(w) + .5) * RES - ORIGEM[0], Y1 - (np.arange(h) + .5) * RES - ORIGEM[1])
    q = np.tensordot(Hm, np.stack([X, Y, np.ones_like(X)]), axes=1)
    u, v = q[0] / q[2] - .5, q[1] / q[2] - .5
    a = np.asarray(render, np.float32)
    u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = (u - u0)[..., None], (v - v0)[..., None]
    dentro = (q[2] > 0) & (u0 >= 0) & (v0 >= 0) & (u0 < W - 1) & (v0 < H - 1)
    u0, v0 = np.clip(u0, 0, W - 2), np.clip(v0, 0, H - 2)
    out = (a[v0, u0] * (1 - fu) * (1 - fv) + a[v0, u0 + 1] * fu * (1 - fv) + a[v0 + 1, u0] * (1 - fu) * fv
           + a[v0 + 1, u0 + 1] * fu * fv)
    out[~dentro] = 0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    destino = pasta_fontes('guaratiba') / 'referencias'
    destino.mkdir(exist_ok=True)
    sess = requests.Session()
    sess.headers.update(AGENTE)
    render = Image.open(BytesIO(sess.get(RENDER, timeout=120).content)).convert('RGB')
    if render.size != (W, H):
        raise SystemExit(f'o render mudou de tamanho ({render.size}); a camera e para {W}x{H}')
    render.save(destino / 'render.jpg', quality=93)
    Hm = homografia(CAMERA)
    vista_de_cima(render, Hm).save(destino / 'planta_render.jpg', quality=88)
    w, h = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
    r = sess.get(ORTO, timeout=300, params={'bbox': f'{X0},{Y0},{X1},{Y1}', 'bboxSR': 31983, 'imageSR': 31983,
                                             'size': f'{w},{h}', 'format': 'jpg', 'f': 'image'})
    Image.open(BytesIO(r.content)).convert('RGB').save(destino / 'planta_orto2025.jpg', quality=85)
    ouc = sess.get(OUC, timeout=120, params={'where': "nome like '%Autódromo%' and setor='I'", 'outFields': 'setor',
                                             'returnGeometry': 'true', 'outSR': 31983, 'f': 'json'}).json()
    anel = np.array(ouc['features'][0]['geometry']['rings'][0])
    linhas = []
    if (destino / 'eixo_utm_v3.json').exists():
        v3 = np.array(json.loads((destino / 'eixo_utm_v3.json').read_text())['eixo'])
        linhas.append({'nome': 'Eixo v3 do Claude', 'pontos': np.round(v3[::2], 1).tolist(), 'fechada': True, 'cor': '#ff4fd8',
                       'visivel': False})
    linhas.append({'nome': 'Limite oficial do terreno (OUC, Setor I)', 'pontos': np.round(anel[::max(1, len(anel) // 400)], 1).tolist(),
                   'fechada': True, 'cor': '#7dff8a', 'editavel': False})
    cfg = {'formato': 'autopobre-referencias-v1', 'circuito': 'guaratiba', 'nome': 'Autódromo Parque de Guaratiba',
           'sistema': 'utm', 'epsg': 31983, 'oficial_m': 4710,
           'aviso': 'Render da Populous/Driven International e ortofoto do IPP: so conferencia local; nao distribuir.',
           'camera': CAMERA,
           'camadas': [
               {'nome': 'Render do projeto, vista de cima', 'arquivo': 'planta_render.jpg', 'tipo': 'planta', 'x0': X0, 'y1': Y1,
                'res': RES, 'fonte': 'Populous/Driven International (2025), retificado pela camera ajustada'},
               {'nome': 'Ortofoto 2025 (IPP, terreno hoje)', 'arquivo': 'planta_orto2025.jpg', 'tipo': 'planta', 'x0': X0, 'y1': Y1,
                'res': RES, 'opacidade': .5, 'visivel': False, 'fonte': 'pgeo3.rio.rj.gov.br Imagens/Mosaico_2025'},
               {'nome': 'Render original', 'arquivo': 'render.jpg', 'tipo': 'perspectiva', 'origem': ORIGEM.tolist(),
                'H': Hm.tolist(), 'fonte': RENDER},
           ],
           'linhas': linhas}
    (destino / 'camadas.json').write_text(json.dumps(cfg, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'referencias de Guaratiba em {destino}: 3 imagens, {len(linhas)} linha(s)')


if __name__ == '__main__':
    main()
