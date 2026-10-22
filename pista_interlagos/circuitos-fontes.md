# Cascavel, ECPA Piracicaba, Chapecó, Brasília e Goiânia — circuitos a partir de dados abertos

Os cinco circuitos entram no seletor da abertura ao lado de Interlagos e Curvelo
(`?circuito=cascavel`, `?circuito=piracicaba`, `?circuito=chapeco`, `?circuito=brasilia`, `?circuito=goiania`),
com os mesmos Opalas, 14 adversários, Modo Corrida, Modo História, pit stop no Box 99 e recordes separados
por circuito. A Old Stock Race correu em Cascavel na 4ª e na 7ª etapas de 2025. Em 21 e 22/03/2026
abriu a temporada em Brasília, no Autódromo Internacional Nelson Piquet; no mesmo fim de semana a MotoGP
voltou ao Brasil em Goiânia, no Autódromo Internacional Ayrton Senna (seções no fim).

## Fontes (baixadas em 27/09/2026)

| Dado | Fonte | Uso | Licença |
|---|---|---|---|
| Traçado, pit lane de Cascavel, vias, matas, edificações | OpenStreetMap via Overpass | eixo inicial, cobertura e prédios | ODbL (© colaboradores do OSM) |
| Imagem aérea (Cascavel 17/08/2025, Piracicaba 01/05/2025, Vantor/Vivid 0,34 m) | Esri World Imagery | medir eixo, larguras, prédio dos boxes; **não é distribuída** | referência visual |
| Relevo de terreno 30 m | ANADEM v1 (ANA/UFRGS), tiles 22J e 23K | perfil da pista e terreno | dado aberto |
| Relevo de superfície 30 m | Copernicus GLO-30 | só para validar o ANADEM | Copernicus |
| Cobertura do solo 10 m | ESA WorldCover 2021 v200 | matas, campo, lavoura, solo exposto | CC BY 4.0 |
| Cor real 10 m | Sentinel-2 L2A (Earth Search/AWS): S2B_22JBT_20260926, S2C_22KHV_20260925, sem nuvem sobre a pista | cor do chão ao longe (`teste/assets/circuitos/*_solo.jpg`) | Copernicus Sentinel |
| Pegadas de edificações | Microsoft Global ML Building Footprints (2026-02-03) | casas e galpões onde o OSM não mapeou | ODbL |

Textos publicados: Wikipédia (Cascavel: 3.058 m, 12 m de largura, anti-horário,
7 curvas, Bacião como curva 1 depois de reta em descida, concreto na reta de chegada,
asfalto refeito em 2022) e ECPA (2.100 m, 9 curvas, horário, anel externo de 1 km,
arquibancada na reta, "subidas e descidas"). As "100 Milhas Piracicaba" em 78 voltas
dão cerca de 2.063 m por volta.

## Como reconstruir

Um venv com `numpy scipy pillow requests pyproj rasterio shapely` (há um em
`Projetos_iA/apps/geo-venv`). Na pasta `scripts/circuitos/`:

```
python baixar_fontes.py cascavel --referencia   # fontes/cascavel/ (gitignored)
python refinar_eixo.py cascavel                 # fontes/cascavel/eixo_refinado.json + .jpg
python gerar_pista.py cascavel                  # dados/pista_cascavel.json, teste/assets/circuitos/cascavel_solo.jpg
python desenhar_planta.py cascavel              # planta de conferência sobre a imagem
```

Depois: `node scripts/testar_circuitos_abertos.mjs`, `node scripts/gerar_referencias_ia.mjs`
e, no navegador, `scripts/verificar_circuitos_abertos.py [porta]`.

## Método

- **Eixo e larguras** (`refinar_eixo.py`): o traçado OSM, ordenado no sentido da corrida,
  vira spline; em transectos a cada 2 m uma programação dinâmica escolhe deslocamento e
  largura da faixa asfaltada, com o limiar de "asfalto" calibrado em cada circuito. Trechos
  distantes na volta que correm lado a lado não podem se fundir. Em Cascavel o pit lane é
  refinado primeiro e fica sempre do lado de dentro; ao lado do prédio ele está sob a
  cobertura e é posicionado pela borda do telhado medida na imagem (faixa de 9 m).
- **Muro dos boxes e a banca do Box 99** (`gerar_pista.py`, `muro_barraca.py`): o muro fica
  entre a pista de boxes e a pista e afina até 0,6 m onde a folga entre elas passa de 6 m
  (Cascavel: ~11 m). A banca da equipe, onde se faz a inscrição no Modo História, é montada
  sobre o muro e precisa de 3,4 m: em volta do Box 99 o muro alarga para o lado da pista
  principal, com a face da pista de boxes intacta, e o alambrado acompanha. Sem isso a banca
  ficava do outro lado do alambrado. `ajustar_muro_barraca.py <id>` aplica a mesma regra a um
  JSON já gerado (idempotente), para quando as fontes não podem ser reprocessadas.
- **Suavização** (`gerar_pista.py`): o rumo do eixo é suavizado de 40 m nas retas a 5 m nas
  curvas e reintegrado, com a deriva devolvida em baixa frequência (desvio médio de 0,8 m do
  eixo medido); estações reamostradas a cada 2 m.
- **Relevo**: o perfil lê o ANADEM suavizado em 2D (~18 m) mais 12 m ao longo da volta. ANADEM
  e Copernicus concordam ao longo da pista (mediana 0,27 m em Cascavel, 0,05 m no ECPA).
  Onde dois trechos correm lado a lado a diferença de altura fica limitada a um talude de 25%.
  O terreno é o ANADEM numa grade de 4 m, colado ao plano da pista perto das vias.
- **Extensão**: Cascavel mede 3.041 m no eixo e foi escalado 0,55% para os 3.058 m oficiais
  (como Interlagos com a FIA). O ECPA mede 1.930 m e ficou assim: esticar 8% deslocaria a
  pista do relevo e dos prédios reais.
- **Nomes dos trechos**: só o Bacião tem nome publicado; os demais descrevem o lugar.

## Aproximações declaradas

Caimento transversal (1% nas retas, até 2,5% nas curvas, 4,5% no Bacião), zebras (pela
geometria das curvas; nessa resolução a imagem não as separa da terra vermelha), muros e
guard-rails, arquibancadas (Cascavel: 7 blocos do lado de fora da reta; ECPA: 3 blocos antes
da chegada), número e largura das garagens, posição do Box 99 e da lanchonete e alturas das
edificações (estimadas pela área) são escolhas de modelagem. No ECPA a faixa dos boxes diante
do paddock é fictícia: o autódromo não tem pit lane mapeado. Lagos pequenos não foram
modelados. A zona de concreto de Cascavel cobre a reta de chegada até 100 m antes do Bacião.

## Chapecó (Autódromo Internacional Márcio Vaccaro) — fontes baixadas em 02/10/2026

Inaugurado em 25/08/2026 na Linha Cachoeira, distrito de Marechal Bormann, a 20 km do centro.
A Old Stock Race está no calendário de lá de 30/10 a 01/11/2026. Projeto de Heinz Jakob Scheuren.

