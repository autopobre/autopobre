// Who pays for race day: fictional businesses from the game's own world, painted on the rail banners
// (trackside.js) and the billboards (track-surface.js). The national ones turn up at every circuit,
// the local ones belong to their city, so each track shows its own mix and accent. Plain data and
// canvas painters (no DOM until a painter is called), so the Node checks can read the lists.
// Every name must read as an obvious joke (Pastel da Feira, Retífica do Zé), never as a business that
// could exist (a place name plus a trade), no radio stations (they read as real ones), and nothing carries
// a phone number: the user asked for that (2026-10-05) because a made-up number can be somebody's real one.

// id: [words on the banner, short word, background, text, accent, icon, layout, tagline, region]
// The real Opala 99's own sponsors stay on the car only (its livery), never on banners or boards (user, 2026-10-05).
// real: a real name (the Old Stock category itself): no tagline and no joke line, just the name.
const S=(words,short,bg,fg,accent,icon,style,tag,region='br',real=false)=>({words,short,bg,fg,accent,icon,style,tag,region,real});
export const SPONSORS=Object.freeze({
 autopobre:S('AUTO-POBRE RACING','AUTO-POBRE','#b3161d','#f6f1e4','#f0c419','flag','stripe','Corrida de verdade, orçamento de mentira'),
 oldstock:S('OLD STOCK · {CIRCUIT}','OLD STOCK','#12351f','#f0c419','#f6f1e4','chequer','stripe','','br',true),
 posto99:S('POSTO 99 · ADITIVADA','POSTO 99','#1b2a4a','#f6f1e4','#e8702a','drop','badge','Gasolina aditivada · aberto 24 h'),
 tia:S('LANCHONETE DA TIA','DA TIA','#f6f1e4','#b3161d','#1b2a4a','cup','script','Pastel, café e pão de queijo'),
 retifica:S('RETÍFICA DO ZÉ','ZÉ','#1a1a1a','#e8702a','#f6f1e4','piston','stripe','Motor novo de novo'),
 blazer:S('OFICINA DA BLAZER','BLAZER','#e8702a','#1a1a1a','#f6f1e4','wrench','badge','Funilaria · pintura · mecânica'),
 pulapula:S('AMORTECEDORES PULA-PULA','PULA-PULA','#222831','#ffd23f','#e94f37','spring','repeat','Aguenta qualquer zebra'),
 pegaprimeira:S('VELAS PEGA DE PRIMEIRA','PEGA!','#ffd23f','#1a1a1a','#d62828','bolt','repeat','Ou a gente empurra'),
 oleovo:S('ÓLEO GROSSO DO VÔ','DO VÔ','#0b3d2e','#f2c14e','#f6f1e4','drop','stripe','Grosso que nem mel'),
 semtranco:S('BATERIAS SEM TRANCO','SEM TRANCO','#ef7d00','#ffffff','#1a1a1a','battery','badge','Partida garantida no frio'),
 // São Paulo (Interlagos, Piracicaba).
 redondinho:S('PNEU REDONDINHO · RECAPAGEM','REDONDINHO','#f0c419','#1a1a1a','#b3161d','tyre','stripe','Recapagem com fé','sp'),
 pecapeca:S('AUTO PEÇAS PEÇA-PEÇA','PEÇA-PEÇA','#13315c','#ffffff','#f2a900','gear','split','Se não tem, a gente inventa','sp'),
 feira:S('PASTEL DA FEIRA','PASTEL','#f7c873','#7a1f12','#2d6a4f','star','script','Quentinho desde 1978','sp'),
 bigode:S('BORRACHARIA DO BIGODE','BIGODE','#111111','#f5f5f5','#e63946','tyre','repeat','Remendo na hora','sp'),
 acordavizinho:S('ESCAPAMENTOS ACORDA-VIZINHO','ACORDA','#2b2d42','#edf2f4','#ef233c','flame','split','Ronco alto, vizinho bravo','sp'),
 guincho:S('GUINCHO QUEBROU-LIGOU','GUINCHO','#5a189a','#ffffff','#ffd60a','car','badge','Chega antes do mecânico','sp'),
 pamonha:S('PAMONHA DO CARRO DE SOM','PAMONHA','#2b9348','#fefae0','#ffd60a','star','script','O puro creme do milho','pira'),
 garapa:S('ETANOL GARAPA','GARAPA','#55a630','#ffffff','#1b4332','drop','split','Da moenda pro tanque','pira'),
 // Paraná (Cascavel).
 plantoucolheu:S('COOPERATIVA PLANTOU-COLHEU','PLANTOU','#2d6a4f','#ffffff','#f4a261','leaf','split','Do campo pra cidade','pr'),
 devagar:S('TRATORES DEVAGAR E SEMPRE','DEVAGAR','#d00000','#ffffff','#1a1a1a','gear','stripe','Força no campo','pr'),
 espeto:S('CHURRASCARIA ESPETO CORRIDO','ESPETO','#3d0c02','#ffba08','#ffffff','flame','badge','Rodízio até a bandeirada','pr'),
 cuiacheia:S('ERVA-MATE CUIA CHEIA','CUIA CHEIA','#386641','#f2e8cf','#bc4749','leaf','script','Chimarrão de respeito','pr'),
 achatudo:S('PEÇAS ACHA-TUDO','ACHA-TUDO','#023e8a','#ffffff','#ffb703','wrench','repeat','Entrega no mesmo dia','pr'),
 friorachar:S('SORVETERIA FRIO DE RACHAR','PICOLÉ','#7209b7','#ffffff','#4cc9f0','star','badge','Picolé até no inverno','pr'),
 // Santa Catarina (Chapecó).
 frangocorrida:S('FRANGO DE CORRIDA ALIMENTOS','FRANGO','#e85d04','#ffffff','#370617','star','split','Do galinheiro pro pódio','sc'),
 lascafina:S('MADEIREIRA LASCA FINA','LASCA FINA','#7f5539','#ede0d4','#2b2d42','leaf','stripe','Madeira certificada','sc'),
 retoqueso:S('ALINHAMENTO RETO QUE SÓ','RETO','#0077b6','#ffffff','#ffd166','tyre','badge','Alinhamento e balanceamento','sc'),
 buraco:S('QUEIJARIA BURACO NO QUEIJO','BURACO','#fefae0','#283618','#bc6c25','star','script','Queijo colonial','sc'),
 chegalogo:S('TRANSPORTADORA CHEGA LOGO','CHEGA LOGO','#14213d','#fca311','#ffffff','car','repeat','Carga segura no prazo','sc'),
 sonodepedra:S('COLCHÕES SONO DE PEDRA','SONO','#3a0ca3','#ffffff','#f72585','star','badge','Dorme até a bandeirada','sc'),
 // Distrito Federal (Brasília).
 poeira:S('PNEUS POEIRA VERMELHA','POEIRA','#bc6c25','#fefae0','#283618','tyre','stripe','Rodando desde 1972','df'),
 tesourinha:S('AUTO PEÇAS TESOURINHA','TESOURINHA','#1d3557','#f1faee','#e63946','gear','split','Tudo pro seu carro','df'),
 brilhamuito:S('LAVA-RÁPIDO BRILHA MUITO','BRILHA','#00b4d8','#03045e','#ffffff','drop','repeat','Brilho de carro novo','df'),
 quadradinho:S('PÃO DE QUEIJO DO QUADRADINHO','QUADRADINHO','#ffb703','#3d2b1f','#fb8500','cup','script','Fornada a cada 15 minutos','df'),
 parcela:S('CONSÓRCIO PARCELA INFINITA','PARCELA','#2a9d8f','#ffffff','#e9c46a','car','badge','Seu carro em 600 meses','df'),
 supino:S('ACADEMIA SUPINO NO EIXO','SUPINO','#9d0208','#ffffff','#ffba08','bolt','badge','Força na reta','df'),
 // Goiás (Goiânia).
 trembao:S('PAMONHARIA TREM BÃO','TREM BÃO','#2b9348','#fefae0','#ffd60a','star','script','Doce, salgada e de queijo','go'),
 pequi:S('PEQUI SEM ESPINHO','PEQUI','#ffd60a','#1b4332','#d00000','leaf','split','Pode morder sem medo','go'),
 tratorzao:S('TRATORZÃO DO AGRO','TRATORZÃO','#55a630','#ffffff','#1a1a1a','gear','stripe','Plantadeira e trator','go'),
 eotrem:S('AUTO PEÇAS É O TREM','É O TREM','#03045e','#ffffff','#ffb703','wrench','repeat','Peça boa, preço justo','go'),
 fumace:S('DIESEL FUMACÊ','FUMACÊ','#212529','#ffc300','#ffffff','piston','badge','Bomba injetora e turbo','go'),
 picolepequi:S('SORVETE DE PEQUI','CORAGEM','#6a040f','#ffd60a','#ffffff','star','badge','Só pra quem tem coragem','go'),
 // Minas Gerais (Curvelo).
 vofia:S('PÃO DE QUEIJO DA VÓ FIA','VÓ FIA','#ffb703','#3d2b1f','#e63946','cup','script','Receita da vó','mg'),
 tonho:S('QUEIJO MEIA-CURA DO TONHO','TONHO','#fefae0','#5c3d2e','#2d6a4f','star','split','Curado no capricho','mg'),
 uaiso:S('TRANSPORTES UAI SÔ','UAI SÔ','#14213d','#fca311','#ffffff','car','stripe','Do sertão pro Brasil','mg'),
 tiao:S('FERRO-VELHO DO TIÃO','TIÃO','#9d0208','#ffffff','#ffba08','wrench','repeat','Tem peça de tudo que é carro','mg'),
 brilhabrilha:S('CRISTAIS BRILHA-BRILHA','CRISTAL','#4cc9f0','#03045e','#ffffff','star','badge','Lapidação artesanal','mg'),
 soumpoquim:S('DOCE DE LEITE SÓ UM POQUIM','POQUIM','#3c096c','#ffffff','#ff9e00','cup','badge','Ninguém come um só','mg'),
 // Mato Grosso (Chapada dos Sonhos): the abyss beside the track is the joke of half of them.
 descela:S('GUINCHO DESCE-LÁ-EMBAIXO','DESCE-LÁ','#1b4332','#ffd60a','#ffffff','car','badge','Busca carro no fundo do vale','mt'),
 voltapracima:S('CORDAS VOLTA-PRA-CIMA','VOLTA','#bc6c25','#fefae0','#283618','spring','stripe','Caiu? A gente puxa','mt'),
 segurapeao:S('FREIOS SEGURA PEÃO','SEGURA PEÃO','#5a189a','#ffffff','#ffd60a','tyre','split','Para antes da beirada','mt'),
 ventania:S('BONÉS SEGURA-VENTANIA','VENTANIA','#0077b6','#ffffff','#ffd166','star','repeat','Não voa do mirante','mt'),
 mariaisabel:S('MARIA-ISABEL DO CUMPADI','CUMPADI','#ffb703','#3d2b1f','#9d0208','cup','script','Arroz com carne-seca na hora','mt'),
 suador:S('VENTILADOR SUADOR','SUADOR','#e85d04','#ffffff','#03045e','bolt','badge','Para o calor de 40 graus','mt'),
 // The Island (Floripa's street circuit): the sea under the bridges, the south wind and the local talk.
 tiradomar:S('GUINCHO TIRA-DO-MAR','TIRA-DO-MAR','#023e8a','#ffffff','#ffd60a','car','badge','Caiu da ponte? A gente pesca','ilha'),
 ventosul:S('GUARDA-SÓIS VENTO SUL','VENTO SUL','#ffd60a','#023047','#e63946','star','stripe','Segura até o nordestão','ilha'),
 tasvolo:S('CAFEZINHO TÁS TOLO?','TÁS TOLO?','#6f1d1b','#ffe6a7','#bb9457','cup','script','Ó-lhó-lhó, que cafezinho!','ilha'),
 tainhavoadora:S('PEIXARIA TAINHA VOADORA','TAINHA','#0a9396','#ffffff','#ee9b00','leaf','split','Pula da rede pro prato','ilha'),
 abrefacil:S('OSTRAS ABRE-FÁCIL','ABRE-FÁCIL','#e9d8a6','#005f73','#ae2012','drop','badge','Sem faca e sem susto','ilha'),
 derretenaponte:S('SORVETES DERRETE-NA-PONTE','DERRETE','#f72585','#ffffff','#4cc9f0','star','repeat','Gelado até chegar na ilha','ilha'),
 // The Centro (the Minhocão street circuit): over it, under it, the tunnel, the drizzle and the traffic.
 sobedesce:S('GUINCHO SOBE-E-DESCE','SOBE-E-DESCE','#3a0ca3','#ffffff','#ffd60a','car','badge','Por cima ou por baixo, a gente busca','centro'),
 fomfom:S('BUZINAS FOM-FOM','FOM-FOM','#ffd60a','#14213d','#e63946','bolt','stripe','Pra quem nasceu no trânsito','centro'),
 garoa:S('GUARDA-CHUVAS GAROA ETERNA','GAROA','#4a4e69','#f2e9e4','#9a8c98','drop','repeat','Nunca falha, nem em agosto','centro'),
 ventopuro:S('PASTEL VENTO-PURO','VENTO-PURO','#e85d04','#ffffff','#370617','cup','script','Mais ar que recheio','centro'),
 crocroc:S('PÃO NA CHAPA CROC-CROC','CROC-CROC','#ffe8d6','#6b2d0c','#cb997e','cup','split','Manteiga até o cotovelo','centro'),
 acendefarol:S('FARÓIS ACENDE-NO-TÚNEL','FAROL','#001d3d','#ffc300','#ffffff','star','badge','Clareia até debaixo da praça','centro')
});
// Each circuit's region (its local sponsors).
const REGIONS={interlagos:'sp',piracicaba:'sp',cascavel:'pr',chapeco:'sc',brasilia:'df',goiania:'go',curvelo:'mg',chapada:'mt',floripa:'ilha',minhocao:'centro'};
const NATIONAL=['autopobre','oldstock','posto99','tia','retifica','blazer'],EXTRA=['pulapula','pegaprimeira','oleovo','semtranco'];
export const regionOf=id=>REGIONS[id]??'sp';
// A circuit's own seed: the same banners and boards at every load of it, different from the others'.
export function circuitSeed(id='interlagos'){let h=2166136261;for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%2147483646+1;}
export const seeded=seed=>{let x=seed%2147483647||1;return ()=>(x=x*16807%2147483647)/2147483647;};
// The sponsors seen at a circuit, as {id, ...sponsor, words} with the circuit's name filled in: the
// national ones, two of the national extras and every local one (Piracicaba adds its own two).
export function circuitSponsors(id='interlagos',name='Interlagos'){
 const rand=seeded(circuitSeed(id)),region=regionOf(id),extra=[...EXTRA].sort(()=>rand()-.5).slice(0,2);
 const local=Object.keys(SPONSORS).filter(k=>SPONSORS[k].region===region||id==='piracicaba'&&SPONSORS[k].region==='pira');
 return [...NATIONAL,...extra,...local].map(k=>({id:k,...SPONSORS[k],words:SPONSORS[k].words.replace('{CIRCUIT}',String(name).toLocaleUpperCase('pt-BR'))}));
}
// The board's bottom strip: a joke line, never a phone number or an address.
export const BOARD_LINES=Object.freeze(['FIADO SÓ AMANHÃ','ACEITAMOS VALE-PASTEL','PERGUNTE PELO ZÉ','ABERTO ATÉ A BANDEIRADA','DESDE O TEMPO DO OPALA','ESTACIONE SE ACHAR VAGA','AQUI O CAFÉ É DE GRAÇA (MENTIRA)','PATROCINADOR OFICIAL DA ZOEIRA']);

