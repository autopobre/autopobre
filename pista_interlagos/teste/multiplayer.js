// Multiplayer: players on different machines race each other through the room server
// (net-link.js, sala-cloudflare), or windows of one browser through a BroadcastChannel (&local=1)
// (net-room.js, net-cars.js). Nothing in the menus leads here; main.js loads this module only when
// the address asks for a room:
//   index.html#desafio=NOME  the first in a room hosts it; every pilot races the car chosen on
//                            Modo Corrida's car screen (or the one in &carro=73) if nobody else has
//                            it, else the first free one. Online, only pilots signed in with their
//                            account (and a nickname, their name in the room) get in: the host's
//                            password opens a room, the pilots' enters one someone opened, and the
//                            host lets each guest in. The old #sala= and #corrida= open nothing
//   &local=1                 this browser's windows only, no server; &servidor=local: wrangler dev
//   &auto=1                  the automatic pilot drives this window's car from the start
//   &fantasmas=1             (host) humans pass through each other instead of colliding
//   &lag=150&perda=5         simulate 150 ms of network delay and 5% of lost car messages
//   #desafio=NOME_SEGREDO    what follows the "_" is never on screen (the address bar reads NOME_***;
//                            the card shows no room name at all): a stream does not give the room away
// A guest the host lets in goes to Modo Corrida's car screen, picks its car and presses "Aguardar
// início da corrida". The host lets pilots in until the start (on the car screen, the track screen and
// on the grid; its mouse is let go on the grid when someone knocks), picks the track and presses
// Corrida única: the grid waits on 3, every waiting guest (and whoever says so meanwhile) loads it,
// and the lights go out for everyone when the host presses Largar. From then on the door waits for
// the race to end. The host's car starts at the back of the grid, as Modo Corrida's chosen car does, and the
// driver of that car sits out (the 99 races in its seat, race-roster.js fieldRoster); each guest's
// car starts in its own seat. The host's game drives the bots and passes every car on; each window
// drives its own car; the host checks guests' motion and counts their laps before relaying the
// remote cars. Every window resolves a contact for its own car only, against where it shows the other
// one; the other window does the same from its side. Modo Corrida only.
// A pilot whose line drops mid-race (or who leaves it) leaves the car with nobody at the wheel, no
// bot: it rolls on as if its driver had fainted, a stop on the road brings the tow truck to pull it
// onto the grass, and while it is on the road everyone gets the yellow flag (the card, the marshal's
// flag before it, the rivals easing off). Back in time, the pilot takes the car from where it stands;
// a car that reached the flag with nobody at the wheel is AB, its race over. The host out of reach
// (its line down, its window gone) stands the race still in every window until it is back.
// T writes in the room's chat, Shift+T shows or hides its window (multiplayer-chat.js): each line also
// shows in a balloon over the car of whoever said it (over the pilot, when he is out of it). A pilot out of his car
// shows in every window, in his own look (the Visual screen's), as does his driver at the wheel; so do the doors,
// hood and lids his car has open.
import * as THREE from 'three';
import {Room,roomParams,roomAddress,savedInvite,dropInvite} from './net-room.js';
import {ServerLink,ROOM_SERVER,LOCAL_SERVER} from './net-link.js';
import {RoomChat} from './multiplayer-chat.js';
import {Standings,humanStandings} from './multiplayer-standings.js';
import {RemoteCar,packCar,readCar} from './net-cars.js';
import {GuestRaceState} from './net-verify.js';
import {PLAYER_ENTRY,carEntry} from './race-roster.js';
import {TOW_ARRIVE,faintedInput,inTheWay} from './race-field.js';
import {strapPath} from './immersive-state.js';
import {marshalSpots} from './trackside.js';
import {TOW_HOOK} from './tow-truck.js';
import {CarOpenings} from './car-openings.js';
import {createPeople} from './pit-crew.js';
import {pilotOutfit} from './free-walk.js';
import {footLimbs} from './on-foot.js';
import {lookColors,lookKey} from './pilot-look.js';
import {createRivalDriver} from './rival-driver.js';
import {CAFE_MENU,snackHands,showSnacks,snackArms} from './pitstop.js';
// Car messages a second; after crossing the line, how long the results wait for the others (s); a
// car not heard from for QUIET seconds is reported on the room card (the host's: the race stands
// still, updatePause), and mid-race the host leaves a guest's without a driver after STRANDED
// (checkSilence).
// (the room's race ends for everyone at once: every human in, its host's word, or RESULTS_WAIT s after the first human's
// flag, raceEnd; past the flag the car goes to the pit lane once the flag's fade is over, PARK_AFTER seconds at the least)
const SEND=1/30,RESULTS_WAIT=300,PARK_AFTER=1.5,QUIET=2,STRANDED=5;
// The host's list of who is online is asked again every ONLINE_EVERY seconds while it is open; the same
// pilot may be invited again INVITE_AGAIN seconds after the last (the room server's own pace).
const ONLINE_EVERY=5,INVITE_AGAIN=20;
// The tow truck (immersive-visuals.js truckModel, tow-truck.js) stands this far ahead of the car's centre on the strap
// (hooks 2.22 m and 2.45 m from the centres, 5 m of strap). It comes in along the side of the track,
// TRUCK_SIDE metres past the edge, from TRUCK_BACK metres behind the car, in TRUCK_DRIVE seconds (the
// rest of RaceField's TOW_ARRIVE it hooks up), turning onto the tow's way only past the car's nose
// (TRUCK_CUT metres on); done, it drives off for TRUCK_GONE seconds.
const TRUCK_AHEAD=9.4,TRUCK_BACK=24,TRUCK_SIDE=2.6,TRUCK_CUT=3,TRUCK_DRIVE=TOW_ARRIVE-1.5,TRUCK_GONE=6;
// The breakdown a car left without its pilot is AB for at the flag (RaceField strand).
const NO_DRIVER='conexão caiu';
const NO_STOPS=Object.freeze([]);
// A guest's line as its states reach the host (never its own word: faking a bad line would buy a car that goes through
// the others): unsteady with LINK_GAPS gaps over LINK_GAP s within LINK_WINDOW s, or nothing for LINK_STALE s; steady
// again only after LINK_CALM s without either and LINK_CLEAR metres clear of every other car. Unsteady, or left without
// its pilot, its car goes through every car and shows see-through (GHOST_OPACITY), on every screen and on its own
// pilot's too, who is told so (linkGhosts; the team's wish, 10-07 and 10-26: as ACC and iRacing do, the instability
// punished and not a far but steady line; the netcode study of 10-07, step 3). A guest also sees through a human's car
// it has heard nothing of for LINK_STALE s (steady again LINK_CALM_HERE s after).
const LINK_GAP=.3,LINK_GAPS=3,LINK_WINDOW=10,LINK_STALE=.6,LINK_CALM=5,LINK_CALM_HERE=1.5,LINK_CLEAR=6,GHOST_OPACITY=.55;
// A bite or a sip takes this long (pitstop.js stepSnack): the others' hands go to the mouth and back in it.
const SNACK_USE=1.25;
// A car parked in the pit lane past the flag: on its brakes, nobody at the wheel.
const PARKED=Object.freeze({throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:1});
// The host's hand on a guest's car parked there while that pilot's window says nothing (checkSilence, left): placed
// once, it stays.
const parkedPuppet=()=>({...PARKED});
// A pilot on foot whose window says he is more than WALK_SNAP metres from where he shows is put there at once.
const WALK_SNAP=8;
// A look's suit and helmet for a driver at the wheel (rival-driver.js kit): the helmet's paint, its detail on the
// crown with the "topo" design.
const lookKit=look=>{const c=lookColors(look);return {suit:c.suit,base:c.helmet,pin:c.detail,crown:look.helmet==='topo'?c.detail:c.helmet,visor:c.visor};};
// The host's car under the host's name (the 99 as the player's own: lime on the map).
const hostEntry=(car,name)=>({...(car==='99'?{...PLAYER_ENTRY,mark:PLAYER_ENTRY.color}:carEntry(car)),name,shortName:name,human:true});
// A car's place in the field's roster (the rivals' order, the same in every window).
const seatIndex=(field,number)=>field.roster.findIndex(e=>e.number===number);
const clock=()=>performance.now()/1000;
// How far down the track a point at s is from one at from, going forward (0..L metres).
const along=(from,s,L)=>((s-from)%L+L)%L;
// The room's password, typed once on this browser: the host's opens rooms, the pilots' enters them (the
// server keeps both as secrets and tells which one it was by this tab's role).
const KEY_STORE='autopobre-senha-sala';
const readKey=()=>{try{return localStorage.getItem(KEY_STORE)??'';}catch{return '';}};
const localStore=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const saveKey=key=>{try{localStorage.setItem(KEY_STORE,key);}catch{}};
// Why the race stands still (pause): this window's own line, as host; the host gone from the room for a
// moment (the server's word), or silent.
const PAUSES={linha:()=>'Sua conexão caiu · corrida pausada para todos até ela voltar…',saiu:()=>'O anfitrião caiu · corrida pausada até ele voltar…',
 silencio:secs=>`Sem sinal do anfitrião há ${secs} s · corrida pausada até ele voltar…`,fechada:()=>'O anfitrião fechou a sala.'};
// What the card says when the server closed the door (net-link.js CLOSED), the line dropped, or the
// account is missing (the room server lets in only pilots signed in, with a nickname).
const PROBLEMS={conectando:'Conectando ao servidor da sala…',reconectando:'Conexão caiu · tentando de novo…',chave:'Digite a senha da sala.',
 conta:'Só entra na sala quem está com a conta do Google conectada.',apelido:'Escolha o seu apelido na conta: é o seu nome na sala.',
 passe:'A sala não reconheceu a sua conta · tente de novo.',contas:'O servidor de contas não respondeu · tentando de novo…',
 salas:'As salas estão desligadas no servidor agora · tentando de novo a cada minuto.',
 cheia:'Sala cheia.',recusado:'O anfitrião recusou sua entrada.',expulso:'Você foi removido da sala.',excesso:'Conexão encerrada: mensagens demais.',
 ocupada:'Muitas tentativas com a senha errada · tente de novo em um minuto.',convite:'Esse convite não vale mais (o anfitrião cancelou, ou a sala recomeçou).','outra-aba':'Esta sala foi aberta em outra aba.',origem:'Endereço não autorizado.',
 fora:'Sem conexão com o servidor da sala (internet, ou o limite do dia do servidor).',saiu:'Você saiu da sala.',fechada:'O anfitrião fechou a sala.'};
