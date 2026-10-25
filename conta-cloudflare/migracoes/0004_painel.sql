-- The admin panel (src/admin.js): who may see it, and what happened.
-- An administrator is set by hand, by its account's number: UPDATE usuarios SET admin=1 WHERE id=…
ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
-- What happened, kept EVENT_DAYS (src/eventos.js), no IP: conta_criada, entrou, saiu, apelido, importou, conferida,
-- recusada, conta_apagada. An account's events go with it; its conta_apagada keeps no one.
CREATE TABLE eventos (
  id INTEGER PRIMARY KEY,
  quando INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  usuario_id INTEGER,
  detalhe TEXT                       -- short JSON: circuit, mode, time, reason, count, nickname
);
CREATE INDEX eventos_quando ON eventos(quando);
CREATE INDEX eventos_usuario ON eventos(usuario_id);