**O que foi publicado** (Prefeitura de Chapecó, NSC, ND Mais, 2025–2026): 4.004 m no sentido
horário, 12 a 15 m de largura, 12 curvas (7 à direita, 5 à esquerda), retas de 837, 634 e 422 m,
a curva 7 "de alta velocidade, com 517 metros e raio aberto constante", desnível máximo de
18,5 m, 32–35 boxes num pit building "fora da área do traçado", torre, 30 mil lugares e três
traçados alternativos (2.520, 1.452 e 2.829 m). O projeto de 2023 falava em 4.057 m, 13 curvas
(8 à direita), retas de 871, 551 e 424 m, curva 8 de 517 m e 23 m de desnível.

**Fontes:** o OSM tem só o contorno da pista (way 1523801531, `leisure=track`, mapeado em
27/05/2026, 66 nós), sem pit lane, prédios nem atalhos. A imagem aérea Esri é de 01/08/2024 e
mostra a terraplanagem (o leito da pista em terra vermelha, que confere com o contorno OSM):
serve só para a planta de conferência. A pista pronta aparece na cena Sentinel-2
S2B_22JCQ_20260923 (10 m, sem nuvem). ANADEM 22J, Copernicus S28W053, WorldCover S30W054 e as
pegadas da Microsoft como nos outros. O Overpass não respondeu: `osm.json` veio da API 0.6 do
OSM (`/map`), que `baixar_fontes.py` agora usa quando nenhum Overpass responde.

**Método, no que difere dos outros dois:**

- **Eixo** (`refinar_eixo.py`, `referencia: 'sentinel2'`): a mesma programação dinâmica, sobre
  o Sentinel-2 reamostrado a 2 m e com os limiares recalibrados, procurando larguras de 12 a
  15 m. Deslocamento médio de 1,8 m em relação ao OSM. A largura medida a 10 m de pixel tende
  ao alto da faixa (média 14,6 m antes da escala).
- **Extensão**: o eixo mede 4.054 m — os 4.057 m do projeto de 2023 — e foi escalado 0,8% para
  os 4.004 m divulgados, como Cascavel.
- **Curvas**: a detecção acha 14 trechos; casados com a numeração oficial, a dobra de 26° no
  meio da reta 2 não conta (assim a reta 2 tem os 634 m até a curva 2) e a de 22° antes da reta
  3 é a curva 4. A varrida longa à esquerda do lado do mato, achada em dois pedaços, é a curva
  7. Fecha 12 curvas, 7 à direita e 5 à esquerda. No projeto de 2023 a dobra da reta 2 contava
  e a varrida era a curva 8, como publicado na época.
- **Relevo** (`desnivel_m`): ANADEM e Copernicus são anteriores à obra. O terreno natural varia
  23,1 m ao longo da pista (os 23 m do projeto de 2023); a terraplanagem baixou os altos e
  aterrou os baixos, e o perfil é comprimido em torno da média até os 18,5 m publicados. Rampas
  de -9,4% a +6,7%. A base de altitude sai só da grade do terreno do jogo (`base_na_grade`):
  o vale do rio a 264 m, 1,5 km ao sul, deixaria a pista a 330 m de altura local.
- **Boxes** (`linha_chegada: 'predio_sentinel2'`): no Sentinel-2 o telhado e o concreto novo
  saturam numa faixa de 340 m do lado de fora da reta principal, começando ~15 m do eixo. A
  linha de chegada fica diante do meio dela e as garagens ocupam essa extensão. O pit lane
  (589 m) é o sintético do ECPA, com entrada logo depois da curva 12 e saída 130 m antes da
  frenagem da curva 1. A plataforma de 4,6 m entre a pista e a faixa leva o muro de 3,4 m sob
  a banca da Equipe 99 (inscrição do Modo História) a 0,6 m do asfalto.
- **Pórtico**: com a linha diante das garagens não há chão livre do lado dos boxes, então o
  poste desse lado fica sobre o muro dos boxes (`gantryPosts`, track-clearance.js).
- **Horizonte** (`horizonte: 'rural'`): lavouras e sítios esparsos, sem o anel de bairros nem
  os prédios da cidade, que fica a 20 km.

**Aproximações declaradas:** pit lane e posição dos boxes dentro do prédio, arquibancadas (8
blocos do lado de dentro da reta principal, de frente para os boxes: não há planta publicada),
caimentos, zebras, muros, largura exata e a distribuição do desnível ao longo da volta. Os
atalhos dos traçados alternativos (visíveis no Sentinel-2) não foram desenhados.

**Nesta máquina:** o controle de aplicativos do Windows bloqueia DLLs do pyproj e de partes do
scipy no `geo-venv`. `projecao.py` faz as projeções pelo GDAL do rasterio e `compat_scipy.py`
traz CubicSpline, cKDTree, brentq e savgol_filter em numpy, usados só quando o import falha; o
ECPA regenerado assim sai idêntico ao JSON publicado.

## Brasília (Autódromo Internacional Nelson Piquet) — fontes baixadas em 02/10/2026

Reaberto em 27/11/2025 depois da reforma do BRB (R$ 60 milhões na primeira etapa); a Stock Car
voltou em 29–30/11/2025 e a Old Stock abriu lá a temporada de 2026 (21–22/03).

**O que foi publicado** (Metrópoles, Distrito do Esporte, Correio Braziliense, Jornal de Brasília,
Poder360, 2025): 5.384 m no sentido horário, a pista mais longa em atividade no Brasil, 16 curvas
(9 à direita, 7 à esquerda), seis traçados, duas variantes e duas entradas de boxes; 15 m de largura
na reta de largada e 14 m no resto; retas de 803 m (a mais longa), 614 m (largada) e 502 m (oposta);
a curva 1 "de alta velocidade, com 207 metros e inclinação de 5°". 10 km de guard-rail, 40 mil m² de
caixas de brita, 90 mil pneus nas barreiras, 3,5 km de zebras. Os 40 boxes novos ficaram para a
segunda etapa (2026); o traçado de 1974 tinha 5.476 m e 12 curvas.

**Fontes:**

| Dado | Fonte | Uso |
|---|---|---|
| Traçado (via 32900091, redesenhada em 20/02/2026), pit lane (vias 1450655789, 1450655791, 32900119) | OpenStreetMap (Overpass) | eixo inicial, pit lane |
| Imagem aérea Esri World Imagery z18 (0,57 m), já com o asfalto novo e o prédio antigo dos boxes demolido | Esri | medir eixo e pátio dos boxes; conferir o que ainda existe; **não é distribuída** |
| Modelo digital do terreno de 1 m do DF, pelo geoprocessamento `Profile1m` (perfis leste-oeste a cada 2 m, ±1.100 m) | IDE/DF — Geoportal da SEDUH/GDF | perfil da pista e terreno (`mdt_idedf.tif`) |
| Edificações do cadastro territorial com altura aproximada (`ed_alt_aprox`) | IDE/DF, CADASTRO_TERRITORIAL/5 | prédios do cenário (3 km) e do horizonte (3,5 km, ≥ 9 m ou ≥ 1.500 m²) |
| Árvores isoladas e massas arbóreas (cartografia de 2016) | IDE/DF, IDEDF/236 e 237 | árvores do cenário |
| Torre de TV (OSM way 41648342) | OpenStreetMap | marco no horizonte (224 m, mirante a 75 m) |
| ANADEM 23L, Copernicus S16W048, WorldCover S18W048, Sentinel-2 S2A_22LHH_20260930 | como nos outros | conferir o relevo, cobertura, cor do chão |

