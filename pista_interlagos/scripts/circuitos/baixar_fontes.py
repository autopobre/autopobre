"""Baixa as fontes abertas de um circuito novo para fontes/<circuito>/.

    python baixar_fontes.py cascavel [--referencia]

- OpenStreetMap (Overpass): tracado (highway=raceway), predios, vias, uso do solo.
- ANADEM v1 (ANA/UFRGS): modelo digital de TERRENO de 30 m, sem o vies da vegetacao.
- Copernicus GLO-30 (ESA): modelo de SUPERFICIE de 30 m, so para comparacao.
- ESA WorldCover 2021 v200: cobertura do solo de 10 m (arvores, campo, construido, agua).
- Sentinel-2 L2A (ESA, via Earth Search/AWS): a cena mais recente sem nuvens, cor real de 10 m.
- Microsoft Global ML Building Footprints (ODbL): pegadas de edificacoes detectadas em
  imagens (versao 2026-02-03), onde o OSM ainda nao mapeou as construcoes.
- Geoportal do DF (IDE/DF, SEDUH), onde o circuito pede (Brasilia): o MDT de 1 m pelo servico de
  perfis, edificacoes do cadastro territorial com altura, arvores isoladas e massas arboreas;
  `--idedf` baixa so essa parte.
- Mapa Facil da Prefeitura de Goiania (SIGGO), onde o circuito pede: curvas de nivel de 5 m (com o
  ANADEM, viram o modelo do terreno mdt_goiania.tif), equipamentos do autodromo, vegetacao, pavimentos
  do cadastro e os edificios em altura da cidade; `--goiania` baixa so essa parte.
- --referencia: mosaico de imagem aerea Esri World Imagery, so para conferencia visual
  local (nao entra no jogo nem no pacote publico).

Os rasters sao lidos por janela (COG com requisicoes parciais), sem baixar os
arquivos inteiros. Requer numpy, requests, pillow e rasterio, ou tifffile quando o rasterio nao
carrega (geo_io.py).
"""
import json
import math
import sys
import time
from datetime import date, timedelta
from io import BytesIO

import numpy as np
import requests
from PIL import Image

import geo_io
from config import CIRCUITOS, pasta_fontes

AGENTE = {'User-Agent': 'autopobre-circuitos/1.0 (jogo Auto-Pobre Racing)'}
OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']


