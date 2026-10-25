// The accounts Worker on this machine, for the checks and the local preview, without the Cloudflare
// runtime: src/index.js runs in Node (22.13+: node:sqlite), D1 is a small stand-in over SQLite with the
// migrations applied, and a stand-in Google lives under /falso-google/ (it signs nobody in for real: it
// hands back a code for the account the test picked, checks PKCE, and its ID token is unsigned, which
// the Worker accepts only because it trusts the token endpoint, as with Google's).
//
//   node teste/local.mjs [--porta 8788] [--origem http://127.0.0.1:8799] [--banco arquivo.sqlite] [--ponte http://127.0.0.1:PORTA]
//
// The origin is the page's (servidor.py passes /api/ on to this port), so the cookies and the Origin
// check work as on dev.autopobre.com.br.
import http from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

export const CLIENT_ID='cliente-de-teste.apps.googleusercontent.com',CLIENT_SECRET='segredo-de-teste-local';

// D1's API as the Worker uses it: prepare().bind().first()/all()/run(), and batch() in one transaction.
export function localD1(file=':memory:'){
 const db=new DatabaseSync(file);
 db.exec('PRAGMA foreign_keys=ON');
 const migrations=fileURLToPath(new URL('../migracoes/',import.meta.url));
 db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
  if(db.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(name))continue;
  db.exec(readFileSync(migrations+name,'utf8'));db.prepare('INSERT INTO d1_migrations VALUES (?)').run(name);
 }
 const statement=(sql,params=[])=>({
  bind:(...values)=>statement(sql,values),
  first:async column=>{const row=db.prepare(sql).get(...params);return row?column?row[column]:{...row}:null;},
  all:async()=>({success:true,results:db.prepare(sql).all(...params).map(row=>({...row}))}),
  run:async()=>{const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
  now:()=>db.prepare(sql).run(...params),
 });
 return {
  prepare:sql=>statement(sql),
  batch:async list=>{db.exec('BEGIN');try{const out=list.map(s=>s.now());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}},
  sqlite:db,
 };
}

// The stand-in Google: /auth sends the browser straight back with a code for `next.sub` (the test
// sets it, and may spoil the next token on purpose), /token trades it once for an ID token.
function fakeGoogle(){
 const codes=new Map(),next={sub:'100000000000000000001',spoil:null};
 const b64url=data=>Buffer.from(typeof data==='string'?data:JSON.stringify(data)).toString('base64url');
 return {
  next,
  async handle(request,url){
   // For a check driving a browser: the next account to come back (sub) and what to spoil (spoil).
   if(url.pathname==='/falso-google/proxima'){
    if(url.searchParams.has('sub'))next.sub=url.searchParams.get('sub');
    next.spoil=url.searchParams.get('spoil')||null;
    return Response.json(next);
   }
   if(url.pathname==='/falso-google/auth'){
    const p=url.searchParams,code=b64url(crypto.getRandomValues(new Uint8Array(16)));
    if(p.get('client_id')!==CLIENT_ID||p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256')return new Response('pedido inválido',{status:400});
    codes.set(code,{sub:next.sub,nonce:p.get('nonce'),challenge:p.get('code_challenge'),redirect:p.get('redirect_uri'),scope:p.get('scope')});
    const back=new URL(p.get('redirect_uri')),spoil=next.spoil;
    if(['cancel','state'].includes(spoil))next.spoil=null;
    if(spoil==='cancel')back.search=new URLSearchParams({error:'access_denied',state:p.get('state')}).toString();
    else back.search=new URLSearchParams({code,state:spoil==='state'?'outro-estado':p.get('state')}).toString();
    return new Response(null,{status:302,headers:{Location:back.href}});
   }
   if(url.pathname==='/falso-google/token'&&request.method==='POST'){
    const p=new URLSearchParams(await request.text()),grant=codes.get(p.get('code'));codes.delete(p.get('code'));
    const challenge=grant&&Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.get('code_verifier')??''))).toString('base64url');
    if(!grant||p.get('client_id')!==CLIENT_ID||p.get('client_secret')!==CLIENT_SECRET||p.get('redirect_uri')!==grant.redirect||challenge!==grant.challenge)
     return Response.json({error:'invalid_grant'},{status:400});
    const now=Math.floor(Date.now()/1000),spoil=next.spoil;next.spoil=null;
    const claims={iss:'https://accounts.google.com',aud:CLIENT_ID,sub:grant.sub,nonce:grant.nonce,iat:now,exp:now+3600,
     ...(spoil==='nonce'&&{nonce:'outro-nonce'}),...(spoil==='aud'&&{aud:'outro-cliente'}),...(spoil==='iss'&&{iss:'https://outro.example'}),...(spoil==='exp'&&{exp:now-600})};
    return Response.json({id_token:`${b64url({alg:'none'})}.${b64url(claims)}.`,scope:grant.scope});
   }
   return new Response('não encontrado',{status:404});
  },
 };
}

export async function startLocal({port=8788,origem,banco=':memory:',ponte=null}={}){
 const google=fakeGoogle(),DB=localD1(banco);
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,`http://127.0.0.1:${server.address().port}`);
   const chunks=[];for await(const c of req)chunks.push(c);
   const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(typeof v==='string')headers.set(k,v);
   const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const env={DB,ORIGEM:origem??`http://127.0.0.1:${server.address().port}`,GOOGLE_CLIENT_ID:CLIENT_ID,GOOGLE_CLIENT_SECRET:CLIENT_SECRET,
    GOOGLE_AUTH_URL:`http://127.0.0.1:${server.address().port}/falso-google/auth`,GOOGLE_TOKEN_URL:`http://127.0.0.1:${server.address().port}/falso-google/token`,...(ponte&&{PONTE_RECORDES:ponte})};
   const response=url.pathname.startsWith('/falso-google/')?await google.handle(request,url):await worker.fetch(request,env);
   const out={};for(const [k,v] of response.headers)if(k!=='set-cookie')out[k]=v;
   const cookies=response.headers.getSetCookie();if(cookies.length)out['set-cookie']=cookies;
   res.writeHead(response.status,out);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(String(error));}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
 return {port:server.address().port,google,DB,close:()=>new Promise(ok=>server.close(ok))};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const arg=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:undefined;};
 const local=await startLocal({port:Number(arg('--porta')??8788),origem:arg('--origem')??'http://127.0.0.1:8799',banco:arg('--banco'),ponte:arg('--ponte')});
 console.log(`Contas locais em http://127.0.0.1:${local.port} (origem ${arg('--origem')??'http://127.0.0.1:8799'}). Google de mentira: entra direto.`);
}
