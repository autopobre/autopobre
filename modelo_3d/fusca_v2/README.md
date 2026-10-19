# Fusca v2 (VW Type 1, ~1967–72), modelado a partir de medidas reais

O v2 foi refeito do zero, sem partir de nenhum modelo pronto. É o Fusca do jogo desde 03/10/2026 (veja **No jogo**, abaixo).

## Arquivos

| Arquivo | O que é |
|---|---|
| `fusca_v2.blend` | Cena completa (carro + pista + cenário + câmera + luzes), pronta para renderizar (só nesta máquina, fora do git) |
| `fusca_v2_carro.blend` | Só o carro, sem cenário (só nesta máquina, fora do git) |
| `renders/fusca_v2_foto.jpg` | Render principal (enquadramento da foto de referência), 1920×1080 |
| `renders/fusca_v2_*.jpg` | Outros ângulos: `f34`, `t34`, `lado`, `frente`, `baixo`, `det_frente` |
| `criar_fusca_v2.py` | Script que constrói tudo (Blender 5.2, Python) |
| `medidas_fusca.py` | Tabelas de medidas extraídas do desenho técnico |
| `verificar_medidas.py` | Compara o modelo com as medidas e imprime o erro |

Para regerar (as renders saem em PNG, `renders/<vista>_final.png`): `blender --background --python criar_fusca_v2.py -- --render final --vista foto`
(vistas: `foto`, `f34`, `fd34`, `t34`, `td34`, `lado`, `frente`, `baixo`, `det_frente`, `det_roda`, `det_cabine`, `det_tras`;
`--sem-cenario` grava só o carro; `--amostras N` muda a qualidade).

## De onde vêm as medidas

