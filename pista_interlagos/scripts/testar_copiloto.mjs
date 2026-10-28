// O copiloto (corner-callouts.js), em cada circuito que tem falas: os nomes batem com a tabela do jogo (a linha do
// lugar no painel: main.js names, ou os trechos do arquivo da pista) e cada fala fica onde a curva começa, logo antes
// dela ou dentro dela (at: antes do meio), no meio da reta, ou (nas ruas) logo antes de entrar na rua; cada curva é
// falada uma vez por volta, antes de o carro chegar, na ordem; nunca duas ao mesmo tempo; calado devagar, de ré, fora
// da hora; as gravações existem, estão publicadas e cabem antes da curva.
//   node scripts/testar_copiloto.mjs
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {CALLOUTS,CalloutPlanner,LEAD,MIN_LEAD,AT_WINDOW} from '../teste/corner-callouts.js';
import {loadLap} from './curvas_pista.mjs';

const here=dirname(fileURLToPath(import.meta.url)),teste=join(here,'..','teste'),DT=1/60;
const pub=readFileSync(join(here,'publicacao.py'),'utf8');
assert(pub.includes(`'corner-callouts.js'`),'corner-callouts.js published');

// Uma volta a velocidade fixa: o que foi dito, onde, e quanto faltava para o lugar da fala. Cada fala ocupa a voz o
// tempo da sua gravação (clip: segundos por chave, ou um número para todas); dt, o quadro.
function drive(planner,L,{speed,laps=2,start=0,clip=1.4,ok=()=>true,back=false,dt=DT}){
 let s=start,t=0,busyUntil=-1;const said=[];
 for(let i=0,n=Math.ceil(laps*L/speed/dt);i<n;i++){
  s=((s+(back?-1:1)*speed*dt)%L+L)%L;t+=dt;
  const c=planner.step(s,speed,ok(s,t),t<busyUntil);
  if(c){said.push({key:c.key,s,t,ahead:planner.ahead(c,s),overlap:t<busyUntil});busyUntil=t+(typeof clip==='number'?clip:clip[c.key]??1.4);}
 }
 return said;
}