// The card's button for an account problem: what it says, and what it does (Multiplayer accountAction).
// (the room closed by its host: back to the game without it, leaveRoom)
const ACCOUNT_ACTIONS={conta:'Entrar com Google',apelido:'Escolher apelido',passe:'Tentar de novo',fechada:'Voltar ao jogo'};
// The host's Fechar sala asks to be clicked again within CLOSE_CONFIRM seconds; closing, its window leaves the room
// once the server let it go, or after CLOSE_WAIT seconds anyway.
const CLOSE_CONFIRM=5,CLOSE_WAIT=3;
// A pilot invited in whose room closed (or whose invitation is gone) is back in the game after LEAVE_AFTER seconds
// (frame), the card saying why meanwhile.
const LEAVE_AFTER=4;
// The end's warnings (endWarning) stay this long (s).
const WARN_SHOWN=4;
const HIDDEN_LOST='Este endereço esconde a parte secreta do nome da sala (depois do _). Abra o link completo que você recebeu.';
// game: main.js hooks (session, immersive, fullGrid, template, withTemplate, pilotName, wantedCar,
// roomCars, openCars, freeMouse, command, autopilot, startRace, hasCircuit; the account's: roomPass,
// accountName, signIn, openAccount; the chat's balloons: camera, playerAnchor; what the car carries beside its
// motion: onFoot, openMask, look).
export function startMultiplayer(game,hash=location.hash){
 // The room's secret leaves the address bar at once (net-room.js roomAddress); an address that came
 // with it hidden and unknown here opens no room, only the card saying so.
 const address=roomAddress(hash,localStore());
 if(address.lost){roomCard(HIDDEN_LOST);return null;}
 if(address.shown!==hash)try{history.replaceState(history.state,'',address.shown);}catch{}
 const params=roomParams(address.hash);return params?new Multiplayer(game,params):null;
}
// The room card's frame (Multiplayer buildPanel fills it in): its sheet (the release's version,
// preparar_publicacao.py tags this module's address, keeps a cached old sheet out) and its head. The
// room's name is never on screen (the team's wish, 10-26: the pilot opened the link, the card needs no
// name; a stream shows nothing of it either).
function roomCard(text){
 const link=document.createElement('link');link.rel='stylesheet';link.href='./multiplayer.css'+new URL(import.meta.url).search;document.head.append(link);
 const root=document.createElement('section');root.id='mpRoom';root.setAttribute('aria-label','Sala multiplayer');document.body.classList.add('mp-room');
 const add=(tag,className,parent=root)=>{const e=document.createElement(tag);if(className)e.className=className;parent.append(e);return e;};
 const head=add('div','mp-head');add('b','',head).textContent='SALA';
 const card={root,add,role:add('small','mp-role',head),status:add('p','mp-status')};
 card.status.setAttribute('role','status');if(text){card.status.textContent=text;document.body.append(root);}
 return card;
}
// (exported for testar_multiplayer.mjs, which runs its race-time checks without a page)
export class Multiplayer {
 constructor(game,params){
  this.game=game;this.params=params;this.autopilot=params.auto;this.autopilotOn=false;
  // (the account's pass: conta.js, through main.js; a build without accounts has none to give)
  // (and a host's invitation to this room this browser took: it stands for the password)
  const link=params.local?null:new ServerLink({url:params.server==='local'?LOCAL_SERVER:ROOM_SERVER,room:params.room,key:readKey,pass:room=>game.roomPass?.(room)??{problema:'contas'},
   invite:()=>savedInvite(localStore(),params.room),forgetInvite:()=>dropInvite(localStore(),params.room)});
  this.room=new Room({room:params.room,name:game.pilotName(),want:params.car??game.wantedCar(),lag:params.lag,loss:params.loss,link});
  this.race=null;this.phase='lobby';this.holding=false;this.remotes=new Map();this.seq=0;this.sendClock=0;this.readyClock=0;this.finishedAt=null;this.panelClock=0;this.immersive=null;this.rows='';this.cars='';
  this.welcomed=false;this.knocking=0;
  // Cars waiting for their pilots (every window: number -> {stage, since}), their trucks and the
  // marshals' flags; cut: this guest's own line is down (or the host has it out of its seat).
  this.stopped=new Map();this.trucks=new Map();this.flags=new Map();this.cut=null;this.reclaiming=null;
  // What the other cars carry beside their motion (number -> {pe, ab, at}: their pilots on foot, their parts held
  // open), the pilots on foot shown here (number -> walker), and the parts of the humans' cars (number -> openings).
  this.extras=new Map();this.walkers=new Map();this.carParts=new Map();this.people=null;
  // The race standing still for its host (pause: why, since when).
  this.pause=null;
  // The cars humans raced once the lights went out (their names stay on them).
  this.raced=new Set();
  // A new race from the host, while this guest waits for one: load its track and start (false: busy
  // loading, asked again later).
  this.room.on('race',race=>this.room.waiting&&this.game.hasCircuit(race.circuit)&&this.game.startRace(race.circuit)).on('go',race=>this.go(race)).on('end',race=>{if(this.race&&race.id===this.race.id)this.endForAll();})
   .on('state',(id,m)=>this.heardCar(id,m)).on('snap',m=>this.heardField(m)).on('leave',p=>this.left(p)).on('change',()=>this.render())
   // Someone took (or left) a seat, or renamed, while the start waits, or during the race a guest's
   // line dropped (its car without a driver) and it came back, even after this window's flag: the cars
   // and their name tags follow. A guest that is itself out of the seats (its own line dropped) waits
   // until the host seats it again.
   .on('seats',race=>{if(this.race&&race.id===this.race.id&&(this.phase==='waiting'||(this.phase==='racing'||this.phase==='finished')&&race.seats.some(s=>s.id===this.room.id))){this.race=race;this.seatHumans();}});
  // The host's invitations: who is online (asked again every ONLINE_EVERY while the list is open), their
  // records on the host's track, and what became of each invitation.
  // (sent: account -> {state, at}, what became of the last thing done for that pilot; lastSent: when it was
  // last invited)
  this.invites={open:false,list:[],sent:new Map(),lastSent:new Map(),records:null,asked:0};
  this.room.on('online',list=>{this.invites.list=list;this.invites.heard=true;this.renderInvites();})
   .on('invited',(account,delivered,early)=>{this.invites.sent.set(account,{state:early?'cedo':delivered?'enviado':'fora',at:clock()});this.renderInvites();})
   .on('uninvited',(account,ok)=>{this.invites.sent.set(account,{state:ok?'cancelado':null,at:clock()});this.renderInvites();});
  this.buildPanel();
  // The chat: lines from the room into its window and their balloons.
  this.chat=new RoomChat({say:text=>this.room.say(text),anchor:(id,out)=>this.chatAnchor(id,out),camera:()=>game.camera?.(),view:()=>document.getElementById('view'),
   canSay:()=>!!this.room.role&&!this.room.pending,freeMouse:()=>game.freeMouse(),key:code=>game.keyName?.(code)??code.slice(3),racing:()=>!!game.session().started});
  this.room.on('chat',line=>this.chat.heard(line));
  // The humans' standings on the right during the race (multiplayer-standings.js).
  this.standings=new Standings();
  // The account as the card last saw it: signing in, or picking a nickname, tries the room again.
  this.accountSeen=game.accountName?.()??null;
  this.room.start();
  // Enter gives the start too (the mouse may be captured by the track).
  addEventListener('keydown',e=>{if(e.code==='Enter'&&this.canStart()&&!e.target.closest?.('input,select,textarea,dialog')){e.preventDefault();this.room.lightsOut();}});
  addEventListener('pagehide',()=>this.room.leave());
  // dropLine, for the checks: the line drops as a network drops it (no goodbye; net-link.js connects
  // again, after 15 s when slow).
  window.interlagosSala={info:()=>this.info(),dropLine:(slow=false)=>{this.room.link?.drop(slow);},
   // (the checks of a room on this machine: the end's countdown moved on by seconds, verificar_sala_fim.py)
   ...(params.local&&{hurryEnd:seconds=>{if(this.firstFlagAt!=null)this.firstFlagAt-=seconds;}})};
  const immersive=game.immersive();if(immersive)this.attach(immersive);
 }
 // Each circuit load makes a new ImmersiveMode: its free race learns the room's seats and start.
 attach(immersive){
  if(immersive.multiplayer===this)return;
  this.clearStops();this.clearPeople();immersive.multiplayer=this;this.immersive=immersive;this.hostObject=null;this.swap=null;
  const resetField=immersive.resetField.bind(immersive),beginCountdown=immersive.beginCountdown.bind(immersive),step=immersive.step.bind(immersive),stepFree=immersive.stepFree.bind(immersive);
  immersive.resetField=()=>{this.plan(immersive);resetField();this.seat(immersive);};
  immersive.beginCountdown=()=>{beginCountdown();this.countdown();};
  // Held on 3 until the host gives the start (Largar, or Enter). With this guest's line down, nobody
  // drives its car here either: the same as the host does with it (RaceField faintedInput).
  immersive.step=(input,dt)=>{if(this.holding&&immersive.freeCountdown>0)immersive.freeCountdown=3;if(this.cut)Object.assign(input,faintedInput(immersive.car));if(this.parked)Object.assign(input,PARKED);return step(input,dt);};
  // Past the flag the field races on while the others finish (the result waits, holdResults). With
  // nobody at the wheel the car does not finish here: the line it rolls over is taken back (the host
  // has it AB there, RaceField reclaim).
  immersive.stepFree=(dt,input)=>{
   if(immersive.freeFinished&&this.phase==='racing'){immersive.contacts(immersive.field.step(immersive.car,dt,immersive.freeTotalLaps));return;}
   if(this.cut&&immersive.car.laps>=immersive.freeTotalLaps)immersive.car.uncrossLine();
   stepFree(dt,input);
  };
 }
 myNumber(race=this.race){return race?.seats.find(s=>s.id===this.room.id)?.number??null;}
 // main.js: the car this window races in the room (its seat in the host's race it is loading, else
 // its seat in the room; null: none yet, the car screen's choice then).
 car(){return this.myNumber(this.loading())??this.room.number;}
 // The car screen's choice (main.js): this window's car in the room from now on, if nobody has it.
 choose(number){this.room.choose(number);this.render();}
 // main.js: whether this window is no room's host (its car screen then waits for the host's race
 // instead of leading to the tracks), and the car screen's "Aguardar início da corrida" (on, off, or
 // the other way round); a guest that went back to the opening waits no more.
 guest(){return this.room.role!=='host';}
 wait(on=!this.room.waiting){if(on&&!this.admitted())return;this.room.setWaiting(on);this.render();}
 // main.js, as this window leaves its race (the menu's way out, the result sheet, the host's next
 // race on another track): a guest that leaves the host's race before its flag gives its seat up and
 // is back to picking its car (main.js lands it on the car screen); done with that race (its car AB
 // there too, past the flag without its pilot), or moved on to the host's next one, it still waits.
 leaving(){
  const room=this.room;
  if(room.role==='guest'&&this.phase!=='lobby'&&this.race&&room.race?.id===this.race.id&&this.phase!=='finished'&&this.finishedAt===null&&!this.cut?.over)this.wait(false);
 }
 // A guest the host has let in (online, past the door) and the room lists.
 admitted(){const room=this.room;return room.role==='guest'&&!room.pending&&room.members.some(m=>m.id===room.id);}
 // main.js seatCar: in the host's race this guest sets up, the car at the back of its grid (the
 // host's), whose driver sits out; null for any other race (the field is then this window's own).
 gridCar(){const race=this.hostRace();return race&&this.myNumber(race)?race.car:null;}
 loading(){const room=this.room,race=room.race;return room.role==='guest'&&race?.state==='waiting'&&race.seats.some(s=>s.id===room.id)?race:null;}
 // The host's race, if the race this guest sets up is it: announced and waiting, on this track, and
 // a room's kind of race (main.js fullGrid: Modo Corrida with the whole grid, not the story, the
 // recon lap, Treino solo or 1x1).
 hostRace(){const room=this.room,race=room.race;return room.role==='guest'&&race?.state==='waiting'&&race.circuit===this.game.session().circuit&&this.game.fullGrid()?race:null;}
 // The host's car as a guest shows it, in that car's colours (the 99 in its own livery), cloned from
 // the player's model as loaded (main.js withTemplate takes another car's paint off it meanwhile);
 // cloned again when that model changed (another livery of the 99).
 hostCar(car){
  const visual=this.immersive.visual,e=carEntry(car);if(!e||!this.game.template())return null;
  if(this.hostObject?.userData.car===car&&this.hostTemplate===this.game.template())return this.hostObject;
  if(this.hostObject){this.hostObject.removeFromParent();visual.disposeCar(this.hostObject,this.hostTemplate);}
  this.hostObject=this.game.withTemplate(template=>{this.hostTemplate=template;return visual.rivalCar(template,e.color,e.number,'',{driven:true,stripe:e.stripe,finish:e.finish,livery99:car==='99'});});
  this.hostObject.userData.car=car;visual.root.add(this.hostObject);return this.hostObject;
 }
 // Before the field resets: the race it is for. The host makes a new one each time (announced only
 // when its countdown begins); a guest takes the one the host announced for this track. A room
 // race is the full grid (seat = roster index): Treino solo, 1x1, the recon lap and the story stay
 // this window's own.
 plan(immersive){
  this.clearPeople();this.extras.clear();this.parked=false;this.flagAt=null;this.met=false;this.ended=this.endAsked=false;this.endAsk=this.firstFlagAt=null;if(this.immersive)this.immersive.visual.hideOwn=false;
  this.phase='lobby';this.holding=false;this.finishedAt=null;this.autopilotOn=false;this.cut=null;this.reclaiming=null;this.lost=false;this.pause=null;this.raced=new Set();this.clearStops();
  const room=this.room,field=immersive.field;
  this.race=room.role==='host'?this.game.fullGrid()?room.planRace({circuit:this.game.session().circuit,laps:immersive.laps,ace:!!field.ace,level:field.level,retirements:field.retirements!==false,ghosts:this.params.ghosts,watch:!!this.watching,...this.game.weather?.()}):null
   :this.hostRace();
  field.seed=this.race?.seed;
  if(this.race){immersive.laps=this.race.laps;field.ace=this.race.ace;if(this.race.level)field.level=this.race.level;field.retirements=this.race.retirements;}
  // Everyone races the host's weather (the same grip for all); a guest's own choice stays saved for its own races.
  this.game.setWeather?.(room.role!=='host'&&this.race?.time?{time:this.race.time,rain:this.race.rain??'seco'}:null);
 }
 // After the field resets (same seed, same grid in every window): who drives which car. The field's
 // roster and the 99's model in the host's car's seat are main.js's (seatCar, from gridCar).
 seat(immersive){
  const field=immersive.field,visual=immersive.visual,car=immersive.car,race=this.race;
  this.remotes.clear();car.ghost=false;
  // A guest's seat showed the host's car: its own model goes back there (main.js's seatCar puts every
  // model back before a race; a reset alone does not).
  if(this.swap&&visual.rivals[this.swap.i]===this.hostObject)visual.rivals[this.swap.i]=this.swap.obj;this.swap=null;
  visual.rivals.forEach((obj,k)=>{obj.userData.entry=field.roster[k];this.label(obj,null);});
  const me=this.myNumber();if(!me)return;
  car.ghost=!!race.ghosts;
  if(me===race.car){this.seatHumans();return;}
  const i=seatIndex(field,me),slot=field.rivals[i],back={x:car.x,y:car.y,heading:car.heading},name=race.seats.find(s=>s.number===me).name;
  // This window's car takes its own seat on the grid (the field's measure of its race distance too,
  // for the estimated times, RaceField classification)...
  car.x=slot.car.x;car.y=slot.car.y;car.heading=slot.car.heading;car.settle();
  immersive.freeLastS=car.surface.s;immersive.freePlayerProgress=slot.progress;immersive.playerEntry={...slot.entry,name,shortName:name,human:true};
  Object.assign(field.playerRun,{progress:slot.progress,lastS:null});
  // ...and that seat shows the host's car, at the back where the host's car starts.
  slot.car.x=back.x;slot.car.y=back.y;slot.car.heading=back.heading;slot.car.settle();slot.lastS=slot.car.surface.s;slot.progress=slot.start=0;
  const host=this.hostCar(race.car);if(host){this.swap={i,obj:visual.rivals[i]};visual.rivals[i]=host;}
  // The host's game drives every other car: here all of them come over the network.
  field.rivals.forEach((r,k)=>this.remote(r,k===i?race.car:r.entry.number,false));
  this.seatHumans();
 }
 // Which of the other cars humans drive, and their names: at the reset, and again whenever a seat
 // is taken or left while the start waits. The host turns a guest's seat into a remote car (and a
 // seat left back into a bot); every window names the humans (ghosts in a race without contact).
 seatHumans(){
  const immersive=this.immersive,field=immersive.field,visual=immersive.visual,race=this.race,me=this.myNumber();if(!race||!me)return;
  const humans=new Map(race.seats.map(s=>[s.number,s])),host=me===race.car,mine=host?-1:seatIndex(field,me);
  field.rivals.forEach((r,k)=>{
   const number=k===mine?race.car:field.roster[k].number,seat=humans.get(number),obj=visual.rivals[k];
   // A human out of the race under way (line dropped, left, or done) left the car still theirs and
   // under their name: standing for them, or a bot bringing it in after their flag.
   if(!seat&&this.raced.has(number))return;
   if(host){if(seat&&(!r.puppet||r.puppet===parkedPuppet)&&this.remotes.get(number)?.waiting!==r)this.remote(r,number,true);else if(!seat&&r.puppet)this.release(r);}
   r.car.ghost=!!seat&&!!race.ghosts;
   r.entry=!seat?field.roster[k]:number===race.car?hostEntry(number,seat.name):{...field.roster[k],name:seat.name,shortName:seat.name,human:true};
   obj.userData.entry=r.entry;this.label(obj,seat?.name??null);
  });
  // (who raced once the lights went out)
  if(this.phase==='racing'||this.phase==='finished')for(const number of humans.keys())this.raced.add(number);
 }
 remote(r,number,human){
  const remote=new RemoteCar(r.car,{progress:r.progress,finished:r.finished,finishTime:r.finishTime});this.remotes.set(number,remote);r.seat=number;r.car.remote=true;r.car.ghost=human;
  if(human&&this.room.role==='host'){
   const field=this.immersive.field;
   remote.verify=r.guestRace??=new GuestRaceState(r,{time:field.time,laps:this.race.laps,lead:field.gridLeadIn});
   remote.verify.rebase(r,field.time);
  }
  // Mid-race (a pilot back in the car left for them) the car goes on as it is until that pilot's first
  // state comes (heardCar): placed from where it stands meanwhile, it would stop dead, here and in the
  // snapshots the pilot's window takes it back from.
  if(this.phase==='racing'||this.phase==='finished')remote.waiting=r;else this.handOver(r,remote);
 }
 // The pilot at the wheel: a car left standing for them waits no more (the tow, the AB it would get at
 // the flag), and their states say the rest from now on. A car that reached the flag without them
 // stays AB, and theirs no more (their window knows it from the host's word, checkCut). A finish
 // only counts if the host's checked trajectory already reached the flag with a pilot at the wheel.
 handOver(r,remote){
  if(!this.immersive.field.reclaim(r,!!remote.state?.finished))return;remote.waiting=null;
  r.puppet=(rival,dt)=>{
   const input=remote.drive(rival.car,dt),s=remote.state;rival.progress=s.progress;rival.lastS=rival.car.surface.s;
   remote.verify?.sync(rival.car,this.immersive.field.time);
   if(s.finished&&!rival.finished){rival.finished=true;rival.finishTime=s.finishTime;}
   // A bot the host's field retired (a breakdown), or a car waiting for its pilot, never finishes
   // here either (the pilot back, it races on).
   rival.retired=!!s.retired;
   return input;
  };
 }
 // Host: a guest gone before the start (or never ready) leaves a bot in its seat, from where the car
 // is (during the race a car is left without a driver instead: left). The human's best lap goes with them:
 // only the bot's own full laps may reach the AI records (ai-records.js). The seat's breakdown, from
 // the race's dice, is the bot's: it races that car from the start (the race's one to four retirements).
 release(r){
  const field=this.immersive.field,i=field.rivals.indexOf(r),obj=this.immersive.visual.rivals[i];
  this.remotes.delete(r.seat);delete r.guestRace;r.puppet=null;r.seat=null;r.car.remote=r.car.ghost=false;r.car.best=null;r.lastS=r.car.surface.s;r.entry=field.roster[i];
  obj.userData.entry=r.entry;this.label(obj,null);
 }
 // Name tags: a human's name in lime over the car; null puts the driver's own tag back.
 label(obj,name){
  const u=obj.userData;if((u.mpName??null)===(name??null))return;u.mpName=name??null;
  if(u.mpLabel){u.mpLabel.removeFromParent();u.mpLabel.material.map?.dispose();u.mpLabel.material.dispose();u.mpLabel=null;}
  if('mpOriginal' in u){if(u.mpOriginal)obj.add(u.mpOriginal);u.nameLabel=u.mpOriginal;delete u.mpOriginal;}
  if(!name)return;
  u.mpOriginal=u.nameLabel??null;u.mpOriginal?.removeFromParent();
  u.mpLabel=u.nameLabel=this.immersive.visual.tag(obj,name,[0,2.08,0],2.7,.30,'#e2fb57','#172a2ddb');
 }
 // The countdown began: the host announces the race; either side holds on 3 until the start (a
 // guest's grid race waits for the host's; a race outside the room, Treino solo or 1x1, just runs).
 countdown(){
  if(!this.race&&(this.room.role==='host'||!this.game.fullGrid())){this.render();return;}
  this.holding=true;this.phase='waiting';this.readyClock=0;this.sendClock=0;if(this.race&&this.room.role==='host')this.room.openRace(this.race);this.render();
 }
 // The host may give the start while its race waits (the Largar button, or Enter).
 canStart(){return this.room.role==='host'&&this.phase==='waiting'&&this.room.race?.state==='waiting';}
 go(race){
  if(!this.race||race.id!==this.race.id)return;
  this.race=race;const immersive=this.immersive;
  if(!race.seats.some(s=>s.id===this.room.id))return;
  // (the identity this window races under: a new one from the room means it is out, checkCut)
  this.phase='racing';this.holding=false;this.seatId=this.room.id;
  // (the host who only watches: its car out of the race from the start, its cameras on the others: watchFromStart;
  // nobody else at the start, nothing to watch: it races)
  if(race.assiste&&this.room.role==='host'){if(this.racers().length)queueMicrotask(()=>this.watchFromStart());else{delete race.assiste;this.room.beacon();}}
  // Everyone to the cars (the host's call): from the Tia's café into this pilot's car on the grid, for the 3, 2, 1.
  this.game.unmeet?.();
  // Whoever had not loaded the race yet was left out of it: that seat is a bot again.
  this.seatHumans();
  // The start reached a guest a network delay late: its countdown makes up for it.
  if(this.room.role==='guest')immersive.freeCountdown=Math.max(.2,3-this.room.latency);
  this.render();
 }
 // Host: a guest gone (net-room.js 'leave'; its car remote, or about to be: remote). Before the start
 // its seat is a bot's again. During the race (its line dropped, or it left) nobody drives its car, no
 // bot either (RaceField strand and stopInput: it rolls on as if its driver had fainted; stopped on the
 // road, the tow truck), and at the flag without its pilot it is AB, "conexão caiu"; past its own flag,
 // its result stands and the car stands parked in the pit lane (parkGuest). Either way the car keeps its pilot's name
 // and best lap (car.remote: never an AI record), and the pilot back (net-room.js away), seatHumans hands it back.
 left(p){
  const r=this.immersive?.field.rivals.find(r=>r.seat===p.number&&(r.puppet||this.remotes.has(p.number)));if(!r||this.room.role!=='host')return;
  if(this.phase!=='racing'&&this.phase!=='finished'){this.release(r);return;}
  this.remotes.delete(r.seat);if(r.finished)this.parkGuest(r);else this.immersive.field.strand(r,NO_DRIVER);this.syncStops();
 }
 // The car in a seat (the field's slot raced under that number here).
 slot(number){return this.immersive?.field.rivals.find(r=>(r.seat??r.entry.number)===number)??null;}
 // The car of a seat waiting for its pilot when it is in the race's way, under the yellow flag (as
 // the rivals see it, RaceField inTheWay); null when it is not.
 carInTheWay(number,stop){const c=this.slot(number)?.car;return c&&inTheWay(stop,c)?c:null;}
 // The cars waiting for their pilots in this race: the host's own field, or the host's word. back:
 // whether that pilot may still take the car back (its line dropped, or went quiet), not one that
 // left the race by the menu or was sent out, nor a car that reached the flag without them. side: the
 // side of the track the tow truck takes it to (RaceField towPath), once it is on its way.
 stopList(){
  const room=this.room,field=this.immersive?.field;
  if(room.role==='host'){
   if(!field?.rivals.some(r=>r.stop))return NO_STOPS;
   const back=new Set([...room.race?.seats??[],...room.away.values()].map(s=>s.number));
   return field.rivals.filter(r=>r.stop).map(r=>({number:r.seat,stage:r.stop.stage,back:!r.stop.flagged&&back.has(r.seat),...(r.stop.side?{side:r.stop.side}:{})}));
  }
  const lobby=room.lobby;return lobby?.race&&lobby.race.id===this.race?.id?lobby.stops??NO_STOPS:NO_STOPS;
 }
 // Every frame of a race: the stages of the cars waiting for their pilots (the host tells the room),
 // the AB a guest's window gives one at its flag, the tow trucks and the marshals' flags. A guest's own
 // car in the list is restored separately by checkCut, including a lost stream of states. The
 // race's own clock times them (RaceField time): a race standing still for its host (pause) stops them.
 syncStops(){
  const room=this.room,list=this.phase==='racing'||this.phase==='finished'?this.stopList():NO_STOPS,me=this.myNumber();
  if(room.role==='host')room.setStops(list);
  // (nothing waiting, and nothing left on the scene from a car that did)
  if(!list.length&&!this.stopped.size&&!this.trucks.size&&!this.flags.size)return;
  const now=this.immersive?.field.time??0,seen=new Set();
  for(const {number,stage,back=true,side} of list){if(number===me)continue;seen.add(number);const stop=this.stopped.get(number);if(stop?.stage!==stage)this.stopped.set(number,{stage,since:now,back,side});else Object.assign(stop,{back,side});}
  for(const number of [...this.stopped.keys()])if(!seen.has(number))this.stopped.delete(number);
  if(room.role!=='host')for(const r of this.immersive?.field.rivals??[]){const waiting=this.stopped.has(r.seat);if(waiting&&!r.broken)r.broken={kind:NO_DRIVER,smokeLeft:0};else if(!waiting&&r.broken?.kind===NO_DRIVER)r.broken=null;}
  this.drawStops(now);
 }
 // The tow truck at a car the tow takes (players' wish: it turns up by the track right by the car,
 // drives past it and hooks it, and takes it to the grass): in along the side of the track from behind,
 // past the car, onto the tow's way in front of it, hooked, then ahead of the car as it pulls it along
 // that way (RaceField towPath: the host's field has it, any other window works it out from the car as
 // it shows it, on the side the host says); done, or its pilot back, it drives on along it and away.
 // The marshal at the post before a car still on the road waves the yellow flag. They stand in the
 // scene itself (the visuals hide anything else among the cars each frame). now: the race's clock.
 drawStops(now){
  const immersive=this.immersive;if(!immersive)return;
  const visual=immersive.visual,scene=visual.root.parent??visual.root,data=immersive.data,L=data.meta.reconstructed_xy_m;
  for(const [number,stop] of this.stopped){const r=this.slot(number);if(stop.stage==='reboque'&&r&&!this.trucks.has(number))this.trucks.set(number,{...this.truck(scene),path:r.stop?.path??immersive.field.towPath(r.car,stop.side),since:stop.since});}
  for(const [number,t] of this.trucks){
   const stop=this.stopped.get(number),r=this.slot(number),c=r?.car;
   if(stop?.stage!=='reboque'&&t.left===undefined)t.left=now;
   const gone=t.left===undefined?0:now-t.left;
   if(!c||gone>TRUCK_GONE){this.dropTruck(number);continue;}
   // Where the car is on the way (the host's own field lays it out again once the car is at rest:
   // that one; on a branch road by the way's own distance, RaceField towPath along), and the truck's
   // own way in: TRUCK_SIDE past the edge until past the car's nose.
   const P=r.stop?.path??t.path,driving=now-t.since,car=Math.max(0,Math.min(P.end,P.along?P.along(c):((c.surface.s-P.s0)%L+L*1.5)%L-L/2));
   const lane=u=>{const w=Math.max(0,Math.min(1,(u-TRUCK_CUT)/(TRUCK_AHEAD-TRUCK_CUT))),edge=P.side*(P.station(u).half+TRUCK_SIDE);return P.lane(u,edge+(P.dAt(u)-edge)*w*w*(3-2*w));};
   if(t.left===undefined)t.u=driving<TRUCK_DRIVE?-TRUCK_BACK+(TRUCK_BACK+TRUCK_AHEAD)*(1-(1-driving/TRUCK_DRIVE)**2):car+TRUCK_AHEAD;
   const u=t.u+2*gone*gone,p=lane(u),q=lane(u+.5),h=Math.atan2(q.y-p.y,q.x-p.x),fx=Math.cos(h),fy=Math.sin(h);
   // (the ground's height from the towed car's stretch of track: the player's may be far away)
   const ground=(x,y)=>c.sample(x,y).z,z=ground(p.x,p.y);
   visual.setPose(t.root,{x:p.x,y:z,z:-p.y,heading:h,grade:0,bank:0});visual.driveTruck(t.root,now);
   // The strap from the truck's hook to the car's end that faces it.
   t.strap.visible=t.left===undefined&&driving>=TRUCK_DRIVE+.6;
   if(t.strap.visible){const tx=p.x+fx*TOW_HOOK[0],ty=p.y+fy*TOW_HOOK[0],n=Math.hypot(tx-c.x,ty-c.y)||1,hx=c.x+(tx-c.x)/n*2.22,hy=c.y+(ty-c.y)/n*2.22;visual.layStrap(t.strap,strapPath([hx,ground(hx,hy)+.3,-hy],[tx,z+TOW_HOOK[1],-ty],5),ground);}
  }
  const waving=new Set();
  for(const [number,stop] of this.stopped){
   const c=this.carInTheWay(number,stop);if(!c)continue;
   // The marshals' posts (the trackside's own, trackside.js), each with the track station it stands
   // by (its ground below): once a circuit, the first time a car is in the way.
   if(this.marshalData!==data){
    this.marshalData=data;const a=data.samples;
    try{this.marshals=marshalSpots(data).map(m=>({...m,i:Math.max(0,a.findIndex(q=>q[0]>=m.s%L))}));}catch{this.marshals=[];}
   }
   let post=null,gap=Infinity;for(const m of this.marshals){const g=along(m.s,c.surface.s,L);if(g>20&&g<gap){gap=g;post=m;}}
   if(!post||gap>600)continue;waving.add(number);
   let f=this.flags.get(number);if(!f){f=this.flag(scene);this.flags.set(number,f);}
   // A metre from the marshal's post toward the road, the cloth swinging.
   const dx=post.p[1]-post.x,dy=post.p[2]-post.y,n=Math.hypot(dx,dy)||1,x=post.x+dx/n,y=post.y+dy/n;
   f.position.set(x,immersive.car.sample(x,y,post.i).z,-y);f.userData.cloth.rotation.y=.8*Math.sin(now*7)+Math.atan2(dy,dx);
  }
  for(const [number,f] of this.flags)if(!waving.has(number)){this.dropMesh(f);this.flags.delete(number);}
 }
 // A tow truck and its strap (immersive-visuals.js, as the story's tow).
 truck(scene){
  const visual=this.immersive.visual,root=visual.truckModel(),strap=visual.strapMesh();strap.visible=false;scene.add(root,strap);
  return {root,strap};
 }
 // The marshal's yellow flag: a pole and its cloth.
 flag(scene){
  const root=new THREE.Group(),pole=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,2.3,6),new THREE.MeshStandardMaterial({color:0x2b2b2b})),cloth=new THREE.Group();
  pole.position.y=1.15;root.add(pole);
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(.9,.6),new THREE.MeshStandardMaterial({color:0xf2c318,emissive:0x5a4500,side:THREE.DoubleSide}));sheet.position.set(.45,0,0);cloth.add(sheet);cloth.position.y=1.95;root.add(cloth);
  root.userData.cloth=cloth;scene.add(root);return root;
 }
 dropMesh(root){root.removeFromParent();this.immersive.visual.disposeModel(root);}
 dropTruck(number){const t=this.trucks.get(number);if(!t)return;this.trucks.delete(number);this.dropMesh(t.root);this.dropMesh(t.strap);}
 clearStops(){for(const number of [...this.trucks.keys()])this.dropTruck(number);for(const f of this.flags.values())this.dropMesh(f);this.flags.clear();this.stopped.clear();}
 // A guest's own line down mid-race (or the host has it out of its seat): its car with nobody at the
 // wheel here too and nothing sent; back in its seat, the car where the host has had it (resume). Back
 // on line, its seat from before the drop proves nothing: the host's next lobby says (Room outdated),
 // and the host's snapshots reach this window once the room has this race again (Room becomeGuest:
 // a connection made anew forgets it until then). A line crossed meanwhile is no finish here
 // (stepFree), and a car the host had reach the flag with nobody at the wheel is AB there for good:
 // it stays without its pilot here too (over). (A car the host only stopped hearing, checkSilence,
 // is not cut here: this window never knew, its pilot drove on, and its next state puts the car back
 // where it is.) Once the host's lobby has moved on from this race, or the room took this window back
 // as a new pilot (the server lost it), nobody can give the car back: the wheel is this window's
 // again, and the race is the host's no more (lost). The host's own car is never cut (a host without
 // its line drives the field on, and a role lost to a refused key is a guest's only).
 checkCut(){
  const room=this.room,immersive=this.immersive,now=clock();
  // The socket can stay open while only this pilot's states stop reaching the host. Its stop list
  // then asks for the same handover as a disconnected line: resume at the host's current car. After
  // resuming, send that pose until the host removes the stop; retry if its acknowledgement is lost.
  const stopped=this.stopList().some(s=>s.number===this.myNumber());
  if(!stopped)this.reclaiming=null;
  const correction=stopped&&(this.reclaiming==null||now-this.reclaiming>STRANDED);
  if(room.role==='host'||this.myNumber()===this.race.car||!this.cut&&immersive.freeFinished&&!correction||this.lost){this.cut=null;return;}
  if(this.cut?.over)return;
  if(room.problem===null&&!room.outdated&&(room.lobby?.race?.id!==this.race.id||room.id!==this.seatId)){
   this.lost=true;room.note('fora da corrida do anfitrião');if(this.cut){this.cut=null;room.note('carro de volta sem a sala');}return;
  }
  const out=room.problem!==null||room.outdated||room.race?.id!==this.race.id||!room.race.seats.some(s=>s.id===room.id);
  if(out||correction&&!this.cut){if(!this.cut){this.cut={mine:null,seatedAt:null,clock:immersive.car.clock};room.note('sem piloto: retomando o carro da sala');}else this.cut.seatedAt=null;return;}
  if(!this.cut)return;
  const mine=this.cut.mine;this.cut.seatedAt??=now;
  if(!mine||mine.at<=this.cut.seatedAt)return;
  const goal=immersive.data.meta.reconstructed_xy_m*immersive.freeTotalLaps+immersive.field.gridLeadIn;
  if(mine.state.retired&&mine.state.progress>=goal-.01){this.cut.over=true;room.note('bandeirada sem piloto: DNF');return;}
  // A finish during missing states may never have reached the host's flag. The checked handover
  // restores the unfinished car too, so it can complete the remaining distance normally.
  if(immersive.freeFinished&&!mine.state.finished){immersive.freeFinished=false;immersive.finishElapsed=null;immersive.finishTime=null;immersive.finishBest=null;immersive.freeOrder=null;this.finishedAt=null;}
  this.resume(mine.state);this.cut=null;this.reclaiming=stopped?now:null;room.note('carro retomado');
 }
 // Back after a cut: this window's car goes where the host has had it (rolled on, on the strap, or on
 // the grass), at the speed it has there, its race distance and its laps the host's (TestCar
 // syncLaps: the host's distance counts laps that count, as this window sends it).
 resume(s){
  const immersive=this.immersive,car=immersive.car,field=immersive.field,L=immersive.data.meta.reconstructed_xy_m,lead=field.gridLeadIn;
  car.syncLaps(s.progress<lead?-1:Math.floor((s.progress-lead)/L),this.cut.clock);
  Object.assign(car,{x:s.x,y:s.y,heading:s.heading,vx:s.vx,vy:s.vy,yaw:s.yaw,excursion:null});
  // (its stretch of track found from where it is now: the one it left may be far away, and another
  // stretch near there on the ground; where the lap passes over itself, the one at the state's height)
  car.relocate(s.x,s.y,s.z);
  immersive.freePlayerProgress=s.progress;immersive.freeLastS=car.surface.s;Object.assign(field.playerRun,{progress:s.progress,lastS:null});
 }
 // The race's host: a guest's car whose states stopped coming mid-race (a line dead without a word, a
 // window hidden or frozen, the server stalled) is left without a driver after STRANDED seconds, as for
 // a pilot gone (left): it rolls on, the tow, the yellow flag, instead of standing frozen on the racing
 // line at the speed it last had. Its next state hands it back where its pilot has it (heardCar). A car past its flag
