// Editor de traçado (editor-tracado.html, só no /dev/ e no servidor local): pinta ou corrige o eixo e o pit lane de um
// circuito sobre o chão do jogo e sobre camadas de referência locais. Uma pasta de referências (camadas.json + imagens,
// em pista_interlagos/fontes/<circuito>/referencias/, fora do repositório e do site) traz imagens vistas de cima
// (georreferenciadas por canto e metros por pixel) ou em perspectiva (homografia do chão para a imagem, como o render
// de um projeto), e linhas de apoio. Tudo é desenhado em metros: UTM do circuito quando o arquivo da pista tem origem,
// senão o sistema local do jogo (Interlagos). O arquivo salvo (tracado_<id>.json) é a entrada dos geradores em
// scripts/circuitos/.
import {CIRCUITS} from './circuits.js';

const DADOS = '../dados/';
const FORMATO_PACOTE = 'autopobre-referencias-v1', FORMATO_TRACADO = 'autopobre-tracado-v1';
const CHAVE = 'autopobre-editor-tracado-v1';
const ENCAIXE = 22;            // px de tela: perto o bastante da linha para emendar ou refazer um trecho
const $ = id => document.getElementById(id);
const tela = $('tela'), ctx = tela.getContext('2d');

// ---------- matrizes 3x3 ----------
const mul3 = (m, v) => [0, 1, 2].map(r => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
          [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
          [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}

// ---------- circuito, camadas e linhas de apoio ----------
let circ = null;               // {id, nome, sistema, epsg, oficial_m, origemJogo, escala, jogo}
let camadas = [];              // fundos: planta (vista de cima) ou perspectiva
let linhasRef = [];            // linhas de apoio: o traçado do jogo e as do pacote
let urlsPacote = [];
const soPacote = {};           // circuitos que só existem numa pasta de referências (ainda fora do jogo)
let S = vazio();
let camada = 'eixo', ferramenta = 'pincel';
const hist = [], refaz = [];
function vazio() { return { eixo: [], fechado: false, pit: [], chegada: null, larguras: [] }; }

const carregarImagem = url => new Promise((ok, falha) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => falha(new Error('imagem não abriu: ' + url));
  i.src = url;
});

// Cada carga (circuito ou pasta) tem um número: a que terminar depois de outra ter começado não mexe em nada.
let carga = 0, carregando = false;
async function abrirCircuito(id) {
  const minha = ++carga;
  carregando = true;
  const novo = { camadas: [], linhas: [] };
  let nc;
  if (soPacote[id]) {
    const p = soPacote[id];
    nc = { id, nome: p.nome || id, sistema: p.sistema, epsg: p.epsg ?? null, oficial_m: p.oficial_m ?? null, jogo: null };
  } else {
    const c = CIRCUITS[id], arquivo = c.data ?? (id === 'interlagos' ? 'pista.json' : null);
    nc = { id, nome: c.name, sistema: 'local', epsg: null, oficial_m: c.length ?? null, jogo: null };
    if (arquivo) {
      const d = await (await fetch(DADOS + arquivo)).json();
      if (minha !== carga) return false;
      const m = d.meta || {}, col = d.columns;
      const origem = Array.isArray(m.origin_utm) ? m.origin_utm : null, k = m.horizontal_scale_to_nominal || 1;
      if (origem && m.epsg) Object.assign(nc, { sistema: 'utm', epsg: m.epsg, origemJogo: origem.slice(0, 2), escala: k });
      const mundo = origem ? (x, y) => [origem[0] + x / k, origem[1] + y / k] : (x, y) => [x, y];
      const ix = col.indexOf('x_east_m'), iy = col.indexOf('y_north_m'), iw = col.indexOf('width_m');
      const eixo = d.samples.map(r => mundo(r[ix], r[iy]));
      const larguras = iw >= 0 ? d.samples.map(r => r[iw] / k) : null;
      let pit = [];
      if (d.pit?.columns && d.pit.samples) {
        const pc = d.pit.columns, px = pc.indexOf('x'), py = pc.indexOf('y'), lx = pc.indexOf('lx'), ly = pc.indexOf('ly');
        const lo = pc.indexOf('lane_lo') >= 0 ? pc.indexOf('lane_lo') : pc.indexOf('lo'), hi = pc.indexOf('lane_hi') >= 0 ? pc.indexOf('lane_hi') : pc.indexOf('hi');
        pit = d.pit.samples.map(r => {
          const meio = lo >= 0 && hi >= 0 && lx >= 0 ? (r[lo] + r[hi]) / 2 : 0;
          return mundo(r[px] + meio * (r[lx] || 0), r[py] + meio * (r[ly] || 0));
        });
      }
      nc.jogo = { eixo, larguras, pit };
      novo.linhas.push({ nome: 'Traçado atual do jogo', pontos: eixo, larguras, fechada: true, cor: '#ffd166', ver: true, jogo: 'eixo' });
      if (pit.length > 1) novo.linhas.push({ nome: 'Pit lane atual do jogo', pontos: pit, fechada: false, cor: '#ffb36b', ver: true, jogo: 'pit' });
      if (c.ground && d.terrain) {
        const t = d.terrain, a = mundo(t.x0, t.y0 + (t.ny - 1) * t.step), b = mundo(t.x0 + (t.nx - 1) * t.step, t.y0);
        try {
          const img = await carregarImagem(c.ground);
          novo.camadas.push({ nome: 'Chão do jogo (Sentinel-2)', tipo: 'planta', img, x0: a[0], y1: a[1], largM: b[0] - a[0], altM: a[1] - b[1], ver: true, opac: 1 });
        } catch (e) { aviso('O chão do jogo não abriu.', true); }
        if (minha !== carga) return false;
      }
    }
  }
  salvarLocal();
  limparPacote();
  hist.length = refaz.length = 0;
  cursorMundo = destaque = larguraSel = null;
  $('sCoord').textContent = '—';
  $('pastaInfo').textContent = 'Sem pasta de referências: só o chão do jogo.';
  circ = nc; camadas = novo.camadas; linhasRef = novo.linhas;
  S = lerLocal(id) || vazio();
  aplicarVisuais(id);
  montarVistas();
  montarListas();
  atualizarPainel();
  pedirDesenho();
  carregando = false;
  salvarPrefs();
  return true;
}

function limparPacote() {
  for (const u of urlsPacote) URL.revokeObjectURL(u);
  urlsPacote = [];
  camadas = camadas.filter(c => !c.pacote);
  linhasRef = linhasRef.filter(l => !l.pacote);
}

async function abrirPacote(arquivos) {
  const cfgArq = arquivos.find(f => f.name === 'camadas.json');
  if (!cfgArq) return aviso('Essa pasta não tem camadas.json.', true);
  let cfg;
  try { cfg = JSON.parse(await cfgArq.text()); } catch (e) { return aviso('camadas.json não é um JSON válido.', true); }
  if (cfg.formato !== FORMATO_PACOTE || !cfg.circuito) return aviso('camadas.json não é uma pasta de referências deste editor.', true);
  if (!Object.hasOwn(CIRCUITS, cfg.circuito)) {
    soPacote[cfg.circuito] = cfg;
    montarSeletor();
  }
  if ((!circ || circ.id !== cfg.circuito) && !await abrirCircuito(cfg.circuito)) return;
  if (circ.jogo && (cfg.sistema !== circ.sistema || (cfg.sistema === 'utm' && cfg.epsg !== circ.epsg))) {
    return aviso(`As referências estão em ${cfg.sistema} ${cfg.epsg ?? ''} e o circuito em ${circ.sistema} ${circ.epsg ?? ''}.`, true);
  }
  const minha = ++carga;
  carregando = true;
  const porNome = new Map(arquivos.map(f => [f.name, f]));
  const novas = [], urls = [];
  for (const c of cfg.camadas || []) {
    const f = porNome.get(c.arquivo);
    if (!f) { aviso('Falta ' + c.arquivo + ' na pasta.', true); continue; }
    const url = URL.createObjectURL(f);
    urls.push(url);
    let img;
    try { img = await carregarImagem(url); } catch (e) { aviso(c.arquivo + ' não abriu.', true); continue; }
    if (c.tipo === 'planta') {
      novas.push({ nome: c.nome, tipo: 'planta', img, x0: c.x0, y1: c.y1, largM: img.naturalWidth * c.res, altM: img.naturalHeight * c.res,
                   ver: c.visivel ?? true, opac: c.opacidade ?? 1, pacote: true });
    } else if (c.tipo === 'perspectiva') {
      novas.push({ nome: c.nome, tipo: 'perspectiva', img, H: c.H, Hi: inv3(c.H), O: c.origem, w: img.naturalWidth, h: img.naturalHeight, pacote: true });
    }
  }
  if (minha !== carga || circ.id !== cfg.circuito) {
    for (const u of urls) URL.revokeObjectURL(u);
    return;
  }
  limparPacote();
  urlsPacote = urls;
  camadas.push(...novas);
  const ok = novas.length;
  for (const l of cfg.linhas || []) {
    if (Array.isArray(l.pontos) && l.pontos.length > 1) {
      linhasRef.push({ nome: l.nome, pontos: l.pontos, fechada: !!l.fechada, cor: l.cor || '#ff4fd8', ver: l.visivel ?? true,
                       editavel: l.editavel ?? true, pacote: true });
    }
  }
  if (cfg.oficial_m) circ.oficial_m = cfg.oficial_m;
  carregando = false;
  $('pastaInfo').textContent = `${cfg.nome || cfg.circuito}: ${ok} imagem(ns), ${(cfg.linhas || []).length} linha(s) de apoio.`;
  if (!S.eixo.length && !circ.jogo) aviso('Pinte o eixo pelo meio da pista, ou clique em “editar” numa linha de apoio para só corrigir.');
  const salvo = aplicarVisuais(circ.id);
  montarVistas();
  if (salvo.vista && vistas[salvo.vista]) vista = salvo.vista;
  montarListas();
  atualizarPainel();
  pedirDesenho();
}

// ---------- vistas ----------
let vistas = {}, vista = 'cima';
const V = () => vistas[vista];
function quadroCima() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const junta = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  for (const c of camadas) if (c.tipo === 'planta') junta(c.x0, c.y1 - c.altM, c.x0 + c.largM, c.y1);
  for (const L of [...linhasRef.map(l => l.pontos), S.eixo, S.pit]) for (const p of L) junta(p[0], p[1], p[0], p[1]);
  if (!isFinite(x0)) return { x0: -1000, y1: 1000, w: 2000, h: 2000 };
  const m = 80;
  return { x0: x0 - m, y1: y1 + m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
}
function montarVistas() {
  const b = quadroCima();
  vistas = { cima: { nome: 'Vista de cima', iw: b.w, ih: b.h, zoom: 1, px: 0, py: 0,
    paraImg: (x, y) => [x - b.x0, b.y1 - y], doImg: (ix, iy) => [b.x0 + ix, b.y1 - iy] } };
  camadas.filter(c => c.tipo === 'perspectiva').forEach((c, i) => {
    vistas['p' + i] = { nome: c.nome, iw: c.w, ih: c.h, zoom: 1, px: 0, py: 0, camada: c,
      paraImg: (x, y) => { const q = mul3(c.H, [x - c.O[0], y - c.O[1], 1]); return q[2] > 1e-9 ? [q[0] / q[2], q[1] / q[2]] : null; },
      doImg: (ix, iy) => {
        const q = mul3(c.Hi, [ix, iy, 1]);
        if (Math.abs(q[2]) < 1e-12) return null;
        const x = q[0] / q[2], y = q[1] / q[2];
        if (mul3(c.H, [x, y, 1])[2] <= 0 || Math.hypot(x, y) > 20000) return null;   // atrás da câmera ou no horizonte
        return [x + c.O[0], y + c.O[1]];
      } };
  });
  if (!vistas[vista]) vista = 'cima';
  enquadrarTudo();
  const abas = $('vistas');
  abas.replaceChildren();
  Object.entries(vistas).forEach(([id, v], i) => {
    const b = document.createElement('button');
    b.textContent = v.nome;
    b.title = 'Tecla ' + (i + 1);
    b.dataset.vista = id;
    b.onclick = () => trocarVista(id);
    abas.appendChild(b);
  });
}
function paraTela(x, y) {
  const v = V(), p = v.paraImg(x, y);
  return p ? [p[0] * v.zoom + v.px, p[1] * v.zoom + v.py] : null;
}
function doTela(sx, sy) {
  const v = V();
  return v.doImg((sx - v.px) / v.zoom, (sy - v.py) / v.zoom);
}
function enquadrar(v) {
  const r = tela.getBoundingClientRect();
  v.zoom = Math.min(r.width / v.iw, r.height / v.ih) * .96;
  v.px = (r.width - v.iw * v.zoom) / 2;
  v.py = (r.height - v.ih * v.zoom) / 2;
}
function enquadrarTudo() { for (const v of Object.values(vistas)) enquadrar(v); }
function zoomEm(sx, sy, f) {
  const v = V(), z = Math.min(400, Math.max(.002, v.zoom * f));
  f = z / v.zoom;
  v.px = sx - (sx - v.px) * f;
  v.py = sy - (sy - v.py) * f;
  v.zoom = z;
  pedirDesenho();
}
function centrarEm(p, zoom) {
  const r = tela.getBoundingClientRect(), v = V(), q = v.paraImg(p[0], p[1]);
  if (!q) return;
  if (zoom) v.zoom = zoom;
  v.px = r.width / 2 - q[0] * v.zoom;
  v.py = r.height / 2 - q[1] * v.zoom;
  pedirDesenho();
}
function trocarVista(nova) {
  if (nova === vista || !vistas[nova]) return;
  const r = tela.getBoundingClientRect(), c = doTela(r.width / 2, r.height / 2);
  vista = nova;
  if (c) {
    const v = V(), q = v.paraImg(c[0], c[1]);
    if (q && q[0] > 0 && q[0] < v.iw && q[1] > 0 && q[1] < v.ih) { v.px = r.width / 2 - q[0] * v.zoom; v.py = r.height / 2 - q[1] * v.zoom; }
  }
  atualizarPainel();
  pedirDesenho();
  salvarLocal();
}

// ---------- histórico e memória do navegador ----------
function marcar() { hist.push(JSON.stringify(S)); if (hist.length > 300) hist.shift(); refaz.length = 0; }
function desfazer() { if (!hist.length) return; refaz.push(JSON.stringify(S)); S = JSON.parse(hist.pop()); S.larguras ??= []; larguraSel = null; mudou(); }
function refazer() { if (!refaz.length) return; hist.push(JSON.stringify(S)); S = JSON.parse(refaz.pop()); S.larguras ??= []; larguraSel = null; mudou(); }
let tSalvar = 0;
function mudou() {
  atualizarPainel();
  pedirDesenho();
  clearTimeout(tSalvar);
  tSalvar = setTimeout(salvarLocal, 300);
}
// Por circuito: a linha pintada, a largura das bordas, a vista e, por nome, cada fundo (ligado, opacidade) e cada linha de
// apoio (ligada). Um fundo da pasta de referências guarda o seu ajuste mesmo enquanto a pasta não está aberta.
function lerLocalBruto(id) {
  try { return JSON.parse(localStorage.getItem(CHAVE + ':' + id) || 'null') || {}; } catch (e) { return {}; }
}
function salvarLocal() {
  if (!circ) return;
  const antes = lerLocalBruto(circ.id);
  const fundos = Object.fromEntries(camadas.filter(c => c.tipo === 'planta').map(c => [c.nome, { ver: c.ver, opac: c.opac }]));
  const linhas = Object.fromEntries(linhasRef.map(l => [l.nome, l.ver]));
  try {
    localStorage.setItem(CHAVE + ':' + circ.id, JSON.stringify({ S, largura: $('largura').value, vista,
      fundos: { ...antes.fundos, ...fundos }, linhas: { ...antes.linhas, ...linhas } }));
  } catch (e) { /* sem armazenamento */ }
}
function lerLocal(id) {
  const o = lerLocalBruto(id);
  if (o.largura) $('largura').value = o.largura;
  return o.S && Array.isArray(o.S.eixo)
    ? { eixo: o.S.eixo, fechado: !!o.S.fechado, pit: o.S.pit || [], chegada: o.S.chegada || null, larguras: o.S.larguras || [] } : null;
}
function aplicarVisuais(id) {
  const o = lerLocalBruto(id);
  for (const c of camadas) {
    const f = o.fundos?.[c.nome];
    if (c.tipo === 'planta' && f) { c.ver = !!f.ver; c.opac = Math.min(1, Math.max(0, +f.opac)); }
  }
  for (const l of linhasRef) if (o.linhas && Object.hasOwn(o.linhas, l.nome)) l.ver = !!o.linhas[l.nome];
  return o;
}
// Do editor todo: o último circuito, a ferramenta, a linha que se pinta, o raio e o que se mostra.
function salvarPrefs() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ circuito: circ?.id, ferramenta, camada, raio: $('raio').value,
      verFaixa: $('verFaixa').checked, verSetas: $('verSetas').checked, verPontos: $('verPontos').checked }));
  } catch (e) { /* sem armazenamento */ }
}
function lerPrefs() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; } catch (e) { return {}; }
}