// --- Painting (canvas 2D). Icons are drawn in a unit box round (cx, cy) of radius r.
const BOLD='"Arial Black","Arial Bold",Arial,sans-serif',CONDENSED='Impact,"Arial Narrow","Arial Black",sans-serif',SCRIPT='italic 700 {px}px Georgia,"Times New Roman",serif';
export function drawIcon(ctx,kind,cx,cy,r,ink,accent){
 ctx.save();ctx.translate(cx,cy);ctx.fillStyle=ink;ctx.strokeStyle=ink;ctx.lineWidth=r*.16;ctx.lineJoin='round';ctx.lineCap='round';
 const P=(...pts)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x*r,y*r):ctx.moveTo(x*r,y*r));ctx.closePath();};
 switch(kind){
  case 'drop':ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(r*.25,-r*.45,r*.75,-.05*r,r*.72,r*.32);ctx.arc(0,r*.32,r*.72,0,Math.PI);ctx.bezierCurveTo(-r*.75,-.05*r,-r*.25,-r*.45,0,-r);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.ellipse(-r*.28,r*.3,r*.12,r*.24,.4,0,7);ctx.fill();break;
  case 'cup':ctx.fillRect(-r*.62,-r*.15,r*1.0,r*.85);ctx.beginPath();ctx.arc(r*.42,r*.22,r*.27,-1.4,1.4);ctx.stroke();ctx.fillRect(-r*.8,r*.72,r*1.4,r*.12);ctx.strokeStyle=accent;ctx.lineWidth=r*.1;for(const x of [-.4,-.12,.16]){ctx.beginPath();ctx.moveTo(x*r,-r*.3);ctx.bezierCurveTo((x+.12)*r,-r*.55,(x-.12)*r,-r*.7,x*r,-r*.95);ctx.stroke();}break;
  case 'piston':ctx.fillRect(-r*.5,-r*.9,r,r*.8);ctx.fillStyle=accent;for(const y of [-.75,-.55])ctx.fillRect(-r*.5,y*r,r,r*.06);ctx.fillStyle=ink;ctx.fillRect(-r*.12,-r*.15,r*.24,r*.8);ctx.beginPath();ctx.arc(0,r*.7,r*.3,0,7);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,r*.7,r*.12,0,7);ctx.fill();break;
  case 'wrench':ctx.rotate(-.75);ctx.fillRect(-r*.13,-r*.55,r*.26,r*1.45);ctx.beginPath();ctx.arc(0,-r*.62,r*.36,0,7);ctx.fill();ctx.fillStyle=accent;ctx.fillRect(-r*.11,-r*1.02,r*.22,r*.42);ctx.beginPath();ctx.arc(0,r*.78,r*.1,0,7);ctx.fill();break;
  case 'car':ctx.beginPath();ctx.roundRect(-r,-r*.05,r*2,r*.5,r*.14);ctx.fill();P([-.55,-.05],[-.32,-.5],[.38,-.5],[.62,-.05]);ctx.fill();ctx.fillStyle=accent;P([-.42,-.1],[-.27,-.4],[-.02,-.4],[-.02,-.1]);ctx.fill();P([.06,-.1],[.06,-.4],[.33,-.4],[.5,-.1]);ctx.fill();ctx.fillStyle=ink;for(const x of [-.55,.55]){ctx.beginPath();ctx.arc(x*r,r*.45,r*.24,0,7);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x*r,r*.45,r*.09,0,7);ctx.fill();ctx.fillStyle=ink;}break;
  case 'tyre':ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,0,r*.5,0,7);ctx.fill();ctx.fillStyle=ink;ctx.beginPath();ctx.arc(0,0,r*.2,0,7);ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=r*.07;for(let k=0;k<18;k++){const a=k/18*6.283;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.68,Math.sin(a)*r*.68);ctx.lineTo(Math.cos(a+.12)*r*.95,Math.sin(a+.12)*r*.95);ctx.stroke();}break;
  case 'gear':ctx.beginPath();for(let k=0;k<20;k++){const a=k/20*6.283,q=k%2?.72:1;ctx.lineTo(Math.cos(a)*r*q,Math.sin(a)*r*q);ctx.lineTo(Math.cos(a+.314)*r*q,Math.sin(a+.314)*r*q);}ctx.closePath();ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,0,r*.32,0,7);ctx.fill();break;
  case 'leaf':ctx.rotate(-.6);ctx.beginPath();ctx.ellipse(0,0,r*.45,r,0,0,7);ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=r*.07;ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.lineTo(0,r*1.05);ctx.stroke();for(const y of [-.5,-.15,.2,.55]){ctx.beginPath();ctx.moveTo(0,y*r);ctx.lineTo(r*.32,(y-.25)*r);ctx.moveTo(0,y*r);ctx.lineTo(-r*.32,(y-.25)*r);ctx.stroke();}break;
  case 'radio':ctx.beginPath();ctx.roundRect(-r*.28,-r*.95,r*.56,r*1.05,r*.28);ctx.fill();ctx.fillRect(-r*.05,r*.1,r*.1,r*.55);ctx.fillRect(-r*.35,r*.62,r*.7,r*.12);ctx.lineWidth=r*.1;ctx.strokeStyle=accent;for(const k of [1,2]){ctx.beginPath();ctx.arc(0,-r*.45,r*(.32+.3*k),-.7,.7);ctx.stroke();ctx.beginPath();ctx.arc(0,-r*.45,r*(.32+.3*k),Math.PI-.7,Math.PI+.7);ctx.stroke();}break;
  case 'star':ctx.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,q=k%2?.42:1;ctx.lineTo(Math.cos(a)*r*q,Math.sin(a)*r*q);}ctx.closePath();ctx.fill();break;
  case 'bolt':P([.15,-1],[-.55,.12],[-.05,.12],[-.2,1],[.55,-.15],[.05,-.15]);ctx.fill();break;
  case 'flame':ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(r*.9,-r*.2,r*.7,r*.9,0,r);ctx.bezierCurveTo(-r*.7,r*.9,-r*.9,-r*.1,-r*.25,-r*.45);ctx.bezierCurveTo(-r*.2,-r*.1,0,-r*.1,0,-r);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.ellipse(0,r*.45,r*.3,r*.45,0,0,7);ctx.fill();break;
  case 'spring':ctx.lineWidth=r*.18;ctx.beginPath();for(let k=0;k<=8;k++)ctx.lineTo((k%2?.6:-.6)*r,(-1+k*.25)*r);ctx.stroke();break;
  case 'battery':ctx.fillRect(-r*.9,-r*.55,r*1.8,r*1.2);ctx.fillRect(-r*.6,-r*.8,r*.3,r*.25);ctx.fillRect(r*.3,-r*.8,r*.3,r*.25);ctx.fillStyle=accent;ctx.fillRect(-r*.6,-r*.03,r*.4,r*.12);ctx.fillRect(r*.24,-r*.03,r*.4,r*.12);ctx.fillRect(r*.38,-r*.17,r*.12,r*.4);break;
  case 'chequer':for(let i=0;i<4;i++)for(let j=0;j<4;j++){ctx.fillStyle=(i+j)%2?accent:ink;ctx.fillRect((-1+i*.5)*r,(-1+j*.5)*r,r*.5,r*.5);}break;
  case 'flag':ctx.fillRect(-r*.75,-r,r*.1,r*2);for(let i=0;i<4;i++)for(let j=0;j<3;j++){ctx.fillStyle=(i+j)%2?accent:ink;ctx.fillRect((-.65+i*.4)*r,(-1+j*.4)*r,r*.4,r*.4);}break;
 }
 ctx.restore();
}
function fitText(ctx,text,x,y,max,px,font=BOLD,weight='900'){ctx.font=`${weight} ${px}px ${font}`;const w=ctx.measureText(text).width;if(w>max)ctx.font=`${weight} ${Math.max(8,px*max/w)}px ${font}`;ctx.fillText(text,x,y);}
// Two lines when a long name would be squeezed too thin on one.
function lines(ctx,text,max,px){ctx.font=`900 ${px}px ${BOLD}`;if(ctx.measureText(text).width<max*1.15||!text.includes(' '))return [text];const words=text.split(' ');let best=[text],score=Infinity;for(let k=1;k<words.length;k++){const a=words.slice(0,k).join(' '),b=words.slice(k).join(' '),m=Math.max(ctx.measureText(a).width,ctx.measureText(b).width);if(m<score){score=m;best=[a,b];}}return best;}

