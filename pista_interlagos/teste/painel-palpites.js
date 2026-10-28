// The palpites' panel (painel-palpites.html, with the accounts: publicacao.py PALPITES). It reads the accounts
// server's /api/admin/palpites (conta-cloudflare/src/palpites.js), which answers only who runs the palpites (an
// administrator, or an account the database marks: the real Stevan): this page decides nothing. The weekend's closing
// time, the official result, the podium, and every guess in line with who sent it (nickname and whole e-mail), its hits
// and whether they accepted the sponsors' offers, with a button to take a guess out. Everything shown goes in as text.
const $=id=>document.getElementById(id);
const GRID=13,STAGES=[['treino','Treino','sem tempo'],['corrida1','Corrida 1','não completou'],['corrida2','Corrida 2','não completou']];
const position=(stage,p)=>p===0?STAGES.find(s=>s[0]===stage)[2]:`${p}º`;
const when=ms=>ms?new Date(ms).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
// The closing time on its card: the day ("sáb 31/10") and the hour ("7h30").
function short(iso){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'numeric',minute:'2-digit',hourCycle:'h23'})
  .formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
 return [`${parts.weekday.replace('.','')} ${parts.day}/${parts.month}`,`${Number(parts.hour)}h${parts.minute==='00'?'':parts.minute}`];
}
// Brasília has had no summer time since 2019: its clock is UTC−3.
const BRASILIA=3*3600000;
const toInput=iso=>new Date(Date.parse(iso)-BRASILIA).toISOString().slice(0,16);
const fromInput=value=>value?new Date(Date.parse(value+':00Z')+BRASILIA).toISOString():null;
const select=stage=>$('res'+stage[0].toUpperCase()+stage.slice(1));
// The e-mails hidden until the eye shows them (a screen shared, someone beside): its first letter and its domain.
let showEmails=false,last=null;
const EYE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const email=text=>!text?null:showEmails?text:text[0]+'•••'+text.slice(text.lastIndexOf('@'));
function drawEye(){
 const b=$('olho');b.innerHTML=(showEmails?EYE_OFF:EYE)+`<span>${showEmails?'Esconder e-mails':'Mostrar e-mails'}</span>`;
 b.setAttribute('aria-pressed',String(showEmails));
}

async function get(path,post){
 const r=await fetch('/api/admin/'+path,post?{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)}:{cache:'no-store',credentials:'same-origin'});
 const data=await r.json().catch(()=>null);
 if(!r.ok||!data)throw Object.assign(new Error(data?.erro||'O servidor de contas não respondeu.'),{status:r.status});
 return data;
}
// A column is [text of an item, its class]; a column whose class is 'acao' holds the element its function makes.
function rows(id,list,columns){
 const body=$(id).querySelector('tbody');body.replaceChildren();
 for(const item of list){
  const tr=document.createElement('tr');
  for(const [value,kind] of columns){const td=document.createElement('td');if(kind==='acao')td.append(value(item));else td.textContent=value(item);if(kind)td.className=kind;tr.append(td);}
  body.append(tr);
 }
 $(id).parentElement.querySelector('.vazio').hidden=body.children.length>0;
}
function warn(text){$('aviso').textContent=text;$('aviso').hidden=false;}
// A button whose first click arms it and the second (within 5 s) posts what it does, then the panel shows the answer.
function armed(label,act){
 const b=document.createElement('button');b.type='button';b.textContent=label;
 b.onclick=async()=>{
  if(!b.classList.contains('armado')){b.classList.add('armado');b.textContent='Confirmar';setTimeout(()=>{b.classList.remove('armado');b.textContent=label;},5000);return;}
  b.disabled=true;
  try{draw(await act());}catch(error){warn(error.message);b.disabled=false;}
 };
 return b;
}
// A summary card; small: a value of words (a date), in a smaller type.
function card(label,value,note,small_=false){
 const c=document.createElement('div'),span=document.createElement('span'),b=document.createElement('b'),small=document.createElement('small');
 c.className='cartao'+(small_?' texto':'');span.textContent=label;b.textContent=value;small.textContent=note;c.append(span,b,small);return c;
}

