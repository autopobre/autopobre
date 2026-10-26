# Caminhonete v1 — o resgate que reboca na fita

A caminhonete 4x4 cabine dupla que reboca o Opala quebrado no Modo História (e os carros parados no multiplayer). Veio do
pedido #24 da Central de Projetos: "uma caminhonete 4x4 cabine dupla similar à Hilux, Frontier e afins", de **desenho
fictício**, sem marca de montadora. A marca é inventada (**TATU**) e a caminhonete é do GUINCHO QUEBROU-LIGOU, o
patrocinador de mentira do jogo, como o guincho plataforma ([../guincho_v1](../guincho_v1/README.md)), que fica guardado
para outro momento.

## Arquivos

| Arquivo | O que é |
|---|---|
| `criar_caminhonete_v1.py` | Constrói a caminhonete inteira (Blender 5.2) e exporta o GLB do jogo |
| `gerar_adesivos_caminhonete.py` | Desenha o atlas dos adesivos (Pillow): RESGATE · QUEBROU-LIGOU, 24 HORAS (QUASE), a placa SEM PRESSA da tampa, placas SOS4X44, emblema TATU, 4X4 |
| `texturas/caminhonete_adesivos_v1.png` e `.json` | O atlas e as regiões dele em UV |
| `renders/caminhonete_v1_*.jpg` | Vistas do modelo final; `renders/pecas_voando.jpg`, as peças que voam do carro da frente |
| `caminhonete_v1.blend` | A cena gerada (só nesta máquina, fora do git) |
| `previas/` | Prévias das rodadas, fotos dentro do jogo e os sons em WAV (fora do git) |

As ferramentas de modelagem são as mesmas do guincho, em `modelo_3d/scripts/veiculos_comum.py` (peças, varreduras, tubos,
recortes, adesivos e frisos projetados na lataria) e `modelo_3d/scripts/adesivos_comum.py` (tartaruga, placas, textos).

Para regerar, da raiz do projeto:

```
python modelo_3d/caminhonete_v1/gerar_adesivos_caminhonete.py          # só se mudar os adesivos (Pillow; fonte Bahnschrift do Windows)
blender --background --factory-startup --python modelo_3d/caminhonete_v1/criar_caminhonete_v1.py
blender --background --factory-startup --python modelo_3d/scripts/renderizar_veiculo.py -- pista_interlagos/teste/assets/caminhonete_v1.glb modelo_3d/caminhonete_v1/previas/blender
```

O GLB sai em `pista_interlagos/teste/assets/caminhonete_v1.glb`; ao trocá-lo, suba o `?v=` dele em `TOW_VEHICLES`
(`pista_interlagos/teste/tow-truck.js`). Fotos dentro do jogo: `pista_interlagos/scripts/fotografar_guincho.py <pasta>
--porta <porta>` (com `?reboque=guincho` na URL o jogo mostra o guincho plataforma no lugar dela).

## O que tem

- **Carroceria de baixo** varrida por seções ao longo do comprimento (capô abaulado, para-lamas, portas, caçamba, nariz
  arredondado) e recortada: caixas de roda fundas, a cabine por dentro e a caçamba com protetor preto. Faixa amarela com
  friso preto, vãos das portas, do capô, da tampa e da portinhola do tanque, maçanetas, repetidores.
- **Cabine** de cima moldada por fatias (para-brisa inclinado, colunas, teto), com espessura e as janelas recortadas
  (borracha nas bordas); por dentro, painel, volante, bancos da frente, banco de trás. O motorista (boné amarelo) é uma
  pessoa do jogo, sentada no lugar que `tow-truck.js` dá.
- **Frente**: grade com o emblema TATU, faróis com aro cromado e pisca, milhas, placa SOS4X44, **quebra-mato** com
  **guincho elétrico**; **snorkel** pela coluna da direita, retrovisores, limpadores, faixa QUEBROU-LIGOU no para-brisa.
- **Teto e caçamba**: giroflex (duas lentes que piscam alternadas), antena do rádio, **santo antônio** com faróis de
  serviço e extintor, caixa de ferramentas, **estepe**, cones, galão.
- **Traseira**: lanternas verticais (lanterna, pisca, ré), terceira luz de freio, a placa **REBOQUE · SEM PRESSA** com a
  tartaruga e o **SE ESTÁ LENDO ISTO, ESTÁ PERTO DEMAIS** na tampa, para-choque com degrau, placa e a **manilha** onde a
  fita engata, 2,45 m atrás do centro (o jogo posiciona o carro rebocado por essa medida).
- **Rodas** de liga de 6 raios com disco de freio e pneus de uso misto (gomos que sobem no ombro), estribos tubulares,
  alargadores e para-barros; cada roda num pivô sem rotação (`Roda_*_PIVO`), que o jogo gira pela distância andada.

## Medidas

Comprimento ~5,5 m com o quebra-mato, entre-eixos 3,085 m, bitola 1,55 m, pneu de 0,40 m de raio (265/70 R17), largura
1,85 m, teto a 1,85 m (2,05 m com o giroflex), caçamba de 1,37 m × 1,55 m. Cerca de 45 mil triângulos e 0,9 MB de GLB
(a malha das rodas é uma só para as quatro; só os adesivos levam UV).