def caixa(c, margem_m=0.0):
    lat, lon = c['centro']
    r = c['raio_m'] + margem_m
    dlat = r / 111320.0
    dlon = r / (111320.0 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat      # oeste, sul, leste, norte


def overpass(c, destino):
    w, s, e, n = caixa(c)
    q = f"""[out:json][timeout:240];
(way({s},{w},{n},{e});relation["type"="multipolygon"]({s},{w},{n},{e}););
(._;>;);out body;"""
    for url in OVERPASS:
        try:
            r = requests.post(url, data={'data': q}, headers=AGENTE, timeout=300)
            if r.ok and r.text.lstrip().startswith('{'):
                dados = r.json()
                destino.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
                print(f'OSM: {len(dados["elements"])} elementos ({url}, base {dados["osm3s"]["timestamp_osm_base"]})')
                return dados['osm3s']['timestamp_osm_base']
            print(f'OSM: {url} respondeu {r.status_code}')
        except requests.RequestException as err:
            print(f'OSM: {url} falhou: {err}')
    # Sem Overpass: a API do OSM entrega a mesma caixa (nos, vias que tocam nela e os nos
    # delas, relacoes) no mesmo formato JSON; aceita caixas de ate 0,25 grau quadrado.
    r = requests.get('https://api.openstreetmap.org/api/0.6/map.json', params={'bbox': f'{w},{s},{e},{n}'},
                     headers=AGENTE, timeout=300)
    if r.ok:
        dados = r.json()
        destino.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
        base = max(el.get('timestamp', '') for el in dados['elements'])
        print(f'OSM: {len(dados["elements"])} elementos (API 0.6, edicao mais recente {base})')
        return base
    raise SystemExit('Nenhum servidor Overpass respondeu.')


def recorte(url, destino, bounds_ll, descricao):
    """Recorta a janela lon/lat de um COG remoto e grava em GeoTIFF local."""
    g = geo_io.recortar(url, bounds_ll)
    geo_io.gravar(destino, g.a, g.transform, g.epsg, g.nodata)
    print(f'{descricao}: {g.a.shape[2]}x{g.a.shape[1]} px -> {destino.name}')
    return g.a


def sentinel2(c, pasta):
    """Cena Sentinel-2 L2A mais recente com a area do circuito sem nuvem."""
    w, s, e, n = caixa(c)
    fim = date.today()
    busca = {'collections': ['sentinel-2-l2a'], 'bbox': [w, s, e, n],
             'datetime': f'{fim - timedelta(days=400)}T00:00:00Z/{fim}T23:59:59Z',
             'query': {'eo:cloud_cover': {'lt': 20}}, 'limit': 40,
             'sortby': [{'field': 'properties.datetime', 'direction': 'desc'}]}
    r = requests.post('https://earth-search.aws.element84.com/v1/search', json=busca, headers=AGENTE, timeout=120)
    r.raise_for_status()
    cenas = r.json()['features']
    print(f'Sentinel-2: {len(cenas)} cenas candidatas')
    for cena in cenas:
        scl_url = cena['assets']['scl']['href']
        try:
            scl = geo_io.recortar(scl_url, (w, s, e, n), preencher=0).banda(1)
        except Exception as err:          # noqa: BLE001 - cena indisponivel, tenta a proxima
            print(f'  {cena["id"]}: SCL indisponivel ({err})')
            continue
        validos = scl > 0
        nuvem = np.isin(scl, [3, 8, 9, 10])   # sombra, nuvem media/alta, cirrus
        if validos.mean() < .99:
            print(f'  {cena["id"]}: fora da faixa imageada')
            continue
        frac = nuvem[validos].mean()
        print(f'  {cena["id"]}: nuvem na area {frac:.1%}')
        if frac > .002:
            continue
        rgb = recorte(cena['assets']['visual']['href'], pasta / 'sentinel2_rgb.tif', (w, s, e, n), 'Sentinel-2 cor real')
        info = {'id': cena['id'], 'datetime': cena['properties']['datetime'],
                'cloud_cover_tile': cena['properties'].get('eo:cloud_cover'), 'nuvem_area': float(frac)}
        (pasta / 'sentinel2.json').write_text(json.dumps(info, indent=1), encoding='utf-8')
        return info
    raise SystemExit('Nenhuma cena Sentinel-2 limpa encontrada.')


def quadkey(lat, lon, z=9):
    x = int((lon + 180) / 360 * 2 ** z)
    sn = math.sin(math.radians(lat))
    y = int((.5 - math.log((1 + sn) / (1 - sn)) / (4 * math.pi)) * 2 ** z)
    return ''.join(str(((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1)) for i in range(z, 0, -1))


def microsoft_linhas(c, pasta, quadkeys=None):
    """Feicoes (uma por linha do arquivo) dos quadkeys (o do circuito, por padrao) no Microsoft Building
    Footprints. Os arquivos brutos ficam em fontes/<c>/microsoft/ para uma segunda leitura (o horizonte
    de Goiania)."""
    import csv
    import gzip
    cache = pasta / 'microsoft'
    cache.mkdir(exist_ok=True)
    indice = None
    for q in quadkeys or [quadkey(*c['centro'])]:
        lista = cache / f'{q}.json'
        if lista.exists():
            urls = json.loads(lista.read_text(encoding='utf-8'))
        else:
            indice = indice or requests.get('https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv',
                                            headers=AGENTE, timeout=180).text.splitlines()
            urls = [r['Url'] for r in csv.DictReader(indice) if r['Location'] == 'Brazil' and r['QuadKey'] == q]
            lista.write_text(json.dumps(urls), encoding='utf-8')
        for k, url in enumerate(urls):
            arq = cache / f'{q}_{k}.csv.gz'
            if not arq.exists():
                arq.write_bytes(requests.get(url, headers=AGENTE, timeout=600).content)
            for linha in gzip.decompress(arq.read_bytes()).decode('utf-8').splitlines():
                yield json.loads(linha)


def edificios_microsoft(c, pasta):
    """Pegadas de edificacoes da Microsoft no recorte do circuito (GeoJSON)."""
    q = quadkey(*c['centro'])
    w, s, e, n = caixa(c)
    feicoes = []
    for f in microsoft_linhas(c, pasta):
        anel = f['geometry']['coordinates'][0]
        lon = sum(p[0] for p in anel) / len(anel)
        lat = sum(p[1] for p in anel) / len(anel)
        if w <= lon <= e and s <= lat <= n:
            feicoes.append(f)
    destino = pasta / 'edificios_microsoft.geojson'
    destino.write_text(json.dumps({'type': 'FeatureCollection', 'features': feicoes}), encoding='utf-8')
    urls = json.loads((pasta / 'microsoft' / f'{q}.json').read_text(encoding='utf-8'))
    print(f'Microsoft Building Footprints: {len(feicoes)} edificacoes (quadkey {q})')
    return {'quadkey': q, 'urls': urls, 'edificacoes': len(feicoes)}


IDEDF = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services'


def idedf_camada(camada, caixa_utm, destino, descricao, campos='*', onde='1=1'):
    """Feicoes de uma camada do Geoportal do DF (ArcGIS REST da IDE/DF) dentro de uma caixa em
    SIRGAS 2000 / UTM 23S, em GeoJSON nas mesmas coordenadas, paginando de 1000 em 1000."""
    return arcgis_camada(f'{IDEDF}/{camada}', 31983, caixa_utm, destino, f'IDE/DF {descricao}', campos, onde)


def arcgis_camada(url_camada, epsg, caixa_utm, destino, descricao, campos='*', onde='1=1', ordem=None):
    """Feicoes de uma camada ArcGIS REST (MapServer/FeatureServer) dentro de uma caixa no CRS `epsg`,
    em GeoJSON nas mesmas coordenadas, paginando de 1000 em 1000. Algumas camadas so paginam com uma
    ordem explicita (`ordem`, o lote do cadastro de Goiania: OBJECTID)."""
    feicoes, inicio = [], 0
    while True:
        params = {'geometry': ','.join(f'{v:.1f}' for v in caixa_utm), 'geometryType': 'esriGeometryEnvelope',
                  'inSR': epsg, 'outSR': epsg, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': campos, 'where': onde,
                  'returnGeometry': 'true', 'resultOffset': inicio, 'resultRecordCount': 1000, 'f': 'geojson',
                  **({'orderByFields': ordem} if ordem else {})}
        for tentativa in range(4):
            try:
                r = requests.get(f'{url_camada}/query', params=params, headers=AGENTE, timeout=300)
                r.raise_for_status()
                lote = json.loads(r.content)          # bytes: UTF-8 (r.json() supunha Latin-1 em Goiania)
                if 'error' in lote:
                    raise ValueError(f'{url_camada}: {lote["error"]}')
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(3 + 4 * tentativa)
        feicoes += lote.get('features', [])
        if not lote.get('exceededTransferLimit') and len(lote.get('features', [])) < 1000:
            break
        inicio += len(lote['features'])
    destino.write_text(json.dumps({'type': 'FeatureCollection', 'crs': f'EPSG:{epsg}', 'features': feicoes},
                                  ensure_ascii=False), encoding='utf-8')
    print(f'{descricao}: {len(feicoes)} feicoes -> {destino.name}')
    return len(feicoes)


def mdt_perfis(centro_utm, meia, destino, passo=2.0, lote=24):
    """MDT de 1 m do DF amostrado numa grade de `passo` metros: o geoprocessamento Profile1m da
    IDE/DF devolve as cotas ao longo de linhas; cada linha da grade e um perfil leste-oeste. As
    curvas de nivel de 1 m (2016) vem inteiras do servidor (linhas de quilometros) e nao cabem
    numa consulta."""
    from affine import Affine
    url = f'{IDEDF}/Geoprocessing/Profile1m/GPServer/Profile/execute'
    cx, cy = centro_utm
    x0, x1 = cx - meia, cx + meia
    ys = np.arange(cy + meia, cy - meia - 1e-6, -passo)          # de norte para sul (linhas do raster)
    nx = int(round((x1 - x0) / passo)) + 1
    z = np.full((len(ys), nx), np.nan, np.float32)
    campos = [{'name': 'OID', 'type': 'esriFieldTypeOID'}, {'name': 'pid', 'type': 'esriFieldTypeInteger'}]
    for k0 in range(0, len(ys), lote):
        feicoes = [{'geometry': {'paths': [[[x0, float(y)], [x1, float(y)]]], 'spatialReference': {'wkid': 31983}},
                    'attributes': {'OID': k + 1, 'pid': k}} for k, y in enumerate(ys[k0:k0 + lote], k0)]
        dados = {'InputLineFeatures': json.dumps({'geometryType': 'esriGeometryPolyline', 'spatialReference': {'wkid': 31983},
                                                  'fields': campos, 'features': feicoes}),
                 'ProfileIDField': 'pid', 'DEMResolution': '1m', 'MaximumSampleDistance': passo,
                 'MaximumSampleDistanceUnits': 'Meters', 'returnZ': 'true', 'returnM': 'true', 'f': 'json'}
        for tentativa in range(5):
            try:
                r = requests.post(url, data=dados, headers=AGENTE, timeout=300)
                r.raise_for_status()
                saida = r.json()['results'][0]['value']['features']
                break
            except (requests.RequestException, ValueError, KeyError, IndexError):
                if tentativa == 4:
                    raise
                time.sleep(4 + 6 * tentativa)
        for f in saida:
            k = f['attributes']['pid']
            pts = np.array([q for caminho in f['geometry']['paths'] for q in caminho])
            col = np.clip(np.round((pts[:, 0] - x0) / passo).astype(int), 0, nx - 1)
            z[k, col] = pts[:, 2]
        if k0 // lote % 10 == 0:
            print(f'  perfis {min(k0 + lote, len(ys))}/{len(ys)}')
    vazio = np.isnan(z)
    if vazio.any():
        from rasterio.fill import fillnodata
        z = fillnodata(np.where(vazio, 0, z).astype(np.float32), mask=(~vazio).astype('uint8'), max_search_distance=20)
    geo_io.gravar(destino, z.astype(np.float32), Affine(passo, 0, x0 - passo / 2, 0, -passo, ys[0] + passo / 2), 31983)
    print(f'MDT 1 m do DF (Profile1m) em grade de {passo:.0f} m: {nx}x{len(ys)}, {vazio.mean():.2%} preenchido, '
          f'cotas {np.nanmin(z):.1f} a {np.nanmax(z):.1f} m -> {destino.name}')
    return {'servico': url, 'passo_m': passo, 'celulas': [nx, len(ys)], 'preenchido': float(vazio.mean()),
            'cota_min': float(np.nanmin(z)), 'cota_max': float(np.nanmax(z))}


def fontes_idedf(c, pasta):
    """Dados locais do Geoportal do DF (SEDUH, IDE/DF): o MDT de 1 m (pelo servico de perfis),
    edificacoes do cadastro territorial com altura aproximada, coberturas, arvores isoladas e
    massas arboreas da cartografia de 2016."""
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31983, always_xy=True)
    w, s, e, n = caixa(c)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    perto = (float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))
    info = {'servico': IDEDF, 'baixado_em': date.today().isoformat()}
    # A grade do terreno do jogo vai ~460 m alem da caixa da pista: 1.100 m em volta do centro cobrem.
    info['mdt'] = mdt_perfis(T.transform(c['centro'][1], c['centro'][0]), c.get('mdt_meia_m', 1100), pasta / 'mdt_idedf.tif')
    info['edificacoes'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/5', perto, pasta / 'idedf_edificacoes.geojson',
                                       'edificacoes (cadastro territorial)', 'ed_nome,ed_num_pav,ed_alt_aprox,ed_situacao,ed_area')
    info['coberturas'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/2', perto, pasta / 'idedf_coberturas.geojson',
                                      'coberturas', 'cb_area')
    info['arvores_isoladas'] = idedf_camada('Publico/IDEDF/MapServer/236', perto, pasta / 'idedf_arvores.geojson',
                                            'arvores isoladas (2016)', 'id')
    info['massa_arborea'] = idedf_camada('Publico/IDEDF/MapServer/237', perto, pasta / 'idedf_massa_arborea.geojson',
                                         'massas arboreas (2016)', 'id')
    # O horizonte da cidade: os predios altos ou grandes do cadastro ate 3,5 km do autodromo (superquadras,
    # Setor Noroeste, Eixo Monumental), no lugar dos telhados genericos do horizonte do jogo.
    w, s, e, n = caixa(c, 2000)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    longe = (float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))
    info['skyline'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/5', longe, pasta / 'idedf_skyline.geojson',
                                   'edificacoes do horizonte (>= 9 m ou >= 1.500 m2, 3,5 km)', 'ed_nome,ed_num_pav,ed_alt_aprox,ed_area',
                                   'ed_alt_aprox >= 9 OR ed_area >= 1500')
    (pasta / 'idedf.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


GYN = 'https://portalmapa.goiania.go.gov.br/servicogyn/rest/services/MapaServer'


def fontes_goiania(c, pasta):
    """Dados locais do Mapa Facil da Prefeitura de Goiania (SIGGO, ArcGIS REST, SIRGAS 2000 / UTM 22S):
    curvas de nivel de 5 m (levantamento da Topocart), os equipamentos do autodromo (pista, boxes,
    garagens, arquibancada, cronometragem), vegetacao e hidrografia, o numero de pavimentos dos lotes
    do cadastro imobiliario e os edificios em altura da cidade com o numero de pavimentos (o horizonte),
    com as pegadas da Microsoft que os contem."""
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31982, always_xy=True)

    def caixa_utm(margem):
        w, s, e, n = caixa(c, margem)
        xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
        return float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))
    perto, grande = caixa_utm(0), caixa_utm(400)
    info = {'servico': GYN, 'baixado_em': date.today().isoformat()}
    info['curvas_5m'] = arcgis_camada(f'{GYN}/Mapa_MeioAmbiente/MapServer/7', 31982, grande, pasta / 'goiania_curvas_5m.geojson',
                                      'Prefeitura: curvas de nivel de 5 m', 'NM_CNV')
    info['equipamentos'] = arcgis_camada(f'{GYN}/Mapa_PontosNotaveis/MapServer/2', 31982, perto, pasta / 'goiania_equipamentos.geojson',
                                         'Prefeitura: grandes equipamentos (autodromo)', 'nm_gre')
    info['vegetacao'] = arcgis_camada(f'{GYN}/Mapa_MeioAmbiente/MapServer/9', 31982, perto, pasta / 'goiania_vegetacao.geojson',
                                      'Prefeitura: vegetacao', 'tp_veg,nm_veg')
    info['hidrografia'] = arcgis_camada(f'{GYN}/Mapa_MeioAmbiente/MapServer/8', 31982, perto, pasta / 'goiania_hidrografia.geojson',
                                        'Prefeitura: hidrografia', 'tp_hid,nm_hid')
    # Do cadastro so o que vira altura: pavimentos, area construida e uso (nada do proprietario).
    info['lotes'] = arcgis_camada(f'{GYN}/Feature_Base/MapServer/3', 31982, perto, pasta / 'goiania_lotes.geojson',
                                  'Prefeitura: lotes do cadastro (pavimentos)', 'nrpaviment,areaedif,uso,tpedif1', ordem='OBJECTID')
    # Edificios em altura (4 pavimentos ou mais) ate ~9 km: Jardim Goias, Marista, Bueno, Centro.
    raio = c.get('horizonte_m', 9000)
    longe = caixa_utm(raio - c['raio_m'])
    torres = []
    for camada in (2, 3, 4, 5):
        destino = pasta / f'goiania_torres_{camada}.geojson'
        arcgis_camada(f'{GYN}/Mapa_Edificios/MapServer/{camada}', 31982, longe, destino,
                      f'Prefeitura: edificios em altura (camada {camada})', 'NM_EDI,NR_PAV,TL_APT')
        torres += json.loads(destino.read_text(encoding='utf-8'))['features']
        destino.unlink()
    (pasta / 'goiania_torres.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'crs': 'EPSG:31982', 'features': torres},
                                                             ensure_ascii=False), encoding='utf-8')
    info['torres'] = len(torres)
    info['torres_microsoft'] = pegadas_das_torres(c, pasta, torres)
    info['mdt'] = mdt_de_curvas(c, pasta)
    (pasta / 'goiania.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


GEOFLORIPA = 'https://geofloripa.pmf.sc.gov.br/geoserver'


def fontes_geofloripa(c, pasta):
    """Dados abertos da Prefeitura de Florianopolis (GeoFloripa, GeoServer sem login; GetCapabilities: Fees NONE,
    AccessConstraints NONE; credito PMF/SMPIU), em SIRGAS 2000 / UTM 22S:
    - MDT e MDS de 1 m do aerolevantamento do Estado (SDS, 2010-2012) pelo WCS: o terreno (sem as pontes; o mar a 0)
      e a superficie, cuja diferenca da a altura de cada edificacao;
    - pegadas das edificacoes do cadastro (2020), meios-fios (as bordas reais das vias, tambem nas pontes), batimetria
      da Marinha em faixas, parques e pracas, vegetacao e as curvas de nivel de 1 m (so para conferencia)."""
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31982, always_xy=True)
    w, s, e, n = caixa(c)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    x0, y0, x1, y1 = (round(v) for v in (min(xs), min(ys), max(xs), max(ys)))
    info = {'servico': GEOFLORIPA, 'baixado_em': date.today().isoformat(), 'caixa_utm': [x0, y0, x1, y1],
            'credito': 'Prefeitura Municipal de Florianópolis (PMF/SMPIU), GeoFloripa'}
    for cob, destino in (('Geoportal__MDT_SDS', 'mdt_floripa.tif'), ('Geoportal__MDS_SDS', 'mds_floripa.tif')):
        url = (f'{GEOFLORIPA}/ows?service=WCS&request=GetCoverage&version=2.0.1&CoverageId={cob}'
               f'&subset=E({x0},{x1})&subset=N({y0},{y1})&format=image/tiff')
        for tentativa in range(4):
            try:
                r = requests.get(url, headers=AGENTE, timeout=600)
                r.raise_for_status()
                if not r.content.startswith((b'II*', b'MM\x00*')):
                    raise ValueError(r.text[:300])
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(5 + 5 * tentativa)
        (pasta / destino).write_bytes(r.content)
        g = geo_io.ler(pasta / destino)
        print(f'GeoFloripa {cob}: {g.a.shape[2]}x{g.a.shape[1]} px -> {destino}')
        info[cob] = {'arquivo': destino, 'px': [int(g.a.shape[2]), int(g.a.shape[1])]}
    for camada, destino in (('cad_edificacao', 'geofloripa_edificacoes.geojson'), ('cad_meiofio', 'geofloripa_meiofio.geojson'),
                            ('batimetria_marinha', 'geofloripa_batimetria.geojson'), ('parques_pracas', 'geofloripa_parques.geojson'),
                            ('vegetacao', 'geofloripa_vegetacao.geojson'), ('alt_cn', 'geofloripa_curvas_1m.geojson')):
        url = (f'{GEOFLORIPA}/Geoportal/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=Geoportal:{camada}'
               f'&outputFormat=application/json&bbox={x0},{y0},{x1},{y1},urn:ogc:def:crs:EPSG::31982')
        for tentativa in range(4):
            try:
                r = requests.get(url, headers=AGENTE, timeout=600)
                r.raise_for_status()
                dados = json.loads(r.content)
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(5 + 5 * tentativa)
        (pasta / destino).write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
        print(f'GeoFloripa {camada}: {len(dados["features"])} feicoes -> {destino}')
        info[camada] = len(dados['features'])
    (pasta / 'geofloripa.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


GEOSAMPA_WFS = 'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs'
GEOSAMPA_ARQUIVO = 'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/downloadArquivo.aspx'


def geosampa_wfs(camada, w, s, e, n):
    """Feicoes de uma camada do GeoSampa (WFS sem login: Fees NONE, AccessConstraints NONE) numa caixa lon/lat, em
    SIRGAS 2000 / UTM 23S (o CRS nativo), paginadas."""
    feats, inicio, paginar = [], 0, True
    while True:
        params = {'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': f'geoportal:{camada}',
                  'outputFormat': 'application/json', 'srsName': 'EPSG:31983',
                  'bbox': f'{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326'}
        if paginar:
            params.update({'count': 5000, 'startIndex': inicio})
        for tentativa in range(4):
            try:
                r = requests.get(GEOSAMPA_WFS, params=params, headers=AGENTE, timeout=300)
                if r.status_code == 400 and paginar:
                    # Camadas sem ordem natural recusam a paginacao: uma pagina so, inteira.
                    break
                r.raise_for_status()
                dados = r.json()
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(5 + 5 * tentativa)
        if r.status_code == 400 and paginar:
            paginar, feats, inicio = False, [], 0
            continue
        feats += dados['features']
        if not paginar or len(dados['features']) < 5000:
            return {'type': 'FeatureCollection', 'features': feats}
        inicio += 5000


def geosampa_laz(produto, quadro, cache):
    """Um quadro (1:1000, ~540 x 580 m) do levantamento LiDAR de 2020 (zip com o LAZ), guardado em cache."""
    import zipfile
    from io import BytesIO
    destino = cache / produto / f'{quadro}.zip'
    if not destino.exists():
        destino.parent.mkdir(parents=True, exist_ok=True)
        url = f'{GEOSAMPA_ARQUIVO}?orig=DownloadMapaArticulacao&arq={produto}%5C{quadro}.zip&arqTipo=MAPA_ARTICULACAO'
        for tentativa in range(4):
            try:
                r = requests.get(url, headers=AGENTE, timeout=600)
                r.raise_for_status()
                if not r.content.startswith(b'PK'):
                    raise ValueError(r.text[:200])
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(5 + 5 * tentativa)
        destino.write_bytes(r.content)
    sys.modules.setdefault('pyproj', None)          # o laspy importa o pyproj (DLL bloqueada aqui); nao precisa dele
    import laspy
    with zipfile.ZipFile(destino) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith('.laz'))
        las = laspy.read(BytesIO(z.read(nome)))
    return np.asarray(las.x), np.asarray(las.y), np.asarray(las.z), np.asarray(las.classification)


