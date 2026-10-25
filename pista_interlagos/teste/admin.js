// The admin panel (admin.html, in the dev build only: preparar_publicacao.py --conta). It reads the accounts server's
// /api/admin/ (conta-cloudflare/src/admin.js), which answers only an account marked admin in its database: this page
// decides nothing. Read only: the numbers, the accounts, what happened (events, kept 90 days) and the last records.
// Everything shown goes in as text.
import {CIRCUITS} from './circuits.js';

const $=id=>document.getElementById(id);
const KINDS={conta_criada:'Conta criada',entrou:'Entrou',saiu:'Saiu',apelido:'Trocou o apelido',importou:'Subiu recordes antigos',
 conferida:'Volta conferida',recusada:'Volta recusada',conta_apagada:'Conta apagada'};
const MODES={normal:'Corrida normal',immersive:'Modo História'};
const when=ms=>ms?new Date(ms).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const lap=ms=>{if(!Number.isFinite(ms))return '—';const s=ms/1000,m=Math.floor(s/60);return `${m}:${(s-m*60).toFixed(3).padStart(6,'0')}`;};
const track=id=>CIRCUITS[id]?.name??id??'—';

async function get(path){
 const r=await fetch('/api/admin/'+path,{cache:'no-store',credentials:'same-origin'});
 const data=await r.json().catch(()=>null);
 if(!r.ok||!data)throw Object.assign(new Error(data?.erro||'O servidor de contas não respondeu.'),{status:r.status});
 return data;
}
function rows(id,list,columns,append=false){
 const body=$(id).querySelector('tbody');if(!append)body.replaceChildren();
 for(const item of list){
  const tr=document.createElement('tr');
  for(const [value,kind] of columns){const td=document.createElement('td');td.textContent=value(item);if(kind)td.className=kind;tr.append(td);}
  body.append(tr);
 }
 $(id).parentElement.querySelector('.vazio').hidden=body.children.length>0;
}
function detail(e){
 const d=e.detalhe??{};
 switch(e.tipo){
  case 'apelido':return d.apelido??'';
  case 'importou':return `${d.recordes??0} recorde${d.recordes===1?'':'s'}`;
  case 'conferida':return `${track(d.circuito)} · ${MODES[d.modo]??d.modo} · ${lap(d.volta_ms)}`;
  case 'recusada':return `${track(d.circuito)} · ${lap(d.volta_ms)} · ${d.motivo??''}`;
  default:return '';
 }
}

function summary(s){
 const cards=[['Contas',s.contas,`${s.com_apelido} com apelido`],['Novas na semana',s.novas_7d,''],['Entradas em 24 h',s.entradas_24h,`${s.entradas_7d} em 7 dias`],
  ['Com sessão aberta',s.com_sessao,'contas'],['Recordes ✓',s.conferidos,'conferidos'],['Recordes ⚠️',s.antigos,'antigos'],['Voltas recusadas',s.recusadas_7d,'em 7 dias']];
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

async function load(){
 $('aviso').textContent='Carregando…';$('aviso').hidden=false;
 try{
  const [s,u,r]=await Promise.all([get('resumo'),get('usuarios'),get('recordes')]);
  summary(s);
  rows('usuarios',u.usuarios,[[x=>(x.apelido??'(sem apelido)')+(x.admin?' · admin':'')],[x=>when(x.criado_em)],[x=>when(x.ultimo_login)],[x=>String(x.sessoes),'num'],
   [x=>String(x.conferidos),'num'],[x=>String(x.antigos),'num'],[x=>x.importou_em?when(x.importou_em):'não'],[x=>String(x.recusadas_7d),'num']]);
  rows('recordes',r.recordes,[[x=>when(x.enviado_em)],[x=>x.apelido],[x=>track(x.circuito)],[x=>MODES[x.modo]??x.modo],[x=>lap(x.volta_ms),'num'],
   [x=>x.selo==='conferido'?'✓ conferido':'⚠️ antigo'],[x=>x.versao]]);
  oldest=null;await events();
  $('painel').hidden=false;$('aviso').hidden=true;$('atualizado').textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR',{timeStyle:'short'})}`;
 }catch(error){
  $('painel').hidden=true;
  $('aviso').textContent=error.status===401?'Entre com a sua conta no jogo primeiro (Entrar com Google) e volte aqui.':error.message;
 }
}

for(const [value,label] of Object.entries(KINDS)){const o=document.createElement('option');o.value=value;o.textContent=label;$('tipo').append(o);}
$('tipo').onchange=()=>{kind=$('tipo').value;oldest=null;events().catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});};
$('mais').onclick=()=>events(true).catch(e=>{$('aviso').textContent=e.message;$('aviso').hidden=false;});
$('atualizar').onclick=load;
load();