// is out of the race: it goes to the pit lane, where its own window puts it (parkGuest), never a bot's to bring in
// (the team's test, 10-26: a guest's window hidden long after its flag, a bot took its car round again, alongside
// the host on its last lap, and into the pits).
 // Humans' seats only, and only in the race this window hosts: a window the room made its host during
 // someone else's race shows every car from that host's word, bots and all, and none is its guest's.
 // Not while this window's own line is down (closed, or no echo: Room lineQuiet; the race stands still
 // then, pause), nor for STRANDED seconds after it is back: that silence is the host's, and its
 // guests' states take a moment to come again.
 checkSilence(){
  const now=clock(),room=this.room;if(room.lineQuiet(now)){this.lineDown=now;return;}
  if(this.myNumber()!==this.race.car||now-(this.lineDown??-Infinity)<STRANDED)return;
  const humans=new Set(this.race.seats.map(s=>s.number));
  for(const r of this.immersive.field.rivals){
   const remote=r.puppet&&r.puppet!==parkedPuppet&&humans.has(r.seat)?this.remotes.get(r.seat):null;
   if(remote&&remote.seq>=0&&remote.age>STRANDED){remote.waiting=r;if(r.finished){this.parkGuest(r);room.note('no box sem estados: #'+r.seat);}else{this.immersive.field.strand(r,NO_DRIVER);room.note('sem estados de #'+r.seat);}}
  }
 }
 // The race stands still in every window while its host is out of reach (players' wish: a race on the
 // host's machine, a championship's round, must neither go on without it nor be lost to a dropped
 // line): the host's own line down (Room lineQuiet; only with other pilots in its race), and for a
 // guest the host gone from the room for a moment (the server's word) or silent for QUIET seconds,
 // unless the guest's own line closed (its car goes on without a driver instead: checkCut). (A late
 // echo of its own says nothing to a guest here: a stalled server makes every echo late, the host's
 // too, and a guest that drove on then raced alone among standing cars.) Nothing
 // moves meanwhile and the clocks stop (main.js frozen: no steps); the race goes on from there once the
 // host is heard again, the results' wait put off by as long. (The room server keeps a host's place
 // through its race a long while; one that never comes back has taken its race with it: lost.)
 updatePause(){
  const room=this.room,race=this.race,now=clock();let why=null;
  if(this.phase==='racing'&&race&&this.immersive&&!this.lost){
   if(room.problem==='fechada')why='fechada';
   else if(this.myNumber()===race.car){if(room.lineQuiet(now)&&(race.seats.length>1||room.away?.size))why='linha';}
   else if(room.role==='guest'&&!this.cut&&(room.hostAway||now-room.hostSeen>QUIET))why=room.hostAway?'saiu':'silencio';
  }
  if(why&&!this.pause){this.pause={why,since:now};room.note('corrida pausada: '+why);}
  else if(why)this.pause.why=why;
  else if(this.pause){const held=now-this.pause.since;if(this.finishedAt!==null)this.finishedAt+=held;if(this.firstFlagAt!=null)this.firstFlagAt+=held;room.note(`corrida retomada (${held.toFixed(1)} s)`);this.pause=null;}
 }
 // main.js: whether the race stands still for its host this frame (no physics step, no engine sound).
 frozen(){return !!this.pause;}
 heardCar(id,m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;
  const seat=this.race.seats.find(s=>s.id===id),state=seat&&readCar(m.car),remote=state&&this.remotes.get(seat.number);
  if(!remote||m.seq<=remote.seq)return;
  // (when each state reached this window: the line's steadiness, linkGhosts)
  {const L=remote.link??={last:clock(),gaps:[]},now=clock();if(now-L.last>LINK_GAP)L.gaps.push(now);L.last=now;}
  this.heardExtra(seat.number,m.pe,m.ab);
  // The host is authoritative for the guest's progress and times. Raw packets are never relayed:
  // all windows see the host's checked pose and lap book, including after a drop and tow.
  const r=this.slot(seat.number);if(!r)return;
  const field=this.immersive.field;
  remote.verify??=r.guestRace??=new GuestRaceState(r,{time:field.time,laps:this.race.laps,lead:field.gridLeadIn});
  if(remote.waiting)remote.verify.rebase(r,field.time);
  const checked=remote.verify.receive(state,field.time,{running:(this.phase==='racing'||this.phase==='finished')&&!this.pause&&!(this.immersive.freeCountdown>0),parking:remote.verify.finished?this.parkingSpotOf(seat.number):null});
  if(!checked)return;
  // (a pilot back in its car takes the wheel with its first state: remote)
  if(remote.receive(checked.state,{age:Math.min(m.lat,.35),seq:m.seq,raw:checked.raw})&&remote.waiting)this.handOver(remote.waiting,remote);
 }
 heardField(m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;const me=this.myNumber();
  // (this window's own car, as the host has it: where it is taken back after a cut)
  for(const [number,age,values,extra] of m.cars){if(extra?.g)(this.hostGhosts??=new Map()).set(number,clock());if(number===me){const state=this.cut&&readCar(values);if(state)this.cut.mine={state,at:clock()};continue;}const state=readCar(values);if(state)this.remotes.get(number)?.receive(state,{age:age+this.room.latency,seq:m.seq,raw:values});this.heardExtra(number,extra?.pe,extra?.ab);}
 }
 // Every frame (main.js), paused or not: the room's clockwork, this window's car on the wire.
 frame(dt){
  const game=this.game,s=game.session(),room=this.room,immersive=this.immersive;
  room.setName(s.started&&immersive?.pilotName||game.pilotName());room.setLook(game.look?.());room.tick();
  // The host closed the room: its window out of it once the server let it go (or after CLOSE_WAIT anyway).
  if(this.closingAt!=null&&(room.problem==='fechada'||clock()-this.closingAt>CLOSE_WAIT)){this.leaveRoom();return;}
  // Invited in (the team's wish, 10-26: who was invited knows of no password, nor of a way in by hand): the room closed
  // or the invitation gone, this pilot just leaves it.
  if(room.invited&&['fechada','convite','chave'].includes(room.problem)){this.leaveAt??=clock()+LEAVE_AFTER;if(clock()>=this.leaveAt){this.leaveRoom();return;}}
  // Let in: the guest goes to the car screen (once; not out of a race, nor without a pilot's name).
  if(!this.welcomed&&this.admitted()){this.welcomed=true;game.openCars();}
  // Out of the race (the way out of the menu, another track, Modo História): the room hears it.
  if(this.phase!=='lobby'&&(!s.started||immersive?.active)){this.phase='lobby';this.holding=false;this.cut=null;if(room.role==='host')room.closeRace();}
  if(this.phase==='racing'&&immersive&&this.race)this.checkCut();
  if(this.phase==='racing'&&immersive&&this.race)this.raceEnd();
  this.endWarning(s);
  if((this.phase==='racing'||this.phase==='finished')&&immersive?.freeFinished&&this.race&&!this.ended)this.finishAndWatch();
  // While the start waits, the room meets at the Tia's café in the Box 99 (the team's wish, 10-26: meet, buy, talk, then
  // the host calls everyone to the cars): this pilot on foot by it once the track is ready (main.js meet; a track
  // without the café, none). Once: walked off or not, the pilot stays out until the start.
  if(this.phase==='waiting'&&this.holding&&this.race&&!this.met&&immersive&&this.game.hasCafe?.())this.met=!!this.game.meet?.(this.humanIndex(this.myNumber()),this.meetingAway());
  this.updatePause();
  if((this.phase==='racing'||this.phase==='finished')&&immersive&&room.role==='host')this.checkSilence();
  if((this.phase==='racing'||this.phase==='finished')&&immersive&&this.race)this.linkGhosts(dt);
  if((this.phase==='racing'||this.phase==='finished')&&immersive)this.syncStops();else if(this.stopped.size||this.trucks.size||this.flags.size)this.clearStops();
  // A window waiting outside any race (a guest's rerun before the host starts one) sends nothing.
  if(this.phase!=='lobby'&&immersive&&this.race){
   if(this.holding&&room.role==='guest'&&room.race?.id===this.race.id&&(this.readyClock-=dt)<=0){this.readyClock=1;room.sendReady();}
   this.sendClock+=dt;if(this.sendClock>=SEND){this.sendClock=Math.min(this.sendClock-SEND,SEND);this.send(s.paused);}
   if(this.phase==='racing'){
    if(this.autopilot&&!this.autopilotOn&&!this.onlyWatching()){game.autopilot(true);this.autopilotOn=true;}
    // Driving keys take the wheel back (main.js takeWheel): the box follows.
    else if(this.autopilotOn&&!game.autopilot()){this.autopilot=this.autopilotOn=false;this.panel.auto.checked=false;}
   }
  }
  if((this.panelClock-=dt)<=0){this.panelClock=.25;this.render();}
  this.drawPeople(dt);
  this.chat.frame();
  if(this.invites.open){
   if(!this.canInvite())this.showInvites(false);
   else if(clock()-this.invites.asked>=ONLINE_EVERY){this.invites.asked=clock();room.askOnline();this.loadRecords();}
  }
  const account=this.game.accountName?.()??null;
  if(account!==this.accountSeen){this.accountSeen=account;if(account&&['conta','apelido'].includes(room.problem))room.retry();}
 }
 // The world point over a pilot's car for its chat balloon (this window's own: over its car, or over the
 // pilot out of it, main.js playerAnchor); none outside a race, nor for a pilot not in it.
 chatAnchor(id,out){
  if(!this.game.session().started||!this.immersive||this.immersive.active)return null;
  if(id===this.room.id)return this.game.playerAnchor?.(out)??null;
  const seated=this.race?.seats.find(s=>s.id===id),walker=seated&&this.walkers.get(seated.number);
  if(walker){walker.root.getWorldPosition(out);out.y+=2.4;return out;}
  const number=this.race?.seats.find(s=>s.id===id)?.number;if(!number)return null;
  const field=this.immersive.field,k=field.rivals.findIndex(r=>(r.seat??r.entry.number)===number),obj=k>=0?this.immersive.visual.rivals[k]:null;
  if(!obj?.visible||!obj.parent)return null;
  obj.getWorldPosition(out);out.y+=2.5;return out;
 }
 // The card's button for an account problem: sign in (Google), pick the nickname (the account's dialog),
 // or try again (a pass the room did not take).
 accountAction(){const problem=this.room.problem;if(problem==='conta')this.game.signIn?.();else if(problem==='apelido')this.game.openAccount?.();else if(problem==='fechada')this.leaveRoom();else this.room.retry();}
 // The host's Fechar sala (the team's wish, 10-26: the host leaves and takes everybody out): a first click asks, a
 // second within CLOSE_CONFIRM closes the room (net-room.js closeRoom) and this window leaves it (frame).
 closeRoom(){
  if(this.closingAt!=null)return;const now=clock();
  if(this.closeAsk==null||now-this.closeAsk>CLOSE_CONFIRM){this.closeAsk=now;this.render();return;}
  this.closeAsk=null;if(this.room.closeRoom())this.closingAt=now;this.render();
 }
 // Out of the room for good (its host closed it): the game again, as at its own address without the room's.
 leaveRoom(){
  if(this.leftRoom)return;this.leftRoom=true;
  try{history.replaceState(null,'',location.pathname+location.search);}catch{}
  location.reload();
 }
 send(paused){
  const immersive=this.immersive,car=immersive.car,room=this.room,command=this.game.command()??{},L=immersive.data.meta.reconstructed_xy_m,still=paused||this.holding||!!this.pause;
  const progress=Math.min(immersive.freePlayerProgress,car.laps*L+car.surface.s+immersive.field.gridLeadIn);
  const mine=packCar(car,{progress,finished:immersive.freeFinished,finishTime:immersive.finishTime,brake:command.brake??0,throttle:command.throttle??0,still});this.seq++;
  const extra=this.ownExtra();
  if(room.role==='guest'){if(!this.cut&&!this.lost)room.sendState(mine,this.seq,extra);return;}
  // The host relays a guest's checked state, with its age; the rest it drives.
  // (with each human's extras: the host's own, and each guest's as its window last told)
  const cars=[[this.myNumber(),0,mine,...(extra?[extra]:[])]];
  for(const r of immersive.field.rivals){
   const remote=r.puppet?this.remotes.get(r.seat):null;
   // (a human's car the host sees through: g, on top of its extras; one left without its pilot too)
   const ghost=this.ghostWord(r.seat??r.entry.number),fresh=remote?.raw?this.freshExtra(r.seat):null,more=ghost?{...(fresh??{}),g:1}:fresh;
   cars.push(remote?.raw?[r.seat,Math.min(remote.age,5),remote.raw,...(more?[more]:[])]:[r.entry.number,0,packCar(r.car,{progress:r.progress,finished:r.finished,retired:!!r.retired,finishTime:r.finishTime,brake:r.input?.brake??0,throttle:r.input?.throttle??0,still}),...(ghost?[{g:1}]:[])]);
  }
  room.sendSnapshot(cars,this.seq);
 }
 // The room's race ends for everyone at once (the team's wish, 10-26: one window showed its result while another still
 // raced, and the host did not know): once every human is past the flag or out of the race for good, when the host ends
 // it (Encerrar corrida), or RESULTS_WAIT s after the first human's flag; the host decides and says so (net-room.js
 // endRace), and every window counts that time down from the first flag it saw.
 raceEnd(){
  const now=clock(),room=this.room,watching=room.role==='host'&&!!this.race.assiste,mine=!!this.immersive.freeFinished||watching;
  if(this.immersive.freeFinished||this.finishedNames().length)this.firstFlagAt??=now;
  // A guest whose host's word no longer carries this race (the host went to the menu, to another track, or opened a new
  // race before its end was heard): over here too, at once (never left waiting for an end that will not come).
  if(room.role==='guest'&&!this.ended&&room.problem===null&&!room.outdated&&room.lobby&&room.lobby.race?.id!==this.race.id){this.endForAll();return;}
  if(room.role!=='host'||this.ended||this.pause)return;
  if(mine&&this.stillRacing()===0||this.endAsked||this.firstFlagAt!=null&&now-this.firstFlagAt>=RESULTS_WAIT){room.endRace();this.endForAll();}
 }
 // The race over for everyone: whoever still races gets the result now, the time to the flag estimated
 // (immersive-mode.js endFreeRace); out of the car (the café, a walk), back in it first.
 endForAll(){
  if(this.ended)return;this.ended=true;this.endAsk=null;this.room.note('fim da corrida para todos');
  this.creditFinishes();
  const immersive=this.immersive;if(immersive&&!immersive.freeFinished){this.game.unmeet?.();immersive.endFreeRace?.({watched:this.room.role==='host'&&!!this.race?.assiste});}
  // (on a guest's sheet, no row for a host who only watched)
  if(immersive?.freeOrder&&this.race?.assiste&&this.room.role!=='host')immersive.freeOrder=immersive.freeOrder.filter(r=>r.number!==this.race.car);
  this.render();
 }
 // A finish a pilot's window already told (its state) counts before the field steps that car over the line (handOver's
 // puppet, the next frame): the order taken at the end has the pilot's own time and best lap, never an estimate.
 creditFinishes(){
  for(const r of this.immersive?.field.rivals??[]){
   const remote=r.puppet&&r.puppet!==parkedPuppet?this.remotes.get(r.seat):null,s=remote?.state;
   if(s?.finished&&!remote.waiting&&!r.finished){r.finished=true;r.finishTime=s.finishTime;Object.assign(r.car,{laps:s.laps,best:s.best});}
  }
 }
 // The host's Encerrar corrida: a first click asks, a second within CLOSE_CONFIRM ends the race for everyone.
 askEnd(){const now=clock();if(this.endAsk==null||now-this.endAsk>CLOSE_CONFIRM){this.endAsk=now;this.render();return;}this.endAsk=null;this.endAsked=true;}
 // The other humans past the flag, and those still racing (with the lap they are on), by name.
 // The humans racing the room's race: its seats, but a host who only watches.
 racers(){const race=this.race;return (race?.seats??[]).filter(s=>!(race.assiste&&s.number===race.car));}
 // The host who only watches (Só assistir; the team's wish, 10-26): from the start its car is parked in the pit lane, out
 // of sight and touching nothing, on every screen (linkGhosts), and its cameras are on the others (N, Shift+N); out of the
 // humans' standings and of the result's order; the race still ends on its word.
 // The host's choice (the track screen's Você, the room line's box): the next race's plan takes it, and a race waiting
 // for its start takes it at once (the guests hear it in the lobby).
 setWatching(on){
  this.watching=!!on;const race=this.room.race;
  if(race?.state==='waiting'&&this.room.role==='host'){if(this.watching)race.assiste=true;else delete race.assiste;this.room.beacon();}
  this.render();
 }
 // That host while its race runs (its car held as a parked one is, the step's PARKED input: no key, pad or wheel moves
 // it, no lap counts; nor is the automatic pilot switched on for it, frame).
 onlyWatching(){return this.phase==='racing'&&this.room.role==='host'&&!!this.race?.assiste;}
 watchFromStart(){
  const immersive=this.immersive;if(!immersive||this.phase!=='racing')return;
  if(this.parkCar(immersive.car,this.myNumber()))this.game.teleported?.();
  this.parked=true;immersive.car.netGhost=true;immersive.visual.hideOwn=true;this.room.note('anfitrião assistindo');this.watchRacing();
 }
 finishedNames(){const me=this.myNumber();return this.racers().filter(s=>s.number!==me&&(this.remotes.get(s.number)?.state?.finished||this.slot(s.number)?.finished)).map(s=>s.name);}
 racingNames(){
  const me=this.myNumber(),laps=this.immersive?.freeTotalLaps??1;
  return this.racers().filter(s=>s.number!==me&&!(this.remotes.get(s.number)?.state?.finished||this.slot(s.number)?.finished)&&!this.slot(s.number)?.retired)
   .map(s=>{const car=this.slot(s.number)?.car,lap=car?Math.min(laps,(car.laps??0)+1):null;return lap&&laps>1?`${s.name} (volta ${lap}/${laps})`:s.name;});
 }
 // The end coming, in the middle of the screen (the team's wish, 10-26): "1 minuto" for WARN_SHOWN seconds when a
 // minute is left, "30 segundos" at thirty, then the last ten seconds counted down; on every window in the race, its
 // own countdown from the first flag it saw (raceEnd), whether its pilot still races or waits past the flag.
 endWarning(s){
  const warn=this.panel?.warn;if(!warn)return;
  const results=document.getElementById('raceResults'),left=this.firstFlagAt==null||this.ended||this.phase!=='racing'||!s.started||s.paused||results&&!results.hidden?null:RESULTS_WAIT-(clock()-this.firstFlagAt);
  let text='',big=false;
  if(left!==null&&left>0){
   if(left<=10){text=String(Math.ceil(left));big=true;}
   else if(left<=30&&left>30-WARN_SHOWN)text='Faltam 30 segundos · a corrida acaba para todos';
   else if(left<=60&&left>60-WARN_SHOWN)text='Falta 1 minuto · a corrida acaba para todos';
  }
  if(warn.hidden===!!text)warn.hidden=!text;if(warn.textContent!==text)warn.textContent=text;warn.classList.toggle('mp-fim-numero',big);
 }
 // ' · a corrida acaba para todos em m:ss' once a human is in ('' before); short: ' · fim em m:ss'.
 endText(short=false){
  if(this.firstFlagAt==null||this.ended)return '';const left=Math.max(0,RESULTS_WAIT-(clock()-this.firstFlagAt));
  return `${short?' · fim em ':' · a corrida acaba para todos em '}${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
 }
 // main.js asks before showing the result: not while other humans still race (up to RESULTS_WAIT), nor
 // while the race stands still for its host.
 holdResults(){
  const immersive=this.immersive;if(this.phase!=='racing'||!immersive?.freeFinished||immersive.finishing)return false;
  const now=clock();this.finishedAt??=now;
  // The room's race ends for everyone at once, on its host's word (raceEnd): until then this pilot, past the flag, watches
  // the others (or meets them at the café). Out of the room's race (its line lost for good, no room any more), it waits
  // no longer than RESULTS_WAIT.
  if(!this.ended&&(this.lost||!this.room.role)&&now-this.finishedAt>=RESULTS_WAIT)this.ended=true;
  if(this.pause||!this.ended)return true;
  this.phase='finished';
  // (the order as it stands now: estimated times for whoever still races; one's own already, if the end came first)
  this.creditFinishes();
  if(!immersive.finishEstimated)immersive.freeOrder=immersive.field.classification(immersive.freeTotalLaps,immersive.finishTime);
  if(this.race?.assiste&&this.room.role!=='host')immersive.freeOrder=immersive.freeOrder.filter(r=>r.number!==this.race.car);
  this.render();return false;
 }
 // The other humans the result waits for: seated in the race, or out of it for a moment with their car
 // waiting for them (back: their line dropped or went quiet); not one past the flag, nor one whose car
 // is AB for good or who left the race (back false). (A car left without its pilot is retired at once,
 // and its pilot may yet come back and finish: retired says nothing here.)
 stillRacing(){
  const me=this.myNumber(),stops=new Map(this.stopList().map(x=>[x.number,x]));
  const numbers=new Set([...this.racers().map(s=>s.number),...[...stops.values()].filter(x=>x.back!==false).map(x=>x.number)]);numbers.delete(me);
  return [...numbers].filter(n=>!this.remotes.get(n)?.state?.finished&&!this.slot(n)?.finished&&stops.get(n)?.back!==false).length;
 }
 buildPanel(){
  const {root,add,role,status}=roomCard();
  this.panel={root,role,status,list:add('ol','mp-players')};
  // The host's start, shown while its race waits (Enter does the same).
  const start=this.panel.start=add('button','mp-start');start.type='button';start.id='mpStart';start.hidden=true;
  start.onclick=()=>{this.room.lightsOut();start.blur();};
  root.insertBefore(start,this.panel.list);
  // The host's end of the race for everyone (raceEnd), asked twice: whoever still races gets the result now.
  const end=this.panel.end=add('button','mp-end');end.type='button';end.id='mpEnd';end.hidden=true;end.onclick=()=>{this.askEnd();end.blur();};
  root.insertBefore(end,this.panel.list);
  // Online: the room's password (asked when the server wants it), the account's way in, and the host's doorman.
  const form=this.panel.key=add('form','mp-key');form.hidden=true;
  const field=add('input','',form);field.type='password';field.id='mpKey';field.placeholder='Senha da sala';field.autocomplete='off';field.maxLength=128;field.setAttribute('aria-label','Senha da sala');
  const enter=add('button','',form);enter.type='submit';enter.textContent='Entrar';
  form.onsubmit=e=>{e.preventDefault();const key=field.value.trim();if(!key)return;saveKey(key);field.value='';field.blur();this.room.retry();};
  root.insertBefore(form,this.panel.list);
  // The host's invitations (online, out of a race): who is online, their records, Convidar.
  const invite=this.panel.invite=add('button','mp-invite');invite.type='button';invite.hidden=true;invite.textContent='Convidar pilotos online';invite.onclick=()=>{this.showInvites(!this.invites.open);invite.blur();};
  root.insertBefore(invite,this.panel.list);
  this.buildInvites();
  const account=this.panel.account=add('button','mp-account');account.type='button';account.hidden=true;account.onclick=()=>{this.accountAction();account.blur();};
  root.insertBefore(account,this.panel.list);
  this.panel.knocks=add('ul','mp-knocks');root.insertBefore(this.panel.knocks,this.panel.list);
  const label=add('label','mp-auto'),box=add('input','',label);box.type='checkbox';box.id='mpAuto';box.checked=this.autopilot;label.append(' Piloto automático neste carro');
  // The box gives the focus back at once: typed driving keys are ignored while an input has it.
  box.onchange=()=>{this.autopilot=box.checked;if(!box.checked&&this.autopilotOn){this.game.autopilot(false);this.autopilotOn=false;}box.blur();};
  this.panel.auto=box;
  // The host's choice to watch its race instead of racing it (watchFromStart): on the track screen beside the laps (the
  // room line there has no room for it), and on the room line while the race waits for the start.
  const watchLabel=add('label','mp-auto mp-watch'),watch=add('input','',watchLabel);watch.type='checkbox';watch.id='mpWatch';watchLabel.append(' Só assistir (não correr)');
  watch.onchange=()=>{watch.blur();this.setWatching(watch.checked);};
  this.panel.watch=watch;this.panel.watchLabel=watchLabel;
  const options=document.querySelector('#tracks .tracks-side-head');
  if(options){
   const pick=document.createElement('label'),select=document.createElement('select');pick.className='tracks-laps mp-watch-pick';pick.hidden=true;
   select.id='tracksWatch';select.title='Só assiste: seu carro fica fora da corrida, nos boxes, e as câmeras seguem os outros pilotos.';
   select.append(new Option('Corre','corre'),new Option('Só assiste','assiste'));select.onchange=()=>this.setWatching(select.value==='assiste');
   pick.append('Você',select);options.append(pick);this.panel.watchPick=pick;this.panel.watchSelect=select;
  }
  this.panel.net=add('small','mp-net');
  // The host's way out, everybody with it (closeRoom): last, out of the way of the rest.
  const close=this.panel.close=add('button','mp-close');close.type='button';close.id='mpClose';close.hidden=true;close.onclick=()=>{this.closeRoom();close.blur();};
  // A pilot's own way out of the room, back to the game alone (the host's is Fechar sala; the team's wish, 10-26).
  const leave=this.panel.leave=add('button','mp-leave');leave.type='button';leave.id='mpLeave';leave.hidden=true;leave.textContent='Sair da sala';leave.onclick=()=>{leave.blur();this.leaveRoom();};
  // The race standing still because its host closed the room: the way back to the game, there too.
  const back=document.createElement('button');back.type='button';back.id='mpBack';back.hidden=true;back.textContent='Voltar ao jogo';back.onclick=()=>this.leaveRoom();
  // The race standing still for its host: a plate in the middle of the screen says so, and why.
  const pause=this.panel.pause=document.createElement('div');pause.id='mpPause';pause.hidden=true;pause.setAttribute('role','status');
  this.panel.pauseTitle=add('b','',pause);this.panel.pauseTitle.textContent='CORRIDA PAUSADA';this.panel.pauseWhy=add('span','',pause);pause.append(back);this.panel.back=back;
  // The end's countdown on the screen (endWarning): one minute left, thirty seconds, then the last ten, one by one.
  const warn=this.panel.warn=document.createElement('div');warn.id='mpFimAviso';warn.hidden=true;warn.setAttribute('role','status');
  document.body.append(root,pause,warn);
 }
 statusText(s){
  const room=this.room,me=room.number;
  // The race standing still for its host; racing with this guest's line down: what becomes of the car.
  if(this.pause)return PAUSES[this.pause.why](Math.floor(clock()-room.hostSeen));
  if(this.cut&&['reconectando','fora','contas','salas'].includes(room.problem))return 'Conexão caiu · seu carro segue sem piloto até você voltar…';
  if(this.immersive?.car.netGhost&&this.phase==='racing'&&!(room.role==='host'&&this.race?.assiste))return 'Sua conexão está instável · os outros te veem transparente, sem batidas, até ela firmar.';
  if(room.problem&&PROBLEMS[room.problem])return PROBLEMS[room.problem]+(this.leaveAt!=null?' Voltando ao jogo…':'');
  if(!room.role)return 'Procurando a sala…';
  // At the door of a room nobody with the host's password has opened yet (or whose host is gone).
  if(room.pending)return room.hostId?'Esperando o anfitrião aceitar você…':'A sala ainda não foi aberta · esperando o anfitrião chegar…';
  if(room.online&&room.role==='guest'&&!room.hostId)return 'A sala ficou sem anfitrião · esperando alguém com a senha do anfitrião…';
  // The host said goodbye (a reload, most likely): its guests wait for it before electing another.
  if(room.hostAway)return 'O anfitrião saiu · esperando ele voltar…';
  if(this.immersive?.active)return 'A sala corre só no Modo Corrida.';
  if(room.role==='guest'&&!me)return 'Sala cheia: os 15 carros estão ocupados.';
  const choosing=this.choosing(),picking=choosing?` · ${choosing} escolhendo o carro`:'';
  if(this.phase==='waiting'){
   if(room.role==='host'&&room.race){
    const {guests,ready}=this.readiness();
    return guests?`${ready} de ${guests} convidado${guests>1?'s':''} pronto${ready===1?'':'s'}${picking} · quem chegar antes da largada também corre`
     :choosing?`${choosing} convidado${choosing>1?'s':''} escolhendo o carro · quem chegar antes da largada também corre`:'Ninguém na sala ainda · aceite quem chegar antes da largada';
   }
   if(this.race&&this.game.meeting?.())return 'Encontro na lanchonete da Tia · o anfitrião chama todos para os carros';
   return this.race?'Pronto · o anfitrião dá a largada':'Esperando o anfitrião largar…';
  }
  if(this.phase==='racing'){
   if(room.role==='host'&&this.race?.assiste&&!this.ended){
    const names=this.racingNames(),key=this.game.keyName?.('KeyN')??'N';
    return `Você está assistindo${names.length?` · correndo: ${names.join(', ')}`:''}${this.endText(true)} · ${key} / Shift+${key}: trocar de carro`;
   }
   if(this.immersive?.freeFinished){
    // (short: the room's line on the track holds what comes first, who still races and the end's countdown)
    const names=this.racingNames(),key=this.game.keyName?.('KeyN')??'N',f=this.game.keyName?.('KeyF')??'F',waiting=(names.length?`Esperando ${names.join(', ')}`:'Esperando o fim')+this.endText(true);
    if(this.game.meeting?.())return `Na lanchonete da Tia · ${waiting} · ${f}: voltar a assistir a corrida`;
    return `${waiting} · ${key} / Shift+${key}: ver os outros carros${this.game.hasCafe?.()?` · ${f}: lanchonete da Tia`:''}`;
   }
   if(room.role==='guest'&&room.lobby?.race?.id!==this.race?.id)return 'O anfitrião saiu desta corrida.';
   if(this.lost)return 'A sala perdeu seu lugar nesta corrida (a conexão caiu) · você corre a próxima.';
   // A car without its pilot, a line gone quiet: what, who, where.
   const trouble=this.trouble();if(trouble)return trouble;
   // The door waits for the race to end.
   // Someone in: who, and when the race ends for everyone.
   const done=this.finishedNames();if(done.length)return `${done.join(' e ')} ${done.length>1?'terminaram':'terminou'}${this.endText()}`;
   const humans=this.race?.seats.length??1,door=room.role==='host'&&room.knocks.size?` · ${room.knocks.size} na porta (entra depois da corrida)`:'';
   return `Corrida com ${humans} piloto${humans>1?'s':''} ${humans>1?'humanos':'humano'}${door}.`;
  }
  if(this.phase==='finished')return 'Fim de corrida.';
  if(room.role==='host'){
   if(s.started)return 'Esta corrida é só sua: a sala larga junto na Corrida única.';
   const guests=room.members.length-1;
   return guests?`Você hospeda · ${guests-choosing} de ${guests} convidado${guests>1?'s':''} aguardando a largada${picking} · escolha a pista e clique em Corrida única.`
    :'Você hospeda · aceite quem chegar, escolha a pista e clique em Corrida única: todos largam juntos.';
  }
  // A guest out of any race: picking its car, or waiting for the host's next one.
  const race=room.lobby?.race;
  if(!room.waiting)return document.getElementById('cars')?.classList.contains('hidden')?'Você está na sala: em Modo Corrida, escolha seu carro e clique em Aguardar início da corrida.':'Escolha seu carro e clique em Aguardar início da corrida.';
  return race?.state==='racing'&&!race.seats.some(x=>x.id===room.id)?'Corrida em andamento: você entra na próxima largada.':'Pronto · esperando o anfitrião escolher a pista e largar…';
 }
 // During the race: this guest back on line, its car not handed back yet (or never again: it reached
 // the flag without its pilot); the yellow flag; a line gone quiet (this guest's own, its echo late: a
 // silent host stands the race still instead, pause; guests for the host: not a car already left
 // without its driver, nor one past its flag); cars waiting on the grass for pilots who may still
 // come back; null when all is well.
 trouble(){
  const room=this.room,me=this.myNumber(),secs=r=>Math.floor(r.age),quiet=r=>r&&r.seq>=0&&r.age>=QUIET;
  if(this.cut)return this.cut.over?'Seu carro passou a bandeirada sem piloto: abandono (DNF) · você corre a próxima.':'Conexão de volta · retomando seu carro onde ele está…';
  const yellow=this.yellowText();if(yellow)return yellow;
  if(room.role==='guest'){if(room.lineQuiet())return 'Sem sinal da sala · conferindo sua conexão…';}
  else{
   const silent=this.race.seats.map(s=>[s,this.remotes.get(s.number)]).filter(([s,r])=>s.number!==me&&quiet(r)&&!r.waiting&&!r.state.finished).map(([s,r])=>`${s.name} (${secs(r)} s)`);
   if(silent.length)return `Sem sinal de ${silent.join(', ')}`;
  }
  const waiting=[...this.stopped].filter(([,x])=>x.stage==='fora'&&x.back).map(([number])=>`#${number} ${this.slot(number)?.entry.shortName??''}`.trim());
  return waiting.length?`${waiting.join(', ')} fora da pista · esperando ${waiting.length>1?'os pilotos':'o piloto'} voltar`:null;
 }
 // The yellow flag: a car with nobody at the wheel in the race's way (inTheWay). The card names the
 // nearest one ahead and how far it is (or how far back, just passed).
 yellow(){return this.phase==='racing'&&[...this.stopped].some(([number,stop])=>this.carInTheWay(number,stop));}
 yellowText(){
  const immersive=this.immersive,car=immersive?.car;if(!car||!this.yellow())return null;
  const L=immersive.data.meta.reconstructed_xy_m;let near=null;
  for(const [number,stop] of this.stopped){if(!this.carInTheWay(number,stop))continue;const r=this.slot(number),ahead=along(car.surface.s,r.car.surface.s,L);if(!near||ahead<near.ahead)near={number,stop,r,ahead};}
  if(!near)return null;
  const metres=v=>Math.max(10,Math.round(v/10)*10),behind=L-near.ahead,where=behind<400?`${metres(behind)} m atrás`:`a ${metres(near.ahead)} m`;
  return `BANDEIRA AMARELA · #${near.number} ${near.r.entry.shortName??''} ${near.stop.stage==='reboque'?'no guincho':'sem piloto'} ${where}`.replace(/  +/g,' ');
 }
 // Host, while its race waits: guests seated in it, and how many of them have it loaded.
 readiness(){const r=this.room.race,guests=r?r.seats.filter(x=>x.id!==this.room.id):[];return {guests:guests.length,ready:guests.filter(x=>this.room.ready.has(x.id)).length};}
 // Guests still picking their car (not waiting for the start yet).
 choosing(){const room=this.room;return room.members.filter(m=>m.id!==room.hostId&&!m.wait).length;}
 // What a pilot in the room's list is doing, as this window knows it (the host also knows who has
 // the waiting race loaded).
 doing(m){
  const room=this.room,race=room.role==='host'?room.race:room.lobby?.race,seated=race?.seats.some(s=>s.id===m.id);
  if(m.id===room.hostId)return ' (anfitrião)';
  if(race?.state==='racing')return seated?' · correndo':' · espera a próxima';
  if(seated)return room.role!=='host'?' · na largada':room.ready.has(m.id)?' · na largada':' · carregando a pista';
  return m.wait?' · aguardando a largada':' · escolhendo o carro';
 }
 render(){
  const p=this.panel;if(!p)return;const room=this.room,s=this.game.session(),me=room.number;
  p.start.hidden=!this.canStart();
  {const host=room.role==='host',line=host&&this.phase==='waiting',pick=host&&this.phase==='lobby';
   if(p.watchLabel.hidden===line)p.watchLabel.hidden=!line;if(p.watch.checked!==!!this.watching)p.watch.checked=!!this.watching;
   if(p.watchPick){if(p.watchPick.hidden===pick)p.watchPick.hidden=!pick;const value=this.watching?'assiste':'corre';if(p.watchSelect.value!==value)p.watchSelect.value=value;}}
  {const asking=this.endAsk!=null&&clock()-this.endAsk<=CLOSE_CONFIRM;
   p.end.hidden=!(room.role==='host'&&this.phase==='racing'&&!this.ended&&(this.firstFlagAt!=null||s.paused||!!this.race?.assiste));p.end.classList.toggle('mp-confirm',asking);
   const text=asking?'Clique de novo: encerrar para todos':'Encerrar corrida';if(p.end.textContent!==text)p.end.textContent=text;}
  if(!p.start.hidden){
   const {guests,ready}=this.readiness(),loading=guests-ready,choosing=this.choosing(),late=loading+choosing;
   const call=this.game.meeting?.()?'Todos para os carros':'Largar';
   p.start.textContent=!guests&&!choosing?`${call==='Largar'?'Largar sozinho':call} ↵`:late?`${call} já · ${[loading&&`${loading} carregando`,choosing&&`${choosing} escolhendo o carro`].filter(Boolean).join(', ')} ↵`:`${call} ↵`;
   p.start.classList.toggle('mp-go',!!guests&&!late);
  }
  // The held 3 says what it waits for.
  if(this.holding){const caption=document.getElementById('countdownCaption');if(caption&&caption.textContent!=='AGUARDANDO A LARGADA')caption.textContent='AGUARDANDO A LARGADA';}
  // (the room at the café: no frozen 3 on the screen meanwhile)
  document.body.classList.toggle('mp-encontro',this.holding&&!!this.game.meeting?.());
  // (a host who only watches: none of its own car's lap, place, fuel or tools on the screen, multiplayer.css)
  document.body.classList.toggle('sala-assiste',this.onlyWatching());
  // Out of the way of the result sheet; under the circuits on the track screen; one line on track.
  const results=document.getElementById('raceResults');p.root.hidden=!!results&&!results.hidden;
  this.standings?.show(this.standingRows(s,results&&!results.hidden));
  const shown=id=>!document.getElementById(id)?.classList.contains('hidden');
  p.root.classList.toggle('mp-racing',s.started&&!s.paused);
  // (the one-line card on the track: the walking panel goes under it, multiplayer.css, never over the host's start)
  document.body.classList.toggle('mp-pilula',s.started&&!s.paused&&!p.root.hidden);p.root.classList.toggle('mp-yellow',this.yellow()&&!this.pause);p.root.classList.toggle('mp-paused',!!this.pause);p.root.classList.toggle('mp-tracks',shown('tracks')||shown('cars'));
  // The car screen (main.js roomCars): the cars other pilots have, this window's car once the host
  // has answered its last choice, the car still being asked for, and for a guest its way on: the
  // host's answer at the door, then "Aguardar início da corrida".
  const taken=room.members.filter(m=>m.id!==room.id&&m.number).map(m=>[m.number,m.name]),mine=room.settled?me:null,asking=room.settled?null:room.want;
  const guest=this.guest()?{admitted:this.admitted(),waiting:room.waiting}:null,cars=JSON.stringify([taken,mine,asking,guest]);
  if(cars!==this.cars){this.cars=cars;this.game.roomCars({taken:new Map(taken),mine,asking,guest});}
  p.role.textContent=room.role==='host'?`anfitrião · #${me}`:room.pending?'na porta':room.role==='guest'?(me?`convidado · #${me}`:'assistindo'):'…';
  p.status.textContent=this.statusText(s);
  p.pause.hidden=!this.pause||!s.started||s.paused;if(!p.pause.hidden)p.pauseWhy.textContent=p.status.textContent;
  {const closed=this.pause?.why==='fechada',title=closed?'SALA FECHADA':'CORRIDA PAUSADA';p.back.hidden=!closed;if(p.pauseTitle.textContent!==title)p.pauseTitle.textContent=title;
   // (the mouse let go once, to click it)
   if(closed&&!p.pause.hidden&&!this.closedSeen){this.closedSeen=true;this.game.freeMouse?.();}}
  // The host's Fechar sala: out of the driving (the menu, the screens before the race), asked again before it closes.
  {const asking=this.closeAsk!=null&&clock()-this.closeAsk<=CLOSE_CONFIRM,closing=this.closingAt!=null;
   p.close.hidden=!closing&&!(room.role==='host'&&room.problem===null&&!(s.started&&!s.paused));
   p.leave.hidden=room.role==='host'||closing||room.problem==='fechada'||s.started&&!s.paused;p.close.disabled=closing;p.close.classList.toggle('mp-confirm',asking);
   const text=closing?'Fechando a sala…':asking?'Clique de novo: fechar a sala e desconectar todos':'Fechar sala';if(p.close.textContent!==text)p.close.textContent=text;}
  // The password form when the server asks for it, the account's button; knocks and kicks for an online host. Names only ever
  // reach the page as text. The door is open until the start: on the car screen, the track screen
  // and on the grid (a knock there lets the host's mouse go, main.js freeMouse); from the start it
  // waits for the race to end.
  p.key.hidden=!(room.online&&['chave','convite'].includes(room.problem))||room.invited;
  p.invite.hidden=!this.canInvite();p.invite.setAttribute('aria-expanded',String(this.invites.open));
  const action=room.online||room.problem==='fechada'?ACCOUNT_ACTIONS[room.problem]:null;p.account.hidden=!action;if(action&&p.account.textContent!==action)p.account.textContent=action;
  const knocks=room.role==='host'&&this.phase!=='racing'?[...room.knocks.values()]:[],kickable=room.online&&room.role==='host'&&!(s.started&&!s.paused);
  if(knocks.length>this.knocking&&this.phase==='waiting')this.game.freeMouse();this.knocking=knocks.length;
  // (a pilot whose line is unsteady, as the host sees it: linkGhosts)
  const unsteady=n=>!!n&&(room.role==='host'?!!this.ghostState?.get(n)?.on:clock()-(this.hostGhosts?.get(n)??-Infinity)<1);
  const rows=room.members.map(m=>({id:m.id,text:`#${m.number??'—'} ${m.name}${this.doing(m)}${unsteady(m.number)?' · conexão instável':''}${m.id===room.id?' · você':''}`,kick:kickable&&m.id!==room.id}));
  // (each list rebuilt only when it changed: a pilot's progress never swaps a button under a click)
  const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{action();b.blur();};return b;};
  const listKey=JSON.stringify(rows),knockKey=JSON.stringify(knocks);
  if(listKey!==this.rows){this.rows=listKey;p.list.replaceChildren(...rows.map(r=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=r.text;li.append(name);if(r.kick)li.append(button('Expulsar',()=>this.room.kick(r.id)));return li;}));}
  if(knockKey!==this.knockRows){this.knockRows=knockKey;p.knocks.replaceChildren(...knocks.map(k=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=`${k.name} quer entrar`;li.append(name,button('Aceitar',()=>this.room.admit(k.id)),button('Recusar',()=>this.room.deny(k.id)));return li;}));}
  p.knocks.hidden=!knocks.length;
  p.net.textContent=[room.online?'servidor':'mesmo PC',room.role==='guest'?`ping ${Math.round(room.latency*2000)} ms`:room.role==='host'?`${Math.max(0,room.members.length-1)} convidado(s)`:'',
   this.params.lag?`atraso simulado ${this.params.lag} ms`:'',this.params.loss?`perda simulada ${Math.round(this.params.loss*100)}%`:''].filter(Boolean).join(' · ');
 }
 // The host may invite: online, its line up, not in the middle of its race.
 canInvite(){const room=this.room;return room.online&&room.role==='host'&&room.problem===null&&this.phase!=='racing';}
 // The list of who is online, beside the card: each pilot with their record on this track (the online
 // records' board, Opala: the room's car), the fastest first, and Convidar. An invitation lets that pilot
 // in without the password and without waiting at the door (sala-cloudflare: signed by the room for that
 // account).
 buildInvites(){
  const root=this.invites.root=document.createElement('section');root.id='mpOnline';root.hidden=true;root.setAttribute('aria-label','Pilotos online');
  const head=document.createElement('div');head.className='mp-online-head';
  const title=document.createElement('b');title.textContent='PILOTOS ONLINE';
  const close=document.createElement('button');close.type='button';close.textContent='✕';close.setAttribute('aria-label','Fechar');close.onclick=()=>this.showInvites(false);
  head.append(title,close);
  this.invites.track=document.createElement('small');this.invites.track.className='mp-online-track';
  this.invites.rows=document.createElement('ol');this.invites.rows.className='mp-online-list';
  const note=document.createElement('p');note.className='mp-online-note';note.textContent='Quem você convida entra direto, sem senha e sem esperar na porta.';
  root.append(head,this.invites.track,this.invites.rows,note);document.body.append(root);
 }
 showInvites(on){
  const v=this.invites;v.open=on&&this.canInvite();v.root.hidden=!v.open;
  if(v.open){v.asked=-Infinity;v.records=null;v.list=[];v.heard=false;}
  this.renderInvites();this.render();
 }
 // The records of the host's track (once per opening and track; a board that does not come leaves the times out).
 loadRecords(){
  const v=this.invites,circuit=this.game.session().circuit;if(!this.game.records||v.records?.circuit===circuit||v.loading===circuit)return;
  v.loading=circuit;
  Promise.resolve(this.game.records(circuit)).then(rows=>{v.loading=null;v.records={circuit,rows:Array.isArray(rows)?rows:[]};this.renderInvites();}).catch(()=>{v.loading=null;v.records={circuit,rows:[]};});
 }
 renderInvites(){
  const v=this.invites;if(!v.root||!v.open)return;
  const circuit=this.game.session().circuit,name=this.game.circuitName?.(circuit)??circuit;
  v.track.textContent=`Recorde em ${name} (Opala)`;
  const best=new Map((v.records?.rows??[]).map(r=>[String(r.apelido).toLowerCase(),r]));
  const lap=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
  const rows=v.list.map(p=>({...p,record:best.get(p.nome.toLowerCase())??null})).sort((a,b)=>(a.record?.volta_ms??Infinity)-(b.record?.volta_ms??Infinity)||a.nome.localeCompare(b.nome,'pt-BR'));
  const now=clock(),empty=document.createElement('li');empty.className='mp-online-empty';empty.textContent=v.heard?'Ninguém mais online agora.':'Procurando quem está online…';
  v.rows.replaceChildren(...(rows.length?rows.map(p=>{
   const li=document.createElement('li'),who=document.createElement('span'),time=document.createElement('small'),s=v.sent.get(p.conta),age=s?now-s.at:Infinity;
   who.textContent=p.nome;time.textContent=p.record?`${p.record.selo==='conferido'?'✓':'⚠️'} ${lap(p.record.volta_ms)}`:'sem recorde aqui';
   // Invited and not in yet (the room's word, or this answer before the list's next look): Cancelar, in
   // case it was the wrong pilot.
   const pending=s?.state==='enviado'&&age<ONLINE_EVERY+1||p.convidado&&!['cancelado','cancelando'].includes(s?.state);
   const soon=now-(v.lastSent.get(p.conta)??-Infinity)<INVITE_AGAIN;
   let label='Convidar',disabled=soon,action=()=>this.sendInvite(p.conta),cancel=false;
   if(s?.state==='enviando'){label='Enviando…';disabled=true;}
   else if(s?.state==='cancelando'){label='Cancelando…';disabled=true;}
   else if(pending){label='Cancelar';disabled=false;cancel=true;action=()=>this.cancelInvite(p.conta);}
   else if(s?.state==='fora'&&age<5){label='Saiu do jogo';disabled=true;}
   else if(s?.state==='cancelado'&&age<3){label='Cancelado';disabled=true;}
   else if(s?.state==='cedo'&&soon){label='Espere um pouco';disabled=true;}
   const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.onclick=action;
   if(cancel){b.className='mp-cancel';b.title='Cancelar o convite (antes de aceitar)';const sent=document.createElement('em');sent.textContent='Convite enviado ✓';li.append(who,time,sent,b);}
   else li.append(who,time,b);
   return li;
  }):[empty]));
 }
 sendInvite(account){const v=this.invites;this.room.invite(account,this.params.address);v.sent.set(account,{state:'enviando',at:clock()});v.lastSent.set(account,clock());this.renderInvites();}
 cancelInvite(account){this.room.uninvite(account);this.invites.sent.set(account,{state:'cancelando',at:clock()});this.renderInvites();}
 // What this window's car carries beside its motion (net-room.js validExtra): its pilot out of it on foot (main.js
 // onFoot) and its parts held open (car-openings.js openMask); null when neither.
 ownExtra(){
  const f=this.game.onFoot?.(),mask=this.game.openMask?.()??0,e={},r2=v=>Math.round(v*100)/100;
  // (an eighth number with something from the Tia's in hand: free-walk.js handsCode)
  if(f){e.pe=[r2(f.x),r2(f.y),r2(f.z),Math.round(Math.atan2(Math.sin(f.facing),Math.cos(f.facing))*1000)/1000,f.running?1:0,r2(Math.min(1,Math.max(0,f.crouch??0))),r2(Math.min(60,Math.max(0,f.lift??0)))];if(f.hands)e.pe.push(f.hands);}
  if(mask)e.ab=mask;
  return e.pe||e.ab?e:null;
 }
 // (made here too: the checks build the race-time part without its constructor, testar_estados_sala.mjs)
 heardExtra(number,pe,ab){(this.extras??=new Map()).set(number,{pe:pe??null,ab:ab??0,at:clock()});}
 // A car's extras still fresh (its pilot's window heard lately), as validExtra has them, or null.
 freshExtra(number,seconds=1.5){const e=this.extras?.get(number);return e&&clock()-e.at<seconds&&(e.pe||e.ab)?{...(e.pe&&{pe:e.pe}),...(e.ab&&{ab:e.ab})}:null;}
 // The 3D object of a car in this window's field (the host's own, on a guest's screen, in its seat).
 carObject(number){const immersive=this.immersive,k=immersive?.field.rivals.findIndex(r=>(r.seat??r.entry.number)===number)??-1;return k>=0?immersive.visual.rivals[k]:null;}
 // A pilot's look (pilot-look.js) as the room has it: their own, told by their window; null: none of their own.
 lookOf(id){return this.room.members.find(m=>m.id===id)?.look??null;}
 // Every frame in a race: each other human's pilot out of the car (in their look, walking as their own window has him:
 // the others can stand by a parked car and talk), the parts their car has open (a door, the hood: they may be
 // talking about the car), and their driver at the wheel in their look. A car no human drives any more shuts.
 drawPeople(dt){
  const immersive=this.immersive,race=this.race;
  if(!immersive||!race||this.phase==='lobby'||immersive.active){if(this.walkers.size||this.carParts.size)this.clearPeople();return;}
  const me=this.myNumber(),scene=immersive.visual.root.parent??immersive.visual.root,walking=new Set(),humans=new Set();
  for(const seat of race.seats){
   if(seat.number===me)continue;humans.add(seat.number);
   const extra=this.freshExtra(seat.number,2),obj=this.carObject(seat.number);
   if(obj){
    this.dressDriver(obj,this.lookOf(seat.id),seat.number);
    let parts=this.carParts.get(seat.number);if(parts?.obj!==obj){parts={obj,openings:new CarOpenings().attach(obj)};this.carParts.set(seat.number,parts);}
    parts.openings.showMask(extra?.ab??0);
   }
   if(extra?.pe){walking.add(seat.number);this.walk(seat,extra.pe,dt,scene,obj);}
  }
  for(const [number,parts] of this.carParts){if(!humans.has(number))parts.openings.showMask(0);parts.openings.update(dt);}
  for(const number of [...this.walkers.keys()])if(!walking.has(number))this.dropWalker(number);
 }
 // That pilot on foot: a person in their look (pit-crew.js; Stevan's suit without one), eased to where their window
 // has him, his limbs swinging as he goes (on-foot.js footLimbs), his name over him; the driver's seat empty meanwhile.
 walk(seat,pe,dt,scene,obj){
  const look=this.lookOf(seat.id),key=look?lookKey(look):'';let w=this.walkers.get(seat.number);
  if(w&&(w.key!==key||w.name!==seat.name)){this.dropWalker(seat.number);w=null;}
  if(!w){
   this.people??=createPeople();
   // (dressed as their own window dresses them, free-walk.js pilotOutfit: their look; without one, the 99's red overalls,
   // another car's team colours)
   const outfit=pilotOutfit({look,entry:seat.number==='99'?null:obj?.userData.entry??carEntry(seat.number)}),root=this.people.person(outfit);root.name='Piloto_a_pe_'+seat.number;
   const tag=this.immersive.visual.tag(root,seat.name,[0,2.12,0],1.9,.26,'#e2fb57','#172a2ddb');
   scene.add(root);w={root,tag,key,outfit,name:seat.name,car:null,s:{cycle:0,running:false,crouch:false,crouchAmount:0,lift:0},placed:false,hands:snackHands(root),snack:{held:[],using:null},code:0};this.walkers.set(seat.number,w);
  }
  const [x,y,z,facing,run,crouch,lift]=pe,root=w.root,before=root.position.clone();
  // (a jump of more than WALK_SNAP metres, the first look at him, or a frame without time: put there at once)
  const far=Math.hypot(x-root.position.x,-y-root.position.z)>WALK_SNAP,k=!w.placed||far||!(dt>0)?1:1-Math.exp(-dt*12);w.placed=true;
  root.position.x+=(x-root.position.x)*k;root.position.z+=(-y-root.position.z)*k;root.position.y+=(z-root.position.y)*k;
  root.rotation.y+=Math.atan2(Math.sin(facing-root.rotation.y),Math.cos(facing-root.rotation.y))*k;
  Object.assign(w.s,{running:!!run,crouchAmount:crouch,lift});
  const distance=far?0:Math.hypot(root.position.x-before.x,root.position.z-before.z);w.s.cycle+=distance*(run?2.3:3.3);
  this.heldBy(w,pe[7]??0,Math.max(0,dt));
  footLimbs(root,w.s,Math.max(0,dt),distance,snackArms(w.snack));showSnacks(w.hands,root,w.snack);
  if(w.car&&w.car!==obj&&w.car.userData.driver)w.car.userData.driver.root.visible=true;
  w.car=obj;if(obj?.userData.driver)obj.userData.driver.root.visible=false;
 }
 // What that pilot holds from the Tia's (free-walk.js handsCode): each hand's item and its bites left, and a bite or
 // a sip under way, timed here as their window times it.
 heldBy(w,code,dt){
  const s=w.snack;
  if(code!==w.code){
   w.code=code;s.held=[];
   for(const [side,shift] of [[1,0],[-1,4]]){const v=code>>shift&15,item=CAFE_MENU[(v&3)-1];if(item)s.held.push({id:item.id,side,bites:v>>2});}
  }
  const side=code&256?1:code&512?-1:0,item=side?s.held.find(h=>h.side===side):null;
  if(!item)s.using=null;else if(s.using?.item.side!==side||!s.held.includes(s.using.item))s.using={item,t:0,taken:false};else s.using.t=Math.min(SNACK_USE,s.using.t+dt);
 }
 dropWalker(number){
  const w=this.walkers.get(number);if(!w)return;this.walkers.delete(number);
  w.root.removeFromParent();w.root.traverse(o=>{if(o.isMesh||o.isSkinnedMesh)o.geometry?.dispose();if(o.isSprite){o.material.map?.dispose();o.material.dispose();}});
  if(w.car?.userData.driver)w.car.userData.driver.root.visible=true;
 }
 // A human's look on the driver at the wheel of their car (rival-driver.js with a kit from the look); null: the car's
 // own driver back.
 dressDriver(obj,look,number){
  const u=obj.userData,key=look?lookKey(look):'';if(!u.driver||(u.mpLookKey??'')===key)return;u.mpLookKey=key;
  const own=u.mpOwnDriver??u.driver,parent=own.root.parent,shown=u.driver.root.visible;if(!parent)return;
  if(u.driver!==own){u.driver.root.removeFromParent();u.driver.mesh.geometry.dispose();}
  if(!look){own.root.visible=shown;u.driver=own;delete u.mpOwnDriver;return;}
  u.mpOwnDriver=own;own.root.visible=false;
  const d=createRivalDriver({color:lookColors(look).suit,number,kit:lookKit(look)});
  d.root.position.copy(own.root.position);d.root.quaternion.copy(own.root.quaternion);d.root.scale.copy(own.root.scale);d.root.visible=shown;parent.add(d.root);u.driver=d;
 }
 // Out of the room's race: nobody on foot, every part shut and every driver back in its own suit.
 // Every frame of a room's race: which humans' cars go through the others and show see-through (LINK_* above). The host
 // decides from each guest's states as they reach it (and for a car left without its pilot) and says so in its snapshot;
 // a guest takes that word, and sees through a human's car it has heard nothing of for a while; its own car is the
 // host's word on it.
 linkGhosts(dt){
  const immersive=this.immersive,field=immersive.field,me=this.myNumber(),now=clock(),host=this.room.role==='host';
  const humans=new Set(this.race.seats.map(s=>s.number)),cars=[immersive.car,...field.rivals.map(r=>r.car)].filter(Boolean);
  const states=this.ghostState??=new Map();
  const clear=c=>cars.every(o=>o===c||Math.hypot(o.x-c.x,o.y-c.y)>LINK_CLEAR);
  field.rivals.forEach((r,k)=>{
   const number=r.seat??r.entry.number;let ghost=false;
   // (the host's car when the host only watches: parked, out of sight and touching nothing)
   {const away=!!this.race.assiste&&number===this.race.car,obj=immersive.visual?.rivals[k];if(obj)obj.userData.hidden=away;if(away){r.car.netGhost=true;return;}}
   if(humans.has(number)&&number!==me){
    const remote=this.remotes.get(number),st=states.get(number)??{on:false,calm:null,here:false,hereCalm:null};states.set(number,st);
    if(host){
     const L=remote?.link;if(L)L.gaps=L.gaps.filter(t=>now-t<LINK_WINDOW);
     const driverless=!r.puppet&&!r.finished,bad=driverless||(L?.gaps.length??0)>=LINK_GAPS||!!remote&&remote.seq>=0&&remote.age>LINK_STALE;
     if(bad){st.on=true;st.calm=null;}else if(st.on){st.calm??=now;if(now-st.calm>=LINK_CALM&&clear(r.car))st.on=false;}
     ghost=st.on;
    }else{
     const stale=!!remote&&remote.seq>=0&&remote.age>LINK_STALE;
     if(stale){st.here=true;st.hereCalm=null;}else if(st.here){st.hereCalm??=now;if(now-st.hereCalm>=LINK_CALM_HERE&&clear(r.car))st.here=false;}
     ghost=now-(this.hostGhosts?.get(number)??-Infinity)<1||st.here;
    }
   }
   r.car.netGhost=ghost;this.showGhost(immersive.visual?.rivals[k],r,ghost,dt);
  });
  if(immersive.car)immersive.car.netGhost=host?!!this.race.assiste:now-(this.hostGhosts?.get(me)??-Infinity)<1;
 }
 // The host's word on a car in its snapshot (send): see-through, for every window.
 ghostWord(number){return this.room.role==='host'&&!!this.ghostState?.get(number)?.on;}
 // A car's see-through copy (ghost-car.js instance, in its team's colour) on its object, fading in and out; its own
 // meshes step aside while it shows (immersive-visuals.js seeThrough).
 showGhost(obj,r,ghost,dt){
  if(!obj)return;const copies=this.ghostCopies??=new Map();let g=copies.get(obj);
  if(ghost&&!g){g=this.game.ghostShell?.(r.entry.color??0x3fc6ff)??null;if(g){g.alpha=0;obj.add(g.root);copies.set(obj,g);}}
  obj.userData.seeThrough=ghost&&!!g;if(!g)return;
  g.alpha+=((ghost?GHOST_OPACITY:0)-g.alpha)*Math.min(1,dt*6);g.setOpacity(g.alpha);g.update(dt);
  const camera=this.game.camera?.();if(camera)g.detail(camera.position.distanceTo(obj.position));
 }
 // Out of the room's race: every car solid again, every see-through copy gone.
 clearGhosts(){
  for(const obj of this.immersive?.visual.rivals??[])obj.userData.hidden=false;if(this.immersive)this.immersive.visual.hideOwn=false;
  for(const [obj,g] of this.ghostCopies??[]){g.dispose();obj.userData.seeThrough=false;}this.ghostCopies?.clear();this.ghostState?.clear();this.hostGhosts?.clear();
  for(const r of this.immersive?.field.rivals??[])r.car.netGhost=false;if(this.immersive)this.immersive.car.netGhost=false;
 }
 clearPeople(){
  this.clearGhosts();
  if(!this.walkers)return;   // (testar_multiplayer.mjs builds the room's race-time part without a page)
  for(const number of [...this.walkers.keys()])this.dropWalker(number);
  for(const {openings} of this.carParts.values()){openings.closeAll(true);}this.carParts.clear();
  for(const obj of this.immersive?.visual.rivals??[])if(obj.userData.mpLookKey)this.dressDriver(obj,null,obj.userData.entry?.number);
 }
 // The humans' standings during the race (none out of it, on the menu or the result sheet, or with only one human):
 // this window's car and every human's in the whole field as it shows them.
 standingRows(s,results=false){
  const immersive=this.immersive,race=this.race,me=this.myNumber();
  if(!immersive||!race||!me||!['racing','finished'].includes(this.phase)||!s.started||s.paused||results||immersive.active)return [];
  const humans=new Set([...this.racers().map(x=>x.number),...(this.raced??[])]);if(race.assiste)humans.delete(race.car);if(humans.size<2)return [];
  const car=immersive.car,names=new Map(race.seats.map(x=>[x.number,x.name]));
  const cars=[{number:me,name:names.get(me)??immersive.pilotName??'Você',mine:true,progress:immersive.freePlayerProgress,speed:Math.hypot(car.vx,car.vy),finished:immersive.freeFinished,finishTime:immersive.finishTime},
   ...immersive.field.rivals.map(r=>{const number=r.seat??r.entry.number;return {number,name:names.get(number)??r.entry.shortName,progress:r.progress,speed:Math.hypot(r.car.vx,r.car.vy),finished:r.finished,finishTime:r.finishTime,retired:r.retired};})];
  return humanStandings(cars,humans);
 }
 // Past the flag (the team's wish, 10-26): this car goes to the pit lane at once, as if by magic (a spot of the parking
 // row, RaceField parkingSpot: the humans' from its far end, by their seats), out of everybody's way, and the cameras
 // follow the first human still racing (N and Shift+N go round the other cars, main.js watchNext), until all are in.
 finishAndWatch(){
  // (once the flag's fade is over, immersive-mode.js finishing: the picture clear again to watch by)
  const now=clock();this.flagAt??=now;if(this.parked||now-this.flagAt<PARK_AFTER||this.immersive.finishing)return;
  if(this.parkCar(this.immersive.car,this.myNumber()))this.game.teleported?.();
  this.parked=true;this.room.note('no box: assistindo');this.watchRacing();
 }
 // A car past its flag in the pit lane's parking row (RaceField parkingSpot), the humans' places from its far end in
 // the order of their numbers (every window knows each one's place: its own car's, finishAndWatch, the host a guest's,
 // parkGuest, and the host's check of a guest's states lets it go there, net-verify.js), stopped. False (null) without
 // a pit lane.
 // A human's place among the room's (by their numbers: the same in every window): their parking spot, their spot at
 // the café.
 humanIndex(number){
  const humans=[...new Set([...(this.raced??[]),...(this.race?.seats??[]).map(s=>s.number)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  return Math.max(0,humans.indexOf(number));
 }
 parkingSpotOf(number){return this.immersive.field.parkingSpot?.(this.humanIndex(number))??null;}
 // The meeting before the start, on foot (free-walk.js meet's away): F there says who calls everyone to the cars.
 meetingAway(){
  return {title:'ENCONTRO NO BOX 99 · LANCHONETE DA TIA',label:'',
   back:()=>this.room.role==='host'?`Quando todos chegarem: Todos para os carros (${this.game.keyName?.('Enter')??'Enter'}).`:'O anfitrião chama todos para os carros.'};
 }
 // Past the flag, parked and watching (spectating): F takes this pilot to the Tia's café, on foot among the others
 // done (the team's wish, 10-26: talk to them instead of watching), and F there back to the cameras on the race.
 toCafe(){
  if(!this.parked||this.game.meeting?.())return false;
  return !!this.game.meet?.(this.humanIndex(this.myNumber()),{title:'LANCHONETE DA TIA · SUA CORRIDA ACABOU',label:'voltar a assistir a corrida',
   back:()=>{this.game.unmeet?.();this.watchRacing();}});
 }
 // The cameras on the first human still racing (or any other car in the room).
 watchRacing(){
  const racing=this.standingRows(this.game.session()).find(r=>!r.mine&&!r.finished&&!r.retired)??null;
  const number=racing?.number??this.race.seats.find(s=>s.number!==this.myNumber())?.number;
  if(number)this.game.watchCar?.(number);
 }
 parkCar(car,number){
  const spot=this.parkingSpotOf(number);if(!spot)return false;
  car.relocate(spot.x,spot.y,NaN,spot.heading);Object.assign(car,{vx:0,vy:0,yaw:0,excursion:null});car.settle();return true;
 }
 // Host: a guest's car past its flag with nobody heard at its wheel (the window hidden or gone): parked, and held there
 // until that pilot's states come again (heardCar, seatHumans).
 parkGuest(r){this.parkCar(r.car,r.seat);r.puppet=parkedPuppet;}
 // main.js: this window watches the others' cars (its own parked past the flag).
 spectating(){return !!this.parked&&!this.game.meeting?.();}
 // For the checks (verificar_multiplayer.py): this window's car and every other car as it shows them.
 info(){
  const immersive=this.immersive,car=immersive?.car;
  return {...this.room.info(),parked:!!this.parked,ended:!!this.ended,watching:!!this.race?.assiste,ownHidden:!!this.immersive?.visual.hideOwn,endIn:this.firstFlagAt==null?null:Math.max(0,RESULTS_WAIT-(clock()-this.firstFlagAt)),chat:this.chat.info(),standings:this.standings&&!this.standings.root.hidden?this.standingRows(this.game.session()).map(({position,number,name,mine,finished,retired})=>({position,number,name,mine,finished,retired})):[],walkers:[...this.walkers].map(([number,w])=>({number,x:w.root.position.x,y:-w.root.position.z,look:w.key,top:w.outfit?.top??null,held:w.snack.held.map(h=>[h.id,h.side,h.bites]),eating:!!w.snack.using})),parts:[...this.carParts].map(([number,p])=>({number,mask:p.openings.openMask(),open:Object.entries(p.openings.info()).filter(([,v])=>v.open>.5).map(([k])=>k)})),drivers:(this.race?.seats??[]).map(s=>({number:s.number,look:this.carObject(s.number)?.userData.mpLookKey??null})),invites:{open:this.invites.open,list:this.invites.list.map(p=>p.nome)},label:this.params.label,address:globalThis.location?.hash??null,phase:this.phase,holding:this.holding,autopilot:this.autopilot,raceId:this.race?.id??null,
   stopped:[...this.stopped].map(([number,x])=>({number,stage:x.stage})),cut:!!this.cut,lost:!!this.lost,paused:this.pause?.why??null,trucks:[...this.trucks.keys()],truckPoses:[...this.trucks].map(([number,t])=>({number,x:t.root.position.x,y:-t.root.position.z,strap:t.strap.visible,leaving:t.left!==undefined})),flags:[...this.flags.keys()],yellow:this.yellow(),
   remotes:[...this.remotes].map(([number,r])=>({number,seq:r.seq,age:r.age,finished:!!r.state?.finished,snaps:r.snaps??0,worst:r.worst??0,gaps:r.link?.gaps.length??0})),ghostMe:!!car?.netGhost,
   me:car?{x:car.x,y:car.y,vx:car.vx,vy:car.vy,ghost:!!car.ghost}:null,
   cars:immersive?immersive.field.rivals.map((r,i)=>{const obj=immersive.visual.rivals[i];return {number:r.seat??r.entry.number,name:r.entry.shortName,x:r.car.x,y:r.car.y,speed:Math.hypot(r.car.vx,r.car.vy),pit:!!r.car.surface?.pit,finished:!!r.finished,retired:!!r.retired,parked:r.puppet===parkedPuppet,remote:!!r.car.remote,ghost:!!r.car.ghost,netGhost:!!r.car.netGhost,seeThrough:!!obj?.userData.seeThrough,hidden:!!obj?.userData.hidden,
    shown:!!obj?.visible&&!!obj.parent,drawn:obj?[obj.position.x,-obj.position.z]:null};}):[]};
 }
}
