// Proposes the copilot's callouts for a circuit (CALLOUTS in teste/corner-callouts.js) from its HUD sections and the
// bends of its centre line, with the timing the user set at Interlagos and Chapecó (10-27):
//   a corner at the end of a straight of 300 m or more, 30 m before it turns (the S do Senna);
//   a long one (150 m or more), as it begins (the Curva do Sol);
//   the others a little before the middle (18 m; the Pinheirinho);
//   a straight in its middle, halfway to the next corner (the Reta Oposta);
//   a section with bends but none where it begins, where it begins.
// On a city circuit (circuits.js: "circuito de rua") the sections are streets, begun halfway round the turn into them:
// each is named 20 m before the car gets there, as Waze names the street to turn into; one called "Reta…" in its middle.
// The words: the section's name before " · "; a hairpin, a fast or a looping corner keeps it (", grampo"); a numbered
// corner with a name of its own says the name (Velocitta's "Curva 3 · Caipirinha"); a name the lap has more than once
// says what sets each apart (Pampulha's "Orla · Praça de Iemanjá"), unless it is a street or a straight. Sections of the
// same words in a row are one callout. Prints the entries to paste (and check by ear), and a table to review them by.
//   node scripts/propor_chamadas_curvas.mjs <circuito>
import {loadLap} from './curvas_pista.mjs';

const id=process.argv[2];if(!id)throw new Error('usage: propor_chamadas_curvas.mjs <circuito>');
const lap=loadLap(id),{L,wrap,turn}=lap,all=lap.bends();
const ahead=(a,b)=>wrap(b-a);
const STREET=/^(Av\.|Avenida|Rua|Alameda|Praça|Largo|Túnel|Ponte|Estreito|Viaduto|Barragem|Minhocão)/;
// A name the lap has more than once, apart (Chapecó's two "Curva 7" in a row are one, and so are the straight the lap
// ends on and the one it begins with).
const named=lap.sections.filter(([,n],i,a)=>i===0||n!==a[i-1][1]);
if(named.length>1&&named.at(-1)[1]===named[0][1])named.pop();
const firsts=named.map(([,n])=>n.split(' · ')[0]);
const cap=t=>t[0].toUpperCase()+t.slice(1);
function words(name){
 const [first,...rest]=name.split(' · ');
 const proper=rest.find(p=>/^[A-ZÀ-Ý]/.test(p));
 if(/^Curvas? \d/.test(first)&&proper)return proper;
 if(firsts.filter(f=>f===first).length>1&&rest.length&&!STREET.test(first)&&!/^reta\b/i.test(first)){const r=rest[0].split(', ')[0];if(firsts.includes(cap(r))||r.length>2)return cap(r);}
 const kind=rest.join(', ').match(/\b(grampo|de alta|alta|o laço)\b/)?.[1];
 return kind?`${first}, ${kind==='alta'?'de alta':kind}`:first;
}
// Sections in a row saying the same are one (the lap's last and first too); where the others begin (also) their
// corner is spent with the first's (Velocitta's Curva 9 in the Curva do Guiga is not the Curva 10).
let parts=lap.sections.map(([s,n])=>({t0:s,name:n,say:words(n),also:[]}));
parts=parts.filter((p,i)=>{if(i>0&&p.say===parts[i-1].say){let k=i-1;while(k>0&&parts[k].say===parts[k-1].say)k--;parts[k].also.push(p.t0);return false;}return true;});
if(parts.length>1&&parts.at(-1).say===parts[0].say){parts[0]={...parts.at(-1),also:[...parts.at(-1).also,parts[0].t0,...parts[0].also]};parts.pop();parts.sort((a,b)=>a.t0-b.t0);}
parts.forEach((p,i)=>{p.t1=parts[(i+1)%parts.length].t0;p.len=ahead(p.t0,p.t1)||L;});

