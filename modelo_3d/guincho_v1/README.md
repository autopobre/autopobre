# Guincho v1 — o caminhão do reboque

Um guincho plataforma feito em 25/10/2026 para substituir o reboque de caixas do tempo em que o jogo era protótipo. É um
modelo original, feito por script no Blender, sem marca real: um caminhão leve de cabine avançada (a cabine em cima do eixo
dianteiro, como os guinchos de HR/Bongo das ruas) com plataforma de alumínio.

**Fica guardado para outro momento**: em 26/10/2026 o pedido #24 da Central de Projetos trocou o resgate do jogo pela
caminhonete 4x4 ([../caminhonete_v1](../caminhonete_v1/README.md)). Com `?reboque=guincho` na URL do jogo, ele volta no
lugar dela (`pista_interlagos/teste/tow-truck.js`, `TOW_VEHICLES`). As ferramentas de modelagem que ele usa ficam em
`modelo_3d/scripts/veiculos_comum.py` e `adesivos_comum.py`, comuns aos veículos.

## Arquivos

| Arquivo | O que é |
|---|---|
| `criar_guincho_v1.py` | Constrói o caminhão inteiro (Blender 5.2) e exporta o GLB do jogo |
| `gerar_adesivos_guincho.py` | Desenha o atlas dos adesivos (Pillow): logo da porta, placa da cabeceira, faixa do para-brisa, placas, para-barros, adesivo da traseira, zebrado |
| `texturas/guincho_adesivos_v1.png` e `.json` | O atlas e as regiões dele em UV (o construtor lê os dois) |
| `renders/guincho_v1_*.jpg` | Algumas vistas do modelo final |
| `guincho_v1.blend` | A cena gerada (só nesta máquina, fora do git) |
| `previas/` | Prévias das rodadas (fora do git) |

Para regerar, da raiz do projeto:

```
python modelo_3d/guincho_v1/gerar_adesivos_guincho.py          # só se mudar os adesivos (Pillow; fonte Bahnschrift do Windows)
blender --background --factory-startup --python modelo_3d/guincho_v1/criar_guincho_v1.py
blender --background --factory-startup --python modelo_3d/scripts/renderizar_veiculo.py -- pista_interlagos/teste/assets/guincho_v1.glb modelo_3d/guincho_v1/previas/blender
```

O GLB sai em `pista_interlagos/teste/assets/guincho_v1.glb`; ao trocá-lo, suba o `?v=` dele em `TOW_VEHICLES`
(`pista_interlagos/teste/tow-truck.js`). Fotos dentro do jogo: `pista_interlagos/scripts/fotografar_guincho.py <pasta> --porta <porta>`
com o jogo aberto em `?reboque=guincho`.

## O que tem

- **Cabine** branca moldada por seções horizontais (para-brisa inclinado, frente levemente abaulada, cantos arredondados),
  com espessura; janelas e caixa de roda recortadas (Boolean) — a borracha das janelas é a parede do recorte. Faixa
  amarela com friso preto, vãos das portas, maçanetas, repetidores, calha do teto, retrovisores de caminhão (o grande e o
  convexo), limpadores, grade com o emblema QL, faróis com aro cromado e pisca, para-choque preto com milha e placa,
  estribos, antena do rádio PX e o **giroflex** (duas lentes âmbar que piscam alternadas no jogo).
- **Por dentro**: painel, bancos, tampa do motor, alavanca do câmbio e o volante deitado de cabine avançada. O motorista
  (boné amarelo do GUINCHO QUEBROU-LIGOU) é uma pessoa do jogo (`pit-crew.js`), sentada no lugar que `tow-truck.js` dá.
- **Chassi**: longarinas, travessas, eixos, diferencial, cardã, feixes de mola, tanque de alumínio, bateria, caixa de
  ferramentas e escapamento.
- **Plataforma** de tábuas de alumínio com rabo de castor, trilhos com fita refletiva vermelha e branca, furos de amarração
  e vigias âmbar; cabeceira com a placa **REBOQUE · SEM PRESSA** (com a tartaruga) virada para quem vem rebocado e dois
  faróis de serviço; o guincho (tambor, motor, redução, cabo e gancho); cones, calços, galão e vassoura.
- **Traseira**: para-choque com faixas refletivas, lanternas (pisca, lanterna, ré), placa **REB0Q99** com luz, para-barros
  "QUEBROU? LIGOU!", zebrado e o adesivo **"SE ESTÁ LENDO ISTO, ESTÁ PERTO DEMAIS"** — quem lê está na fita de 5 m.
  O olhal da fita fica em x −2,45 m (o jogo posiciona o carro rebocado por essa medida).
- **Rodas** de aço com pneus de gomos, duplas atrás; cada uma num pivô sem rotação (`Roda_*_PIVO`), que o jogo gira pela
  distância andada.

## Medidas

Entre-eixos 3,65 m (o do reboque antigo), pneu de 0,39 m de raio, cabine de 1,93 m de largura e 2,15 m de altura,
plataforma de 2,20 m × 3,85 m com o piso a 1,05 m. Comprimento total ~5,7 m. Cerca de 46 mil triângulos e 1 MB de GLB
(a malha de cada eixo é a mesma dos dois lados; só os adesivos levam UV). O site não permite descompressor WebAssembly
(política de segurança), por isso o GLB não usa Draco nem meshopt.

O patrocinador GUINCHO QUEBROU-LIGOU é a piada que já existia no jogo (`sponsors.js`, `car-livery.js`); nada de telefone
nem marca real.
