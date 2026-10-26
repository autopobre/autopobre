// A história de Interlagos (track-history.js plays it): the 1940 circuit, the 1990 reform, the names of the corners.
// Facts from the team's research (2026-10-21): the Prefeitura's history pages (after the historian Paulo Scali), Ingo
// Hoffmann's lap of the old track (Projeto Motor), ge/ESPN/Terra on the S do Senna, Motor Sport's reports. Where
// sources disagree the text keeps to what they share ("pelo menos cinco mortos"); legends are told as legends; what
// the game's own geometry shows (the S joining two straights, the stretch run backwards) is said as "repare".
// The old layout (interlagos-1940.js) is traced from the 2020 ortho and period maps; pictures and links: historia-midia.js.
import {OLD_LAYOUT,NEW_PIECES} from './interlagos-1940.js';
import {HISTORIA_IMAGENS,HISTORIA_LINKS} from './historia-midia.js';
import {EN} from './historia-interlagos-en.js';
export {OLD_LAYOUT};
// The pictures' titles and captions in English come with the English script (historia-interlagos-en.js).
export const MEDIA={images:HISTORIA_IMAGENS,links:Object.fromEntries(HISTORIA_LINKS.map(l=>[l.id,l])),translations:{en:{images:EN.images}}};
// A chapter's "saiba mais": every link that fits it (historia-midia.js fits), videos first.
const linksFor=id=>HISTORIA_LINKS.filter(l=>l.fits.includes(id)).sort((a,b)=>(b.kind==='video')-(a.kind==='video')).map(l=>l.id);

