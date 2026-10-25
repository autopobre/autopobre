// The player's account: sign in with Google so the records can say who drove them. The accounts server
// (conta-cloudflare) answers /api/conta/ on the game's own origin. Only the dev.autopobre.com.br build
// carries this module (preparar_publicacao.py --conta; main.js asks for it only there). Where
// /api/conta/ does not answer (the local preview without the accounts server), nothing shows.
//
// Signed out, the menu gets a line under its pilot: "Entrar com Google". Signed in with a nickname, that
// nickname is the pilot (the menu's Piloto shows it instead of the name field: one name, not two) and the
// line goes. Either opens "Sua conta": the nickname shown on the records, the date the account was made,
// the player's data as a file, sign-out, and deleting the account (a second click confirms).
import {OnlineRecords} from './recordes-online.js';
const API='/api/conta/';
// Set just before leaving for Google: back on the page, the player hears how it went.
const SIGNING_IN='autopobre-conta-entrando';
// Signing in: an arrow through a door (the pilot's own line already has the person).
const SIGN_IN='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3"/></svg>';

function session(){try{return globalThis.sessionStorage;}catch{return null;}}
async function call(path,body){
 const r=await fetch(API+path,body===undefined?{cache:'no-store',credentials:'same-origin'}:{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=(r.headers.get('Content-Type')??'').startsWith('application/json')?await r.json().catch(()=>null):null;
 if(!data)throw new Error('O servidor de contas não respondeu. Tente de novo daqui a pouco.');
 if(!r.ok)throw new Error(data.erro||'Não deu certo. Tente de novo.');
 return data;
}

export class Conta {
 // pilot(): the name chosen on the menu, offered as the first nickname. usePilot(name, open): the account's
 // nickname becomes the menu's pilot (null gives the name field back); open() shows this dialog. records:
 // the records dialog (lap-records.js), which gets the Online tab. online: the laps that go online
 // (recordes-online.js), which main.js feeds every frame.
 constructor({pilot=()=>'',usePilot=()=>{},records=null}={}){
  this.pilot=pilot;this.usePilot=usePilot;this.records=records;this.account=null;this.available=false;this.pilotGiven='';this.confirmTimer=0;
  this.online=new OnlineRecords();
  const link=document.createElement('link');link.rel='stylesheet';link.href='./conta.css'+new URL(import.meta.url).search;document.head.append(link);
  this.strip=document.createElement('div');this.strip.id='contaFaixa';this.strip.hidden=true;
  this.strip.innerHTML=`<button id="contaBotao" type="button">${SIGN_IN}<span id="contaRotulo">Entrar com Google</span></button>`;
  (document.getElementById('pilotPicker')??document.querySelector('#menu .menu-tools'))?.after(this.strip);
  this.dialog=document.createElement('dialog');this.dialog.id='contaDialog';this.dialog.setAttribute('aria-labelledby','contaTitulo');
  this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="contaTitulo">SUA CONTA</h2></div><button id="contaFechar" type="button" aria-label="Fechar">✕</button></div>
<div class="conta-corpo">
 <section id="contaFora"><p>Entre com a sua conta Google para guardar seus recordes em qualquer navegador. Por enquanto é um teste, só para os pilotos convidados.</p><button id="contaEntrar" class="conta-principal" type="button">${SIGN_IN}Entrar com Google</button></section>
 <section id="contaDentro" hidden>
  <form id="contaApelidoForm"><label for="contaApelido">SEU APELIDO NOS RECORDES</label><div class="conta-linha"><input id="contaApelido" maxlength="20" autocomplete="nickname" spellcheck="false" required><button id="contaSalvar" class="conta-principal" type="submit">Salvar</button></div><small>3 a 20 letras ou números. Todo mundo vê este nome.</small></form>
  <p id="contaDesde"></p>
  <div class="conta-acoes"><a id="contaDados" href="${API}meus-dados" download="autopobre-meus-dados.json">Baixar meus dados</a><button id="contaSair" type="button">Sair</button><button id="contaApagar" class="conta-perigo" type="button">Apagar conta</button></div>
 </section>
 <details class="conta-info"><summary><span class="conta-i" aria-hidden="true">i</span>Guardamos só o número que o Google dá à sua conta, o apelido e as datas em que você entrou. Nada de nome, e-mail ou foto.</summary>
  <h3>Como funciona, tecnicamente</h3>
  <ul>
   <li><b>Login:</b> OpenID Connect com o Google, no fluxo <i>authorization code</i> com PKCE, <i>state</i> e <i>nonce</i>, feito pelo servidor do jogo. A página não carrega nenhum script do Google.</li>
   <li><b>O que o Google entrega:</b> o jogo pede só o escopo <code>openid</code>. Chega o identificador da conta (<code>sub</code>), um número que não revela nome, e-mail nem foto. O token do Google é conferido e descartado.</li>
   <li><b>Sessão:</b> um cookie <code>__Host-ap_sessao</code> (HttpOnly, Secure, SameSite=Lax) que dura 30 dias. O servidor guarda só o SHA-256 dele, nunca o valor. Sair apaga a sessão também no servidor.</li>
   <li><b>Onde fica:</b> num banco Cloudflare D1, no leste dos EUA. Ficam a conta (identificador, apelido, datas), as sessões e os recordes.</li>
   <li><b>Recordes:</b> pista, modo, tempo, versão do jogo, data e o fantasma da volta. Uma volta é <i>conferida</i> quando o servidor acompanha o relógio dela, com pedaços enviados a cada 5 segundos, e confere o trajeto. Os recordes antigos deste navegador sobem uma vez, marcados como (!) não verificados.</li>
   <li><b>Seus direitos (LGPD):</b> "Baixar meus dados" entrega tudo num arquivo JSON, e "Apagar conta" apaga a conta, as sessões e os recordes.</li>
  </ul>
 </details>
 <p id="contaAviso" role="status" aria-live="polite"></p>
</div>`;
  document.body.append(this.dialog);
  const $=id=>document.getElementById(id);
  // Typing a nickname must not drive the car nor open the menus (main.js reads keys on the document).
  this.dialog.addEventListener('keydown',e=>e.stopPropagation());
  $('contaBotao').onclick=()=>this.open();
  $('contaFechar').onclick=()=>this.dialog.close();
  $('contaEntrar').onclick=()=>this.signIn();
  $('contaApelidoForm').onsubmit=e=>{e.preventDefault();this.saveNickname($('contaApelido').value);};
  $('contaSair').onclick=()=>this.run(()=>call('sair',{}));
  $('contaApagar').onclick=()=>this.deleteAccount();
  this.dialog.addEventListener('close',()=>this.disarm());
 }
 // Whether the accounts server answers here; then the menu line shows.
 async start(){
  let data;try{data=await call('eu');}catch{return false;}
  // The menu's pilot before the account takes its place: their old records here are this account's too.
  this.available=true;this.firstPilot=this.pilot();this.records?.addOnline(this.online);this.show(data.conta);
  const store=session();
  if(store?.getItem(SIGNING_IN)){
   store.removeItem(SIGNING_IN);
   if(!this.account)this.open('Não deu para entrar: o login foi cancelado, ou esta conta Google ainda não está na lista dos pilotos de teste.',true);
   else if(!this.account.apelido)this.open('Pronto, você entrou. Agora escolha o apelido que vai aparecer nos recordes.');
  }
  return true;
 }
 show(account){
  this.account=account;const $=id=>document.getElementById(id),nickname=account?.apelido||'';
  this.strip.hidden=!this.available||!!nickname;
  // Only a change reaches the menu: redrawing the name field would drop what someone is typing there.
  if(nickname!==this.pilotGiven){this.pilotGiven=nickname;this.usePilot(nickname||null,()=>this.open());}
  this.online.setAccount(account);
  if(nickname)this.online.importOld(account,[nickname,this.firstPilot]);
  $('contaRotulo').textContent=account?account.apelido||'Escolha seu apelido':'Entrar com Google';
  $('contaFora').hidden=!!account;$('contaDentro').hidden=!account;
  if(account){
   $('contaApelido').value=account.apelido||this.pilot()||'';
   $('contaDesde').textContent=`Conta criada em ${new Date(account.desde).toLocaleDateString('pt-BR')}.`;
  }
  this.disarm();
 }
 open(message='',error=false){
  this.say(message,error);
  if(!this.dialog.open)this.dialog.showModal();
  if(this.account&&!this.account.apelido)document.getElementById('contaApelido').focus();
 }
 say(message,error=false){const p=document.getElementById('contaAviso');p.textContent=message;p.classList.toggle('erro',error);}
 signIn(){
  session()?.setItem(SIGNING_IN,'1');
  location.assign(API+'entrar?volta='+encodeURIComponent(location.pathname+location.search+location.hash));
 }
 async run(action,done=''){
  try{const data=await action();this.show(data.conta);this.say(done);}
  catch(error){this.say(error.message,true);}
 }
 saveNickname(value){return this.run(()=>call('apelido',{apelido:value}),'Apelido salvo.');}
 deleteAccount(){
  const button=document.getElementById('contaApagar');
  if(!button.dataset.confirmar){
   button.dataset.confirmar='1';button.textContent='Confirmar: apagar tudo';
   this.say('Isso apaga a conta e o apelido. Clique de novo para confirmar.',true);
   this.confirmTimer=setTimeout(()=>this.disarm(),10000);
   return;
  }
  this.disarm();
  return this.run(()=>call('apagar',{confirmar:'APAGAR'}),'Conta apagada. Nada ficou guardado.');
 }
 disarm(){
  clearTimeout(this.confirmTimer);const button=document.getElementById('contaApagar');
  if(button?.dataset.confirmar){delete button.dataset.confirmar;button.textContent='Apagar conta';}
 }
}

export async function startConta(options){
 const conta=new Conta(options);
 return await conta.start()?conta:null;
}