// ---------- geometria das linhas ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function comprimento(L, fech) {
  let s = 0;
  for (let i = 1; i < L.length; i++) s += dist(L[i - 1], L[i]);
  if (fech && L.length > 2) s += dist(L[L.length - 1], L[0]);
  return s;
}
function reamostrar(L, passo, fech) {
  if (L.length < 2) return L.slice();
  const pts = fech ? L.concat([L[0]]) : L, acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + dist(pts[i - 1], pts[i]));
  const tot = acum[acum.length - 1];
  if (tot < passo) return [L[0], L[L.length - 1]];
  const n = fech ? Math.round(tot / passo) : Math.max(2, Math.round(tot / passo) + 1), out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = fech ? k * tot / n : k * tot / (n - 1);
    while (j < acum.length - 1 && acum[j] < s) j++;
    const a = pts[j - 1], b = pts[j], t = Math.min(1, Math.max(0, (s - acum[j - 1]) / (acum[j] - acum[j - 1] || 1)));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
function maisPertoTela(L, p) {
  const sp = paraTela(p[0], p[1]);
  let melhor = { i: -1, d: Infinity };
  if (!sp) return melhor;
  L.forEach((q, i) => {
    const t = paraTela(q[0], q[1]);
    if (!t) return;
    const d = Math.hypot(t[0] - sp[0], t[1] - sp[1]);
    if (d < melhor.d) melhor = { i, d };
  });
  return melhor;
}
function distTela(a, b) {
  const p = paraTela(a[0], a[1]), q = paraTela(b[0], b[1]);
  return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity;
}
function arco(L, i0, i1) {
  const n = L.length;
  let s = 0;
  for (let k = i0; k !== i1; k = (k + 1) % n) s += dist(L[k], L[(k + 1) % n]);
  return s;
}
function areaComSinal(L) {
  if (!L.length) return 0;
  const o = L[0];
  let a = 0;
  for (let i = 0; i < L.length; i++) {
    const p = L[i], q = L[(i + 1) % L.length];
    a += (p[0] - o[0]) * (q[1] - o[1]) - (q[0] - o[0]) * (p[1] - o[1]);
  }
  return a / 2;
}
const sentido = L => areaComSinal(L) < 0 ? 'horario' : 'anti-horario';
function raioMinimo(L, fech) {
  if (L.length < 5) return null;
  const R = reamostrar(L, 4, fech), n = R.length, k = 2;
  let melhor = null;
  for (let i = fech ? 0 : k; i < (fech ? n : n - k); i++) {
    const a = R[(i - k + n) % n], b = R[i], c = R[(i + k) % n];
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    if (area2 < 1e-6) continue;
    const r = dist(a, b) * dist(b, c) * dist(c, a) / (2 * area2);
    if (!melhor || r < melhor.r) melhor = { r, p: b };
  }
  return melhor;
}
const linhaAtiva = () => S[camada];
const ativaFechada = () => camada === 'eixo' && S.fechado;
// O lugar da linha mais perto de p, em qualquer ponto dos segmentos (uma reta desenhada com dois pontos não tem nada no
// meio): o segmento i, a fração t dele e o ponto q.
function pontoNaLinha(L, p, fech) {
  let melhor = null;
  const n = L.length;
  for (let i = 0; i < (fech ? n : n - 1); i++) {
    const a = L[i], b = L[(i + 1) % n], ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t], d = dist(p, q);
    if (!melhor || d < melhor.d) melhor = { i, t, q, d };
  }
  return melhor;
}
// Larguras por ponto (ferramenta Largura): cada ponto de largura fica preso ao lugar do eixo mais perto dele e muda a
// largura até `r` metros ao longo da pista, para os dois lados, com transição suave até a largura padrão; pontos que se
// alcançam fazem a média. Como ficam presos ao lugar e não a um índice, sobrevivem ao Pincel, ao Mover e ao Apagar.
function arcos(L, fech) {
  const cum = [0];
  for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + dist(L[i - 1], L[i]));
  return { cum, total: cum[cum.length - 1] + (fech && L.length > 2 ? dist(L[L.length - 1], L[0]) : 0) };
}
function sNaLinha(L, fech, cum, p) {
  const pn = pontoNaLinha(L, p, fech);
  return cum[pn.i] + pn.t * dist(L[pn.i], L[(pn.i + 1) % L.length]);
}
function largurasDaLinha(L, fech, padrao, ancoras) {
  if (!ancoras?.length || L.length < 2) return padrao;
  const { cum, total } = arcos(L, fech), sa = ancoras.map(a => sNaLinha(L, fech, cum, a.p));
  return cum.map(s => {
    let soma = 0, peso = 0;
    ancoras.forEach((a, k) => {
      let d = Math.abs(s - sa[k]);
      if (fech) d = Math.min(d, total - d);
      const u = d / Math.max(1, a.r);
      if (u < 1) { const g = (1 - u * u) ** 2; soma += g * (a.w - padrao); peso += g; }
    });
    return padrao + (peso > 1 ? soma / peso : soma);
  });
}
const larguraPadrao = () => +$('largura').value;
// O eixo com a largura de cada trecho: sem pontos de largura, a padrão; com eles, a linha a cada 2 m (uma reta longa
// desenhada com dois pontos também alarga no meio).
function eixoComLarguras() {
  if (!S.larguras.length || S.eixo.length < 3) return { L: S.eixo, W: larguraPadrao() };
  const L = reamostrar(S.eixo, 2, S.fechado);
  return { L, W: largurasDaLinha(L, S.fechado, larguraPadrao(), S.larguras) };
}
function larguraEm(p) {
  const { L, W } = eixoComLarguras();
  return typeof W === 'number' ? W : W[pontoNaLinha(L, p, S.fechado).i];
}
// Mover sem nenhum ponto dentro do círculo (o meio de uma reta desenhada com dois pontos): um ponto novo na linha, no
// lugar mais perto do centro. null: a linha não passa dentro do círculo.
function pontoNoRaio(L, c, R, fech) {
  if (L.some(p => dist(p, c) < R)) return L;
  const perto = pontoNaLinha(L, c, fech);
  if (!perto || perto.d > R) return null;
  return L.slice(0, perto.i + 1).concat([perto.q], L.slice(perto.i + 1));
}