As curvas de nível de 1 m (2016) da IDE/DF vêm inteiras do servidor (linhas de quilômetros, 13 MB
para 24 curvas) e não cabem numa consulta; o serviço de perfis devolve o MDT direto. O MDT e o
ANADEM concordam ao longo da pista (mediana 0,13 m, p95 1,1 m).

**Como reconstruir:** `baixar_fontes.py brasilia --referencia` (inclui a IDE/DF; `--idedf` baixa só
ela, ~12 min), `refinar_eixo.py brasilia`, `gerar_pista.py brasilia`, `desenhar_planta.py brasilia`.

**Método, no que difere dos outros:**

- **Eixo** (`refinar_eixo.py`): a via OSM passa duas vezes pelo nó do entroncamento com o anel externo
  (nó 0 = nó 97); a volta vai do nó 1 ao 96, porque o nó 0 faz um bico no desenho. Na reta interna de
  cima o OSM tem poucos nós e corre até 18 m fora do asfalto: busca de ±18 m (`desloc_max_m`), só o
  asfalto novo e escuro conta como pista (`lum_max_asfalto` 85; pátio e escapes são mais claros) e o
  asfalto mais perto do desenho do pit é do pit (`separar_pit_lane`). Mede 5.336 m; escala de 0,85%
  para os 5.384 m publicados.
- **Larguras** (`largura_publicada`): 15 m na reta de largada e 14 m no resto, com transição de 40 m;
  a medida na imagem pega os escapes pavimentados encostados no asfalto (média 15,3 m).
- **Relevo** (`relevo_local: idedf_mdt_1m`): o perfil lê o MDT suavizado 4 m em 2D e 6 m ao longo da
  volta. 17,7 m de desnível, rampas de -3,2% a +2,8%: a reta de largada desce 7 m até a curva 1 (o
  ponto mais baixo), a reta longa sobe devagar, o laço é o ponto mais alto. O MDT é anterior à reforma.
- **Curva 1**: caimento de 8,75% (tan 5°) em toda a curva, o publicado.
- **Curvas**: a detecção acha 12 trechos (6 e 6); quatro têm dois ápices separados e contam como duas
  curvas na contagem oficial (canto de baixo à direita, o laço, o grampo à direita e o grampo à esquerda
  do miolo). Fecha 9 + 7 = 16. Sem planta numerada publicada, a numeração segue a ordem da volta.
- **Boxes** (`lado_boxes: -1`): por dentro da reta de largada, à direita dos carros no sentido horário.
  O pit lane é o do OSM (1.126 m, entrada por dentro da curva 16, saída por dentro da curva 1 até a
  reta longa). O bloco `pit` do JSON é escrito da saída para a entrada (`reversed: true`) para as
  garagens ficarem do lado positivo, como nos outros circuitos: meia volta do bloco, nunca espelhado.
  `pit-lane.js`, `race-field.js` (`pitRoute`), `interlagos-pit.js` e `pit-box99.js` tratam o sentido.
  As garagens ocupam o pátio de concreto claro medido na imagem (318 m, 25 boxes de 12,9 m); a faixa
  se afasta até 1,45 m da pista diante delas (`folga_minima_boxes_m` 4,6) para o muro da banca do
  Box 99 ter 3,4 m. A linha de chegada fica no meio das garagens; o poste do pórtico do lado dos
  boxes vai sobre o muro, como em Chapecó.
- **Cenário** (`edificios_locais: idedf`): as edificações do cadastro do DF substituem OSM e Microsoft,
  com a altura do cadastro; perto da pista (300 m) ficam de fora as que a imagem de 2025 mostra como
  terra exposta (29 demolidas na reforma). Redondas viram tambor (Estádio Mané Garrincha, 49,5 m;
  Ginásio Nilson Nelson), as altas viram prédio, as compridas e estreitas, galpão. As árvores isoladas
  de 2016 entram onde a imagem ainda mostra copa (543). Mata e cerrado de 2021 onde a imagem de 2025
  mostra terra vermelha viram solo exposto (o miolo foi terraplenado).
- **Horizonte**: além da grade do terreno, 3.233 edificações reais do cadastro (superquadras, Setor
  Noroeste, Eixo Monumental) no lugar dos telhados genéricos, e a Torre de TV.
- **Arquibancadas**: 11 blocos do lado de fora da reta (norte), da estrutura antiga diante da linha até
  ~250 m depois dela, onde a imagem mostra os assentos azuis; a estrutura antiga sai do cenário.

**Aproximações declaradas:** os 40 boxes novos (não aparecem na imagem; o jogo usa a fileira padrão
de garagens sobre o pátio), posição do Box 99, da lanchonete e da banca, caimentos fora da curva 1,
zebras, muros, a numeração das curvas, os traçados alternativos (os atalhos do OSM não foram
desenhados), o relevo da pista nova (o MDT é de antes da reforma) e a altura dos prédios do horizonte
sobre o chão genérico além da grade do terreno.

## Goiânia (Autódromo Internacional Ayrton Senna) — fontes baixadas em 03/10/2026

Inaugurado em 1974, com o nome de Ayrton Senna desde 1989. Entre 2025 e 2026 passou pela maior reforma
da história (R$ 250 milhões) para receber a MotoGP, que voltou ao Brasil em 20–22/03/2026. Depois da
corrida, com o asfalto soltando entre as curvas 10 e 12, o Governo de Goiás mandou refazer o pavimento
inteiro.

**O que foi publicado** (motogp.com, Motorsport, Band, Wikipédia, imprensa de Goiânia, 2025–2026): 3.835 m no
sentido horário, 14 curvas (9 à direita, 5 à esquerda), a maior reta com 994 m, "precedida de uma curva
inclinada"; a reta principal passou de 12 para 15 m de largura e as curvas para 14 m; 30 boxes (antes 22),
num prédio novo ao lado do antigo, no início da reta principal; nova torre de controle e centro médico.
"A borda externa, da curva 11 à curva 4, só tem curvas à direita" e a curva 5 é a primeira à esquerda
(Motorsport). Traçado externo de 2.590 m e curto de 1.910 m.

**Fontes:**

