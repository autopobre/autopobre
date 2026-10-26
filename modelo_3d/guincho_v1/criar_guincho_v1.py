# -*- coding: utf-8 -*-
"""Guincho plataforma (guincho_v1) procedural no Blender: o caminhao que reboca o Opala quebrado no Modo Historia e
os carros parados no multiplayer (immersive-visuals.js truckModel, tow-truck.js). Substitui o reboque de caixas do
prototipo.

Um caminhao leve de cabine avancada (cabine sobre o eixo dianteiro, como os guinchos de HR/Bongo das ruas), sem marca
real: cabine branca moldada por secoes horizontais (para-brisa inclinado, cantos arredondados, janelas recortadas com
borracha, cabine por dentro com bancos, painel e volante), faixa amarela, grade, farois, para-choque, retrovisores de
caminhao, giroflex no teto; chassi, tanque, caixa de ferramentas; plataforma de aluminio com rabo de castor, trilhos
com fita refletiva e vigias, cabeceira com a placa SEM PRESSA, guincho (tambor, cabo e gancho), cones, calcos, galao e
vassoura; para-choque traseiro com faixas refletivas, lanternas, placa e o olhal da fita; rodas de aco (duplas atras).
Os adesivos vem do atlas de gerar_adesivos_guincho.py.

Convencoes: metros | X para a frente | Y para a esquerda (lado do motorista) | Z para cima | origem no chao, no
meio do caminhao (como o reboque antigo: o olhal da fita fica em X -2,45). No glTF (e no jogo): x frente, y cima,
z direita.

Uso, da raiz do projeto:
 blender --background --factory-startup --python modelo_3d/guincho_v1/criar_guincho_v1.py [-- --sem-glb]
Saidas: modelo_3d/guincho_v1/guincho_v1.blend e pista_interlagos/teste/assets/guincho_v1.glb.
"""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from veiculos_comum import *              # noqa: E402,F403  (Peca, caixa, varrer, recortar, ...)
from veiculos_comum import _pchip, configurar, material  # noqa: E402

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
ATLAS = AQUI / 'texturas' / 'guincho_adesivos_v1.png'
UV = json.loads((AQUI / 'texturas' / 'guincho_adesivos_v1.json').read_text(encoding='utf-8'))
BLEND = AQUI / 'guincho_v1.blend'
GLB = RAIZ / 'pista_interlagos' / 'teste' / 'assets' / 'guincho_v1.glb'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ----------------------------------------------------------------------------------------------
# Medidas (m)
# ----------------------------------------------------------------------------------------------
EIXO_F, EIXO_T = 2.30, -1.35            # entre-eixos 3,65 (o do reboque antigo)
R_PNEU = 0.39                           # pneu 7.00 R16 de caminhao leve
Y_RODA_F = 0.80                         # bitola dianteira / 2
Y_RODA_T = 0.74                         # meio do par de rodas traseiras
CAB_X_TRAS = 1.40                       # parede de tras da cabine
CAB_Z_BASE = 0.50                       # borda de baixo da cabine
ARCO_R, ARCO_Z = 0.465, 0.40            # recorte da caixa de roda dianteira
PISO = 1.05                             # topo do assoalho da plataforma
PLAT_FRENTE, PLAT_DOBRA, PLAT_PONTA = 1.29, -2.02, -2.55   # frente, inicio do rabo de castor, ponta
PLAT_Z_PONTA = 0.93                     # altura do assoalho na ponta
PLAT_Y = 1.10                           # meia largura da plataforma
OLHAL = (-2.45, 0.0, 0.42)              # onde a fita engata (tow-truck.js TOW_HOOK)
BANCO_MOTORISTA = (1.86, 0.47, 1.19)    # meio do assento do motorista (tow-truck.js DRIVER_SEAT: ele senta a 1,20 m)

# Perfil da cabine por altura: frente (X), meia largura, raio dos cantos da frente, parede de tras (X).
CAB_Z = [0.50, 0.70, 1.00, 1.18, 1.22, 1.60, 1.95, 2.03, 2.08, 2.115, 2.135, 2.145]
CAB_XF = [2.975, 2.99, 3.00, 3.00, 2.995, 2.90, 2.80, 2.765, 2.725, 2.675, 2.615, 2.545]
CAB_W = [0.945, 0.955, 0.965, 0.965, 0.962, 0.945, 0.925, 0.915, 0.905, 0.89, 0.87, 0.84]
CAB_RF = [0.15, 0.16, 0.17, 0.17, 0.17, 0.18, 0.19, 0.19, 0.19, 0.19, 0.18, 0.16]
CAB_XT = [1.40, 1.40, 1.40, 1.40, 1.40, 1.40, 1.40, 1.402, 1.406, 1.413, 1.425, 1.445]
CAB_RT = 0.05                           # raio dos cantos de tras
CAB_BOJO = 0.03                         # a frente e um pouco abaulada em planta
LINHAS = ([0.50, 0.56, 0.63, 0.70, 0.78, 0.84, 0.88, 0.905, 0.955, 0.965, 1.00, 1.06, 1.12, 1.18, 1.22]
          + [round(1.22 + 0.08 * i, 3) for i in range(1, 10)] + [1.98, 2.01, 2.04, 2.065, 2.085, 2.10, 2.115, 2.125, 2.135, 2.145])
FAIXA = (0.905, 0.955)                  # faixa amarela; um friso preto logo acima ate 0.965


def cabine_em(z):
    return (_pchip(CAB_Z, CAB_XF, z), _pchip(CAB_Z, CAB_W, z), _pchip(CAB_Z, CAB_RF, z), _pchip(CAB_Z, CAB_XT, z))