// A rail banner: one sponsor across a row of w x h (about 15:1), in its own layout.
export function paintBanner(ctx,x,y,w,h,s){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle=s.bg;ctx.fillRect(x,y,w,h);ctx.textAlign='center';ctx.textBaseline='middle';
 const mid=y+h*.53;
 if(s.style==='stripe'){ctx.fillStyle=s.accent;ctx.fillRect(x,y+h*.08,w,h*.06);ctx.fillRect(x,y+h*.86,w,h*.06);ctx.fillStyle=s.fg;fitText(ctx,s.words,x+w/2,mid,w*.88,h*.5);}
 else if(s.style==='badge'){ctx.fillStyle=s.accent;ctx.beginPath();ctx.roundRect(x+w*.035,y+h*.12,h*1.5,h*.76,h*.2);ctx.fill();drawIcon(ctx,s.icon,x+w*.035+h*.75,y+h*.5,h*.3,s.bg,s.fg);
  ctx.fillStyle=s.fg;fitText(ctx,s.words,x+w*.55,mid,w*.78,h*.5);ctx.fillStyle=s.accent;ctx.beginPath();ctx.roundRect(x+w*.965-h*1.5,y+h*.12,h*1.5,h*.76,h*.2);ctx.fill();drawIcon(ctx,s.icon,x+w*.965-h*.75,y+h*.5,h*.3,s.bg,s.fg);}
 else if(s.style==='split'){ctx.fillStyle=s.accent;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*.27,y);ctx.lineTo(x+w*.24,y+h);ctx.lineTo(x,y+h);ctx.fill();ctx.fillStyle=s.bg;fitText(ctx,s.short,x+w*.12,mid,w*.2,h*.48,CONDENSED,'400');
  ctx.fillStyle=s.fg;fitText(ctx,s.words,x+w*.62,mid,w*.66,h*.46);}
 else if(s.style==='repeat'){const n=3;for(let k=0;k<n;k++){const cx=x+w*(k+.5)/n;ctx.fillStyle=s.fg;fitText(ctx,s.short,cx,mid,w/n*.7,h*.56,CONDENSED,'400');drawIcon(ctx,s.icon,x+w*(k+1)/n,y+h*.5,h*.26,s.accent,s.bg);}}
 else{ctx.fillStyle=s.fg;ctx.font=SCRIPT.replace('{px}',Math.round(h*.6));const t=ctx.measureText(s.words).width;if(t>w*.8)ctx.font=SCRIPT.replace('{px}',Math.round(h*.6*w*.8/t));ctx.fillText(s.words,x+w/2,y+h*.48);
  ctx.strokeStyle=s.accent;ctx.lineWidth=h*.06;ctx.beginPath();ctx.moveTo(x+w*.2,y+h*.84);ctx.bezierCurveTo(x+w*.4,y+h*.72,x+w*.6,y+h*.95,x+w*.8,y+h*.82);ctx.stroke();drawIcon(ctx,s.icon,x+w*.06,y+h*.5,h*.3,s.accent,s.bg);drawIcon(ctx,s.icon,x+w*.94,y+h*.5,h*.3,s.accent,s.bg);}
 grommets(ctx,x,y,w,h);ctx.restore();
}
// Grommets along the top edge, where it is tied to the rail.
function grommets(ctx,x,y,w,h){ctx.fillStyle='rgba(0,0,0,.32)';for(let gx=x+w*.03;gx<x+w;gx+=w*.12){ctx.beginPath();ctx.arc(gx,y+h*.2,h*.035,0,7);ctx.fill();}}
// The same sponsor's other banner, hung between its main ones so a run never ticks one word past
// every few metres: colours reversed (its text colour as the field), the short name and the tagline.
export function paintBannerAlt(ctx,x,y,w,h,s){
 if(!s.tag)return paintBanner(ctx,x,y,w,h,s); // a real name has no tagline to show
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle=s.fg;ctx.fillRect(x,y,w,h);ctx.textAlign='center';ctx.textBaseline='middle';
 const mid=y+h*.53,mark=contrast(s.accent,s.fg)>1.8?s.accent:s.bg;
 ctx.fillStyle=s.bg;ctx.beginPath();ctx.roundRect(x+w*.02,y+h*.12,h*1.6,h*.76,h*.2);ctx.fill();drawIcon(ctx,s.icon,x+w*.02+h*.8,y+h*.5,h*.3,s.fg,s.accent);
 ctx.fillStyle=s.bg;fitText(ctx,s.short,x+w*.29,mid,w*.3,h*.6,CONDENSED,'400');
 ctx.fillStyle=mark;ctx.fillRect(x+w*.475,y+h*.16,h*.09,h*.68);
 ctx.fillStyle=s.bg;fitText(ctx,s.tag.toLocaleUpperCase('pt-BR'),x+w*.735,mid,w*.47,h*.34,BOLD,'700');
 grommets(ctx,x,y,w,h);ctx.restore();
}

