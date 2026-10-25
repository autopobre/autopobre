// The game's own online records code (pista_interlagos/teste/recordes-online.js) talking to the accounts
// server on this machine (teste/local.mjs), on one clock the test moves for both. A run as main.js feeds it
// (a frame every tenth of a second): the ticket, the first crossing at the lights, chunks at the server's
// pace, a best lap with its ghost and controls (checked; the verdict on screen), a slower lap (logged quietly), a lap with
// a pause (refused, and why), a reset (a new ticket), the Fusca and a signed-out pilot (nothing sent), the
// old records' import (only the pilot's, once), and the board as the records dialog reads it.
import assert from 'node:assert/strict';
import {startLocal} from './local.mjs';
import {aiLaps,lapAt} from './voltas_ia.mjs';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';

// The page around the module: a status element, this browser's storage, and fetch as a browser sends it
// (its cookies, and the Origin on a write).
const store=new Map();
globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const toast={hidden:true,textContent:'',classList:{toggle(){}},setAttribute(){}};
globalThis.document={createElement:()=>toast,body:{append(){}}};
let now=Date.parse('2026-10-25T15:00:00Z');const realNow=Date.now;Date.now=()=>now;
const local=await startLocal({port:0}),ORIGIN=`http://127.0.0.1:${local.port}`;
const jar=new Map(),sent=[],realFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
 const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
 if(init.method==='POST')headers.set('Origin',ORIGIN);
 sent.push(String(url).replace(ORIGIN,''));
 const r=await realFetch(new URL(url,ORIGIN),{...init,headers,redirect:'manual'});
 for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
 return r;
};
const {OnlineRecords}=await import('../../pista_interlagos/teste/recordes-online.js');
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});

// Signed in as a pilot of the stand-in Google, with a nickname.
local.google.next.sub='300000000000000000001';
{const start=await fetch('/api/conta/entrar'),back=await fetch(start.headers.get('Location'));await fetch(back.headers.get('Location'));}
assert.equal((await fetch('/api/conta/apelido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apelido:'Fefe Rapida'})})).status,200);
const account=await (await fetch('/api/conta/eu')).json().then(d=>d.conta);

const online=new OnlineRecords({base:ORIGIN+'/api/recordes',now:()=>now});
async function settle(){for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,1));if(!online.busy&&!online.queue.length&&(!online.run||online.run.ticket||online.run.failed))return;}throw new Error('the module did not settle');}
// The lap the game would record: the AI's flying lap of the circuit on a clock of `time` seconds (voltas_ia.mjs).
const lapOf=(circuit,time)=>lapAt(aiLaps(circuit)[1].lap,time);
// The race as main.js sees it: a frame every 0.1 s of real time, twelve physics steps in each, whose controls (the
// throttle held, from the keyboard) go to the module as main.js recordGhost sends them; then the frame.
const race={circuit:'interlagos',mode:'normal',car:'opala',clock:0,lapStart:0,driving:true};
let steps=0;
const physics=()=>{steps++;race.clock=steps/120;online.step({clock:race.clock,lapStart:race.lapStart},{throttle:1},()=>1);};
async function frames(seconds,{running=true}={}){
 for(let i=0;i<Math.round(seconds*10);i++){now+=100;if(running)for(let k=0;k<12;k++)physics();online.frame({...race});await settle();}
}
// Drives to the line `time` seconds after the lap began; the crossing's step hands the lap's controls and then its
// ghost over first.
async function lap(time,{pauseAt=null}={}){
 const end=Math.round((race.lapStart+time)*120);
 while(steps+12<end){   // up to the last frame before the line: the crossing's frame moves the clock too
  if(pauseAt!==null&&race.clock>=race.lapStart+pauseAt){pauseAt=null;await frames(20,{running:false});}
  await frames(.1);
 }
 now+=100;while(steps<end-1)physics();
 steps++;race.clock=race.lapStart=steps/120;online.step({clock:race.clock,lapStart:race.lapStart},{throttle:1},()=>1);
 online.lapDone({circuit:race.circuit,mode:race.mode,car:race.car,lap:lapOf(race.circuit,time),end:race.lapStart});
 online.frame({...race});await settle();
}
const pedacos=()=>sent.filter(u=>u.startsWith('/api/recordes/pedaco')).length;