# ----------------------------------------------------------------------------------------------
# Materiais (cor sRGB, metal, rugosidade, emissao, alfa)
# ----------------------------------------------------------------------------------------------
MATERIAIS = {
    'Pintura_branca': ('f1f0eb', 0, .32),
    'Faixa_amarela': ('f2c418', 0, .34),
    'Preto_fosco': ('17181a', 0, .78),
    'Preto_brilho': ('0e0f10', .1, .32),
    'Chassi_preto': ('1c1d1e', .25, .55),
    'Interior_cinza': ('46494c', 0, .86),
    'Borracha': ('111112', 0, .9),
    'Pneu': ('19191a', 0, .93),
    'Aco_roda': ('d4d5d1', .15, .48),
    'Cromado': ('d8dadc', 1, .14),
    'Aluminio': ('c2c6c9', .85, .36),
    'Aluminio_assoalho': ('aeb3b6', .8, .48),
    'Cabo_aco': ('3c3c3a', .7, .45),
    'Espelho': ('e6ecf0', 1, .03),
    'Vidro': ('1a2329', .2, .05, None, 0, .42),
    'Farol_lente': ('e8ecee', 0, .1, 'fff3dc', .8),
    'Lente_re': ('dcdcd6', 0, .2),
    'Lanterna_vermelha': ('a5141a', 0, .25, 'ff2a20', 1.6),
    'Pisca_ambar': ('d8790f', 0, .25, 'ff9a1c', 0),
    'Vigia_ambar': ('d8870f', 0, .3, 'ff9a1c', 1.2),
    'Giroflex_A': ('e88a12', 0, .2, 'ffa21a', .3),
    'Giroflex_B': ('e88a12', 0, .2, 'ffa21a', .3),
    'Refletivo_vermelho': ('c21b20', 0, .38),
    'Refletivo_branco': ('efefea', 0, .38),
    'Cone_laranja': ('ff5a12', 0, .55),
    'Calco_amarelo': ('e6b20e', 0, .6),
    'Galao_vermelho': ('b3191b', 0, .48),
    'Cabo_madeira': ('8c6a40', 0, .7),
    'Cerdas': ('2b2b2a', 0, .9),
    'Adesivos': ('ffffff', 0, .4),
}


# ----------------------------------------------------------------------------------------------
# Cabine
# ----------------------------------------------------------------------------------------------
NS, NC, NF, NR, NB = 16, 7, 14, 3, 10   # pontos: lado, canto da frente, frente, canto de tras, traseira


def anel_cabine(z):
    xf, w, rf, xt = cabine_em(z)
    rt = CAB_RT
    pts = []
    for i in range(NS):                                  # lado direito (Y-), para a frente
        pts.append((xt + rt + (xf - rf - xt - rt) * i / NS, -w))
    for i in range(NC):                                  # canto da frente direito
        a = math.radians(-90 + 90 * i / NC)
        pts.append((xf - rf + rf * math.cos(a), -(w - rf) + rf * math.sin(a)))
    for i in range(NF):                                  # frente abaulada
        y = -(w - rf) + 2 * (w - rf) * i / NF
        pts.append((xf + CAB_BOJO * (1 - (y / (w - rf)) ** 2), y))
    for i in range(NC):                                  # canto da frente esquerdo
        a = math.radians(90 * i / NC)
        pts.append((xf - rf + rf * math.cos(a), (w - rf) + rf * math.sin(a)))
    for i in range(NS):                                  # lado esquerdo, para tras
        pts.append((xf - rf - (xf - rf - xt - rt) * i / NS, w))
    for i in range(NR):                                  # canto de tras esquerdo
        a = math.radians(90 + 90 * i / NR)
        pts.append((xt + rt + rt * math.cos(a), (w - rt) + rt * math.sin(a)))
    for i in range(NB):                                  # parede de tras
        pts.append((xt, (w - rt) - 2 * (w - rt) * i / NB))
    for i in range(NR):                                  # canto de tras direito
        a = math.radians(180 + 90 * i / NR)
        pts.append((xt + rt + rt * math.cos(a), -(w - rt) + rt * math.sin(a)))
    return pts


def casca_cabine():
    """A superficie de fora da cabine (aberta embaixo) e uma BVH dela para projetar pecas e adesivos."""
    bm = bmesh.new()
    aneis = [[bm.verts.new((x, y, z)) for x, y in anel_cabine(z)] for z in LINHAS]
    mats = ['Pintura_branca', 'Faixa_amarela', 'Preto_fosco']
    n = len(aneis[0])
    for k in range(len(aneis) - 1):
        z = (LINHAS[k] + LINHAS[k + 1]) / 2
        for i in range(n):
            f = bm.faces.new([aneis[k][i], aneis[k][(i + 1) % n], aneis[k + 1][(i + 1) % n], aneis[k + 1][i]])
            f.smooth = True
            cx = (aneis[k][i].co.x + aneis[k][(i + 1) % n].co.x) / 2
            if cx > CAB_X_TRAS + .08 and FAIXA[0] <= z < FAIXA[1]:
                f.material_index = 1
            elif cx > CAB_X_TRAS + .08 and FAIXA[1] <= z < .965:
                f.material_index = 2
    topo = bm.faces.new(aneis[-1])
    topo.smooth = True
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    me = bpy.data.meshes.new('Cabine')
    bm.to_mesh(me)
    bm.free()
    for m in mats + ['Interior_cinza'] * 3:
        me.materials.append(material(m))
    o = bpy.data.objects.new('Cabine', me)
    bpy.context.scene.collection.objects.link(o)
    return o, bvh


# Contornos das janelas (no plano em que sao projetadas)
JANELA_LADO = poligono_arredondado([(1.60, 1.24), (2.72, 1.24), (2.50, 1.95), (1.60, 1.95)], .045)       # (X, Z)
PARABRISA = poligono_arredondado([(-.765, 1.255), (.765, 1.255), (.70, 1.975), (-.70, 1.975)], .07)     # (Y, Z)
VIGIA = ret_arredondado(-.42, .42, 1.48, 1.86, .05)                                                       # (Y, Z)


