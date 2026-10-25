-- An account's writes per hour (src/eventos.js recent): its events found by account and time, not by account alone.
DROP INDEX eventos_usuario;
CREATE INDEX eventos_usuario ON eventos(usuario_id, quando);
