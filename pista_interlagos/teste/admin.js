// The admin panel (admin.html, in the dev build only: preparar_publicacao.py --conta). It reads the accounts server's
// /api/admin/ (conta-cloudflare/src/admin.js), which answers only an administrator: this page decides nothing. The
// numbers, the accounts with how much each drives (and a pilot's sheet, the nickname clicked), what happened (events,
// kept 90 days), every lap with what its controls look like, and the last records, which an admin can take off the
// boards (a second click confirms). Everything shown goes in as text.
import {CIRCUITS} from './circuits.js';

const $=id=>document.getElementById(id);
const KINDS={conta_criada:'Conta criada',entrou:'Entrou',saiu:'Saiu',apelido:'Trocou o apelido',importou:'Subiu recordes antigos',
 conferida:'Recorde conferido',recusada:'Volta recusada',removido:'Recorde removido',revisao_pedida:'Pediu revisão',revisao:'Revisão respondida',conta_apagada:'Conta apagada',
 palpite:'Palpitou',bolao:'Mudou os palpites',desclassificado:'Palpite desclassificado',ofertas:'Ofertas dos patrocinadores',gerente_palpites:'Painel dos palpites'};
const CARS={opala:'Opala',fusca:'Fusca'};
const where=x=>`${track(x.circuito)} · ${CARS[x.carro??'opala']??x.carro}`;
// The signals the server raises on a lap's controls (conta-cloudflare/src/comandos.js inputSignals): never a refusal,
// a reason to look.
const SIGNALS={sem_aparelho:'sem aparelho',sinteticas:'teclas sintéticas',sem_teclas:'teclado sem teclas',pedal_meio:'pedal pela metade no teclado',
 curtas:'toques curtos demais',simultaneas:'teclas no mesmo instante',repetida:'freadas idênticas a outra volta'};
const signals=s=>s?.sinais?.length?s.sinais.map(code=>SIGNALS[code]??code).join(' · '):'—';
const RESULTS={recorde:'✓ recorde',conferida:'✓ conferida'};
// A lap's pauses (conta-cloudflare/src/recordes.js): how many, how long, why (P or a menu, the window left, the tab hidden).
const PAUSES={pausa:'pausa',janela:'janela',aba:'aba'};
const pauses=p=>p?.n?`${p.n}× · ${p.s} s (${Object.entries(p.motivos??{}).map(([k,n])=>`${PAUSES[k]??k}${n>1?' '+n:''}`).join(', ')})`:'—';
const MODES={normal:'Corrida normal',immersive:'Modo História'};
const when=ms=>ms?new Date(ms).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const lap=ms=>{if(!Number.isFinite(ms))return '—';const s=ms/1000,m=Math.floor(s/60);return `${m}:${(s-m*60).toFixed(3).padStart(6,'0')}`;};
const track=id=>CIRCUITS[id]?.name??id??'—';