def recortar_cabine(cab):
    """Espessura, janelas e caixa de roda (as paredes dos furos ficam com o material do cortador: borracha nas
    janelas, preto no arco)."""
    recortar(cab, [
        prisma('Corte_janela_E', JANELA_LADO, 'XZ', .55, 1.3, 'Borracha'),
        prisma('Corte_janela_D', JANELA_LADO, 'XZ', -1.3, -.55, 'Borracha'),
        prisma('Corte_parabrisa', PARABRISA, 'YZ', 2.45, 3.3, 'Borracha'),
        prisma('Corte_vigia', VIGIA, 'YZ', 1.2, 1.6, 'Borracha'),
        cortador_cilindro('Corte_arco', (EIXO_F, 0, ARCO_Z), ARCO_R, 2.6, 'Preto_fosco'),
    ], espessura=.03, material_offset=3)
    cab.data.name = 'Cabine'


def porta(lado):
    """O vao da porta: atras da janela, sobre o teto, pela coluna e em volta da caixa de roda."""
    pts = [(1.50, .60), (1.50, 2.01), (2.57, 2.01), (2.79, 1.235), (2.815, .98)]
    for k in range(13):
        a = math.radians(20 + 135 * k / 12)
        pts.append((EIXO_F + .53 * math.cos(a), ARCO_Z + .53 * math.sin(a)))
    pts.append((1.80, .60))
    return pts


