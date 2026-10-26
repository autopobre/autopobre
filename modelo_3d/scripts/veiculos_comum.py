# -*- coding: utf-8 -*-
"""Ferramentas comuns para modelar os veiculos do jogo por script no Blender (o guincho, a caminhonete do resgate e os
proximos): materiais por nome, a Peca (uma bmesh com os materiais dela; os adesivos vao para uma Peca com UV), caixas
chanfradas, cilindros, toros, superficies de revolucao (rodas), varreduras de secao, contornos arredondados,
cortadores de Boolean, e o que se cola numa lataria por raio (blocos, adesivos, frisos, vidros).

Cada veiculo chama configurar(materiais, atlas, uv) antes de tudo: a tabela dos seus materiais, o PNG dos adesivos e
as regioes dele em UV (origem embaixo a esquerda). Convencoes: metros, X para a frente, Y para a esquerda, Z para cima.
"""
import bpy
import bmesh
import math

import numpy as np
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

MATERIAIS = {}
ATLAS = None
UV = {}


def configurar(materiais, atlas=None, uv=None):
    global ATLAS
    MATERIAIS.clear()
    MATERIAIS.update(materiais)
    ATLAS = atlas
    UV.clear()
    UV.update(uv or {})


def _pchip(x, y, xi):
    x = np.asarray(x, float); y = np.asarray(y, float)
    h = np.diff(x); d = np.diff(y) / h
    m = np.zeros_like(y)
    for i in range(1, len(x) - 1):
        if d[i - 1] * d[i] > 0:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]; m[-1] = d[-1]
    xi = float(np.clip(xi, x[0], x[-1]))
    i = int(np.clip(np.searchsorted(x, xi, side='right') - 1, 0, len(x) - 2))
    t = (xi - x[i]) / h[i]
    return float((2 * t**3 - 3 * t**2 + 1) * y[i] + (t**3 - 2 * t**2 + t) * h[i] * m[i]
                 + (-2 * t**3 + 3 * t**2) * y[i + 1] + (t**3 - t**2) * h[i] * m[i + 1])


def lin(c):
    return c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4


def rgb(h):
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(nome):
    m = bpy.data.materials.get(nome)
    if m:
        return m
    cor, metal, rug, *resto = MATERIAIS[nome]
    emissao, forca, alfa = resto + [None, 0, 1][len(resto):]
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    # (o glTF sai com doubleSided onde nao ha corte de faces de tras: vidro, pneus e rodas, que sao superficies abertas)
    m.use_backface_culling = nome not in ('Vidro', 'Pneu', 'Aco_roda')
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb(cor), 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rug
    if emissao:
        b.inputs['Emission Color'].default_value = (*rgb(emissao), 1)
        b.inputs['Emission Strength'].default_value = forca
    if nome == 'Adesivos':
        img = bpy.data.images.load(str(ATLAS))
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Linear'
        m.node_tree.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        m.node_tree.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
        alfa = .5
    if alfa < 1:
        if nome != 'Adesivos':
            b.inputs['Alpha'].default_value = alfa
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'
    return m


