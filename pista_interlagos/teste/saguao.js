// Online for the hosts' invitations: while the game is open and its pilot signed in with a nickname, one
// line to the room server's lobby (sala-cloudflare Saguao), whatever screen or race this page is on. A
// room's host sees who is online there and invites one (multiplayer.js); the invitation shows here: taken,
// this page opens that room, and the invitation stands for the password and the door (net-room.js
// keepInvite, net-link.js). The line says nothing but the account's pass and an echo now and then (the
// server answers it without waking up: an idle line costs nothing). Only the test version builds it, with
// the multiplayer and the accounts (main.js loads it there).
//
// The invitation's words (the host's name) reach the page only as text; the room's name never shows. Its
// secret part (after its "_") goes to this browser's store, as the room's own link does (net-room.js
// roomAddress), and the address opened is the hidden one.
import {ROOM_SERVER,LOCAL_SERVER} from './net-link.js';
import {roomAddress,roomName,keepInvite,playerName} from './net-room.js';
// Seconds: the echo, a line with nothing heard for QUIET (dead without the browser noticing), the tries
// again after a drop, how long an invitation waits on screen.
const ECHO=30,QUIET=75,RETRIES=[2,5,15,30,60],SHOWN=60;
const store=()=>{try{return globalThis.localStorage??null;}catch{return null;}};

export class Lobby {
 // pass(): the account's pass for the lobby (conta.js roomPass('@saguao')); account(): the nickname, or
 // null (signed out: no line); racing(): this page is in a race (the invitation says leaving it).
 // open(hash): what accepting does (by default: this page opens that room).
 constructor({server,pass,account,racing=()=>false,open=hash=>{location.hash=hash;location.reload();},socket=url=>new WebSocket(url)}){
  Object.assign(this,{server,pass,account,racing,open,socket});this.ws=null;this.tries=0;this.heard=0;this.stopped=false;this.offer=null;
  this.timer=setInterval(()=>this.tick(),1000);
  this.tick();
 }
 tick(){
  const now=performance.now()/1000,name=this.account();
  if(!name||this.stopped){if(this.ws)this.drop();return;}
  if(!this.ws&&!this.waiting&&now>=(this.next??0)){this.connect();return;}
  if(this.ws?.readyState===1){
   if(now-(this.echoed??0)>=ECHO){this.echoed=now;try{this.ws.send('{"t":"eco"}');}catch{}}
   if(now-this.heard>QUIET)this.drop(true);
  }
  if(this.offer&&now>this.offer.until)this.dismiss();
 }
 async connect(){
  this.waiting=true;let pass;
  try{pass=await this.pass();}catch{pass=null;}
  this.waiting=false;
  if(!pass?.passe){this.later();return;}
  let ws;try{ws=this.ws=this.socket(this.server+'/saguao');}catch{this.ws=null;this.later();return;}
  this.heard=performance.now()/1000;
  ws.onopen=()=>{try{ws.send(JSON.stringify({t:'auth',passe:pass.passe}));}catch{}};
  ws.onmessage=e=>{
   if(ws!==this.ws||typeof e.data!=='string'||e.data.length>4096)return;
   this.heard=performance.now()/1000;
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m?.t==='welcome')this.tries=0;
   else if(m?.t==='convite')this.invited(m);
  };
  ws.onclose=e=>{
   if(ws!==this.ws)return;this.ws=null;
   // Opened on more pages than the lobby takes: this one gives way for good.
   if(e.code===4010){this.stopped=true;return;}
   this.later();
  };
  ws.onerror=()=>{};
 }
 later(){this.next=performance.now()/1000+RETRIES[Math.min(this.tries++,RETRIES.length-1)];}
 drop(again=false){const ws=this.ws;this.ws=null;try{ws?.close(1000);}catch{}if(again)this.later();}
 // An invitation, checked as the page takes anything from outside: who, which room (its address as the
 // room server took it), and the room's own token.
 invited(m){
  const from=playerName(m.de)||'Um anfitrião',address=typeof m.sala==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(m.sala)?m.sala:null,room=address&&roomName(address);
  if(!room||typeof m.convite!=='string'||m.convite.length>1024)return;
  this.show({from,address,room,token:m.convite});
 }
 show(offer){
  this.offer={...offer,until:performance.now()/1000+SHOWN};
  if(!this.root)this.build();
  this.who.textContent=offer.from;
  this.accept.textContent=this.racing()?'Sair da corrida e entrar':'Entrar na sala';
  this.root.hidden=false;
 }
 build(){
  const link=document.createElement('link');link.rel='stylesheet';link.href='./convites.css'+new URL(import.meta.url).search;document.head.append(link);
  const root=this.root=document.createElement('section');root.id='conviteSala';root.setAttribute('role','alertdialog');root.setAttribute('aria-label','Convite para uma sala');root.hidden=true;
  const text=document.createElement('p');this.who=document.createElement('b');
  text.append(this.who,' convidou você para uma corrida. Você entra direto na sala, sem senha.');
  const row=document.createElement('div');
  this.accept=document.createElement('button');this.accept.type='button';this.accept.className='convite-sim';this.accept.onclick=()=>this.take();
  const no=document.createElement('button');no.type='button';no.textContent='Agora não';no.onclick=()=>this.dismiss();
  row.append(this.accept,no);root.append(text,row);
  // Its keys are its own (main.js reads keys on the document: Enter or Space here never drive).
  root.addEventListener('keydown',e=>e.stopPropagation());
  document.body.append(root);
 }
 dismiss(){this.offer=null;if(this.root)this.root.hidden=true;}
 // Taken: the invitation kept for that room, its secret too, and the room opened at its hidden address.
 take(){
  const offer=this.offer;if(!offer)return;this.dismiss();
  const s=store();keepInvite(s,offer.room,offer.token);
  const address=roomAddress('#desafio='+offer.address,s);
  // (on this machine the room server is the local one too)
  this.open(address.shown+(this.server===LOCAL_SERVER?'&servidor=local':''));
 }
 info(){return {online:this.ws?.readyState===1,offer:this.offer&&{from:this.offer.from}};}
}

// The lobby's server for this page: the room server online; on this machine only the local one, and only
// when the address asks for it (servidor=local), so the plain preview opens no line that cannot answer.
export function lobbyServer(where=globalThis.location){
 const local=/(^|[#&?])servidor=local\b/.test((where?.hash??'')+'&'+(where?.search??''));
 if(local)return LOCAL_SERVER;
 return where?.protocol==='https:'?ROOM_SERVER:null;
}
// (window.interlagosSaguao: for the checks, verificar_sala_conta.py)
export function startLobby(options){
 const server=options.server??lobbyServer();if(!server)return null;
 const lobby=new Lobby({...options,server});globalThis.interlagosSaguao={info:()=>lobby.info()};return lobby;
}
