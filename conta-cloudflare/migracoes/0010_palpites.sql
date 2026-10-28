-- The palpites (src/palpites.js; the page: pista_interlagos/teste/palpites.html): signed in with Google, a pilot guesses
-- where the real Opala 99 finishes a race weekend's qualifying and two races, for the podium. Columns and tables
-- only added: both Workers may run different versions on this database.
-- The e-mail, to tell the podium: asked from Google only when signing in from the palpites (scope email), sealed with the
-- Workers' shared EMAIL_KEY (src/email.js), never stored or shown in the clear. Gone with the account.
ALTER TABLE usuarios ADD COLUMN email TEXT;
ALTER TABLE usuarios ADD COLUMN email_em INTEGER;
-- When the pilot ticked "Aceito receber promoções e ofertas dos patrocinadores do Piloto Pobre" (palpites page; unticked by
-- default, optional, undone there at any time: NULL again).
ALTER TABLE usuarios ADD COLUMN ofertas_em INTEGER;
-- Who runs the palpites without being an administrator (the real Stevan): the palpites' panel only (src/palpites.js),
-- the guesses with their e-mails, the result, the podium. Set by hand (or the admin panel's button): UPDATE usuarios SET gerente_palpites=1 WHERE id=…
ALTER TABLE usuarios ADD COLUMN gerente_palpites INTEGER NOT NULL DEFAULT 0;
-- One row a weekend. fecha_em: when the guesses close (qualifying starts); resultado: the official positions as JSON
-- {treino,corrida1,corrida2}, set by the admin panel after the last race (0: no valid time / did not finish).
CREATE TABLE boloes (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  fecha_em INTEGER NOT NULL,
  resultado TEXT,
  resultado_em INTEGER
);
-- One guess an account and weekend, final once sent. quando decides a tie (who guessed first), then id.
-- desclassificado: taken out by the admin (one person's repeated accounts, say); it no longer competes.
CREATE TABLE palpites (
  id INTEGER PRIMARY KEY,
  bolao TEXT NOT NULL REFERENCES boloes(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quando INTEGER NOT NULL,
  treino INTEGER NOT NULL,
  corrida1 INTEGER NOT NULL,
  corrida2 INTEGER NOT NULL,
  desclassificado INTEGER NOT NULL DEFAULT 0,
  UNIQUE(bolao, usuario_id)
);
CREATE INDEX palpites_bolao ON palpites(bolao, quando, id);
-- The first weekend: Old Stock Race at Chapecó, the circuit's opening. Qualifying on Saturday 31/10 at 07:30 in
-- Brasília (10:30 UTC), races on 31/10 and 01/11. The admin panel moves the closing time if the schedule changes.
INSERT INTO boloes (id, titulo, criado_em, fecha_em) VALUES ('oldstock-chapeco-2026', 'Old Stock Race · Chapecó · 31/10 e 01/11', 1793145600000, 1793442600000);
