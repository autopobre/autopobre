# Músicas do Auto-Pobre Racing

Coloque seus arquivos MP3 nesta pasta, com estes nomes em minúsculas:

| Arquivo | Momento |
| --- | --- |
| `intro.mp3` | Abertura, até terminar a faixa ou entrar no jogo |
| `race.mp3` | Corrida, repetindo enquanto dirige |
| `patrocinio.mp3` | Patrocínio / vaquinha nos boxes, repetindo enquanto conversa |
| `turbo.mp3` | Vitória |
| `hojenaodeu.mp3` | Derrota / reboque |
| `energia.mp3` | Menus e alternativa quando faltar uma das outras faixas |

Recarregue o jogo após copiar ou substituir os arquivos. No teste local, a descoberta é automática. Para o site, inclua os MP3 no commit: o build do Pages copia os arquivos presentes e gera a lista automaticamente.

As músicas respeitam **Configurações → Áudio → Volume global / Música**. Os sons do carro e da pista usam **Efeitos**: ao mexer no controle toca um trecho de `car_trying_to_start.mp3`, cujo volume acompanha o controle enquanto soa. Música e Efeitos têm cada um o botão **Silenciar**, que guarda o nível escolhido (mexer no controle reativa o canal). Quando faltar uma faixa, o jogo toca `energia.mp3`; se ela também faltar, usa a composição sintetizada original.

Os arquivos do jogo podem ser otimizados para 128 kbps estéreo. Os originais preservados ficam em `audios_originais/`, na raiz do projeto, fora do Git e da publicação.

## Efeitos gravados

`car_trying_to_start.mp3` é o motor de partida girando (o carro tentando pegar), tocado em loop no modo história enquanto o PART (partida) está apertado; ele desacelera conforme a bateria arria. Faz parte da publicação (`ASSETS` em `scripts/publicacao.py`). Sem ele, o jogo usa o som sintetizado.

O motor de cada carro vem de gravações reais em loop (`engine-loops.js`, gerados por `scripts/gerar_loops_motor.py`): `loops_m3` (aceleração do Opala, um seis em linha) e `loops_fusca` (aceleração do Fusca, motor a ar) trazem trechos de ~2 s em vários giros, com o pé no acelerador e com o pé fora; o jogo acelera ou desacelera o trecho mais próximo do giro e passa suavemente para o vizinho. `lenta_opala` e `lenta_fusca` são as marchas lentas. `pneus_estalos.mp3` + `.json` traz o pneu cantando no limite, o pneu arrastando numa derrapada e os estouros do escapamento ao tirar o pé (`scripts/gerar_sons_pneu.py`, `tyre-sounds.js`). As gravações de origem (Freesound, CC0 e CC BY) ficam em `audios_originais/freesound/`, fora do Git, com a lista de licenças; os créditos estão em `sobre.html`. Todos fazem parte da publicação; sem eles o jogo usa os sons sintetizados. A bancada de som (`teste/bancada-som.html`, fora da publicação) toca o mesmo áudio do jogo com sliders de ajuste.

Não é necessário editar JavaScript nem criar `tracks.json` manualmente para as músicas. Esta documentação não entra na publicação.
