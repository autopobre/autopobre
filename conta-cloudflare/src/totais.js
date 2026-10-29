// Each pilot's totals (migration 0011 totais), kept as long as the account: per circuit, car, kind and level ('' when the
// game did not say), the races, laps, checked laps, results, finished races, wins, podiums and the sum of the places.
// What writes a race or a lap (recordes.js) adds to them in the same batch and marks the row summed (somada=1). A row a
// Worker from before wrote has no mark (the main link's runs older code until it gets this one; a rollback would too):
// catchUp adds those, once, at each sign-in before the logs' old rows are forgotten (eventos.js forgetOld) and as the
// admin panel reads the pilots (admin.js).
const COUNTS=['corridas','voltas','conferidas','resultados','terminadas','vitorias','podios','soma_posicoes'];
const KEY='usuario_id,circuito,carro,tipo,nivel',ENDS='primeira_em=MIN(primeira_em,excluded.primeira_em),ultima_em=MAX(ultima_em,excluded.ultima_em)';

// The statement adding to a pilot's totals for a run's circuit, car, kind and level (t: the ticket, its u, c, k, t and l):
// the counts in `add` that are not zero (one at least), and the last time.
export function addTotals(env,t,add,now=Date.now()){
 const cols=COUNTS.filter(k=>add[k]);
 return env.DB.prepare(`INSERT INTO totais (${KEY},${cols.join(',')},primeira_em,ultima_em) VALUES (?,?,?,?,?,${cols.map(()=>'?').join(',')},?,?)
  ON CONFLICT(${KEY}) DO UPDATE SET ${cols.map(k=>`${k}=${k}+excluded.${k}`).join(',')},ultima_em=MAX(ultima_em,excluded.ultima_em)`)
  .bind(t.u,t.c,t.k,t.t??'',t.l??'',...cols.map(k=>add[k]),now,now);
}

// The races and laps no total has yet, added and marked, in one batch (a lap from before says no kind or level).
export const catchUp=env=>[
 env.DB.prepare(`INSERT INTO totais (${KEY},corridas,primeira_em,ultima_em)
  SELECT usuario_id,circuito,carro,COALESCE(tipo,''),COALESCE(nivel,''),COUNT(*),MIN(quando),MAX(quando) FROM corridas WHERE somada IS NULL
  GROUP BY usuario_id,circuito,carro,COALESCE(tipo,''),COALESCE(nivel,'')
  ON CONFLICT(${KEY}) DO UPDATE SET corridas=corridas+excluded.corridas,${ENDS}`),
 env.DB.prepare('UPDATE corridas SET somada=1 WHERE somada IS NULL'),
 env.DB.prepare(`INSERT INTO totais (${KEY},voltas,conferidas,primeira_em,ultima_em)
  SELECT usuario_id,circuito,COALESCE(carro,'opala'),'','',COUNT(*),SUM(resultado IN ('recorde','conferida')),MIN(quando),MAX(quando) FROM voltas WHERE somada IS NULL
  GROUP BY usuario_id,circuito,COALESCE(carro,'opala')
  ON CONFLICT(${KEY}) DO UPDATE SET voltas=voltas+excluded.voltas,conferidas=conferidas+excluded.conferidas,${ENDS}`),
 env.DB.prepare('UPDATE voltas SET somada=1 WHERE somada IS NULL')];
