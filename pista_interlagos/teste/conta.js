// The player's account: sign in with Google so the records can say who drove them. The accounts server
// (conta-cloudflare) answers /api/conta/ on the game's own origin. Only the dev.autopobre.com.br build
// carries this module (preparar_publicacao.py --conta; main.js asks for it only there). Where
// /api/conta/ does not answer (the local preview without the accounts server), nothing shows.
//
// The menu gets a line under its tools: "Entrar com Google", or the nickname once signed in. It opens
// "Sua conta": the nickname shown on the records, the date the account was made, the player's data as
// a file, sign-out, and deleting the account (a second click confirms).
const API='/api/conta/';
// Set just before leaving for Google: back on the page, the player hears how it went.
const SIGNING_IN='autopobre-conta-entrando';
const PERSON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

function session(){try{return globalThis.sessionStorage;}catch{return null;}}
async function call(path,body){
 const r=await fetch(API+path,body===undefined?{cache:'no-store',credentials:'same-origin'}:{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=(r.headers.get('Content-Type')??'').startsWith('application/json')?await r.json().catch(()=>null):null;
 if(!data)throw new Error('O servidor de contas não respondeu. Tente de novo daqui a pouco.');
 if(!r.ok)throw new Error(data.erro||'Não deu certo. Tente de novo.');
 return data;
}

export class Conta {
 // pilot(): the name chosen on the menu, offered as the first nickname.
 constructor({pilot=()=>''}={}){
  this.pilot=pilot;this.account=null;this.confirmTimer=0;
  const link=document.createElement('link');link.rel='stylesheet';link.href='./conta.css'+new URL(import.meta.url).search;document.head.append(link);
  this.strip=document.createElement('div');this.strip.id='contaFaixa';this.strip.hidden=true;
  this.strip.innerHTML=`<button id="contaBotao" type="button">${PERSON}<span id="contaRotulo">Entrar com Google</span></button><span id="contaDica">Teste: seus recordes na sua conta.</span>`;
  document.querySelector('#menu .menu-tools')?.after(this.strip);
  this.dialog=document.createElement('dialog');this.dialog.id='contaDialog';this.dialog.setAttribute('aria-labelledby','contaTitulo');
  this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="contaTitulo">SUA CONTA</h2></div><button id="contaFechar" type="button" aria-label="Fechar">✕</button></div>
<div class="conta-corpo">
 <section id="contaFora"><p>Entre com a sua conta Google para guardar seus recordes em qualquer navegador. Por enquanto é um teste, só para os pilotos convidados.</p><button id="contaEntrar" class="conta-principal" type="button">${PERSON}Entrar com Google</button></section>
 <section id="contaDentro" hidden>
  <form id="contaApelidoForm"><label for="contaApelido">SEU APELIDO NOS RECORDES</label><div class="conta-linha"><input id="contaApelido" maxlength="20" autocomplete="nickname" spellcheck="false" required><button id="contaSalvar" class="conta-principal" type="submit">Salvar</button></div><small>3 a 20 letras ou números. Todo mundo vê este nome.</small></form>
  <p id="contaDesde"></p>
  <div class="conta-acoes"><a id="contaDados" href="${API}meus-dados" download="autopobre-meus-dados.json">Baixar meus dados</a><button id="contaSair" type="button">Sair</button><button id="contaApagar" class="conta-perigo" type="button">Apagar conta</button></div>
 </section>
 <p class="conta-privacidade">Guardamos só o número que o Google dá à sua conta, o apelido e as datas em que você entrou. Nada de nome, e-mail ou foto.</p>
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
  this.show(data.conta);this.strip.hidden=false;
  const store=session();
  if(store?.getItem(SIGNING_IN)){
   store.removeItem(SIGNING_IN);
   if(!this.account)this.open('Não deu para entrar: o login foi cancelado, ou esta conta Google ainda não está na lista dos pilotos de teste.',true);
   else if(!this.account.apelido)this.open('Pronto, você entrou. Agora escolha o apelido que vai aparecer nos recordes.');
  }
  return true;
 }
 show(account){
  this.account=account;const $=id=>document.getElementById(id);
  $('contaRotulo').textContent=account?account.apelido||'Escolha seu apelido':'Entrar com Google';
  $('contaDica').hidden=!!account;
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