def fontes_geosampa(c, pasta):
    """Dados abertos da Prefeitura de Sao Paulo (GeoSampa; WFS sem login, credito GeoSampa / PMSP), SIRGAS 2000 / UTM 23S:
    - MDT do levantamento LiDAR de 2020 (Optech Orion, ~10 pontos/m2, ~10 cm): os pontos de chao dos quadros 1:1000 que
      cobrem o terreno do jogo, numa grade de 1 m (media por celula); sob os predios, sem pontos, o chao e preenchido por
      convolucao normalizada (o vazio vira a media ponderada do chao em volta, em escalas crescentes);
    - MDS 2020 so ao longo do Minhocao (a caixa `caixa_mds` de config.py): o maior z por celula de 0,5 m, para medir o
      tabuleiro (o MDT nao tem pontos sob ele);
    - as quadras viarias editadas (os poligonos entre os meios-fios: as vias sao os vaos entre eles), os pontos cotados,
      as obras de arte (viadutos e tuneis), as pracas e largos e as arvores de rua cadastradas."""
    from projecao import Transformer
    from compat_scipy import gaussian_filter
    T = Transformer.from_crs(4326, 31983, always_xy=True)
    w, s, e, n = caixa(c, c.get('margem_geosampa_m', -500))
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    x0, y0, x1, y1 = (math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs)), math.ceil(max(ys)))
    info = {'servico': GEOSAMPA_WFS, 'arquivos': GEOSAMPA_ARQUIVO, 'baixado_em': date.today().isoformat(),
            'caixa_utm': [x0, y0, x1, y1], 'credito': 'GeoSampa / Prefeitura do Município de São Paulo'}
    cache = pasta / 'geosampa'
    if '--so-vetores' in sys.argv:
        info = json.loads((pasta / 'geosampa.json').read_text(encoding='utf-8')) if (pasta / 'geosampa.json').exists() else info
        return vetores_geosampa(pasta, info, w, s, e, n)
    quadros = geosampa_wfs('quadricula_folha_mdt_mds_2020', w, s, e, n)
    nomes = sorted({f['properties']['cd_quadricula'] for f in quadros['features']})
    (pasta / 'geosampa_quadros_2020.geojson').write_text(json.dumps(quadros, ensure_ascii=False), encoding='utf-8')
    # --- MDT 2020 em grade de 1 m.
    nx, ny = x1 - x0, y1 - y0
    soma = np.zeros((ny, nx))
    cont = np.zeros((ny, nx))
    for q in nomes:
        x, y, z, cl = geosampa_laz('MDT_2020', q, cache)
        i = np.floor(y1 - y).astype(int)
        j = np.floor(x - x0).astype(int)
        ok = (i >= 0) & (i < ny) & (j >= 0) & (j < nx)
        np.add.at(soma, (i[ok], j[ok]), z[ok])
        np.add.at(cont, (i[ok], j[ok]), 1)
        print(f'GeoSampa MDT 2020 {q}: {len(z)} pontos ({ok.mean():.0%} na caixa)')
    tem = cont > 0
    z = np.where(tem, soma / np.maximum(cont, 1), 0.0)
    cheio = z.copy()
    falta = ~tem
    for sigma in (2, 4, 8, 16, 32, 64):
        if not falta.any():
            break
        num = gaussian_filter(np.where(tem, z, 0.0), sigma)
        den = gaussian_filter(tem.astype(float), sigma)
        preenche = falta & (den > 1e-3)
        cheio[preenche] = num[preenche] / den[preenche]
        falta &= ~preenche
    np.savez_compressed(pasta / 'mdt_geosampa_1m.npz', z=cheio.astype(np.float32), medido=tem, x0=x0, y1=y1, passo=1.0, epsg=31983)
    print(f'MDT 1 m {nx}x{ny}: {tem.mean():.0%} das celulas com chao medido -> mdt_geosampa_1m.npz')
    info['mdt_2020'] = {'quadros': nomes, 'arquivo': 'mdt_geosampa_1m.npz', 'medido': round(float(tem.mean()), 3)}
    # --- MDS 2020 ao longo do Minhocao (0,5 m, maior z).
    if c.get('caixa_mds'):
        la0, lo0, la1, lo1 = c['caixa_mds']
        mx, my = T.transform(np.array([lo0, lo1]), np.array([la0, la1]))
        bx0, by0, bx1, by1 = math.floor(min(mx)), math.floor(min(my)), math.ceil(max(mx)), math.ceil(max(my))
        qm = geosampa_wfs('quadricula_folha_mdt_mds_2020', min(lo0, lo1), min(la0, la1), max(lo0, lo1), max(la0, la1))
        nomes_m = sorted({f['properties']['cd_quadricula'] for f in qm['features']})
        mnx, mny = int((bx1 - bx0) * 2), int((by1 - by0) * 2)
        topo = np.full((mny, mnx), -1e9)
        for q in nomes_m:
            x, y, zz, cl = geosampa_laz('MDS_2020', q, cache)
            i = np.floor((by1 - y) * 2).astype(int)
            j = np.floor((x - bx0) * 2).astype(int)
            ok = (i >= 0) & (i < mny) & (j >= 0) & (j < mnx) & (cl != 7) & (cl != 18)      # sem ruido
            np.maximum.at(topo, (i[ok], j[ok]), zz[ok])
            print(f'GeoSampa MDS 2020 {q}: {ok.sum()} pontos na caixa do Minhocao')
        np.savez_compressed(pasta / 'mds_minhocao_05m.npz', z=np.where(topo > -1e8, topo, np.nan).astype(np.float32),
                            x0=bx0, y1=by1, passo=.5, epsg=31983)
        info['mds_2020'] = {'quadros': nomes_m, 'arquivo': 'mds_minhocao_05m.npz', 'caixa_utm': [bx0, by0, bx1, by1]}
    return vetores_geosampa(pasta, info, w, s, e, n)


