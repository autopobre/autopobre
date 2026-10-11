// Multiplayer: players on different machines race each other through the room server
// (net-link.js, sala-cloudflare), or windows of one browser through a BroadcastChannel (&local=1)
// (net-room.js, net-cars.js). Nothing in the menus leads here; main.js loads this module only when
// the address asks for a room:
//   index.html#desafio=NOME  the first in a room hosts it; every pilot races the car chosen on
//                            Modo Corrida's car screen (or the one in &carro=73) if nobody else has
//                            it, else the first free one. Online, the group key opens the door and
//                            the host lets each guest in. The old #sala= and #corrida= open nothing
//   &local=1                 this browser's windows only, no server; &servidor=local: wrangler dev
//   &auto=1                  the automatic pilot drives this window's car from the start
//   &fantasmas=1             (host) humans pass through each other instead of colliding
//   &lag=150&perda=5         simulate 150 ms of network delay and 5% of lost car messages
//   #desafio=NOME_SEGREDO    what follows the "_" is never on screen (the card and the address bar
//                            read NOME_***): a pilot streaming his screen does not give the room away
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
import * as THREE from 'three';
import {Room,roomParams,roomAddress,roomLabel,roomIn} from './net-room.js';
import {ServerLink,ROOM_SERVER,LOCAL_SERVER} from './net-link.js';
import {RemoteCar,packCar,readCar} from './net-cars.js';
import {GuestRaceState} from './net-verify.js';
import {PLAYER_ENTRY,carEntry} from './race-roster.js';
import {TOW_ARRIVE,faintedInput,inTheWay} from './race-field.js';
import {strapPath} from './immersive-state.js';
import {marshalSpots} from './trackside.js';
// Car messages a second; after crossing the line, how long the results wait for the others (s); a
// car not heard from for QUIET seconds is reported on the room card (the host's: the race stands
// still, updatePause), and mid-race the host leaves a guest's without a driver after STRANDED
// (checkSilence).
const SEND=1/30,RESULTS_WAIT=60,QUIET=2,STRANDED=5;
// The tow truck (immersive-visuals.js truckModel) stands this far ahead of the car's centre on the strap
// (hooks 2.22 m and 2.45 m from the centres, 5 m of strap). It comes in along the side of the track,
// TRUCK_SIDE metres past the edge, from TRUCK_BACK metres behind the car, in TRUCK_DRIVE seconds (the
// rest of RaceField's TOW_ARRIVE it hooks up), turning onto the tow's way only past the car's nose
// (TRUCK_CUT metres on); done, it drives off for TRUCK_GONE seconds.
const TRUCK_AHEAD=9.4,TRUCK_BACK=24,TRUCK_SIDE=2.6,TRUCK_CUT=3,TRUCK_DRIVE=TOW_ARRIVE-1.5,TRUCK_GONE=6;
// The breakdown a car left without its pilot is AB for at the flag (RaceField strand).
const NO_DRIVER='conexão caiu';
const NO_STOPS=Object.freeze([]);
// The host's car under the host's name (the 99 as the player's own: lime on the map).
const hostEntry=(car,name)=>({...(car==='99'?{...PLAYER_ENTRY,mark:PLAYER_ENTRY.color}:carEntry(car)),name,shortName:name,human:true});
// A car's place in the field's roster (the rivals' order, the same in every window).
const seatIndex=(field,number)=>field.roster.findIndex(e=>e.number===number);
const clock=()=>performance.now()/1000;
// How far down the track a point at s is from one at from, going forward (0..L metres).
const along=(from,s,L)=>((s-from)%L+L)%L;
// The group key, typed once on this browser (the server keeps the real one as a secret).
const KEY_STORE='autopobre-chave-grupo';
const readKey=()=>{try{return localStorage.getItem(KEY_STORE)??'';}catch{return '';}};
const localStore=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const saveKey=key=>{try{localStorage.setItem(KEY_STORE,key);}catch{}};
// Why the race stands still (pause): this window's own line, as host; the host gone from the room for a
// moment (the server's word), or silent.
const PAUSES={linha:()=>'Sua conexão caiu · corrida pausada para todos até ela voltar…',saiu:()=>'O anfitrião caiu · corrida pausada até ele voltar…',
 silencio:secs=>`Sem sinal do anfitrião há ${secs} s · corrida pausada até ele voltar…`};
