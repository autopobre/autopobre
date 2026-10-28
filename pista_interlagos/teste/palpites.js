// Palpites do Opala 99 (palpites.html, the dev build only for now: publicacao.py PALPITES). A pilot signs in with
// Google from here (the sign-in asks for the e-mail too: it is how a winner is reached) and guesses where the real
// Opala 99 finishes the weekend's qualifying and two races. The accounts server decides everything
// (conta-cloudflare/src/palpites.js): when the guesses close, one per account and final, the podium. This page shows
// its state, keeps the picks across the trip to Google (sessionStorage) and sends the guess with one click, the warning
// that it is final right above the button (the owner's call: a second confirmation is what the inattentive miss).
// All text goes in as text.
const API='/api/palpites',$=id=>document.getElementById(id);
const GRID=13;
// Each stage: its key, its name, what position 0 means for a guess and for the result.
const STAGES=[['treino','Treino classificatório','Sem tempo válido','Sem tempo válido'],['corrida1','Corrida 1','Não completará','Não completou'],['corrida2','Corrida 2','Não completará','Não completou']];
const DRAFT='autopobre-palpite-rascunho';
// The optional consent beside the guess (conta-cloudflare/src/palpites.js offers): unticked until the pilot ticks it.
const OFFERS='Aceito receber promoções e ofertas dos patrocinadores do Piloto Pobre';
const place=(stage,p,result=false)=>p===0?STAGES.find(s=>s[0]===stage)[result?3:2]:`${p}º`;

let state=null,skew=0,wantsOffers=null;
const serverNow=()=>Date.now()+skew;
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};

