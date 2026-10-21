// A história do autódromo (track-history.js + historia-interlagos.js): a linha do tempo com os capítulos, todo lugar
// citado existe nos traçados, a câmera nunca entra no chão, imagens e links existem e estão publicados, e o que a
// narração afirma a partir da geometria do jogo ("repare…") continua verdade nos dados da pista.
//   node scripts/testar_historia.mjs
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {buildTimeline,lineAt,chapterAt,formatTime,estimateDuration,missingPlaces,TrackHistory,TrackPath} from '../teste/track-history.js';
import {HISTORY,OLD_LAYOUT,MEDIA} from '../teste/historia-interlagos.js';

const here=dirname(fileURLToPath(import.meta.url)),teste=join(here,'..','teste');
const data=JSON.parse(readFileSync(join(here,'..','dados','pista.json'),'utf8'));
const publicacao=readFileSync(join(here,'publicacao.py'),'utf8');

// A linha do tempo: capítulos em sequência, cada fala com a duração da voz.
const timeline=buildTimeline(HISTORY);
assert.equal(timeline.chapters.length,HISTORY.chapters.length);
let t=0;for(const line of timeline.lines){assert(Math.abs(line.start-t)<1e-9,'lines follow each other');assert(line.dur>=2.2,'every line can be read');t=line.end;}
assert(Math.abs(timeline.duration-t)<1e-9);
console.log(`${timeline.chapters.length} capítulos, ${timeline.lines.length} falas, ${formatTime(timeline.duration)}`);
assert(timeline.duration>4*60&&timeline.duration<14*60,'a short documentary, not a film');
for(const c of timeline.chapters){assert.equal(lineAt(timeline,c.start).chapter,c.index,`${c.title} starts on its own line`);assert.equal(chapterAt(timeline,c.end-.01).index,c.index);}
assert.equal(lineAt(timeline,-5).index,0);assert.equal(lineAt(timeline,1e9).index,timeline.lines.length-1);
assert.equal(formatTime(0),'0:00');assert.equal(formatTime(61.9),'1:01');assert.equal(formatTime(600),'10:00');
assert(estimateDuration('x'.repeat(140))>10,'long sentences take longer');
assert(timeline.lines[0].shotSeg&&timeline.lines.every(l=>l.shotSeg),'every line has a camera');
for(const l of timeline.lines){assert(l.text&&l.text.length<260,`line ${l.index} short enough for a caption`);assert(!/[<>]/.test(l.text),'captions are plain text');}

// O traçado de 1940: uma volta fechada de quase 8 km, com trechos cortados, invertidos e mantidos.
assert(OLD_LAYOUT.length_m>7700&&OLD_LAYOUT.length_m<8100,`old lap length ${OLD_LAYOUT.length_m}`);
{const c=OLD_LAYOUT.columns,s=OLD_LAYOUT.samples,ix=c.indexOf('x'),iy=c.indexOf('y');
 const gap=Math.hypot(s[0][ix]-s.at(-1)[ix],s[0][iy]-s.at(-1)[iy]);assert(gap<12,`old lap closes (${gap.toFixed(1)} m)`);
 let worst=0;for(let i=1;i<s.length;i++)worst=Math.max(worst,Math.hypot(s[i][ix]-s[i-1][ix],s[i][iy]-s[i-1][iy]));assert(worst<8,`old samples close together (${worst.toFixed(1)} m)`);}
for(const status of ['cortado','invertido','mantido'])assert(OLD_LAYOUT.segments.some(g=>g.status===status),`old layout has ${status} stretches`);

// Todo lugar citado (câmeras, carro, rótulos, camadas) existe no seu traçado.
const oldPoints={...Object.fromEntries(OLD_LAYOUT.points.map(p=>[p.name,p.s??p.s_from])),...HISTORY.places.old};
assert.deepEqual(missingPlaces(HISTORY,oldPoints),[],'every place named exists');
for(const [name,s] of Object.entries(HISTORY.places.new))assert(typeof s==='object'?Number.isFinite(s.x)&&Number.isFinite(s.y):s>=0&&s<data.meta.reconstructed_xy_m,`${name} on today's lap`);
for(const id of new Set(timeline.lines.flatMap(l=>[...l.showNow,...(l.reveal?[l.reveal]:[])])))assert(HISTORY.layers[id],`layer ${id} defined`);

// A câmera: em toda a história, acima do chão, olhando para algum lugar.
const history=new TrackHistory().prepare(HISTORY,{data,oldLayout:OLD_LAYOUT},'pt');
const pose={pos:{x:0,y:0,z:0},look:{},up:{},fov:0};
{const THREE=await import('../teste/node_modules/three/build/three.module.js');pose.pos=new THREE.Vector3();pose.look=new THREE.Vector3();pose.up=new THREE.Vector3();}
let lowest=Infinity,where=0;
for(let time=0;time<timeline.duration;time+=.25){
 history.cameraAt(time,pose);
 for(const v of [pose.pos,pose.look])assert(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z),`camera finite at ${time}`);
 const above=pose.pos.y-history.ground(pose.pos.x,-pose.pos.z);if(above<lowest){lowest=above;where=time;}
 assert(pose.pos.distanceTo(pose.look)>1,`camera looks somewhere at ${time}`);assert(pose.fov>20&&pose.fov<80);
}
console.log(`câmera: no mínimo ${lowest.toFixed(1)} m acima do chão (em ${formatTime(where)})`);
assert(lowest>=1.9,'the camera never goes into the ground');