async function get(path,post){
 const r=await fetch('/api/admin/'+path,post?{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)}:{cache:'no-store',credentials:'same-origin'});
 const data=await r.json().catch(()=>null);
 if(!r.ok||!data)throw Object.assign(new Error(data?.erro||'O servidor de contas não respondeu.'),{status:r.status});
 return data;
}
// A column is [text of an item, its class]; a column whose class is 'acao' holds the button its function makes.
function rows(id,list,columns,append=false){
 const body=$(id).querySelector('tbody');if(!append)body.replaceChildren();
 for(const item of list){
  const tr=document.createElement('tr');
  for(const [value,kind] of columns){const td=document.createElement('td');if(kind==='acao')td.append(value(item));else td.textContent=value(item);if(kind)td.className=kind;tr.append(td);}
  body.append(tr);
 }
 $(id).parentElement.querySelector('.vazio').hidden=body.children.length>0;
}
// Where it happened, for the two sites over one database (conta-cloudflare/README.md): none before 10-28, the dev's.
const SITES={dev:'no dev',principal:'no principal'};
function detail(e){
 const d=e.detalhe??{};
 switch(e.tipo){
  case 'conta_criada':case 'entrou':return SITES[d.site]??'';
  case 'apelido':return (d.apelido??'')+(d.pela_administracao?' (dado pela administração)':'');
  case 'importou':return `${d.recordes??0} recorde${d.recordes===1?'':'s'}${d.site?' '+(SITES[d.site]??d.site):''}`;
  case 'conferida':return `${track(d.circuito)} · ${MODES[d.modo]??d.modo} · ${lap(d.volta_ms)}`;
  case 'recusada':return `${track(d.circuito)} · ${lap(d.volta_ms)} · ${d.motivo??''}`;
  case 'removido':return `${track(d.circuito)} · ${MODES[d.modo]??d.modo} · ${lap(d.volta_ms)} · ${d.selo==='conferido'?'✓':'⚠️'}`;
  case 'revisao_pedida':return `${where(d)} · ${lap(d.volta_ms)} · ${d.motivo??''}`;
  case 'revisao':return `${where(d)} · ${lap(d.volta_ms)} · ${d.aprovada?'aprovada: virou recorde ✓':'recusada'}`;
  case 'palpite':return guessText(d);
  case 'bolao':return [d.fecha_em&&'fecham '+when(Date.parse(d.fecha_em)),d.resultado===null?'resultado apagado':d.resultado&&'resultado '+guessText(d.resultado)].filter(Boolean).join(' · ');
  case 'desclassificado':return d.desclassificado?'tirado da disputa':'devolvido à disputa';
  case 'ofertas':return d.aceito?'aceitou receber':'não quer mais receber';
  case 'gerente_palpites':return d.gerente?'ganhou o painel dos palpites':'perdeu o painel dos palpites';
  default:return '';
 }
}

function summary(s){
 const cards=[['Contas',s.contas,`${s.com_apelido} com apelido`],['Novas na semana',s.novas_7d,''],['Entradas em 24 h',s.entradas_24h,`${s.entradas_7d} em 7 dias`],
  ['Com sessão aberta',s.com_sessao,'contas'],['Recordes ✓',s.conferidos,'conferidos'],['Recordes ⚠️',s.antigos,'antigos'],['Voltas recusadas',s.recusadas_7d,'em 7 dias'],
  ['Corridas na semana',s.corridas_7d??0,`${s.pilotos_7d??0} piloto${s.pilotos_7d===1?'':'s'}`],['Voltas na semana',s.voltas_7d,`${s.sinalizadas_7d??0} com sinais`],['Revisões',s.revisoes??0,'esperando resposta'],['Casos',s.casos??0,'para estudar']];
 $('resumo').replaceChildren(...cards.map(([label,value,note])=>{
  const card=document.createElement('div'),b=document.createElement('b'),span=document.createElement('span'),small=document.createElement('small');
  card.className='cartao';span.textContent=label;b.textContent=String(value??0);small.textContent=note;card.append(span,b,small);return card;}));
 const reasons=s.recusas_por_motivo??[];
 $('motivos').replaceChildren(...(reasons.length?reasons:[{motivo:'nenhuma',n:0}]).map(r=>{const li=document.createElement('li'),b=document.createElement('b');b.textContent=String(r.n);li.append(b,' ',r.motivo??'—');return li;}));
 $('nota').textContent=`Os eventos ficam guardados por ${s.eventos_por} dias, sem IP. A conta Google de cada piloto nunca aparece aqui.`;
}

let kind='',oldest=null;
async function events(more=false){
 const q=new URLSearchParams();if(kind)q.set('tipo',kind);if(more&&oldest)q.set('antes',oldest);
 const list=(await get('eventos?'+q)).eventos;
 rows('eventos',list,[[e=>when(e.quando)],[e=>e.apelido??(e.tipo==='conta_apagada'?'(apagada)':'(sem apelido)')],[e=>KINDS[e.tipo]??e.tipo,'tipo'],[detail]],more);
 if(list.length)oldest=list[list.length-1].id;
 $('mais').hidden=list.length<100;
}

// The palpites' events in words (the palpites have their own panel: painel-palpites.html).
const STAGES=[['treino','Treino','sem tempo'],['corrida1','Corrida 1','não completou'],['corrida2','Corrida 2','não completou']];
const position=(stage,p)=>p===0?STAGES.find(s=>s[0]===stage)[2]:`${p}º`;
const guessText=g=>STAGES.map(([stage,name])=>`${name} ${position(stage,g[stage])}`).join(' · ');