const CENTER={x:-90,y:140};
// Seen from above with east up, like the classic maps: the pit straight along the bottom, the S on the right.
const MAP={x:-120,y:120};
// The lake in the middle of the circuit (the game's water body: ~20,000 m², ~200 m from the old Curva do Lago's apex).
const LAKE={x:160,y:600};
// Shots: orbit (round a place), ride (behind the ghost Opala), along (down a stretch), fly (from, to, looking at), top
// (from above, north up unless a says otherwise). Places: 'new:<name>' on today's lap, 'old:<name>' on the 1940 one.
// image: a picture of historia-midia.js beside Stevan, the presenter; card: a link shown as a "saiba mais" card.
// dur (seconds at the voice's own rate, divided by PACE like the rest): the rides on the old layout are given room so
// the ghost Opala keeps near 340 km/h; the voice ends first and the music comes up while it runs.
export const HISTORY={
 id:'interlagos',title:'A história de Interlagos',translations:{en:EN},
 places:{new:{'Linha':0,'Reta dos boxes':120,'Fim da reta':250,'S do Senna':400,'T1':353,'T2':447,'Curva do Sol':620,'Reta Oposta':1000,'Fim da Reta Oposta':1330,
  'Descida do Lago':1530,'T4':1417,'T5':1642,'Subida para a Ferradura':1840,'Ferradura':2060,'Laranjinha':2160,'Esse':2337,'Pinheirinho':2480,'Bico de Pato':2760,'Mergulho':2950,
  'Junção':3260,'Subida dos Boxes':3620,'Café':3545,'Arquibancadas':3800,'Lago':LAKE},
  // The old Curva do Laranja: the blind right at the top of the climb from the Sargento (old s 5525-5775), cut in 1990.
  old:{'Curva do Laranja':5640,'Lago':LAKE},
  // The ring's link is the Junção that closed the short lap (user, 10-21).
  anel:{'Junção':128}},
 // Where a corner's label sits when its place (where a ride starts or ends) is not its middle: the middle of the bend
 // from the track's own curvature (user, 10-26). Old: the S is the sharp right whose apex is today's Esse (old s =
 // today's + 3600 there), the Cotovelo the right hairpin 6328-6382 (today's Bico de Pato), the Mergulho the left bend
 // 6480-6652 (the places sat on the straights before them); today's Mergulho, the bend 2880-3054.
 labelAt:{old:{'Curva do S':5937,'Cotovelo':6355,'Mergulho':6566},new:{'Mergulho':2967}},
 // The outer ring's link: the north straight ran on, straight, into the old Junção (the short configuration's lap;
 // the full lap turned off it at Turn 4). Both ends point the same way: one long straight.
 paths:{anel:{points:[[184,746],[60,725],[-67,703]]},
  // Miss the Mergulho and go straight on (user, 10-21): the exit's tangent leads to the lake's south-west tip, 224 m on;
  // down the grass, off the bank (22.8 m) in a short flight, into the water (16.65 m) and under it.
  mergulhoErro:{points:[[-218.5,418.5],[-192.1,404.3],[-162.6,399.9],[-125,409],[-49.8,436.2],[25.4,463.4],[40.4,468.8],
   [48,471.6,23],[55.5,474.3,22.9],[63,477,22.3],[70.5,479.7,21.2],[78,482.4,19.7],[85.6,485.2,17.9],[93.1,487.9,16.3],[100.6,490.6,15.6],[108.1,493.3,15.35]]}},
 layers:{
  new:{path:'new',color:'#eef4ff',width:6,opacity:.75,glow:1.3},
  kept:{path:'new',status:'mantido',color:'#6be38b',width:11,glow:1.9},
  novas:{path:'new',ranges:NEW_PIECES.map(p=>[`new:${p.current_from_s}`,`new:${p.current_to_s}`]),color:'#ffd23f',width:13,glow:2.4,pulse:.5},
  // The same three pieces alone, in the new track's blue (user, 10-21: "mostra apenas os novos em azul").
  novasAzul:{path:'new',ranges:NEW_PIECES.map(p=>[`new:${p.current_from_s}`,`new:${p.current_to_s}`]),color:'#46a8ff',width:14,glow:2.6,pulse:.5},
  old:{path:'old',color:'#ff6a00',width:10,minWidth:.0065,opacity:1,dash:34,glow:2.9},
  cut:{path:'old',status:'cortado',color:'#ff5a36',width:11,pulse:1,glow:2.2},
  reversed:{path:'new',status:'invertido',color:'#46a8ff',width:12,glow:2},
  straights:{path:'new',ranges:[['new:3800','new:Fim da reta'],['new:720','new:Fim da Reta Oposta']],color:'#ffe066',width:12,glow:2},
  senna:{path:'new',ranges:[['new:Fim da reta','new:520']],color:'#ffd23f',width:14,glow:2.6,pulse:.5},
  retao:{path:'old',ranges:[['old:Retão','old:Curva 3']],color:'#ff9a3c',width:12,glow:2},
  // The fast ring in a deep blue: yellow sank into the old chapters' sepia over the beige ground (user, 10-21); deep,
  // opaque and with little glow, or the sepia and the bloom wash it pastel.
  anelExterno:{path:'old',ranges:[['old:7010','old:1990']],color:'#0a5cff',width:16,minWidth:.01,glow:1.25,pulse:.3,opacity:1},
  anelExternoLink:{path:'anel',color:'#0a5cff',width:16,minWidth:.01,glow:1.25,pulse:.3,opacity:1},
  // The old Junção's short straight, the piece that closed the ring, always in green (the user's drawing, 10-21).
  juncaoAnel:{path:'anel',color:'#12d63a',width:17,minWidth:.011,glow:1.25,pulse:.5,opacity:1},
  miolo:{path:'old',ranges:[['old:Curva 4','old:3606']],color:'#f4dba6',width:14,minWidth:.013,glow:1.5,pulse:.4,opacity:.85},
  laranjaAntiga:{path:'old',ranges:[['old:5250','old:5800']],color:'#ff6a00',width:10,minWidth:.0065,opacity:1,dash:34,glow:2.9},
  // The low winter sun the old Curva do Sol pointed at (its exit faces ~297°; São Paulo's sun sets between ~244° and
  // ~296° through the year).
  // A little higher than a real sunset's last minutes, so it shines in open sky over the pits and the hill (user, 10-21).
  sol:{sun:true,azimuth:292,elevation:15,size:6.5},
  ferradura:{decal:'horseshoe',path:'old',ranges:[['old:2716','old:2986']],width:17,up:73,margin:60,opacity:1},
  // Seen with the bill pointing right (up 234°), the whole stretch is the duck: the neck runs down along the track
  // leaving for the Mergulho (user, 10-21).
  // A cartoon duck the track draws when the top of the shot points south-west (232°; user, 10-21: "pato de desenho
  // animado com topete"): head = Ferradura–Laranjinha–Esse loop (the Esse's notch is the brow over the bill), bill = the
  // whole corner from the end of the Pinheirinho to the Mergulho, neck = the climb to the Ferradura behind and the run
  // down from the Mergulho in front; eye, tuft, body, wing, legs and feet are drawn in that view (metres right/up).
  pato:{decal:'duck',path:'new',ranges:[['new:1650','new:3100']],up:232,margin:40,px:2048,opacity:1,figure:{
   back:[1650,2600],bill:[2600,2900],front:[2900,3100],line:8,eye:[314,54,15],billGrow:1.15,billBack:48,
   track:{width:12,color:'rgba(38,44,52,.62)'},
   tuft:{base:[262,196],tips:[[200,282],[248,312],[300,290]],width:22},
   body:[[205,-250],[40,-196],[80,-290],[165,-420],[315,-472],[475,-440],[548,-360],[520,-295]],
   wing:[[165,-295],[300,-310],[445,-365],[340,-420],[205,-395]],wingLines:[[[230,-340],[350,-365],[420,-378]],[[220,-370],[330,-395],[390,-405]]],
   legs:[[[285,-455],[280,-520]],[[392,-448],[398,-515]]],foot:[[-12,6],[52,-10],[44,2],[60,8],[42,16],[-8,16]],
   extent:[[20,330,620,-545]]}},
  mergulhoReto:{arrows:true,path:'mergulhoErro',ranges:[['mergulhoErro:100','mergulhoErro:322',1]],color:'#ff4a2e',spacing:20,speed:30},
  arrowsOld:{arrows:true,path:'new',ranges:[['new:1480','new:520',-1]],color:'#ff9a3c',spacing:60,speed:26},
  arrowsNew:{arrows:true,path:'new',ranges:[['new:520','new:1480',1]],color:'#46a8ff',spacing:60,speed:26},
 },
 chapters:[
  {id:'abertura',title:'Abertura',years:'AUTÓDROMO JOSÉ CARLOS PACE',era:'novo',links:linksFor('abertura'),lines:[
   {title:{eyebrow:'AUTO-POBRE RACING APRESENTA',title:'A história de Interlagos',sub:'Autódromo José Carlos Pace · São Paulo'},
    text:'Esta é Interlagos. Mas a pista que você conhece corre por cima de outra, mais antiga e quase duas vezes maior.',
    shot:{orbit:{at:CENTER,r:1150,h:520,from:200,to:236},fov:40},show:['new']},
   {text:'Nesta história, a gente vai encontrar essa pista escondida e descobrir de onde vêm os nomes das curvas.',presenter:true,card:'turismo-80-anos'},
  ]},
  {id:'antes',title:'Antes do autódromo',years:'1926 – 1936',era:'antigo',links:linksFor('antes'),lines:[
   {text:'Nos anos 1920, o engenheiro britânico Louis Romero Sanson planejou um bairro entre duas represas do sul de São Paulo: a Guarapiranga e a Billings.',
    shot:{top:{at:MAP,h:1150,h2:1000,a:90,a2:100,tilt:28},fov:52},show:[]},
   {text:'Seria um bairro de lazer, com hotel, casas e até uma praia artificial, com areia trazida de Santos.'},
   {text:'O urbanista francês Alfred Agache achou a paisagem parecida com a de Interlaken, na Suíça, a cidade entre lagos. Daí veio o nome: Interlagos.',
    shot:{orbit:{at:CENTER,r:900,h:380,from:150,to:120},fov:44}},
   {text:'A crise de 1929 e a Revolução de 1932 travaram o bairro. Mas uma parte do plano ia sair do papel: a pista.'},
   {text:'Enquanto isso, São Paulo corria nas ruas. Em 1936, o Grande Prêmio Cidade de São Paulo usou um circuito no Jardim América.',
    shot:{fly:{from:{at:'new:Linha',h:140,r:260,a:200},to:{at:'new:Linha',h:110,r:200,a:205},look:{at:{x:-600,y:4000},h:0}},fov:46},image:'planta1936',card:'motorsport-1936'},
   {text:'Entre os astros estavam a francesa Hellé Nice e o brasileiro Manoel de Teffé.',image:'pilotos1936',card:'motorsport-helle-nice'},
   {text:'A corrida terminou em tragédia: o carro de Hellé Nice rodou e atingiu o público. Pelo menos cinco pessoas morreram.',image:'hellenice1936'},
   {text:'O acidente reforçou a ideia de correr num circuito fechado, longe das calçadas. E o lugar já estava escolhido.',
    shot:{orbit:{at:CENTER,r:950,h:420,from:120,to:95},fov:44}},
  ]},
  {id:'inauguracao',title:'A inauguração',years:'1938 – 1940',era:'antigo',links:linksFor('inauguracao'),lines:[
   {text:'As obras começaram em 1938. Em 12 de maio de 1940, umas quinze mil pessoas vieram ver a inauguração.',
    shot:{along:{path:'new',from:'3860',to:'Linha',h:2.4,back:0,side:-8,ahead:90,lookH:1.5},fov:46}},
   {text:'A pista estava inacabada: não havia arquibancadas nem boxes. A entrada era uma porteira de madeira, e tudo era cercado de arame farpado.'},
   {text:'Arthur Nascimento Júnior venceu o Grande Prêmio de inauguração, com um Alfa Romeo. Em segundo chegou Chico Landi. Guarde esse nome: ele volta mais adiante.',
    shot:{orbit:{at:'new:Linha',r:90,h:28,from:250,to:300},fov:42},image:'nascimento'},
  ]},
  {id:'oito-km',title:'O circuito de oito quilômetros',years:'1940 – 1989',era:'antigo',links:linksFor('oito-km'),lines:[
   {text:'O circuito de 1940 tinha quase oito quilômetros, sempre no sentido anti-horário, dentro de uma bacia natural. Da arquibancada se via quase a pista inteira.',
    shot:{top:{at:MAP,h:1000,a:90,tilt:10},fov:50},show:['old'],reveal:'old',labels:[],card:'flatout-tracados'},
   // The period map is the guide to every corner, so it comes before the lap, not over it (user, 10-21).
   {text:'Este é o mapa da época, com as curvas numeradas: da Curva 1, no fim da reta, até as Arquibancadas. Agora, vamos dar uma volta nele.',image:'mapa1940',dur:13},
   {text:'A volta começava na mesma reta de hoje. Mas, no fim dela, o piloto não freava para um S: seguia para a Curva 1, uma esquerda larga e rápida.',
    shot:{ride:{path:'old',from:'-400',to:'Curva 1',h:5,back:16,ahead:40},fov:52},labels:['old:Curva 1'],card:'projetomotor-antigo-novo',dur:16},
   {text:'As Curvas 1 e 2 eram quase um raio só. Em 1973, a Lotus de Emerson Fittipaldi passava ali a mais de 290 quilômetros por hora.',
    shot:{ride:{path:'old',from:'Curva 1',to:'Retão',h:7,back:18,ahead:50},fov:52},labels:['old:Curva 1','old:Curva 2']},
   {text:'Depois vinha o Retão, em descida, a parte mais rápida do circuito: no fim dele, 318 quilômetros por hora.',
    shot:{ride:{path:'old',from:'Retão',to:'1500',h:4,back:12,ahead:60},fov:56},labels:['old:Retão'],dur:20},
   // Still on the straight with the corner coming (user, 10-21): seeing it arrive, you work out what happens if you don't turn.
   {text:'No fim do Retão, a Curva 3, fechada, com o muro do perímetro logo depois. Quem errava ali, batia.',
    shot:{ride:{path:'old',from:'1500',to:'1960',h:6,back:16,ahead:120,lookH:-1},fov:50},labels:['old:Curva 3','old:Curva 4'],dur:17},
   // The miolo is the middle, like a loaf's (user, 10-21): Curva 4 → Ferradura → Curva do Lago, inside the ring. Only
   // this stretch is called miolo; the twisty Laranja–Mergulho run is "o trecho travado".
   {text:'Aí a pista entrava no miolo. Miolo como o do pão: a parte do meio, bem no centro do autódromo.',
    shot:{top:{at:MAP,h:1000,a:90,tilt:10},fov:50},car:null,show:['old','miolo'],labels:['old:Ferradura','old:Curva do Lago'],
    legend:[{layer:'miolo',text:'O miolo'},{layer:'old',text:'Traçado de 1940'}]},
   {text:'Primeiro a Curva 4, depois uma longa reta, quase de volta aos boxes, e a Ferradura, uma esquerda que dava mais de meia-volta.',
    shot:{ride:{path:'old',from:'Curva 4',to:'Ferradura',h:30,back:60,ahead:80},fov:50},labels:['old:Curva 4','old:Ferradura'],dur:16},
   // From high up, so the lake is seen right beside the corner (user, 10-21).
   {text:'Da Ferradura, a pista descia até o lago e subia pela Curva do Lago. Repare como o lago fica pertinho dela.',
    shot:{fly:{from:{at:'old:2900',h:60,r:60,a:200},to:{at:{x:-60,y:180},h:230},look:{at:'old:3050'},look2:{at:{x:130,y:480}}},fov:50},
    car:{path:'old',from:'Ferradura',to:'3606'},labels:['old:Curva do Lago','old:Lago'],dur:13},
   {text:'A Reta Oposta era feita subindo, ao lado do Retão e no sentido contrário ao dele.',
    shot:{ride:{path:'old',from:'3606',to:'4000',h:6,back:16,ahead:50},fov:52},show:['old'],labels:['old:Reta Oposta'],dur:9},
   {text:'Lá no alto, a Curva do Sol, para a direita. No fim da tarde, o piloto saía dela com o sol poente bem nos olhos.',
    shot:{ride:{path:'old',from:'4000',to:'4500',h:4,back:14,ahead:50},fov:56},show:['old','sol'],labels:['old:Curva do Sol'],dur:16},
   {text:'Uma longa descida levava à Curva do Sargento. Conta a lenda que o nome vem de um sargento atropelado ali, mas ninguém achou registro disso.',
    shot:{ride:{path:'old',from:'4500',to:'Curva do Sargento',h:8,back:20,ahead:40},fov:52},show:['old'],labels:['old:Curva do Sargento'],dur:15},
   {text:'Depois, Laranja, um pequeno S, Pinheirinho, Cotovelo e Mergulho: um trecho travado que você ainda percorre hoje, quase igual.',
    shot:{ride:{path:'old',from:'Curva do Sargento',to:'Mergulho',h:40,back:60,ahead:40},fov:50},labels:['old:Curva do Laranja','old:Curva do S','old:Pinheirinho','old:Cotovelo'],dur:20},
   {text:'A Junção era onde esse trecho travado reencontrava o anel externo. Depois vinham o Café, a subida e a reta. Quase oito quilômetros numa volta.',
    shot:{ride:{path:'old',from:'Mergulho',to:'Café',h:8,back:20,ahead:50},fov:52},show:['old','juncaoAnel'],labels:['old:Junção','old:Café'],dur:16,
    legend:[{layer:'old',text:'Traçado de 1940'},{layer:'juncaoAnel',text:'A retinha da Junção'}]},
   {text:'Havia também uma versão curta, só com o anel externo: uns três quilômetros e duzentos metros de velocidade pura.',
    shot:{top:{at:MAP,h:1000,a:90,a2:84,tilt:16},fov:50},car:null,show:['anelExterno','anelExternoLink'],labelsOnly:['old:Curva 1','old:Curva 2','old:Retão','old:Curva 3','old:Junção','old:Café','old:Reta dos Boxes'],
    legend:[{layer:'anelExterno',text:'A volta rápida, de 3,2 km'}]},
   // The short straight from Turn 4 is the Junção that closes the fast ring (user, 10-21), lit up on its own.
   {text:'E repare nesta retinha que sai da Curva 4: essa é a famosa Junção. É ela que junta as pontas e fecha o anel rápido.',
    shot:{top:{at:{x:60,y:700},h:700,h2:640,a:84,tilt:14},fov:46},show:['anelExterno','juncaoAnel'],labelsOnly:['old:Curva 3','old:Curva 4','anel:Junção','old:Lago'],
    legend:[{layer:'anelExterno',text:'A volta rápida'},{layer:'juncaoAnel',text:'A retinha da Junção'}]},
  ]},
  {id:'mil-milhas-f1',title:'Mil Milhas e Fórmula 1',years:'1956 – 1980',era:'antigo',links:linksFor('mil-milhas-f1'),lines:[
   {text:'Em 1956 nasceram as Mil Milhas Brasileiras, criadas por Wilson Fittipaldi, o Barão, pai de Emerson, e por Eloy Gogliano. Uma prova que varava a noite.',
    shot:{orbit:{at:'new:Reta dos boxes',r:230,h:70,from:235,to:285},fov:44},show:['old'],presenter:true},
   {text:'E um detalhe que o nosso Opala adora: segundo a lista de vencedores, nos últimos anos do traçado longo, de 1984 a 1989, só deu Opala nas Mil Milhas.',
    shot:{ride:{path:'old',from:'Curva 2',to:'Curva 3',h:3.2,back:10,ahead:40},fov:58},car:{path:'old',from:'Curva 2',to:'Curva 3',plate:'OPALA'},image:'opala1988',dur:22},
   {text:'Em 1972, a Fórmula 1 veio para uma prova fora do campeonato. No ano seguinte, valendo pontos, Emerson Fittipaldi venceu o primeiro Grande Prêmio do Brasil.',
    shot:{orbit:{at:'new:Linha',r:70,h:16,from:300,to:250},fov:40},car:null,image:'emerson1976',card:'commons-brasil-hoje-1973'},
   {text:'Em 1975, José Carlos Pace, o Moco, venceu com Emerson em segundo: a primeira dobradinha brasileira da Fórmula 1. A torcida explodiu.',image:'pace',card:'reginaldo-pace-1975'},
   {text:'Foi a única vitória de Pace. Em março de 1977, ele morreu num acidente de avião. Em 1985, o autódromo ganhou o nome dele: Autódromo José Carlos Pace.',
    shot:{fly:{from:{at:'new:Reta dos boxes',h:40,r:160,a:250},to:{at:'new:Reta dos boxes',h:24,r:110,a:262},look:{at:'new:Reta dos boxes',h:6}},fov:40},image:'brabham1977'},
   {text:'Desde 2024, os restos de Pace estão aqui, atrás do busto dele, no Portão 7.',image:'paceBusto'},
   {text:'Mas a pista longa envelhecia. Em 1980, os pilotos quase boicotaram a corrida por causa das ondulações do asfalto. A Fórmula 1 foi para o Rio e só voltaria dez anos depois.',
    shot:{ride:{path:'old',from:'Retão',to:'Curva 3',h:2.2,back:8,ahead:50},fov:60},dur:20},
  ]},
  {id:'reforma',title:'Noventa dias para mudar tudo',years:'1989 – 1990',era:'novo',links:linksFor('reforma'),lines:[
   {text:'Em outubro de 1989, Piero Gancia, presidente da Confederação Brasileira de Automobilismo, ligou para a prefeita Luiza Erundina: a Fórmula 1 podia voltar para São Paulo.',
    shot:{orbit:{at:CENTER,r:1000,h:450,from:120,to:160},fov:42},car:null,show:['old'],image:'erundina',card:'ge-novo-tracado-1990'},
   {text:'Erundina contou depois: "Eu não gostava de corrida de automóvel, mas eu intuí que seria bom para São Paulo."',image:'erundina'},
   {text:'Só que a FIA pedia uma pista menor e mais segura. Em pouco mais de noventa dias, os quase oito quilômetros viraram quatro vírgula três.',
    shot:{top:{at:MAP,h:1000,a:90,tilt:8},fov:50},show:['old','new']},
   {text:'O administrador do autódromo, Chico Rosa, queria manter as Curvas 1 e 2. Bernie Ecclestone, o chefão da Fórmula 1, queria eliminá-las.',
    shot:{orbit:{at:'old:Curva 2',r:420,h:260,from:200,to:230},fov:46},labels:['old:Curva 1','old:Curva 2'],image:'mapaComparacao'},
   {text:'Saíram as Curvas 1 e 2, o Retão, as Curvas 3 e 4 e o Sargento. O Retão ainda existe: virou a pista auxiliar, de arrancada.',
    shot:{top:{at:MAP,h:1000,a:90,tilt:12},fov:50},show:['cut','new'],labels:['old:Curva 1','old:Curva 2','old:Retão','old:Curva 3','old:Curva 4','old:Curva do Sargento']},
   {text:'No lugar, só três pedaços novos: o S, a curva que leva da Ferradura à Laranjinha, e uma Junção refeita um pouco antes da antiga.',
    show:['novasAzul'],labelsOnly:['new:S do Senna','new:Ferradura','new:Junção']},
  ]},
  {id:'s-do-senna',title:'O S do Senna',years:'1990',era:'novo',links:linksFor('s-do-senna'),lines:[
   {text:'Sem a Curva 1, sobraram duas retas soltas: a dos boxes, lá no alto, e a Reta Oposta, uns vinte metros mais baixa e apontando para o lado contrário.',
    shot:{top:{at:{x:-170,y:60},h:720,a:90,tilt:18},fov:48},show:['straights','old'],labels:['new:Reta dos boxes','new:Reta Oposta','old:Curva 1'],
    legend:[{layer:'old',text:'Pista antiga, de 1940'},{layer:'straights',text:'As duas retas que sobraram'}]},
   {text:'Quem deu a ideia foi Ayrton Senna: um S em descida, ligando o fim da reta dos boxes à Curva do Sol.',
    shot:{orbit:{at:'new:S do Senna',r:300,h:170,from:205,to:245},fov:44},show:['straights','senna'],reveal:'senna',labels:['new:S do Senna'],card:'espn-s-do-senna'},
   {text:'Repare: a entrada da Curva do Sol fica deslocada para o lado. Para chegar nela, o carro vira à esquerda, depois à direita, e desce uns quatorze metros. Um S liga duas retas desencontradas.',
    shot:{ride:{path:'new',from:'Fim da reta',to:'Curva do Sol',h:4.5,back:14,ahead:30},fov:54},car:{path:'new',from:'Fim da reta',to:'Curva do Sol',plate:'1990'}},
   {text:'Senna não gostou do que foi construído: "Eu queria um esse de alta velocidade… em quarta marcha… Não era chegar aqui e parar."',
    say:'Senna não gostou do que foi construído. Ele disse: eu queria um esse de alta velocidade, em quarta marcha. Não era chegar aqui e parar.',
    shot:{fly:{from:{at:'new:T2',h:6,r:45,a:160},to:{at:'new:T2',h:5,r:38,a:130},look:{at:'new:T1',h:1}},fov:40},car:null,show:['senna'],image:'sDoSenna'},
   {text:'E nem queria o próprio nome na curva. Sugeriu "Curva Chico Landi", o segundo colocado de 1940, que tinha morrido em 1989. Perdeu: ficou S do Senna.',
    say:'E nem queria o próprio nome na curva. Sugeriu Curva Chico Landi, o segundo colocado de 1940, que tinha morrido em 1989. Perdeu: ficou S do Senna.',presenter:true},
   {text:'Em março de 1990, Senna fez a pole na pista que ajudou a desenhar e liderava a corrida até bater num retardatário. Alain Prost venceu.',
    shot:{orbit:{at:'new:Linha',r:110,h:30,from:280,to:235},fov:42},show:[],labels:[]},
  ]},
  {id:'contramao',title:'A pista ao contrário',years:'1940 × 1990',era:'novo',links:linksFor('contramao'),lines:[
   {text:'Agora a parte mais curiosa: da Curva do Sol até o lago, a pista nova corre na contramão da antiga.',
    shot:{top:{at:{x:-10,y:0},h:720,a:90,tilt:18},fov:48},show:['reversed'],labels:['new:Curva do Sol','new:Descida do Lago']},
   {text:'A Curva do Sol era para a direita e hoje é para a esquerda. Por isso, no fim da tarde, o sol que deu nome a ela fica nas costas do piloto.',
    shot:{orbit:{at:'new:Curva do Sol',r:240,h:110,from:300,to:255},fov:44},show:['reversed','arrowsOld'],labels:['new:Curva do Sol']},
   {text:'A Reta Oposta era subida e hoje é descida. E a velha Subida do Lago virou Descida do Lago.',
    shot:{ride:{path:'new',from:'Reta Oposta',to:'Descida do Lago',h:6,back:16,ahead:60},fov:54},car:null,show:['reversed','arrowsNew'],labels:['new:Descida do Lago'],dur:12},
   {text:'E repare no nome: a Reta Oposta corria ao lado do Retão, no sentido contrário ao dele. O Retão sumiu, e hoje ela corre justamente para o lado em que o Retão corria. Ficou o nome.',
    shot:{fly:{from:{at:'new:760',h:150,r:260,a:190},to:{at:'new:900',h:130,r:240,a:200},look:{at:'new:1250',h:0}},fov:46},show:['reversed','retao','arrowsNew'],labels:['old:Retão','new:Reta Oposta']},
   {text:'Somando tudo, pelas nossas contas: mais de um terço da volta de hoje é a pista de 1940 percorrida de trás para frente.',
    shot:{top:{at:MAP,h:1000,a:90,tilt:12},fov:50},show:['reversed','old'],labels:[],
    legend:[{layer:'reversed',text:'1940, hoje ao contrário'},{layer:'old',text:'Traçado de 1940'}]},
   // The colour key with each part's year (user, 10-21).
   {text:'Uns cinquenta por cento são o asfalto de 1940 no mesmo sentido. E só um oitavo da volta foi construído em 1990.',
    show:['reversed','kept','novas'],
    legend:[{layer:'kept',text:'1940, no mesmo sentido'},{layer:'reversed',text:'1940, hoje ao contrário'},{layer:'novas',text:'1990, construído novo'}]},
  ]},
  {id:'nomes',title:'Os nomes das curvas',years:'DA DESCIDA DO LAGO À RETA',era:'novo',links:linksFor('nomes'),lines:[
   {text:'Descida do Lago: o lago existe mesmo. Fica dentro do autódromo, tem duas nascentes, e a água dele lava a pista no dia do Grande Prêmio.',
    shot:{orbit:{at:'new:T5',r:200,h:70,from:110,to:70},fov:44},show:['new'],labels:['new:Descida do Lago','new:Lago'],image:'satelite2018'},
   {text:'Ferradura: olhe de cima e veja o U, a forma de uma ferradura. A de hoje guarda só a ponta da antiga, percorrida ao contrário; o resto do laço ainda está lá, na pista auxiliar.',
    shot:{top:{at:{x:-250,y:128},h:330,h2:300,a:73,tilt:5},fov:46},show:['new','ferradura'],labels:['new:Ferradura']},
   {text:'Laranjinha vem de "Curva do Laranja". Laranja era a gíria para o piloto que não tinha coragem de fazer a curva de pé embaixo. Nunca houve pé de laranja ali.',
    say:'Laranjinha vem de Curva do Laranja. Laranja era a gíria para o piloto que não tinha coragem de fazer a curva de pé embaixo. Nunca houve pé de laranja ali.',
    shot:{top:{at:{x:-280,y:140},h:420,h2:380,a:90,tilt:8},fov:46},show:['new','laranjaAntiga'],labels:['old:Curva do Laranja','new:Ferradura','new:Laranjinha']},
   {text:'No traçado antigo, ela era uma direita cega, no alto da subida que vinha do Sargento. Era ali que o laranja tirava o pé. Essa curva sumiu em 1990.',
    shot:{ride:{path:'old',from:'5300',to:'5800',h:4,back:12,ahead:40},fov:54},car:{path:'old',from:'5300',to:'5800',plate:'1940'},labels:['old:Curva do Laranja'],dur:14},
   {text:'Num mapa da pista de 1990, a Laranjinha fica logo na saída da Ferradura, e a curva fechada seguinte se chama Esse. Hoje, muita gente chama essa curva fechada de Laranjinha.',
    shot:{orbit:{at:'new:Esse',r:130,h:50,from:200,to:250},fov:44},car:null,show:['new'],labels:['new:Laranjinha','new:Esse','new:Pinheirinho']},
   {text:'No Pinheirinho, havia mesmo um par de pinheiros.',shot:{orbit:{at:'new:Pinheirinho',r:90,h:30,from:120,to:160},fov:44},labels:['new:Pinheirinho']},
   {text:'O Bico de Pato se chamava Cotovelo. Olhe de cima e use a imaginação: a pista desenha a cabeça de um pato, e esta curva inteira é o bico. E é a curva mais lenta da pista.',
    shot:{top:{at:{x:-65,y:355},h:1540,h2:1480,a:232,tilt:3},fov:44},show:['new','pato'],labelsOnly:[],
    // The duck fades from the middle of the line on, so the circuit shows through and it is seen sitting on the track.
    dim:{pato:[.45,.9,.18]}},
   {text:'No Mergulho, o carro mergulha na descida, apontando para o lago, que fica escondido lá na frente.',
    shot:{along:{path:'new',from:'2830',to:'3060',h:3,back:10,ahead:70,lookH:-2},fov:52},show:['new'],labels:['new:Mergulho']},
   {text:'E se o piloto errar a curva e seguir reto... o mergulho acaba no lago!',
    // From up high: low down, the trees on the bank hide the car and the splash.
    shot:{fly:{from:{at:{x:-140,y:355},h:45},to:{at:{x:20,y:420},h:50},look:{at:{x:-70,y:432}},look2:{at:{x:92,y:487}}},fov:52},
    car:{path:'mergulhoErro',from:'100',to:'346',plate:'OPALA',splash:16.65,until:.62},show:['new','mergulhoReto'],labels:['new:Lago'],dur:15},
   {text:'A Junção não junta mais nada. Era onde o trecho travado reencontrava o anel externo, que já não existe. A curva de hoje foi refeita em 1990, um pouco antes da antiga.',
    shot:{orbit:{at:'new:Junção',r:190,h:80,from:150,to:200},fov:44},car:null,show:['new','old','juncaoAnel'],labels:['new:Junção','old:Junção','old:Curva 4'],
    legend:[{layer:'new',text:'Pista de hoje'},{layer:'old',text:'Traçado de 1940'},{layer:'juncaoAnel',text:'A retinha da Junção'}]},
   {text:'Depois, a Subida dos Boxes, uma rampa de uns dez por cento até a reta.',
    shot:{along:{path:'new',from:'3290',to:'3620',h:3.5,back:12,ahead:60},fov:54},show:['new'],labels:['new:Subida dos Boxes']},
   {text:'E o Café? Não há explicação oficial. A versão mais contada é que, com a volta de oito quilômetros, os fotógrafos tinham tempo de tomar um cafezinho antes de os carros voltarem.',
    shot:{orbit:{at:'new:Café',r:130,h:45,from:60,to:100},fov:44},labels:['new:Café']},
   {text:'É também uma curva perigosa. Rafael Sperafico, em 2007, e Gustavo Sondermann, em 2011, morreram aqui. Depois disso, ela ganhou uma área de escape maior.'},
   {text:'E a reta dos boxes, desde 2010, também se chama Reta Emerson Fittipaldi.',
    shot:{along:{path:'new',from:'3820',to:'4200',h:6,back:0,side:14,ahead:70},fov:48},labels:['new:Reta dos boxes'],image:'reta2006'},
  ]},
  {id:'hoje',title:'A pista de hoje',years:'1990 – 2026',era:'novo',links:linksFor('hoje'),lines:[
   {text:'Em 1991, Senna enfim venceu em casa, terminando a corrida só com a sexta marcha. Em 1993 venceu de novo, e a torcida invadiu a pista.',
    shot:{orbit:{at:'new:Linha',r:80,h:22,from:240,to:290},fov:42},labels:[],image:'senna1993',card:'f1-senna-1991'},
   {text:'Em 2008, na última volta, Lewis Hamilton passou Timo Glock na Junção e tirou o título de Felipe Massa por um ponto.',
    shot:{orbit:{at:'new:Junção',r:140,h:45,from:210,to:250},fov:44},labels:['new:Junção'],image:'hamilton2008',card:'f1-hamilton-2008'},
   {text:'Em 2021, Hamilton passou Verstappen na Descida do Lago e comemorou com a bandeira do Brasil.',
    shot:{orbit:{at:'new:T4',r:170,h:55,from:250,to:290},fov:44},labels:['new:Descida do Lago'],card:'f1-hamilton-2021'},
   {text:'Desde 1940, a pista encolheu pela metade e passou a correr ao contrário em mais de um terço da volta. Mas os nomes ficaram, e guardam a pista antiga.',
    shot:{orbit:{at:CENTER,r:1150,h:540,from:236,to:270},fov:40},show:['old','new'],labels:[],image:'drone2025'},
   {title:{eyebrow:'FIM',title:'Interlagos',sub:'Vídeos e matérias para saber mais: no botão de capítulos'},
    text:'Agora é a sua vez: pega o Opala e procura os fantasmas de 1940 na sua volta.'},
  ]},
 ],
};