def vetores_geosampa(pasta, info, w, s, e, n):
    for camada, destino in (('quadra_viaria_editada', 'geosampa_quadras.geojson'), ('ponto_cotado', 'geosampa_pontos_cotados.geojson'),
                            ('obra_arte', 'geosampa_obras_arte.geojson'), ('GEOSAMPA_v_praca_largo', 'geosampa_pracas.geojson'),
                            ('arvore', 'geosampa_arvores.geojson')):
        dados = geosampa_wfs(camada, w, s, e, n)
        (pasta / destino).write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
        print(f'GeoSampa {camada}: {len(dados["features"])} feicoes -> {destino}')
        info[camada] = len(dados['features'])
    (pasta / 'geosampa.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


def pegadas_das_torres(c, pasta, torres):
    """Pegadas da Microsoft que contem um edificio em altura do cadastro de Goiania (o horizonte), e as
    demais ate `horizonte_casas_m` do centro (os bairros em volta do autodromo, alem da grade)."""
    from shapely.geometry import Point, shape
    from projecao import Transformer
    T = Transformer.from_crs(31982, 4326, always_xy=True)
    xy = np.array([f['geometry']['coordinates'][:2] for f in torres])
    lon, lat = T.transform(xy[:, 0], xy[:, 1])
    celula = {}
    for k, (u, v) in enumerate(zip(lon, lat)):
        celula.setdefault((int(u * 500), int(v * 500)), []).append(k)
    # Quadkeys de nivel 9 que cobrem os pontos (o limite entre dois passa entre o autodromo e o centro).
    quads = sorted({quadkey(v, u) for u, v in zip(lon, lat)} | {quadkey(*c['centro'])})
    clat, clon = c['centro']
    r_casas = c.get('horizonte_casas_m', 2200)
    dlat, dlon = r_casas / 111320.0, r_casas / (111320.0 * math.cos(math.radians(clat)))
    achadas, usadas, casas = [], set(), []
    for f in microsoft_linhas(c, pasta, quads):
        anel = np.array(f['geometry']['coordinates'][0])
        x0, y0, x1, y1 = anel[:, 0].min(), anel[:, 1].min(), anel[:, 0].max(), anel[:, 1].max()
        if abs((x0 + x1) / 2 - clon) < dlon and abs((y0 + y1) / 2 - clat) < dlat:
            casas.append(f)
        perto = [k for i in range(int(x0 * 500), int(x1 * 500) + 1) for j in range(int(y0 * 500), int(y1 * 500) + 1)
                 for k in celula.get((i, j), [])]
        if not perto:
            continue
        p = shape(f['geometry'])
        dentro = [k for k in perto if p.contains(Point(lon[k], lat[k]))]
        if dentro:
            f['properties'] = {'torres': dentro}
            achadas.append(f)
            usadas.update(dentro)
    (pasta / 'goiania_torres_microsoft.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': achadas}),
                                                             encoding='utf-8')
    (pasta / 'goiania_casas_microsoft.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': casas}),
                                                            encoding='utf-8')
    print(f'Microsoft: {len(achadas)} pegadas contem {len(usadas)} dos {len(torres)} edificios em altura (quadkeys {quads}); '
          f'{len(casas)} pegadas ate {r_casas} m do centro')
    return {'quadkeys': quads, 'pegadas': len(achadas), 'torres_com_pegada': len(usadas), 'casas_horizonte': len(casas)}