| Dado | Fonte | Uso |
|---|---|---|
| Traçado misto (relação de circuito 15921950: vias 288004311 e 288004307, oneway) e pit lane (via 879890871) | OpenStreetMap (Overpass) | eixo e pit lane iniciais |
| Ortofoto de 2016, 0,25 m por pixel (serviço `Mapa_Ortofoto2016v8_D`) | Mapa Fácil — Prefeitura de Goiânia | medir eixo, larguras e pit lane; **não é distribuída** |
| Imagem aérea Esri World Imagery z18 (Vantor GE01, 06/09/2025, precisão de 8,5 m), com a obra da reforma | Esri | medir a extensão das garagens (os dois prédios); **não é distribuída** |
| Curvas de nível de 5 m (levantamento da Topocart, `Mapa_MeioAmbiente/7`) | Mapa Fácil — Prefeitura de Goiânia | relevo (`mdt_goiania.tif`) |
| Grandes equipamentos do autódromo (boxes, garagens, administração, cronometragem, arquibancada) | Mapa Fácil (`Mapa_PontosNotaveis/2`) | prédios do autódromo e a arquibancada |
| Lotes do cadastro imobiliário: só o número de pavimentos, a área construída e o uso | Mapa Fácil (`Feature_Base/3`) | altura das casas e prédios em volta |
| Edifícios em altura com número de pavimentos (2.148 até ~9 km) | Mapa Fácil (`Mapa_Edificios/2` a `5`) | o horizonte da cidade |
| Vegetação (cerrado, mata, reflorestamento) | Mapa Fácil (`Mapa_MeioAmbiente/9`) | matas do cenário |
| Pegadas de edificações (quadkeys 210133001 e 210133010) | Microsoft Global ML Building Footprints | casas e galpões; pegadas dos edifícios em altura |
| ANADEM 22K, Copernicus S17W050, WorldCover S18W051, Sentinel-2 S2A_22KFG_20260930 | como nos outros | relevo de fundo, conferir o relevo, cobertura, cor do chão |

**Como reconstruir:** `baixar_fontes.py goiania --referencia` (inclui a Prefeitura e a ortofoto; `--goiania`
baixa só os dados da Prefeitura e refaz o modelo do terreno), `refinar_eixo.py goiania`, `gerar_pista.py goiania`,
`desenhar_planta.py goiania` (a planta sai sobre a ortofoto).

**Método, no que difere dos outros:**

- **Eixo** (`referencia: 'orto_goiania'`): a mesma programação dinâmica sobre a ortofoto de 2016 da Prefeitura,
  georreferenciada com as curvas de nível e os equipamentos dela; a imagem Esri de 2025 mostra a obra (terra
  vermelha por toda parte) e tem 8,5 m de precisão. O traçado não mudou na reforma. O eixo mede 3.835,9 m;
  depois da suavização das retas, a escala de 0,27% fecha os 3.835 m publicados.
- **Larguras** (`largura_publicada`): 15 m na reta principal e 14 m no resto, as da reforma (a ortofoto é de
  antes, com 12 m).
- **Relevo** (`relevo_local: goiania_curvas_5m`): o ANADEM dá a forma do terreno entre as curvas e a diferença
  para cada curva de 5 m é interpolada como superfície harmônica (multigrade), de modo que o modelo de 2 m passa
  exatamente pelas curvas (curva − ANADEM: mediana +0,02 m). Ao longo da pista o modelo, o ANADEM e o Copernicus
  concordam dentro de 1–2 m. A suavização é de 8 m em 2D e 15 m ao longo da volta (`suavizacao_m`): as curvas de
  5 m não resolvem ondulações menores, e um degrau entre duas curvas virava rampa de 8% na entrada da curva 4.
  17,8 m de desnível, rampas de −4,9% a +5,8%: a linha de chegada é o ponto mais alto (760 m), a pista desce
  13 m da curva 1 à 3, sobe no grampo da 4, cai de novo na 5 e na 6, desce devagar a reta oposta e sobe pela
  curva inclinada e pela reta principal até a linha.
- **Curvas**: a detecção acha 10 trechos (6 à direita e 4 à esquerda); cinco têm dois ápices separados por um
  trecho mais aberto e contam como duas curvas: 1 (R 90 m) e 2 (R 125 m) no fim da reta, 6 (R 34 m) e 7 (R 60 m)
  no grampo do miolo, 11 (R 31 m) e 12 (R 88 m) depois do S, 13 (R 38 m) e 14 (R 95–120 m) na inclinada. Fecha
  9 + 5 = 14, com a borda externa da 11 à 4 só à direita e a 5 à esquerda, como publicado; da saída da 14 à
  curva 1 são 995 m, a reta de 994 m. Sem planta numerada publicada, os ápices duplos são interpretação.
- **Curva inclinada**: 6% de caimento nas curvas 13 e 14 (o ângulo não foi publicado).
- **Boxes** (`lado_boxes: -1`): por dentro da reta principal, à direita no sentido horário, com o bloco `pit`
  escrito da saída para a entrada (`reversed`), como em Brasília. O pit lane é o do OSM (686 m: entra antes da
  curva 13, corta por dentro dela, corre diante das garagens e volta no meio da reta). Na ortofoto de 2016 a faixa
  vai do muro até as portas das garagens; o desenho do OSM corre colado à pista, então diante dos prédios ela é
  levada até a borda dos telhados (`faixa_nas_garagens`, 9 m de largura). As garagens ocupam os dois prédios
  medidos na imagem de 2025 (274 m: o novo, de 2025, 18 m antes do antigo), na fileira padrão do jogo (21 boxes
  de 13 m; são 30 na realidade). A plataforma de 4,6 m leva o muro da banca do Box 99; o poste do pórtico do lado
  dos boxes vai sobre o muro, como em Chapecó e Brasília.
- **Cenário** (`edificios_locais: goiania`): os prédios do autódromo vêm do levantamento da Prefeitura (alturas de
  modelagem); as pegadas do OSM e da Microsoft ganham a altura do lote do cadastro que as contém (2.755 pegadas;
  3,1 m por pavimento) ou do edifício em altura que cai dentro delas. As matas mapeadas pela Prefeitura entram
  na cobertura.
- **Arquibancadas**: 3 blocos do lado de fora da reta, de 170 a 254 m depois da linha, onde fica a arquibancada
  coberta do levantamento (76 m, a 45 m do asfalto, além da via de serviço); as do jogo ficam a 20 m, e a coberta
  sai do cenário.
- **Horizonte**: no lugar dos telhados genéricos, 1.344 edifícios em altura do cadastro da Prefeitura além do
  terreno (Jardim Goiás, Marista, Bueno, Centro), com a pegada da Microsoft que os contém (ou um bloco do tamanho
  do andar tipo) e 3 m por pavimento, e 6.107 casas e galpões da Microsoft até 2,2 km (Alphaville Flamboyant,
  Jardim Novo Mundo e vizinhos).

**Aproximações declaradas:** a numeração das curvas (ápices duplos), o caimento da curva inclinada, a posição do
pit lane diante do prédio novo e o número de garagens, a posição do Box 99, da lanchonete e da banca, a
distância da arquibancada, as alturas dos prédios do autódromo, caimentos fora da curva inclinada, zebras, muros,
o pavimento refeito depois da MotoGP (sem imagem nova) e a altura do horizonte sobre o chão genérico além da grade.

