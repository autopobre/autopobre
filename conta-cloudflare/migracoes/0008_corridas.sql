-- Each time a signed-in pilot goes on track (src/recordes.js ticket: a race, a practice, a story race; one begun again
-- is another), kept EVENT_DAYS for the admin panel's pilots: how often and where they drive. No IP.
CREATE TABLE corridas (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quando INTEGER NOT NULL,
  circuito TEXT NOT NULL,
  modo TEXT NOT NULL,
  carro TEXT NOT NULL
);
CREATE INDEX corridas_usuario ON corridas(usuario_id, quando);
CREATE INDEX corridas_quando ON corridas(quando);