// Every lap that came in, with its verdict, the device and its signals (only the flagged ones when ticked).
let oldestLap=null;
async function laps(more=false){
 const q=new URLSearchParams();if($('soSinais').checked)q.set('sinalizadas','1');if(more&&oldestLap)q.set('antes',oldestLap);
 const list=(await get('voltas?'+q)).voltas;
 rows('voltas',list,[[v=>when(v.quando)],[v=>v.apelido??'(apagada)'],[v=>where(v)],[v=>lap(v.tempo_ms),'num'],
  [v=>RESULTS[v.resultado]??`✗ ${v.resultado}`],[v=>v.aparelho??'—'],[v=>pauses(v.sinais?.pausas)],[v=>signals(v.sinais),'sinais']],more);
 if(list.length)oldestLap=list[list.length-1].id;
 $('maisVoltas').hidden=list.length<100;
}
// A button whose first click arms it and the second (within 5 s) posts what it does, then the panel reloads.
function armed(label,act){
 const b=document.createElement('button');b.type='button';b.textContent=label;
 b.onclick=async()=>{
  if(!b.classList.contains('armado')){b.classList.add('armado');b.textContent='Confirmar';setTimeout(()=>{b.classList.remove('armado');b.textContent=label;},5000);return;}
  b.disabled=true;
  try{await act();await load();}
  catch(error){$('aviso').textContent=error.message;$('aviso').hidden=false;b.disabled=false;}
 };
 return b;
}
// Remover takes the record off the boards.
const removeButton=record=>armed('Remover',()=>get('remover',{recorde:record.id}));
// The accounts, with how much each drives (conta-cloudflare/src/admin.js pilots), in the order the select asks: the last
// sign-in, the most races or laps, or the best pace first (those who never set a checked lap last).
let users=[];
const pace=v=>v===null||v===undefined?'—':`${(v*100).toFixed(1).replace('.',',')}%`;
const ORDERS={login:(a,b)=>b.ultimo_login-a.ultimo_login,corridas:(a,b)=>b.corridas-a.corridas||b.voltas-a.voltas,voltas:(a,b)=>b.voltas-a.voltas||b.corridas-a.corridas,
 vitorias:(a,b)=>b.vitorias-a.vitorias||b.podios-a.podios||b.corridas-a.corridas,
 ritmo:(a,b)=>(a.ritmo?.valor??Infinity)-(b.ritmo?.valor??Infinity)||b.voltas-a.voltas};
