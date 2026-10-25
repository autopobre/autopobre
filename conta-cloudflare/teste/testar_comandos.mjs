// A lap's controls (the game's comandos-volta.js) read and judged by the server (src/comandos.js), on laps the game's
// own AI drives in Node (the recon lap's racecraft, as testar_fantasma.mjs): recorded step by step beside the ghost,
// they cover the lap and explain it; taken apart they do not (no throttle, missing steps, unreadable). Then the
// signals: a pilot on the keyboard, with a person's timing, raises none; keys a script made, a keyboard's lap without
// its keys, half pedals from a keyboard alone, taps too short or all at once, a car moved by no device and a replayed
// lap each raise theirs. And the format: what goes is what comes back, a long lap thins to fit, and it is quick.
import assert from 'node:assert/strict';
import {encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {LapInputs,packSteps,packKeys,INPUT_CHARS} from '../../pista_interlagos/teste/comandos-volta.js';
import {readGhost} from '../src/recordes.js';
import {readInputs,inputsProblem,inputSignals} from '../src/comandos.js';
import {aiLaps} from './voltas_ia.mjs';

let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('ok',name);};
// Laps the AI drives from the grid (voltas_ia.mjs), each with its ghost as the server reads it.
const withGhost=laps=>laps.map(l=>({...l,ghost:readGhost(encodeGhost(l.lap))}));
const interlagos=withGhost(aiLaps('interlagos',2)),curvelo=withGhost(aiLaps('curvelo',3));
// The same lap as a keyboard gives it: each pedal and side all or nothing (the AI's over a little), from the keyboard,
// and the keys as a person's fingers send them: a few milliseconds after the step, each its own instant.
function keyboardLap({commands},{trusted=true,keys=true,jitter=true,analog=false}={}){
 const binary=c=>({throttle:c.throttle>.05?1:0,brake:c.brake>.3?1:0,left:c.left>.3?1:0,right:c.right>.3?1:0});
 const changes=[],events=[];let last=[0,0,0,0,-2,0],held={};let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 commands.forEach((c,n)=>{
  const k=binary(c),q=analog?[Math.round(c.throttle*100),Math.round(c.brake*100),Math.round((c.right-c.left)*100),0,-2,0]:[k.throttle*100,k.brake*100,(k.right-k.left)*100,0,-2,0];
  if(q.some((x,i)=>x!==last[i])){changes.push([n,q]);last=q;}
  ['throttle','brake','left','right'].forEach((name,a)=>{if(!!k[name]!==!!held[name]){held[name]=k[name];events.push([Math.round((n/120*1000+(jitter?3+rnd()*9:0))*10),a|(k[name]?8:0)|(trusted?16:0)]);}});
 });
 events.sort((a,b)=>a[0]-b[0]);
 const n=commands.length;
 return {v:1,n,s:1,data:packSteps(changes,n),keys:packKeys(keys?events:[]),r:0,dev:[n,0,0,0,0]};
}

check('the AI\'s laps: their controls cover them and explain them',()=>{
 for(const {lap,inputs,ghost} of [...interlagos,...curvelo]){
  assert.ok(Math.abs(inputs.n/120-lap.time)<=2/120,`every step of the lap, the one onto the line too (${inputs.n} for ${lap.time} s)`);
  assert.equal(inputsProblem(readInputs(inputs),ghost),null);
 }
});

check('controls that cannot be the lap\'s',()=>{
 const {inputs,ghost}=interlagos[1];
 const noThrottle=readInputs(inputs);noThrottle.ch[0].fill(0);
 assert.match(inputsProblem(noThrottle,ghost),/ganhou velocidade sem acelerar/);
 assert.match(inputsProblem(null,ghost),/sem os comandos/);
 const short=readInputs({...inputs,n:inputs.n-60,dev:[0,0,0,0,0],data:packSteps([[0,[100,0,0,0,-2,0]]],inputs.n-60)});
 assert.match(inputsProblem(short,ghost),/não cobrem a volta/);
 for(const bad of [{v:2},{n:0},{s:3},{data:'%%%'},{dev:[1,2]},{r:-1},{data:inputs.data.slice(0,-3)},{keys:btoa('\x00\x06')},{data:INPUT_CHARS>0?'A'.repeat(INPUT_CHARS+4):''}])
  assert.equal(readInputs({...inputs,...bad}),null,JSON.stringify(bad).slice(0,40));
 assert.equal(readInputs({...inputs,data:btoa('\x00\x01\x80')}),null,'a throttle past 100');
});