def detalhes_cabine(p, bvh):
    # Vidros (o recorte deixou a borracha nas paredes dos furos)
    for lado in (1, -1):
        vidro_projetado(p, bvh, JANELA_LADO, 'XZ', lado)
    vidro_projetado(p, bvh, PARABRISA, 'YZ', 1)
    vidro_projetado(p, bvh, VIGIA, 'YZ', -1)
    for lado in (1, -1):
        friso_projetado(p, bvh, porta(lado), lado)
        # macaneta e fechadura
        bloco_na_lataria(p, bvh, 'Preto_fosco', (1.60, 3 * lado, 1.15), (0, -lado, 0), .15, .04, .03, bevel=.012)
        bloco_na_lataria(p, bvh, 'Cromado', (1.60, 3 * lado, 1.105), (0, -lado, 0), .022, .022, .012, bevel=.005)
        # pisca lateral
        bloco_na_lataria(p, bvh, 'Pisca_ambar', (2.70, 3 * lado, 1.08), (0, -lado, 0), .07, .035, .02, bevel=.008)
        # porta: GUINCHO QUEBROU-LIGOU, lido de fora
        adesivo_projetado(p, bvh, 'porta', (2.17, 1.093), .90, .246, lado)
        # calha do teto
        friso_projetado(p, bvh, [(1.46, 2.035), (2.55, 2.035)], lado, mat='Preto_fosco', largura=.012, afasta=.004, fechado=False)
    # Frente: farois de canto (pisca no canto), grade com emblema, faixa do para-brisa
    xf = cabine_em(1.08)[0] + CAB_BOJO
    for lado in (1, -1):
        # conjunto do farol: caixa preta, farol com aro cromado e o pisca ambar ao lado, de fora
        bloco_na_lataria(p, bvh, 'Preto_fosco', (4, lado * .66, 1.075), (-1, 0, 0), .36, .20, .05, bevel=.02)
        bloco_na_lataria(p, bvh, 'Cromado', (4, lado * .615, 1.075), (-1, 0, 0), .235, .165, .058, bevel=.025)
        bloco_na_lataria(p, bvh, 'Farol_lente', (4, lado * .615, 1.075), (-1, 0, 0), .215, .145, .066, bevel=.03, seg=3)
        bloco_na_lataria(p, bvh, 'Pisca_ambar', (4, lado * .785, 1.075), (-1, 0, 0), .085, .155, .062, bevel=.02)
        # repetidor no canto
        bloco_na_lataria(p, bvh, 'Pisca_ambar', (2.94 + .5, lado * (.885 + .5), 1.075), (-1, -lado, 0), .05, .09, .03, bevel=.01)
    caixa(p, 'Preto_fosco', (xf + .012, 0, 1.075), (.04, .86, .19), bevel=.015)
    for k in range(5):
        caixa(p, 'Preto_brilho', (xf + .032, 0, 1.0 + k * .037), (.012, .82, .016), bevel=.004)
    caixa(p, 'Cromado', (xf + .034, 0, 1.165), (.012, .84, .012), bevel=.004)
    p.adesivo('emblema', (xf + .042, 0, 1.085), (0, 1, 0), (0, 0, 1), .2, .1)
    # faixa no alto do para-brisa (por dentro do vidro, como um adesivo)
    u0, v0, u1, v1 = UV['parabrisa']
    pts = []
    for y, z in [(-.64, 1.865), (.64, 1.865), (.64, 1.95), (-.64, 1.95)]:
        loc, nor = acerta(bvh, (4, y, z), (-1, 0, 0))
        pts.append(tuple(loc - nor * .02))
    p.quad(pts, 'Adesivos', [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], fora=(1, 0, .2))
    # limpadores: braco e palheta deitados no vidro
    for y0, y1 in [(.40, -.12), (-.30, -.78)]:
        a, na = acerta(bvh, (4, y0, 1.275), (-1, 0, 0))
        b, nb = acerta(bvh, (4, y1, 1.35), (-1, 0, 0))
        a = a + na * .02
        b = b + nb * .02
        varrer(p, 'Preto_fosco', [a, b], [(-.008, -.006), (.008, -.006), (.008, .006), (-.008, .006)], lado=na)
        cilindro(p, 'Preto_fosco', a - na * .02, a + na * .01, .02, 10)
    # retrovisores de caminhao: dois bracos, espelho grande e o pequeno convexo embaixo
    for lado in (1, -1):
        for z0, z1 in [(1.74, 1.66), (1.30, 1.36)]:
            a, _ = acerta(bvh, (2.73, 3 * lado, z0), (0, -lado, 0))
            cilindro(p, 'Preto_fosco', a, (2.70, lado * 1.17, z1), .012, 8)
        caixa(p, 'Preto_fosco', (2.69, lado * 1.20, 1.51), (.07, .20, .38), bevel=.02)
        caixa(p, 'Espelho', (2.652, lado * 1.20, 1.51), (.004, .175, .35))
        caixa(p, 'Preto_fosco', (2.71, lado * 1.16, 1.18), (.06, .13, .13), bevel=.02)
        caixa(p, 'Espelho', (2.677, lado * 1.16, 1.18), (.004, .11, .11))
        cilindro(p, 'Preto_fosco', (2.71, lado * 1.16, 1.25), (2.71, lado * 1.16, 1.30), .01, 8)
    # para-choque dianteiro: varrido pela frente e pelos cantos
    caminho = []
    for x, y in anel_cabine(.60):
        if x > 2.70:
            caminho.append((x, y))
    caminho.sort(key=lambda q: math.atan2(q[1], q[0] - 2.4))
    cam3 = []
    lados = []
    for k, (x, y) in enumerate(caminho):
        a = Vector(caminho[max(0, k - 1)] + (0,))
        b = Vector(caminho[min(len(caminho) - 1, k + 1)] + (0,))
        T = (b - a).normalized()
        fora = T.cross(Vector((0, 0, 1))).normalized()
        if fora.x < -.2 or (abs(fora.x) < .2 and fora.y * y < 0):
            fora = -fora
        cam3.append(Vector((x, y, .60)) + fora * .015)
        lados.append(fora)
    secao = [(s, u) for s, u in [(0, -.12), (.07, -.12), (.095, -.095), (.10, .085), (.08, .115), (0, .12)]]
    varrer(p, 'Preto_fosco', cam3, secao, lado=lambda i: lados[i])
    xb = cabine_em(.6)[0] + CAB_BOJO + .015 + .10
    for lado in (1, -1):
        cilindro(p, 'Farol_lente', (xb - .02, lado * .62, .58), (xb + .006, lado * .62, .58), .045, 16)
        cilindro(p, 'Cromado', (xb - .025, lado * .62, .58), (xb + .002, lado * .62, .58), .052, 16)
    p.adesivo('placa', (xb + .004, 0, .60), (0, 1, 0), (0, 0, 1), .40, .13)
    caixa(p, 'Preto_fosco', (xb - .003, 0, .60), (.006, .42, .145))
    # estribos atras da roda dianteira
    for lado in (1, -1):
        caixa(p, 'Preto_fosco', (1.64, lado * .86, .44), (.30, .2, .03), bevel=.008)
        caixa(p, 'Chassi_preto', (1.64, lado * .86, .475), (.03, .05, .07))
    # arco da roda: aba de plastico e caixa por dentro
    for lado in (1, -1):
        w = cabine_em(.7)[1]
        caminho = []
        for k in range(25):
            a = math.radians(5 + 170 * k / 24)
            caminho.append((EIXO_F + (ARCO_R + .012) * math.cos(a), lado * (w + .004), ARCO_Z + (ARCO_R + .012) * math.sin(a)))
        varrer(p, 'Preto_fosco', caminho, [(-.02, -.016), (.02, -.016), (.02, .022), (-.02, .022)], lado=(0, lado, 0), liso=True)
    pts_caixa = [((ARCO_R - .01) * math.cos(math.radians(a)), (ARCO_R - .01) * math.sin(math.radians(a))) for a in range(0, 181, 10)]
    for y0, y1 in [(.52, .93), (-.93, -.52)]:
        caminho = [Vector((EIXO_F + c, 0, ARCO_Z + s)) for c, s in pts_caixa]
        for k in range(len(caminho) - 1):
            a, b = caminho[k], caminho[k + 1]
            p.quad([(a.x, y0, a.z), (b.x, y0, b.z), (b.x, y1, b.z), (a.x, y1, a.z)], 'Preto_fosco', fora=(EIXO_F - (a.x + b.x) / 2, 0, ARCO_Z - (a.z + b.z) / 2))
    # assoalho da cabine por baixo
    caixa(p, 'Preto_fosco', (2.15, 0, .93), (1.45, 1.86, .04))
    # antena do radio PX no canto de tras
    cilindro(p, 'Preto_fosco', (1.52, .72, 2.13), (1.52, .72, 2.20), .02, 10)
    cilindro(p, 'Preto_fosco', (1.52, .72, 2.20), (1.49, .72, 3.12), .004, 6, raio1=.002)


def giroflex(p):
    """A barra de luz no teto: base preta, duas lentes ambar (piscam alternadas no jogo) e o meio com GUINCHO."""
    z = 2.145
    for y in (.5, -.5):
        caixa(p, 'Preto_fosco', (2.25, y, z + .02), (.16, .06, .04), bevel=.01)
    caixa(p, 'Preto_fosco', (2.25, 0, z + .065), (.26, 1.30, .05), bevel=.015)
    caixa(p, 'Giroflex_A', (2.25, .385, z + .15), (.22, .49, .12), bevel=.045, seg=3)
    caixa(p, 'Giroflex_B', (2.25, -.385, z + .15), (.22, .49, .12), bevel=.045, seg=3)
    caixa(p, 'Preto_fosco', (2.25, 0, z + .145), (.21, .28, .11), bevel=.02)
    for fora in (1, -1):
        p.adesivo('giroflex', (2.25 + fora * .1065, 0, z + .145), (0, fora, 0), (0, 0, 1), .24, .07)


