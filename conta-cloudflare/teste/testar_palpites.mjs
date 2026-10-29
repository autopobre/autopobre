// The palpites (src/palpites.js, src/email.js), on a clock the test moves: the e-mail asked from Google only from the
// palpites page and kept sealed, a guess (signed in, nickname, e-mail, three positions, once, before the close, not again
// after deleting the account), the close, the result and closing time (only while open) set by who runs the palpites (an
// admin, or an account the database marks), the podium (1st place all three, then two or more, then one or more, a tie
// to who guessed first, nobody twice, a disqualified guess never), no e-mail in the public view, and the pilot's data
// and its deletion, the sponsors' offers (optional, ticked with the guess or on their own, undone, listed for the admin
// only). Without EMAIL_KEY the palpites stay shut and the sign-in asks for nothing more.
import assert from 'node:assert/strict';
import {startLocal} from './local.mjs';

const realNow=Date.now;let now=Date.parse('2026-10-29T12:00:00Z');Date.now=()=>now;
const CLOSES=Date.parse('2026-10-31T07:30:00-03:00');
const local=await startLocal({port:0}),ORIGIN=`http://127.0.0.1:${local.port}`;
let passed=0;
const check=(name,fn)=>fn().then(()=>{passed++;console.log('ok',name);});
const sql=(text,...args)=>local.DB.sqlite.prepare(text).all(...args).map(row=>({...row}));

