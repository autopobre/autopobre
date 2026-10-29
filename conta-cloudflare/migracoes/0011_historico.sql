-- Each pilot's history, for the admin panel's pilots and a ranking one day (src/recordes.js ticket, judge, result;
-- src/admin.js). Columns and tables only added: both Workers may run different versions on this database.
-- A race, as the game declares it on its ticket: its kind (corrida: Modo Corrida's whole grid; 1x1; campeonato: a
-- championship round; historia: Modo História; treino: practice alone, no flag), the rivals' level (facil, medio, alto,
-- impossivel), the cars in it and its laps. And how it ended, as the game declares it at the flag (one result a race,
-- checked only for being possible: the laps crossed, the time they took): its place, finished or not (towed in).
-- NULL: a race from before, or one with no result (practice, left before the flag, begun again).
ALTER TABLE corridas ADD COLUMN tipo TEXT;
ALTER TABLE corridas ADD COLUMN nivel TEXT;
ALTER TABLE corridas ADD COLUMN carros INTEGER;
ALTER TABLE corridas ADD COLUMN voltas INTEGER;
ALTER TABLE corridas ADD COLUMN posicao INTEGER;
ALTER TABLE corridas ADD COLUMN terminou INTEGER;
ALTER TABLE corridas ADD COLUMN resultado_em INTEGER;
-- The totals (src/totais.js), kept as long as the account (the races and laps themselves go after EVENT_DAYS): per
-- circuit, car, kind and level ('' when the game did not say: before this, or an older game), the races (each time on
-- track, under the races' hourly limit), the laps sent and how many were checked, the results (races with a flag or
-- towed in), those finished, the wins and podiums among them and the sum of their places (for an average).
CREATE TABLE totais (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  circuito TEXT NOT NULL,
  carro TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  nivel TEXT NOT NULL DEFAULT '',
  corridas INTEGER NOT NULL DEFAULT 0,
  voltas INTEGER NOT NULL DEFAULT 0,
  conferidas INTEGER NOT NULL DEFAULT 0,
  resultados INTEGER NOT NULL DEFAULT 0,
  terminadas INTEGER NOT NULL DEFAULT 0,
  vitorias INTEGER NOT NULL DEFAULT 0,
  podios INTEGER NOT NULL DEFAULT 0,
  soma_posicoes INTEGER NOT NULL DEFAULT 0,
  primeira_em INTEGER NOT NULL,
  ultima_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, circuito, carro, tipo, nivel)
);
-- A race or lap already in the totals: 1. The Workers from now write it with the row and its totals in one batch; a row
-- with none (a Worker from before wrote it: the main link's runs older code until it gets this one, and a rollback would
-- too) is added by the next catch-up (src/totais.js catchUp: at each sign-in, before the logs' old rows go, and as the
-- admin panel reads the pilots), then marked.
ALTER TABLE corridas ADD COLUMN somada INTEGER;
ALTER TABLE voltas ADD COLUMN somada INTEGER;
CREATE INDEX corridas_a_somar ON corridas(id) WHERE somada IS NULL;
CREATE INDEX voltas_a_somar ON voltas(id) WHERE somada IS NULL;
-- What the races' and laps' logs hold now (since 10-26) starts the totals: the catch-up itself, once.
INSERT INTO totais (usuario_id,circuito,carro,tipo,nivel,corridas,primeira_em,ultima_em)
 SELECT usuario_id,circuito,carro,COALESCE(tipo,''),COALESCE(nivel,''),COUNT(*),MIN(quando),MAX(quando) FROM corridas WHERE somada IS NULL
 GROUP BY usuario_id,circuito,carro,COALESCE(tipo,''),COALESCE(nivel,'')
 ON CONFLICT(usuario_id,circuito,carro,tipo,nivel) DO UPDATE SET corridas=corridas+excluded.corridas,primeira_em=MIN(primeira_em,excluded.primeira_em),ultima_em=MAX(ultima_em,excluded.ultima_em);
UPDATE corridas SET somada=1 WHERE somada IS NULL;
INSERT INTO totais (usuario_id,circuito,carro,tipo,nivel,voltas,conferidas,primeira_em,ultima_em)
 SELECT usuario_id,circuito,COALESCE(carro,'opala'),'','',COUNT(*),SUM(resultado IN ('recorde','conferida')),MIN(quando),MAX(quando) FROM voltas WHERE somada IS NULL
 GROUP BY usuario_id,circuito,COALESCE(carro,'opala')
 ON CONFLICT(usuario_id,circuito,carro,tipo,nivel) DO UPDATE SET voltas=voltas+excluded.voltas,conferidas=conferidas+excluded.conferidas,primeira_em=MIN(primeira_em,excluded.primeira_em),ultima_em=MAX(ultima_em,excluded.ultima_em);
UPDATE voltas SET somada=1 WHERE somada IS NULL;
