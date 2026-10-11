// Removes from a track file the buildings the game would draw on a band it keeps clear (track-clearance.js
// sceneryBands: the asphalt, the pit lane and garages, the grandstands with their margin, a bridge's sides): the
// same test as testar_circuitos_abertos.mjs (each oriented rectangle's corners, edge midpoints and centre), so the
// generator never has to copy the game's rules. gerar_floripa.py runs it after writing the file.
//   node scripts/circuitos/podar_edificios.mjs dados/pista_<id>.json
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const file=resolve(process.argv[2]);
const game=name=>import(pathToFileURL(resolve(import.meta.dirname,'../../teste/'+name)).href);
const {sceneryBands,bandClearance}=await game('track-clearance.js'),{billboardSpots}=await game('track-surface.js'),{marshalSpots,towerSpots}=await game('trackside.js'),{flagSpots}=await game('trackside-flags.js');
const text=readFileSync(file,'utf8'),data=JSON.parse(text);
data.meta.id??=file.match(/pista_(\w+)\.json$/)?.[1];
const bands=sceneryBands(data),b=data.scenery.buildings,cols=Object.fromEntries(b.columns.map((k,i)=>[k,i])),kept=[],dropped={};
// And the trackside furniture the game sets behind the walls: billboards (up to 14 m wide), marshal posts, TV towers, flag poles.
const posts=[...billboardSpots(data).map(q=>({x:q.x,y:q.y,r:9,name:'outdoor'})),...marshalSpots(data).map(q=>({x:q.x,y:q.y,r:4,name:'fiscal'})),...towerSpots(data).map(q=>({x:q.x,y:q.y,r:6,name:'torre_tv'})),...flagSpots(data).filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)).map(q=>({x:q.x,y:q.y,r:1.5,name:'bandeira'}))];
for(const it of b.items){
 const x=it[cols.x],y=it[cols.y],w=it[cols.w],d=it[cols.d],c=Math.cos(it[cols.heading]),s=Math.sin(it[cols.heading]);let hit=null;
 for(const [u,v] of [[0,0],[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[1,0],[0,1],[-1,0]]){const q=bandClearance(bands,x+c*u*w/2-s*v*d/2,y+s*u*w/2+c*v*d/2);if(q.distance<=.05){hit=q.band;break;}}
 // The rectangle against each post's circle: its nearest point to the centre.
 if(!hit)for(const p of posts){const dx=p.x-x,dy=p.y-y,lu=Math.max(-w/2,Math.min(w/2,dx*c+dy*s)),lv=Math.max(-d/2,Math.min(d/2,-dx*s+dy*c));if(Math.hypot(dx*c+dy*s-lu,-dx*s+dy*c-lv)<p.r){hit=p.name;break;}}
 if(hit)dropped[hit]=(dropped[hit]??0)+1;else kept.push(it);
}
b.items=kept;writeFileSync(file,JSON.stringify(data));
console.log(`edificacoes podadas pelas faixas do jogo: ${JSON.stringify(dropped)}; ficam ${kept.length}`);