// ---------- pincel: desenha do zero, emenda na ponta ou refaz um trecho ----------
function fecharSePerto() {
  if (camada !== 'eixo' || S.fechado || S.eixo.length < 30) return;
  if (comprimento(S.eixo, false) > 300 && distTela(S.eixo[S.eixo.length - 1], S.eixo[0]) < ENCAIXE) {
    S.fechado = true;
    aviso('Volta fechada.');
  }
}
function aplicarTraco(bruto) {
  const tr = reamostrar(bruto, 2.0, false);
  if (tr.length < 2 || comprimento(tr, false) < 3) return;
  const L = linhaAtiva(), n = L.length;
  marcar();
  if (n < 2) {
    S[camada] = tr;
    fecharSePerto();
    return mudou();
  }
  const a = maisPertoTela(L, tr[0]), b = maisPertoTela(L, tr[tr.length - 1]), pertoA = a.d < ENCAIXE, pertoB = b.d < ENCAIXE;
  if (ativaFechada()) {
    if (!(pertoA && pertoB) || a.i === b.i) {
      hist.pop();
      return aviso('Para refazer um trecho, comece e termine o traço em cima da linha.', true);
    }
    let i0 = a.i, i1 = b.i, t = tr;
    if (arco(L, i1, i0) < arco(L, i0, i1)) { [i0, i1] = [i1, i0]; t = tr.slice().reverse(); }
    const resto = [];
    for (let k = (i1 + 1) % n; k !== i0; k = (k + 1) % n) resto.push(L[k]);
    S.eixo = t.concat(resto);
    return mudou();
  }
  if (distTela(L[n - 1], tr[0]) < ENCAIXE) S[camada] = L.concat(tr.slice(1));
  else if (distTela(L[0], tr[0]) < ENCAIXE) S[camada] = tr.slice().reverse().concat(L.slice(1));
  else if (pertoA && pertoB && a.i !== b.i) {
    let i0 = a.i, i1 = b.i, t = tr;
    if (i0 > i1) { [i0, i1] = [i1, i0]; t = tr.slice().reverse(); }
    S[camada] = L.slice(0, i0).concat(t, L.slice(i1 + 1));
  } else if (pertoA) S[camada] = L.slice(0, a.i).concat(tr);
  else {
    hist.pop();
    return aviso('Comece o traço na ponta da linha (ou em cima dela) para emendar.', true);
  }
  fecharSePerto();
  mudou();
}

