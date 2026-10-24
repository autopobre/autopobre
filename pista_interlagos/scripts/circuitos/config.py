"""Circuitos da Old Stock Race reconstruidos a partir de dados abertos.

Cada circuito guarda aqui o que vem de fontes publicadas (extensao oficial,
sentido, largura) e onde buscar os dados geograficos. Os scripts
baixar_fontes.py e gerar_pista.py leem esta tabela.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]          # pista_interlagos/
FONTES = RAIZ / 'fontes'
DADOS = RAIZ / 'dados'
ASSETS = RAIZ / 'teste' / 'assets' / 'circuitos'

CIRCUITOS = {
    'cascavel': {
        'nome': 'Autódromo Internacional Zilmar Beux',
        'cidade': 'Cascavel, PR',
        # Centro aproximado do complexo (OSM leisure=sports_centre 398629834).
        'centro': (-24.9814, -53.3846),
        'raio_m': 1700,
        'epsg': 31982,                 # SIRGAS 2000 / UTM 22S
        'anadem': '22J',
        'copernicus': 'Copernicus_DSM_COG_10_S25_00_W054_00_DEM',
        'worldcover': 'S27W054',
        # Prefeitura de Cascavel / CBA: 3.058 m, 12 m de largura, sentido anti-horario.
        'extensao_m': 3058,
        'centro_cidade': (-24.9555, -53.4553),   # Catedral de Cascavel
        'largura_m': 12,
        'sentido': 'anti-horario',
        # Reta dos boxes de concreto; o pit lane passa sob a cobertura das garagens.
        'reta_de_concreto': True,
        'boxes_sob_cobertura': True,
    },
    'piracicaba': {
        'nome': 'Autódromo do ECPA',
        'cidade': 'Piracicaba, SP',
        # OSM relation 19345029 (Esporte Clube Piracicabano de Automobilismo).
        'centro': (-22.7387, -47.5337),
        'raio_m': 1500,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S23_00_W048_00_DEM',
        'worldcover': 'S24W048',
        # ECPA: 2.100 m, 9 curvas, sentido horario.
        'extensao_m': 2100,
        'centro_cidade': (-22.7253, -47.6492),   # Catedral de Piracicaba
        'largura_m': None,
        'sentido': 'horario',
    },
    'chapeco': {
        'nome': 'Autódromo Internacional de Chapecó Márcio Vaccaro',
        'cidade': 'Chapecó, SC',
        # Centro da pista no OSM (way 1523801531, mapeada em 27/05/2026), Linha Cachoeira,
        # distrito de Marechal Bormann.
        'centro': (-27.2201, -52.7140),
        'raio_m': 1500,
        'epsg': 31982,                 # SIRGAS 2000 / UTM 22S
        'anadem': '22J',
        'copernicus': 'Copernicus_DSM_COG_10_S28_00_W053_00_DEM',
        'worldcover': 'S30W054',
        # Prefeitura de Chapecó / NSC (2026): 4.004 m, sentido horario, 12 a 15 m de largura,
        # 12 curvas (7 a direita), retas de 837, 634 e 422 m, desnivel maximo de 18,5 m.
        'extensao_m': 4004,
        'centro_cidade': (-27.1051, -52.6137),   # Catedral Santo Antonio
        'largura_m': 13.5,
        'sentido': 'horario',
        'desnivel_m': 18.5,
        'largura_faixa_m': (12, 15),
        # A pista ficou pronta em 2026: a imagem aerea Esri (08/2024) so mostra a terraplanagem.
        'referencia': 'sentinel2',
        'base_na_grade': True,
        # Autodromo no meio do mato, a 20 km do centro: lavouras e sitios no horizonte, sem a cidade.
        'horizonte': 'rural',
    },
    'brasilia': {
        'nome': 'Autódromo Internacional Nelson Piquet',
        'cidade': 'Brasília, DF',
        # Centro do tracado no OSM (way 32900091, redesenhado depois da reforma, fev/2026), no
        # Eixo Monumental, ao lado do Estadio Mane Garrincha.
        'centro': (-15.7760, -47.8995),
        'raio_m': 1500,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S (o mesmo do Geoportal do DF)
        'anadem': '23L',
        'copernicus': 'Copernicus_DSM_COG_10_S16_00_W048_00_DEM',
        'worldcover': 'S18W048',
        # Reaberto no fim de 2025 depois da reforma do BRB (Metropoles, Distrito do Esporte):
        # 5.384 m, 16 curvas (9 a direita), sentido horario, 15 m de largura na reta de largada e
        # 14 m no resto; retas de 803 m, 614 m (largada) e 502 m (oposta); curva 1 de alta com
        # 207 m e 5 graus de inclinacao.
        'extensao_m': 5384,
        'centro_cidade': (-15.7939, -47.8828),   # Plataforma Rodoviaria, centro do Plano Piloto
        'largura_m': 14,
        'sentido': 'horario',
        'largura_faixa_m': (12, 16),
        # Larguras publicadas (resto, reta de largada): a medida pega os escapes pavimentados.
        'largura_publicada': (14, 15),
        # Boxes por dentro da reta de largada: a direita no sentido horario da corrida.
        'lado_boxes': -1,
        # Plataforma do muro dos boxes diante das garagens (a banca do Box 99 pede 3,4 m de muro).
        'folga_minima_boxes_m': 4.6,
        # O OSM tem poucos nos na reta interna de cima e passa ate 18 m fora do asfalto: busca mais
        # larga, e so o asfalto novo (escuro) conta como pista; o patio e os escapes sao mais claros.
        'desloc_max_m': 18,
        'lum_max_asfalto': 85,
        'separar_pit_lane': True,
        # Relevo e edificacoes do Geoportal do DF (IDE/DF, SEDUH): o MDT de 1 m (pelo servico de
        # perfis) no lugar do ANADEM de 30 m, e o cadastro de edificacoes com altura.
        'relevo_local': 'idedf_mdt_1m',
        'edificios_locais': 'idedf',
        # Marco no horizonte: a Torre de TV (Lucio Costa, 224 m, mirante a 75 m), OSM way 41648342.
        'marcos': [{'nome': 'Torre de TV', 'tipo': 'torre_tv', 'lat': -15.79062, 'lon': -47.89298, 'altura_m': 224}],
    },
    'goiania': {
        'nome': 'Autódromo Internacional Ayrton Senna',
        'cidade': 'Goiânia, GO',
        # Centro do tracado misto no OSM (relacao de circuito 15921950: vias 288004311 e 288004307),
        # na saida leste da cidade, ao lado do Residencial Alphaville Flamboyant.
        'centro': (-16.71825, -49.19284),
        'raio_m': 1500,
        'epsg': 31982,                 # SIRGAS 2000 / UTM 22S (o mesmo do Mapa Facil da Prefeitura)
        'anadem': '22K',
        'copernicus': 'Copernicus_DSM_COG_10_S17_00_W050_00_DEM',
        'worldcover': 'S18W051',
        # Reaberto em marco de 2026 depois da reforma para a MotoGP (motogp.com, Motorsport, Band):
        # 3.835 m, sentido horario, 14 curvas (9 a direita, 5 a esquerda), reta principal de 994 m
        # "precedida de uma curva inclinada"; a reta principal passou de 12 para 15 m de largura e as
        # curvas para 14 m.
        'extensao_m': 3835,
        'centro_cidade': (-16.6799, -49.2556),   # Praca Civica, centro de Goiania
        'largura_m': 14,
        'sentido': 'horario',
        'largura_faixa_m': (11, 17),
        # Larguras publicadas (resto, reta principal) depois da reforma; a imagem aerea (09/2025) e da obra.
        'largura_publicada': (14, 15),
        # Boxes por dentro da reta principal (nordeste): a direita no sentido horario da corrida.
        'lado_boxes': -1,
        # Plataforma do muro dos boxes diante das garagens (a banca do Box 99 pede 3,4 m de muro).
        'folga_minima_boxes_m': 4.6,
        # Eixo, larguras e pit lane medidos na ortofoto de 2016 da Prefeitura (0,25 m, georreferenciada com as
        # curvas e os equipamentos dela); a imagem Esri (09/2025, precisao de 8,5 m) mostra a obra da reforma.
        'referencia': 'orto_goiania',
        # Garagens pelos telhados brancos dos predios dos boxes na imagem Esri, onde ja aparece o predio novo
        # (30 boxes, antes 22), 18 m antes do antigo; o patio entre a faixa e eles ainda e terra.
        'garagens_na_esri': True,
        'patio_boxes': {'faixa': (0.5, 20.0), 'vao': 24.0},
        # A faixa (9 m, como nos outros circuitos) encosta nas portas das garagens, como na ortofoto de 2016.
        'faixa_nas_garagens': 9.0,
        # Relevo e edificacoes do Mapa Facil da Prefeitura (SIGGO): as curvas de nivel de 5 m ajustam o
        # ANADEM; equipamentos do autodromo, pavimentos do cadastro e os edificios em altura da cidade.
        'relevo_local': 'goiania_curvas_5m',
        # Suavizacao do relevo das vias (m): 2D e ao longo da volta (o MDT do DF usa 4 e 6).
        'suavizacao_m': (8.0, 15.0),
        'edificios_locais': 'goiania',
    },
    'chapada': {
        # Circuito imaginario (pedido #5 da Central): nao existe autodromo na Chapada dos Guimaraes. O relevo,
        # os paredoes, a cobertura do solo e a cor do chao sao os reais; o tracado, os boxes e a beirada sem
        # guard-rail sao desenho de jogo (gerar_chapada.py). Bloco de planalto a ~820 m entre a borda sul (o
        # paredao que se ve da MT-251) e a borda leste de um bico, 2 a 3 km ao sul da cidade.
        'nome': 'Autódromo da Chapada dos Sonhos',
        'cidade': 'Chapada dos Guimarães, MT',
        'centro': (-15.4792, -55.7833),
        'raio_m': 2600,
        'epsg': 31981,                 # SIRGAS 2000 / UTM 21S
        'anadem': '21L',
        'copernicus': 'Copernicus_DSM_COG_10_S16_00_W056_00_DEM',
        'worldcover': 'S18W057',
        'extensao_m': 4200,            # desenho; gerar_chapada.py grava o medido
        'centro_cidade': (-15.4608, -55.7495),   # Igreja Matriz de Sant'Ana, centro de Chapada dos Guimaraes
        'largura_m': 12,
        'sentido': 'horario',
        'imaginario': True,
        'horizonte': 'chapada',
    },
    'floripa': {
        # Circuito de rua imaginario (pedido da equipe, 11/10/2026): as ruas, as pontes e o mar sao os reais de
        # Florianopolis; fechar a volta com muros e boxes e desenho de jogo (gerar_floripa.py). Largada na Ponte
        # Hercilio Luz rumo a ilha; Alameda Adolfo Konder, Rua Hoepcke, Rua Claudino Bento da Silva, Av. Paulo
        # Fontes, Rua Pedro Bittencourt, Ponte Colombo Salles, Rua 14 de Julho no Estreito e de volta a ponte.
        'nome': 'Autódromo Floripa',
        'cidade': 'Florianópolis, SC',
        # Meio do caminho entre a cabeceira continental da Hercilio Luz e a rodoviaria.
        'centro': (-27.5958, -48.5640),
        'raio_m': 2100,
        'epsg': 31982,                 # SIRGAS 2000 / UTM 22S
        'anadem': '22J',
        'copernicus': 'Copernicus_DSM_COG_10_S28_00_W049_00_DEM',
        'worldcover': 'S30W051',
        'extensao_m': 5000,            # desenho; gerar_floripa.py grava o medido
        'centro_cidade': (-27.5967, -48.5492),   # Praca XV de Novembro, centro de Florianopolis
        'largura_m': 11,
        'sentido': 'horario',
        'imaginario': True,
        'rua': True,
        # Relevo de 1 m (MDT e MDS do aerolevantamento do Estado, 2010-2012), edificacoes do cadastro (2020),
        # meios-fios e batimetria do GeoFloripa (Prefeitura de Florianopolis).
        'relevo_local': 'geofloripa_mdt_1m',
        'edificios_locais': 'geofloripa',
        # Ortofotos do GeoFloripa (WMS) para o editor de traçado (pacote_referencia.py): a de 2016, na escala 1:1.000 (mostra
        # a Hercilio Luz antes da restauracao), e a de 2023, menos nitida.
        'ortofotos_wms': [
            {'nome': 'Ortofoto 2016 (GeoFloripa, 1:1.000)', 'url': 'https://geofloripa.pmf.sc.gov.br/geoserver/ows',
             'camada': 'Florianopolis:201601MUN', 'res': .2},
            {'nome': 'Ortofoto 2023 (GeoFloripa)', 'url': 'https://geofloripa.pmf.sc.gov.br/geoserver/ows',
             'camada': 'Florianopolis:2023MUN_RU', 'res': .3},
        ],
    },
    'minhocao': {
        # Circuito de rua imaginario (pedido da equipe, 11/10/2026, desenhado sobre o mapa das ruas):
        # as ruas, o Elevado Presidente Joao Goulart (Minhocao) e o tunel da Radial Leste-Oeste sob a Praca Roosevelt
        # sao os reais do centro de Sao Paulo (gerar_minhocao.py). Largada na Av. Sao Joao; sobe a rampa da Rua Ana
        # Cintra, 790 m por cima do Minhocao rumo a Roosevelt, desce reto no tunel sob a praca, sai na Rua Martins
        # Fontes; Augusta, Caio Prado, Cesario Mota Junior, Major Sertorio (por baixo do Minhocao), a Praca da
        # Republica, a Av. Vieira de Carvalho, o Largo do Arouche e a Av. Duque de Caxias de volta a Sao Joao.
        'nome': 'Circuito do Minhocão',
        'cidade': 'São Paulo, SP',
        # Meio da volta: entre a Praca da Republica e a Amaral Gurgel.
        'centro': (-23.5443, -46.6455),
        'raio_m': 1600,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S24_00_W047_00_DEM',
        'worldcover': 'S24W048',
        'extensao_m': 4068,            # desenho; gerar_minhocao.py grava o medido
        'centro_cidade': (-23.5503, -46.6339),   # Praca da Se, marco zero de Sao Paulo
        'largura_m': 11,
        'sentido': 'horario',
        'imaginario': True,
        'rua': True,
        # Relevo do LiDAR 2020 da Prefeitura (MDT em grade de 1 m; MDS de 0,5 m so ao longo do Minhocao, para medir o
        # tabuleiro), quadras viarias (meios-fios), pontos cotados, obras de arte e pracas do GeoSampa.
        'relevo_local': 'geosampa_lidar_2020',
        'caixa_mds': (-23.5487, -46.6500, -23.5376, -46.6458),
    },
    'pampulha': {
        # Circuito de rua imaginario (pedido #8 da Central, 17/10/2026, desenhado sobre o mapa): a orla da Lagoa da
        # Pampulha (Av. Otacilio Negrao de Lima) no sentido horario e a volta do Mineirao, em Belo Horizonte
        # (gerar_pampulha.py). Largada na Av. Coronel Oscar Paschoal rumo a lagoa, com o Mineirao a direita; os boxes ficam
        # na reta da orla norte. Corridas de uma volta so (meta.laps).
        'nome': 'Circuito da Pampulha',
        'cidade': 'Belo Horizonte, MG',
        # Meio da lagoa, entre a Igrejinha e o Iate.
        'centro': (-19.8515, -43.9795),
        'raio_m': 3400,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S20_00_W044_00_DEM',
        'worldcover': 'S21W045',
        'extensao_m': 20000,           # desenho; gerar_pampulha.py grava o medido
        'centro_cidade': (-19.9191, -43.9386),   # Praca Sete de Setembro, centro de Belo Horizonte
        'largura_m': 12,
        'sentido': 'horario',
        'imaginario': True,
        'rua': True,
        # Relevo do LiDAR 2015 (MDT em grade de 2 m), edificacoes com altura, meios-fios, quadras, canteiros, a lagoa e a
        # ortofoto de 2015 do BHGeo (Prefeitura de Belo Horizonte / PRODABEL, CC-BY), nesta caixa UTM (a volta e 500 m).
        'relevo_local': 'bhgeo_lidar_2015',
        'caixa_utm': (603500, 7802100, 608750, 7806650),
    },
    'guaratiba': {
        # Autodromo Parque de Guaratiba (Rio de Janeiro), em projeto (Populous e Driven International, apresentado em
        # 06/11/2025; licenciamento em 2026, inauguracao prevista para 2028): nao ha planta publicada. O eixo foi pintado
        # no editor de traçado (teste/editor-tracado.html) sobre o render aereo oficial retificado por uma camera ajustada
        # a ortofoto de 2025 do IPP (fontes/guaratiba/referencias/, eixo_do_editor.py). Na Av. Dom Joao VI, perto do BRT
        # Mato Alto, entre ela e a Estrada da Matriz.
        'nome': 'Autódromo Parque de Guaratiba',
        'cidade': 'Rio de Janeiro, RJ',
        'centro': (-22.9893, -43.6155),
        'raio_m': 1500,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S (o mesmo do IPP / data.rio)
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S23_00_W044_00_DEM',
        'worldcover': 'S24W045',
        # Prefeitura do Rio / Populous / Driven (2025): 4,71 km, 10 curvas, 4 retas (duas principais paralelas), ate
        # 11 configuracoes, FIA grau 1. Sentido nao publicado: anti-horario, com a chegada na reta de dentro, diante do
        # predio dos boxes e do paddock (lado oeste), como no traçado pintado.
        'extensao_m': 4710,
        'centro_cidade': (-22.9028, -43.1729),   # Praca XV, centro do Rio
        'largura_m': 14,
        'sentido': 'anti-horario',
        # Larguras do grau 1 da FIA (sem medida publicada; o render mede 14 a 15 m): 15 m na reta de largada, 14 no resto.
        'largura_publicada': (14, 15),
        # Boxes a direita dos carros na reta de largada (o predio comprido e o paddock ficam a oeste dela).
        'lado_boxes': -1,
        'folga_minima_boxes_m': 4.6,
        # Baixada ao lado do mangue do Rio Piraque, 1 a 2 m acima do mar: a volta tem ~1,2 m de desnivel (meta.flat_site).
        'terreno_plano': True,
        # Eixo e chegada pintados no editor (tracado_guaratiba*.json -> eixo_refinado.json, eixo_do_editor.py).
        'eixo_do_editor': True,
        'referencias_proprias': True,
    },
    'velocitta': {
        # Autodromo Velocitta (Velo Citta), na Fazenda Paineiras, 12 km a nordeste de Mogi Guacu, aberto em 16/06/2012.
        # A pista tem varias montagens: o traçado original (3.493 m, 14 curvas), o de competicao (3.443 m, 12 curvas, com a
        # Caipirinha no lugar das curvas 3 e 4 e a Ferradura por fora da ultima curva, ambas de 2015), o anel superior
        # (2.090 m) e os circuitos curtos ligados pelo "H". O jogo monta todo o asfalto e corre so o traçado de competicao,
        # o da Stock Car desde 2017; o resto fica fechado por barreiras, como num fim de semana de corrida.
        'nome': 'Autódromo Velocitta',
        'cidade': 'Mogi Guaçu, SP',
        # Centro do tracado no OSM (via 478876097, highway=raceway; complexo 439630883).
        'centro': (-22.2895, -46.8486),
        'raio_m': 1500,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S23_00_W047_00_DEM',
        'worldcover': 'S24W048',
        # Site do autodromo e ficha da Stock Car (Band, ABCdoABC, 2025-26): 3.443 m, 12 curvas, sentido anti-horario,
        # desnivel de 45 m (Flatout, 2016; a NASCAR Brasil cita 50 m), pit lane de 160 m diante de 8 boxes.
        'extensao_m': 3443,
        'centro_cidade': (-22.3675, -46.9428),   # centro de Mogi Guacu
        'largura_m': 12,
        'sentido': 'anti-horario',
        'largura_faixa_m': (9, 16),
        # Boxes ao norte da reta, que se corre para noroeste: a direita dos carros.
        'lado_boxes': -1,
        'folga_minima_boxes_m': 4.6,
        # O predio dos 8 boxes (telhado marrom e o bloco branco, com os caminhoes das equipes atras), medido na imagem: de 394 a
        # 472 m do pit lane, contados da entrada; o patio mais claro ao lado e o da tenda do paddock, ate 580 m. Oito boxes nao
        # abrigam 15 carros (na Stock Car as outras equipes ficam em tendas no paddock): a fileira de garagens do jogo vai do
        # predio ate o fim da tenda, e a fila dos rivais depois da bandeirada cabe diante dela (race-field.js pitRoute).
        'garagens_pit_s': (394, 580),
        # Do predio ate a saida o pit lane corre colado a reta atras de um muro continuo (imagem); a medida, com a faixa pintada
        # na largura da pista, o deixava encostar nela: a folga minima vale ate 70 m antes da saida.
        'trecho_folga_boxes_s': (330, 745),
        # A entrada do pit fica do lado de fora da curva 11: o muro dos boxes nasce onde a faixa ja esta a 4 m da pista (com
        # o 1 m de sempre a ponta ficava a 1,8 m da borda, de frente para quem abre a curva); antes dela, o zebrado.
        'muro_boxes_ponta_m': 4.0,
        # Numa fazenda, entre cafezais, laranjais, eucaliptos e a reserva de mata: sem a cidade no horizonte.
        'horizonte': 'rural',
        # Trechos de asfalto fora do traçado de competicao (vias OSM highway=raceway), desenhados e fechados.
        'trechos_fechados': True,
    },
}


def pasta_fontes(circuito):
    pasta = FONTES / circuito
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta
