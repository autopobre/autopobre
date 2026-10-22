"""Monta a pasta de referencias de um circuito para o editor de traçado (teste/editor-tracado.html).

    python pacote_referencia.py cascavel        (ou: todos)

Saida em fontes/<circuito>/referencias/ (fora do repositorio e do site): camadas.json e as imagens, vistas de cima e
reprojetadas em UTM do circuito (canto noroeste e metros por pixel). Usa o que ja esta em fontes/<circuito>/:
  referencia_esri.jpg/.json   mosaico Esri World Imagery (baixar_fontes.py --referencia), em Web Mercator
  referencia_orto.jpg/.json   ortofoto local ja em UTM (Goiania, 2016)
  eixo_refinado.json          eixo medido (refinar_eixo.py), como linha de apoio
e, quando a config do circuito traz `ortofotos_wms` (Floripa: GeoFloripa 2016 e 2023), baixa essas ortofotos da
prefeitura em blocos, na caixa da volta do jogo mais 150 m, no UTM do circuito e na resolucao pedida.
As imagens servem so para conferir e medir no proprio computador; nao se distribuem.
"""
import json
import math
import sys
import time
from io import BytesIO

import numpy as np
import requests
from PIL import Image
from projecao import Transformer
from compat_scipy import map_coordinates

from config import CIRCUITOS, DADOS, pasta_fontes

FORMATO = 'autopobre-referencias-v1'
LADO_MAX = 4096
BLOCO = 2000                   # px por pedido de WMS
MARGEM_VOLTA = 150.0           # m alem da caixa da volta


def caixa_da_volta(nome):
    """Caixa UTM da volta e do pit lane do arquivo da pista do jogo (origem + amostras / escala)."""
    d = json.loads((DADOS / f'pista_{nome}.json').read_text(encoding='utf-8'))
    m = d['meta']
    o, k = m['origin_utm'], m.get('horizontal_scale_to_nominal') or 1
    c = d['columns']
    xy = [(r[c.index('x_east_m')], r[c.index('y_north_m')]) for r in d['samples']]
    if d.get('pit'):
        pc = d['pit']['columns']
        xy += [(r[pc.index('x')], r[pc.index('y')]) for r in d['pit']['samples']]
    P = np.array(xy) / k + np.array(o[:2])
    return (*(P.min(0) - MARGEM_VOLTA), *(P.max(0) + MARGEM_VOLTA))


def ortofoto_wms(o, epsg, caixa):
    """Mosaico de um WMS (GetMap 1.1.1, JPEG) na caixa UTM, a o['res'] m/px, em blocos de BLOCO px."""
    x0, y0, x1, y1 = caixa
    res = o['res']
    w, h = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    img = Image.new('RGB', (w, h))
    sess = requests.Session()
    sess.headers.update({'User-Agent': 'autopobre-circuitos/1.0'})
    for j in range(0, h, BLOCO):
        for i in range(0, w, BLOCO):
            bw, bh = min(BLOCO, w - i), min(BLOCO, h - j)
            bx0, by1 = x0 + i * res, y1 - j * res
            params = {'service': 'WMS', 'version': '1.1.1', 'request': 'GetMap', 'layers': o['camada'], 'styles': '',
                      'srs': f'EPSG:{epsg}', 'bbox': f'{bx0},{by1 - bh * res},{bx0 + bw * res},{by1}',
                      'width': bw, 'height': bh, 'format': 'image/jpeg'}
            for tentativa in range(4):
                try:
                    r = sess.get(o['url'], params=params, timeout=300)
                    if r.ok and r.content[:2] == b'\xff\xd8':
                        break
                except requests.RequestException:
                    pass
                time.sleep(3 + 4 * tentativa)
            else:
                raise SystemExit(f'{o["camada"]}: bloco {i},{j} falhou')
            img.paste(Image.open(BytesIO(r.content)).convert('RGB'), (i, j))
    return img, x0, y1, res