async function call(path,body){
 const r=await fetch(path,body?{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store',credentials:'same-origin'});
 const data=await r.json().catch(()=>null);
 if(!data)throw Object.assign(new Error('Os palpites estão fora do ar agora. Tente de novo daqui a pouco.'),{status:r.status});
 if(!r.ok)throw Object.assign(new Error(data.erro||'Algo deu errado. Tente de novo.'),{status:r.status,falta:data.falta});
 return data;
}

// The closing time in Brasília: "sábado, 31/10, às 7h30".
function closing(iso){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit',hour:'numeric',minute:'2-digit',hourCycle:'h23'})
  .formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
 return `${parts.weekday}, ${parts.day}/${parts.month}, às ${Number(parts.hour)}h${parts.minute==='00'?'':parts.minute}`;
}
function left(ms){
 const min=Math.ceil(ms/60000),d=Math.floor(min/1440),h=Math.floor(min%1440/60),m=min%60;
 if(d)return `faltam ${d} dia${d>1?'s':''}${h?` e ${h} h`:''}`;
 if(h)return `faltam ${h} h${m?` ${m} min`:''}`;
 return `falta${m>1?'m':''} ${m} min`;
}
const when=iso=>new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

function drawDeadline(tick=false){
 const b=state?.bolao;if(!b){$('prazo').textContent='';return;}
 const ms=Date.parse(b.fecha_em)-serverNow();
 $('prazo').textContent=ms>0?`Palpites até ${closing(b.fecha_em)} · ${left(ms)}`:'Palpites encerrados';
 for(const span of document.querySelectorAll('.prazo-curto'))span.textContent=closing(b.fecha_em);
 // The close passed while the page was open: the server says what now (on the clock's tick only, so a clock that
 // disagrees with the server's asks once a tick, never in a loop).
 if(tick&&ms<=0&&b.aberto)load();
}

// The three rows of positions: 1º to 13º, then what 0 means for that stage.
function drawForm(){
 const form=$('escolhas');form.replaceChildren();
 let draft={};try{draft=JSON.parse(sessionStorage.getItem(DRAFT)??'{}')??{};}catch{}
 for(const [stage,name,none] of STAGES){
  const set=el('fieldset','etapa'),legend=el('legend',null,name),grid=el('div','posicoes');
  for(const p of [...Array.from({length:GRID},(_,i)=>i+1),0]){
   const label=el('label',p===0?'pos nenhuma':'pos'),input=el('input');
   input.type='radio';input.name=stage;input.value=String(p);input.checked=draft[stage]===p;
   label.append(input,el('span',null,p===0?none:`${p}º`));grid.append(label);
  }
  set.append(legend,grid);form.append(set);
 }
 form.onchange=()=>{try{sessionStorage.setItem(DRAFT,JSON.stringify(picks(true)));}catch{}drawAction();};
}
// The picks as the server wants them; null while one is missing (partial: what there is, for the draft).
function picks(partial=false){
 const out={};
 for(const [stage] of STAGES){const c=$('escolhas').querySelector(`input[name="${stage}"]:checked`);if(c)out[stage]=Number(c.value);else if(!partial)return null;}
 return out;
}

function signInButton(text){
 const a=el('a','botao google');a.href='/api/conta/entrar?email=1&volta='+encodeURIComponent(location.pathname);
 a.append(el('span','g','G'),text);
 a.onclick=()=>{try{sessionStorage.setItem(DRAFT,JSON.stringify(picks(true)));}catch{}};
 return a;
}
// What the pilot can do next: sign in, pick a nickname, confirm the e-mail, or send the guess.
function drawAction(){
 const box=$('acao'),conta=state.conta;box.replaceChildren();
 if(!state.bolao.pronto){box.append(el('p','nota','Os palpites abrem em breve.'));return;}
 if(!conta){box.append(signInButton('Entrar com Google para palpitar'));return;}
 if(!conta.apelido){
  const form=el('form','apelido'),label=el('label',null,'Seu apelido (aparece aqui se você ficar no pódio)'),row=el('div','linha'),input=el('input'),save=el('button','botao','Salvar');
  input.id='apelido';input.maxLength=20;input.required=true;input.autocomplete='nickname';input.spellcheck=false;label.htmlFor='apelido';save.type='submit';
  row.append(input,save);form.append(label,row);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await call('/api/conta/apelido',{apelido:input.value});await load();}catch(error){showError(error.message);save.disabled=false;}};
  box.append(form);return;
 }
 if(!conta.email){box.append(signInButton('Confirmar e-mail com o Google'));return;}
 wantsOffers??=!!conta.ofertas;
 const consent=offersBox(wantsOffers,checked=>{wantsOffers=checked;});
 const chosen=picks(),send=el('button','botao enviar');send.type='button';
 send.textContent=chosen?'Palpitar':'Escolha as 3 posições';
 send.disabled=!chosen;
 send.onclick=async()=>{
  send.disabled=true;send.textContent='Enviando…';
  try{state=await call(API,{...picks(),ofertas:wantsOffers});try{sessionStorage.removeItem(DRAFT);}catch{}render();}
  catch(error){showError(error.message);if(error.falta||error.status===409||error.status===403)await load();else drawAction();}
 };
 const final=el('p','definitivo');final.append(el('b',null,'Atenção:'),' o palpite é um só. Depois de palpitar, não dá para mudar.');
 box.append(consent,final,send);
}
function showError(text){$('erro').textContent=text;$('erro').hidden=!text;}
// The offers' checkbox; changed: onChange(ticked).
function offersBox(ticked,onChange){
 const label=el('label','ofertas'),input=el('input');
 input.type='checkbox';input.checked=ticked;input.onchange=()=>onChange(input.checked,input);
 label.append(input,el('span',null,OFFERS));
 return label;
}