check('a pilot on the keyboard, a person\'s timing: no signal',()=>{
 for(const lap of [interlagos[1],curvelo[1]]){
  const inputs=keyboardLap(lap),read=readInputs(inputs);
  assert.equal(inputsProblem(read,lap.ghost),null);
  const s=inputSignals(read,lap.ghost);
  assert.equal(s.aparelho,'teclado');assert.deepEqual(s.sinais,[],JSON.stringify(s.medidas));
  assert.ok(s.freios.length>0,'where it braked, to compare the next laps with');
 }
});

check('what a program leaves: each its signal',()=>{
 const lap=interlagos[1],flags=(inputs,previous)=>inputSignals(readInputs(inputs),lap.ghost,previous).sinais;
 assert.ok(flags(keyboardLap(lap,{trusted:false})).includes('sinteticas'),'keys a page\'s script made');
 assert.ok(flags(keyboardLap(lap,{keys:false})).includes('sem_teclas'),'a keyboard\'s lap with no keys pressed');
 assert.ok(flags(keyboardLap(lap,{analog:true})).includes('pedal_meio'),'half pedals from a keyboard alone');
 // A program lets go of the throttle and presses the brake in the same instant, every time.
 const swaps=[];for(let i=0;i<40;i++)swaps.push([i*20000,0|16],[i*20000,1|8|16],[i*20000+9000,1|16],[i*20000+9000,0|8|16]);
 assert.ok(flags({...keyboardLap(lap),keys:packKeys(swaps)}).includes('simultaneas'),'keys swapped in the very same instant');
 assert.ok(flags(lap.inputs).includes('sem_aparelho'),'the AI: a car moved by no device');
 // A replay brakes where the lap before did; a person misses by metres.
 const before=inputSignals(readInputs(interlagos[0].inputs),interlagos[0].ghost).freios;
 assert.ok(flags(lap.inputs,[before]).includes('repetida'),'the AI brakes at the same metres lap after lap');
 let seed=3;const shifted=before.map(x=>x+Math.round(((seed=(seed*16807)%2147483647)/2147483647-.5)*80));
 assert.ok(!flags(keyboardLap(lap),[shifted]).includes('repetida'),'a few metres either way: a person');
 // Taps of a few milliseconds, many of them.
 const taps=[];for(let i=0;i<60;i++)taps.push([i*3000,2|8|16],[i*3000+80,2|16]);
 assert.ok(flags({...keyboardLap(lap),keys:packKeys(taps)}).includes('curtas'));
});

check('the format: back as sent, a long lap thinned to fit, and quick',()=>{
 const {inputs,commands,ghost}=interlagos[1],read=readInputs(inputs);
 assert.equal(read.n,commands.length);
 const q=c=>[Math.round(c.throttle*100),Math.round(c.brake*100),Math.round((c.right-c.left)*100)];
 for(const n of [0,1000,5000,read.n-1])assert.deepEqual([read.ch[0][n],read.ch[1][n],read.ch[2][n]],q(commands[n]),`step ${n}`);
 // A controller's nine minutes (the AI's Interlagos lap four times over) go thinned, every kept step as it was.
 const long=new LapInputs({target:null,now:()=>0}),car={clock:0,lapStart:0};long.step(car,{},()=>0);
 for(let r=0;r<4;r++)for(const c of commands){car.clock+=1/120;long.step(car,c,()=>4);}
 car.lapStart=car.clock+=1/120;const thin=long.step(car,commands[0],()=>4);
 assert.ok(thin.s>1&&thin.data.length+thin.keys.length<=INPUT_CHARS,`stride ${thin.s}, ${thin.data.length} characters`);
 const back=readInputs(thin);assert.equal(back.ch[0][Math.floor(1000/thin.s)],q(commands[Math.floor(1000/thin.s)*thin.s])[0]);
 assert.equal(inputSignals(back,ghost).aparelho,'controle');
 // On a warm Worker the whole judging of a lap's controls takes a fraction of the 10 ms a request may use.
 for(let i=0;i<30;i++){inputsProblem(readInputs(inputs),ghost);inputSignals(readInputs(inputs),ghost,[[]]);}
 const t0=performance.now();for(let i=0;i<50;i++){const r=readInputs(inputs);inputsProblem(r,ghost);inputSignals(r,ghost,[[]]);}
 const ms=(performance.now()-t0)/50;assert.ok(ms<3,`${ms.toFixed(2)} ms a lap`);console.log(`  ${ms.toFixed(2)} ms to read and judge an Interlagos lap's controls`);
});

console.log(`${passed} grupos de verificações dos comandos passaram.`);