# ----------------------------------------------------------------------------------------------
# Malhas: uma Peca junta geometria (bmesh) com os materiais dela
# ----------------------------------------------------------------------------------------------
class Peca:
    """adesivos: a Peca (com UV) que recebe o que leva o material Adesivos; as outras saem sem UV (o GLB fica menor)."""
    def __init__(self, nome, uv=False, adesivos=None):
        self.nome = nome
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap') if uv else None
        self.adesivos = adesivos
        self.mats = []

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def colar(self, t, mat, liso=True):
        """Copia a bmesh temporaria t (ja posicionada) com o material mat e libera t."""
        i = self.mi(mat)
        mapa = {v: self.bm.verts.new(v.co) for v in t.verts}
        for f in t.faces:
            try:
                nf = self.bm.faces.new([mapa[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = i
            nf.smooth = liso
        t.free()

    def quad(self, pts, mat, uvs=None, fora=None):
        """Um poligono (pontos em ordem, uvs na mesma ordem); fora: vetor para onde a face deve apontar."""
        if mat == 'Adesivos' and self.adesivos:
            return self.adesivos.quad(pts, mat, uvs, fora)
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(mat)
        f.smooth = False
        f.normal_update()
        if fora is not None and f.normal.dot(Vector(fora)) < 0:
            f.normal_flip()
        if uvs:
            uv_de = dict(zip(vs, uvs))
            for lp in f.loops:
                lp[self.uv].uv = uv_de[lp.vert]
        return f

    def adesivo(self, regiao, centro, direita, cima, largura, altura, fracao=1.0):
        """Adesivo plano do atlas: `direita` e a direita de quem olha de frente para ele, `cima` o alto (a face
        aponta para direita x cima). fracao: quanto da largura da regiao usar (o zebrado)."""
        u0, v0, u1, v1 = UV[regiao]
        u1 = u0 + (u1 - u0) * fracao
        c, d, h = Vector(centro), Vector(direita).normalized() * largura / 2, Vector(cima).normalized() * altura / 2
        self.quad([c - d - h, c + d - h, c + d + h, c - d + h], 'Adesivos', [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], fora=d.cross(h))

    def objeto(self, angulo=50, pai=None):
        afiar(self.bm, angulo)
        me = bpy.data.meshes.new(self.nome)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(material(m))
        o = bpy.data.objects.new(self.nome, me)
        bpy.context.scene.collection.objects.link(o)
        if pai:
            o.parent = pai
        return o


def afiar(bm, angulo):
    """Arestas com mais de `angulo` graus entre as faces ficam vivas; o resto, liso."""
    lim = math.radians(angulo)
    bm.normal_update()
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0) < lim and all(f.smooth for f in e.link_faces)
        else:
            e.smooth = False


def tmp_caixa(dims, bevel=0.0, seg=2):
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=Vector(dims), verts=t.verts)
    if bevel > 0:
        bmesh.ops.bevel(t, geom=list(t.edges), offset=min(bevel, min(dims) * .45), offset_type='OFFSET', segments=seg,
                        profile=.5, affect='EDGES', clamp_overlap=True)
    return t


def caixa(p, mat, centro, dims, bevel=0.0, seg=2, rot=None, liso=True):
    t = tmp_caixa(dims, bevel, seg)
    M = Matrix.Translation(Vector(centro))
    if rot is not None:
        M = M @ (rot.to_matrix().to_4x4() if hasattr(rot, 'to_matrix') else rot.to_4x4())
    t.transform(M)
    p.colar(t, mat, liso)


def caixa_entre(p, mat, a, b, bevel=0.0, seg=2):
    a, b = Vector(a), Vector(b)
    caixa(p, mat, (a + b) / 2, [abs(b[i] - a[i]) for i in range(3)], bevel, seg)


def cilindro(p, mat, p0, p1, raio, seg=16, raio1=None, tampa=True, liso=True):
    p0, p1 = Vector(p0), Vector(p1)
    eixo = p1 - p0
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=tampa, cap_tris=False, segments=seg, radius1=raio,
                          radius2=raio if raio1 is None else raio1, depth=eixo.length)
    rot = Vector((0, 0, 1)).rotation_difference(eixo.normalized()).to_matrix().to_4x4()
    t.transform(Matrix.Translation((p0 + p1) / 2) @ rot)
    p.colar(t, mat, liso)


def toro(p, mat, centro, eixo, R, r, seg=24, segr=8, arco=2 * math.pi):
    """Um toro (ou um arco dele) em volta de `eixo`."""
    t = bmesh.new()
    n = seg + (0 if arco >= 2 * math.pi - 1e-6 else 1)
    aneis = []
    for i in range(n):
        a = arco * i / seg
        c = Vector((R * math.cos(a), R * math.sin(a), 0))
        d = Vector((math.cos(a), math.sin(a), 0))
        aneis.append([t.verts.new(c + d * r * math.cos(b) + Vector((0, 0, r * math.sin(b))))
                      for b in [2 * math.pi * k / segr for k in range(segr)]])
    for i in range(n if n == seg else n - 1):
        A, B = aneis[i], aneis[(i + 1) % n]
        for k in range(segr):
            t.faces.new([A[k], B[k], B[(k + 1) % segr], A[(k + 1) % segr]])
    rot = Vector((0, 0, 1)).rotation_difference(Vector(eixo).normalized()).to_matrix().to_4x4()
    t.transform(Matrix.Translation(Vector(centro)) @ rot)
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    p.colar(t, mat)