def interior(p):
    caixa(p, 'Interior_cinza', (2.12, 0, .96), (1.40, 1.80, .03))
    caixa(p, 'Interior_cinza', (1.95, 0, 1.10), (.75, .40, .28), bevel=.05)                 # tampa do motor
    caixa(p, 'Interior_cinza', (2.72, 0, 1.16), (.34, 1.78, .20), bevel=.05)                # painel
    caixa(p, 'Preto_fosco', (2.62, .47, 1.22), (.12, .36, .10), bevel=.03)                  # instrumentos
    bx, by, bz = BANCO_MOTORISTA
    for y, larg in ((by, .46), (-.55, .66)):
        caixa(p, 'Preto_fosco', (bx, y, bz - .04), (.46, larg, .10), bevel=.04)
        caixa(p, 'Preto_fosco', (bx - .27, y, bz + .30), (.10, larg, .56), bevel=.04, rot=Euler((0, math.radians(-12), 0)))
        caixa(p, 'Preto_fosco', (bx - .30, y, bz + .64), (.08, .26, .12), bevel=.03)
    # volante deitado de cabine avancada e a coluna
    centro = Vector((2.38, by, 1.33))
    eixo = Vector((math.cos(math.radians(55)), 0, -math.sin(math.radians(55))))     # da roda para o painel
    toro(p, 'Preto_fosco', centro, eixo, .21, .017, 28, 8)
    cilindro(p, 'Preto_fosco', centro - eixo * .02, centro + eixo * .45, .028, 10)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        d = Vector((0, math.cos(a), math.sin(a)))
        d = (d - eixo * d.dot(eixo)).normalized()
        varrer(p, 'Preto_fosco', [centro, centro + d * .2], [(-.01, -.008), (.01, -.008), (.01, .008), (-.01, .008)], lado=eixo)
    cilindro(p, 'Preto_fosco', (2.25, .12, 1.0), (2.18, .12, 1.32), .012, 8)               # alavanca do cambio
    cilindro(p, 'Preto_fosco', (2.18, .12, 1.32), (2.18, .12, 1.36), .025, 10)


# ----------------------------------------------------------------------------------------------
# Chassi, plataforma, traseira
# ----------------------------------------------------------------------------------------------
def chassi(p):
    for y in (.42, -.42):
        caixa_entre(p, 'Chassi_preto', (-2.30, y - .035, .52), (2.62, y + .035, .72), bevel=.008)
    for x in (-2.20, -1.0, .20, 1.40, 2.45):
        caixa(p, 'Chassi_preto', (x, 0, .62), (.07, .80, .14), bevel=.006)
    # eixos, diferencial, cardan, feixes de mola
    caixa(p, 'Chassi_preto', (EIXO_F, 0, ARCO_Z - .05), (.09, 1.50, .10), bevel=.01)
    cilindro(p, 'Chassi_preto', (EIXO_T, -.62, R_PNEU), (EIXO_T, .62, R_PNEU), .065, 14)
    cilindro(p, 'Chassi_preto', (EIXO_T - .16, 0, R_PNEU), (EIXO_T + .16, 0, R_PNEU), .17, 18)
    cilindro(p, 'Chassi_preto', (EIXO_T + .16, 0, R_PNEU + .02), (1.35, 0, .62), .038, 10)
    for y in (.42, -.42):
        for x0, x1 in ((EIXO_T - .62, EIXO_T + .62), (EIXO_F - .50, EIXO_F + .45)):
            for k in range(3):
                caixa(p, 'Chassi_preto', ((x0 + x1) / 2, y, .47 + k * .018), (x1 - x0 - k * .22, .07, .016), bevel=.004)
    # tanque (esquerdo), bateria, caixa de ferramentas (direita), escapamento
    cilindro(p, 'Aluminio', (.35, .74, .68), (1.15, .74, .68), .21, 24)
    for x in (.48, 1.02):
        toro(p, 'Chassi_preto', (x, .74, .68), (1, 0, 0), .215, .012, 24, 6)
    cilindro(p, 'Preto_fosco', (.62, .74, .89), (.62, .74, .92), .045, 12)
    caixa(p, 'Chassi_preto', (.05, .74, .65), (.36, .30, .26), bevel=.02)
    caixa(p, 'Aluminio', (.40, -.79, .68), (1.15, .44, .38), bevel=.02)
    for x in (.05, .75):
        caixa(p, 'Chassi_preto', (x, -1.012, .79), (.14, .012, .04), bevel=.004)
    caixa(p, 'Chassi_preto', (.40, -1.01, .505), (1.17, .02, .02))
    cilindro(p, 'Chassi_preto', (1.30, -.30, .55), (-.50, -.30, .52), .035, 10)
    cilindro(p, 'Chassi_preto', (-.50, -.30, .52), (-.80, -.62, .46), .035, 10)


