// The records' bridge from autopobre.com.br to dev.autopobre.com.br (pista_interlagos/ponte/levar-recordes.js) and
// the test version's side of it (recordes-online.js unpackBridge, importOld): what is packed, that it goes back only
// to the test version, the link back keeping the game's own "#" part, the hop made once per tab, and the main
// link's records joining this address's in the one-time import (the pilot's best of each circuit and mode).
import assert from 'node:assert/strict';
import {packRecords,backTo,linkBack,DEV,PARAM} from '../ponte/levar-recordes.js';

const store=data=>{const m=new Map(Object.entries(data));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
globalThis.document={createElement:()=>({setAttribute(){},classList:{toggle(){}},hidden:true}),body:{append(){}}};
const {unpackBridge,OnlineRecords}=await import('../teste/recordes-online.js');

// What goes: the records, compact, and the pilot chosen there; nothing malformed.
const main=store({
 'autopobre-records-v1':JSON.stringify([
  {circuit:'interlagos',mode:'normal',name:'Bob',bestLap:101.25,bestRace:null,raceLaps:3,date:'2026-10-01T10:00:00Z'},
  {circuit:'cascavel',mode:'immersive',name:'Zé Ninguém',bestLap:88.5,bestRace:300,raceLaps:3,date:''},
  {circuit:'nada',mode:'normal',name:'Bob',bestLap:70},{circuit:'interlagos',mode:'normal',name:'Bob',bestLap:'rápido'},null,7]),
 'autopobre-pilots-v1':JSON.stringify({selected:'Bob',names:['Bob','Zé Ninguém']}),
 'autopobre-chave-grupo':'segredo'});
const packed=packRecords(main),back=unpackBridge(packed);
assert.match(packed,/^[\w-]+$/,'link-safe');
assert.deepEqual(back.records,[{circuit:'interlagos',mode:'normal',name:'Bob',bestLap:101.25,date:'2026-10-01T10:00:00Z'},{circuit:'cascavel',mode:'immersive',name:'Zé Ninguém',bestLap:88.5,date:''}]);
assert.equal(back.pilot,'Bob');assert.ok(!Buffer.from(packed,'base64url').toString().includes('segredo'),'only the records and the pilot');
assert.deepEqual(unpackBridge(packRecords(store({}))),{records:[],pilot:''});
for(const bad of ['','0','!!!',Buffer.from('{"v":2,"r":[]}').toString('base64url'),Buffer.from('[1,2]').toString('base64url')])assert.equal(unpackBridge(bad),null,bad);

// Where it goes back: the test version only.
const prod={hostname:'autopobre.com.br'},local={hostname:'127.0.0.1'};
assert.equal(backTo('#volta=%2Fpista%3Fx%3D1%23desafio%3Dsala',prod),DEV+'/pista?x=1#desafio=sala');
for(const evil of ['#volta=https://evil.example/','#volta=//evil.example/','#volta=/%5Cevil','#volta=/a b','#',''])assert.equal(backTo(evil,prod),DEV+'/',evil);
assert.equal(backTo('#volta=/&porta=8869',prod),DEV+'/','a port only counts on this machine');
assert.equal(backTo('#volta=/jogo/&porta=8869',local),'http://127.0.0.1:8869/jogo/');
assert.equal(backTo('#volta=/&porta=evil.example',local),DEV+'/');
assert.equal(linkBack(DEV+'/',packed),`${DEV}/#${PARAM}=${packed}`);
assert.equal(linkBack(DEV+'/#desafio=sala',packed),`${DEV}/#desafio=sala&${PARAM}=${packed}`,'the game\'s own # part stays');
assert.equal(linkBack(DEV+'/#',packed),`${DEV}/#${PARAM}=${packed}`);

// The test version's side: the hop once per tab, then the records of both addresses, the pilot's best of each.
const dev=store({'autopobre-records-v1':JSON.stringify([{circuit:'interlagos',mode:'normal',name:'Bob',bestLap:99,bestRace:null,raceLaps:3,date:''},
 {circuit:'chapeco',mode:'normal',name:'Bob',bestLap:95,bestRace:null,raceLaps:3,date:''}])});
const tab=store({}),sent=[];
globalThis.localStorage=dev;globalThis.sessionStorage=tab;
let replaced=null;globalThis.history={replaceState:(a,b,url)=>{replaced=url;}};
globalThis.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return new Response('{"importados":2}',{headers:{'Content-Type':'application/json'}});};
const online=new OnlineRecords({base:'/api/recordes',now:()=>0}),account={apelido:'Bob',desde:'2026-10-25T10:00:00.000Z'};
let went=null;const page=hash=>({hash,pathname:'/',search:'?intro=0',port:'8869',assign:url=>{went=url;}});
await online.importOld(account,['Bob'],'https://autopobre.com.br',page('#desafio=sala'));
assert.equal(went,'https://autopobre.com.br/levar-recordes.html#volta=%2F%3Fintro%3D0%23desafio%3Dsala','to the bridge, with the way back');
assert.equal(sent.length,0);assert.equal(tab.getItem('autopobre-ponte-recordes'),'1');
went=null;
await online.importOld(account,['Bob'],'https://autopobre.com.br',page(`#desafio=sala&${PARAM}=${packed}`));
assert.equal(went,null);assert.equal(replaced,'/?intro=0#desafio=sala','the link loses the records, keeps the room');
assert.equal(sent.length,1);
assert.deepEqual(sent[0].body.recordes.sort((a,b)=>a.circuito.localeCompare(b.circuito)),[
 {circuito:'chapeco',modo:'normal',volta_ms:95000,data:null},{circuito:'interlagos',modo:'normal',volta_ms:99000,data:null}],
 'the best of both addresses (99 here beats 101.25 there), the main link\'s other pilot left out');
assert.ok(JSON.parse(dev.getItem('autopobre-recordes-importados-v2'))[account.desde],'marked');
await online.importOld(account,['Bob'],'https://autopobre.com.br',page(''));assert.equal(sent.length,1,'never again');
// A tab whose hop did not come back (the bridge did not answer) sends this address's records alone, once.
const other={apelido:'Ana',desde:'2026-10-25T11:00:00.000Z'};tab.setItem('autopobre-ponte-recordes','1');went=null;
await online.importOld(other,['Ana'],'https://autopobre.com.br',page(''));assert.equal(went,null);assert.ok(JSON.parse(dev.getItem('autopobre-recordes-importados-v2'))[other.desde]);
// A bridge the server names elsewhere is never used: no hop, this address's records alone.
tab.removeItem('autopobre-ponte-recordes');went=null;const before=sent.length;
await online.importOld({apelido:'Caio',desde:'2026-10-25T12:00:00.000Z'},['Bob'],'https://evil.example',page(''));
assert.equal(went,null,'no hop to another site');assert.equal(sent.length,before+1);
console.log('Records bridge checks passed: packing, the way back to the test version only, the hop once, both addresses joined.');