def torno(p, mat, perfil, seg=48, raio_fn=None, M=None, liso=True):
    """Superficie de revolucao em volta do eixo Y local: perfil [(r, y)]; raio_fn(i_perfil, j_angulo, r) muda o raio
    (os gomos do pneu). r=0 fecha num ponto."""
    t = bmesh.new()
    aneis = []
    for i, (r, y) in enumerate(perfil):
        if r <= 0:
            aneis.append([t.verts.new((0, y, 0))] * seg)
            continue
        anel = []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            rr = raio_fn(i, j, r) if raio_fn else r
            anel.append(t.verts.new((rr * math.cos(a), y, rr * math.sin(a))))
        aneis.append(anel)
    for i in range(len(aneis) - 1):
        A, B = aneis[i], aneis[i + 1]
        for j in range(seg):
            vs = [A[j], A[(j + 1) % seg], B[(j + 1) % seg], B[j]]
            uniq = []
            for v in vs:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) >= 3:
                try:
                    t.faces.new(uniq)
                except ValueError:
                    pass
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    if M is not None:
        t.transform(M)
    p.colar(t, mat, liso)


def varrer(p, mat, caminho, secao, lado=(0, 1, 0), tampas=True, liso=False):
    """Varre a secao fechada [(s, u)] ao longo do caminho: s no eixo `lado` (fixo ou funcao do indice), u no eixo
    perpendicular ao caminho (para cima)."""
    t = bmesh.new()
    caminho = [Vector(c) for c in caminho]
    aneis = []
    for i, c in enumerate(caminho):
        a = caminho[max(0, i - 1)]
        b = caminho[min(len(caminho) - 1, i + 1)]
        T = (b - a).normalized()
        L = Vector(lado(i) if callable(lado) else lado).normalized()
        U = L.cross(T).normalized()
        if U.z < -1e-6:
            U = -U
        # nas dobras a secao cresce para manter a espessura (meia-esquadria)
        if 0 < i < len(caminho) - 1:
            T0 = (c - a).normalized(); T1 = (b - c).normalized()
            k = 1 / max(.5, math.cos(T0.angle(T1) / 2)) if T0.length and T1.length else 1
        else:
            k = 1
        aneis.append([t.verts.new(c + L * s + U * u * k) for s, u in secao])
    n = len(secao)
    for i in range(len(aneis) - 1):
        A, B = aneis[i], aneis[i + 1]
        for k in range(n):
            t.faces.new([A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]])
    if tampas:
        t.faces.new(aneis[0])
        t.faces.new(aneis[-1][::-1])
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    p.colar(t, mat, liso)


def ret_arredondado(a0, a1, b0, b1, r, n=4):
    """Contorno de um retangulo de cantos arredondados no plano (a, b), anti-horario."""
    pts = []
    for (ca, cb, ang) in [(a1 - r, b0 + r, -90), (a1 - r, b1 - r, 0), (a0 + r, b1 - r, 90), (a0 + r, b0 + r, 180)]:
        for k in range(n + 1):
            t = math.radians(ang + 90 * k / n)
            pts.append((ca + r * math.cos(t), cb + r * math.sin(t)))
    return pts


def poligono_arredondado(pts, r, n=4):
    """Arredonda os cantos de um poligono convexo (lista de (a, b) anti-horaria)."""
    out = []
    N = len(pts)
    for i in range(N):
        P = Vector(pts[i]); A = Vector(pts[i - 1]); B = Vector(pts[(i + 1) % N])
        da = (A - P).normalized(); db = (B - P).normalized()
        ang = da.angle(db)
        d = r / math.tan(ang / 2)
        p0 = P + da * d; p1 = P + db * d
        for k in range(n + 1):
            s = k / n
            # bezier quadratica pelo canto (bom o bastante para raios pequenos)
            q = p0 * (1 - s) ** 2 + P * 2 * s * (1 - s) + p1 * s * s
            out.append((q.x, q.y))
    return out