// ---------- desenho ----------
let pedido = false, cursorMundo = null, arrasto = null, destaque = null, larguraSel = null, marcouPainel = false;
function pedirDesenho() { if (!pedido) { pedido = true; requestAnimationFrame(pintar); } }
function ajustarTela() {
  const r = tela.getBoundingClientRect(), k = window.devicePixelRatio || 1;
  const w = Math.round(r.width * k), h = Math.round(r.height * k);
  if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return [r.width, r.height];
}
function caminho(L, fech) {
  let aberto = false, n = 0;
  ctx.beginPath();
  for (const p of L) {
    const q = paraTela(p[0], p[1]);
    if (!q) { aberto = false; continue; }
    if (!aberto) { ctx.moveTo(q[0], q[1]); aberto = true; } else ctx.lineTo(q[0], q[1]);
    n++;
  }
  if (fech && n > 2) ctx.closePath();
  return n;
}
function normais(L, fech) {
  const n = L.length;
  return L.map((_, i) => {
    const a = L[fech ? (i - 1 + n) % n : Math.max(0, i - 1)], b = L[fech ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    return [-dy / m, dx / m];
  });
}
function bordas(L, fech, larg) {
  const N = normais(L, fech), h = i => (typeof larg === 'number' ? larg : larg[i]) / 2;
  return [L.map((p, i) => [p[0] + N[i][0] * h(i), p[1] + N[i][1] * h(i)]), L.map((p, i) => [p[0] - N[i][0] * h(i), p[1] - N[i][1] * h(i)])];
}
function desenharLinha(L, fech, cor, larg, tracejado) {
  if (L.length < 2) return;
  caminho(L, fech);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (tracejado) {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = larg + 2.5; ctx.stroke();
  ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.stroke();
}
function desenharFaixa(L, fech, larg, preenche) {
  if (L.length < 3) return;
  const [esq, dir] = bordas(L, fech, larg);
  if (preenche) {
    ctx.beginPath();
    for (const anel of fech ? [esq, dir] : [esq.concat(dir.slice().reverse())]) {
      let ok = false;
      for (const p of anel) {
        const q = paraTela(p[0], p[1]);
        if (!q) continue;
        if (!ok) { ctx.moveTo(q[0], q[1]); ok = true; } else ctx.lineTo(q[0], q[1]);
      }
      ctx.closePath();
    }
    ctx.fillStyle = preenche;
    ctx.fill('evenodd');
  }
  for (const b of [esq, dir]) { caminho(b, fech); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.stroke(); }
}
function desenharSetas(L, fech, cor) {
  if (L.length < 3) return;
  const R = reamostrar(L, 2, fech);
  for (let i = 20; i < R.length - 3; i += 60) {
    const p = paraTela(R[i][0], R[i][1]), q = paraTela(R[i + 3][0], R[i + 3][1]);
    if (!p || !q) continue;
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), t = 9;
    ctx.beginPath();
    ctx.moveTo(p[0] + Math.cos(ang) * t, p[1] + Math.sin(ang) * t);
    ctx.lineTo(p[0] + Math.cos(ang + 2.5) * t, p[1] + Math.sin(ang + 2.5) * t);
    ctx.lineTo(p[0] + Math.cos(ang - 2.5) * t, p[1] + Math.sin(ang - 2.5) * t);
    ctx.closePath();
    ctx.fillStyle = cor; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
  }
}
function desenharChegada() {
  if (!S.chegada || S.eixo.length < 3) return;
  // Atravessada no segmento onde ela está (a linha pode ter mudado depois: vai para o lugar mais perto dela).
  const pn = pontoNaLinha(S.eixo, S.chegada, S.fechado), n = S.eixo.length, a = S.eixo[pn.i], b = S.eixo[(pn.i + 1) % n];
  const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, h = +$('largura').value / 2 + 1, c = pn.q;
  const p = paraTela(c[0] - dy / m * h, c[1] + dx / m * h), q = paraTela(c[0] + dy / m * h, c[1] - dx / m * h);
  if (!p || !q) return;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.stroke();
  ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.strokeText('CHEGADA', q[0] + 6, q[1] + 4); ctx.fillText('CHEGADA', q[0] + 6, q[1] + 4);
  ctx.restore();
}
// Os pontos de largura: losangos no eixo; o selecionado mostra o trecho que alcança e a largura.
function desenharLarguras() {
  if (!S.larguras.length || S.eixo.length < 3) return;
  const ativo = ferramenta === 'largura';
  const sel = S.larguras[larguraSel];
  if (ativo && sel) {
    const D = reamostrar(S.eixo, 2, S.fechado), { cum, total } = arcos(D, S.fechado), s0 = sNaLinha(D, S.fechado, cum, sel.p);
    const trecho = D.filter((_, i) => { let d = Math.abs(cum[i] - s0); if (S.fechado) d = Math.min(d, total - d); return d < sel.r; });
    if (trecho.length > 1) {
      caminho(trecho, false);
      ctx.strokeStyle = 'rgba(255,209,102,.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  S.larguras.forEach((a, k) => {
    const q = paraTela(a.p[0], a.p[1]);
    if (!q) return;
    const t = k === larguraSel && ativo ? 8 : 5;
    ctx.beginPath(); ctx.moveTo(q[0], q[1] - t); ctx.lineTo(q[0] + t, q[1]); ctx.lineTo(q[0], q[1] + t); ctx.lineTo(q[0] - t, q[1]); ctx.closePath();
    ctx.fillStyle = k === larguraSel && ativo ? '#ffd166' : '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    if (ativo) {
      const txt = `${(+a.w).toLocaleString('pt-BR')} m`;
      ctx.font = '600 11px system-ui, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
      ctx.strokeText(txt, q[0] + 10, q[1] - 8); ctx.fillText(txt, q[0] + 10, q[1] - 8);
    }
  });
}
function desenharPontos(L) {
  if (L.length < 2) return;
  const a = paraTela(L[0][0], L[0][1]), b = paraTela(L[1][0], L[1][1]);
  if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 6) return;
  ctx.fillStyle = '#fff';
  for (const p of L) {
    const q = paraTela(p[0], p[1]);
    if (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill(); }
  }
}
function pintar() {
  pedido = false;
  const [cw, ch] = ajustarTela(), v = V();
  ctx.fillStyle = '#101215'; ctx.fillRect(0, 0, cw, ch);
  if (!v) return;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (vista === 'cima') {
    for (const c of camadas) {
      if (c.tipo !== 'planta' || !c.ver || c.opac <= 0) continue;
      const p = paraTela(c.x0, c.y1);
      ctx.globalAlpha = c.opac;
      ctx.drawImage(c.img, p[0], p[1], c.largM * v.zoom, c.altM * v.zoom);
    }
    ctx.globalAlpha = 1;
  } else ctx.drawImage(v.camada.img, v.px, v.py, v.iw * v.zoom, v.ih * v.zoom);
  for (const l of linhasRef) {
    if (!l.ver) continue;
    if (l.larguras) desenharFaixa(l.pontos, l.fechada, l.larguras, null);
    desenharLinha(l.pontos, l.fechada, l.cor, 1.6, true);
  }
  if ($('verFaixa').checked) {
    const { L, W } = eixoComLarguras();
    desenharFaixa(L, S.fechado, W, 'rgba(0,229,255,.10)');
    if (S.pit.length > 2) desenharFaixa(S.pit, false, 8, 'rgba(255,159,26,.10)');
  }
  desenharLinha(S.pit, false, '#ff9f1a', 2);
  desenharLinha(S.eixo, S.fechado, '#00e5ff', 2.2);
  if ($('verSetas').checked) { desenharSetas(S.eixo, S.fechado, '#00e5ff'); desenharSetas(S.pit, false, '#ff9f1a'); }
  if ($('verPontos').checked) desenharPontos(linhaAtiva());
  desenharChegada();
  desenharLarguras();
  if (destaque) {
    const q = paraTela(destaque[0], destaque[1]);
    if (q) { ctx.beginPath(); ctx.arc(q[0], q[1], 16, 0, 7); ctx.strokeStyle = '#e2553f'; ctx.lineWidth = 2.5; ctx.stroke(); }
  }
  if (arrasto?.tipo === 'pincel' && arrasto.tela.length > 1) {
    ctx.beginPath();
    arrasto.tela.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  if (cursorMundo && (ferramenta === 'mover' || ferramenta === 'apagar')) {
    const c = arrasto?.tipo === 'mover' ? arrasto.p0 : cursorMundo, r = +$('raio').value, anel = [];
    for (let k = 0; k < 48; k++) anel.push([c[0] + r * Math.cos(k * Math.PI / 24), c[1] + r * Math.sin(k * Math.PI / 24)]);
    caminho(anel, true);
    ctx.strokeStyle = ferramenta === 'apagar' ? 'rgba(226,85,63,.95)' : 'rgba(255,225,77,.95)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  $('sZoom').textContent = vista === 'cima' ? `${(1 / v.zoom).toFixed(2)} m/px` : `zoom ${v.zoom.toFixed(2)}×`;
}

// ---------- painel ----------
const AJUDA = {
  pincel: 'Arraste pelo <b>meio da pista</b>. Pintando do zero, emende os traços a partir da ponta da linha; voltando ao começo, a volta fecha sozinha. Para <b>corrigir um trecho</b>, comece e termine o traço em cima da linha: o pedaço entre os dois pontos é trocado.',
  mover: 'Arraste para <b>empurrar</b> a linha. O círculo amarelo mostra o alcance: o centro mexe mais, a borda quase nada. Se não houver nenhum ponto dentro do círculo (o meio de uma reta longa), o Mover cria um na linha, perto do centro. Ajuste o raio ou use <kbd>[</kbd> <kbd>]</kbd>.',
  pontos: 'Clique para pôr um ponto: no fim da linha (se aberta) ou no trecho mais perto (se a volta está fechada).',
  apagar: 'Arraste por cima para <b>apagar pontos</b> dentro do círculo vermelho; depois refaça o trecho com o Pincel.',
  chegada: 'Clique no eixo onde fica a <b>linha de chegada</b>, em qualquer lugar dele; clique de novo para mudar.',
  largura: 'Clique no eixo para pôr um <b>ponto de largura</b> (ou num losango para selecionar). Ajuste a largura ali e o alcance: o trecho em amarelo muda, com transição suave até a largura padrão. Arraste o losango para levá-lo ao longo da pista.',
  mao: 'Arraste para mover a imagem; a roda do mouse dá zoom.',
};
const fmtM = v => Math.round(v).toLocaleString('pt-BR') + ' m';
function montarSeletor() {
  const sel = $('circuito'), atual = sel.value;
  sel.replaceChildren();
  for (const [id, c] of Object.entries(CIRCUITS)) {
    if (!c.data && id !== 'interlagos') continue;
    sel.add(new Option(c.name, id));
  }
  for (const [id, p] of Object.entries(soPacote)) sel.add(new Option((p.nome || id) + ' · só referências', id));
  if (atual) sel.value = atual;
}
function montarListas() {
  const lc = $('listaCamadas');
  lc.replaceChildren();
  const plantas = camadas.filter(c => c.tipo === 'planta');
  if (!plantas.length) lc.innerHTML = '<p class="nota">Nenhuma imagem vista de cima.</p>';
  for (const c of plantas) {
    const d = document.createElement('div');
    d.className = 'item';
    const ck = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.ver });
    const nome = Object.assign(document.createElement('span'), { className: 'nome', textContent: c.nome, title: c.nome });
    const val = Object.assign(document.createElement('span'), { className: 'val', textContent: Math.round(c.opac * 100) + '%' });
    const op = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, value: Math.round(c.opac * 100) });
    ck.onchange = () => { c.ver = ck.checked; pedirDesenho(); salvarLocal(); };
    op.oninput = () => { c.opac = op.value / 100; val.textContent = op.value + '%'; pedirDesenho(); salvarLocal(); };
    d.append(ck, nome, val, op);
    lc.appendChild(d);
  }
  const ll = $('listaLinhas');
  ll.replaceChildren();
  for (const l of linhasRef) {
    const d = document.createElement('div');
    d.className = 'item';
    const lab = document.createElement('label');
    lab.className = 'chk';
    lab.style.margin = '0';
    const ck = Object.assign(document.createElement('input'), { type: 'checkbox', checked: l.ver });
    const am = Object.assign(document.createElement('span'), { className: 'amostra' });
    am.style.background = l.cor;
    lab.append(ck, am);
    const nome = Object.assign(document.createElement('span'), { className: 'nome', textContent: l.nome, title: l.nome });
    ck.onchange = () => { l.ver = ck.checked; pedirDesenho(); salvarLocal(); };
    d.append(lab, nome);
    if (l.editavel !== false) {
      const ed = Object.assign(document.createElement('button'), { className: 'btn mini', textContent: 'editar', title: 'Copiar esta linha para a edição' });
      ed.onclick = () => editarLinha(l);
      d.append(ed);
    }
    ll.appendChild(d);
  }
}
function editarLinha(l) {
  const destino = l.jogo === 'pit' || !l.fechada ? 'pit' : 'eixo';
  if (S[destino].length > 1 && !confirm(`Trocar ${destino === 'eixo' ? 'o eixo' : 'o pit lane'} que você está pintando por “${l.nome}”? (Ctrl+Z desfaz)`)) return;
  marcar();
  S[destino] = l.pontos.map(p => [p[0], p[1]]);
  if (destino === 'eixo') S.fechado = l.fechada;
  camada = destino;
  mudou();
  aviso(`“${l.nome}” copiada para a edição. Corrija com Mover ou com o Pincel começando e terminando na linha.`);
}
function atualizarPainel() {
  for (const b of document.querySelectorAll('#ferramentas button')) b.classList.toggle('on', b.dataset.ferr === ferramenta);
  for (const b of document.querySelectorAll('#camadas button')) b.classList.toggle('on', b.dataset.camada === camada);
  for (const b of document.querySelectorAll('#vistas button')) b.classList.toggle('on', b.dataset.vista === vista);
  $('ajuda').innerHTML = AJUDA[ferramenta];
  $('raioVal').textContent = $('raio').value + ' m';
  $('larguraVal').textContent = $('largura').value + ' m';
  if (circ) { $('circuito').value = circ.id; $('nomeArquivo').textContent = `tracado_${circ.id}.json`; }
  const L = S.eixo, c = comprimento(L, S.fechado);
  $('mComp').textContent = L.length > 1 ? fmtM(c) + (S.fechado ? '' : ' (aberta)') : '—';
  const of = circ?.oficial_m, dif = of ? (c / of - 1) * 100 : 0;
  $('mOficial').textContent = of ? fmtM(of) + (L.length > 1 ? ` (${dif >= 0 ? '+' : ''}${dif.toFixed(1)}%)` : '') : '—';
  // Medidas no chão (UTM); o jogo estica o traçado até a extensão oficial quando a diferença é pequena.
  $('mJogo').textContent = !circ?.jogo ? 'ainda não está no jogo' : fmtM(comprimento(circ.jogo.eixo, true))
    + (circ.escala && Math.abs(circ.escala - 1) > 1e-4 ? ` (×${circ.escala.toFixed(3)} no jogo)` : '');
  $('mPontos').textContent = L.length;
  $('mSentido').textContent = L.length > 2 && S.fechado ? (sentido(L) === 'horario' ? 'horário' : 'anti-horário') : '—';
  const r = raioMinimo(L, S.fechado);
  $('mRaio').textContent = r ? `R ≈ ${r.r.toFixed(0)} m` : '—';
  $('mRaio').style.color = r && r.r < 10 ? 'var(--bad)' : '';
  $('mPit').textContent = S.pit.length > 1 ? fmtM(comprimento(S.pit, false)) : '—';
  $('bFechar').textContent = S.fechado ? 'Abrir volta' : 'Fechar volta';
  if (!S.larguras[larguraSel]) larguraSel = null;
  const sel = ferramenta === 'largura' ? S.larguras[larguraSel] : null;
  $('painelLargura').hidden = !sel;
  if (sel) {
    $('larguraPonto').value = sel.w; $('larguraPontoVal').textContent = `${(+sel.w).toLocaleString('pt-BR')} m`;
    $('alcancePonto').value = sel.r; $('alcancePontoVal').textContent = `${sel.r} m`;
  }
}