for(const [stage] of STAGES)for(const p of [...Array.from({length:GRID},(_,i)=>i+1),0]){const o=document.createElement('option');o.value=String(p);o.textContent=position(stage,p);select(stage).append(o);}

function draw(data){
 last=data;const b=data.bolao;
 if(!b){$('painel').hidden=true;warn('Nenhum fim de semana de palpites.');return;}
 const valid=data.palpites.filter(p=>!p.desclassificado).length;
 $('resumo').replaceChildren(card('Palpites',String(valid),data.palpites.length>valid?`${data.palpites.length-valid} desclassificado(s)`:''),
  card('Aceitaram ofertas',String(data.ofertas??0),'dos patrocinadores'),card('Fecham em',short(b.fecha_em)[0],`às ${short(b.fecha_em)[1]} · ${b.aberto?'abertos agora':'fechados'}`,true),
  card('Resultado',b.resultado?'salvo':'—',b.resultado?when(Date.parse(b.resultado_em)):'depois da corrida 2'));
 $('bolaoTitulo').textContent=b.titulo;
 $('bolaoInfo').textContent=data.pronto?'':'FALTA o segredo EMAIL_KEY no Worker: os palpites não abrem sem ele.';
 $('bolaoFecha').value=toInput(b.fecha_em);
 for(const [stage] of STAGES)select(stage).value=String(b.resultado?.[stage]??1);
 const result=()=>Object.fromEntries(STAGES.map(([stage])=>[stage,Number(select(stage).value)]));
 $('bolaoResultadoBotoes').replaceChildren(armed('Salvar resultado',()=>get('bolao',{resultado:result()})),...(b.resultado?[armed('Apagar resultado',()=>get('bolao',{resultado:null}))]:[]));
 // Who accepted the sponsors' offers, as a file (only theirs).
 const offers=document.createElement('a');offers.href='/api/admin/ofertas';offers.download='ofertas-patrocinadores.csv';offers.textContent='Baixar a lista de quem aceitou ofertas (CSV)';
 $('bolaoOfertas').replaceChildren(...(data.ofertas?[offers]:[]));
 rows('podio',data.podio,[[w=>`${w.lugar}º lugar`],[w=>w.apelido??'(sem apelido)'],[w=>email(w.email)??'(sem e-mail)'],[w=>String(w.acertos),'num'],[w=>when(Date.parse(w.quando))]]);
 rows('listaPalpites',data.palpites,[[p=>String(p.ordem),'num'],[p=>(p.apelido??'(sem apelido)')+(p.desclassificado?' · desclassificado':'')],[p=>email(p.email)??'—'],[p=>when(Date.parse(p.quando))],
  [p=>position('treino',p.treino)],[p=>position('corrida1',p.corrida1)],[p=>position('corrida2',p.corrida2)],[p=>p.acertos===undefined?'—':String(p.acertos),'num'],[p=>p.ofertas?'✓':'—','ic'],
  [p=>armed(p.desclassificado?'Devolver':'Desclassificar',()=>get('palpite',{palpite:p.id,desclassificar:!p.desclassificado})),'acao']]);
 $('painel').hidden=false;$('aviso').hidden=true;$('atualizado').textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR',{timeStyle:'short'})}`;
}

async function load(){
 $('aviso').textContent='Carregando…';$('aviso').hidden=false;
 try{draw(await get('palpites'));}
 catch(error){$('painel').hidden=true;warn(error.status===401?'Entre com a sua conta no jogo primeiro (Entrar com Google) e volte aqui.':error.message);}
}
$('bolaoFechaSalvar').onclick=async()=>{
 const iso=fromInput($('bolaoFecha').value);if(!iso)return;
 try{draw(await get('bolao',{fecha_em:iso}));}catch(error){warn(error.message);}
};
$('olho').onclick=()=>{showEmails=!showEmails;drawEye();if(last)draw(last);};
drawEye();
$('atualizar').onclick=load;
load();
