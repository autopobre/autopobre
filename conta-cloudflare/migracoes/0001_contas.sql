-- Accounts (src/index.js): the least that makes one. Times are milliseconds since 1970.
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,   -- the Google account's subject id (scope openid: nothing else arrives)
  apelido TEXT,                      -- the public nickname, as the player typed it
  apelido_chave TEXT UNIQUE,         -- the same without accents or case: one nickname per pilot
  criado_em INTEGER NOT NULL,
  ultimo_login INTEGER NOT NULL
);
CREATE TABLE sessoes (
  id TEXT PRIMARY KEY,               -- SHA-256 (base64url) of the cookie's random value, never the value
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
CREATE INDEX sessoes_usuario ON sessoes(usuario_id);
CREATE INDEX sessoes_validade ON sessoes(expira_em);
