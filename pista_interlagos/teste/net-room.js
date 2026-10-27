// Multiplayer room (multiplayer.js). Two ways to carry the same messages:
// - online (the default): through the room server (net-link.js, sala-cloudflare), for players on
//   different machines. The server checks the account and the password (or an invitation), says who
//   is who and who hosts, lets a guest in once the host admits it, and relays: this module then takes
//   its word for the roles;
// - same machine (&local=1): windows of one browser talk through a BroadcastChannel, with no server
//   and no network; the windows elect their host among themselves.
// The first window in a room hosts it: it gives out the seats (a seat is one of the grid's 15 cars:
// each pilot gets the one chosen on the car screen when nobody else has it, else the first free
// one), announces each race and holds its start until the host gives it. A guest races once it says
// it waits for the start (wait: its "Aguardar início da corrida", after picking its car): whoever
// says so before the start is seated, even while the race already waits on the grid, and whoever is
// still loading then races the next one. The host's car starts at the
// back of the grid (race.car: the field is race-roster.js fieldRoster of it). During the race the
// host relays the whole field; a guest whose line drops keeps its seat, its car rolling on without a
// driver (no bot takes it) until it is back. Everything received is checked before use, and a sender that floods
// is cut off. No DOM here: testar_multiplayer.mjs runs two rooms in Node.
import {CAR_CHOICES} from './race-roster.js';
import {readCar} from './net-cars.js';
import {TIMES_OF_DAY,RAIN_LEVELS} from './weather.js';
import {CHAT_LENGTH,chatText,chatLink} from './chat-text.js';
import {normalizeLook,LOOK_FIELDS} from './pilot-look.js';
// The seats, the 99 first: the car of a pilot who asks for none (or for one already taken).
export const SEATS=Object.freeze(CAR_CHOICES.map(e=>e.number));
// Seconds: a silent player (or host) is gone after SILENT; a window hosts once ELECTION passes
// with no host heard; a guest seated in a race that waits for its start (loading it, or drawing its
// first frames) may stay silent up to READY_WAIT; online the server says when a connection closes,
// so silence only drops a player after ONLINE_SILENT; a gap
// longer than FROZEN between two ticks is this window's own freeze; two hosts whose ages differ
// by less than TIE began together. A host that said goodbye (a reload says it too) has HOST_GRACE to
// come back before its guests elect another; its tab keeps its identity (sessionStorage), and back
// within RECLAIM it takes its room again. A restored identity watches TWIN seconds for a live window
// with the same one (a duplicated tab copies sessionStorage): then it takes a new one. Online, the
// tab asks the room server for an echo every ECHO seconds (the server answers it itself, whatever the
// host is doing): one ECHO_LATE seconds late says the line is down (lineQuiet: multiplayer.js stands a
// host's race still), and none for LINK_QUIET is a dead connection the browser has not noticed yet (it
// may take it a minute), so it connects again. A server without the echo is never checked. In a race
// under way the same-machine room's guests wait RACE_HOST_WAIT for a host gone quiet (not one that said
// goodbye) before electing another (the race stands still meanwhile; online the room server keeps a
// racing host's place as long).
const SILENT=3,ONLINE_SILENT=30,ELECTION=.9,READY_WAIT=60,FROZEN=.25,TIE=.5,BEACON=1,PING=1,HELLO=2,RATE=240,HOST_GRACE=10,RECLAIM=30,TWIN=3,ECHO=1,ECHO_LATE=2.5,LINK_QUIET=10,RACE_HOST_WAIT=600;
const SAVED='autopobre-sala-id-',SAVED_SEAT='autopobre-sala-carro-';
// Why a connection ended that is tried again (net-link.js), the tab still who it was in the room.
const LINE_TROUBLE=new Set(['reconectando','fora','contas','salas']);
const sessionStore=()=>{try{return globalThis.sessionStorage??null;}catch{return null;}};
function readSaved(storage,room){
 try{const v=JSON.parse(storage?.getItem(SAVED+room)||'null');return v&&isId(v.id)&&typeof v.host==='boolean'&&isNum(v.at,0,1e14)?{...v,since:isNum(v.since,0,1e14)?v.since:null,number:SEATS.includes(v.number)?v.number:null}:null;}catch{return null;}
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isId=v=>typeof v==='string'&&/^[0-9a-f]{8}$/.test(v);
const isInt=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const isNum=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const isCar=v=>readCar(v)!==null;
const seatKey=seats=>seats.map(s=>s.number+':'+s.name).join('|');
const randomId=random=>Array.from({length:8},()=>Math.floor(random()*16).toString(16)).join('');
// Room names: lowercase letters, digits and dashes; the address carries the whole key.
export function roomName(value){
 const name=String(value??'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9-]/g,'').slice(0,24);
 return name||null;
}
// The address names the room in #desafio=NOME (main.js looks for the same key before loading
// multiplayer.js). The old links, #sala= and #corrida=, open no room on purpose.
const ROOM_KEY='desafio';
const query=hash=>new URLSearchParams(String(hash??'').replace(/^#/,''));
// The room's name as the address writes it (null: no room).
export const roomIn=hash=>query(hash).get(ROOM_KEY);
// A room name may end in a secret: whatever follows its first "_" (#desafio=amigos_xyz7). The screen
// never shows it, so a pilot can share his screen on a live stream without handing the room to the
// viewers: the room card and the address bar read amigos_*** (roomAddress keeps the address). The room is still
// the whole name, as before ("_" is not kept: amigos_xyz7 is the room amigosxyz7).
export const HIDDEN='***';
// (a secret kept from an old #sala= link, under autopobre-sala-segredo-, does not open a #desafio= one)
const SECRETS='autopobre-desafio-segredo-';
// The room's name as the screen shows it (null: no room), from the address's whole or hidden one.
export function roomLabel(value){
 const raw=String(value??''),cut=raw.indexOf('_');if(cut<0)return roomName(raw);
 const shown=roomName(raw.slice(0,cut))??'',tail=raw.slice(cut+1);return roomName(tail)||tail===HIDDEN?`${shown}_${HIDDEN}`:shown||null;
}
// The address to read the room from and the one to show instead (hash: index.html's #…). A secret
// that comes in whole is kept in this browser (store: localStorage), by the part shown, so the
// address with it hidden still opens the room after F5 or in another tab here. lost: the address came
// with the secret hidden and this browser never saw it (copied off someone's stream): no room.
export function roomAddress(hash,store){
 const q=query(hash),value=q.get(ROOM_KEY)??'',cut=value.indexOf('_'),plain={hash,shown:hash,lost:false};
 if(cut<0)return plain;
 const head=value.slice(0,cut),tail=value.slice(cut+1),key=SECRETS+(roomName(head)??'');let full=value;
 if(tail===HIDDEN){
  try{full=String(store?.getItem(key)??'');}catch{full='';}
  const at=full.indexOf('_');if(at<0||!roomName(full.slice(at+1)))return {...plain,lost:true};
 }else if(!roomName(tail))return plain;
 else try{store?.setItem(key,value);}catch{}
 const as=v=>{q.set(ROOM_KEY,v);return '#'+q.toString();};
 return {hash:as(full),shown:as(`${head}_${HIDDEN}`),lost:false};
}
// A host's invitation to a room, kept in this browser (localStorage) once the pilot took it (saguao.js),
// by the room's name: the room server takes it instead of the password (net-link.js sends it), until it
// runs out; refused, it goes (dropInvite).
const INVITES='autopobre-convite-';
export function keepInvite(store,room,token){try{if(roomName(room)===room&&typeof token==='string'&&token.length<=1024)store?.setItem(INVITES+room,token);}catch{}}
export function savedInvite(store,room){try{const t=store?.getItem(INVITES+room);return typeof t==='string'&&t.length<=1024?t:null;}catch{return null;}}
export function dropInvite(store,room){try{store?.removeItem(INVITES+room);}catch{}}
// A pilot's name as the others see it: plain text without control or format characters (bidi
// overrides, zero-width), at most 24 characters. It is only ever shown as text.
export function playerName(value){return String(value??'').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,24);}
// The room's chat (multiplayer.js T): a line of CHAT_LENGTH characters at most, no links, one every
// CHAT_GAP seconds from this window; cleaned as the room server cleans it (chat-text.js, the same file).
export {CHAT_LENGTH,chatText,chatLink} from './chat-text.js';
export const CHAT_GAP=2;
// index.html#desafio=NOME[&carro=73][&auto=1][&fantasmas=1][&local=1][&servidor=local][&lag=150][&perda=5];
// null without a room. label: the room's name as shown (roomLabel: NOME_SEGREDO shows NOME_***; the
// hidden address is read by roomAddress first). carro: the car asked for, instead of the car screen's choice. fantasmas: the
// host's races let humans pass through each other (by default they collide). local: this browser's
// windows only, no server. servidor=local: wrangler dev here.
// address: the room's name as written (its secret too), for an invitation (only the letters, digits, "_"
// and "-" the room server takes; the room is the same once read as a name).
export function roomParams(hash){
 const q=query(hash),room=roomName(q.get(ROOM_KEY));if(!room)return null;
 const address=String(q.get(ROOM_KEY)).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
 const num=(key,hi)=>{const v=Number(q.get(key));return Number.isFinite(v)?clamp(v,0,hi):0;},car=q.get('carro');
 return {room,address,label:roomLabel(q.get(ROOM_KEY)),car:SEATS.includes(car)?car:null,auto:q.get('auto')==='1',ghosts:q.get('fantasmas')==='1',local:q.get('local')==='1',server:q.get('servidor')==='local'?'local':null,lag:num('lag',1000),loss:num('perda',50)/100};
}
// A pilot's look (pilot-look.js: the Visual screen's choices, by name): only its own fields, short names; taken
// through normalizeLook on arrival, so an unknown choice becomes the default one. null: no look of their own.
const validLook=v=>v===undefined||v===null||!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=LOOK_FIELDS.length&&Object.entries(v).every(([k,x])=>LOOK_FIELDS.includes(k)&&typeof x==='string'&&x.length<=24);
// What a car carries beside its motion (multiplayer.js extras): its pilot out of it on foot (pe: x, y, z, the way he
// faces, running 0/1, crouched 0..1, off the ground in m) and the car's parts held open (ab: car-openings.js
// SHARED_OPENINGS bits). Seen only: nothing here moves a car or counts in a race.
const validWalk=v=>Array.isArray(v)&&(v.length===7||v.length===8&&isInt(v[7],0,1023))&&isNum(v[0],-1e5,1e5)&&isNum(v[1],-1e5,1e5)&&isNum(v[2],-2000,9000)&&isNum(v[3],-1e3,1e3)&&(v[4]===0||v[4]===1)&&isNum(v[5],0,1)&&isNum(v[6],0,60);
const validMask=v=>v===undefined||isInt(v,0,127);
export const validExtra=e=>!!e&&typeof e==='object'&&!Array.isArray(e)&&(e.pe===undefined||validWalk(e.pe))&&validMask(e.ab)&&(e.g===undefined||e.g===1);
const validSeat=s=>s&&typeof s==='object'&&isId(s.id)&&typeof s.name==='string'&&s.name.length<=64&&SEATS.includes(s.number);
const validSeats=v=>Array.isArray(v)&&v.length<=SEATS.length&&v.every(validSeat);
const validPick=v=>v===undefined||isInt(v,0,1e9);
const validWait=v=>v===undefined||typeof v==='boolean';
// The cars whose pilots' lines dropped during the race (the host's word, multiplayer.js): which,
// where they are in their wait (stopping on the road, on the tow truck's strap, or off the road),
// whether that pilot may still come back for it (back; a host without it: yes), and the side of the
// track the tow takes it to (side, 1 left or -1 right; a host without it: each window works it out).
export const STOP_STAGES=Object.freeze(['parado','reboque','fora']);
const validStops=v=>v===undefined||Array.isArray(v)&&v.length<=SEATS.length&&v.every(x=>x&&typeof x==='object'&&SEATS.includes(x.number)&&STOP_STAGES.includes(x.stage)&&(x.back===undefined||typeof x.back==='boolean')&&(x.side===undefined||x.side===1||x.side===-1));
const sameStops=(a,b)=>a.length===b.length&&a.every((x,i)=>x.number===b[i].number&&x.stage===b[i].stage&&(x.back??true)===(b[i].back??true)&&x.side===b[i].side);
function validRace(r){
 return r===null||r&&typeof r==='object'&&isId(r.id)&&typeof r.circuit==='string'&&/^[a-z0-9_-]{1,32}$/.test(r.circuit)&&isInt(r.laps,1,50)&&isInt(r.seed,0,4294967295)&&SEATS.includes(r.car)
  &&typeof r.ace==='boolean'&&typeof r.retirements==='boolean'&&typeof r.ghosts==='boolean'&&(r.level===null||typeof r.level==='string'&&/^[a-z]{1,16}$/.test(r.level))&&validSeats(r.seats)&&['waiting','racing','finished'].includes(r.state)&&(r.assiste===undefined||r.assiste===true)
  // The host's weather (weather.js); a room from before it has none.
  &&(r.time===undefined||TIMES_OF_DAY.some(([v])=>v===r.time))&&(r.rain===undefined||RAIN_LEVELS.some(([v])=>v===r.rain));
}
export function validMessage(m){
 if(!m||typeof m!=='object'||typeof m.t!=='string'||!isId(m.from))return false;
 switch(m.t){
  case 'hello':return typeof m.name==='string'&&m.name.length<=64&&(m.want===null||SEATS.includes(m.want))&&validPick(m.pick)&&validWait(m.wait)&&validLook(m.look);
  case 'bye':case 'fechar':return true;
  case 'lobby':return typeof m.name==='string'&&m.name.length<=64&&isNum(m.age,0,1e7)&&Array.isArray(m.players)&&m.players.length<=32&&m.players.every(p=>p&&isId(p.id)&&typeof p.name==='string'&&p.name.length<=64&&(p.number===null||SEATS.includes(p.number))&&validPick(p.pick)&&validWait(p.wait)&&validLook(p.look))&&validRace(m.race)&&validStops(m.stops);
  case 'ready':return isId(m.race);
  case 'go':return isId(m.race)&&validSeats(m.seats);
  case 'ping':return isInt(m.n,0,1e9);
  case 'pong':return isId(m.to)&&isInt(m.n,0,1e9);
  case 'state':return isId(m.race)&&isInt(m.seq,0,1e9)&&isNum(m.lat,0,5)&&isCar(m.car)&&(m.pe===undefined||validWalk(m.pe))&&validMask(m.ab);
  case 'snap':return isId(m.race)&&isInt(m.seq,0,1e9)&&Array.isArray(m.cars)&&m.cars.length<=SEATS.length&&m.cars.every(c=>Array.isArray(c)&&(c.length===3||c.length===4&&validExtra(c[3]))&&SEATS.includes(c[0])&&isNum(c[1],0,5)&&isCar(c[2]));
  case 'chat':return typeof m.name==='string'&&m.name.length<=64&&typeof m.text==='string'&&m.text.length<=4*CHAT_LENGTH;
  default:return false;
 }
}
// The room server's own word (online): who this tab is and its role, a knock at the host's door, a
// guest let in (and whose room it is), the host gone for a moment, back, replaced, or gone for good
// with nobody to take its place (host: null), and this tab made host.
const TOKEN=/^[0-9a-f]{32}$/,ACCOUNT=/^[A-Za-z0-9_-]{22}$/;
export function validControl(m){
 switch(m?.t){
  case 'welcome':return isId(m.id)&&TOKEN.test(m.token)&&['host','guest'].includes(m.role)&&(m.host===null||isId(m.host))&&typeof m.pending==='boolean';
  case 'knock':return isId(m.id)&&typeof m.name==='string'&&m.name.length<=64;
  case 'host':return m.id===null||isId(m.id);
  case 'role':return m.role==='host';
  case 'admitted':return m.host===undefined||m.host===null||isId(m.host);
  case 'host-away':return true;
  // (the host's: who is online, for its invitations, and whether one reached the pilot)
  // (convidado: invited, not taken yet; cedo: an invitation asked for too soon after the last)
  case 'online':return Array.isArray(m.pilotos)&&m.pilotos.length<=50&&m.pilotos.every(p=>p&&typeof p==='object'&&ACCOUNT.test(p.conta)&&typeof p.nome==='string'&&p.nome.length<=64&&(p.convidado===undefined||p.convidado===true));
  case 'convidado':return ACCOUNT.test(m.conta)&&typeof m.entregue==='boolean'&&(m.cedo===undefined||m.cedo===true);
  case 'desconvidado':return ACCOUNT.test(m.conta)&&typeof m.ok==='boolean';
  default:return false;
 }
}
// Names from the wire are cleaned on arrival as well: the host cleans what it hands out, but a guest
// does not rely on that (a lying host could send bidi overrides or zero-width characters).
const cleanSeats=seats=>seats.map(s=>({...s,name:playerName(s.name)||'Piloto'}));
function cleanNames(m){
 if(m.t==='lobby')return {...m,name:playerName(m.name)||'Anfitrião',players:m.players.map(p=>({...p,name:playerName(p.name)||'Piloto',look:normalizeLook(p.look)})),race:m.race&&{...m.race,seats:cleanSeats(m.race.seats)}};
 if(m.t==='go')return {...m,seats:cleanSeats(m.seats)};
 if(m.t==='chat')return {...m,name:playerName(m.name)||'Piloto',text:chatText(m.text)};
 return m;
}
export class Room {
 // clock: seconds; random: ids and seeds; storage: where the tab keeps its identity (all three
 // replaceable in tests); lag (ms) and loss (share of car messages dropped) simulate a network on the
 // receiving side.
 // link: the room server's connection (net-link.js); without it, the same-machine BroadcastChannel.
 // want: the car this window asks for (the car screen's choice); pick marks the last choice made here
 // (a new random number each time, so a reloaded tab's 0 is never mistaken for a newer choice), acked
 // the last one the host has answered (granted, or refused for a car already taken). wait: this
 // guest waits for the start (setWaiting).
 constructor({room,name='',want=null,wait=false,lag=0,loss=0,channel=null,link=null,clock=()=>performance.now()/1000,random=Math.random,storage=sessionStore()}={}){
  // Online the server's token is the tab's identity (net-link.js); the tab still keeps its seat
  // (seatStore), so a reload asks for the car it had, as the same-machine room does.
  this.online=!!link;this.seatStore=this.online?storage:null;if(this.online)storage=null;
  Object.assign(this,{room,want:SEATS.includes(want)?want:null,lag,loss,clock,random,storage,link});this.name=playerName(name)||'Piloto';this.pick=this.acked=0;this.waiting=!!wait;
  this.knocks=new Map();this.pending=false;this.problem=null;this.trail=[];
  // A guest's line dropped: what it knows of the room (its seat in the race under way) is from before
  // the drop until the host's next lobby.
  this.outdated=false;
  // The identity this tab had before a reload, if any: its id, its seat, and whether it hosted.
  const saved=this.restored=readSaved(storage,room);this.id=saved?.id??randomId(random);
  this.lastNumber=saved?.number??(()=>{try{const n=this.seatStore?.getItem(SAVED_SEAT+room);return SEATS.includes(n)?n:null;}catch{return null;}})();
  this.role=null;this.hostId=null;
  this.players=new Map();  // host: everyone in the room, the host too: id -> {id,name,number,seen}
  this.lobby=null;         // guest: the host's last word on the room
  this.race=null;          // host: the race announced; guest: the race joined (or waiting to start)
  this.ready=new Set();this.latency=0;this.pings=new Map();this.pingN=0;
  this.away=new Map();     // host: guests whose line dropped during the race under way: id -> their seat, kept for their return
  this.stops=[];           // host: their cars, waiting for them ({number, stage}, setStops), told in the lobby
  this.nextPing=0;this.nextBeacon=0;this.nextHello=0;this.hostSeen=0;this.electUntil=0;this.rates=new Map();this.events={};
  if(this.online){link.onmessage=m=>this.arrive(m);link.onclose=reason=>this.closed(reason);link.onopen=()=>{this.problem=null;if(this.echo!==undefined)this.echo=this.clock();this.emit('change');};}
  else{this.channel=channel??new BroadcastChannel('autopobre-sala-'+room);this.channel.onmessage=e=>this.arrive(e.data);}
 }
 on(name,fn){this.events[name]=fn;return this;}
 // The room's last events (who came, who went, the connection), for the checks and a bug report.
 note(text){this.trail.push(`${this.clock().toFixed(2)} ${text}`);if(this.trail.length>40)this.trail.shift();}
 emit(name,...args){return this.events[name]?.(...args);}
 // This window's seat, the car it races (a guest's comes from the host; null: none free), and the host's.
 get number(){return this.role==='host'?this.players.get(this.id)?.number??null:this.lobby?.players.find(p=>p.id===this.id)?.number??null;}
 get hostNumber(){return this.role==='host'?this.number:this.lobby?.players.find(p=>p.id===this.hostId)?.number??null;}
 get members(){return this.role==='host'?[...this.players.values()]:this.lobby?.players??[];}
 // Whether the host has answered this window's last choice (number is then its verdict); with no
 // choice made in this tab yet (pick 0: new, or back from a reload) there is nothing to answer.
 get settled(){return this.role==='host'||!this.pick||this.pick===this.acked;}
 // The car to ask a host for: the last choice not answered yet, else the seat this window had (a
 // host back from a reload, or a new host, gives it again), else the choice.
 asking(){return this.pick&&this.pick!==this.acked?this.want:this.lastNumber??this.want;}
 // The player picked a car on the car screen: the host takes it at once if nobody has it; a guest
 // asks the host, who gives it now or when the race that guest is in ends (grant).
 choose(number){
  if(!SEATS.includes(number))return;this.want=number;const last=this.pick;this.pick=1+Math.floor(this.random()*1e9);if(this.pick===last)this.pick=last%1e9+1;
  if(this.role==='host'){this.acked=this.pick;const p=this.players.get(this.id);p.pick=p.done=this.pick;p.wish=number;this.grant();this.beacon();}
  else if(this.role==='guest'&&!this.pending)this.hello();
  this.emit('change');
 }
 // A guest's "Aguardar início da corrida" (its car picked): the host seats it in the race it holds
 // on the grid, or in the next one. Taken back, the guest leaves a race that has not started yet.
 setWaiting(on){
  on=!!on;if(on===this.waiting)return;this.waiting=on;
  if(!on&&this.role==='guest'&&this.race?.state==='waiting')this.race=null;
  if(this.role==='guest'&&!this.pending)this.hello();
  this.emit('change');
 }
 // A host back from a reload takes its room again at once, as old as it was; anyone else elects.
 start(){
  // Online the server says who hosts (welcome): nothing to elect.
  if(this.online){this.role=null;this.problem='conectando';this.link.open();this.emit('change');return;}
  const r=this.restored,now=this.clock();this.twinUntil=r?now+TWIN:0;
  if(r?.host&&r.since!==null&&Date.now()-r.at<RECLAIM*1000)this.becomeHost(now,r.since);else this.elect();
 }
 leave(){if(this.online){this.send({t:'bye'});this.link.close();return;}this.save();this.send({t:'bye'});this.channel.close();}
 // Online, after a refusal the player can fix (the password, signing in): connect again.
 retry(){if(this.online){this.link.close();this.start();}}
 // Whether this tab came in by a host's invitation (net-link.js invited): no password is ever asked of it.
 get invited(){return !!this.link?.invited;}
 // The connection ended: the reason the server gave (net-link.js CLOSED), or the network's. A line
 // that dropped is tried again (net-link.js; so is an accounts server out of reach, contas): back in
 // time, the tab is who it was, in its race. Who knocked meanwhile may have gone: a host welcomed back
 // hears every knock still at the door again.
 closed(reason){
  if(reason!==this.problem)this.note('conexão: '+reason);this.problem=reason;this.outdated=true;this.knocks.clear();if(!LINE_TROUBLE.has(reason)){this.role=null;this.pending=false;}
  this.emit('change');
 }
 // The chat: a line from this window to everyone in the room (chatText cleans it; online the server
 // cleans it again and keeps its own pace), shown here at once ('chat', mine). Not from the door, nor
 // sooner than CHAT_GAP after the last one: false (the line stays to be sent again).
 say(value){
  const text=chatText(value),now=this.clock();
  if(!text||chatLink(text)||!this.role||this.pending||now-(this.saidAt??-Infinity)<CHAT_GAP)return false;
  this.saidAt=now;this.send({t:'chat',name:this.name,text});this.emit('chat',{id:this.id,name:this.name,text,mine:true});return true;
 }
 // Online: the server's word on who this tab is, who hosts, and who waits at the door.
 control(m,now){
  switch(m.t){
   case 'welcome':{
    // A new id: the server no longer knew this tab (it restarted and lost the room): a new player.
    const renamed=this.id!==m.id;
    this.note(`welcome ${m.role}${m.pending?' (porta)':''}${renamed&&this.role?' (nova identidade)':''}`);this.id=m.id;this.problem=null;this.pending=m.pending;
    if(m.role==='host'){if(this.role!=='host'||renamed)this.becomeHost(now);}
    else{if(this.role!=='guest'||this.hostId!==m.host||renamed){this.race=null;this.lobby=null;}this.role='guest';this.hostId=m.host;this.hostSeen=now;this.hostLeft=undefined;if(!m.pending)this.hello();}
    break;
   }
   // (whose room it is: one let in after waiting where nobody hosted yet learns it here)
   case 'admitted':this.pending=false;if(m.host&&m.host!==this.hostId){this.hostId=m.host;this.race=null;this.lobby=null;}this.hostSeen=now;this.hello();break;
   case 'knock':if(this.role==='host'&&!this.players.has(m.id))this.knocks.set(m.id,{id:m.id,name:playerName(m.name)||'Piloto'});break;  // again: a new name
   case 'host-away':if(this.role==='guest')this.hostLeft=now;break;
   // The host is back (same id) or another took the room: a new host starts a new room state. None
   // (null): the host is gone for good and nobody with the host's password is here to take over.
   case 'host':if(this.role==='guest'){
    if(m.id!==this.hostId){this.hostId=m.id;this.race=null;this.lobby=null;}this.hostLeft=undefined;this.hostSeen=now;
    if(m.id)this.hello();
   }break;
   // (from the door too: whoever has the host's password takes a room left without a host)
   case 'role':this.pending=false;this.becomeHost(now);break;
   case 'online':if(this.role==='host')this.emit('online',m.pilotos.map(p=>({conta:p.conta,nome:playerName(p.nome)||'Piloto',convidado:!!p.convidado})));break;
   case 'convidado':if(this.role==='host')this.emit('invited',m.conta,m.entregue,!!m.cedo);break;
   case 'desconvidado':if(this.role==='host')this.emit('uninvited',m.conta,m.ok);break;
  }
  this.emit('change');
 }
 // Host, online: who is online now (the 'online' event brings them), and an invitation to one of them
 // to this room by its address (its name as written, its secret too: the invited pilot's game opens it).
 askOnline(){if(this.role==='host'&&this.online)this.send({t:'online'});}
 invite(account,address){if(this.role==='host'&&this.online&&ACCOUNT.test(account??''))this.send({t:'convidar',conta:account,endereco:address});}
 // Host, online: an invitation not taken yet is cancelled (the 'uninvited' event says whether it was).
 uninvite(account){if(this.role==='host'&&this.online&&ACCOUNT.test(account??''))this.send({t:'desconvidar',conta:account});}
 // Host, online: let a guest in, turn it away, or send it out for good.
 admit(id){if(this.role!=='host')return;this.knocks.delete(id);this.send({t:'admit',to:id});this.emit('change');}
 deny(id){if(this.role!=='host')return;this.knocks.delete(id);this.send({t:'deny',to:id});this.emit('change');}
 // The host closes the room (Fechar sala; the team's wish, 10-26): online the server lets everybody go, this tab
 // too (net-link.js CLOSED 4017: 'fechada', nobody tries again); here every window hears it and this one is out at
 // once. False: not the host, or not in the room.
 closeRoom(){if(this.role!=='host'||this.problem!==null)return false;this.note('sala fechada');this.send({t:'fechar'});if(!this.online)this.closed('fechada');return true;}
 kick(id){if(this.role!=='host'||id===this.id)return;this.knocks.delete(id);this.send({t:'kick',to:id});this.drop(id);this.away.delete(id);}
 // The tab's identity, for a reload: id, seat, whether it hosts and since when (wall clock).
 save(){this.lastNumber=this.number??this.lastNumber;try{if(this.lastNumber)this.seatStore?.setItem(SAVED_SEAT+this.room,this.lastNumber);}catch{}try{this.storage?.setItem(SAVED+this.room,JSON.stringify({id:this.id,host:this.role==='host',since:this.role==='host'?this.hostEpoch:null,number:this.lastNumber,at:Date.now()}));}catch{}}
 // Another live window has this identity (a duplicated tab): this one takes a new id and elects.
 renew(){this.id=randomId(this.random);this.restored=null;this.twinUntil=0;this.lastNumber=null;this.save();this.elect();}
 // A guest whose host said goodbye and has not come back yet.
 get hostAway(){return this.role==='guest'&&this.hostLeft!==undefined;}
 // Online: this tab's line is down (closed, or the server's echo ECHO_LATE seconds late); the same-
 // machine room has no line of its own.
 lineQuiet(now=this.clock()){return this.online&&(this.problem!==null||this.echo!==undefined&&now-this.echo>ECHO_LATE);}
 // A guest still at the door (online) says its new name too: the host sees who is knocking.
 // This pilot's look (pilot-look.js), for the others to see on foot and at the wheel; told only when it changed.
 setLook(value){const look=normalizeLook(value),key=look?LOOK_FIELDS.map(k=>look[k]).join('|'):'';if(key===(this.lookKey??''))return;this.lookKey=key;this.look=look;if(this.role==='host'){const p=this.players.get(this.id);if(p)p.look=look;this.beacon();}else if(this.role==='guest'&&!this.pending)this.hello();}
 setName(value){const name=playerName(value)||'Piloto';if(name===this.name)return;this.name=name;if(this.role==='host'){this.players.get(this.id).name=name;this.beacon();}else if(this.role==='guest')this.hello();}
 send(m){m.from=this.id;if(this.online){this.link.send(m);return;}try{this.channel.postMessage(m);}catch{}}
 // The car asked for (asking), the choice it answers (pick: the host acts on a new one only) and
 // whether this guest waits for the start.
 hello(){this.helloAt=this.clock();this.nextHello=this.helloAt+HELLO;this.send({t:'hello',name:this.name,want:this.asking(),pick:this.pick,wait:this.waiting,look:this.look??null});}
 elect(){this.role=null;this.hostId=null;this.lobby=null;this.electUntil=this.clock()+ELECTION+this.lag/500;this.hello();this.emit('change');}
 arrive(m){
  if(this.loss&&(m?.t==='state'||m?.t==='snap')&&this.random()<this.loss)return;
  if(this.lag)setTimeout(()=>this.receive(m),this.lag*(.85+.3*this.random()));else this.receive(m);
 }
 // No more than RATE messages a second from anyone.
 allow(id,now){const r=this.rates.get(id);if(!r||now-r.since>=1){this.rates.set(id,{since:now,count:1});return true;}return ++r.count<=RATE;}
 receive(m){
  // (a room its host closed hears nothing more: closeRoom)
  if(this.problem==='fechada')return;
  // The server's echo: the line is alive.
  if(this.online&&m?.t==='eco'){this.echo=this.clock();return;}
  if(this.online&&validControl(m)){this.control(m,this.clock());return;}
  if(!validMessage(m))return;
  if(m.from===this.id){if(!this.online&&this.clock()<this.twinUntil)this.renew();return;}
  m=cleanNames(m);
  const now=this.clock();if(!this.allow(m.from,now))return;
  const host=this.role==='host',fromHost=this.role==='guest'&&m.from===this.hostId;
  switch(m.t){
   case 'hello':if(host)this.join(m.from,m.name,m.want,m.pick??0,now,!!m.wait,normalizeLook(m.look));break;
   case 'bye':if(host){this.note('bye '+m.from);this.drop(m.from);}else if(fromHost){this.hostLeft=now;this.emit('change');}break;
   // (here, the windows of one browser; online the server lets everybody go itself, net-link.js CLOSED)
   case 'fechar':if(fromHost&&!this.online)this.closed('fechada');break;
   case 'lobby':this.heardHost(m,now);break;
   case 'ready':if(host&&this.race?.id===m.race&&this.race.state==='waiting'&&this.race.seats.some(s=>s.id===m.from)&&!this.ready.has(m.from)){this.touch(m.from,now);this.ready.add(m.from);this.emit('change');}break;
   case 'go':if(fromHost&&this.race?.id===m.race&&this.race.state==='waiting'){this.hostSeen=now;this.race={...this.race,state:'racing',seats:m.seats};this.emit('go',this.race);this.emit('change');}break;
   case 'ping':if(host){this.touch(m.from,now);this.send({t:'pong',to:m.from,n:m.n});}break;
   case 'pong':if(m.to===this.id&&this.pings.has(m.n)){const half=(now-this.pings.get(m.n))/2;this.pings.delete(m.n);this.latency=this.latency?this.latency*.8+half*.2:half;}break;
   case 'state':if(host){this.touch(m.from,now);if(this.race?.id===m.race)this.emit('state',m.from,m);}break;
   case 'snap':if(fromHost&&this.race?.id===m.race){this.hostSeen=now;this.emit('snap',m);}break;
   // (online the server sends it only from someone let in, under that account's name)
   case 'chat':if(m.text&&!chatLink(m.text))this.emit('chat',{id:m.from,name:m.name,text:m.text});break;
  }
 }
 // A host's lobby: a guest follows it. Of two hosts in one room (one too busy to answer a new
 // window in time, or two windows electing at once), the older host keeps it; the smaller id if
 // they began together.
 heardHost(m,now){
  if(this.role==='host'){
   const mine=now-this.hostSince;
   if(Math.abs(m.age-mine)>TIE?m.age>mine:m.from<this.id)this.becomeGuest(m,now);return;
  }
  // A guest keeps its host; if that host steps down, its silence starts a new election.
  if(this.role==='guest'&&m.from!==this.hostId)return;
  this.becomeGuest(m,now);
 }
 becomeGuest(m,now){
  const joined=this.role!=='guest'||this.hostId!==m.from;
  if(joined){this.race=null;this.players.clear();this.ready.clear();}
  this.role='guest';this.hostId=m.from;this.hostSeen=now;this.hostLeft=undefined;this.lobby=m;this.outdated=false;
  const me=m.players.find(p=>p.id===this.id),mine=me?.number;if(mine&&mine!==this.lastNumber){this.lastNumber=mine;this.save();}
  if(me?.pick!==undefined)this.acked=me.pick;
  // Not in the host's list (new here, or the host is back from a reload): say hello again, soon.
  if(!m.players.some(p=>p.id===this.id)&&(joined||now-(this.helloAt??-Infinity)>=.5))this.hello();
  const race=m.race,seated=race?.seats.some(s=>s.id===this.id);
  // A new race with a seat for us, while we wait for one: the game loads it (false: not now, asked
  // again next lobby). A lobby from before our "not waiting" reached the host may still seat us.
  if(race&&seated&&race.state==='waiting'&&this.waiting&&this.race?.id!==race.id){const previous=this.race;this.race=race;if(this.emit('race',race)===false)this.race=previous;}
  // Seated again in the race under way after a connection made anew (a welcome after the key was
  // asked again forgets the room's race): this window races it still (multiplayer.js checkCut).
  else if(race&&seated&&race.state==='racing'&&this.waiting&&!this.race){this.race=race;this.emit('seats',race);}
  else if(race&&this.race?.id===race.id){
   // The lobby also carries the start, in case the go itself went missing, and the seats taken
   // while the start waits.
   const went=this.race.state==='waiting'&&race.state==='racing',moved=seatKey(this.race.seats)!==seatKey(race.seats),ended=this.race.state==='racing'&&race.state==='finished';
   this.race={...this.race,state:race.state,seats:race.seats,assiste:race.assiste};if(moved)this.emit('seats',this.race);if(went)this.emit('go',this.race);if(ended)this.emit('end',this.race);
  }
  this.emit('change');
 }
 // epoch: when this tab began hosting (wall clock), kept across a reload.
 becomeHost(now,epoch=Date.now()){
  this.role='host';this.hostId=this.id;this.hostEpoch=epoch;this.hostSince=now-Math.max(0,(Date.now()-epoch)/1000);this.lobby=null;this.race=null;this.ready.clear();this.players.clear();this.away.clear();this.stops=[];this.knocks.clear();
  // Its car: a choice the host it replaces had not answered yet, else the one it had (back from a
  // reload, or as a guest of that host), else its choice.
  const number=this.asking()??SEATS[0];this.acked=this.pick;
  this.players.set(this.id,{id:this.id,name:this.name,look:this.look??null,number,pick:this.pick,done:this.pick,wait:true,seen:now});this.save();this.beacon(now);this.emit('change');
  // The server's doorman stays on: every guest waits until the host lets it in.
  if(this.online)this.send({t:'config',porteiro:true});
 }
 // pick: the guest's last choice on its car screen; a new one is a wish for want (grant). 0 is no
 // choice yet (a tab back from a reload asks for the seat it had): any wish it left still stands.
 // wait: the guest waits for the start (seatEveryone); one that stops waiting during the race under
 // way has left it (the menu's way out): out of its seat, its car left without a driver ('leave',
 // multiplayer.js). A guest whose line dropped during that race and who still races it (wait) gets its
 // seat back, and its car where it stands.
 join(id,name,want,pick,now,wait=false,look=null){
  const p=this.players.get(id);
  if(p){
   const quit=p.wait&&!wait&&this.race?.state==='racing'&&this.race.seats.some(s=>s.id===id);
   p.name=playerName(name)||p.name;p.seen=now;p.wait=wait;p.look=look;if(pick&&pick!==p.pick){p.pick=pick;p.wish=want;this.grant();}
   if(quit){this.race.seats=this.race.seats.filter(s=>s.id!==id);this.note('deixou a corrida '+id);this.emit('leave',p);}
  }
  else{
   const back=wait&&this.race?.state==='racing'?this.away.get(id):null,q={id,name:playerName(name)||'Piloto',look,number:this.freeSeat(back?.number??want,id),pick,done:pick,wait,seen:now};
   this.players.set(id,q);this.away.delete(id);
   if(back&&q.number===back.number){this.race.seats.push({id,name:q.name,number:q.number});this.note('voltou '+id);this.emit('seats',this.race);}
   else this.note('entrou '+id);
  }
  this.seatEveryone();this.beacon(now);this.emit('change');
 }
 // Host: the cars asked for on the car screens. A car nobody else has is the pilot's from now on; one
 // that is taken stays with whoever has it (the pilot keeps its own). Either way the lobby tells the
 // pilot it was answered (done). Whoever is in a race under way (the host: in any race of its own)
 // keeps its car until that race ends: closeRace and openRace grant what waited.
 grant(){
  const busy=new Set(this.race?.state==='racing'?this.race.seats.map(s=>s.id):[]);if(this.race)busy.add(this.id);
  for(const p of this.players.values()){
   if(!('wish' in p)||busy.has(p.id))continue;
   const want=p.wish;delete p.wish;p.done=p.pick;
   if(want&&!this.taken(p.id).has(want))p.number=want;
  }
  this.save();this.seatEveryone();
 }
 // While a race waits for its start, the host and every guest waiting for it have a seat in it, in
 // their current car and under their current name; a guest that stopped waiting gives its seat up.
 seatEveryone(){
  const r=this.race;if(this.role!=='host'||r?.state!=='waiting')return;
  const before=seatKey(r.seats);
  for(const p of this.players.values()){
   const seat=r.seats.find(s=>s.id===p.id);
   if(!p.number||!p.wait){if(seat){r.seats=r.seats.filter(s=>s!==seat);this.ready.delete(p.id);}continue;}
   if(seat){seat.name=p.name;seat.number=p.number;}else r.seats.push({id:p.id,name:p.name,number:p.number});
  }
  if(seatKey(r.seats)!==before)this.emit('seats',r);
 }
 // The cars someone other than id has: the players' and, in the race under way, those whose pilots'
 // lines dropped (away: kept for their return).
 taken(id){return new Set([...[...this.players.values()].filter(p=>p.id!==id).map(p=>p.number),...[...this.away].filter(([other])=>other!==id).map(([,s])=>s.number)]);}
 // The seat asked for when free, else the first free car; null when all 15 are taken.
 freeSeat(want,id){const taken=this.taken(id);return want&&!taken.has(want)?want:SEATS.find(n=>!taken.has(n))??null;}
 // A player gone (its goodbye, the server's word that its line closed, or silence). Out of a race
 // under way its seat waits for it (away), its car without a driver meanwhile (multiplayer.js strand).
 drop(id){
  const p=this.players.get(id);if(!p||id===this.id)return;
  this.note('saiu '+id);this.players.delete(id);this.ready.delete(id);
  if(this.race){const seat=this.race.seats.find(s=>s.id===id);this.race.seats=this.race.seats.filter(s=>s!==seat);if(seat&&this.race.state==='racing')this.away.set(id,seat);}
  this.emit('leave',p);this.beacon();this.emit('change');
 }
 touch(id,now){const p=this.players.get(id);if(p)p.seen=now;}
 beacon(now=this.clock()){
  if(this.role!=='host')return;this.nextBeacon=now+BEACON;const r=this.race;
  this.send({t:'lobby',name:this.name,age:Math.round((now-this.hostSince)*100)/100,players:[...this.players.values()].map(({id,name,number,done,wait,look})=>({id,name,number,pick:done,wait:!!wait,look:look??null})),race:r&&{id:r.id,circuit:r.circuit,laps:r.laps,seed:r.seed,car:r.car,ace:r.ace,level:r.level,retirements:r.retirements,ghosts:r.ghosts,seats:r.seats,state:r.state,...(r.assiste&&{assiste:true})},stops:r?.state==='racing'?this.stops:[]});
 }
 // Host (multiplayer.js, every frame): the cars waiting for their pilots; a change is told at once.
 setStops(list){if(this.role!=='host'||sameStops(list,this.stops))return;this.stops=list.map(({number,stage,back=true,side})=>({number,stage,back:!!back,...(side===1||side===-1?{side}:{})}));this.beacon();}
 // Host: the next race with the host and the guests waiting for it seated; announced only when its
 // countdown begins (seatEveryone keeps the seats up to date until the start). The
 // seed, the host's car (car: the one at the back of the grid, whose driver sits out) and RaceField's
 // settings (the ace, the rivals' level, breakdowns) give every window the same grid and field;
 // ghosts, whether its humans pass through each other.
 // watch: the host watches its race instead of racing it (multiplayer.js: its car parked out of sight, assiste).
 planRace({circuit,laps,ace=false,level=null,retirements=true,ghosts=false,time='dia',rain='seco',watch=false}){
  const seats=[...this.players.values()].filter(p=>p.number&&p.wait).map(({id,name,number})=>({id,name,number}));
  return {id:randomId(this.random),circuit,laps,car:this.number,ace:!!ace,level:level??null,retirements:!!retirements,ghosts:!!ghosts,time,rain,seed:Math.floor(this.random()*4294967296),seats,state:'waiting',...(watch&&{assiste:true})};
 }
 openRace(race){if(this.role!=='host')return;this.race=race;this.away.clear();this.stops=[];this.ready=new Set([this.id]);this.grant();this.beacon();this.emit('change');}
 // The host ends its race for everyone (multiplayer.js raceEnd): its lobby says so at once, and every guest shows the result.
 endRace(){if(this.role!=='host'||this.race?.state!=='racing')return false;this.race={...this.race,state:'finished'};this.beacon();this.emit('change');return true;}
 closeRace(){if(this.role!=='host'||!this.race)return;this.race=null;this.away.clear();this.stops=[];this.grant();this.beacon();this.emit('change');}
 // Host: lights out. Whoever has not loaded the race yet leaves it (and races the next one).
 lightsOut(){
  const r=this.race;if(this.role!=='host'||r?.state!=='waiting')return;
  r.seats=r.seats.filter(s=>this.ready.has(s.id));r.state='racing';
  this.send({t:'go',race:r.id,seats:r.seats});this.beacon();this.emit('go',r);this.emit('change');
 }
 sendReady(){if(this.role==='guest'&&this.race)this.send({t:'ready',race:this.race.id});}
 // (extra: validExtra's pe and ab, when there are any)
 sendState(car,seq,extra=null){if(this.role==='guest'&&this.race)this.send({t:'state',race:this.race.id,seq,lat:clamp(this.latency,0,5),car,...extra});}
 sendSnapshot(cars,seq){if(this.role==='host'&&this.race)this.send({t:'snap',race:this.race.id,seq,cars});}
 // Beacons, pings, the election and the silent players: once per frame.
 tick(){
  const now=this.clock(),silent=SILENT+this.lag/500;
  // A long gap between ticks is this window frozen (building a track takes seconds): nobody
  // could be heard meanwhile, so that time counts for no one's silence.
  const frozen=this.lastTick===undefined?0:Math.max(0,now-this.lastTick-FROZEN);this.lastTick=now;
  if(frozen){this.hostSeen+=frozen;if(this.echo!==undefined)this.echo+=frozen;for(const p of this.players.values())p.seen+=frozen;}
  // Online the server hosts the election: until its welcome there is nothing to do.
  if(this.role===null){if(!this.online&&now>=this.electUntil&&this.problem!=='fechada')this.becomeHost(now);return;}
  // Online, the line itself: an echo asked for every ECHO, and none for LINK_QUIET is a dead line (a
  // new connection, the same player). Not before the server has echoed once.
  if(this.online&&this.problem===null){
   if(now>=(this.nextEcho??0)){this.nextEcho=now+ECHO;this.link.send({t:'eco'});}
   if(now-(this.echo??now)>LINK_QUIET){this.note('sem sinal: conectando de novo');this.echo=now;this.link.reconnect();}
  }
  if(this.role==='host'){
   if(now>=this.nextBeacon)this.beacon(now);
   // A guest seated in a race that waits for its start may freeze (loading the track, its first
   // frames): it has until READY_WAIT. Online a closed connection comes as the server's bye.
   const waiting=p=>this.race?.state==='waiting'&&this.race.seats.some(s=>s.id===p.id),limit=p=>waiting(p)?READY_WAIT:this.online?ONLINE_SILENT:silent;
   for(const p of [...this.players.values()])if(p.id!==this.id&&now-p.seen>limit(p)){this.note('silêncio '+p.id);this.drop(p.id);}
   return;
  }
  // A host that said goodbye (a reload: its race went with its page) gets HOST_GRACE to come back; a
  // silent one, SILENT, or during a race this window races in RACE_HOST_WAIT (the race stands still for
  // it meanwhile).
  const racing=this.race?.state==='racing'&&this.race.seats.some(s=>s.id===this.id);
  if(!this.online&&now-this.hostSeen>(this.hostLeft!==undefined?HOST_GRACE:racing?RACE_HOST_WAIT:silent)){this.elect();return;}
  if(now>=this.nextPing){this.nextPing=now+PING;this.pings.set(++this.pingN,now);if(this.pings.size>8)this.pings.delete(this.pings.keys().next().value);this.send({t:'ping',n:this.pingN});}
  if(now>=this.nextHello&&!this.pending)this.hello();
 }
 info(){return {room:this.room,trail:[...this.trail],online:this.online,problem:this.problem,pending:this.pending,knocks:[...this.knocks.values()],id:this.id,role:this.role,number:this.number,name:this.name,latency:this.latency,want:this.want,settled:this.settled,waiting:this.waiting,hostNumber:this.hostNumber,ready:[...this.ready],away:[...this.away.values()].map(s=>({...s})),stops:this.role==='host'?this.stops.map(s=>({...s})):this.lobby?.stops??[],members:this.members.map(({id,name,number,wait})=>({id,name,number,wait:!!wait})),race:this.race&&{...this.race,seats:this.race.seats.map(s=>({...s}))}};}
}