def prisma(nome, contorno, plano, a0, a1, mat):
    """Objeto cortador: o contorno [(u, v)] extrudado de a0 a a1 no eixo que falta. plano: 'XZ', 'YZ'."""
    bm = bmesh.new()
    def P(u, v, a):
        return (u, a, v) if plano == 'XZ' else (a, u, v)
    base = [bm.verts.new(P(u, v, a0)) for u, v in contorno]
    topo = [bm.verts.new(P(u, v, a1)) for u, v in contorno]
    bm.faces.new(base)
    bm.faces.new(topo[::-1])
    n = len(contorno)
    for i in range(n):
        bm.faces.new([base[i], base[(i + 1) % n], topo[(i + 1) % n], topo[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(mat))
    o = bpy.data.objects.new(nome, me)
    return o


def acerta(bvh, origem, direcao):
    d = Vector(direcao).normalized()
    loc, nor, _, _ = bvh.ray_cast(Vector(origem), d)
    if loc is None:
        raise ValueError(f'o raio nao acertou a cabine: {tuple(origem)} -> {tuple(direcao)}')
    if nor.dot(d) > 0:
        nor = -nor
    return loc, nor


def vidro_projetado(p, bvh, contorno, plano, lado, recuo=.014, aneis=3, longe=4):
    """Um vidro com o contorno da janela, projetado na casca e recuado para dentro do furo. plano 'XZ': janela do
    lado (lado +1 esquerdo, -1 direito); 'YZ': da frente (lado +1) ou de tras (-1), o raio vindo de longe * lado em X."""
    c = Vector((sum(u for u, v in contorno) / len(contorno), sum(v for u, v in contorno) / len(contorno)))
    def proj(u, v):
        if plano == 'XZ':
            loc, nor = acerta(bvh, (u, 3 * lado, v), (0, -lado, 0))
        else:
            loc, nor = acerta(bvh, (longe * lado, u, v), (-lado, 0, 0))
        return loc - nor * recuo, nor
    grade = []
    for k in range(aneis, 0, -1):
        s = k / aneis
        grade.append([proj(c.x + (u - c.x) * s, c.y + (v - c.y) * s) for u, v in contorno])
    centro, ncentro = proj(c.x, c.y)
    i = p.mi('Vidro')
    bm = p.bm
    vs = [[bm.verts.new(q) for q, _ in anel] for anel in grade]
    vc = bm.verts.new(centro)
    n = len(contorno)
    faces = []
    for k in range(len(vs) - 1):
        for j in range(n):
            faces.append(bm.faces.new([vs[k][j], vs[k][(j + 1) % n], vs[k + 1][(j + 1) % n], vs[k + 1][j]]))
    for j in range(n):
        faces.append(bm.faces.new([vs[-1][j], vs[-1][(j + 1) % n], vc]))
    for f in faces:
        f.material_index = i
        f.smooth = True
        f.normal_update()
        if f.normal.dot(ncentro) < 0:
            f.normal_flip()


def bloco_na_lataria(p, bvh, mat, origem, direcao, largura, altura, prof, bevel=.008, embute=.01, giro=0.0, seg=2):
    """Uma caixa assentada na lataria onde o raio acerta: prof ao longo da normal, largura na horizontal da superficie,
    altura no resto. Devolve (centro na superficie, normal, horizontal, vertical)."""
    loc, N = acerta(bvh, origem, direcao)
    H = Vector((0, 0, 1)).cross(N).normalized()
    V = N.cross(H).normalized()
    if giro:
        q = Matrix.Rotation(giro, 3, N)
        H, V = q @ H, q @ V
    M = Matrix((H, V, N)).transposed()     # colunas: largura, altura, profundidade
    t = tmp_caixa((largura, altura, prof), bevel, seg)
    t.transform(Matrix.Translation(loc + N * (prof / 2 - embute)) @ M.to_4x4())
    p.colar(t, mat)
    return loc, N, H, V


def adesivo_projetado(p, bvh, regiao, centro, largura, altura, lado, nu=10, nv=4, afasta=.003, u_inverte=False):
    """Adesivo do atlas colado no lado da cabine (lado +1 esquerdo, -1 direito), lido da esquerda para a direita de
    quem olha. centro: (x, z)."""
    p = p.adesivos or p
    u0, v0, u1, v1 = UV[regiao]
    bm = p.bm
    i = p.mi('Adesivos')
    grade = []
    for b in range(nv + 1):
        linha = []
        for a in range(nu + 1):
            s, t = a / nu, b / nv
            dx = (s - .5) * largura * (-1 if lado > 0 else 1) * (-1 if u_inverte else 1)
            x, z = centro[0] + dx, centro[1] + (t - .5) * altura
            loc, nor = acerta(bvh, (x, 3 * lado, z), (0, -lado, 0))
            linha.append((bm.verts.new(loc + nor * afasta), (u0 + (u1 - u0) * s, v0 + (v1 - v0) * t), nor))
        grade.append(linha)
    for b in range(nv):
        for a in range(nu):
            q = [grade[b][a], grade[b][a + 1], grade[b + 1][a + 1], grade[b + 1][a]]
            f = bm.faces.new([c[0] for c in q])
            f.material_index = i
            f.smooth = True
            f.normal_update()
            if f.normal.dot(q[0][2]) < 0:
                f.normal_flip()
            for lp in f.loops:
                lp[p.uv].uv = next(c[1] for c in q if c[0] == lp.vert)


def raio_de(plano, lado, longe=4):
    """O raio que projeta um ponto (u, v) do plano na lataria: 'XZ' do lado (lado +1 esquerdo, -1 direito), 'XY' de cima,
    'YZ' da frente (lado +1) ou de tras (-1), vindo de longe * lado em X."""
    if plano == 'XZ':
        return lambda u, v: ((u, 3 * lado, v), (0, -lado, 0))
    if plano == 'XY':
        return lambda u, v: ((u, v, 4), (0, 0, -1))
    return lambda u, v: ((longe * lado, u, v), (-lado, 0, 0))


def friso_projetado(p, bvh, pontos, lado, mat='Preto_fosco', largura=.007, afasta=.0015, fechado=True, plano='XZ'):
    """Uma linha fina (vao de porta, de capo, de tampa) desenhada na lataria: pontos [(u, v)] no plano (raio_de)."""
    bm = p.bm
    i = p.mi(mat)
    pts = list(pontos) + ([pontos[0]] if fechado else [])
    # mais pontos nos trechos longos, para seguir a curva da lataria
    densos = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.dist(a, b) / .05))
        densos += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    densos.append(pts[-1])
    raio = raio_de(plano, lado)
    hits = [acerta(bvh, *raio(u, v)) for u, v in densos]
    pares = []
    for k, (loc, nor) in enumerate(hits):
        a = hits[max(0, k - 1)][0]
        b = hits[min(len(hits) - 1, k + 1)][0]
        S = nor.cross((b - a).normalized()).normalized()
        base = loc + nor * afasta
        pares.append((bm.verts.new(base + S * largura / 2), bm.verts.new(base - S * largura / 2), nor))
    for k in range(len(pares) - 1):
        A, B = pares[k], pares[k + 1]
        f = bm.faces.new([A[0], A[1], B[1], B[0]])
        f.material_index = i
        f.smooth = True
        f.normal_update()
        if f.normal.dot(A[2]) < 0:
            f.normal_flip()