**Nesta máquina (03/10/2026):** o controle de aplicativos do Windows passou a bloquear também as DLLs do
rasterio e do `scipy.ndimage`. `geo_io.py` lê e grava GeoTIFF e recorta COGs remotos por requisições parciais com
o tifffile (Python puro) e numpy, `projecao.py` faz as conversões UTM/geográficas pelas séries de Krüger (iguais
às do serviço de geometria da Prefeitura abaixo de 1 µm) e `compat_scipy.py` traz os filtros e a interpolação do
`scipy.ndimage` em numpy. Com o rasterio e o scipy carregando, os scripts continuam usando os dois.

## Guaratiba (Autódromo Parque de Guaratiba, Rio de Janeiro, em projeto) — fontes baixadas em 22/10/2026

Autódromo novo do Rio, ainda no papel: plano diretor e traçado apresentados em 06/11/2025 (Prefeitura do Rio,
Populous no projeto, Driven International no traçado, consórcio da Genial Investimentos com a Rock World), obras depois
do licenciamento, inauguração prevista para 2028. Lei Complementar 273/2024 (Operação Urbana Consorciada do Autódromo
Parque de Guaratiba). Publicado: 4,71 km, 10 curvas, 4 retas com duas principais paralelas, até 11 configurações, grau 1
da FIA, F1 simulada em ~1:09,5. Terreno ao lado da Av. Dom João VI, perto do BRT Mato Alto, entre ela e a Estrada da
Matriz; o "Turn 10 club" fica "de frente para a última curva e as retas principais".

- **Sem planta publicada.** A única fonte do traçado é o render aéreo oficial
  (`driven-international.com/.../POPULOUS-Rio-MSP-Render-AERIAL-scaled.png`, 2560×1027). A câmera dele foi ajustada
  sobre a ortofoto 2025 do IPP casando a Av. Dom João VI (OSM), a borda arredondada da mata a nordeste do terreno (dica
  da equipe, a âncora que fez o ajuste convergir) e as duas retas paralelas; a ortofoto projetada por ela casa com a
  mata, o Rio Piraquê, a avenida e o bairro. `scripts/circuitos/referencias_guaratiba.py` guarda a câmera e monta a pasta
  de referências do editor: o render visto de cima (0,5 m/px), a ortofoto 2025, o render em perspectiva (homografia) e o
  limite oficial do terreno (IPP, `Urbanismo/IU_Operacoes_urbanas_temp/MapServer/59`, setor I).
- **Eixo pintado à mão** no editor de traçado (`tracado_guaratiba_*.json` na pasta de referências; o mais novo vale):
  `eixo_do_editor.py guaratiba` tira pontos repetidos, arredonda os cantos da polilinha (3 m) e grava
  `eixo_refinado.json` com a chegada pintada; `gerar_pista.py` usa `linha_chegada: 'editor'`. A volta pintada mede
  4.692 m e foi esticada 0,8% para os 4.710 m oficiais.
- **Leitura do render (aproximações declaradas):** sentido anti-horário, largada na reta de dentro (oeste) diante do
  prédio comprido dos boxes, com o paddock atrás; a curva 10 é o grampo entre as retas paralelas. A detecção acha 9
  trechos de curva; o laço do oeste (203°) conta como as curvas 6 e 7. Larguras de grau 1 (15 m na reta de largada, 14 m
  no resto). Pit lane sintético à direita da reta de largada (`pit_sintetico` com `lado: -1`, bloco reverso como em
  Brasília), garagens de ~270 m antes da linha a ~35 m depois. Arquibancadas no começo da reta oeste, do lado de fora.
- **Relevo:** o de hoje, antes da obra: baixada a 1–2 m acima do mar ao lado do mangue (ANADEM e Copernicus concordam);
  a volta tem 1,2 m de desnível (`meta.flat_site`, o teste aceita relevo de baixada). Cobertura WorldCover, cor do chão
  Sentinel-2 S2B_23KPQ_20261004, casas do Microsoft Building Footprints (o bairro do Piraquê e a Pedra de Guaratiba).

| Dado | Fonte | Uso |
|---|---|---|
| Render aéreo do projeto | Populous / Driven International (2025-2026) | traçado (só medição local, não distribuído) |
| Ortofoto 2025 (15 cm), limite da OUC | IPP / Prefeitura do Rio (pgeo3.rio.rj.gov.br, CC BY 4.0) | câmera do render, conferência |
| Vias, mata, água | OpenStreetMap (Overpass, base 22/10/2026) | câmera, cenário |
| Relevo 30 m, superfície 30 m, cobertura 10 m, cor 10 m, edificações | ANADEM, Copernicus GLO-30, ESA WorldCover, Sentinel-2, Microsoft Building Footprints | terreno, cenário |

## Chapada dos Sonhos (imaginário, Chapada dos Guimarães, MT) — fontes baixadas em 11/10/2026

Pedido #5 da Central de Projetos: um autódromo **que não existe**, no alto do paredão da Chapada dos Guimarães, sem
guard-rail e com a pista na beira do precipício. O relevo, os paredões, a mata, a cor do chão e o vale lá embaixo
são os reais; o traçado, o perfil da pista, os boxes e a beirada são desenho de jogo. Gerado por
`scripts/circuitos/gerar_chapada.py` (depois de `baixar_fontes.py chapada`), não por `refinar_eixo.py`/`gerar_pista.py`.

- **Lugar**: o bloco de planalto (~820 m) entre a borda sul — o paredão que se vê da MT-251 chegando de Cuiabá —
  e a borda leste de um bico, 2 a 3 km ao sul da cidade (origem local UTM 21S 630520 E, 8288300 N). Embaixo, o vale
  a 350–450 m e a depressão de Cuiabá até o horizonte.
- **Fontes**: ANADEM v1 (tile 21L) na caixa do circuito e numa janela de 44 km para o horizonte; Copernicus GLO-30
  (tile S16W056, inteiro, onde o ANADEM não tem dado); ESA WorldCover 2021 (S18W057); Sentinel-2 L2A
  S2C_21LXC_20261007 (0% de nuvem na caixa), completado ao norte da janela larga pelas cenas 21LXD e 21LWD do
  mesmo dia; OSM e Microsoft Building Footprints da caixa. A imagem Esri não cobre a área em z18.
- **Traçado**: poligonal com raio fixo em cada vértice (concordância de estrada), seguindo o topo do paredão medido no
  relevo de 30 m (`VERTICES` no gerador). 5.142 m em planta, 5.153 m em 3D, sentido horário, o abismo sempre à
  esquerda (o lado do piloto): reta principal de 2 km por dentro do planalto, Curva 1 (R 42 m) de frente para o
  abismo, paredão leste, o Bico (R 30 m) na ponta, a borda sul, o S do Mirante (R 55 e 65 m) num degrau de 240 m
  da borda e a Curva da Volta. 12 m de largura, 14 m na reta.