def plataforma(p):
    # assoalho em tabuas de aluminio (dobram no rabo de castor)
    caminho = [(PLAT_FRENTE, 0, PISO), (PLAT_DOBRA, 0, PISO), (PLAT_PONTA + .02, 0, PLAT_Z_PONTA)]
    n = 11
    larg = 2 * (PLAT_Y - .03) / n
    for k in range(n):
        y = -PLAT_Y + .03 + larg * (k + .5)
        cam = [(x, y, z) for x, _, z in caminho]
        mat = 'Aluminio_assoalho' if k % 3 else 'Aluminio'
        varrer(p, mat, cam, [(-larg / 2 + .004, -.035), (larg / 2 - .004, -.035), (larg / 2 - .004, 0), (larg / 2 - .012, .006),
                             (-larg / 2 + .012, .006), (-larg / 2 + .004, 0)], lado=(0, 1, 0))
    # longarinas e travessas por baixo
    for y in (.45, -.45):
        varrer(p, 'Chassi_preto', [(PLAT_FRENTE, y, PISO - .035), (PLAT_DOBRA, y, PISO - .035), (PLAT_PONTA + .06, y, PLAT_Z_PONTA - .035)],
               [(-.04, -.13), (.04, -.13), (.04, 0), (-.04, 0)], lado=(0, 1, 0))
    x = PLAT_FRENTE - .1
    while x > PLAT_DOBRA:
        caixa(p, 'Chassi_preto', (x, 0, PISO - .075), (.05, 2 * PLAT_Y - .06, .08))
        x -= .48
    # trilhos laterais (aluminio) com fita refletiva, furos de amarracao e vigias ambar
    for lado in (1, -1):
        cam = [(PLAT_FRENTE, lado * (PLAT_Y - .015), PISO), (PLAT_DOBRA, lado * (PLAT_Y - .015), PISO), (PLAT_PONTA, lado * (PLAT_Y - .015), PLAT_Z_PONTA)]
        varrer(p, 'Aluminio', cam, [(-.018, -.16), (.018, -.16), (.018, .025), (.008, .035), (-.018, .035)], lado=(0, 1, 0))
        yf = lado * (PLAT_Y + .0035)
        # fita refletiva: vermelho e branco alternados (so no trecho reto)
        x = PLAT_FRENTE - .06
        k = 0
        while x - .25 > PLAT_DOBRA - .02:
            caixa(p, 'Refletivo_vermelho' if k % 2 else 'Refletivo_branco', (x - .125, yf, PISO - .095), (.25, .004, .05))
            x -= .25
            k += 1
        x = PLAT_FRENTE - .2
        while x > PLAT_DOBRA + .1:
            caixa(p, 'Preto_fosco', (x, yf + lado * .0005, PISO - .03), (.07, .004, .028), bevel=.004)
            x -= .42
        for xv in (1.05, -.45, -1.85):
            caixa(p, 'Preto_fosco', (xv, lado * (PLAT_Y - .02), PISO - .18), (.08, .04, .03), bevel=.006)
            caixa(p, 'Vigia_ambar', (xv, lado * (PLAT_Y - .01), PISO - .205), (.07, .03, .025), bevel=.008)
    # testeira da ponta: adesivo PERTO DEMAIS e zebrado dos lados
    caixa(p, 'Aluminio', (PLAT_PONTA - .005, 0, PLAT_Z_PONTA - .07), (.03, 2 * PLAT_Y, .16), bevel=.006)
    xa = PLAT_PONTA - .0215
    zm = PLAT_Z_PONTA - .07
    p.adesivo('perto_demais', (xa, 0, zm + .005), (0, -1, 0), (0, 0, 1), .66, .116)
    for y in (-.72, .72):
        p.adesivo('zebrado', (xa, y, zm), (0, -1, 0), (0, 0, 1), .72, .15, fracao=.72 / (.15 * 8))
    # para-lamas traseiros (meia lua de plastico sobre as rodas duplas)
    for lado in (1, -1):
        caminho = []
        for k in range(19):
            a = math.radians(8 + 164 * k / 18)
            caminho.append((EIXO_T + .46 * math.cos(a), lado * .75, R_PNEU + .46 * math.sin(a) * .98))
        varrer(p, 'Preto_fosco', caminho, [(-.26, -.008), (.26, -.008), (.26, .008), (-.26, .008)], lado=(0, 1, 0), liso=True)
        # para-barro com o QUEBROU? LIGOU!
        xm = EIXO_T - .5
        caixa(p, 'Borracha', (xm, lado * .75, .44), (.012, .46, .46))
        p.adesivo('parabarro', (xm - .007, lado * .75, .44), (0, -1, 0), (0, 0, 1), .45, .45)


def cabeceira(p):
    """Protetor de cabine na frente da plataforma: moldura, travessas, a placa SEM PRESSA virada para tras e dois
    farois de servico em cima."""
    x = PLAT_FRENTE - .03
    for y in (1.02, -1.02):
        caixa(p, 'Aluminio', (x, y, 1.56), (.07, .07, 1.02), bevel=.008)
    caixa(p, 'Aluminio', (x, 0, 2.08), (.07, 2.12, .07), bevel=.008)
    caixa(p, 'Aluminio', (x, 0, 1.40), (.05, 2.0, .05), bevel=.006)
    for z in (1.13, 1.22, 1.31):
        caixa(p, 'Aluminio', (x, 0, z), (.025, 1.98, .04), bevel=.004)
    caixa(p, 'Aluminio', (x + .01, 0, 1.735), (.02, 1.98, .56), bevel=.004)
    p.adesivo('cabeceira', (x - .002, 0, 1.735), (0, -1, 0), (0, 0, 1), 1.90, .52)
    for y in (.88, -.88):
        caixa(p, 'Preto_fosco', (x, y, 2.17), (.08, .18, .10), bevel=.015)
        caixa(p, 'Farol_lente', (x - .043, y, 2.17), (.01, .15, .07), bevel=.004)
    # guincho (tambor, motor, caixa de reducao), cabo e gancho
    gx = PLAT_FRENTE - .30
    caixa(p, 'Chassi_preto', (gx, 0, PISO + .02), (.32, .62, .04), bevel=.006)
    cilindro(p, 'Cabo_aco', (gx, -.15, PISO + .14), (gx, .15, PISO + .14), .085, 20)
    for y in (-.16, .16):
        cilindro(p, 'Chassi_preto', (gx, y - .01, PISO + .14), (gx, y + .01, PISO + .14), .115, 20)
    cilindro(p, 'Preto_fosco', (gx, .17, PISO + .14), (gx, .38, PISO + .14), .075, 18)
    caixa(p, 'Chassi_preto', (gx, -.24, PISO + .14), (.18, .14, .2), bevel=.02)
    a = Vector((gx - .06, 0.0, PISO + .062))
    b = Vector((-.55, .06, PISO + .012))
    cilindro(p, 'Cabo_aco', a, b, .007, 6)
    toro(p, 'Calco_amarelo', b + Vector((-.04, 0, .03)), (0, 1, 0), .035, .011, 16, 6, arco=math.radians(250))
    caixa(p, 'Calco_amarelo', b + Vector((-.005, 0, .012)), (.05, .025, .02), bevel=.006)