def mdt_de_curvas(c, pasta, passo=2.0):
    """Modelo do terreno de Goiania numa grade de `passo` m a partir das curvas de nivel de 5 m da
    Prefeitura: o ANADEM (30 m) da a forma entre as curvas e a diferenca para cada curva e interpolada
    como superficie harmonica (multigrade), de modo que o modelo passa exatamente pelas curvas."""
    from affine import Affine
    from compat_scipy import map_coordinates
    from projecao import Transformer
    from shapely.geometry import shape
    T = Transformer.from_crs(4326, 31982, always_xy=True)
    cx, cy = T.transform(c['centro'][1], c['centro'][0])
    meia = c.get('mdt_meia_m', 1100)
    n = int(round(2 * meia / passo)) + 1
    x0, y0 = cx - meia, cy + meia                       # centro do pixel do canto noroeste
    XX, YY = np.meshgrid(x0 + np.arange(n) * passo, y0 - np.arange(n) * passo)
    an = geo_io.ler(pasta / 'anadem.tif')
    lon, lat = Transformer.from_crs(31982, an.epsg, always_xy=True).transform(XX, YY)
    col, lin = ~an.transform * (lon, lat)
    fundo = map_coordinates(an.banda(1).astype(float), [lin - .5, col - .5], order=3)
    # Curvas rasterizadas: cada vertice adensado a meio passo marca a celula com a cota.
    soma, cont = np.zeros((n, n)), np.zeros((n, n))
    for f in json.loads((pasta / 'goiania_curvas_5m.geojson').read_text(encoding='utf-8'))['features']:
        g, cota = shape(f['geometry']), float(f['properties']['NM_CNV'])
        for linha in (g.geoms if g.geom_type.startswith('Multi') else [g]):
            pts = np.array([linha.interpolate(d).coords[0] for d in np.arange(0, linha.length, passo / 2)] + [linha.coords[-1]])
            j = np.round((pts[:, 0] - x0) / passo).astype(int)
            i = np.round((y0 - pts[:, 1]) / passo).astype(int)
            ok = (i >= 0) & (i < n) & (j >= 0) & (j < n)
            np.add.at(soma, (i[ok], j[ok]), cota)
            np.add.at(cont, (i[ok], j[ok]), 1)
    fixo = cont > 0
    resid = np.where(fixo, soma / np.maximum(cont, 1) - fundo, 0.0)
    corr = harmonica(resid, fixo)
    z = (fundo + corr).astype(np.float32)
    geo_io.gravar(pasta / 'mdt_goiania.tif', z, Affine(passo, 0, x0 - passo / 2, 0, -passo, y0 + passo / 2), 31982)
    print(f'MDT das curvas de 5 m em grade de {passo:.0f} m: {n}x{n}, {fixo.mean():.1%} das celulas sobre curvas; '
          f'curva - ANADEM: mediana {np.median(resid[fixo]):+.2f} m, p95 {np.percentile(np.abs(resid[fixo]), 95):.2f} m; '
          f'cotas {z.min():.1f} a {z.max():.1f} m')
    return {'passo_m': passo, 'celulas': [n, n], 'sobre_curvas': float(fixo.mean()),
            'curva_menos_anadem_mediana_m': float(np.median(resid[fixo])),
            'curva_menos_anadem_p95_abs_m': float(np.percentile(np.abs(resid[fixo]), 95))}