function browser(origin=ORIGIN){
 const jar=new Map();
 const go=async(url,init={})=>{
  const headers=new Headers(init.headers);if(jar.size)headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const r=await fetch(new URL(url,origin),{...init,headers,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const [pair]=c.split('; '),i=pair.indexOf('=');c.includes('Max-Age=0')?jar.delete(pair.slice(0,i)):jar.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
 const post=async(path,body,o=origin)=>{const r=await go(path,{method:'POST',headers:{Origin:o,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json().catch(()=>({}))};};
 const get=async path=>{const r=await go(path);return {status:r.status,...await r.json().catch(()=>({}))};};
 return {go,post,get,jar};
}
// Signs in through the stand-in Google; withEmail: from the palpites page (?email=1). Gives the scope Google was asked.
async function signIn(b,sub,{withEmail=true,email=null,verified=true}={}){
 Object.assign(local.google.next,{sub,email,verified});
 const start=await b.go('/api/conta/entrar?volta=%2Fpalpites'+(withEmail?'&email=1':''));
 const scope=new URL(start.headers.get('Location')).searchParams.get('scope');
 const fromGoogle=await b.go(start.headers.get('Location'));await b.go(fromGoogle.headers.get('Location'));
 Object.assign(local.google.next,{email:null,verified:true});
 return scope;
}
async function pilot(sub,nickname,options){const b=browser();await signIn(b,sub,options);if(nickname)assert.equal((await b.post('/api/conta/apelido',{apelido:nickname})).status,200);return b;}
const pick=(treino,corrida1,corrida2)=>({treino,corrida1,corrida2});

await check('without EMAIL_KEY: shut, and the sign-in asks Google for nothing more',async()=>{
 const shut=await startLocal({port:0,emailKey:null}),o=`http://127.0.0.1:${shut.port}`,b=browser(o);
 shut.google.next.sub='500000000000000000099';
 const start=await b.go('/api/conta/entrar?email=1');assert.equal(new URL(start.headers.get('Location')).searchParams.get('scope'),'openid');
 const fromGoogle=await b.go(start.headers.get('Location'));await b.go(fromGoogle.headers.get('Location'));
 assert.equal((await b.post('/api/conta/apelido',{apelido:'Sem Chave'},o)).status,200);
 const view=await b.get('/api/palpites');assert.equal(view.bolao.pronto,false);assert.equal(view.conta.email,null);
 const r=await b.post('/api/palpites',pick(1,1,1),o);assert.equal(r.status,503);assert.match(r.erro,/ainda não abriram/);
 assert.equal(shut.DB.sqlite.prepare('SELECT email FROM usuarios').get().email,null);
 await shut.close();
});

await check('the e-mail: asked only from the palpites, verified, kept sealed, never dropped by a game sign-in',async()=>{
 const b=browser();
 assert.equal(await signIn(b,'500000000000000000001',{withEmail:false}),'openid','the game asks for openid alone');
 assert.equal(sql("SELECT email FROM usuarios WHERE google_sub='500000000000000000001'")[0].email,null);
 assert.equal(await signIn(b,'500000000000000000001',{email:'Ana.Volta@Exemplo.com.br'}),'openid email');
 const kept=sql("SELECT email,email_em FROM usuarios WHERE google_sub='500000000000000000001'")[0];
 assert.match(kept.email,/^v1\./);assert.ok(!/ana|exemplo/i.test(kept.email),'sealed, not in the clear');assert.equal(kept.email_em,now);
 assert.equal((await b.get('/api/palpites')).conta.email,'a•••@exemplo.com.br');
 await signIn(b,'500000000000000000001',{withEmail:false});
 assert.equal(sql("SELECT email FROM usuarios WHERE google_sub='500000000000000000001'")[0].email,kept.email,'a sign-in without it keeps it');
 const unverified=browser();await signIn(unverified,'500000000000000000002',{email:'falso@exemplo.com.br',verified:false});
 assert.equal(sql("SELECT email FROM usuarios WHERE google_sub='500000000000000000002'")[0].email,null,'an address Google did not confirm is not kept');
});

const ana=await pilot('500000000000000000001','Ana Volta',{email:'Ana.Volta@Exemplo.com.br'});
await check('a guess: signed in, nickname, e-mail, three positions, once',async()=>{
 const out=browser();
 assert.equal((await out.post('/api/palpites',pick(1,2,3))).status,401);
 const view=await out.get('/api/palpites');
 assert.deepEqual(view.bolao,{id:'oldstock-chapeco-2026',titulo:'Old Stock Race · Chapecó · 31/10 e 01/11',fecha_em:new Date(CLOSES).toISOString(),aberto:true,pronto:true,resultado:null});
 assert.equal(view.total,0);assert.equal(view.conta,undefined);assert.equal(view.galera,undefined,'how the guesses spread stays hidden while open');
 const noName=await pilot('500000000000000000003',null,{email:'sem.nome@exemplo.com.br'});
 const r1=await noName.post('/api/palpites',pick(1,2,3));assert.equal(r1.status,409);assert.equal(r1.falta,'apelido');
 const noEmail=await pilot('500000000000000000004','Sem Email',{withEmail:false});
 const r2=await noEmail.post('/api/palpites',pick(1,2,3));assert.equal(r2.status,409);assert.equal(r2.falta,'email');
 for(const bad of [pick(14,1,1),pick(1,-1,1),pick(1,1,'3'),{treino:1,corrida1:1},pick(1.5,1,1)])assert.equal((await ana.post('/api/palpites',bad)).status,400,JSON.stringify(bad));
 assert.equal((await ana.post('/api/palpites',pick(5,4,0),'https://outro.exemplo')).status,403,'another origin');
 const done=await ana.post('/api/palpites',pick(5,4,0));assert.equal(done.status,200);
 assert.deepEqual(done.palpite,{treino:5,corrida1:4,corrida2:0,quando:new Date(now).toISOString(),ordem:1});
 assert.equal(done.total,1);
 now+=1000;const again=await ana.post('/api/palpites',pick(1,1,1));assert.equal(again.status,409);assert.match(again.erro,/definitivo/);
 assert.deepEqual(sql("SELECT treino,corrida1,corrida2 FROM palpites")[0],{treino:5,corrida1:4,corrida2:0},'the first stands');
 assert.deepEqual(JSON.parse(sql("SELECT detalhe FROM eventos WHERE tipo='palpite'")[0].detalhe),{bolao:'oldstock-chapeco-2026',treino:5,corrida1:4,corrida2:0});
});

await check('deleting the account makes no room for a second guess: a keyed mark of the Google account until the close',async()=>{
 const fabi=await pilot('500000000000000000011','Fabi Volta');
 now+=1000;assert.equal((await fabi.post('/api/palpites',pick(7,7,7))).status,200);
 assert.equal((await fabi.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 const marks=sql('SELECT bolao,conta FROM palpites_apagados');
 assert.equal(marks.length,1);assert.equal(marks[0].bolao,'oldstock-chapeco-2026');assert.ok(!marks[0].conta.includes('500000000000000000011'),'never the Google id');
 await signIn(fabi,'500000000000000000011');assert.equal((await fabi.post('/api/conta/apelido',{apelido:'Fabi Volta'})).status,200);
 const again=await fabi.post('/api/palpites',pick(1,1,1));assert.equal(again.status,409);assert.match(again.erro,/já palpitou/);
 assert.equal(sql("SELECT COUNT(*) AS n FROM palpites p JOIN usuarios u ON u.id=p.usuario_id WHERE u.google_sub='500000000000000000011'")[0].n,0);
 assert.equal((await fabi.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.equal(sql('SELECT COUNT(*) AS n FROM palpites_apagados')[0].n,1,'no guess, no new mark');
});

// The line, in the order they guess: Ana (5,4,0) above; Bia hits all three later; Caio two; Duda one; Eli none.
const bia=await pilot('500000000000000000005','Bia Reta'),caio=await pilot('500000000000000000006','Caio Curva'),duda=await pilot('500000000000000000007','Duda Box'),eli=await pilot('500000000000000000008','Eli Zebra');
const boss=await pilot('500000000000000000009','Chefe Pista');sql("UPDATE usuarios SET admin=1 WHERE google_sub='500000000000000000009'");
const RESULT=pick(5,4,0);
await check('the close, the result and the podium: who guessed first wins a tie',async()=>{
 for(const [b,g] of [[bia,pick(5,4,0)],[caio,{...pick(5,4,7),ofertas:true}],[duda,pick(2,4,9)],[eli,{...pick(1,1,1),ofertas:false}]]){now+=60000;assert.equal((await b.post('/api/palpites',g)).status,200);}
 assert.equal((await eli.get('/api/palpites')).palpite.ordem,5);
 assert.equal((await ana.post('/api/admin/bolao',{resultado:RESULT})).status,403,'a pilot is not the admin');
 const early=await boss.post('/api/admin/bolao',{resultado:RESULT});assert.equal(early.status,409);assert.match(early.erro,/ainda estão abertos/);
 now=CLOSES;
 assert.equal((await boss.post('/api/palpites',pick(1,1,1))).status,403,'closed at qualifying');
 const closed=await eli.get('/api/palpites');assert.equal(closed.bolao.aberto,false);assert.equal(closed.total,5);
 assert.deepEqual(closed.galera.treino,[0,1,1,0,0,3,0,0,0,0,0,0,0,0]);assert.equal(closed.galera.corrida2[0],2,'0: did not finish');
 const set=await boss.post('/api/admin/bolao',{resultado:RESULT});assert.equal(set.status,200);
 assert.deepEqual(set.podio.map(w=>[w.lugar,w.apelido,w.acertos,w.email]),[[1,'Ana Volta',3,'ana.volta@exemplo.com.br'],[2,'Bia Reta',3,'piloto0005@exemplo.com.br'],[3,'Caio Curva',2,'piloto0006@exemplo.com.br']]);
 assert.equal(set.palpites[3].email,'piloto0007@exemplo.com.br','the panel shows who guessed, whole e-mail');assert.equal(set.palpites[3].acertos,1);
 const pub=await browser().get('/api/palpites');
 assert.deepEqual(pub.podio,[{lugar:1,apelido:'Ana Volta',acertos:3},{lugar:2,apelido:'Bia Reta',acertos:3},{lugar:3,apelido:'Caio Curva',acertos:2}]);
 assert.deepEqual(pub.bolao.resultado,RESULT);
 assert.ok(!JSON.stringify(pub).includes('@'),'no e-mail in the public view');
 const mine=await caio.get('/api/palpites');assert.equal(mine.palpite.acertos,2);assert.equal(mine.palpite.lugar,3);
 assert.equal((await eli.get('/api/palpites')).palpite.lugar,undefined);
});

await check('a guess taken out never wins, and the next in line moves up',async()=>{
 const id=sql("SELECT p.id FROM palpites p JOIN usuarios u ON u.id=p.usuario_id WHERE u.apelido='Ana Volta'")[0].id;
 assert.equal((await ana.post('/api/admin/palpite',{palpite:id,desclassificar:true})).status,403);
 const out=await boss.post('/api/admin/palpite',{palpite:id,desclassificar:true});assert.equal(out.status,200);
 assert.deepEqual(out.podio.map(w=>[w.lugar,w.apelido]),[[1,'Bia Reta'],[2,'Caio Curva'],[3,'Duda Box']]);
 const anaView=await ana.get('/api/palpites');assert.equal(anaView.palpite.desclassificado,true);assert.equal(anaView.palpite.lugar,undefined);assert.equal(anaView.total,4);
 assert.equal((await boss.post('/api/admin/palpite',{palpite:id,desclassificar:false})).podio[0].apelido,'Ana Volta','put back');
 assert.deepEqual(sql("SELECT detalhe FROM eventos WHERE tipo='desclassificado' ORDER BY id").map(e=>JSON.parse(e.detalhe).por),['Chefe Pista','Chefe Pista'],'and by whom');
});

await check('the closing time moves only while open (closed, never again), and the result is cleared and set again',async()=>{
 const reopen=await boss.post('/api/admin/bolao',{fecha_em:new Date(now+3600000).toISOString()});assert.equal(reopen.status,409);assert.match(reopen.erro,/não muda mais/);
 assert.equal((await boss.post('/api/admin/bolao',{fecha_em:'amanhã'})).status,409);
 assert.equal((await boss.post('/api/admin/bolao',{resultado:null,fecha_em:new Date(now+3600000).toISOString()})).status,409);
 assert.deepEqual(JSON.parse(sql('SELECT resultado FROM boloes')[0].resultado),RESULT,'nothing of it written');
 const cleared=await boss.post('/api/admin/bolao',{resultado:null});assert.equal(cleared.status,200);
 assert.equal(cleared.bolao.aberto,false);assert.equal(cleared.bolao.resultado,null);assert.deepEqual(cleared.podio,[]);
 assert.equal((await browser().get('/api/palpites')).podio,undefined);
 // Before the close (the clock two hours back): the time moves either way, and a result waits for the close.
 const at=now;now=CLOSES-2*3600000;
 assert.equal((await boss.post('/api/admin/bolao',{fecha_em:'amanhã'})).status,400);
 const moved=await boss.post('/api/admin/bolao',{fecha_em:new Date(CLOSES+3600000).toISOString()});assert.equal(moved.status,200);assert.equal(moved.bolao.aberto,true);
 assert.equal((await boss.post('/api/admin/bolao',{resultado:RESULT})).status,409,'no result while open');
 assert.equal((await boss.post('/api/admin/bolao',{fecha_em:new Date(CLOSES).toISOString()})).status,200);
 now=at;
 const back=await boss.post('/api/admin/bolao',{resultado:RESULT});assert.equal(back.status,200);assert.equal(back.podio.length,3);
 const logged=sql("SELECT detalhe FROM eventos WHERE tipo='bolao' ORDER BY id").map(e=>JSON.parse(e.detalhe));
 assert.deepEqual(logged.at(-2),{bolao:'oldstock-chapeco-2026',fecha_em:new Date(CLOSES).toISOString()});assert.deepEqual(logged.at(-1),{bolao:'oldstock-chapeco-2026',resultado:RESULT});
 const panel=await boss.get('/api/admin/palpites');assert.equal(panel.palpites.length,5);assert.equal(panel.pronto,true);
 assert.equal(panel.palpites[0].conta_em,new Date(sql("SELECT criado_em FROM usuarios WHERE apelido='Ana Volta'")[0].criado_em).toISOString(),'when each account was made');
 assert.equal((await ana.get('/api/admin/palpites')).status,403);assert.equal((await browser().get('/api/admin/palpites')).status,401);
});

await check('who runs the palpites: an admin, or an account the database marks, and no one else',async()=>{
 const stevan=await pilot('500000000000000000010','Stevan Teste');
 assert.equal((await stevan.get('/api/admin/palpites')).status,403,'not yet marked');
 assert.equal((await stevan.get('/api/conta/eu')).conta.palpites,undefined);
 const id=sql("SELECT id FROM usuarios WHERE google_sub='500000000000000000010'")[0].id;
 assert.equal((await ana.post('/api/admin/gerente-palpites',{usuario:id,gerente:true})).status,403,'only an admin gives it');
 assert.equal((await boss.post('/api/admin/gerente-palpites',{usuario:id,gerente:'sim'})).status,400);
 assert.deepEqual(await boss.post('/api/admin/gerente-palpites',{usuario:id,gerente:true}),{status:200,usuario:{id,gerente_palpites:true}});
 assert.equal((await boss.get('/api/admin/usuarios')).usuarios.find(u=>u.id===id).gerente_palpites,1);
 const me=(await stevan.get('/api/conta/eu')).conta;assert.equal(me.palpites,true);assert.equal(me.admin,undefined,'the palpites only, not the admin panel');
 const panel=await stevan.get('/api/admin/palpites');assert.equal(panel.status,200);assert.equal(panel.palpites[0].email,'ana.volta@exemplo.com.br');
 assert.equal((await stevan.post('/api/admin/bolao',{resultado:RESULT})).status,200);
 assert.equal((await stevan.post('/api/admin/bolao',{fecha_em:new Date(now+3600000).toISOString()})).status,409,'closed for him too');
 assert.equal((await stevan.go('/api/admin/ofertas')).status,200);
 assert.equal((await stevan.get('/api/admin/resumo')).status,403,'the admin panel stays the admins\'');
 assert.equal((await boss.get('/api/conta/eu')).conta.palpites,true,'an admin runs them too');
 assert.equal((await ana.get('/api/conta/eu')).conta.palpites,undefined);
 const refused=await ana.get('/api/admin/palpites');assert.equal(refused.status,403);assert.match(refused.erro,/quem cuida dos palpites/);
 assert.equal((await boss.post('/api/admin/gerente-palpites',{usuario:id,gerente:false})).status,200);
 assert.equal((await stevan.get('/api/admin/palpites')).status,403,'taken back');
 assert.deepEqual(sql("SELECT detalhe FROM eventos WHERE tipo='gerente_palpites' ORDER BY id").map(e=>JSON.parse(e.detalhe).gerente),[true,false]);
 await boss.post('/api/admin/gerente-palpites',{usuario:id,gerente:true});
});

await check("the sponsors' offers: optional, ticked with the guess or on their own, undone, listed for the admin only",async()=>{
 assert.equal((await bia.get('/api/palpites')).conta.ofertas,false,'unticked unless ticked');
 assert.equal((await caio.get('/api/palpites')).conta.ofertas,true,'ticked with the guess');
 assert.equal((await browser().post('/api/palpites/ofertas',{aceito:true})).status,401);
 assert.equal((await eli.post('/api/palpites/ofertas',{aceito:'sim'})).status,400);
 assert.deepEqual(await eli.post('/api/palpites/ofertas',{aceito:true}),{status:200,ofertas:true});
 assert.deepEqual(await eli.post('/api/palpites/ofertas',{aceito:true}),{status:200,ofertas:true},'the same again writes nothing');
 assert.equal(sql("SELECT COUNT(*) AS n FROM eventos e JOIN usuarios u ON u.id=e.usuario_id WHERE e.tipo='ofertas' AND u.apelido='Eli Zebra'")[0].n,1);
 const csv=async b=>{const r=await b.go('/api/admin/ofertas');return {status:r.status,type:r.headers.get('content-type'),text:await r.text()};};
 let list=await csv(boss);assert.equal(list.status,200);assert.match(list.type,/^text\/csv/);
 assert.equal(list.text,['apelido,email,aceitou_em',...sql("SELECT apelido,ofertas_em FROM usuarios WHERE ofertas_em IS NOT NULL ORDER BY ofertas_em")
  .map(u=>`"${u.apelido}","piloto${u.apelido==='Caio Curva'?'0006':'0008'}@exemplo.com.br","${new Date(u.ofertas_em).toISOString()}"`),''].join('\r\n'));
 assert.deepEqual(sql("SELECT apelido FROM usuarios WHERE ofertas_em IS NOT NULL ORDER BY ofertas_em").map(u=>u.apelido),['Caio Curva','Eli Zebra']);
 assert.equal((await eli.post('/api/palpites/ofertas',{aceito:false})).ofertas,false);
 list=await csv(boss);assert.ok(list.text.includes('Caio Curva')&&!list.text.includes('Eli Zebra'),'unticked: off the list');
 assert.equal((await csv(ana)).status,403);assert.equal((await csv(browser())).status,401);
 const panel=await boss.get('/api/admin/palpites');assert.equal(panel.ofertas,1);
 assert.deepEqual(panel.palpites.map(p=>p.ofertas),[false,false,true,false,false]);
 const r=await caio.go('/api/conta/meus-dados');assert.ok((await r.json()).conta.aceitou_ofertas_dos_patrocinadores_em);
 // An address a spreadsheet would take for a formula goes in as text.
 const odd=await pilot('500000000000000000013','Gil Planilha',{email:'=1+1@exemplo.com.br'});
 assert.equal((await odd.post('/api/palpites/ofertas',{aceito:true})).status,200);
 assert.ok((await csv(boss)).text.includes(`"Gil Planilha","'=1+1@exemplo.com.br","`));
 assert.equal((await odd.post('/api/palpites/ofertas',{aceito:false})).status,200);
});

await check("the pilot's data carries the e-mail and the guess, and deleting the account takes both",async()=>{
 const r=await duda.go('/api/conta/meus-dados'),data=await r.json();
 assert.equal(data.conta.email,'piloto0007@exemplo.com.br');
 assert.deepEqual(data.palpites,[{fim_de_semana:'oldstock-chapeco-2026',quando:data.palpites[0].quando,treino:2,corrida1:4,corrida2:9}]);
 assert.equal(sql('SELECT COUNT(*) AS n FROM palpites_apagados')[0].n,0,'the closed weekend\'s mark went at a sign-in after the close');
 assert.equal((await duda.post('/api/conta/apagar',{confirmar:'APAGAR'})).status,200);
 assert.equal(sql('SELECT COUNT(*) AS n FROM palpites_apagados')[0].n,0,'deleted after the close: no mark (no guess can come)');
 assert.equal(sql("SELECT COUNT(*) AS n FROM palpites p LEFT JOIN usuarios u ON u.id=p.usuario_id WHERE u.id IS NULL")[0].n,0);
 assert.equal(sql("SELECT COUNT(*) AS n FROM usuarios WHERE google_sub='500000000000000000007'")[0].n,0);
 assert.equal((await browser().get('/api/palpites')).total,4);
});

Date.now=realNow;await local.close();
console.log(`palpites: ${passed} grupos ok`);
