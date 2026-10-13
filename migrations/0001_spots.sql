CREATE TABLE spots (
  id INTEGER PRIMARY KEY,
  event TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('door', 'hall')),
  place TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy INTEGER NOT NULL,
  hour TEXT NOT NULL,
  purge_after TEXT NOT NULL
);
CREATE INDEX spots_event_place ON spots (event, place);
CREATE INDEX spots_purge ON spots (purge_after);

CREATE TABLE decisions (
  id INTEGER PRIMARY KEY,
  venue TEXT NOT NULL,
  place TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('keep', 'move')),
  lat REAL,
  lng REAL,
  spots INTEGER NOT NULL,
  pr TEXT,
  at TEXT NOT NULL
);
CREATE INDEX decisions_venue ON decisions (venue, at);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT NOT NULL,
  name TEXT NOT NULL,
  created TEXT NOT NULL,
  last_used TEXT
);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires TEXT NOT NULL);

CREATE TABLE challenges (challenge TEXT PRIMARY KEY, kind TEXT NOT NULL, expires TEXT NOT NULL);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