// ---------- mouse ----------
let espaco = false;
tela.addEventListener('contextmenu', e => e.preventDefault());
tela.addEventListener('wheel', e => {
  e.preventDefault();
  zoomEm(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0015)));
}, { passive: false });
tela.addEventListener('pointerdown', e => {
  tela.setPointerCapture(e.pointerId);
  const sx = e.offsetX, sy = e.offsetY;
  destaque = null;
  if (e.button === 1 || e.button === 2 || espaco || ferramenta === 'mao') {
    arrasto = { tipo: 'pan', sx, sy, px: V().px, py: V().py };
    tela.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  const w = doTela(sx, sy);
  if (!w) return;
  if (ferramenta === 'pincel') arrasto = { tipo: 'pincel', tela: [[sx, sy]], mundo: [w] };
  else if (ferramenta === 'mover') {
    const L = linhaAtiva(), R = +$('raio').value;
    if (L.length < 2) return;
    const denso = pontoNoRaio(L, w, R, ativaFechada());
    if (!denso) return aviso('A linha não passa dentro do círculo: aumente o raio ou chegue mais perto.', true);
    marcar();
    S[camada] = denso;
    arrasto = { tipo: 'mover', p0: w, antes: L, base: denso.map(p => p.slice()), mexeu: false,
      peso: denso.map(p => { const d = dist(p, w) / R; return d < 1 ? (1 - d * d) ** 2 : 0; }) };
  } else if (ferramenta === 'apagar') {
    marcar();
    arrasto = { tipo: 'apagar', apagou: false };
    apagarEm(w);
  } else if (ferramenta === 'pontos') {
    marcar();
    const L = linhaAtiva();
    if (ativaFechada() && L.length > 2) L.splice(pontoNaLinha(L, w, true).i + 1, 0, w);
    else L.push(w);
    fecharSePerto();
    mudou();
  } else if (ferramenta === 'chegada') {
    if (S.eixo.length < 3) return aviso('Pinte o eixo primeiro.', true);
    marcar();
    S.chegada = pontoNaLinha(S.eixo, w, S.fechado).q;
    mudou();
  } else if (ferramenta === 'largura') {
    if (S.eixo.length < 3) return aviso('Pinte o eixo primeiro: a largura vale para o eixo da pista.', true);
    marcouPainel = false;
    const perto = S.larguras.findIndex(a => distTela(a.p, w) < 12);
    marcar();
    if (perto >= 0) {
      larguraSel = perto;
      arrasto = { tipo: 'largura', i: perto, mexeu: false };
    } else {
      const pn = pontoNaLinha(S.eixo, w, S.fechado);
      if (distTela(pn.q, w) > 30) { hist.pop(); return aviso('Clique em cima do eixo para pôr um ponto de largura.', true); }
      const atual = Math.round(larguraEm(pn.q) * 2) / 2, r = S.larguras.length ? S.larguras[S.larguras.length - 1].r : 40;
      S.larguras.push({ p: pn.q, w: atual, r });
      larguraSel = S.larguras.length - 1;
      marcouPainel = true;
      mudou();
    }
    atualizarPainel(); pedirDesenho();
  }
});
function apagarEm(w) {
  const R = +$('raio').value, L = linhaAtiva(), antes = L.length;
  S[camada] = L.filter(p => dist(p, w) > R);
  if (S[camada].length !== antes) { arrasto.apagou = true; atualizarPainel(); pedirDesenho(); }
}
tela.addEventListener('pointermove', e => {
  const sx = e.offsetX, sy = e.offsetY;
  if (!V()) return;
  cursorMundo = doTela(sx, sy);
  $('sCoord').textContent = cursorMundo
    ? (circ?.sistema === 'utm' ? `E ${cursorMundo[0].toFixed(1)}  N ${cursorMundo[1].toFixed(1)}  (EPSG ${circ.epsg})` : `x ${cursorMundo[0].toFixed(1)}  y ${cursorMundo[1].toFixed(1)} m`)
    : 'fora do chão';
  if (!arrasto) { if (ferramenta === 'mover' || ferramenta === 'apagar') pedirDesenho(); return; }
  if (arrasto.tipo === 'pan') {
    V().px = arrasto.px + sx - arrasto.sx;
    V().py = arrasto.py + sy - arrasto.sy;
  } else if (arrasto.tipo === 'pincel') {
    const ult = arrasto.tela[arrasto.tela.length - 1];
    if (Math.hypot(sx - ult[0], sy - ult[1]) >= 3 && cursorMundo) { arrasto.tela.push([sx, sy]); arrasto.mundo.push(cursorMundo); }
  } else if (arrasto.tipo === 'mover' && cursorMundo) {
    const dx = cursorMundo[0] - arrasto.p0[0], dy = cursorMundo[1] - arrasto.p0[1];
    S[camada] = arrasto.base.map((p, i) => arrasto.peso[i] ? [p[0] + dx * arrasto.peso[i], p[1] + dy * arrasto.peso[i]] : p);
    arrasto.mexeu ||= Math.hypot(dx, dy) > .05;
  } else if (arrasto.tipo === 'apagar' && cursorMundo) apagarEm(cursorMundo);
  else if (arrasto.tipo === 'largura' && cursorMundo) {
    S.larguras[arrasto.i].p = pontoNaLinha(S.eixo, cursorMundo, S.fechado).q;
    arrasto.mexeu = true;
  }
  pedirDesenho();
});
function soltar() {
  if (!arrasto) return;
  const a = arrasto;
  arrasto = null;
  tela.style.cursor = '';
  if (a.tipo === 'pincel') aplicarTraco(a.mundo);
  else if (a.tipo === 'mover') {
    if (a.mexeu) mudou();
    else { S[camada] = a.antes; hist.pop(); }       // só um clique: nem os pontos novos ficam
  }
  else if (a.tipo === 'apagar') { if (a.apagou) mudou(); else hist.pop(); }
  else if (a.tipo === 'largura') { if (a.mexeu) mudou(); else hist.pop(); }
  pedirDesenho();
}
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);
tela.addEventListener('pointerleave', () => { cursorMundo = null; pedirDesenho(); });

