// The bridge from autopobre.com.br to the test version, dev.autopobre.com.br (recordes-online.js). A browser keeps
// the records per address, so the test version cannot read the ones made here: it sends the pilot here once
// (after signing in with a nickname), and this page sends them back in the link, in the part after "#" that never
// reaches a server. Only the records and the menu's pilot go, nothing else. No account and no server here: this
// page is published at the main link's root by pages.yml, beside the saves migration.
//
// It goes back only to dev.autopobre.com.br, whatever the link asks: nobody can point it elsewhere to read
// someone's records. A check on this machine (this page on 127.0.0.1) goes back to the port it names.
export const DEV='https://dev.autopobre.com.br';
export const RECORDS_KEY='autopobre-records-v1',PILOTS_KEY='autopobre-pilots-v1',PARAM='recordes-do-principal';
const MAX_RECORDS=400,MAX_NAME=32;

const toBase64url=text=>{const bytes=new TextEncoder().encode(text);let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
// This address's records, compact: [circuit, mode, pilot, best lap in s, date], and the menu's pilot (the one
// chosen here). Anything malformed is left out; the test version checks them all again.
export function packRecords(storage){
 let list=[],pilot='';
 try{list=JSON.parse(storage?.getItem(RECORDS_KEY)||'[]');}catch{}
 try{pilot=text(JSON.parse(storage?.getItem(PILOTS_KEY)||'{}')?.selected,MAX_NAME);}catch{}
 const r=(Array.isArray(list)?list:[]).filter(x=>x&&typeof x.circuit==='string'&&typeof x.mode==='string'&&typeof x.name==='string'&&Number.isFinite(x.bestLap))
  .slice(0,MAX_RECORDS).map(x=>[text(x.circuit,32),text(x.mode,16),text(x.name,MAX_NAME),x.bestLap,text(x.date,40)]);
 return toBase64url(JSON.stringify({v:1,r,p:pilot}));
}
// Where to go back: the test version's page the pilot came from (a path of that site only).
export function backTo(hash,here){
 const q=new URLSearchParams(String(hash||'').replace(/^#/,'')),path=q.get('volta')??'/',port=q.get('porta')??'';
 const safe=path.length<=512&&/^\/(?![/\\])[^\s\\]*$/.test(path)?path:'/';
 const origin=here?.hostname==='127.0.0.1'&&/^\d{2,5}$/.test(port)?`http://127.0.0.1:${port}`:DEV;
 return origin+safe;
}
// The link back with the records added to its "#" part (which may already hold the game's own, like a room).
export function linkBack(back,packed){
 const i=back.indexOf('#');
 return i<0?`${back}#${PARAM}=${packed}`:`${back}${back.length>i+1?'&':''}${PARAM}=${packed}`;
}

if(globalThis.document?.documentElement?.hasAttribute('data-ponte')){
 let packed='0';try{packed=packRecords(globalThis.localStorage);}catch{}
 globalThis.location.replace(linkBack(backTo(globalThis.location.hash,globalThis.location),packed));
}