// Imagens e links: existem, estão na publicação, e as imagens têm crédito e licença livre.
const used=new Set(timeline.lines.map(l=>l.image).filter(Boolean)),cards=new Set(timeline.chapters.flatMap(c=>c.links));
for(const id of used){const img=MEDIA.images[id];assert(img,`image ${id} exists`);assert(existsSync(join(teste,img.src)),`${img.src} on disk`);
 assert(publicacao.includes(`'${img.src.replace(/^assets\//,'')}'`),`${img.src} published`);assert(img.credit&&img.licence&&img.source,`${id} credited`);
 assert(/^(CC0|CC BY|CC BY-SA|Domínio público|Public domain|PD|Auto-Pobre)/i.test(img.licence),`${id}: free licence (${img.licence})`);}
for(const id of cards){const l=MEDIA.links[id];assert(l,`link ${id} exists`);assert(/^https:\/\//.test(l.url),`${id} https`);}
for(const l of Object.values(MEDIA.links))assert(/^https:\/\//.test(l.url),`${l.id} https`);
for(const name of ['track-history.js','historia.css','historias.js','historia-interlagos.js','historia-interlagos-en.js','interlagos-1940.js','historia-midia.js'])assert(publicacao.includes(`'${name}'`),`${name} published`);

// Em inglês: cada capítulo e cada fala traduzidos, na mesma ordem; legendas curtas; imagens com título e legenda;
// a mesma câmera (os mesmos tempos de tomada por fala, só a duração muda com as palavras).
const english=buildTimeline(HISTORY,'en');
{const EN=HISTORY.translations.en;assert.equal(english.lines.length,timeline.lines.length);
 for(const c of HISTORY.chapters){const tc=EN.chapters[c.id];assert(tc?.title,`EN chapter ${c.id}`);assert.equal(tc.lines.length,c.lines.length,`EN lines of ${c.id}`);
  c.lines.forEach((l,i)=>{const t=tc.lines[i];assert(t.text&&t.text.length<280,`EN ${c.id}[${i}] text`);assert(!/[ãõçáéíóúâêô]/i.test(t.text.replace(/São Paulo|Autódromo|José|Júnior|Hellé|Teffé|Retão|Junção|Café|Descida|Pinheirinho|Laranjinha|Bico|Cotovelo|Ferradura|Mergulho|Subida|Brasileiras|Conceição|Praça|América|Guarapiranga|Jardim/g,'')),`EN ${c.id}[${i}] reads English: ${t.text}`);
   assert(!!t.title===!!l.title,`EN ${c.id}[${i}] title card where the Portuguese has one`);});}
 for(const id of Object.keys(MEDIA.images))assert(MEDIA.translations.en.images[id]?.title&&MEDIA.translations.en.images[id]?.caption,`EN picture ${id}`);
 console.log(`em inglês: ${formatTime(english.duration)}`);}

// A tela História das Corridas: o catálogo bate com o roteiro (capítulos, minutos) e a imagem do card existe e é publicada.
{const {HISTORIAS}=await import('../teste/historias.js');const card=HISTORIAS.find(h=>h.circuit==='interlagos');
 assert(card,'Interlagos in the catalog');assert.equal(card.chapters,timeline.chapters.length,'catalog chapters');
 assert.equal(card.minutes,Math.round(timeline.duration/60),`catalog minutes (${(timeline.duration/60).toFixed(1)})`);
 assert.equal(card.en.minutes,Math.round(english.duration/60),`catalog minutes in English (${(english.duration/60).toFixed(1)})`);
 assert(existsSync(join(teste,card.picture))&&publicacao.includes(`'${card.picture.replace(/^assets\//,'')}'`),'card picture published');
 assert.equal((await card.load()).HISTORY,HISTORY,'the card loads this script');
 for(const h of HISTORIAS)assert(h.title&&h.place&&h.summary&&typeof h.load==='function',`${h.circuit} card complete`);}

// O que a narração afirma olhando a geometria do jogo.
const track=new TrackPath(data.samples.map(p=>[p[0],p[1],p[2],p[3]]),data.meta.reconstructed_xy_m);
const at=s=>track.point(s),bearing=p=>(Math.atan2(p.hx,p.hy)*180/Math.PI+360)%360;
{const straight=bearing(at(150)),opposite=bearing(at(1000)),apart=Math.abs(((straight-opposite+540)%360)-180);
 console.log(`reta dos boxes ${straight.toFixed(0)}°, Reta Oposta ${opposite.toFixed(0)}°: ${apart.toFixed(0)}° de diferença`);
 assert(apart>140,'"apontando para o lado contrário"');
 const drop=at(HISTORY.places.new['Fim da reta']).z-at(470).z;assert(drop>12&&drop<17,`"desce uns quatorze metros" (${drop.toFixed(1)})`);
 const gap=at(260).z-at(720).z;assert(gap>16&&gap<24,`"uns vinte metros mais baixa" (${gap.toFixed(1)})`);}
{let backwards=0;for(const g of OLD_LAYOUT.segments)if(g.status==='invertido'&&Number.isFinite(g.current_from_s))backwards+=Math.abs(g.current_to_s-g.current_from_s);
 const share=backwards/data.meta.reconstructed_xy_m;console.log(`na contramão de 1940: ${(share*100).toFixed(0)}% da volta`);
 assert(share>.24&&share<.42,'"quase um terço da volta" percorrida de trás para frente');}
console.log('história do autódromo: ok');