- **Perfil**: terraplanagem de jogo. Nos trechos de beirada (e na chegada da Curva 1) a altura é a do planalto logo
  atrás da borda (o relevo de 30 m borra o topo do paredão e deixaria a pista dezenas de metros abaixo dele);
  suavizado e com rampa máxima de 8% (envelope de corte e aterro). 64 m de desnível. Em volta da Curva 1, uma
  plataforma no nível da pista até 220 m.
- **Beirada** (`scenery.cliff`): a borda esquerda do asfalto mais 2 a 6,5 m de terra (6 m na Curva 1, 5 m no Bico,
  2,4 m no lado de dentro da esquerda do S), da Curva 1 à Curva da Volta; além da pista, o topo medido no relevo (a
  borda do bloco leste até o fundo da enseada ao norte da Curva 1, a borda sul a oeste), emendado. Paredão de
  40–168 m (sorteado de 95 a 175 m, mais baixo onde o vale é raso) e, do pé dele, uma encosta reta até encontrar o
  relevo real a 180–280 m da beirada.
- **No jogo**: `cliff-edge.js` (a linha, o lado de cada ponto e as duas cópias do chão para a física), `cliff-fall.js`
  (queda, câmera de drone, volta à pista 8 m antes, a volta fora do recorde), `cliff-scenery.js` (paredão de arenito,
  faixa de terra vermelha na quina, chão da beirada), `far-terrain.js` (anéis do vale até 22 km). Sem guard-rail em
  lugar nenhum (`meta.rails` vazio).

**Aproximações declaradas:** o circuito inteiro (não existe); a altura e a forma do paredão (o relevo de 30 m não o
resolve); a beirada a poucos metros do asfalto; o perfil da pista; boxes, arquibancadas e pórtico.

## Autódromo Floripa (circuito de rua imaginário, Florianópolis, SC) — fontes baixadas em 11/10/2026

Pedido da equipe, com o traçado desenhado no Google Maps. Não existe: as ruas, as pontes, o relevo, o mar e os prédios
são os reais de Florianópolis; fechar a volta com muros, o pit lane e as arquibancadas são desenho de jogo. Gerado
por `scripts/circuitos/gerar_floripa.py` (depois de `baixar_fontes.py floripa --referencia`, que também baixa os
dados da Prefeitura; `--geofloripa` baixa só eles).

- **Traçado**: as vias do OpenStreetMap em sequência (`CADEIA` no gerador): Ponte Hercílio Luz rumo à ilha, Alameda
  Adolfo Konder, Rua Hoepcke, Rua Claudino Bento da Silva e a alça para a Av. Paulo Fontes, a Paulo Fontes diante da
  Rodoviária Rita Maria, o laço da Rua Pedro Bittencourt, a Ponte Colombo Salles (no sentido real dela, ilha →
  continente), a alça da Via Expressa, a Rua 14 de Julho e a Av. Gov. Ivo Silveira de volta à cabeceira continental.
  Esquinas arredondadas (13 m nas de mais de 50°, 24 m nas outras, limitadas pelos lados) e rumo suavizado; o eixo
  vai para o meio do leito entre os meios-fios (até 3,5 m). A esquina da Adolfo Konder com a Hoepcke, a mais fechada
  (93° com ~9 m de raio no eixo), foi aberta para 22 m sobre o lote de dentro (`ESQUINAS`, desenho de jogo). 4.442 m
  em planta, 4.445 m em 3D, sentido horário.
- **Larguras**: o leito entre os meios-fios do cadastro (medido em 83% das estações), com o mínimo de corrida de
  9,5 m e o máximo de 15 m; na Hercílio Luz, os 9,2 m do leito entre as treliças (as calçadas correm por fora delas)
  viram 9,5 m.
- **Relevo**: MDT de 1 m do aerolevantamento do Estado (SDS, 2010–2012) pelo GeoFloripa, com o ANADEM fora da caixa
  dele. A Rua Hoepcke desce do morro a 12% (limite do gerador). As ruas da cidade, as calçadas, os canteiros e os
  estacionamentos são aplainados (`gerar_cidade_floripa.py` → `gerar_pista.aplainar_ruas`, 16/10/2026): o MDT nos nós
  de 4 m trazia meio-fio, carro e ruído da restituição (o "sobe e desce" acima de 30 cm em 14% das ruas, 2% depois).
  Cada nó vai a um plano robusto do chão em volta (8 m, sem misturar outro nível nem achatar as rampas), no máximo
  0,8 m; a beira até 8 m das calçadas entra aos poucos (sem degrau nem vala na emenda), a beira entre dois níveis fica
  como medida; a volta com a faixa colada nela, os boxes e o mar ficam como estavam.
- **Pontes**: o tabuleiro sai do MDS de 1 m onde ele passa sobre terra (o MDS não mede nada sobre a água). Hercílio
  Luz: 822 m de estrutura medida (821 m publicados), uma parábola ajustada aos 198 pontos medidos das duas cabeceiras
  (resíduo 0,36 m) dá o vão abaulado a 30,4 m (30,86 m publicados); torres pelos vãos oficiais (222,5 m de viaduto
  continental, 339,47 m de vão pênsil). Colombo Salles: as rampas medidas nas margens (3,5% da ilha, 2,2% do
  continente) e o topo a 22 m no vão de navegação (gabarito de 17,5 m do OpenSeaMap mais a viga), duas Hermite
  monótonas. Ali a pista anda no tabuleiro até o muro (`meta.decks`) e o terreno fica no mar.
- **Mar**: a água do MDT (cota 0) na caixa dele e a linha de costa do OSM fora; o fundo da batimetria da Marinha
  (GeoFloripa, faixas de 0–2 a 20–30 m), suavizado.
- **Edificações**: as 13.936 pegadas do cadastro da Prefeitura (2020), cada uma com a altura do MDS menos o MDT
  (percentil 75 dentro dela; os andares do OSM quando o MDS de 2010–2012 não mostra o prédio). Na grade de 5 m as que
  ficam fora da pista e dos muros (as calçadas ficam), dos boxes e das arquibancadas; além dela, o horizonte da cidade.
  A Rodoviária, o TICEN, o Mercado Público, a Casa da Alfândega, a Catedral e o Forte de Santana têm modelo próprio
  (`floripa-landmarks.js`), como as pontes (`floripa-bridges.js`) e as antenas do Morro da Cruz.
- **No jogo**: muros de concreto com alambrado dos dois lados (`street-walls.js`, folga por estação nas colunas
  `wall_right_m`/`wall_left_m`), o mar (`sea-water.js`), anéis de relevo e cor até 22 km (`far-terrain.js`).