await check('a run: the ticket, the start, a best lap checked and shown',async()=>{
 online.setAccount(account);
 await frames(3,{running:false});                                   // the 3-2-1: the clock stands, nothing goes
 assert.equal(sent.filter(u=>u.endsWith('/bilhete')).length,1);assert.equal(pedacos(),0);
 await lap(120);
 const kept=local.DB.sqlite.prepare("SELECT selo,volta_ms,versao FROM recordes r JOIN usuarios u ON u.id=r.usuario_id WHERE u.apelido='Fefe Rapida'").all();
 assert.deepEqual(kept.map(r=>({...r})),[{selo:'conferido',volta_ms:120000,versao:'local'}]);
 assert.equal(toast.hidden,false);assert.match(toast.textContent,/Recorde online conferido: 02:00.000/);
 assert.ok(pedacos()>=12&&pedacos()<=15,`a chunk every 10 s and the two crossings (${pedacos()})`);
});

await check('a slower lap goes to the log quietly; a lap with a pause is refused, and the screen says why',async()=>{
 toast.hidden=true;const before=sent.join('|').length;
 await lap(123);
 assert.equal(toast.hidden,true,'nothing to say');
 const logged=local.DB.sqlite.prepare('SELECT tempo_ms,resultado,aparelho FROM voltas ORDER BY id DESC').get();
 assert.deepEqual({...logged},{tempo_ms:123000,resultado:'conferida',aparelho:'teclado'},'checked, logged, with the keyboard that drove it');
 await lap(117,{pauseAt:40});
 assert.equal(toast.hidden,false);assert.match(toast.textContent,/Volta de 01:57.000 não conferida: a volta teve pausa/);
 assert.equal(local.DB.sqlite.prepare("SELECT volta_ms FROM recordes WHERE selo='conferido'").get().volta_ms,120000);
 assert.ok(sent.join('|').length>before);
 await lap(118);
 assert.match(toast.textContent,/Recorde online conferido: 01:58.000/,'the next clean lap counts again');
});

await check('a reset asks for a new ticket; the Fusca and a signed-out pilot send nothing',async()=>{
 const tickets=()=>sent.filter(u=>u.endsWith('/bilhete')).length,t0=tickets();
 race.clock=0;race.lapStart=0;steps=0;await frames(1);
 assert.equal(tickets(),t0+1,'the clock went back: a new run');
 const n=sent.length;
 race.car='fusca';await frames(12);race.car='opala';
 online.setAccount(null);await frames(12);
 assert.ok(sent.slice(n).every(u=>!u.includes('/pedaco')),'nothing for the Fusca nor signed out');
});

await check('the old records go up once: the pilot\'s only, then the browser is marked',async()=>{
 store.set('autopobre-records-v1',JSON.stringify([
  {circuit:'interlagos',name:'fefe rapida',mode:'normal',bestLap:116.5,bestRace:null,raceLaps:3,date:'2026-09-01T10:00:00Z'},
  {circuit:'cascavel',name:'Velho Nome',mode:'normal',bestLap:80,bestRace:null,raceLaps:3,date:''},
  {circuit:'chapeco',name:'Outra Pessoa',mode:'normal',bestLap:90,bestRace:null,raceLaps:3,date:''}]));
 const imports=()=>sent.filter(u=>u.endsWith('/importar')).length;
 await online.importOld(account,['Fefe Rapida','Velho Nome']);
 assert.equal(imports(),1);
 const kept=local.DB.sqlite.prepare("SELECT circuito,volta_ms FROM recordes WHERE selo='nao_verificado' ORDER BY circuito").all().map(r=>[r.circuito,r.volta_ms]);
 assert.deepEqual(kept,[['interlagos',116500]],'the pilot named as the nickname only: not the other pilot of the menu, nor anyone else');
 assert.ok(JSON.parse(store.get('autopobre-recordes-importados-v3'))[account.desde],'marked');
 await online.importOld(account,['Fefe Rapida']);assert.equal(imports(),1,'never again from this browser');
});

await check('the board and the circuits\' bests, as the records dialog reads them',async()=>{
 const board=await online.board('interlagos','normal');
 assert.deepEqual(board.map(r=>[r.name,r.bestLap,r.badge,r.mine]),[['Fefe Rapida',118,'conferido',true]],'the checked lap, though the old one is quicker');
 assert.equal((await online.bests('normal')).interlagos,118000);
 await assert.rejects(online.board('nada','normal'));
});

await local.close();Date.now=realNow;globalThis.fetch=realFetch;
console.log(`${passed} grupos de verificações do código do jogo com o servidor passaram.`);