def harmonica(valor, fixo, voltas=(600, 300, 160, 100, 80, 60, 60)):
    """Solucao de Laplace com valor nas celulas fixas (e derivada nula nas bordas): da grade grossa
    para a fina, cada nivel parte do anterior e relaxa por SOR vermelho-preto."""
    niveis = [(valor, fixo)]
    while min(niveis[-1][0].shape) > 48:
        v, f = niveis[-1]
        h, w = (v.shape[0] + 1) // 2, (v.shape[1] + 1) // 2
        vp = np.zeros((2 * h, 2 * w))
        fp = np.zeros((2 * h, 2 * w))
        vp[:v.shape[0], :v.shape[1]] = np.where(f, v, 0)
        fp[:v.shape[0], :v.shape[1]] = f
        soma = vp.reshape(h, 2, w, 2).sum((1, 3))
        cont = fp.reshape(h, 2, w, 2).sum((1, 3))
        niveis.append((np.where(cont > 0, soma / np.maximum(cont, 1), 0), cont > 0))
    u = None
    for k, (v, f) in enumerate(reversed(niveis)):
        if u is None:
            u = np.full(v.shape, v[f].mean() if f.any() else 0.0)
        else:
            u = np.repeat(np.repeat(u, 2, 0), 2, 1)[:v.shape[0], :v.shape[1]]
        u[f] = v[f]
        ii, jj = np.indices(u.shape)
        cores = [((ii + jj) % 2 == p) & ~f for p in (0, 1)]
        for _ in range(voltas[min(k, len(voltas) - 1)]):
            for livre in cores:
                p = np.pad(u, 1, mode='edge')
                media = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
                u[livre] += 1.9 * (media[livre] - u[livre])
    return u