def arredondar_caminho(pontos, raio, n=5):
    """Um caminho aberto em 3D com os cantos trocados por curvas (tubos dobrados)."""
    pts = [Vector(q) for q in pontos]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        P, A, B = pts[i], pts[i - 1], pts[i + 1]
        da, db = (A - P), (B - P)
        r = min(raio, da.length * .45, db.length * .45)
        p0, p1 = P + da.normalized() * r, P + db.normalized() * r
        for k in range(n + 1):
            s = k / n
            out.append(p0 * (1 - s) ** 2 + P * 2 * s * (1 - s) + p1 * s * s)
    out.append(pts[-1])
    return out


def tubo(p, mat, pontos, raio, seg=12, tampas=True, curva=None):
    """Um tubo redondo pelo caminho (referencial transportado ao longo dele, sem torcer); curva: raio das dobras."""
    pts = arredondar_caminho(pontos, curva) if curva else [Vector(q) for q in pontos]
    n = len(pts)
    T = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    a = Vector((0, 0, 1)) if abs(T[0].z) < .9 else Vector((1, 0, 0))
    N = [(a - T[0] * a.dot(T[0])).normalized()]
    for i in range(1, n):
        N.append((T[i - 1].rotation_difference(T[i]) @ N[-1]).normalized())
    t = bmesh.new()
    aneis = []
    for i in range(n):
        B = T[i].cross(N[i])
        aneis.append([t.verts.new(pts[i] + (N[i] * math.cos(2 * math.pi * k / seg) + B * math.sin(2 * math.pi * k / seg)) * raio) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            t.faces.new([aneis[i][k], aneis[i][(k + 1) % seg], aneis[i + 1][(k + 1) % seg], aneis[i + 1][k]])
    if tampas:
        t.faces.new(aneis[0])
        t.faces.new(aneis[-1][::-1])
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    p.colar(t, mat)


def cilindro_m(p, mat, p0, p1, raio, seg, M):
    if M is not None:
        p0, p1 = M @ Vector(p0), M @ Vector(p1)
    cilindro(p, mat, p0, p1, raio, seg)


def um_slot_por_material(o):
    """A uniao (e o Boolean) repetem materiais em varios slots: cada material fica num so (um primitivo no glTF)."""
    me = o.data
    unicos = []
    for m in me.materials:
        if m not in unicos:
            unicos.append(m)
    mapa = [unicos.index(m) for m in me.materials]
    idx = [0] * len(me.polygons)
    me.polygons.foreach_get('material_index', idx)
    idx = [mapa[i] for i in idx]
    me.materials.clear()
    for m in unicos:
        me.materials.append(m)
    me.polygons.foreach_set('material_index', idx)
    me.update()


def normais_por_area(o):
    """Faces grandes mandam na normal dos cantos chanfrados (Weighted Normal, aplicado na exportacao)."""
    wn = o.modifiers.new('Normais', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 50
    wn.keep_sharp = True


def cortador_cilindro(nome, centro, raio, comprimento, mat, eixo='Y', seg=48):
    """Um cilindro cortador (caixa de roda: eixo Y)."""
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=True, segments=seg, radius1=raio, radius2=raio, depth=comprimento)
    rot = {'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Z': Matrix()}[eixo]
    t.transform(Matrix.Translation(Vector(centro)) @ rot)
    me = bpy.data.meshes.new(nome)
    t.to_mesh(me)
    t.free()
    me.materials.append(material(mat))
    return bpy.data.objects.new(nome, me)


def cortador_caixa(nome, a, b, mat):
    """Uma caixa cortadora de a a b (cantos opostos)."""
    a, b = Vector(a), Vector(b)
    t = tmp_caixa([abs(b[i] - a[i]) for i in range(3)])
    t.transform(Matrix.Translation((a + b) / 2))
    me = bpy.data.meshes.new(nome)
    t.to_mesh(me)
    t.free()
    me.materials.append(material(mat))
    return bpy.data.objects.new(nome, me)


def recortar(obj, cortadores, espessura=None, material_offset=0, angulo=45):
    """Recorta obj com os cortadores (Boolean exato; as paredes dos furos ficam com o material do cortador). Com
    espessura, antes da-lhe essa espessura para dentro (Solidify; as faces de dentro ganham material_offset).
    Aplica tudo numa malha nova e apaga os cortadores."""
    cort = bpy.data.collections.new('Cortadores')
    bpy.context.scene.collection.children.link(cort)
    for c in cortadores:
        cort.objects.link(c)
    if espessura:
        s = obj.modifiers.new('Espessura', 'SOLIDIFY')
        s.thickness = espessura
        s.offset = -1
        s.material_offset = material_offset
        s.material_offset_rim = material_offset
        s.use_even_offset = True
    b = obj.modifiers.new('Recortes', 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.operand_type = 'COLLECTION'
    b.collection = cort
    b.solver = 'EXACT'
    try:
        b.material_mode = 'TRANSFER'
    except AttributeError:
        pass
    dg = bpy.context.evaluated_depsgraph_get()
    novo = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    obj.modifiers.clear()
    velho, nome = obj.data, obj.data.name
    obj.data = novo
    bpy.data.meshes.remove(velho)
    for c in cortadores:
        m = c.data
        bpy.data.objects.remove(c)
        bpy.data.meshes.remove(m)
    bpy.data.collections.remove(cort)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for f in bm.faces:
        f.smooth = True
    afiar(bm, angulo)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.name = nome


def juntar(alvo, outros):
    """Junta os outros objetos ao alvo (um objeto so no glTF, um primitivo por material)."""
    with bpy.context.temp_override(active_object=alvo, object=alvo, selected_objects=[alvo, *outros], selected_editable_objects=[alvo, *outros]):
        bpy.ops.object.join()


def exportar_glb(glb):
    """Tudo que esta na cena para o GLB do jogo (WebP nas texturas, extras dos objetos)."""
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_apply=True, export_extras=True,
                              export_animations=False, export_image_format='WEBP', export_yup=True, export_texcoords=True,
                              export_normals=True, export_cameras=False, export_lights=False)