// A pilot's circuits, most raced first ("Interlagos 12 · Brasília 3"); the title has each one's races, laps and best laps.
function tracksCell(x){
 const span=document.createElement('span');span.textContent=x.pistas?.length?x.pistas.slice(0,4).map(p=>`${track(p.circuito)} ${p.corridas}`).join(' · ')+(x.pistas.length>4?' …':''):'—';
 span.title=(x.pistas??[]).map(p=>`${track(p.circuito)}: ${p.corridas} corrida${p.corridas===1?'':'s'}, ${p.voltas} volta${p.voltas===1?'':'s'}`+
  Object.entries(p.melhor).map(([car,m])=>` · ${CARS[car]??car} ${lap(m.ms)} (${pace(m.ritmo)})`).join('')).join('\n');
 return span;
}
function drawUsers(){
 const list=[...users].sort(ORDERS[$('ordem').value]??ORDERS.login);
 rows('usuarios',list,[[pilotButton,'acao'],[x=>String(x.corridas??0),'num'],[x=>String(x.voltas??0),'num'],[x=>String(x.vitorias??0),'num'],[x=>String(x.podios??0),'num'],[x=>String(x.dias??0),'num'],
  [x=>x.ritmo?`${pace(x.ritmo.valor)} · ${track(x.ritmo.circuito)}`:'—','num'],[tracksCell,'acao'],[x=>when(x.criado_em)],[x=>when(x.ultimo_login)],[x=>String(x.sessoes),'num'],
  [x=>String(x.conferidos),'ic'],[x=>String(x.antigos),'ic'],[x=>[x.importou_em&&'dev '+when(x.importou_em),x.importou_principal_em&&'principal '+when(x.importou_principal_em)].filter(Boolean).join(' · ')||'não'],[x=>String(x.recusadas_7d),'num'],[x=>String(x.sinalizadas_7d??0),'num'],[userButtons,'acao']]);
}
// The nickname opens the pilot's sheet.
function pilotButton(x){
 const b=document.createElement('button');b.type='button';b.className='nome';
 b.textContent=(x.apelido??'(sem apelido)')+(x.admin?' · admin':x.gerente_palpites?' · palpites':'');
 b.onclick=()=>sheet(x.id).catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});
 return b;
}
// A pilot's sheet (conta-cloudflare/src/admin.js pilotSheet): their numbers since always, per circuit, car, kind and
// level, their records with the pace, and their last races with how each ended (the game's word for the place).
const KINDS_RACE={corrida:'Corrida','1x1':'1x1',campeonato:'Campeonato',historia:'Modo História',treino:'Treino solo'};
const LEVELS={facil:'Fácil',medio:'Médio',alto:'Alto',impossivel:'Impossível'};
const kindOf=k=>KINDS_RACE[k]??(k?k:'— (jogo antigo)'),levelOf=l=>LEVELS[l]??(l||'—');
const average=(sum,n)=>n?(sum/n).toFixed(1).replace('.',','):'—';
const ended=r=>!r.resultado_em?'—':r.terminou?`${r.posicao}º de ${r.carros}`:'não terminou';
let sheetId=null;
async function sheet(id){
 const s=await get('piloto?id='+id),p=s.piloto,t=s.totais;sheetId=id;
 const sum=k=>t.reduce((n,x)=>n+x[k],0);
 $('fichaNome').textContent=`Ficha · ${p.apelido??'(sem apelido)'}`;
 $('fichaDatas').textContent=`Conta criada em ${when(p.criado_em)} · último login em ${when(p.ultimo_login)}`;
 const cards=[['Corridas',sum('corridas'),'desde sempre'],['Voltas',sum('voltas'),`${sum('conferidas')} conferidas`],['Resultados',sum('resultados'),`${sum('resultados')-sum('terminadas')} sem terminar`],
  ['Vitórias',sum('vitorias'),''],['Pódios',sum('podios'),''],['Posição média',average(sum('soma_posicoes'),sum('terminadas')),'nas que terminou']];
 $('fichaResumo').replaceChildren(...cards.map(([label,value,note])=>{
  const card=document.createElement('div'),b=document.createElement('b'),span=document.createElement('span'),small=document.createElement('small');
  card.className='cartao';span.textContent=label;b.textContent=String(value);small.textContent=note;card.append(span,b,small);return card;}));
 rows('fichaTotais',t,[[x=>where(x)],[x=>kindOf(x.tipo)],[x=>levelOf(x.nivel)],[x=>String(x.corridas),'num'],[x=>String(x.voltas),'num'],[x=>String(x.conferidas),'num'],
  [x=>String(x.resultados),'num'],[x=>String(x.vitorias),'num'],[x=>String(x.podios),'num'],[x=>average(x.soma_posicoes,x.terminadas),'num'],[x=>when(x.primeira_em)],[x=>when(x.ultima_em)]]);
 rows('fichaRecordes',s.recordes,[[x=>where(x)],[x=>MODES[x.modo]??x.modo],[x=>lap(x.volta_ms),'num'],[x=>x.selo==='conferido'?'✓ conferido':'⚠️ antigo'],[x=>pace(x.ritmo),'num'],[x=>when(x.feito_em)]]);
 $('fichaCorridasTitulo').textContent=`Últimas corridas (dos últimos ${s.corridas_por} dias${s.corridas.length>=50?', as 50 mais recentes':''})`;
 rows('fichaCorridas',s.corridas,[[x=>when(x.quando)],[x=>where(x)],[x=>kindOf(x.tipo)],[x=>levelOf(x.nivel)],[x=>x.voltas?String(x.voltas):'—','num'],[ended]]);
 $('ficha').hidden=false;$('ficha').scrollIntoView({behavior:'smooth',block:'start'});
}
// A user's buttons: Trocar apelido, and the palpites' panel given or taken (an admin has it anyway).
function userButtons(user){
 const box=document.createElement('span');box.className='botoes';box.append(nicknameButton(user));
 if(!user.admin)box.append(armed(user.gerente_palpites?'Tirar painel dos palpites':'Dar painel dos palpites',()=>get('gerente-palpites',{usuario:user.id,gerente:!user.gerente_palpites})));
 return box;
}
// Trocar apelido: the admin gives a pilot a nickname, a reserved one too (the real Stevan's "Stevan").
function nicknameButton(user){
 const b=document.createElement('button');b.type='button';b.textContent='Trocar apelido';
 b.onclick=async()=>{
  const name=prompt(`Novo apelido para ${user.apelido??'(sem apelido)'}:`,user.apelido??'');if(name===null||!name.trim())return;
  b.disabled=true;
  try{await get('apelido',{usuario:user.id,apelido:name});await load();}
  catch(error){$('aviso').textContent=error.message;$('aviso').hidden=false;b.disabled=false;}
 };
 return b;
}
// A case as a file: the lap whole (its ghost and controls), to study where the checks went wrong.
function caseLink(v){const a=document.createElement('a');a.href=`/api/admin/caso?volta=${v.id}`;a.download=`caso-${v.id}-${v.circuito}.json`;a.textContent='Baixar';return a;}
// A review waiting: Aprovar (the lap becomes the pilot's checked record) or Recusar; a decided one says which.
function reviewButtons(v){
 if(v.revisao!=='pedida'){const span=document.createElement('span');span.textContent=`${v.revisao==='aprovada'?'✓ aprovada':'✗ recusada'} · ${when(v.revisado_em)}`;return span;}
 const box=document.createElement('span');box.className='botoes';
 box.append(armed('Aprovar',()=>get('revisar',{volta:v.id,aprovar:true})),armed('Recusar',()=>get('revisar',{volta:v.id,aprovar:false})));
 return box;
}