// What the card says when the server closed the door (net-link.js CLOSED) or the line dropped.
const PROBLEMS={conectando:'Conectando ao servidor da sala…',reconectando:'Conexão caiu · tentando de novo…',chave:'Digite a chave do grupo para entrar na sala.',
 cheia:'Sala cheia.',recusado:'O anfitrião recusou sua entrada.',expulso:'Você foi removido da sala.',excesso:'Conexão encerrada: mensagens demais.',
 ocupada:'Muitas tentativas com a chave errada · tente de novo em um minuto.','outra-aba':'Esta sala foi aberta em outra aba.',origem:'Endereço não autorizado.',
 fora:'Sem conexão com o servidor da sala (internet, ou o limite do dia do servidor).',saiu:'Você saiu da sala.'};
const HIDDEN_LOST='Este endereço esconde a parte secreta do nome da sala (depois do _). Abra o link completo que você recebeu.';
// game: main.js hooks (session, immersive, fullGrid, template, withTemplate, pilotName, wantedCar,
// roomCars, openCars, freeMouse, command, autopilot, startRace, hasCircuit).
export function startMultiplayer(game,hash=location.hash){
 // The room's secret leaves the address bar at once (net-room.js roomAddress); an address that came
 // with it hidden and unknown here opens no room, only the card saying so.
 const address=roomAddress(hash,localStore());
 if(address.lost){roomCard(roomLabel(roomIn(hash)),HIDDEN_LOST);return null;}
 if(address.shown!==hash)try{history.replaceState(history.state,'',address.shown);}catch{}
 const params=roomParams(address.hash);return params?new Multiplayer(game,params):null;
}
// The room card's frame (Multiplayer buildPanel fills it in): its sheet (the release's version,
// preparar_publicacao.py tags this module's address, keeps a cached old sheet out) and its head.
function roomCard(name,text){
 const link=document.createElement('link');link.rel='stylesheet';link.href='./multiplayer.css'+new URL(import.meta.url).search;document.head.append(link);
 const root=document.createElement('section');root.id='mpRoom';root.setAttribute('aria-label','Sala multiplayer');document.body.classList.add('mp-room');
 const add=(tag,className,parent=root)=>{const e=document.createElement(tag);if(className)e.className=className;parent.append(e);return e;};
 const head=add('div','mp-head');add('b','',head).textContent='SALA';
 const card={root,add,room:add('span','mp-name',head),role:add('small','mp-role',head),status:add('p','mp-status')};
 card.room.textContent=name??'';card.status.setAttribute('role','status');if(text){card.status.textContent=text;document.body.append(root);}
 return card;
}
// (exported for testar_multiplayer.mjs, which runs its race-time checks without a page)
export class Multiplayer {
 constructor(game,params){
  this.game=game;this.params=params;this.autopilot=params.auto;this.autopilotOn=false;
  const link=params.local?null:new ServerLink({url:params.server==='local'?LOCAL_SERVER:ROOM_SERVER,room:params.room,key:readKey,name:()=>this.room?.name??game.pilotName()});
  this.room=new Room({room:params.room,name:game.pilotName(),want:params.car??game.wantedCar(),lag:params.lag,loss:params.loss,link});
  this.race=null;this.phase='lobby';this.holding=false;this.remotes=new Map();this.seq=0;this.sendClock=0;this.readyClock=0;this.finishedAt=null;this.panelClock=0;this.immersive=null;this.rows='';this.cars='';
  this.welcomed=false;this.knocking=0;
  // Cars waiting for their pilots (every window: number -> {stage, since}), their trucks and the
  // marshals' flags; cut: this guest's own line is down (or the host has it out of its seat).
  this.stopped=new Map();this.trucks=new Map();this.flags=new Map();this.cut=null;this.reclaiming=null;
  // The race standing still for its host (pause: why, since when).
  this.pause=null;
  // The cars humans raced once the lights went out (their names stay on them).
  this.raced=new Set();
  // A new race from the host, while this guest waits for one: load its track and start (false: busy
  // loading, asked again later).
  this.room.on('race',race=>this.room.waiting&&this.game.hasCircuit(race.circuit)&&this.game.startRace(race.circuit)).on('go',race=>this.go(race))
   .on('state',(id,m)=>this.heardCar(id,m)).on('snap',m=>this.heardField(m)).on('leave',p=>this.left(p)).on('change',()=>this.render())
   // Someone took (or left) a seat, or renamed, while the start waits, or during the race a guest's
   // line dropped (its car without a driver) and it came back, even after this window's flag: the cars
   // and their name tags follow. A guest that is itself out of the seats (its own line dropped) waits
   // until the host seats it again.
   .on('seats',race=>{if(this.race&&race.id===this.race.id&&(this.phase==='waiting'||(this.phase==='racing'||this.phase==='finished')&&race.seats.some(s=>s.id===this.room.id))){this.race=race;this.seatHumans();}});
  this.buildPanel();this.room.start();
  // Enter gives the start too (the mouse may be captured by the track).
  addEventListener('keydown',e=>{if(e.code==='Enter'&&this.canStart()&&!e.target.closest?.('input,select,textarea,dialog')){e.preventDefault();this.room.lightsOut();}});
  addEventListener('pagehide',()=>this.room.leave());
  // dropLine, for the checks: the line drops as a network drops it (no goodbye; net-link.js connects
  // again, after 15 s when slow).
  window.interlagosSala={info:()=>this.info(),dropLine:(slow=false)=>{this.room.link?.drop(slow);}};
  const immersive=game.immersive();if(immersive)this.attach(immersive);
 }
 // Each circuit load makes a new ImmersiveMode: its free race learns the room's seats and start.
 attach(immersive){
  if(immersive.multiplayer===this)return;
  this.clearStops();immersive.multiplayer=this;this.immersive=immersive;this.hostObject=null;this.swap=null;
  const resetField=immersive.resetField.bind(immersive),beginCountdown=immersive.beginCountdown.bind(immersive),step=immersive.step.bind(immersive),stepFree=immersive.stepFree.bind(immersive);
  immersive.resetField=()=>{this.plan(immersive);resetField();this.seat(immersive);};
  immersive.beginCountdown=()=>{beginCountdown();this.countdown();};
  // Held on 3 until the host gives the start (Largar, or Enter). With this guest's line down, nobody
  // drives its car here either: the same as the host does with it (RaceField faintedInput).
  immersive.step=(input,dt)=>{if(this.holding&&immersive.freeCountdown>0)immersive.freeCountdown=3;if(this.cut)Object.assign(input,faintedInput(immersive.car));return step(input,dt);};
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
  this.phase='lobby';this.holding=false;this.finishedAt=null;this.autopilotOn=false;this.cut=null;this.reclaiming=null;this.lost=false;this.pause=null;this.raced=new Set();this.clearStops();
  const room=this.room,field=immersive.field;
  this.race=room.role==='host'?this.game.fullGrid()?room.planRace({circuit:this.game.session().circuit,laps:immersive.laps,ace:!!field.ace,level:field.level,retirements:field.retirements!==false,ghosts:this.params.ghosts,...this.game.weather?.()}):null
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
   if(host){if(seat&&!r.puppet&&this.remotes.get(number)?.waiting!==r)this.remote(r,number,true);else if(!seat&&r.puppet)this.release(r);}
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
 // its result stands and a bot brings the car in. Either way the car keeps its pilot's name and best lap
 // (car.remote: never an AI record), and the pilot back (net-room.js away), seatHumans hands it back.
 left(p){
  const r=this.immersive?.field.rivals.find(r=>r.seat===p.number&&(r.puppet||this.remotes.has(p.number)));if(!r||this.room.role!=='host')return;
  if(this.phase!=='racing'&&this.phase!=='finished'){this.release(r);return;}
  this.remotes.delete(r.seat);this.immersive.field.strand(r,NO_DRIVER);this.syncStops();
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
   // that one), and the truck's own way in: TRUCK_SIDE past the edge until past the car's nose.
   const P=r.stop?.path??t.path,driving=now-t.since,car=Math.max(0,Math.min(P.end,((c.surface.s-P.s0)%L+L*1.5)%L-L/2));
   const lane=u=>{const w=Math.max(0,Math.min(1,(u-TRUCK_CUT)/(TRUCK_AHEAD-TRUCK_CUT))),edge=P.side*(P.station(u).half+TRUCK_SIDE);return P.lane(u,edge+(P.dAt(u)-edge)*w*w*(3-2*w));};
   if(t.left===undefined)t.u=driving<TRUCK_DRIVE?-TRUCK_BACK+(TRUCK_BACK+TRUCK_AHEAD)*(1-(1-driving/TRUCK_DRIVE)**2):car+TRUCK_AHEAD;
   const u=t.u+2*gone*gone,p=lane(u),q=lane(u+.5),h=Math.atan2(q.y-p.y,q.x-p.x),fx=Math.cos(h),fy=Math.sin(h);
   // (the ground's height from the towed car's stretch of track: the player's may be far away)
   const ground=(x,y)=>c.sample(x,y).z,z=ground(p.x,p.y);
   visual.setPose(t.root,{x:p.x,y:z,z:-p.y,heading:h,grade:0,bank:0});visual.flashBeacon(t.root,now);
   // The strap from the truck's hook to the car's end that faces it.
   t.strap.visible=t.left===undefined&&driving>=TRUCK_DRIVE+.6;
   if(t.strap.visible){const tx=p.x-fx*2.45,ty=p.y-fy*2.45,n=Math.hypot(tx-c.x,ty-c.y)||1,hx=c.x+(tx-c.x)/n*2.22,hy=c.y+(ty-c.y)/n*2.22;visual.layStrap(t.strap,strapPath([hx,ground(hx,hy)+.3,-hy],[tx,z+.78,-ty],5),ground);}
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
  if(mine.state.retired&&mine.state.progress>=goal-.01){this.cut.over=true;room.note('bandeirada sem piloto: AB');return;}
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
 // line at the speed it last had. Its next state hands it back where its pilot has it (heardCar).
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
   const remote=r.puppet&&humans.has(r.seat)?this.remotes.get(r.seat):null;
   if(remote&&remote.seq>=0&&remote.age>STRANDED){remote.waiting=r;this.immersive.field.strand(r,NO_DRIVER);room.note('sem estados de #'+r.seat);}
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
   if(this.myNumber()===race.car){if(room.lineQuiet(now)&&(race.seats.length>1||room.away?.size))why='linha';}
   else if(room.role==='guest'&&!this.cut&&(room.hostAway||now-room.hostSeen>QUIET))why=room.hostAway?'saiu':'silencio';
  }
  if(why&&!this.pause){this.pause={why,since:now};room.note('corrida pausada: '+why);}
  else if(why)this.pause.why=why;
  else if(this.pause){const held=now-this.pause.since;if(this.finishedAt!==null)this.finishedAt+=held;room.note(`corrida retomada (${held.toFixed(1)} s)`);this.pause=null;}
 }
 // main.js: whether the race stands still for its host this frame (no physics step, no engine sound).
 frozen(){return !!this.pause;}
 heardCar(id,m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;
  const seat=this.race.seats.find(s=>s.id===id),state=seat&&readCar(m.car),remote=state&&this.remotes.get(seat.number);
  if(!remote||m.seq<=remote.seq)return;
  // The host is authoritative for the guest's progress and times. Raw packets are never relayed:
  // all windows see the host's checked pose and lap book, including after a drop and tow.
  const r=this.slot(seat.number);if(!r)return;
  const field=this.immersive.field;
  remote.verify??=r.guestRace??=new GuestRaceState(r,{time:field.time,laps:this.race.laps,lead:field.gridLeadIn});
  if(remote.waiting)remote.verify.rebase(r,field.time);
  const checked=remote.verify.receive(state,field.time,{running:(this.phase==='racing'||this.phase==='finished')&&!this.pause&&!(this.immersive.freeCountdown>0)});
  if(!checked)return;
  // (a pilot back in its car takes the wheel with its first state: remote)
  if(remote.receive(checked.state,{age:Math.min(m.lat,.35),seq:m.seq,raw:checked.raw})&&remote.waiting)this.handOver(remote.waiting,remote);
 }
 heardField(m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;const me=this.myNumber();
  // (this window's own car, as the host has it: where it is taken back after a cut)
  for(const [number,age,values] of m.cars){if(number===me){const state=this.cut&&readCar(values);if(state)this.cut.mine={state,at:clock()};continue;}const state=readCar(values);if(state)this.remotes.get(number)?.receive(state,{age:age+this.room.latency,seq:m.seq,raw:values});}
 }
 // Every frame (main.js), paused or not: the room's clockwork, this window's car on the wire.
 frame(dt){
  const game=this.game,s=game.session(),room=this.room,immersive=this.immersive;
  room.setName(s.started&&immersive?.pilotName||game.pilotName());room.tick();
  // Let in: the guest goes to the car screen (once; not out of a race, nor without a pilot's name).
  if(!this.welcomed&&this.admitted()){this.welcomed=true;game.openCars();}
  // Out of the race (the way out of the menu, another track, Modo História): the room hears it.
  if(this.phase!=='lobby'&&(!s.started||immersive?.active)){this.phase='lobby';this.holding=false;this.cut=null;if(room.role==='host')room.closeRace();}
  if(this.phase==='racing'&&immersive&&this.race)this.checkCut();
  this.updatePause();
  if((this.phase==='racing'||this.phase==='finished')&&immersive&&room.role==='host')this.checkSilence();
  if((this.phase==='racing'||this.phase==='finished')&&immersive)this.syncStops();else if(this.stopped.size||this.trucks.size||this.flags.size)this.clearStops();
  // A window waiting outside any race (a guest's rerun before the host starts one) sends nothing.
  if(this.phase!=='lobby'&&immersive&&this.race){
   if(this.holding&&room.role==='guest'&&room.race?.id===this.race.id&&(this.readyClock-=dt)<=0){this.readyClock=1;room.sendReady();}
   this.sendClock+=dt;if(this.sendClock>=SEND){this.sendClock=Math.min(this.sendClock-SEND,SEND);this.send(s.paused);}
   if(this.phase==='racing'){
    if(this.autopilot&&!this.autopilotOn){game.autopilot(true);this.autopilotOn=true;}
    // Driving keys take the wheel back (main.js takeWheel): the box follows.
    else if(this.autopilotOn&&!game.autopilot()){this.autopilot=this.autopilotOn=false;this.panel.auto.checked=false;}
   }
  }
  if((this.panelClock-=dt)<=0){this.panelClock=.25;this.render();}
 }
 send(paused){
  const immersive=this.immersive,car=immersive.car,room=this.room,command=this.game.command()??{},L=immersive.data.meta.reconstructed_xy_m,still=paused||this.holding||!!this.pause;
  const progress=Math.min(immersive.freePlayerProgress,car.laps*L+car.surface.s+immersive.field.gridLeadIn);
  const mine=packCar(car,{progress,finished:immersive.freeFinished,finishTime:immersive.finishTime,brake:command.brake??0,throttle:command.throttle??0,still});this.seq++;
  if(room.role==='guest'){if(!this.cut&&!this.lost)room.sendState(mine,this.seq);return;}
  // The host relays a guest's checked state, with its age; the rest it drives.
  const cars=[[this.myNumber(),0,mine]];
  for(const r of immersive.field.rivals){
   const remote=r.puppet?this.remotes.get(r.seat):null;
   cars.push(remote?.raw?[r.seat,Math.min(remote.age,5),remote.raw]:[r.entry.number,0,packCar(r.car,{progress:r.progress,finished:r.finished,retired:!!r.retired,finishTime:r.finishTime,brake:r.input?.brake??0,throttle:r.input?.throttle??0,still})]);
  }
  room.sendSnapshot(cars,this.seq);
 }
 // main.js asks before showing the result: not while other humans still race (up to RESULTS_WAIT), nor
 // while the race stands still for its host.
 holdResults(){
  const immersive=this.immersive;if(this.phase!=='racing'||!immersive?.freeFinished||immersive.finishing)return false;
  const now=clock();this.finishedAt??=now;
  if(this.pause||this.stillRacing()&&now-this.finishedAt<RESULTS_WAIT)return true;
  // Everyone is in, or the wait ran out: the order as it stands now (estimated times for whoever still races).
  this.phase='finished';
  immersive.freeOrder=immersive.field.classification(immersive.freeTotalLaps,immersive.finishTime);
  this.render();return false;
 }
 // The other humans the result waits for: seated in the race, or out of it for a moment with their car
 // waiting for them (back: their line dropped or went quiet); not one past the flag, nor one whose car
 // is AB for good or who left the race (back false). (A car left without its pilot is retired at once,
 // and its pilot may yet come back and finish: retired says nothing here.)
 stillRacing(){
  const me=this.myNumber(),stops=new Map(this.stopList().map(x=>[x.number,x]));
  const numbers=new Set([...(this.race?.seats??[]).map(s=>s.number),...[...stops.values()].filter(x=>x.back!==false).map(x=>x.number)]);numbers.delete(me);
  return [...numbers].filter(n=>!this.remotes.get(n)?.state?.finished&&!this.slot(n)?.finished&&stops.get(n)?.back!==false).length;
 }
 buildPanel(){
  const {root,add,room,role,status}=roomCard(this.params.label);
  this.panel={root,room,role,status,list:add('ol','mp-players')};
  // The host's start, shown while its race waits (Enter does the same).
  const start=this.panel.start=add('button','mp-start');start.type='button';start.id='mpStart';start.hidden=true;
  start.onclick=()=>{this.room.lightsOut();start.blur();};
  root.insertBefore(start,this.panel.list);
  // Online: the group key (asked when the server wants it), and the host's doorman.
  const form=this.panel.key=add('form','mp-key');form.hidden=true;
  const field=add('input','',form);field.type='password';field.id='mpKey';field.placeholder='Chave do grupo';field.autocomplete='off';field.maxLength=128;
  const enter=add('button','',form);enter.type='submit';enter.textContent='Entrar';
  form.onsubmit=e=>{e.preventDefault();const key=field.value.trim();if(!key)return;saveKey(key);field.value='';field.blur();this.room.retry();};
  root.insertBefore(form,this.panel.list);
  this.panel.knocks=add('ul','mp-knocks');root.insertBefore(this.panel.knocks,this.panel.list);
  const label=add('label','mp-auto'),box=add('input','',label);box.type='checkbox';box.id='mpAuto';box.checked=this.autopilot;label.append(' Piloto automático neste carro');
  // The box gives the focus back at once: typed driving keys are ignored while an input has it.
  box.onchange=()=>{this.autopilot=box.checked;if(!box.checked&&this.autopilotOn){this.game.autopilot(false);this.autopilotOn=false;}box.blur();};
  this.panel.auto=box;this.panel.net=add('small','mp-net');
  // The race standing still for its host: a plate in the middle of the screen says so, and why.
  const pause=this.panel.pause=document.createElement('div');pause.id='mpPause';pause.hidden=true;pause.setAttribute('role','status');
  add('b','',pause).textContent='CORRIDA PAUSADA';this.panel.pauseWhy=add('span','',pause);
  document.body.append(root,pause);
 }
 statusText(s){
  const room=this.room,me=room.number;
  // The race standing still for its host; racing with this guest's line down: what becomes of the car.
  if(this.pause)return PAUSES[this.pause.why](Math.floor(clock()-room.hostSeen));
  if(this.cut&&['reconectando','fora'].includes(room.problem))return 'Conexão caiu · seu carro segue sem piloto até você voltar…';
  if(room.problem&&PROBLEMS[room.problem])return PROBLEMS[room.problem];
  if(!room.role)return 'Procurando a sala…';
  if(room.pending)return 'Esperando o anfitrião aceitar você…';
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
   return this.race?'Pronto · o anfitrião dá a largada':'Esperando o anfitrião largar…';
  }
  if(this.phase==='racing'){
   if(this.immersive?.freeFinished){const left=this.stillRacing(),wait=Math.max(0,Math.ceil(RESULTS_WAIT-(clock()-(this.finishedAt??clock()))));return `Você terminou! Esperando ${left} piloto${left>1?'s':''} · ${wait} s`;}
   if(room.role==='guest'&&room.lobby?.race?.id!==this.race?.id)return 'O anfitrião saiu desta corrida.';
   if(this.lost)return 'A sala perdeu seu lugar nesta corrida (a conexão caiu) · você corre a próxima.';
   // A car without its pilot, a line gone quiet: what, who, where.
   const trouble=this.trouble();if(trouble)return trouble;
   // The door waits for the race to end.
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
  if(this.cut)return this.cut.over?'Seu carro passou a bandeirada sem piloto: abandono (AB) · você corre a próxima.':'Conexão de volta · retomando seu carro onde ele está…';
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
  if(!p.start.hidden){
   const {guests,ready}=this.readiness(),loading=guests-ready,choosing=this.choosing(),late=loading+choosing;
   p.start.textContent=!guests&&!choosing?'Largar sozinho ↵':late?`Largar já · ${[loading&&`${loading} carregando`,choosing&&`${choosing} escolhendo o carro`].filter(Boolean).join(', ')} ↵`:'Largar ↵';
   p.start.classList.toggle('mp-go',!!guests&&!late);
  }
  // The held 3 says what it waits for.
  if(this.holding){const caption=document.getElementById('countdownCaption');if(caption&&caption.textContent!=='AGUARDANDO A LARGADA')caption.textContent='AGUARDANDO A LARGADA';}
  // Out of the way of the result sheet; under the circuits on the track screen; one line on track.
  const results=document.getElementById('raceResults');p.root.hidden=!!results&&!results.hidden;
  const shown=id=>!document.getElementById(id)?.classList.contains('hidden');
  p.root.classList.toggle('mp-racing',s.started&&!s.paused);p.root.classList.toggle('mp-yellow',this.yellow()&&!this.pause);p.root.classList.toggle('mp-paused',!!this.pause);p.root.classList.toggle('mp-tracks',shown('tracks')||shown('cars'));
  // The car screen (main.js roomCars): the cars other pilots have, this window's car once the host
  // has answered its last choice, the car still being asked for, and for a guest its way on: the
  // host's answer at the door, then "Aguardar início da corrida".
  const taken=room.members.filter(m=>m.id!==room.id&&m.number).map(m=>[m.number,m.name]),mine=room.settled?me:null,asking=room.settled?null:room.want;
  const guest=this.guest()?{admitted:this.admitted(),waiting:room.waiting}:null,cars=JSON.stringify([taken,mine,asking,guest]);
  if(cars!==this.cars){this.cars=cars;this.game.roomCars({taken:new Map(taken),mine,asking,guest});}
  p.room.textContent=this.params.label;
  p.role.textContent=room.role==='host'?`anfitrião · #${me}`:room.pending?'na porta':room.role==='guest'?(me?`convidado · #${me}`:'assistindo'):'…';
  p.status.textContent=this.statusText(s);
  p.pause.hidden=!this.pause||!s.started||s.paused;if(!p.pause.hidden)p.pauseWhy.textContent=p.status.textContent;
  // The key form when the server asks for it; knocks and kicks for an online host. Names only ever
  // reach the page as text. The door is open until the start: on the car screen, the track screen
  // and on the grid (a knock there lets the host's mouse go, main.js freeMouse); from the start it
  // waits for the race to end.
  p.key.hidden=!(room.online&&room.problem==='chave');
  const knocks=room.role==='host'&&this.phase!=='racing'?[...room.knocks.values()]:[],kickable=room.online&&room.role==='host'&&!(s.started&&!s.paused);
  if(knocks.length>this.knocking&&this.phase==='waiting')this.game.freeMouse();this.knocking=knocks.length;
  const rows=room.members.map(m=>({id:m.id,text:`#${m.number??'—'} ${m.name}${this.doing(m)}${m.id===room.id?' · você':''}`,kick:kickable&&m.id!==room.id}));
  // (each list rebuilt only when it changed: a pilot's progress never swaps a button under a click)
  const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{action();b.blur();};return b;};
  const listKey=JSON.stringify(rows),knockKey=JSON.stringify(knocks);
  if(listKey!==this.rows){this.rows=listKey;p.list.replaceChildren(...rows.map(r=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=r.text;li.append(name);if(r.kick)li.append(button('Expulsar',()=>this.room.kick(r.id)));return li;}));}
  if(knockKey!==this.knockRows){this.knockRows=knockKey;p.knocks.replaceChildren(...knocks.map(k=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=`${k.name} quer entrar`;li.append(name,button('Aceitar',()=>this.room.admit(k.id)),button('Recusar',()=>this.room.deny(k.id)));return li;}));}
  p.knocks.hidden=!knocks.length;
  p.net.textContent=[room.online?'servidor':'mesmo PC',room.role==='guest'?`ping ${Math.round(room.latency*2000)} ms`:room.role==='host'?`${Math.max(0,room.members.length-1)} convidado(s)`:'',
   this.params.lag?`atraso simulado ${this.params.lag} ms`:'',this.params.loss?`perda simulada ${Math.round(this.params.loss*100)}%`:''].filter(Boolean).join(' · ');
 }
 // For the checks (verificar_multiplayer.py): this window's car and every other car as it shows them.
 info(){
  const immersive=this.immersive,car=immersive?.car;
  return {...this.room.info(),label:this.panel?.room.textContent??null,address:globalThis.location?.hash??null,phase:this.phase,holding:this.holding,autopilot:this.autopilot,raceId:this.race?.id??null,
   stopped:[...this.stopped].map(([number,x])=>({number,stage:x.stage})),cut:!!this.cut,lost:!!this.lost,paused:this.pause?.why??null,trucks:[...this.trucks.keys()],truckPoses:[...this.trucks].map(([number,t])=>({number,x:t.root.position.x,y:-t.root.position.z,strap:t.strap.visible,leaving:t.left!==undefined})),flags:[...this.flags.keys()],yellow:this.yellow(),
   remotes:[...this.remotes].map(([number,r])=>({number,seq:r.seq,age:r.age,finished:!!r.state?.finished})),
   me:car?{x:car.x,y:car.y,vx:car.vx,vy:car.vy,ghost:!!car.ghost}:null,
   cars:immersive?immersive.field.rivals.map((r,i)=>{const obj=immersive.visual.rivals[i];return {number:r.seat??r.entry.number,name:r.entry.shortName,x:r.car.x,y:r.car.y,remote:!!r.car.remote,ghost:!!r.car.ghost,
    shown:!!obj?.visible&&!!obj.parent,drawn:obj?[obj.position.x,-obj.position.z]:null};}):[]};
 }
}
