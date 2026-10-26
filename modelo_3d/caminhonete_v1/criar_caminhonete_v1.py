# -*- coding: utf-8 -*-
"""Caminhonete do resgate (caminhonete_v1) procedural no Blender: a 4x4 cabine dupla que reboca, na fita, o Opala
quebrado no Modo Historia e os carros parados no multiplayer (tow-truck.js). Pedido #24 da Central de Projetos: "uma
caminhonete 4x4 cabine dupla similar a Hilux, Frontier e afins", de desenho ficticio, sem marca de montadora.

A marca e inventada (TATU) e o dono e o GUINCHO QUEBROU-LIGOU, como o guincho plataforma (guincho_v1). Carroceria
de baixo varrida por secoes ao longo do comprimento (capo, para-lamas, portas, cacamba), recortada por Boolean: caixas
de roda, a cabine por dentro e a cacamba (com protetor preto); a parte de cima da cabine (colunas, teto) moldada por
fatias horizontais, com espessura e as janelas recortadas. Grade, farois, quebra-mato com guincho eletrico, snorkel,
estribos, retrovisores, giroflex, santo antonio com farois de servico, lanternas verticais, para-choque com degrau,
placa SOS4X44 e a manilha onde a fita engata; bancos, painel e volante por dentro (o motorista e do jogo); rodas de
liga com pneus de uso misto, cada uma num pivo sem rotacao (Roda_*_PIVO).

Convencoes: metros | X para a frente | Y para a esquerda (motorista) | Z para cima | origem no chao, 2,45 m a frente
da manilha (como o guincho: o jogo posiciona o carro rebocado por essa medida). No glTF: x frente, y cima, z direita.

Uso, da raiz do projeto:
 blender --background --factory-startup --python modelo_3d/caminhonete_v1/criar_caminhonete_v1.py [-- --sem-glb]
Saidas: modelo_3d/caminhonete_v1/caminhonete_v1.blend e pista_interlagos/teste/assets/caminhonete_v1.glb.
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
from veiculos_comum import *              # noqa: E402,F403  (Peca, caixa, varrer, tubo, recortar, ...)
from veiculos_comum import _pchip, configurar, material  # noqa: E402

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
ATLAS = AQUI / 'texturas' / 'caminhonete_adesivos_v1.png'
UV = json.loads((AQUI / 'texturas' / 'caminhonete_adesivos_v1.json').read_text(encoding='utf-8'))
BLEND = AQUI / 'caminhonete_v1.blend'
GLB = RAIZ / 'pista_interlagos' / 'teste' / 'assets' / 'caminhonete_v1.glb'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ----------------------------------------------------------------------------------------------
# Medidas (m)
# ----------------------------------------------------------------------------------------------
EIXO_F, EIXO_T = 1.935, -1.15           # entre-eixos 3,085
R_PNEU, L_PNEU = 0.40, 0.245            # 265/70 R17 (de uso misto)
Y_RODA = 0.775                          # bitola / 2
X_NARIZ, X_RABO = 2.95, -2.37           # frente da carroceria e tampa da cacamba
ARCO_R = 0.48                           # caixas de roda
CACAMBA = (-.945, -2.31, .775, .88)     # cacamba por dentro: frente, fundo, meia largura, piso
OLHAL = (-2.45, 0.0, 0.43)              # a manilha da fita (tow-truck.js hook)
BANCO_MOTORISTA = (.30, .42, .98)       # quadril do motorista (tow-truck.js seat: 47 cm abaixo, no referencial do jogo)
FAIXA = (.84, .89)                      # faixa amarela; friso preto ate .90

# Carroceria de baixo, por X: topo (capo, linha de cintura, borda da cacamba), fundo e meia largura.
C_TOPO = [(X_RABO, 1.255), (-2.34, 1.27), (-2.25, 1.28), (-.95, 1.28), (-.88, 1.27), (1.12, 1.27), (1.30, 1.255), (1.8, 1.235),
          (2.3, 1.205), (2.7, 1.17), (2.84, 1.14), (2.91, 1.10), (X_NARIZ, 1.05)]
C_FUNDO = [(X_RABO, .52), (-2.30, .46), (-2.2, .44), (2.65, .44), (2.85, .47), (X_NARIZ, .52)]
C_LARG = [(X_RABO, .895), (-2.33, .915), (-2.22, .925), (2.60, .925), (2.80, .91), (2.88, .885), (2.93, .85), (X_NARIZ, .80)]
SECOES = sorted(set([round(float(x), 4) for x in list(np.linspace(X_RABO, X_RABO + .14, 6)) + list(np.arange(-2.2, 2.7, .1))
                     + list(np.linspace(2.72, X_NARIZ, 9))]))

# Parte de cima da cabine, por Z: frente (para-brisa), meia largura, raio dos cantos da frente, parede de tras.
G_Z = [1.20, 1.27, 1.33, 1.45, 1.57, 1.67, 1.74, 1.79, 1.825, 1.843, 1.85]
G_XF = [1.18, 1.12, 1.05, .91, .77, .65, .56, .49, .43, .37, .31]
G_W = [.875, .875, .868, .852, .835, .818, .803, .79, .777, .762, .742]
G_RF = [.13, .13, .13, .14, .15, .16, .16, .16, .15, .13, .11]
G_XT = [-.87, -.87, -.87, -.865, -.86, -.855, -.85, -.845, -.84, -.835, -.82]
G_RT = .08
G_LINHAS = [1.20, 1.24, 1.27, 1.30, 1.33, 1.38, 1.44, 1.50, 1.56, 1.62, 1.67, 1.71, 1.74, 1.765, 1.79, 1.81, 1.825, 1.837, 1.845, 1.85]

JANELA_F = poligono_arredondado([(.10, 1.33), (.875, 1.33), (.37, 1.73), (.10, 1.73)], .04)           # (X, Z)
JANELA_T = poligono_arredondado([(-.70, 1.33), (.00, 1.33), (.00, 1.73), (-.64, 1.73)], .04)          # (X, Z)
PARABRISA = poligono_arredondado([(-.70, 1.30), (.70, 1.30), (.59, 1.775), (-.59, 1.775)], .06)       # (Y, Z)
VIGIA = poligono_arredondado([(-.55, 1.37), (.55, 1.37), (.52, 1.70), (-.52, 1.70)], .05)             # (Y, Z)

MATERIAIS = {
    'Pintura_branca': ('f1f0eb', 0, .3),
    'Faixa_amarela': ('f2c418', 0, .34),
    'Preto_fosco': ('17181a', 0, .78),
    'Preto_brilho': ('0e0f10', .1, .32),
    'Chassi_preto': ('1c1d1e', .25, .55),
    'Plastico_cacamba': ('1a1a1b', 0, .9),
    'Interior_cinza': ('3f4245', 0, .86),
    'Borracha': ('111112', 0, .9),
    'Pneu': ('1a1a1b', 0, .93),
    'Liga_roda': ('4a4e52', .75, .34),
    'Aco_escovado': ('8a8d90', .8, .45),
    'Cromado': ('d8dadc', 1, .14),
    'Aluminio': ('c2c6c9', .85, .36),
    'Cabo_aco': ('3c3c3a', .7, .45),
    'Espelho': ('e6ecf0', 1, .03),
    'Vidro': ('1a2329', .2, .05, None, 0, .42),
    'Farol_lente': ('e8ecee', 0, .1, 'fff3dc', .8),
    'Lente_re': ('dcdcd6', 0, .2),
    'Lanterna_vermelha': ('a5141a', 0, .25, 'ff2a20', 1.6),
    'Pisca_ambar': ('d8790f', 0, .25, 'ff9a1c', 0),
    'Giroflex_A': ('e88a12', 0, .2, 'ffa21a', .3),
    'Giroflex_B': ('e88a12', 0, .2, 'ffa21a', .3),
    'Refletivo_branco': ('efefea', 0, .38),
    'Cone_laranja': ('ff5a12', 0, .55),
    'Calco_amarelo': ('e6b20e', 0, .6),
    'Galao_vermelho': ('b3191b', 0, .48),
    'Adesivos': ('ffffff', 0, .4),
}


def perfil(tabela, x):
    return _pchip([a for a, _ in tabela], [b for _, b in tabela], x)


def gperfil(tab, z):
    return _pchip(G_Z, tab, z)


# ----------------------------------------------------------------------------------------------
# Carroceria de baixo: secoes em Y-Z varridas ao longo de X (fechada nas pontas)
# ----------------------------------------------------------------------------------------------
def secao(x):
    """Meia secao (lado esquerdo) do fundo ao meio do topo: [(y, z)]."""
    zb, zt, w = perfil(C_FUNDO, x), perfil(C_TOPO, x), perfil(C_LARG, x)
    rb, rs, tumb = .05, .07, .025
    crown = .025 if x > 1.12 else 0.0
    pts = [((w - rb) * k / 4, zb) for k in range(4)]
    for k in range(3):
        a = math.radians(-90 + 90 * k / 3)
        pts.append((w - rb + rb * math.cos(a), zb + rb + rb * math.sin(a)))
    lo, hi = zb + rb, zt - rs
    zs = [lo, .62, .84, .89, .90, 1.00, 1.10, 1.18, hi] if hi - lo > .62 else list(np.linspace(lo, hi, 9))
    lado = lambda z: w - tumb * ((z - zb) / (zt - zb)) ** 2
    pts += [(lado(z), z) for z in zs]
    ys = lado(hi) - rs
    for k in range(1, 5):
        a = math.radians(90 * k / 5)
        pts.append((ys + rs * math.cos(a), hi + rs * math.sin(a)))
    for k in range(5):
        y = ys * (1 - k / 5)
        pts.append((y, zt + crown * (1 - (y / ys) ** 2)))
    pts.append((0.0, zt + crown))
    return pts


def carroceria():
    bm = bmesh.new()
    aneis = []
    for x in SECOES:
        meia = secao(x)
        anel = meia + [(-y, z) for y, z in reversed(meia[1:-1])]
        aneis.append([bm.verts.new((x, y, z)) for y, z in anel])
    n = len(aneis[0])
    for k in range(len(aneis) - 1):
        for i in range(n):
            bm.faces.new([aneis[k][i], aneis[k][(i + 1) % n], aneis[k + 1][(i + 1) % n], aneis[k + 1][i]])
    bm.faces.new(aneis[0])
    bm.faces.new(aneis[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
        c = f.calc_center_median()
        if abs(c.y) > .80 and -2.32 < c.x < 2.80 and FAIXA[0] <= c.z < FAIXA[1]:
            f.material_index = 1
        elif abs(c.y) > .80 and -2.32 < c.x < 2.80 and FAIXA[1] <= c.z < .90:
            f.material_index = 2
        elif c.x > 2.70 and c.z < .70:
            f.material_index = 2
    return bm


# ----------------------------------------------------------------------------------------------
# Cabine de cima: fatias horizontais (como a cabine do guincho)
# ----------------------------------------------------------------------------------------------
NS, NC, NF, NR, NB = 18, 7, 14, 3, 10


def anel_cabine(z):
    xf, w, rf, xt = gperfil(G_XF, z), gperfil(G_W, z), gperfil(G_RF, z), gperfil(G_XT, z)
    rt, bojo = G_RT, .035
    pts = []
    for i in range(NS):
        pts.append((xt + rt + (xf - rf - xt - rt) * i / NS, -w))
    for i in range(NC):
        a = math.radians(-90 + 90 * i / NC)
        pts.append((xf - rf + rf * math.cos(a), -(w - rf) + rf * math.sin(a)))
    for i in range(NF):
        y = -(w - rf) + 2 * (w - rf) * i / NF
        pts.append((xf + bojo * (1 - (y / (w - rf)) ** 2), y))
    for i in range(NC):
        a = math.radians(90 * i / NC)
        pts.append((xf - rf + rf * math.cos(a), (w - rf) + rf * math.sin(a)))
    for i in range(NS):
        pts.append((xf - rf - (xf - rf - xt - rt) * i / NS, w))
    for i in range(NR):
        a = math.radians(90 + 90 * i / NR)
        pts.append((xt + rt + rt * math.cos(a), (w - rt) + rt * math.sin(a)))
    for i in range(NB):
        pts.append((xt, (w - rt) - 2 * (w - rt) * i / NB))
    for i in range(NR):
        a = math.radians(180 + 90 * i / NR)
        pts.append((xt + rt + rt * math.cos(a), -(w - rt) + rt * math.sin(a)))
    return pts


def cabine():
    bm = bmesh.new()
    aneis = [[bm.verts.new((x, y, z)) for x, y in anel_cabine(z)] for z in G_LINHAS]
    n = len(aneis[0])
    for k in range(len(aneis) - 1):
        for i in range(n):
            f = bm.faces.new([aneis[k][i], aneis[k][(i + 1) % n], aneis[k + 1][(i + 1) % n], aneis[k + 1][i]])
            f.smooth = True
    bm.faces.new(aneis[-1]).smooth = True
    bm.normal_update()
    return bm


def objeto_de(bm, nome, mats):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    for m in mats:
        me.materials.append(material(m))
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def bvh_de(*bms):
    verts, polys = [], []
    for bm in bms:
        base = len(verts)
        bm.verts.index_update()
        verts += [v.co.copy() for v in bm.verts]
        polys += [[base + v.index for v in f.verts] for f in bm.faces]
    return BVHTree.FromPolygons(verts, polys)


# ----------------------------------------------------------------------------------------------
# Lataria: vaos, macanetas, farois, grade, retrovisores, adesivos
# ----------------------------------------------------------------------------------------------
def porta_frente():
    return [(.05, .50), (.05, 1.775), (.40, 1.775), (.93, 1.31), (1.12, 1.25), (1.12, .50)]


def porta_tras():
    pts = [(-.02, .50), (-.02, 1.775), (-.62, 1.775), (-.84, 1.40), (-.84, .84)]
    for k in range(1, 9):
        a = math.radians(55.7 - (55.7 - 12.1) * k / 8)
        pts.append((EIXO_T + .55 * math.cos(a), R_PNEU + .55 * math.sin(a)))
    return pts


def lataria(p, bvh, bvh_cab):
    for lado in (1, -1):
        friso_projetado(p, bvh, porta_frente(), lado)
        friso_projetado(p, bvh, porta_tras(), lado)
        for x in (.15, -.72):
            bloco_na_lataria(p, bvh, 'Preto_fosco', (x, 3 * lado, 1.20), (0, -lado, 0), .13, .035, .028, bevel=.012)
        adesivo_projetado(p, bvh, 'porta', (.58, 1.05), .90, .246, lado)
        adesivo_projetado(p, bvh, 'porta_tras', (-.40, 1.05), .72, .09, lado, nv=2)
        adesivo_projetado(p, bvh, 'quatro', (-1.98, 1.17), .30, .075, lado, nu=4, nv=2)
        # repetidor do pisca no para-lama e o snorkel/retrovisor
        bloco_na_lataria(p, bvh, 'Pisca_ambar', (2.30, 3 * lado, 1.02), (0, -lado, 0), .07, .03, .018, bevel=.01)
        a, _ = acerta(bvh, (1.00, 3 * lado, 1.31), (0, -lado, 0))
        cilindro(p, 'Preto_fosco', a, (1.02, lado * 1.02, 1.40), .014, 8)
        caixa(p, 'Preto_fosco', (1.03, lado * 1.06, 1.43), (.08, .23, .16), bevel=.025, seg=3)
        caixa(p, 'Espelho', (.988, lado * 1.06, 1.43), (.004, .20, .13))
        # calha do teto
        friso_projetado(p, bvh_cab, [(-.80, 1.80), (.30, 1.80)], lado, largura=.012, afasta=.004, fechado=False)
    # tampa do tanque (esquerda, atras da roda)
    friso_projetado(p, bvh, ret_arredondado(-2.04, -1.88, .93, 1.05, .03), 1)
    # capo e tampa da cacamba
    friso_projetado(p, bvh, [(1.17, .80), (2.86, .78), (2.86, -.78), (1.17, -.80)], 1, plano='XY')
    friso_projetado(p, bvh, [(-.80, 1.255), (-.80, .64), (.80, .64), (.80, 1.255)], -1, fechado=False, plano='YZ')
    bloco_na_lataria(p, bvh, 'Preto_fosco', (-4, 0, 1.235), (1, 0, 0), .18, .03, .02, bevel=.008)
    xr = X_RABO - .003
    p.adesivo('tampa', (xr, 0, 1.06), (0, -1, 0), (0, 0, 1), 1.10, .30)
    p.adesivo('perto_demais', (xr, 0, .82), (0, -1, 0), (0, 0, 1), .60, .105)
    # vidros e faixa do para-brisa
    for lado in (1, -1):
        vidro_projetado(p, bvh_cab, JANELA_F, 'XZ', lado)
        vidro_projetado(p, bvh_cab, JANELA_T, 'XZ', lado)
    vidro_projetado(p, bvh_cab, PARABRISA, 'YZ', 1)
    vidro_projetado(p, bvh_cab, VIGIA, 'YZ', -1)
    u0, v0, u1, v1 = UV['parabrisa']
    pts = []
    for y, z in [(-.55, 1.70), (.55, 1.70), (.55, 1.762), (-.55, 1.762)]:
        loc, nor = acerta(bvh_cab, (4, y, z), (-1, 0, 0))
        pts.append(tuple(loc - nor * .02))
    p.quad(pts, 'Adesivos', [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], fora=(1, 0, .6))
    for y0, y1 in [(.38, -.14), (-.30, -.80)]:
        a, na = acerta(bvh_cab, (4, y0, 1.32), (-1, 0, 0))
        b, nb = acerta(bvh_cab, (4, y1, 1.37), (-1, 0, 0))
        a, b = a + na * .02, b + nb * .02
        varrer(p, 'Preto_fosco', [a, b], [(-.008, -.006), (.008, -.006), (.008, .006), (-.008, .006)], lado=na)
        cilindro(p, 'Preto_fosco', a - na * .02, a + na * .01, .018, 10)
    # terceira luz de freio
    bloco_na_lataria(p, bvh_cab, 'Lanterna_vermelha', (-4, 0, 1.79), (1, 0, 0), .32, .035, .03, bevel=.01)


def frente(p, bvh):
    """Grade com o emblema TATU, farois rasgados, milhas, placa, quebra-mato e o guincho eletrico."""
    loc, N, H, V = bloco_na_lataria(p, bvh, 'Cromado', (4, 0, .87), (-1, 0, 0), .90, .28, .045, bevel=.03, seg=3)
    bloco_na_lataria(p, bvh, 'Preto_brilho', (4, 0, .87), (-1, 0, 0), .84, .23, .06, bevel=.02)
    for z in (.80, .87, .94):
        bloco_na_lataria(p, bvh, 'Cromado', (4, 0, z), (-1, 0, 0), .80, .016, .07, bevel=.006)
    p.adesivo('emblema', loc + N * .052, (0, 1, 0), (0, 0, 1), .19, .095)
    # farois: caixa preta, farol com aro cromado e o pisca ambar na ponta de fora
    for lado in (1, -1):
        bloco_na_lataria(p, bvh, 'Preto_fosco', (4, lado * .635, .965), (-1, 0, 0), .33, .12, .04, bevel=.02)
        bloco_na_lataria(p, bvh, 'Cromado', (4, lado * .61, .965), (-1, 0, 0), .25, .095, .046, bevel=.02)
        bloco_na_lataria(p, bvh, 'Farol_lente', (4, lado * .61, .965), (-1, 0, 0), .23, .078, .052, bevel=.025, seg=3)
        bloco_na_lataria(p, bvh, 'Pisca_ambar', (4, lado * .765, .965), (-1, 0, 0), .05, .078, .05, bevel=.015)
        cilindro(p, 'Farol_lente', (2.94, lado * .64, .60), (2.975, lado * .64, .60), .045, 16)
        cilindro(p, 'Cromado', (2.935, lado * .64, .60), (2.97, lado * .64, .60), .053, 16)
    xb = X_NARIZ
    caixa(p, 'Preto_fosco', (xb + .004, 0, .62), (.008, .42, .145))
    p.adesivo('placa', (xb + .01, 0, .62), (0, 1, 0), (0, 0, 1), .40, .13)
    # quebra-mato (tubo preto) e guincho eletrico no meio
    caminho = [(2.97, .42, .45), (3.07, .42, .60), (3.08, .40, .98), (3.05, .30, 1.10), (3.05, -.30, 1.10), (3.08, -.40, .98), (3.07, -.42, .60), (2.97, -.42, .45)]
    tubo(p, 'Preto_fosco', caminho, .032, 12, curva=.10)
    for lado in (1, -1):
        tubo(p, 'Preto_fosco', [(3.075, lado * .42, .78), (3.06, lado * .62, .76), (2.97, lado * .80, .72)], .025, 10, curva=.06)
        caixa(p, 'Chassi_preto', (2.97, lado * .42, .46), (.10, .08, .06), bevel=.01)
    caixa(p, 'Chassi_preto', (3.01, 0, .48), (.12, .42, .12), bevel=.015)
    cilindro(p, 'Cabo_aco', (3.03, -.13, .49), (3.03, .13, .49), .05, 16)
    cilindro(p, 'Preto_fosco', (3.03, .13, .49), (3.03, .24, .49), .045, 14)
    toro(p, 'Calco_amarelo', (3.11, 0, .47), (0, 1, 0), .03, .009, 14, 6, arco=math.radians(250))


def snorkel(p):
    """Snorkel subindo pela coluna da direita."""
    pts = [(1.68, -.975, 1.00), (1.40, -.97, 1.20), (1.16, -.965, 1.29)]
    for z in (1.38, 1.50, 1.62, 1.72, 1.80):
        xf, w, rf = gperfil(G_XF, z), gperfil(G_W, z), gperfil(G_RF, z)
        a = math.radians(62)
        cx, cy = xf - rf + rf * math.cos(a), w - rf + rf * math.sin(a)
        pts.append((cx + .058 * math.cos(a), -(cy + .058 * math.sin(a)), z))
    tubo(p, 'Preto_fosco', pts, .045, 12, curva=.12)
    topo = Vector(pts[-1])
    cilindro(p, 'Preto_fosco', topo + Vector((-.03, 0, -.01)), topo + Vector((.13, 0, .03)), .064, 16)
    cilindro(p, 'Preto_brilho', topo + Vector((.13, 0, .03)), topo + Vector((.14, 0, .032)), .055, 16)
    for q in (pts[2], pts[5]):
        caixa(p, 'Preto_fosco', (q[0], q[1] + .035, q[2]), (.03, .05, .03), bevel=.006)


def estribos(p):
    for lado in (1, -1):
        tubo(p, 'Preto_fosco', [(1.36, lado * .86, .44), (1.30, lado * .975, .38), (-.74, lado * .975, .38), (-.80, lado * .86, .44)], .03, 12, curva=.06)
        for x in (.90, .10, -.55):
            caixa(p, 'Aluminio', (x, lado * .975, .415), (.22, .07, .012), bevel=.004)
        for x in (.70, -.30):
            caixa(p, 'Chassi_preto', (x, lado * .91, .41), (.05, .12, .04))


def paralamas(p):
    """Alargadores pretos em volta das caixas de roda e para-barros."""
    for xe in (EIXO_F, EIXO_T):
        for lado in (1, -1):
            caminho = []
            for k in range(25):
                a = math.radians(7 + 166 * k / 24)
                caminho.append((xe + (ARCO_R + .012) * math.cos(a), lado * .925, R_PNEU + (ARCO_R + .012) * math.sin(a)))
            varrer(p, 'Preto_fosco', caminho, [(-.015, -.018), (.045, -.018), (.04, .05), (-.015, .05)], lado=(0, lado, 0), liso=True)
            xm = xe - ARCO_R - .05 if xe < 0 else xe - ARCO_R - .04
            caixa(p, 'Borracha', (xm, lado * Y_RODA, .30), (.012, .30, .24))


def teto(p):
    """Giroflex no teto, antena do radio."""
    z, x = 1.85, -.20
    for y in (.5, -.5):
        caixa(p, 'Preto_fosco', (x, y, z + .02), (.16, .06, .04), bevel=.01)
    caixa(p, 'Preto_fosco', (x, 0, z + .065), (.26, 1.30, .05), bevel=.015)
    caixa(p, 'Giroflex_A', (x, .385, z + .15), (.22, .49, .12), bevel=.045, seg=3)
    caixa(p, 'Giroflex_B', (x, -.385, z + .15), (.22, .49, .12), bevel=.045, seg=3)
    caixa(p, 'Preto_fosco', (x, 0, z + .145), (.21, .28, .11), bevel=.02)
    for fora in (1, -1):
        p.adesivo('giroflex', (x + fora * .1065, 0, z + .145), (0, fora, 0), (0, 0, 1), .24, .07)
    cilindro(p, 'Preto_fosco', (-.70, .55, 1.84), (-.70, .55, 1.90), .018, 10)
    cilindro(p, 'Preto_fosco', (-.70, .55, 1.90), (-.73, .55, 2.75), .004, 6, raio1=.002)


def cacamba(p):
    """Santo antonio com farois de servico e extintor; caixa de ferramentas, estepe, cones e galao; frisos no piso."""
    x0, x1, yi, piso = CACAMBA
    for k in range(6):
        y = -.60 + .24 * k
        caixa(p, 'Plastico_cacamba', ((x0 + x1) / 2, y, piso + .008), (abs(x1 - x0) - .04, .05, .016), bevel=.005)
    xs = -1.03
    tubo(p, 'Preto_fosco', [(xs, .80, 1.28), (xs, .80, 1.68), (xs, .70, 1.76), (xs, -.70, 1.76), (xs, -.80, 1.68), (xs, -.80, 1.28)], .032, 12, curva=.12)
    for lado in (1, -1):
        tubo(p, 'Preto_fosco', [(xs - .01, lado * .80, 1.62), (-1.62, lado * .84, 1.28)], .026, 10)
        caixa(p, 'Chassi_preto', (xs, lado * .80, 1.285), (.10, .08, .012))
        caixa(p, 'Preto_fosco', (xs - .01, lado * .45, 1.83), (.09, .18, .10), bevel=.015)
        caixa(p, 'Farol_lente', (xs - .058, lado * .45, 1.83), (.01, .15, .07), bevel=.004)
    cilindro(p, 'Galao_vermelho', (xs - .10, -.66, piso + .02), (xs - .10, -.66, piso + .42), .055, 14)
    cilindro(p, 'Preto_fosco', (xs - .10, -.66, piso + .42), (xs - .10, -.66, piso + .48), .02, 8)
    caixa(p, 'Preto_fosco', (-1.21, .10, piso + .15), (.28, 1.20, .30), bevel=.03)
    for y in (-.30, .50):
        caixa(p, 'Cromado', (-1.352, y, piso + .22), (.012, .10, .03), bevel=.004)
    # estepe deitado
    M = Matrix.Translation((-1.78, .33, piso + .125)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    pneu(p, 0, L_PNEU, M=M)
    roda_liga(p, M=M, raios=False)
    for x, y in ((-2.10, -.45), (-1.80, -.58)):
        caixa(p, 'Preto_fosco', (x, y, piso + .015), (.30, .30, .03), bevel=.01)
        cilindro(p, 'Cone_laranja', (x, y, piso + .03), (x, y, piso + .52), .12, 20, raio1=.025)
        for z0, z1 in ((.22, .28), (.34, .38)):
            r0 = .12 - (.12 - .025) * (z0 - .03) / .49
            r1 = .12 - (.12 - .025) * (z1 - .03) / .49
            cilindro(p, 'Refletivo_branco', (x, y, piso + z0), (x, y, piso + z1), r0 + .002, 20, raio1=r1 + .002)
    caixa(p, 'Galao_vermelho', (-1.52, -.30, piso + .19), (.30, .17, .38), bevel=.03)
    caixa(p, 'Preto_fosco', (-1.44, -.30, piso + .405), (.05, .05, .05), bevel=.01)


def traseira(p, bvh):
    """Lanternas verticais nos cantos, para-choque com degrau, placa e a manilha da fita."""
    for lado in (1, -1):
        bloco_na_lataria(p, bvh, 'Preto_fosco', (-4, lado * .855, 1.07), (1, 0, 0), .12, .38, .035, bevel=.015)
        for z, h, mat in ((1.17, .15, 'Lanterna_vermelha'), (1.04, .09, 'Pisca_ambar'), (.94, .09, 'Lente_re')):
            bloco_na_lataria(p, bvh, mat, (-4, lado * .855, z), (1, 0, 0), .10, h, .045, bevel=.012)
        bloco_na_lataria(p, bvh, 'Lanterna_vermelha', (-2.30, 3 * lado, 1.10), (0, -lado, 0), .09, .26, .02, bevel=.01)
    caixa(p, 'Preto_fosco', (-2.43, 0, .52), (.13, 1.74, .16), bevel=.025, seg=3)
    caixa(p, 'Aluminio', (-2.44, 0, .603), (.12, .50, .012), bevel=.004)
    caixa(p, 'Preto_fosco', (-2.497, 0, .53), (.006, .42, .145))
    p.adesivo('placa', (-2.501, 0, .53), (0, -1, 0), (0, 0, 1), .40, .13)
    caixa(p, 'Preto_fosco', (-2.48, 0, .615), (.04, .12, .025), bevel=.008)
    ox, _, oz = OLHAL
    caixa(p, 'Chassi_preto', (-2.40, 0, oz), (.16, .07, .07), bevel=.008)
    caixa(p, 'Chassi_preto', (-2.47, 0, oz), (.03, .05, .06), bevel=.006)
    toro(p, 'Calco_amarelo', (ox - .03, 0, oz), (0, 1, 0), .032, .01, 18, 6)


def chassi(p):
    for y in (.42, -.42):
        caixa_entre(p, 'Chassi_preto', (-2.28, y - .035, .30), (2.70, y + .035, .42), bevel=.008)
    for x in (-2.15, -.90, .40, 1.60, 2.55):
        caixa(p, 'Chassi_preto', (x, 0, .36), (.07, .80, .10), bevel=.006)
    cilindro(p, 'Chassi_preto', (EIXO_T, -.70, R_PNEU), (EIXO_T, .70, R_PNEU), .055, 14)
    cilindro(p, 'Chassi_preto', (EIXO_T - .15, 0, R_PNEU), (EIXO_T + .15, 0, R_PNEU), .14, 18)
    cilindro(p, 'Chassi_preto', (EIXO_F - .12, 0, R_PNEU + .02), (EIXO_F + .12, 0, R_PNEU + .02), .11, 16)
    cilindro(p, 'Chassi_preto', (EIXO_F, -.70, R_PNEU), (EIXO_F, .70, R_PNEU), .035, 10)
    cilindro(p, 'Chassi_preto', (EIXO_T + .15, 0, R_PNEU + .02), (EIXO_F - .12, 0, R_PNEU + .02), .035, 10)
    tubo(p, 'Chassi_preto', [(1.50, -.28, .34), (-.60, -.28, .33), (-1.70, -.55, .36), (-2.32, -.55, .38)], .03, 10, curva=.2)
    cilindro(p, 'Aco_escovado', (-2.30, -.55, .38), (-2.40, -.55, .375), .035, 12)


def interior(p):
    caixa(p, 'Interior_cinza', (1.00, 0, 1.12), (.20, 1.64, .28), bevel=.05)
    caixa(p, 'Preto_fosco', (.90, .42, 1.25), (.10, .34, .08), bevel=.03)
    caixa(p, 'Interior_cinza', (.45, 0, .70), (.90, .22, .28), bevel=.04)
    bx, by, bz = BANCO_MOTORISTA
    for y in (by, -by):
        caixa(p, 'Preto_fosco', (bx, y, bz - .07), (.48, .48, .10), bevel=.04)
        caixa(p, 'Preto_fosco', (bx - .26, y, bz + .26), (.10, .48, .58), bevel=.04, rot=Euler((0, math.radians(-15), 0)))
        caixa(p, 'Preto_fosco', (bx - .31, y, bz + .61), (.08, .26, .14), bevel=.03)
    caixa(p, 'Preto_fosco', (-.50, 0, bz - .07), (.42, 1.50, .10), bevel=.04)
    caixa(p, 'Preto_fosco', (-.75, 0, bz + .24), (.10, 1.50, .52), bevel=.04, rot=Euler((0, math.radians(-12), 0)))
    centro = Vector((.72, by, 1.18))
    eixo = Vector((math.cos(math.radians(25)), 0, -math.sin(math.radians(25))))
    toro(p, 'Preto_fosco', centro, eixo, .19, .017, 28, 8)
    cilindro(p, 'Preto_fosco', centro - eixo * .02, centro + eixo * .36, .03, 10)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        d = Vector((0, math.cos(a), math.sin(a)))
        d = (d - eixo * d.dot(eixo)).normalized()
        varrer(p, 'Preto_fosco', [centro, centro + d * .18], [(-.01, -.008), (.01, -.008), (.01, .008), (-.01, .008)], lado=eixo)


# ----------------------------------------------------------------------------------------------
# Rodas: liga de 6 raios, pneu de uso misto (gomos que sobem no ombro)
# ----------------------------------------------------------------------------------------------
def pneu(p, y0, largura, seg=48, M=None):
    h = largura / 2
    perfil_p = [(.216, y0 + h - .01), (.27, y0 + h + .008), (.33, y0 + h + .014), (.362, y0 + h + .006), (.378, y0 + h - .014),
                (R_PNEU, y0 + h - .04), (R_PNEU, y0 + .014), (R_PNEU - .012, y0 + .008), (R_PNEU - .012, y0 - .008),
                (R_PNEU, y0 - .014), (R_PNEU, y0 - h + .04), (.378, y0 - h + .014), (.362, y0 - h - .006), (.33, y0 - h - .014),
                (.27, y0 - h - .008), (.216, y0 - h + .01)]
    def gomo(i, j, r):
        lado = 0 if perfil_p[i][1] > y0 else 1
        cheio = (j + 2 * lado) % 4 < 2
        if r >= R_PNEU - .0001:
            return r if cheio else r - .014
        if .37 < r < .38:
            return r + (.008 if cheio else 0)
        return r
    torno(p, 'Pneu', perfil_p, seg, gomo, M)


def roda_liga(p, M=None, raios=True):
    """Aro de liga (lado de fora em +Y), seis raios, disco de freio atras, cubo, porcas e calota."""
    perfil_r = [(.196, -.105), (.216, -.118), (.222, -.112), (.208, -.10), (.208, .10), (.222, .112), (.216, .118), (.196, .108), (.19, .07), (.19, -.09)]
    torno(p, 'Liga_roda', perfil_r + [perfil_r[0]], 36, None, M)
    T = (lambda q: M @ Vector(q)) if M is not None else (lambda q: Vector(q))
    if raios:
        for k in range(6):
            a = 2 * math.pi * k / 6
            d = Vector((math.cos(a), 0, math.sin(a)))
            lat = Vector((-math.sin(a), 0, math.cos(a)))
            pts = [T(Vector((0, .072, 0)) + d * .07), T(Vector((0, .095, 0)) + d * .20)]
            varrer(p, 'Liga_roda', pts, [(-.024, -.012), (.024, -.012), (.018, .012), (-.018, .012)],
                   lado=tuple(M.to_3x3() @ lat) if M is not None else tuple(lat))
        cilindro(p, 'Aco_escovado', T((0, -.03, 0)), T((0, -.01, 0)), .165, 28)
    cilindro(p, 'Liga_roda', T((0, .04, 0)), T((0, .09, 0)), .075, 20)
    for k in range(6):
        a = 2 * math.pi * k / 6
        q = Vector((.05 * math.cos(a), 0, .05 * math.sin(a)))
        cilindro(p, 'Cromado', T(q + Vector((0, .09, 0))), T(q + Vector((0, .105, 0))), .01, 6)
    cilindro(p, 'Cromado', T((0, .09, 0)), T((0, .108, 0)), .03, 14)


def rodas():
    p = Peca('Roda_caminhonete')
    pneu(p, 0, L_PNEU)
    roda_liga(p)
    malha = p.objeto(angulo=40)
    pivos = []
    for nome, x, y in (('Roda_dianteira_E', EIXO_F, Y_RODA), ('Roda_dianteira_D', EIXO_F, -Y_RODA),
                       ('Roda_traseira_E', EIXO_T, Y_RODA), ('Roda_traseira_D', EIXO_T, -Y_RODA)):
        piv = bpy.data.objects.new(nome + '_PIVO', None)
        piv.empty_display_type = 'SPHERE'
        piv.empty_display_size = .1
        piv.location = (x, y, R_PNEU)
        bpy.context.scene.collection.objects.link(piv)
        o = bpy.data.objects.new(nome, malha.data)
        bpy.context.scene.collection.objects.link(o)
        o.parent = piv
        if y < 0:
            o.rotation_euler = (0, 0, math.pi)
        pivos.append(piv)
    bpy.data.objects.remove(malha)
    return pivos


# ----------------------------------------------------------------------------------------------
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configurar(MATERIAIS, ATLAS, UV)
    bm_corpo = carroceria()
    bm_cab = cabine()
    bvh = bvh_de(bm_corpo, bm_cab)
    bvh_cab = bvh_de(bm_cab)
    corpo = Peca('Caminhonete_carroceria', adesivos=Peca('Caminhonete_adesivos', uv=True))
    lataria(corpo, bvh, bvh_cab)
    frente(corpo, bvh)
    snorkel(corpo)
    estribos(corpo)
    paralamas(corpo)
    teto(corpo)
    cacamba(corpo)
    traseira(corpo, bvh)
    chassi(corpo)
    interior(corpo)
    lat = objeto_de(bm_corpo, 'Lataria', ['Pintura_branca', 'Faixa_amarela', 'Preto_fosco'])
    cab = objeto_de(bm_cab, 'Cabine', ['Pintura_branca'] + ['Interior_cinza'] * 3)
    bm_corpo.free()
    bm_cab.free()
    x0, x1, yi, piso = CACAMBA
    cortes = [cortador_caixa('Corte_cacamba', (x1, -yi, piso), (x0, yi, 2.0), 'Plastico_cacamba'),
              cortador_caixa('Corte_cabine', (-.66, -.80, .56), (1.06, .80, 2.0), 'Interior_cinza'),
              cortador_caixa('Corte_banco_tras', (-.83, -.80, .87), (-.66, .80, 2.0), 'Interior_cinza')]
    for xe in (EIXO_F, EIXO_T):
        for lado in (1, -1):
            cortes.append(cortador_cilindro(f'Corte_roda_{xe}_{lado}', (xe, lado * .95, R_PNEU), ARCO_R, .80, 'Preto_fosco'))
    recortar(lat, cortes, angulo=40)
    recortar(cab, [prisma('Corte_janela_FE', JANELA_F, 'XZ', .5, 1.3, 'Borracha'),
                   prisma('Corte_janela_FD', JANELA_F, 'XZ', -1.3, -.5, 'Borracha'),
                   prisma('Corte_janela_TE', JANELA_T, 'XZ', .5, 1.3, 'Borracha'),
                   prisma('Corte_janela_TD', JANELA_T, 'XZ', -1.3, -.5, 'Borracha'),
                   prisma('Corte_parabrisa', PARABRISA, 'YZ', .2, 1.6, 'Borracha'),
                   prisma('Corte_vigia', VIGIA, 'YZ', -1.3, -.6, 'Borracha')], espessura=.03, material_offset=1, angulo=45)
    oc = corpo.objeto()
    corpo.adesivos.objeto()
    juntar(oc, [lat, cab])
    oc.name = oc.data.name = 'Caminhonete_carroceria'
    um_slot_por_material(oc)
    normais_por_area(oc)
    oc['olhal_fita'] = [OLHAL[0], OLHAL[2], -OLHAL[1]]
    oc['banco_motorista'] = [BANCO_MOTORISTA[0], BANCO_MOTORISTA[2] - .47, -BANCO_MOTORISTA[1]]
    rodas()
    tris = sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('CAMINHONETE_TRIANGULOS', tris, 'MATERIAIS', len(bpy.data.materials), flush=True)
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    if '--sem-glb' in ARGS:
        return
    exportar_glb(GLB)
    print('CAMINHONETE_GLB', GLB, GLB.stat().st_size, flush=True)


main()
