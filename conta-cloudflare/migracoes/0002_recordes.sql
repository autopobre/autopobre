-- Online records (src/recordes.js): each pilot's best lap per circuit, mode, car and badge.
CREATE TABLE recordes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  circuito TEXT NOT NULL,
  modo TEXT NOT NULL,                -- normal | immersive (Modo História)
  carro TEXT NOT NULL,               -- opala
  selo TEXT NOT NULL,                -- conferido (checked as it was driven) | nao_verificado (an old record of a browser)
  volta_ms INTEGER NOT NULL,
  versao TEXT NOT NULL,              -- the game's build that drove it; 'local' for an old record
  feito_em INTEGER NOT NULL,         -- when it was driven (an old record: the date its browser kept)
  enviado_em INTEGER NOT NULL,
  fantasma TEXT,                     -- the lap's ghost as the game encodes it (conferido only)
  UNIQUE (usuario_id, circuito, modo, carro, selo)
);
CREATE INDEX recordes_tabela ON recordes(circuito, modo, carro, volta_ms);