def tralha(p):
    """O que vai na plataforma: cones, calcos, galao, vassoura."""
    for x, y in ((.98, -.86), (.70, -.88)):
        caixa(p, 'Preto_fosco', (x, y, PISO + .015), (.30, .30, .03), bevel=.01)
        cilindro(p, 'Cone_laranja', (x, y, PISO + .03), (x, y, PISO + .52), .12, 20, raio1=.025)
        for z0, z1 in ((.22, .28), (.34, .38)):
            r0 = .12 - (.12 - .025) * (z0 - .03) / .49
            r1 = .12 - (.12 - .025) * (z1 - .03) / .49
            cilindro(p, 'Refletivo_branco', (x, y, PISO + z0), (x, y, PISO + z1), r0 + .002, 20, raio1=r1 + .002)
    for x in (.62, .38):
        t = bmesh.new()
        pts = [(-.13, 0), (.13, 0), (-.13, .13)]
        vs0 = [t.verts.new((a, -.09, b)) for a, b in pts]
        vs1 = [t.verts.new((a, .09, b)) for a, b in pts]
        t.faces.new(vs0)
        t.faces.new(vs1[::-1])
        for k in range(3):
            t.faces.new([vs0[k], vs0[(k + 1) % 3], vs1[(k + 1) % 3], vs1[k]])
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        t.transform(Matrix.Translation((x, .86, PISO)))
        p.colar(t, 'Calco_amarelo', liso=False)
    caixa(p, 'Galao_vermelho', (1.02, .70, PISO + .19), (.17, .30, .38), bevel=.03)
    caixa(p, 'Preto_fosco', (1.02, .62, PISO + .405), (.05, .05, .05), bevel=.01)
    caixa(p, 'Galao_vermelho', (1.02, .76, PISO + .40), (.05, .14, .04), bevel=.012)
    # vassoura encostada na cabeceira
    pe = Vector((1.12, -.50, PISO + .02))
    topo = Vector((PLAT_FRENTE - .07, -.40, PISO + 1.0))
    cilindro(p, 'Cabo_madeira', pe + Vector((0, 0, .1)), topo, .014, 8)
    caixa(p, 'Cabo_madeira', pe + Vector((0, 0, .1)), (.06, .30, .045), bevel=.01, rot=Euler((0, 0, math.radians(-25))))
    caixa(p, 'Cerdas', pe + Vector((0, 0, .045)), (.05, .29, .08), bevel=.01, rot=Euler((0, 0, math.radians(-25))))


def traseira(p):
    """Para-choque com faixas refletivas, suportes, lanternas, placa com luz e o olhal da fita."""
    xb = -2.35
    caixa(p, 'Chassi_preto', (xb, 0, .45), (.10, 2.0, .14), bevel=.012)
    for y in (.42, -.42):
        caixa(p, 'Chassi_preto', (xb + .02, y, .60), (.08, .06, .30), bevel=.006)
    for k in range(10):
        y = -.95 + .19 * (k + .5)
        caixa(p, 'Refletivo_vermelho' if k % 2 == 0 else 'Refletivo_branco', (xb - .052, y, .45), (.004, .19, .07))
    # lanternas nos cantos, debaixo da ponta da plataforma: ambar | vermelha | re
    for lado in (1, -1):
        caixa(p, 'Preto_fosco', (-2.43, lado * .86, .68), (.07, .32, .13), bevel=.012)
        caixa(p, 'Chassi_preto', (-2.40, lado * .86, .78), (.04, .06, .12))
        for y, mat in ((.96, 'Pisca_ambar'), (.86, 'Lanterna_vermelha'), (.76, 'Lente_re')):
            caixa(p, mat, (-2.467, lado * y, .68), (.012, .09, .095), bevel=.006)
    # placa no meio, com a luz em cima
    caixa(p, 'Chassi_preto', (-2.405, 0, .615), (.012, .44, .16))
    p.adesivo('placa', (-2.413, 0, .62), (0, -1, 0), (0, 0, 1), .40, .13)
    caixa(p, 'Preto_fosco', (-2.42, 0, .71), (.04, .12, .03), bevel=.008)
    # olhal da fita
    ox, _, oz = OLHAL
    caixa(p, 'Chassi_preto', (xb - .07, 0, oz), (.06, .07, .05), bevel=.01)
    toro(p, 'Cromado', (ox - .005, 0, oz), (0, 1, 0), .035, .01, 18, 6)


# ----------------------------------------------------------------------------------------------
# Rodas: pneu com gomos, roda de aco, porcas; duplas atras. Cada uma sob um pivo (Roda_*_PIVO) sem rotacao.
# ----------------------------------------------------------------------------------------------
def pneu(p, y0, largura, seg=48, M=None):
    h = largura / 2
    perfil = [(.205, y0 + h - .01), (.25, y0 + h + .006), (.31, y0 + h + .012), (.355, y0 + h + .006), (.38, y0 + h - .012),
              (R_PNEU, y0 + h - .03), (R_PNEU, y0 + .012), (R_PNEU - .009, y0 + .008), (R_PNEU - .009, y0 - .008),
              (R_PNEU, y0 - .012), (R_PNEU, y0 - h + .03), (.38, y0 - h + .012), (.355, y0 - h - .006), (.31, y0 - h - .012),
              (.25, y0 - h - .006), (.205, y0 - h + .01)]
    def gomo(i, j, r):
        if r < R_PNEU - .0001:
            return r
        lado = 0 if perfil[i][1] > y0 else 1
        return r - .010 if (j + 2 * lado) % 4 < 2 else r
    torno(p, 'Pneu', perfil, seg, gomo, M)