// A billboard face, w x h (2:1): the sponsor big, its tagline and a joke line along the bottom.
export function paintBoard(ctx,x,y,w,h,s,{seed=1}={}){
 // A near-black field reads as a switched-off screen from down the straight: dark brands paint the
 // board in their accent, keeping the text readable on it.
 if(luma(s.bg)<.05){const bg=s.accent,fg=contrast(s.fg,bg)>3?s.fg:s.bg;s={...s,bg,fg,accent:s.bg};}
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
 const g=ctx.createLinearGradient(x,y,x+w*.3,y+h);g.addColorStop(0,s.bg);g.addColorStop(1,shade(s.bg,.78));ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
 // By the seed itself: the boards' seeds step by 31, so their first draws are nearly equal and every board
 // would show the same line; 31 is odd, so consecutive boards walk through all the lines.
 const strip=BOARD_LINES[seed%BOARD_LINES.length];
 const words=s.words.replace(/ · /g,' ');
 if(s.style==='split'){
  ctx.fillStyle=s.accent;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w*.42,y);ctx.lineTo(x+w*.34,y+h);ctx.lineTo(x,y+h);ctx.fill();drawIcon(ctx,s.icon,x+w*.19,y+h*.44,h*.26,s.bg,s.fg);
  ctx.fillStyle=s.fg;const t=lines(ctx,words,w*.52,h*.17);t.forEach((line,k)=>fitText(ctx,line,x+w*.68,y+h*(.36+(k-(t.length-1)/2)*.2),w*.55,h*.17));
  ctx.font=`700 ${h*.065}px Arial,sans-serif`;ctx.fillText(s.tag,x+w*.68,y+h*.68,w*.55);
 }else if(s.style==='repeat'){
  ctx.fillStyle=s.accent;ctx.fillRect(x,y+h*.72,w,h*.28);ctx.fillStyle=s.fg;fitText(ctx,s.short,x+w*.56,y+h*.38,w*.7,h*.42,CONDENSED,'400');drawIcon(ctx,s.icon,x+w*.12,y+h*.38,h*.2,s.accent,s.bg);
  ctx.fillStyle=s.bg;ctx.font=`900 ${h*.075}px ${BOLD}`;ctx.fillText(s.tag.toLocaleUpperCase('pt-BR'),x+w*.5,y+h*.86,w*.9);
 }else if(s.style==='script'){
  ctx.fillStyle=s.accent;ctx.beginPath();ctx.arc(x+w*.86,y+h*.12,h*.45,0,7);ctx.fill();drawIcon(ctx,s.icon,x+w*.86,y+h*.2,h*.16,s.bg,s.fg);
  // The words keep clear of the badge in the top corner.
  ctx.fillStyle=s.fg;const t=lines(ctx,words,w*.5,h*.15);ctx.font=SCRIPT.replace('{px}',Math.round(h*(t.length>1?.17:.2)));t.forEach((line,k)=>ctx.fillText(line,x+w*.36,y+h*(.4+(k-(t.length-1)/2)*.2),w*.6));
  ctx.strokeStyle=s.accent;ctx.lineWidth=h*.02;ctx.beginPath();ctx.moveTo(x+w*.08,y+h*.66);ctx.bezierCurveTo(x+w*.25,y+h*.6,x+w*.45,y+h*.74,x+w*.64,y+h*.64);ctx.stroke();
  ctx.font=`700 ${h*.065}px Arial,sans-serif`;ctx.fillText(s.tag,x+w*.36,y+h*.78,w*.6);
 }else{
  // stripe / badge: a diagonal band or a round badge behind the icon.
  // The stripe runs low, between the tagline and the bottom strip (it used to cross the tagline).
  ctx.fillStyle=s.accent;if(s.style==='stripe'){ctx.beginPath();ctx.moveTo(x,y+h*.79);ctx.lineTo(x+w,y+h*.69);ctx.lineTo(x+w,y+h*.745);ctx.lineTo(x,y+h*.845);ctx.fill();}
  else{ctx.beginPath();ctx.arc(x+w*.17,y+h*.42,h*.3,0,7);ctx.fill();}
  drawIcon(ctx,s.icon,x+w*.17,y+h*.42,h*.2,s.style==='stripe'?s.accent:s.bg,s.fg);
  // The words keep clear of the badge (its right edge is at about .32 of the width).
  ctx.fillStyle=s.fg;const t=lines(ctx,words,w*.56,h*.17);t.forEach((line,k)=>fitText(ctx,line,x+w*.645,y+h*(.34+(k-(t.length-1)/2)*.19),w*.56,h*.17));
  ctx.font=`700 ${h*.065}px Arial,sans-serif`;ctx.fillText(s.tag,x+w*.645,y+h*.62,w*.56);
 }
 // The joke strip along the bottom (never on a real name).
 if(s.style!=='repeat'&&!s.real){ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(x,y+h*.86,w,h*.14);ctx.fillStyle='#ffffff';ctx.font=`900 ${h*.07}px ${BOLD}`;ctx.fillText(strip,x+w*.5,y+h*.93,w*.8);}
 ctx.restore();
}
// The circuit's own welcome board: its full name over the city.
export function paintWelcome(ctx,x,y,w,h,label){
 const [name,city=' ']=String(label).split(' · ');ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
 // A light board (a dark one reads as a switched-off screen from down the straight), green band on top.
 ctx.fillStyle='#f4f2ec';ctx.fillRect(x,y,w,h);ctx.fillStyle='#12351f';ctx.fillRect(x,y,w,h*.26);
 for(let k=0;k<32;k++)for(let j=0;j<2;j++){ctx.fillStyle=(k+j)%2?'#111':'#f4f2ec';ctx.fillRect(x+k*w/32,y+h*(.8+j*.05),w/32,h*.05);}
 ctx.fillStyle='#f0c419';ctx.font=`700 ${h*.09}px Arial,sans-serif`;ctx.fillText('BEM-VINDOS AO',x+w/2,y+h*.13);
 ctx.fillStyle='#12351f';fitText(ctx,name,x+w/2,y+h*.42,w*.86,h*.17);ctx.fillStyle='#b3161d';fitText(ctx,city,x+w/2,y+h*.64,w*.6,h*.11);
 ctx.fillStyle='#1a1a1a';ctx.font=`700 ${h*.055}px Arial,sans-serif`;ctx.fillText('RESPEITE OS FISCAIS · NÃO ENTRE NA PISTA',x+w/2,y+h*.95,w*.9);ctx.restore();
}
const shade=(hex,k)=>{const n=parseInt(hex.slice(1),16);return `rgb(${Math.round((n>>16&255)*k)},${Math.round((n>>8&255)*k)},${Math.round((n&255)*k)})`;};
// Relative luminance of a #rrggbb colour and the contrast ratio of two.
export function luma(hex){const n=parseInt(hex.slice(1),16),c=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*c(n>>16&255)+.7152*c(n>>8&255)+.0722*c(n&255);}
export const contrast=(a,b)=>{const x=luma(a),y=luma(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