- **A cidade (15/10/2026, pedido da equipe: "como se fosse Mônaco")**: `scripts/circuitos/gerar_cidade_floripa.py`, o
  passo final de `gerar_floripa.py` (a volta sem a cidade fica em `fontes/floripa/pista_floripa_base.json`), acrescenta
  `scenery.city`. O leito de cada via de carro do OSM é medido por transectos até os meios-fios do cadastro (311 das
  738 vias; nas outras, as faixas do OSM), as esquinas concordadas (fecho de 3 m) e os canteiros (anéis fechados de
  meio-fio) devolvidos; calçadas por classe de via e pela etiqueta `sidewalk`, praças do GeoFloripa, caminhos de
  pedestre, ciclovias, gramados e estacionamentos do OSM, e um calçadão de 20 m ao longo da costa. Tudo vira uma
  imagem de 1 m/px com seis campos de distância com sinal (`teste/assets/circuitos/floripa_cidade.png`), que o chão
  do jogo desenha (`landscape.js` LAND_CITY). Também: faixas de pedestre, semáforos e paradas de ônibus (nós do OSM),
  as faixas e a mão de cada via da volta, os bloqueios onde as ruas reais cruzam o corredor dos muros (menos as que
  passam por baixo das pontes), postes com fiação, árvores de calçada e de praça, carros parados, placas de esquina,
  a costa e os trapiches, e as pegadas reais do cadastro para os prédios (`city-buildings.js`). Os módulos do jogo:
  `city-map.js`, `city-buildings.js`, `city-streets.js`, `street-closures.js` + `city-cars.js`, `city-furniture.js`,
  `beira-mar.js` e `city-crowd.js` (gente em pé nas calçadas); os muros ficam de concreto cru (`meta.wall_paint`).

| Dado | Fonte | Uso |
|---|---|---|
| Vias, costa, marcos, prédios com andares; calçadas, faixas de pedestre, semáforos, paradas, ciclovias, praças, estacionamentos, trapiches | OpenStreetMap (Overpass, base 11/10/2026) | eixo, mar fora da caixa, marcos; a cidade |
| MDT e MDS 1 m (SDS 2010–2012), cadastro de edificações (2020), meios-fios, batimetria, parques | GeoFloripa, Prefeitura de Florianópolis (PMF/SMPIU), WCS/WFS sem login | relevo, pontes, prédios, larguras, fundo do mar |
| Relevo 30 m, superfície 30 m, cobertura 10 m, cor 10 m | ANADEM, Copernicus GLO-30, ESA WorldCover, Sentinel-2 S2C_22JGQ_20260925 | fora da caixa da Prefeitura, cor do chão e do horizonte |
| Dimensões das pontes e dos marcos | Wikipédia, Teixeira Duarte (restauro 2019), ABCEM, SciELO, OpenSeaMap | modelos |

**Aproximações declaradas:** o circuito inteiro; larguras mínimas de corrida; o greide das pontes sobre o mar; os
muros; os boxes diante da rodoviária (a ponte, onde fica a largada, não tem espaço para um pit lane); as
arquibancadas na Paulo Fontes; alturas de prédios construídos depois de 2012. Na cidade: as larguras das vias sem
meio-fio medido (pelas faixas do OSM), as calçadas por classe de via, o calçadão como faixa fixa ao longo da costa;
bloqueios, postes, fiação, árvores de calçada, carros parados, fachadas e o mobiliário da orla são desenho de jogo.

## Circuito do Minhocão (circuito de rua imaginário, São Paulo, SP) — fontes baixadas em 11/10/2026

Pedido da equipe, com o traçado escolhido sobre o mapa das ruas: uma volta que passa POR CIMA e POR BAIXO do Elevado
Presidente João Goulart (o Minhocão). Não existe: as ruas, o elevado, o túnel da Ligação Leste-Oeste sob a Praça
Roosevelt, o relevo e os prédios são os reais do centro de São Paulo; fechar a volta, subir a rampa de saída da Rua
Ana Cintra e andar no Minhocão ao contrário, a ligação de ~30 m dentro do túnel até a Rua Martins Fontes, os muros,
os boxes e a arquibancada são desenho de jogo. Gerado por `scripts/circuitos/gerar_minhocao.py` (depois de
`baixar_fontes.py minhocao --referencia`, que também baixa os dados da Prefeitura; `--geosampa` baixa só eles e
`--geosampa --so-vetores` só as camadas vetoriais).

- **Traçado**: as vias do OpenStreetMap por uma volta de pernas (`PERNAS` no gerador, roteadas por `rota_osm.py`: o
  menor caminho entre pontos de passagem, com os nomes de rua preferidos). Largada na Rua Major Sertório, 150 m depois
  de passar sob o Minhocão; Av. Ipiranga, a Praça da República pelo lado das árvores, a Av. Vieira de Carvalho, o
  Largo do Arouche, a Av. Duque de Caxias, a Av. São João, a rampa da Rua Ana Cintra (de saída, subida ao contrário),
  790 m sobre o Minhocão rumo à Roosevelt (a pista sentido bairro, ao contrário), a descida reta no túnel sob a Rua da
  Consolação e a praça, a saída na Rua Martins Fontes, a Rua Augusta, a Rua Caio Prado, a Rua Dr. Cesário Mota Júnior e
  de novo a Major Sertório, que passa POR BAIXO do mesmo tabuleiro (um cruzamento em dois níveis, 7,9 m entre eles). A
  volta é um oito: não dá volta inteira em torno de nada. Esquinas arredondadas e rumo suavizado (como Floripa); no
  Minhocão o eixo vai para o meio do tabuleiro (a corrida usa as duas pistas, sem o separador) e nas ruas para o meio
  do leito entre os meios-fios (até 3,5 m). 4.034 m em planta, 4.035 m em 3D.
- **Larguras**: o leito entre os meios-fios das quadras viárias do GeoSampa (medido em 56% das estações; Major
  Sertório 10,1 m, Ipiranga 11,4 m, Caio Prado 10,9 m), com o mínimo de corrida de 9,5 m e o máximo de 14,5 m; o
  tabuleiro inteiro, 14 m de asfalto entre os muros (15,7–16,1 m de borda a borda medidos); a rampa 9,5 m; o túnel 11 m.
- **Relevo**: o MDT do levantamento LiDAR de 2020 da Prefeitura (GeoSampa, quadros 1:1000 em LAZ, ~10 pontos/m²) numa
  grade de 1 m; sob os prédios, sem pontos de chão, preenchido por convolução normalizada; o ANADEM fora da caixa. O
  chão cai 30 m da Augusta (768 m) à São João sob o Minhocão (738 m). O leito das ruas (os vãos entre as quadras
  viárias do GeoSampa) e 3,5 m de calçada dentro das quadras são aplainados antes de colar o chão na pista
  (`gerar_pista.aplainar_ruas`, 16/10/2026, como em Floripa): o "sobe e desce" acima de 10 cm caiu de 26% para 2,3% das ruas.
- **Minhocão**: o pavimento da rampa, do tabuleiro e da descida MEDIDO no MDS 2020 (a superfície, 0,5 m) e rastreado
  estação por estação (o grupo de pontos mais perto da rampa que vinha: o pé da rampa da Ana Cintra passa sob a curva do
  próprio Minhocão, e no fim, antes da Consolação, as duas pistas descem com um vão entre elas): 7,5 a 9,2 m acima do
  chão sob ele. Ali a pista anda no plano do tabuleiro até os muros (`meta.decks`) e o terreno fica o medido, pelo
  menos 2,5 m abaixo dele. O resto do elevado (2,7 km de tabuleiro, as alças da São João, da Amaral Gurgel, da
  Consolação e da Marechal Deodoro), os 105 pilares numa fila só (fora das ruas que cruzam por baixo e da volta) e o
  túnel vão em `scenery.minhocao` para os modelos (`minhocao-structures.js`). A faixa livre ao lado do tabuleiro é de
  2,5 m (`meta.deck_band_m`): os prédios encostam nele, como na cidade.