// ---------- teclado ----------
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || (e.target.tagName === 'INPUT' && !['range', 'checkbox'].includes(e.target.type))) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
    else if (k === 's') { e.preventDefault(); salvarArquivo(); }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); espaco = true; tela.style.cursor = 'grab'; return; }
  if ((k === 'delete' || k === 'backspace') && ferramenta === 'largura' && S.larguras[larguraSel]) { e.preventDefault(); removerLargura(); return; }
  const ferr = { b: 'pincel', m: 'mover', p: 'pontos', e: 'apagar', c: 'chegada', l: 'largura', h: 'mao' }[k];
  if (ferr) { ferramenta = ferr; atualizarPainel(); pedirDesenho(); salvarPrefs(); return; }
  const n = Number.parseInt(k, 10);
  if (n >= 1 && n <= 9) { const id = Object.keys(vistas)[n - 1]; if (id) trocarVista(id); return; }
  if (k === 'f') { enquadrar(V()); pedirDesenho(); }
  else if (k === '[' || k === ']') {
    const r = $('raio');
    r.value = Math.max(+r.min, Math.min(+r.max, +r.value + (k === ']' ? 5 : -5)));
    atualizarPainel(); pedirDesenho();
  } else if (k === 'escape' && arrasto?.tipo === 'pincel') { arrasto = null; pedirDesenho(); }
  else if (k === '+' || k === '=' || k === '-') { const r = tela.getBoundingClientRect(); zoomEm(r.width / 2, r.height / 2, k === '-' ? .8 : 1.25); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { espaco = false; tela.style.cursor = ''; } });