for(const [id,list] of Object.entries(CALLOUTS)){
 const lap=loadLap(id),{L,turn,bendEnd,gap,wrap}=lap,names=lap.sections;
 const ahead=(a,b)=>wrap(b-a);
 console.log(`${lap.circuit.name}:`);

 // A tabela do jogo: cada nome (o que vem antes da vírgula: "Curva 1, grampo") é o de um trecho do painel que começa
 // por perto (até 160 m); e cada fala fica onde a curva começa a virar: pelo menos 20° nos 60 m seguintes (num S, mais
 // longe a curva seguinte desvira) ou nos 120 m (as curvas abertas de Brasília), quase nada (menos de 10°) nos 20 m
 // antes (no S, a curva de antes termina logo antes da seguinte). Uma fala com lugar próprio (at) fica logo antes da
 // curva (até 40 m) ou dentro dela, antes do meio: o carro já vira ali (4° nos 20 m em volta: a Curva 7 de Chapecó,
 // de raio constante, vira 2,5° a cada 10 m), até 80 m depois de s, e falta virar até o fim da curva (onde vira menos
 // de 2,5° em 10 m, ou para o outro lado) pelo menos o que já virou desde s. Uma reta começa em s, onde a curva de trás termina (10° nos 60 m antes) ou
 // onde o painel a começa (a reta dos boxes da Pampulha), e é dita no meio (até 30 m dele), a meio caminho da fala
 // seguinte, onde quase não vira (menos de 15° nos 100 m em volta: a Reta 3 de Chapecó deriva 1° a cada 10 m; a Reta
 // oposta de Velocitta começa numa curva aberta). Uma rua (place) é dita até 40 m antes de onde o painel a começa (s,
 // até 30 m dele).
 for(const c of list){
  const name=c.say.split(', ')[0].toLowerCase();
  const sections=names.filter(([,n])=>n.split(' · ').some(part=>part.toLowerCase()===name)).sort((a,b)=>gap(a[0],c.s)-gap(b[0],c.s));
  assert(sections.length,`${id} ${c.key}: "${c.say}" is a HUD section`);
  assert(gap(sections[0][0],c.s)<=(c.place?30:160),`${id} ${c.key}: its HUD section starts near (${sections[0][0]} vs ${c.s})`);
  if(c.place){assert(c.at!=null&&ahead(c.at,c.s)<=40,`${id} ${c.key}: said just before the street (${c.at} for ${c.s})`);continue;}
  if(c.straight){
   const behind=turn(c.s-60,c.s),there=turn(c.at-50,c.at+50);
   assert((behind>=10||gap(sections[0][0],c.s)<=30)&&there<15,`${id} ${c.key}: the straight begins at ${c.s} (${behind.toFixed(0)}° in the 60 m behind) and is straight where it is named (${there.toFixed(0)}° in the 100 m round ${c.at})`);
   const next=list[(list.indexOf(c)+1)%list.length],mid=wrap(c.s+ahead(c.s,next.s)/2);
   assert(ahead(c.s,c.at)>0&&gap(c.at,mid)<=30,`${id} ${c.key}: named in its middle (${c.at} vs ${mid.toFixed(0)}, halfway from ${c.s} to ${next.key})`);
   continue;
  }
  if(c.at!=null&&ahead(c.s,c.at)<L/2){
   const now=turn(c.at-10,c.at+10),done=turn(c.s,c.at),left=turn(c.at,bendEnd(c.at));
   assert(ahead(c.s,c.at)<=80&&now>=4&&left>=done,`${id} ${c.key}: said in the bend at ${c.at}, before its middle (${now.toFixed(0)}° there, ${done.toFixed(0)}° since ${c.s}, ${left.toFixed(0)}° to go)`);
   continue;
  }
  if(c.at!=null)assert(ahead(c.at,c.s)<=40,`${id} ${c.key}: said just before the bend (${ahead(c.at,c.s).toFixed(0)} m)`);
  const bend=Math.max(turn(c.s,c.s+60),turn(c.s,c.s+120)),before=turn(c.s-20,c.s);
  assert(bend>=20&&before<10,`${id} ${c.key}: the bend begins at ${c.s} (${bend.toFixed(0)}° ahead, ${before.toFixed(0)}° before)`);
 }
 const point=c=>c.at??c.s;
 for(let i=1;i<list.length;i++)assert(point(list[i])>point(list[i-1]),`${id}: in the order they are said (${list[i-1].key}, ${list[i].key})`);
 assert(list.every(c=>c.s>=0&&c.s<L&&point(c)>=0&&point(c)<L),`${id}: on the lap`);
 assert.equal(new Set(list.map(c=>c.key)).size,list.length,`${id}: one key each`);

 // As gravações: uma por fala, publicadas, curtas o bastante para caber antes da curva (até 3 s: "Rua Doutor Cesário
 // Mota Júnior").
 const pack=JSON.parse(readFileSync(join(teste,'assets','audio',`curvas_${id}.json`),'utf8')),clip={};
 assert(existsSync(join(teste,'assets','audio',`curvas_${id}.mp3`)),`${id} pack mp3`);
 for(const f of [`audio/curvas_${id}.mp3`,`audio/curvas_${id}.json`])assert(pub.includes(`'${f}'`),`${f} published`);
 for(const c of list){const x=pack.clips[c.key];assert(x,`${id} clip ${c.key}`);assert.equal(x.say,c.say,`${id} ${c.key} recorded with today's words`);
  clip[c.key]=x.end-x.start;assert(clip[c.key]>.3&&clip[c.key]<3,`${id} ${c.key}: ${clip[c.key].toFixed(2)} s`);}

 // Até 45 m/s (162 km/h, mais do que se chega a qualquer curva do miolo) todas; a 70 m/s alguma pode cair (a anterior
 // ainda falando), nunca fora da ordem.
 for(const speed of [20,45,70]){
  const said=drive(new CalloutPlanner(list,L),L,{speed,clip}),keys=said.map(x=>x.key),lap2=[...list,...list].map(c=>c.key);
  if(speed<=45){
   assert.equal(said.length,list.length*2,`${id} ${speed} m/s: every corner once a lap (${keys.join(' ')})`);
   assert.deepEqual(keys,lap2,`${id} ${speed} m/s: in order`);
  }else{
   assert(said.length>=Math.floor(list.length*.8)*2,`${id} ${speed} m/s: nearly every corner (${keys.join(' ')})`);
   let i=0;for(const k of keys){i=lap2.indexOf(k,i);assert(i>=0,`${id} ${speed} m/s: in order (${keys.join(' ')})`);i++;}
  }
  for(const x of said){const c=list.find(c=>c.key===x.key),reach=(c.at!=null?Math.max(3,speed*AT_WINDOW):Math.max(MIN_LEAD,speed*LEAD))+speed*DT;
   assert(x.ahead>0&&x.ahead<=reach,`${id} ${speed} m/s: ${x.key} said ${x.ahead.toFixed(0)} m before its place (at most ${reach.toFixed(0)})`);}
  assert(!said.some(x=>x.overlap),`${id}: never over the last one`);
  const range=xs=>xs.length?`${Math.min(...xs.map(x=>x.ahead)).toFixed(0)}–${Math.max(...xs.map(x=>x.ahead)).toFixed(0)} m`:'—';
  const lead=said.filter(x=>list.find(c=>c.key===x.key).at==null),own=said.filter(x=>!lead.includes(x));
  console.log(`  ${speed} m/s: ${said.length} falas; antes da curva ${range(lead)}, no lugar próprio ${range(own)} antes dele`);
 }
 // Um computador lento (3 quadros por segundo, como o navegador sem tela dos testes): a 45 m/s o carro anda 15 m num
 // quadro, mais que a janela de uma fala de lugar próprio; ela é dita quando o carro passa, na ordem, todas.
 {const said=drive(new CalloutPlanner(list,L),L,{speed:45,clip,dt:1/3}),keys=said.map(x=>x.key);
  assert.deepEqual(keys,[...list,...list].map(c=>c.key),`${id}: a slow machine says them all, in order (${keys.join(' ')})`);
  assert(!said.some(x=>x.overlap),`${id}: a slow machine never over the last one`);}
 // Um quadro de um segundo (o navegador sem tela, sobrecarregado): 45 m de uma vez; quase todas ditas, na ordem.
 // (O primeiro quadro já passa de uma fala logo depois da largada: a ordem vale a partir de onde começa.)
 {const said=drive(new CalloutPlanner(list,L),L,{speed:45,clip,dt:1}),keys=said.map(x=>x.key),lap2=[...list,...list,...list].map(c=>c.key);
  assert(said.length>=Math.floor(list.length*.8)*2,`${id}: one-second frames say nearly all (${keys.join(' ')})`);
  let i=0;for(const k of keys){i=lap2.indexOf(k,i);assert(i>=0,`${id}: one-second frames, in order (${keys.join(' ')})`);i++;}}
 // A voz ocupada: a próxima espera, e cai se o carro chegar antes.
 {const said=drive(new CalloutPlanner(list,L),L,{speed:45,clip:6});
  assert(!said.some(x=>x.overlap),`${id}: a long clip never overlaps`);assert(said.length<list.length*2&&said.length>0,`${id}: some wait and are dropped`);}
 // Calado: devagar, de ré, fora da hora (box, pausa, menu).
 assert.equal(drive(new CalloutPlanner(list,L),L,{speed:5,laps:1}).length,0,`${id}: too slow: silent`);
 assert.equal(drive(new CalloutPlanner(list,L),L,{speed:30,back:true,laps:1}).length,0,`${id}: backwards: silent`);
 assert.equal(drive(new CalloutPlanner(list,L),L,{speed:45,ok:()=>false,laps:1}).length,0,`${id}: not the moment: silent`);
 // Um "não" de um instante na janela de uma fala (o asfalto de uma estrada fechada raspado num entroncamento): ela sai
 // assim que pode. Um "não" longo (uma parada, uma pausa: 300 m) a deixa para trás.
 {const c=list.find(c=>c.at!=null&&!c.straight&&!c.place)??list[0],p=c.at??c.s,inside=(s,a,b)=>{const d=((s-p)%L+L)%L;return d>=L-a||d<=b;};
  const brief=drive(new CalloutPlanner(list,L),L,{speed:30,laps:1,clip,ok:s=>!inside(s,12,8)}).map(x=>x.key);
  assert(brief.includes(c.key),`${id}: a moment's no in ${c.key}'s window does not lose it (${brief.join(' ')})`);
  const long=drive(new CalloutPlanner(list,L),L,{speed:30,laps:1,clip,ok:s=>!inside(s,150,150)}).map(x=>x.key);
  assert(!long.includes(c.key),`${id}: a long no passes ${c.key} unsaid (${long.join(' ')})`);}
 // O resgate põe o carro logo antes de uma curva: ela é dita uma vez, e as de trás não.
 if(id==='interlagos'){const p=new CalloutPlanner(list,L);drive(p,L,{speed:45,laps:.3});const said=drive(p,L,{speed:45,laps:.04,start:2600});
  assert.deepEqual(said.map(x=>x.key),['bico'],`after a jump only the corner ahead (${said.map(x=>x.key)})`);}
 console.log(`  gravações: ${Object.keys(pack.clips).length}, voz ${pack.label}`);
}
console.log('copiloto: ok');
