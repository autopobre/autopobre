-- Every lap a pilot sends (src/recordes.js judge), checked or not, kept EVENT_DAYS for the admin panel: its time, the
-- verdict, the device that drove it and what its controls look like (src/comandos.js inputSignals). No IP.
CREATE TABLE voltas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quando INTEGER NOT NULL,
  circuito TEXT NOT NULL,
  modo TEXT NOT NULL,
  tempo_ms INTEGER,
  resultado TEXT NOT NULL,           -- recorde | conferida | the refusal's reason
  aparelho TEXT,                     -- teclado | toque | controle | volante | nenhum (null: the controls did not come)
  sinais TEXT,                       -- JSON {sinais: [codes], medidas: {…}}
  freios TEXT                        -- JSON: where the brake went on (tenths of metres along the track), to compare laps
);
CREATE INDEX voltas_usuario ON voltas(usuario_id, quando);
CREATE INDEX voltas_quando ON voltas(quando);
-- A record keeps the signals of the lap that set it (the panel shows them beside it).
ALTER TABLE recordes ADD COLUMN sinais TEXT;