window.addEventListener('blur', () => { espaco = false; });
window.addEventListener('resize', pedirDesenho);

// ---------- botões ----------
document.querySelectorAll('#ferramentas button').forEach(b => b.onclick = () => { ferramenta = b.dataset.ferr; atualizarPainel(); pedirDesenho(); salvarPrefs(); });
document.querySelectorAll('#camadas button').forEach(b => b.onclick = () => { camada = b.dataset.camada; atualizarPainel(); pedirDesenho(); salvarPrefs(); });
for (const id of ['largura', 'raio']) $(id).addEventListener('input', () => { atualizarPainel(); pedirDesenho(); salvarLocal(); salvarPrefs(); });
for (const id of ['verFaixa', 'verSetas', 'verPontos']) $(id).addEventListener('change', () => { pedirDesenho(); salvarPrefs(); });
$('circuito').onchange = () => abrirCircuito($('circuito').value).catch(e => aviso('Não abriu: ' + e.message, true));
$('bPasta').onclick = () => $('pasta').click();
$('pasta').onchange = e => {
  const arquivos = [...e.target.files];
  e.target.value = '';
  if (arquivos.length) abrirPacote(arquivos).catch(err => aviso('A pasta não abriu: ' + err.message, true));
};
// Painel do ponto de largura selecionado (um passo de desfazer por seleção, não um por movimento do controle).
function removerLargura() {
  if (!S.larguras[larguraSel]) return;
  marcar();
  S.larguras.splice(larguraSel, 1);
  larguraSel = null;
  mudou();
}
for (const [id, campo] of [['larguraPonto', 'w'], ['alcancePonto', 'r']]) {
  $(id).addEventListener('input', () => {
    const a = S.larguras[larguraSel];
    if (!a) return;
    if (!marcouPainel) { marcar(); marcouPainel = true; }
    a[campo] = +$(id).value;
    mudou();
  });
}
$('bRemoverLargura').onclick = removerLargura;
$('bInverter').onclick = () => { if (S.eixo.length < 3) return; marcar(); S.eixo.reverse(); mudou(); aviso('Sentido invertido: ' + $('mSentido').textContent + '.'); };
$('bFechar').onclick = () => { if (S.eixo.length < 3) return; marcar(); S.fechado = !S.fechado; mudou(); };
$('bRaio').onclick = () => {
  const r = raioMinimo(S.eixo, S.fechado);
  if (!r) return;
  destaque = r.p;
  centrarEm(r.p, Math.max(V().zoom, vista === 'cima' ? 4 : 4));
  aviso(`Curva mais fechada: R ≈ ${r.r.toFixed(0)} m (círculo vermelho).`);
};
$('bLimpar').onclick = () => {
  if (!confirm('Apagar o eixo, o pit lane e a chegada deste circuito? (Ctrl+Z desfaz)')) return;
  marcar(); S = vazio(); mudou();
};
function exportar() {
  const r2 = L => L.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
  const fora = {
    formato: FORMATO_TRACADO, circuito: circ.id, nome: circ.nome, sistema: circ.sistema, epsg: circ.epsg,
    salvo_em: new Date().toISOString(), ferramenta: 'editor-tracado.html',
    eixo_fechado: S.fechado, sentido: S.eixo.length > 2 && S.fechado ? sentido(S.eixo) : null,
    comprimento_m: Math.round(comprimento(S.eixo, S.fechado) * 10) / 10, largura_mostrada_m: +$('largura').value,
    eixo: r2(S.eixo), chegada: S.chegada ? r2([S.chegada])[0] : null, pit: r2(S.pit),
    // Pontos de largura (x, y, largura, alcance ao longo da pista); fora do alcance deles vale largura_mostrada_m. O
    // gerador (eixo_do_editor.py) faz a mesma conta a cada 2 m da pista.
    larguras_pontos: S.larguras.map(a => [...r2([a.p])[0], +a.w, +a.r]),
  };
  if (circ.origemJogo) {
    // O mesmo traçado no sistema local do arquivo da pista atual (x leste, y norte, já na escala do jogo).
    const [ox, oy] = circ.origemJogo, k = circ.escala;
    fora.jogo = { origem_utm: circ.origemJogo, escala: k, eixo_local: r2(S.eixo.map(p => [(p[0] - ox) * k, (p[1] - oy) * k])) };
  }
  return JSON.stringify(fora);
}
async function salvarArquivo() {
  if (!circ || S.eixo.length < 2) return aviso('Ainda não há eixo para salvar.', true);
  const txt = exportar(), nome = `tracado_${circ.id}.json`;
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: nome, types: [{ description: 'Traçado (JSON)', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable();
      await w.write(txt); await w.close();
      return aviso('Salvo: ' + h.name);
    } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  aviso(`Baixado como ${nome} (pasta Downloads).`);
}
$('bSalvar').onclick = salvarArquivo;
$('bCopiar').onclick = async () => {
  if (!circ || S.eixo.length < 2) return aviso('Ainda não há eixo para copiar.', true);
  try { await navigator.clipboard.writeText(exportar()); aviso('JSON copiado.'); } catch (e) { aviso('Não deu para copiar aqui; use Salvar arquivo.', true); }
};
$('bAbrir').onclick = () => $('arquivo').click();
$('arquivo').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    const ok = L => Array.isArray(L) && L.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]));
    if (!ok(o.eixo)) throw new Error('sem eixo');
    if (o.circuito && o.circuito !== circ.id) throw new Error(`é do circuito ${o.circuito}; escolha-o antes`);
    if (o.sistema && o.sistema !== circ.sistema) throw new Error(`está em ${o.sistema}, o circuito em ${circ.sistema}`);
    marcar();
    const larguras = Array.isArray(o.larguras_pontos) ? o.larguras_pontos.filter(a => a.length >= 4 && a.every(Number.isFinite)).map(a => ({ p: [a[0], a[1]], w: a[2], r: a[3] })) : [];
    S = { eixo: o.eixo.map(p => [+p[0], +p[1]]), fechado: o.eixo_fechado ?? true, pit: ok(o.pit) ? o.pit.map(p => [+p[0], +p[1]]) : [], chegada: o.chegada || null, larguras };
    if (o.largura_mostrada_m) $('largura').value = o.largura_mostrada_m;
    larguraSel = null;
    mudou();
    aviso('Aberto: ' + f.name);
  } catch (err) { aviso('Arquivo não reconhecido (' + err.message + ').', true); }
};