def orto_goiania(c, pasta, px=.25, bloco=3000):
    """Ortofoto de 2016 da Prefeitura de Goiania (Mapa Facil) a `px` m por pixel na caixa da referencia
    Esri, em blocos do servico de exportacao: a imagem que mede o eixo e os boxes (georreferenciada com
    as curvas de nivel e os equipamentos da Prefeitura; a Esri de 09/2025 tem 8,5 m de precisao)."""
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31982, always_xy=True)
    w, s, e, n = caixa(c, -c['raio_m'] * .45)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    x0, y1 = math.floor(min(xs)), math.ceil(max(ys))
    nx, ny = int(math.ceil((max(xs) - x0) / px)), int(math.ceil((y1 - min(ys)) / px))
    img = Image.new('RGB', (nx, ny))
    sess = requests.Session()
    sess.headers.update(AGENTE)
    for j in range(0, ny, bloco):
        for i in range(0, nx, bloco):
            w_, h_ = min(bloco, nx - i), min(bloco, ny - j)
            caixa_b = (x0 + i * px, y1 - (j + h_) * px, x0 + (i + w_) * px, y1 - j * px)
            for tentativa in range(4):
                r = sess.get(f'{GYN}/Mapa_Ortofoto2016v8_D/MapServer/export', timeout=300,
                             params={'bbox': ','.join(f'{v:.2f}' for v in caixa_b), 'bboxSR': 31982, 'imageSR': 31982,
                                     'size': f'{w_},{h_}', 'format': 'jpg', 'f': 'image'})
                if r.ok and r.content[:2] == bytes([255, 216]):
                    break
                time.sleep(3 + 4 * tentativa)
            else:
                raise SystemExit(f'ortofoto 2016: bloco {i},{j} falhou')
            img.paste(Image.open(BytesIO(r.content)).convert('RGB'), (i, j))
    img.save(pasta / 'referencia_orto.jpg', quality=92)
    meta = {'x0': x0, 'y1': y1, 'px': px, 'epsg': 31982, 'fonte': f'{GYN}/Mapa_Ortofoto2016v8_D (Prefeitura de Goiania, 2016)',
            'aviso': 'Ortofoto da Prefeitura: conferencia e medida locais; nao distribuir.'}
    (pasta / 'referencia_orto.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
    print(f'Ortofoto 2016 da Prefeitura: {nx}x{ny} px a {px} m -> referencia_orto.jpg')
    return meta


BHGEO_WFS = 'https://geoservicos.pbh.gov.br/geoserver/ide_bhgeo/wfs'
BHGEO_WMS = 'https://geoservicos.pbh.gov.br/geoserver/ide_bhgeo/wms'
# O firewall da Prefeitura recusa clientes sem "Mozilla" no agente; este se identifica.
AGENTE_BH = {'User-Agent': 'Mozilla/5.0 (compatible; autopobre-circuitos/1.0; +https://autopobre.com.br)'}
# Nuvens de pontos do LiDAR de 2015 (acervo cartografico do BHGeo, uma pasta publica do Google Drive por produto); folhas
# 1:2000 de 1,2 x 1,0 km: E = 547200 + 1200 XX, N = 7746000 + 1000 YY (codigo XXYY).
BHGEO_LIDAR_MDT = '1lCNzaPZjPoSdYhwUyZ5ABKvs381ExpHn'
BHGEO_CAMADAS = {
    'EDIFICACAO': 'bhgeo_edificacoes.geojson', 'MEIO_FIO_QUADRA': 'bhgeo_meiofio.geojson',
    'QUADRA_VIARIA': 'bhgeo_quadras.geojson', 'CANTEIRO_CENTRAL': 'bhgeo_canteiros.geojson', 'TREVO': 'bhgeo_trevos.geojson',
    'LAGOA_PAMPULHA': 'bhgeo_lagoa.geojson', 'BREJO': 'bhgeo_brejos.geojson', 'PARQUE_LAGOA_PAMPULHA': 'bhgeo_parque_lagoa.geojson',
    'ATRATIVO_TURISTICO': 'bhgeo_atrativos.geojson', 'BEM_CULTURAL_IMOVEL': 'bhgeo_bens_culturais.geojson',
    'PARQUES_MUNICIPAIS': 'bhgeo_parques.geojson', 'PRACA': 'bhgeo_pracas.geojson', 'TRECHO_LOGRADOURO': 'bhgeo_logradouros.geojson',
    'LOGRADOURO_OBRA_DE_ARTE': 'bhgeo_obras_de_arte.geojson', 'CAMPO_FUTEBOL': 'bhgeo_campos.geojson',
}


def bhgeo_wfs(camada, caixa_utm, destino):
    x0, y0, x1, y1 = caixa_utm
    for tentativa in range(4):
        try:
            r = requests.get(BHGEO_WFS, headers=AGENTE_BH, timeout=300, params={
                'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': f'ide_bhgeo:{camada}',
                'outputFormat': 'application/json', 'srsName': 'EPSG:31983', 'bbox': f'{x0},{y0},{x1},{y1},EPSG:31983'})
            if r.ok and r.text.lstrip().startswith('{'):
                destino.write_text(r.text, encoding='utf-8')
                n = len(r.json()['features'])
                print(f'BHGeo {camada}: {n} feicoes -> {destino.name}')
                return n
            print(f'BHGeo {camada}: resposta {r.status_code}')
        except requests.RequestException as err:
            print(f'BHGeo {camada}: {err}')
        time.sleep(3 + 5 * tentativa)
    raise SystemExit(f'BHGeo {camada}: falhou')


def fontes_bhgeo(c, pasta):
    """Dados abertos da Prefeitura de Belo Horizonte (BHGeo / IDE-BHGeo, PRODABEL; CC-BY, sem login), SIRGAS 2000 /
    UTM 23S, na caixa `caixa_utm` de config.py:
    - MDT do LiDAR de 2015: os pontos de chao das folhas 1:2000 que cobrem a caixa numa grade de 2 m (media por celula; o
      levantamento tem ~0,27 ponto de chao por m2); o vazio (sob predios, na agua) preenchido por convolucao normalizada
      em escalas crescentes, como o do GeoSampa;
    - edificacoes de 2015 com a altura estimada pelo laser, meios-fios, quadras viarias, canteiros centrais, trevos, a
      lagoa, brejos, o parque, atrativos turisticos, bens culturais, parques, pracas, logradouros (com a largura), obras de
      arte e campos de futebol (WFS);
    - a ortofoto de 2015 (0,2 m, WMS) a 1 m por pixel na caixa: a cor do chao."""
    import re
    from compat_scipy import gaussian_filter
    x0, y0, x1, y1 = c['caixa_utm']
    info = {'servico': BHGEO_WFS, 'baixado_em': date.today().isoformat(), 'caixa_utm': [x0, y0, x1, y1],
            'credito': 'PBH/Prodabel – BHGeo (IDE-BHGeo), CC-BY'}
    cache = pasta / 'bhgeo'
    cache.mkdir(exist_ok=True)
    if '--so-vetores' not in sys.argv and '--so-orto' not in sys.argv:
        r = requests.get('https://drive.google.com/embeddedfolderview', params={'id': BHGEO_LIDAR_MDT}, headers=AGENTE, timeout=120)
        r.raise_for_status()
        arquivos = dict((nm, i) for i, nm in re.findall(r'href="https://drive.google.com/file/d/([^/]+)/view[^"]*".*?flip-entry-title">([^<]+)<', r.text, re.S))
        folhas = [f'{xx:02d}{yy:02d}' for xx in range((x0 - 547200) // 1200, (x1 - 547200) // 1200 + 1)
                  for yy in range((y0 - 7746000) // 1000, (y1 - 7746000) // 1000 + 1)]
        passo = 2.0
        nx, ny = int((x1 - x0) / passo), int((y1 - y0) / passo)
        soma, cont = np.zeros((ny, nx)), np.zeros((ny, nx))
        usadas = []
        for f in folhas:
            nome = f'MDT_{f}.xyz'
            if nome not in arquivos:
                print(f'LiDAR 2015: folha {f} sem MDT na pasta')
                continue
            local = cache / nome
            if not local.exists():
                for tentativa in range(4):
                    try:
                        d = requests.get('https://drive.usercontent.google.com/download', headers=AGENTE, timeout=600,
                                         params={'id': arquivos[nome], 'export': 'download', 'confirm': 't'})
                        if d.ok and d.content.lstrip()[:1].isdigit():
                            local.write_bytes(d.content)
                            break
                    except requests.RequestException as err:
                        print(f'LiDAR 2015 {f}: {err}')
                    time.sleep(3 + 5 * tentativa)
                else:
                    raise SystemExit(f'LiDAR 2015: folha {f} falhou')
            xyz = np.loadtxt(local, usecols=(0, 1, 2))
            i = np.floor((y1 - xyz[:, 1]) / passo).astype(int)
            j = np.floor((xyz[:, 0] - x0) / passo).astype(int)
            ok = (i >= 0) & (i < ny) & (j >= 0) & (j < nx)
            np.add.at(soma, (i[ok], j[ok]), xyz[ok, 2])
            np.add.at(cont, (i[ok], j[ok]), 1)
            usadas.append(f)
            print(f'LiDAR 2015 MDT {f}: {len(xyz)} pontos ({ok.mean():.0%} na caixa)')
        tem = cont > 0
        z = np.where(tem, soma / np.maximum(cont, 1), 0.0)
        cheio = z.copy()
        falta = ~tem
        for sigma in (1, 2, 4, 8, 16, 32, 64):
            if not falta.any():
                break
            num = gaussian_filter(np.where(tem, z, 0.0), sigma)
            den = gaussian_filter(tem.astype(float), sigma)
            preenche = falta & (den > 1e-3)
            cheio[preenche] = num[preenche] / den[preenche]
            falta &= ~preenche
        np.savez_compressed(pasta / 'mdt_bhgeo_2m.npz', z=cheio.astype(np.float32), medido=tem, x0=x0, y1=y1, passo=passo, epsg=31983)
        print(f'MDT 2 m {nx}x{ny}: {tem.mean():.0%} das celulas com chao medido -> mdt_bhgeo_2m.npz')
        info['mdt_2015'] = {'folhas': usadas, 'pasta_drive': BHGEO_LIDAR_MDT, 'arquivo': 'mdt_bhgeo_2m.npz', 'medido': round(float(tem.mean()), 3)}
    if '--so-orto' not in sys.argv:
        info['camadas'] = {camada: bhgeo_wfs(camada, (x0, y0, x1, y1), pasta / destino) for camada, destino in BHGEO_CAMADAS.items()}
    # --- Ortofoto de 2015 a 1 m por pixel, em blocos de 2000 px.
    px, bloco = 1.0, 2000
    nx, ny = int((x1 - x0) / px), int((y1 - y0) / px)
    img = Image.new('RGB', (nx, ny))
    for j in range(0, ny, bloco):
        for i in range(0, nx, bloco):
            w_, h_ = min(bloco, nx - i), min(bloco, ny - j)
            cb = (x0 + i * px, y1 - (j + h_) * px, x0 + (i + w_) * px, y1 - j * px)
            for tentativa in range(4):
                try:
                    r = requests.get(BHGEO_WMS, headers=AGENTE_BH, timeout=300, params={
                        'service': 'WMS', 'version': '1.1.1', 'request': 'GetMap', 'layers': 'ide_bhgeo:ORTOFOTO_2015',
                        'styles': '', 'srs': 'EPSG:31983', 'bbox': ','.join(f'{v:.1f}' for v in cb), 'width': w_, 'height': h_,
                        'format': 'image/jpeg'})
                    if r.ok and r.content[:2] == bytes([255, 216]):
                        break
                except requests.RequestException as err:
                    print(f'ortofoto 2015: {err}')
                time.sleep(3 + 5 * tentativa)
            else:
                raise SystemExit(f'ortofoto 2015: bloco {i},{j} falhou')
            img.paste(Image.open(BytesIO(r.content)).convert('RGB'), (i, j))
    img.save(pasta / 'bhgeo_orto_2015_1m.jpg', quality=92)
    info['ortofoto_2015'] = {'arquivo': 'bhgeo_orto_2015_1m.jpg', 'x0': x0, 'y1': y1, 'px': px, 'camada': 'ide_bhgeo:ORTOFOTO_2015'}
    print(f'Ortofoto 2015: {nx}x{ny} px a {px} m -> bhgeo_orto_2015_1m.jpg')
    (pasta / 'bhgeo.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


def esri_referencia(c, pasta, z=18):
    """Mosaico aereo so para conferencia visual local (nao publicado)."""
    w, s, e, n = caixa(c, -c['raio_m'] * .45)
    def tile(lon, lat):
        k = 2 ** z
        x = (lon + 180) / 360 * k
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k
        return x, y
    x0, y0 = tile(w, n)
    x1, y1 = tile(e, s)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    img = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    sess = requests.Session()
    sess.headers.update(AGENTE)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            url = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{ty}/{tx}'
            for tentativa in range(4):
                try:
                    r = sess.get(url, timeout=60)
                    r.raise_for_status()
                    img.paste(Image.open(BytesIO(r.content)).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
                    break
                except requests.RequestException:
                    time.sleep(2 + tentativa * 3)
    img.save(pasta / 'referencia_esri.jpg', quality=90)
    meta = {'z': z, 'tx0': tx0, 'ty0': ty0, 'tx1': tx1, 'ty1': ty1,
            'aviso': 'Esri World Imagery: conferencia visual local; nao distribuir.'}
    (pasta / 'referencia_esri.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
    print(f'Referencia Esri z{z}: {img.size[0]}x{img.size[1]} px')


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in CIRCUITOS:
        raise SystemExit(f'uso: baixar_fontes.py {{{"|".join(CIRCUITOS)}}} [--referencia] [--so-referencia]')
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    if '--edificios' in sys.argv:
        edificios_microsoft(c, pasta)
        return
    if '--idedf' in sys.argv:
        fontes_idedf(c, pasta)
        return
    if '--goiania' in sys.argv:
        # So os dados da Prefeitura de Goiania, gravados tambem na proveniencia ja baixada.
        prov = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
        prov['goiania'] = fontes_goiania(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding='utf-8')
        return
    if '--geosampa' in sys.argv:
        # So os dados da Prefeitura de Sao Paulo, gravados tambem na proveniencia ja baixada.
        prov = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
        prov['geosampa'] = fontes_geosampa(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding='utf-8')
        return
    if '--bhgeo' in sys.argv:
        # So os dados da Prefeitura de Belo Horizonte, gravados tambem na proveniencia ja baixada.
        prov = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
        prov['bhgeo'] = fontes_bhgeo(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding='utf-8')
        return
    if '--geofloripa' in sys.argv:
        # So os dados da Prefeitura de Florianopolis, gravados tambem na proveniencia ja baixada.
        prov = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
        prov['geofloripa'] = fontes_geofloripa(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding='utf-8')
        return
    if '--so-referencia' not in sys.argv:
        proveniencia = {'circuito': nome, 'baixado_em': date.today().isoformat(), 'caixa_lonlat': caixa(c)}
        proveniencia['osm_base'] = overpass(c, pasta / 'osm.json')
        grande = caixa(c, 400)
        recorte(f'https://metadados.snirh.gov.br/files/anadem_v1_tiles/anadem_v1_{c["anadem"]}.tif',
                pasta / 'anadem.tif', grande, 'ANADEM v1 (terreno)')
        recorte(f'https://copernicus-dem-30m.s3.amazonaws.com/{c["copernicus"]}/{c["copernicus"]}.tif',
                pasta / 'copernicus_dsm.tif', grande, 'Copernicus GLO-30 (superficie)')
        recorte(f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{c["worldcover"]}_Map.tif',
                pasta / 'worldcover.tif', caixa(c), 'ESA WorldCover 2021')
        proveniencia['sentinel2'] = sentinel2(c, pasta)
        proveniencia['edificios_microsoft'] = edificios_microsoft(c, pasta)
        if c.get('relevo_local') == 'idedf_mdt_1m' or c.get('edificios_locais') == 'idedf':
            proveniencia['idedf'] = fontes_idedf(c, pasta)
        if c.get('relevo_local') == 'goiania_curvas_5m':
            proveniencia['goiania'] = fontes_goiania(c, pasta)
        if c.get('relevo_local') == 'geofloripa_mdt_1m':
            proveniencia['geofloripa'] = fontes_geofloripa(c, pasta)
        if c.get('relevo_local') == 'geosampa_lidar_2020':
            proveniencia['geosampa'] = fontes_geosampa(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(proveniencia, indent=1, ensure_ascii=False), encoding='utf-8')
    if '--referencia' in sys.argv or '--so-referencia' in sys.argv:
        esri_referencia(c, pasta)
        if c.get('referencia') == 'orto_goiania':
            orto_goiania(c, pasta)


if __name__ == '__main__':
    main()