def preencher_vazios(img, outra, area_min_m2=1500):
    """Onde o voo nao cobriu (grandes areas brancas: o mar entre a ilha e o continente na de 2016 de Floripa), a ortofoto
    seguinte da lista, na mesma caixa. Telhados brancos sao pequenos e ficam."""
    from scipy import ndimage
    a = np.asarray(img).copy()
    branco = (a.min(axis=2) > 242)
    f = 5                                   # mascara a 1 m (0,2 m x 5) para rotular depressa
    h, w = branco.shape[0] // f * f, branco.shape[1] // f * f
    grosso = branco[:h, :w].reshape(h // f, f, w // f, f).all(axis=(1, 3))
    rotulos, n = ndimage.label(grosso)
    if not n:
        return img
    tamanhos = ndimage.sum(grosso, rotulos, index=np.arange(1, n + 1))
    grandes = np.isin(rotulos, 1 + np.flatnonzero(tamanhos * (f * .2) ** 2 >= area_min_m2))
    grandes = ndimage.binary_dilation(grandes, iterations=2)
    vazio = np.zeros_like(branco)
    vazio[:h, :w] = np.repeat(np.repeat(grandes, f, 0), f, 1)
    vazio &= a.min(axis=2) > 200
    b = np.asarray(outra.resize(img.size, Image.BILINEAR))
    a[vazio] = b[vazio]
    print(f'  {vazio.mean():.1%} da imagem preenchida com a ortofoto seguinte')
    return Image.fromarray(a)


def esri_em_utm(pasta, epsg):
    meta = json.loads((pasta / 'referencia_esri.json').read_text())
    img = np.asarray(Image.open(pasta / 'referencia_esri.jpg').convert('RGB')).astype(np.float32)
    z, tx0, ty0 = meta['z'], meta['tx0'], meta['ty0']
    k = 2 ** z
    h, w = img.shape[:2]
    # Cantos do mosaico em lon/lat -> caixa UTM interna.
    def lonlat(col, row):
        x, y = tx0 + col / 256, ty0 + row / 256
        lon = x / k * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / k))))
        return lon, lat
    para = Transformer.from_crs(4326, epsg, always_xy=True)
    cantos = [para.transform(*lonlat(c, r)) for c, r in ((0, 0), (w, 0), (0, h), (w, h))]
    xs, ys = [p[0] for p in cantos], [p[1] for p in cantos]
    x0, x1 = sorted(xs)[1], sorted(xs)[2]
    y0, y1 = sorted(ys)[1], sorted(ys)[2]
    lat_meio = lonlat(w / 2, h / 2)[1]
    res = max(40075016.7 / k / 256 * math.cos(math.radians(lat_meio)), (x1 - x0) / LADO_MAX, (y1 - y0) / LADO_MAX)
    res = round(res, 3)
    nx, ny = int((x1 - x0) / res), int((y1 - y0) / res)
    X, Y = np.meshgrid(x0 + (np.arange(nx) + .5) * res, y1 - (np.arange(ny) + .5) * res)
    lon, lat = Transformer.from_crs(epsg, 4326, always_xy=True).transform(X, Y)
    col = ((np.asarray(lon) + 180) / 360 * k - tx0) * 256 - .5
    row = ((1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * k - ty0) * 256 - .5
    out = np.stack([map_coordinates(img[..., b], [row, col], order=1, mode='nearest') for b in range(3)], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), x0, y1, res


def montar(nome):
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    destino = pasta / 'referencias'
    destino.mkdir(exist_ok=True)
    epsg = c['epsg']
    camadas, linhas = [], []
    if (pasta / 'referencia_orto.json').exists():
        meta = json.loads((pasta / 'referencia_orto.json').read_text())
        if meta.get('epsg') == epsg:
            img = Image.open(pasta / 'referencia_orto.jpg').convert('RGB')
            res = meta['px']
            if max(img.size) > LADO_MAX:
                f = LADO_MAX / max(img.size)
                img = img.resize((round(img.width * f), round(img.height * f)), Image.LANCZOS)
                res = meta['px'] / f
            img.save(destino / 'ortofoto.jpg', quality=86)
            camadas.append({'nome': 'Ortofoto local', 'arquivo': 'ortofoto.jpg', 'tipo': 'planta',
                            'x0': meta['x0'], 'y1': meta['y1'], 'res': res, 'fonte': meta.get('fonte')})
    wms = [ortofoto_wms(o, epsg, caixa_da_volta(nome)) for o in c.get('ortofotos_wms', [])]
    for k, (o, (img, x0, y1, res)) in enumerate(zip(c.get('ortofotos_wms', []), wms)):
        if k + 1 < len(wms):
            img = preencher_vazios(img, wms[k + 1][0])
        arquivo = f'ortofoto_wms_{k + 1}.jpg'
        img.save(destino / arquivo, quality=88)
        print(f'  {o["nome"]}: {img.width}x{img.height} px a {res} m')
        camadas.append({'nome': o['nome'], 'arquivo': arquivo, 'tipo': 'planta', 'x0': x0, 'y1': y1, 'res': res,
                        'visivel': not camadas, 'fonte': f'{o["url"]} {o["camada"]}'})
    if (pasta / 'referencia_esri.json').exists():
        img, x0, y1, res = esri_em_utm(pasta, epsg)
        img.save(destino / 'esri.jpg', quality=86)
        camadas.append({'nome': 'Esri World Imagery', 'arquivo': 'esri.jpg', 'tipo': 'planta', 'x0': x0, 'y1': y1, 'res': res,
                        'visivel': not camadas})
    if (pasta / 'eixo_refinado.json').exists():
        eixo = json.loads((pasta / 'eixo_refinado.json').read_text(encoding='utf-8'))
        pts = np.round(np.array(eixo['eixo'])[::2], 2).tolist()
        linhas.append({'nome': 'Eixo medido (refinar_eixo)', 'pontos': pts, 'fechada': True, 'cor': '#ff4fd8', 'visivel': False})
    cfg = {'formato': FORMATO, 'circuito': nome, 'nome': c['nome'], 'sistema': 'utm', 'epsg': epsg,
           'oficial_m': c.get('extensao_m'), 'aviso': 'Imagens so para conferencia local; nao distribuir.',
           'camadas': camadas, 'linhas': linhas}
    (destino / 'camadas.json').write_text(json.dumps(cfg, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{nome}: {len(camadas)} imagem(ns), {len(linhas)} linha(s) -> {destino}')


if __name__ == '__main__':
    alvo = sys.argv[1]
    for nome in (CIRCUITOS if alvo == 'todos' else [alvo]):
        if CIRCUITOS[nome].get('referencias_proprias'):
            continue          # pasta montada pelo gerador do proprio circuito (Guaratiba)
        montar(nome)
