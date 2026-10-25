-- The old records come up once per account, whatever the browsers say (recordes.js importOld): when they did.
ALTER TABLE usuarios ADD COLUMN importou_em INTEGER;
