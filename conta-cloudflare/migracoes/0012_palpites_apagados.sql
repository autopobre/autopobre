-- A guess is final (src/palpites.js), and deleting the account must not make it a second one: an account deleted with a
-- guess on a weekend still open leaves here a mark of its Google account until those guesses close (each sign-in clears
-- the closed weekends'), and a guess from that Google account is refused meanwhile. conta: an HMAC of the Google id under
-- a key from EMAIL_KEY (src/email.js accountMark: both Workers share it), never the id itself.
CREATE TABLE palpites_apagados (
  bolao TEXT NOT NULL REFERENCES boloes(id),
  conta TEXT NOT NULL,
  PRIMARY KEY (bolao, conta)
);
