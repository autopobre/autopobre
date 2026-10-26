-- Fusca and Opala boards, reviews and the cases of the trusted pilots (src/recordes.js judge, askReview; src/admin.js):
-- each lap in the log keeps its car and the game's build. A refused lap that would have been the pilot's best keeps its
-- ghost, so that the pilot may ask for a review (revisao: pedida, then aprovada or recusada, when revisado_em). A trusted
-- pilot's lap the checks would have refused goes in all the same: caso says why they would have, and it keeps its ghost
-- and its controls (comandos) for the checks to be put right.
ALTER TABLE voltas ADD COLUMN carro TEXT;
ALTER TABLE voltas ADD COLUMN versao TEXT;
ALTER TABLE voltas ADD COLUMN fantasma TEXT;
ALTER TABLE voltas ADD COLUMN comandos TEXT;
ALTER TABLE voltas ADD COLUMN revisao TEXT;
ALTER TABLE voltas ADD COLUMN revisado_em INTEGER;
ALTER TABLE voltas ADD COLUMN caso TEXT;
CREATE INDEX voltas_revisao ON voltas(revisao) WHERE revisao IS NOT NULL;
CREATE INDEX voltas_caso ON voltas(id) WHERE caso IS NOT NULL;