- **Túnel**: da boca medida sob a Consolação (755 m) à Martins Fontes, sempre pelo menos 5,8 m abaixo do chão de cima
  (gabarito de 4,3–4,5 m mais a laje); 290 m abaixo do chão, 218 m cobertos, até 9,6 m sob a praça
  (`meta.tunnels`). O terreno só desce num corredor sobre a pista (até 5 m atrás dos muros); fora dele fica a praça e
  as ruas por cima.
- **Edificações**: as do OpenStreetMap, quase todas com a altura da importação da Prefeitura (PMSP, mapa digital de
  2004; os mais altos subestimados); ~6.600 na grade de 4 m, fora da pista e dos muros (as calçadas ficam), dos boxes e
  da arquibancada; ~11.900 no horizonte, além dela, com o chão de cada uma. Os marcos têm modelo próprio
  (`minhocao-landmarks.js`, `scenery.landmarks`, contornos do OSM): o Copan (118 m), o Edifício Itália (165 m), o antigo
  Hilton (110 m), a Casa Caetano de Campos, a Igreja da Consolação (torre de 75 m), o Edifício Esther, o Andraus e o
  coreto da Praça da República.
- **Chão e árvores**: a cor do chão é a ortofoto de 2020 da Prefeitura (WMS do GeoSampa, pedida a 1 m e reduzida a
  ~1,4 m por pixel); fora das praças e largos do cadastro a cobertura é chão construído (o WorldCover chama de mata a
  copa das árvores de rua) e a Praça Roosevelt, uma laje de concreto; as árvores de rua são as 3.222 do cadastro de
  arborização do GeoSampa dentro da grade (`scenery.trees`), menos as 235 no leito ou no meio-fio (16/10/2026), cada
  uma com a distância do tronco à rua (coluna `road`: o jogo limita a copa a ~2 m sobre o asfalto, `landscape.js`
  `fitStreet`, como faz em Floripa pelo mapa da cidade); a mata das praças a menos de 3 m da rua vira gramado.
- **No jogo**: muros de concreto com alambrado dos dois lados (`street-walls.js`; sem alambrado no tabuleiro e no
  túnel), os boxes à direita da Major Sertório entre o Minhocão e a Ipiranga, a arquibancada diante deles, o
  cruzamento em dois níveis tratado pelo motor (busca de estação com altura, IAs que não freiam por um carro no outro
  nível, `scripts/testar_cruzamento.mjs`).

| Dado | Fonte | Uso |
|---|---|---|
| Vias, prédios com altura (importação PMSP) | OpenStreetMap (Overpass, base 11/10/2026) | eixo, edificações |
| MDT e MDS do LiDAR 2020, ortofoto 2020, quadras viárias (meios-fios), pontos cotados, obras de arte, praças, árvores | GeoSampa, Prefeitura de São Paulo (WFS, WMS e arquivos sem login) | relevo, tabuleiro, larguras, cor do chão, árvores |
| Relevo 30 m, superfície 30 m, cobertura 10 m, cor 10 m | ANADEM, Copernicus GLO-30, ESA WorldCover, Sentinel-2 S2B_23KLQ_20260927 | fora da caixa da Prefeitura, cor do chão |
| Dimensões do Minhocão e do túnel | Wikipédia, SPObras, GeoSampa (medidas no MDS e nas obras de arte) | modelos |

**Aproximações declaradas:** o circuito inteiro; a rampa de saída subida e o Minhocão ao contrário; a ligação de 30 m
no túnel; o leito do túnel sob a praça (desenhado); larguras mínimas de corrida; os muros; os boxes e a arquibancada na
Major Sertório; alturas de prédios do mapa de 2004.

## Editor de traçado e pastas de referência

`teste/editor-tracado.html` (no servidor local e só no /dev/ publicado, como a bancada de som) pinta ou corrige o eixo e
o pit lane de qualquer circuito do jogo sobre o chão dele (`assets/circuitos/<id>_solo.jpg`), com o traçado atual por
baixo. Pincel (emenda na ponta ou, começando e terminando em cima da linha, refaz o trecho entre os dois pontos), Mover
(empurra com alcance suave; sem ponto dentro do círculo, cria um na linha), Pontos, Apagar, Chegada (em qualquer lugar
do eixo), Largura (a largura mora nos próprios pontos do eixo, `[x, y, largura]`, e a borda vai em linha reta até o
ponto anterior e o próximo; sem largura própria vale a padrão; pontos novos no meio de um trecho nascem com a largura
da reta ali); desfazer, medidas (volta, oficial, sentido, curva mais fechada). O editor lembra ferramenta, controles e, por
circuito, a linha, a vista e cada fundo.

- **Pasta de referências** (`fontes/<id>/referencias/`, fora do repositório e do site; o editor a abre do disco):
  `camadas.json` (`formato: autopobre-referencias-v1`, sistema `utm` + EPSG do circuito, ou `local` como Interlagos) com
  imagens vistas de cima (`tipo: planta`, canto noroeste `x0`/`y1` e `res` em m/px) ou em perspectiva (`tipo:
  perspectiva`, homografia `H` do chão menos `origem` para o pixel), e linhas de apoio (`editavel: false` para limites).
  `scripts/circuitos/pacote_referencia.py <id>|todos` monta a dos circuitos atuais a partir do mosaico Esri (reprojetado
  de Web Mercator para UTM) e da ortofoto local (Goiânia); com `ortofotos_wms` na config baixa ortofotos da prefeitura
  em blocos na caixa da volta mais 150 m (Floripa: GeoFloripa 2016 a 0,2 m, com os vazios sobre o mar preenchidos pela
  de 2023, e a 2023 a 0,3 m). Um circuito que só existe numa pasta aparece no seletor como "só referências"; Guaratiba
  tem a sua (`referencias_guaratiba.py`).
- **Arquivo salvo** `tracado_<id>.json` (`formato: autopobre-tracado-v1`): eixo, pit lane e chegada no sistema da
  pasta (UTM), sentido e comprimento; para um circuito do jogo também `jogo.eixo_local`, nas mesmas coordenadas e
  escala das amostras de `dados/pista_<id>.json`. É a entrada dos geradores para corrigir uma pista; com pontos de
  largura leva `largura_m` (uma por ponto do eixo) e `largura_mostrada_m` (a padrão). `eixo_do_editor.py <id>` leva o
  mais novo para `eixo_refinado.json` (a reta entre os pontos refeita a cada 2 m, `largura_do_editor`, que no
  `gerar_pista.py` passa na frente da `largura_publicada`); por enquanto só Guaratiba (`eixo_do_editor: True`) usa.
- Conferência: `scripts/verificar_editor_tracado.py [porta] [pasta das fotos]`.