// ---------- aviso ----------
let tAviso = 0;
function aviso(txt, ruim) {
  const el = $('aviso');
  el.textContent = txt;
  el.classList.toggle('ruim', !!ruim);
  el.classList.add('ver');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('ver'), ruim ? 4500 : 2800);
}

// ---------- início ----------
window.editorTracado = {
  info: () => ({ pronto: !!circ && !carregando, circuito: circ?.id, sistema: circ?.sistema, vista, vistas: Object.keys(vistas), camadas: camadas.map(c => c.nome),
    fundos: camadas.filter(c => c.tipo === 'planta').map(c => ({ nome: c.nome, ver: c.ver, opac: c.opac })),
    linhasVer: Object.fromEntries(linhasRef.map(l => [l.nome, l.ver])), ferramentaAtual: ferramenta, camadaAtual: camada,
    linhas: linhasRef.map(l => l.nome), eixo: S.eixo.length, fechado: S.fechado, comprimento: comprimento(S.eixo, S.fechado),
    pit: S.pit.length, chegada: S.chegada, sentido: S.eixo.length > 2 ? sentido(S.eixo) : null,
    larguras: S.larguras.map(a => ({ ...a })), larguraSel }),
  exportar, abrirCircuito, abrirPacote, trocarVista, paraTela, doTela, larguraEm,
  ferramenta: f => { ferramenta = f; atualizarPainel(); },
};
montarSeletor();
const prefs = lerPrefs();
if (AJUDA[prefs.ferramenta]) ferramenta = prefs.ferramenta;
if (prefs.camada === 'eixo' || prefs.camada === 'pit') camada = prefs.camada;
if (prefs.raio) $('raio').value = prefs.raio;
for (const id of ['verFaixa', 'verSetas', 'verPontos']) if (typeof prefs[id] === 'boolean') $(id).checked = prefs[id];
let inicial = prefs.circuito || 'cascavel';
if (!Object.hasOwn(CIRCUITS, inicial)) {
  // Um circuito que só existe numa pasta de referências precisa dela de novo; o trabalho volta ao abri-la.
  if (prefs.circuito) setTimeout(() => aviso(`Para continuar em “${prefs.circuito}”, abra de novo a pasta de referências dele.`), 600);
  inicial = 'cascavel';
}
abrirCircuito(inicial).catch(e => aviso('Não abriu: ' + e.message, true));