def roda_aco(p, y_fora, y_dentro, prato, furos=True, M=None, simples=False):
    """Aro e prato de aco: o prato fica em y=prato; o cubo sai para fora (y_fora > y_dentro)."""
    s = 1 if y_fora > y_dentro else -1
    perfil = [(.0, prato + s * .012), (.06, prato + s * .012), (.075, prato + s * .004), (.165, prato), (.19, prato - s * .01),
              (.196, y_dentro + s * .01), (.204, y_dentro), (.214, y_dentro - s * .006), (.214, y_dentro + s * .006), (.196, y_dentro + s * .02),
              (.196, y_fora - s * .02), (.214, y_fora - s * .006), (.214, y_fora + s * .006), (.204, y_fora), (.192, y_fora - s * .012),
              (.18, prato + s * .02), (.165, prato + s * .006), (.075, prato + s * .012), (.06, prato + s * .02), (.0, prato + s * .02)]
    if simples:     # a de dentro da dupla: so o aro, quase toda escondida
        perfil = [(.196, y_dentro + s * .01), (.214, y_dentro), (.214, y_fora), (.196, y_fora - s * .012), (.165, prato), (.0, prato)]
    torno(p, 'Aco_roda', perfil, 32, None, M)
    if simples:
        return
    if furos:
        for k in range(6):
            a = 2 * math.pi * (k + .5) / 6
            c = Vector((.125 * math.cos(a), prato + s * .005, .125 * math.sin(a)))
            t = bmesh.new()
            bmesh.ops.create_circle(t, cap_ends=True, segments=12, radius=.026)
            t.transform(Matrix.Translation(c) @ Matrix.Rotation(-s * math.pi / 2, 4, 'X'))
            if M is not None:
                t.transform(M)
            p.colar(t, 'Preto_fosco')
    # cubo, porcas e calota
    pc = Vector((0, prato + s * .02, 0))
    cilindro_m(p, 'Aco_roda', pc, pc + Vector((0, s * .05, 0)), .07, 20, M)
    for k in range(8):
        a = 2 * math.pi * k / 8
        q = Vector((.052 * math.cos(a), 0, .052 * math.sin(a)))
        cilindro_m(p, 'Cromado', pc + q + Vector((0, s * .05, 0)), pc + q + Vector((0, s * .066, 0)), .011, 6, M)
    cilindro_m(p, 'Cromado', pc + Vector((0, s * .05, 0)), pc + Vector((0, s * .075, 0)), .03, 14, M)


def rodas():
    """Uma malha por eixo, montada para o lado esquerdo (fora = +Y); a do lado direito e a mesma, girada 180 graus
    num objeto filho do pivo (o glTF guarda a malha uma vez so)."""
    malhas = {}
    p = Peca('Roda_dianteira')
    pneu(p, 0, .215)
    roda_aco(p, .095, -.095, .03)
    malhas['dianteira'] = p.objeto(angulo=40)
    p = Peca('Roda_traseira')
    pneu(p, .12, .20)
    pneu(p, -.12, .20)
    roda_aco(p, .215, -.02, .0)
    roda_aco(p, -.215, .02, -.005, furos=False, simples=True)
    malhas['traseira'] = p.objeto(angulo=40)
    pivos = []
    for nome, eixo, x, y in (('Roda_dianteira_E', 'dianteira', EIXO_F, Y_RODA_F), ('Roda_dianteira_D', 'dianteira', EIXO_F, -Y_RODA_F),
                             ('Roda_traseira_E', 'traseira', EIXO_T, Y_RODA_T), ('Roda_traseira_D', 'traseira', EIXO_T, -Y_RODA_T)):
        piv = bpy.data.objects.new(nome + '_PIVO', None)
        piv.empty_display_type = 'SPHERE'
        piv.empty_display_size = .1
        piv.location = (x, y, R_PNEU)
        bpy.context.scene.collection.objects.link(piv)
        o = bpy.data.objects.new(nome, malhas[eixo].data)
        bpy.context.scene.collection.objects.link(o)
        o.parent = piv
        if y < 0:
            o.rotation_euler = (0, 0, math.pi)
        pivos.append(piv)
    for m in malhas.values():
        bpy.data.objects.remove(m)
    return pivos


# ----------------------------------------------------------------------------------------------
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configurar(MATERIAIS, ATLAS, UV)
    cab, bvh = casca_cabine()
    corpo = Peca('Guincho_carroceria', adesivos=Peca('Guincho_adesivos', uv=True))
    detalhes_cabine(corpo, bvh)
    giroflex(corpo)
    interior(corpo)
    chassi(corpo)
    plataforma(corpo)
    cabeceira(corpo)
    tralha(corpo)
    traseira(corpo)
    recortar_cabine(cab)
    oc = corpo.objeto()
    corpo.adesivos.objeto()
    juntar(oc, [cab])
    oc.name = 'Guincho_carroceria'
    oc.data.name = 'Guincho_carroceria'
    um_slot_por_material(oc)
    normais_por_area(oc)
    # pontos que o jogo usa (extras do glTF): o olhal da fita e o banco do motorista, no referencial do jogo
    oc['olhal_fita'] = [OLHAL[0], OLHAL[2], -OLHAL[1]]
    oc['banco_motorista'] = [BANCO_MOTORISTA[0], BANCO_MOTORISTA[2], -BANCO_MOTORISTA[1]]
    pivos = rodas()
    tris = sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('GUINCHO_TRIANGULOS', tris, 'MATERIAIS', len(bpy.data.materials), flush=True)
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    if '--sem-glb' in ARGS:
        return
    exportar_glb(GLB)
    print('GUINCHO_GLB', GLB, GLB.stat().st_size, flush=True)


main()