// A kink (under 45°, Chapecó's mid Reta 2) neither ends a straight nor makes a stretch bendy.
const big=all.filter(b=>Math.abs(b.total)>=45);
const prevBig=b=>big.filter(x=>x!==b).sort((x,y)=>ahead(x.end,b.start)-ahead(y.end,b.start))[0]??b;
const out=[],taken=new Set(),city=/circuito de rua/.test(lap.circuit.description);
for(const p of parts){
 if(city&&!/^reta\b/i.test(p.say)){out.push({p,s:Math.round(p.t0),at:Math.round(wrap(p.t0-20)),how:'rua: 20 m antes de entrar',kind:'place'});continue;}
 if(city){out.push({p,s:Math.round(p.t0),how:'reta: no meio',kind:'straight'});continue;}
 // The section's corner: the first bend of 45° or more not yet named that begins within 80 m of where the section
 // does (a kink before it is not the corner), else the biggest there. A straight is one by name.
 const straight=/^reta\b/i.test(p.say);
 const near=straight?[]:all.filter(b=>!taken.has(b)&&ahead(p.t0-80,b.start)<Math.min(160,p.len+60)).sort((a,b)=>ahead(p.t0-80,a.start)-ahead(p.t0-80,b.start));
 const first=near.find(b=>Math.abs(b.total)>=45)??[...near].sort((a,b)=>Math.abs(b.total)-Math.abs(a.total))[0];
 if(first){
  taken.add(first);
  for(const t0 of p.also){const b=all.find(b=>!taken.has(b)&&Math.abs(b.total)>=45&&ahead(t0-80,b.start)<160);if(b)taken.add(b);}
  const s=Math.round(first.start),before=ahead(prevBig(first).end,first.start),len=first.end-first.start;
  let at,how;
  if(before>=300){at=s-30;how=`fim de reta (${before.toFixed(0)} m)`;}
  else if(len>=150){at=s+25;how=`longa (${len} m), ao começar`;while(turn(at-10,at+10)<4&&at<first.mid)at+=2;}
  else{at=Math.max(s+5,Math.round(first.mid-18));how=`antes do meio (${first.mid})`;while(turn(at-10,at+10)<4&&at<first.mid)at+=2;}
  out.push({p,s,at:Math.round(wrap(at)),how,kind:'corner'});
  continue;
 }
 // Bendy: a bend of 45° or more begins in it, short of the next section's corner (its last 80 m).
 const bent=!straight&&big.some(b=>!taken.has(b)&&ahead(p.t0,b.start)<p.len-80);
 if(bent){out.push({p,s:Math.round(p.t0),at:Math.round(p.t0),how:'trecho com curvas: onde começa',kind:'place'});continue;}
 // A straight begins where the bend behind it ends.
 const behind=[...all].sort((a,b)=>ahead(a.end,p.t0+60)-ahead(b.end,p.t0+60))[0];
 out.push({p,s:Math.round(wrap(behind.end)),how:'reta: no meio',kind:'straight'});
}
out.sort((a,b)=>a.s-b.s);
// A straight is said halfway to the next callout's place; one shorter than 200 m is not said.
const list=out.filter((c,i)=>{if(c.kind!=='straight')return true;const next=out[(i+1)%out.length],len=ahead(c.s,next.s);c.at=Math.round(wrap(c.s+len/2));c.how+=` (${len.toFixed(0)} m)`;return len>=200;});
// In the order they are said (Floripa's Ponte Hercílio Luz, at the line, is named at the lap's end).
list.sort((a,b)=>a.at-b.at);
const slug=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const keys=new Set();
for(const c of list){let k=slug(c.p.say).slice(0,24),n=2;while(keys.has(k))k=`${slug(c.p.say).slice(0,22)}${n++}`;keys.add(k);c.key=k;}
console.log(`${lap.circuit.name}: ${list.length} falas, volta de ${L.toFixed(0)} m`);
for(const c of list)console.log(`  ${c.p.say.padEnd(32)} s ${String(c.s).padStart(5)}  at ${String(c.at).padStart(5)}  ${c.kind.padEnd(8)} ${c.how}  [${c.p.name} @ ${c.p.t0}]`);
list.forEach((c,i)=>{const n=list[(i+1)%list.length],d=ahead(c.at,n.at);if(d<45)console.log(`  ! ${c.p.say} e ${n.p.say}: só ${d.toFixed(0)} m entre as falas`);});
console.log(`\n ${id}:[`);
for(const c of list)console.log(`  {key:'${c.key}',s:${c.s},at:${c.at}${c.kind==='straight'?',straight:true':c.kind==='place'?',place:true':''},say:'${c.p.say}'},`);
console.log(' ],');
