-- Two sites share this database from 10-28: dev.autopobre.com.br and autopobre.com.br, each its own Worker
-- (wrangler.jsonc, env "principal"; README.md). Columns only added: both Workers may run different versions on it.
-- The old records come up once per account and site (each address keeps its own in the browser): the dev's stays
-- importou_em, the main link's is this one.
ALTER TABLE usuarios ADD COLUMN importou_principal_em INTEGER;
-- A session belongs to the site that opened it (its cookie is host-only already): a dev session never opens the
-- account on the main link. NULL: one from before, the dev's.
ALTER TABLE sessoes ADD COLUMN site TEXT;