function guessLine(g,result=false){
 const p=el('p','linha-palpite');
 for(const [stage,name] of STAGES){const item=el('span','item');item.append(el('small',null,name),el('b',null,place(stage,g[stage],result)));p.append(item);}
 return p;
}
// The pilot's guess, its place in line, and once there is a result how many it hit and its place on the podium.
function drawMine(){
 const g=state.palpite,box=$('seu');box.hidden=!g;if(!g)return;
 box.replaceChildren(el('h2',null,'Seu palpite'),guessLine(g));
 const small=el('p','nota',`Feito em ${when(g.quando)} · nº ${g.ordem} na fila. Se mais alguém acertar o mesmo, fica na frente quem palpitou primeiro.`);
 box.append(small);
 // The offers' checkbox stays by the Palpitar button only (the owner's call); who accepted gets one quiet line here to take
 // it back (LGPD: as easy as giving it), who did not sees nothing.
 if(state.conta?.ofertas){
  const line=el('p','nota ofertas-aceitas'),undo=el('button','link','Não quero mais');undo.type='button';
  line.append('Você aceitou receber ofertas dos patrocinadores. ',undo);
  undo.onclick=async()=>{
   undo.disabled=true;
   try{await call(API+'/ofertas',{aceito:false});state.conta.ofertas=false;line.remove();}
   catch(error){undo.disabled=false;line.append(` ${error.message}`);}
  };
  box.append(line);
 }
 if(g.desclassificado){box.append(el('p','erro','Este palpite foi desclassificado e não concorre.'));return;}
 if(g.acertos===undefined)return;
 if(g.lugar){
  const win=el('p','ganhou');win.append(el('b',null,`Você ficou em ${g.lugar}º lugar no pódio!`),` Acertou ${g.acertos} de 3.`);
  box.append(win);
 }else box.append(el('p','acertos',`Você acertou ${g.acertos} de 3.`));
}
// The official result and the podium by nickname.
function drawResult(){
 const b=state.bolao,box=$('resultado');box.hidden=!b.resultado;if(!b.resultado)return;
 box.replaceChildren(el('h2',null,'Resultado oficial'),guessLine(b.resultado,true),el('h3',null,'Pódio'));
 const list=el('ol','podio-resultado');
 for(const n of [1,2,3]){
  const w=state.podio?.find(x=>x.lugar===n),li=el('li');
  li.append(el('span','lugar-n',`${n}º lugar`),el('b',null,w?w.apelido:'Ninguém'),el('small',null,w?`${w.acertos} acerto${w.acertos>1?'s':''}`:`ninguém acertou ${4-n} ou mais`));
  list.append(li);
 }
 box.append(list);
}
// How the guesses spread, a bar per position (shown once closed). One hue; the official position marked, with its
// count in the label; each bar says its count on hover or focus.
function drawCrowd(){
 const t=state.galera,box=$('galera');box.hidden=!t;if(!t)return;
 box.replaceChildren(el('h2',null,`Palpites da galera · ${state.total}`));
 for(const [stage,name,none] of STAGES){
  const counts=t[stage],max=Math.max(1,...counts),official=state.bolao.resultado?.[stage];
  const row=el('figure','barras'),cap=el('figcaption',null,name),plot=el('div','plot');
  plot.setAttribute('role','list');
  for(const p of [...Array.from({length:GRID},(_,i)=>i+1),0]){
   const n=counts[p],col=el('div','col'+(p===official?' oficial':'')),bar=el('span','barra'),tick=el('span','rotulo',p===0?(stage==='treino'?'ST':'NC'):String(p));
   col.setAttribute('role','listitem');col.tabIndex=0;
   const said=`${p===0?none:`${p}º`}: ${n} palpite${n===1?'':'s'}${p===official?' (resultado oficial)':''}`;
   col.setAttribute('aria-label',said);col.dataset.dica=said;
   bar.style.height=n?`${Math.max(4,n/max*100)}%`:'0';
   col.append(bar,tick);plot.append(col);
  }
  row.append(cap,plot);box.append(row);
 }
 box.append(el('p','nota','ST: sem tempo válido · NC: não completou'+(state.bolao.resultado?' · contorno: resultado oficial':'')));
}

function render(){
 const b=state?.bolao;
 $('aviso').hidden=!!b;
 if(!b){$('aviso').textContent='Nenhum palpite aberto agora.';for(const id of ['palpitar','seu','resultado','galera'])$(id).hidden=true;return;}
 $('titulo').textContent=b.titulo;
 drawDeadline();
 const open=b.aberto&&!state.palpite;
 $('palpitar').hidden=!open;showError('');
 if(open){
  if(!$('escolhas').childElementCount)drawForm();
  drawAction();
  const who=$('quem');who.hidden=!state.conta;
  if(state.conta){
   who.replaceChildren(`Entrou como ${state.conta.apelido??'(sem apelido)'}${state.conta.email?` · ${state.conta.email}`:''} · `);
   const out=el('button','link','Sair');out.type='button';
   out.onclick=async()=>{out.disabled=true;try{await call('/api/conta/sair',{});}catch{}await load();};
   who.append(out);
  }
 }
 if(!b.aberto&&!state.palpite&&state.conta){$('aviso').hidden=false;$('aviso').textContent='Os palpites fecharam antes de você palpitar.';}
 drawMine();drawResult();drawCrowd();
}

async function load(){
 try{
  state=await call(API);
  skew=Date.parse(state.agora??'')-Date.now()||0;
 }catch(error){
  state=null;$('aviso').hidden=false;$('aviso').textContent=error.message;
  for(const id of ['palpitar','seu','resultado','galera'])$(id).hidden=true;
  return;
 }
 render();
}

setInterval(()=>drawDeadline(true),30000);
load();
