// What happened to the accounts and the records, for the admin panel (admin.js): kept EVENT_DAYS, never the IP.
// An account's events go with the account (index.js deleteAccount); "conta_apagada" itself keeps no one.
import {catchUp} from './totais.js';
export const EVENT_DAYS=90;
export const HOUR=3600000;
// The statement that records one (for a batch beside the change it tells of). detalhe: a small object.
export const event=(env,tipo,usuario=null,detalhe=null)=>env.DB.prepare('INSERT INTO eventos (quando,tipo,usuario_id,detalhe) VALUES (?,?,?,?)')
 .bind(Date.now(),tipo,usuario,detalhe?JSON.stringify(detalhe):null);
// Events, laps and races past their time go (run on each sign-in: often enough, and cheap with the indexes); the races
// and laps no total has yet are added to the pilots' totals first (totais.js catchUp: those an older Worker wrote).
export const forgetOld=env=>[...catchUp(env),...['eventos','voltas','corridas'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE quando<?`).bind(Date.now()-EVENT_DAYS*86400000))];
// How many events of these kinds an account had in the last `ms`. Every write an account asks for leaves one, so
// this is what it has spent (the server keeps the count: nothing a browser sends, an old ticket included, resets it).
export const recent=(env,usuario,tipos,ms)=>env.DB.prepare(`SELECT COUNT(*) AS n FROM eventos WHERE usuario_id=? AND quando>? AND tipo IN (${tipos.map(()=>'?').join(',')})`)
 .bind(usuario,Date.now()-ms,...tipos).first('n');