- **Desenho técnico ortogonal do Type 1** (lateral, planta, frontal e traseira, com cotas), da página de
  [dimensions.com](https://www.dimensions.com/element/volkswagen-beetle-type-1). A licença dos desenhos não é informada, então
  **o SVG não está incluído neste projeto**: só as medidas numéricas extraídas dele (`medidas_fusca.py`). O desenho foi
  calibrado com as cotas do próprio desenho (entre-eixos 2,40 m, largura 1,54 m, comprimento 4,08 m).
- Especificações oficiais para conferência: [Wikipedia](https://en.wikipedia.org/wiki/Volkswagen_Beetle) (comprimento 4,079–4,140 m,
  largura 1,539–1,585 m, altura 1,50 m, entre-eixos 2,40 m), [CarsGuide](https://www.carsguide.com.au/volkswagen/beetle/car-dimensions/1970)
  e [ConceptCarz](https://www.conceptcarz.com/s17036/volkswagen-beetle.aspx).
- **Foto de referência** (`fusca.png`, em `Projetos_iA/estilos_3d`): usada para o desenho dos detalhes (para-choque de lâmina dupla com garras de
  borracha, tira cromada e puxador em gancho no capô, faróis em nicho, calotas, roda com fendas, setas na crista do paralama).

### Modelos 3D prontos que foram avaliados e **não** usados
O único Fusca 3D que apareceu em repositório aberto ([victorsodre/fusquinha](https://github.com/victorsodre/fusquinha)) vem do
BlenderKit (Rodrigo Marini), cuja licença restringe a redistribuição em formato extraível, e o repositório não declara licença.
Por isso o modelo é original: construído só a partir de medidas.

## Como o corpo é construído

Cada seção transversal da carroceria (300 seções ao longo do carro) é a **união suave de primitivas**:
uma base (soleira e portas), uma "espinha" (capô → cabine → tampa do motor, com o topo igual ao perfil lateral medido),
bojos dos para-lamas dianteiros e traseiros (com as cristas medidas), uma nervura no capô e uma cúpula elíptica no teto. O
contorno é recortado pela largura máxima medida (planta) e pelo topo medido (lateral). Depois: casca oca de 20 mm, arcos de roda
cortados com a curva medida, janelas cortadas com os contornos medidos e vidros copiados das próprias faces da carroceria
(encaixam sem folga). Os detalhes (juntas, molduras, maçanetas, faróis...) são projetados na superfície com BVH.

## Fidelidade (rodar `verificar_medidas.py`)

| Comparação com o desenho | Erro médio | Erro máximo |
|---|---|---|
| Perfil lateral (topo) | 3 mm | 8 mm |
| Largura em planta (para-lamas) | 7 mm | 17 mm |
| Envelope frontal, para-lamas | 4 mm | 6 mm |
| Envelope frontal, cabine | 10 mm | 37 mm |

Carroceria: 3,725 m × 1,548 m × 1,535 m (com os para-choques chega a ~4,08 m). Rodas 5.60-15 (pneu de 0,67 m de diâmetro).

## Limitações honestas

- É um modelo **procedural**, não uma varredura 3D: entre as vistas medidas (silhuetas), as superfícies são interpoladas.
  O erro mais alto (37 mm) está numa quina do teto.
- A cor é uma aproximação do azul da foto; o piloto, a arquibancada, o skyline e a pista são simplificados.
- Detalhes finos ainda ausentes: lettering do pneu, buzinas atrás das grelhas, mecânica sob o carro.

## No jogo

Copiado de `Projetos_iA/estilos_3d/v2` em 03/10/2026. Entrou no lugar do Fusca V3, que adaptava o modelo do BlenderKit de
Rodrigo Marini: os [Termos do Blendkit](https://www.blendkit.com/terms-and-conditions-2021/) exigem que o modelo vá no jogo
"in such a format that it cannot be opened or separated by a third party", e um GLB que qualquer um baixa não cumpre isso. O V3
saiu do repositório e do jogo; o original continua em `Projetos_iA/estilos_3d/v3`.

`modelo_3d/scripts/exportar_fusca_jogo.py` gera `pista_interlagos/teste/assets/fusca_v2.glb` construindo o carro de novo com
as funções deste `criar_fusca_v2.py` (não abre nem altera os `.blend`). Da raiz do projeto:

```powershell
blender --background --factory-startup --python-exit-code 2 --python modelo_3d/scripts/exportar_fusca_jogo.py
```

- Resolução de jogo: 170 × 112 seções na carroceria (o estúdio usa 300 × 192), peças torneadas com até 36 segmentos,
  frisos mais simples. Cerca de 200 mil triângulos e 4,4 MB, sem texturas (as faces que o jogo pinta têm UV).
- Referencial do Opala: frente +X, esquerda −Z, pneus em y = 0; o entre-eixos de 2,40 m centrado no do Opala
  (eixos em x +1,417 e −0,983). Quatro pivôs `Roda_*_PIVO`, pintura `Pintura_fusca`, painel `Fusca_painel`, metal
  pintado por dentro `Pintura_interna_fusca` (os três na cor da equipe), lanterna `Lanterna_fusca` (luz de freio), vidros
  `Vidro_fusca`, retrovisores `Espelho_fusca` (nós próprios `..._Retrovisores`), espelho interno `Espelho_interno_fusca`,
  mostradores `Mostrador_velocimetro`/`Mostrador_contagiros`, placa `Placa` e o volante `Volante_Fusca` (o de dois raios
  do Fusca, que aparece na tela de carros; correndo, o piloto do jogo traz o dele). Nós com o extra `interno` são só do
  carro do jogador: os rivais os tiram (`fusca.js` `rivalCabin`).
- **Cabine de Fusca de corrida** (`modelo_3d/scripts/fusca_cabine.py`, desde 03/10/2026): painel de metal na cor do carro
  com o velocímetro VDO atrás do volante, grade do rádio, porta-luvas, alça e botões, sob o acolchoado preto; conta-giros
  Auto Meter no acolchoado; painel de chaves sob o painel; forros de porta em vinil preto (friso cromado, bolso, puxador,
  manivela, maçaneta e pino), laterais traseiras; forro do teto claro com as costuras, quebra-sóis
  e luz de teto; gaiola (arco atrás dos bancos, colunas A até o assoalho, travessa do para-brisa, barras baixas nas portas,
  diagonal, escoras e barra do cinto); banco concha com cinto vermelho; túnel, tapetes de borracha, torre do câmbio, freio
  de mão, extintor no lugar do banco do carona, base do banco traseiro e bagageiro em preto com a bateria (o encosto fica
  3 cm à frente das rodas traseiras e o bagageiro 4 cm acima delas: antes a base ia de lado a lado e aparecia pelos arcos,
  atravessando a face das rodas). A cabine é montada em volta do lugar do piloto do jogo (`SEAT` = `fusca.js`
  `FUSCA_SEAT`, 6 cm para dentro do banco do Opala: o cotovelo esquerdo saía pela porta) e confere que nenhuma peça
  atravessa a lataria (`poking_out`) nem entra no espaço onde as rodas giram (`in_wheels`).
- **Bico arredondado** (`fusca_acabamento.py` `RoundNose`, a carroceria do exportador): o V2 fecha a frente com uma tampa
  plana (só 3 cm de filete), que aparecia como uma face lisa entre os faróis sobre o para-choque. No jogo o capô vai 2 cm
  mais à frente e desce arredondado (raio de 9 cm) até o avental, a frente é curva em planta e os para-lamas viram bojos
  em volta dos faróis com um vale suave até o capô (vales mais fundos dobram a superfície: cada seção do V2 é amostrada
  por raios a partir do centro).
- **Acabamento externo** (`modelo_3d/scripts/fusca_acabamento.py`): retrovisores cromados nas duas portas (no lugar dos
  ovinhos do capô; a haste entra por baixo da cabeça, sem cruzar o vidro), no ponto mais à frente em que a câmera interna vê o vidro inteiro pela janela (cerca de 50° do centro,
  dentro de uma tela 16:9); borrachas internas nas janelas; junta da tampa do motor e duas grades de nove venezianas em
  relevo (no lugar das vinte linhas pretas); faróis com refletor cromado (o disco creme brilhava de dia); placa com UV.
  O exportador recorta de novo o para-brisa e o vidro traseiro por inteiro (o recorte do V2 deixava 40% do vidro traseiro
  fechado) e as janelas laterais com prismas retos (deixava dentes da pele interna), e confere todas as janelas.
- No jogo (`pista_interlagos/teste/fusca-cockpit.js`): o espelho interno e os retrovisores mostram a pista atrás (o passe
  do espelho do Opala, `side-mirrors.js` com o vidro próprio do Fusca), o velocímetro VDO (0–140 km/h, marcador de
  gasolina) e o conta-giros têm ponteiros ao vivo e luz de troca; a placa amarela diz "SÃO PAULO · FUS-K" e o número do
  carro (FUS-K99 no 99). Os retrovisores vivos ficam no plano do próprio vidro. Câmera interna: `FUSCA_EYE` (5 cm mais para trás que antes, para os retrovisores caberem na tela).
- **Preparado para correr** (pedido de um piloto da Copa Fusca, 03/10/2026; `fusca_acabamento.py` e `fusca_cabine.py`):
  sem para-choques nem estribos (o escapamento sai só 2 cm atrás da traseira); rodas de corrida pretas com seis furos e
  pneus baixos de 0,54 m (`fusca_acabamento.WHEEL_R`); carroceria 19 cm mais baixa que a do Fusca de rua, como na foto
  de um Fusca da Copa que o usuário mandou (`fusca_cabine.LOWER`: o exportador baixa tudo menos as rodas, as caixas de
  roda descem menos; soleiras a 7 cm do chão, teto a 1,345 m, arcos a ~1 cm dos pneus); a tampa do motor (uma peça só, das
  venezianas até embaixo da placa, com a maçaneta e a placa) aberta 12° na dobradiça de cima, com duas hastes e o
  motor à mostra (coifa, gerador, carburadores com filtros
  cromados, cabeçotes, polias e correia; `cut_lid`/`open_lid`/`engine`); os quatro para-lamas
  com material próprio, `Paralama_fusca`, que o jogo pinta na segunda cor da equipe (a da faixa do Opala: o 99 é preto
  com para-lamas amarelos, como as plotagens da Copa Fusca). A emenda é cortada exatamente na malha onde o bojo do
  para-lama encontra o resto da carroceria no campo implícito do V2 (nas pontas, contra o capô e a tampa do motor, com
  os aventais retos no meio), com um friso preto por cima. Faróis embutidos no para-lama (`construir_farois`, no lugar do V2): inclinados 34° com
  a frente do para-lama e recuados até o aro ficar quase rente à lataria (no V2 ficavam em pé, o topo 16 cm para fora),
  o nicho cortado no eixo do farol e um contorno curto na cor do para-lama onde o aro ainda fica até 2 cm fora. Por dentro, como na
  foto do piloto: a janela da porta vai 4,5 cm mais à frente e a coluna A fica fina, a barra da gaiola corre por cima
  dela e pelo trilho do teto até o arco principal, a travessa do para-brisa recuou (não tapa mais o vidro), colunas e
  testeira são de metal pintado (a divisa com o forro fica sob as barras) e as borrachas das janelas são mais finas.
  O assento, a câmera interna e a do capô descem junto (`FUSCA_SEAT`, `FUSCA_EYE`, `FUSCA_HOOD_EYE`); a colisão
  (`physics.js` `FUSCA_BODY`, `FUSCA_HULL`) vai do escapamento ao bico. Mecânica própria (`physics.js`
  `FUSCA_MECHANICS`, teste `testar_mecanica_fusca.mjs`): 1600 a ar de ~93 cv, 820 kg, 167 km/h sozinho e limitador a
  172 km/h no vácuo, pneus 5% mais aderentes (a IA freia e contorna com eles), traseira mansa na aceleração; cerca de
  2:10 em Interlagos (o Opala, com o mesmo piloto da IA, 1:54).
- **Portas, capô e tampa do motor que abrem** (`modelo_3d/scripts/fusca_aberturas.py`, 19/10/2026, "igual o Opala"): as
  duas portas, o capô dianteiro e a tampa do motor são recortados da carroceria com uma fresta de 4 mm e penduram, com o
  que vai neles (vidro, borrachas, maçaneta, retrovisor, forro da porta com bolso, puxador, manivela e pino; tira cromada
  e puxador do capô; venezianas, maçaneta, placa e hastes da tampa), em vazios nas dobradiças com os mesmos extras dos
  pivôs do Opala V06 (`peca`, `eixo_gltf`, `angulo_gltf_graus`): o jogo os gira com `car-openings.js`. Portas abrem 65°
  em dobradiças verticais logo à frente da emenda; o capô levanta 62° pela frente (dobradiça junto ao para-brisa; as
  quinas de trás são mais arredondadas que as medidas, que ficavam baixas no ombro do torpedo e viravam um bico); a
  tampa do motor, já apoiada 12° para a corrida, sobe mais 46°. O lugar de cada dobradiça foi escolhido girando a peça
  pela abertura inteira contra o resto do carro, sem nenhum contato novo. Em cada fresta, uma borracha preta sob a
  chapa (é a linha escura entre os painéis; as juntas desenhadas do estúdio saíram). Sob o capô, o porta-malas: caixa na
  cor do carro com o poço entre as caixas de roda e prateleiras curvas sobre elas, o tanque atrás com bocal e boia, o
  reservatório de fluido de freio (sem estepe: carro de corrida, e o bico baixo não tem lugar para ele); sob o capô,
  uma armação estampada. O puxador interno da porta passou para trás da ponta do painel (estava enterrado nela) e as
  pontas do painel ficam 6 mm longe das portas. No jogo: tecla E na frente abre o capô, atrás a tampa do motor; a
  equipe do box abre a tampa do motor para o motor e o capô para o tanque e o reabastecimento; números e o raio do #4
  vão com as portas; os rivais usam uma cópia com essas peças fundidas na carroceria (`fusca.js` `rivalTemplate`, sem
  chamadas de desenho a mais). Testes: `testar_aberturas.mjs` e `verificar_aberturas_fusca.py`.
- Prévias: `blender --background --factory-startup --python modelo_3d/scripts/renderizar_fusca_jogo.py -- [glb] [pasta]`
  renderiza as vistas da câmera interna e de fora (padrão em `previas/jogo/blender`, fora do git; `--cor2` pinta os para-lamas;
  `--abrir 1` abre todas as peças, `--abrir porta=1,capo=.5` só essas; vistas `aberto_34`, `porta_aberta`, `porta_malas`,
  `capo_aberto`, `tampa_aberta`, `motor`...).
- No Modo Corrida, a aba Fusca da tela de carros põe o grid inteiro de Fusca, cada um nas cores e com o número do seu carro
  (`pista_interlagos/teste/fusca.js`, `immersive-visuals.js` `fuscaRival`), com a mecânica do Opala. Validação no
  navegador: `pista_interlagos/scripts/verificar_fusca.py`.