async function load(){
 $('aviso').textContent='Carregando…';$('aviso').hidden=false;
 try{
  const [s,u,r,v,c]=await Promise.all([get('resumo'),get('usuarios'),get('recordes'),get('revisoes'),get('casos')]);
  summary(s);
  rows('casos',c.casos,[[x=>when(x.quando)],[x=>x.apelido??'(apagada)'],[x=>where(x)],[x=>lap(x.tempo_ms),'num'],[x=>x.caso,'sinais'],[x=>x.aparelho??'—'],[x=>x.versao??'—'],[caseLink,'acao']]);
  rows('revisoes',v.revisoes,[[x=>when(x.quando)],[x=>x.apelido??'(apagada)'],[x=>where(x)],[x=>lap(x.tempo_ms),'num'],[x=>x.resultado],[x=>x.aparelho??'—'],[x=>signals(x.sinais),'sinais'],[reviewButtons,'acao']]);
  users=u.usuarios;drawUsers();
  if(sheetId!==null&&!$('ficha').hidden)await sheet(sheetId).catch(()=>{$('ficha').hidden=true;});
  rows('recordes',r.recordes,[[x=>when(x.enviado_em)],[x=>x.apelido],[x=>where(x)],[x=>MODES[x.modo]??x.modo],[x=>lap(x.volta_ms),'num'],
   [x=>x.selo!=='conferido'?'⚠️ antigo':x.sinais?.revisada?'✓ revisado':x.sinais?.confiavel?'✓ confiável (caso)':'✓ conferido'],[x=>x.versao],[x=>x.selo==='conferido'?signals(x.sinais):'—','sinais'],[removeButton,'acao']]);
  oldest=null;oldestLap=null;await Promise.all([events(),laps()]);
  $('painel').hidden=false;$('aviso').hidden=true;$('atualizado').textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR',{timeStyle:'short'})}`;
 }catch(error){
  $('painel').hidden=true;
  $('aviso').textContent=error.status===401?'Entre com a sua conta no jogo primeiro (Entrar com Google) e volte aqui.':error.message;
 }
}

for(const [value,label] of Object.entries(KINDS)){const o=document.createElement('option');o.value=value;o.textContent=label;$('tipo').append(o);}
$('tipo').onchange=()=>{kind=$('tipo').value;oldest=null;events().catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});};
$('mais').onclick=()=>events(true).catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});
$('ordem').onchange=drawUsers;
$('soSinais').onchange=()=>{oldestLap=null;laps().catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});};
$('maisVoltas').onclick=()=>laps(true).catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});
$('atualizar').onclick=load;
$('fecharFicha').onclick=()=>{$('ficha').hidden=true;sheetId=null;};
load();
