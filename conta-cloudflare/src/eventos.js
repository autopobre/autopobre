// What happened to the accounts and the records, for the admin panel (admin.js): kept EVENT_DAYS, never the IP.
// An account's events go with the account (index.js deleteAccount); "conta_apagada" itself keeps no one.
export const EVENT_DAYS=90;
export const HOUR=3600000;
// The statement that records one (for a batch beside the change it tells of). detalhe: a small object.
export const event=(env,tipo,usuario=null,detalhe=null)=>env.DB.prepare('INSERT INTO eventos (quando,tipo,usuario_id,detalhe) VALUES (?,?,?,?)')
 .bind(Date.now(),tipo,usuario,detalhe?JSON.stringify(detalhe):null);
// Events past their time go (run on each sign-in: often enough, and cheap with the index).
export const forgetOld=env=>env.DB.prepare('DELETE FROM eventos WHERE quando<?').bind(Date.now()-EVENT_DAYS*86400000);
// How many events of these kinds an account had in the last `ms`. Every write an account asks for leaves one, so
// this is what it has spent (the server keeps the count: nothing a browser sends, an old ticket included, resets it).
export const recent=(env,usuario,tipos,ms)=>env.DB.prepare(`SELECT COUNT(*) AS n FROM eventos WHERE usuario_id=? AND quando>? AND tipo IN (${tipos.map(()=>'?').join(',')})`)
 .bind(usuario,Date.now()-ms,...tipos).first('n');
