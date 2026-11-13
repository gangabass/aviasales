PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE monitors (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 origin TEXT NOT NULL, destination TEXT NOT NULL, date_min TEXT NOT NULL, date_max TEXT NOT NULL,
 threshold REAL NOT NULL, direct_only INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, checked_at TEXT, next_check INTEGER NOT NULL DEFAULT 0,
 best_price REAL, best_date TEXT, prices TEXT NOT NULL DEFAULT '[]', error TEXT,
 CHECK(origin <> destination), CHECK(threshold > 0)
);
CREATE INDEX monitors_due ON monitors(enabled,next_check);
CREATE INDEX monitors_owner ON monitors(user_id);
CREATE TABLE subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX subscriptions_owner ON subscriptions(user_id);
CREATE TABLE deliveries (
 monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
 price REAL NOT NULL, sent_at TEXT NOT NULL,
 PRIMARY KEY (monitor_id, subscription_id)
);
CREATE TABLE locks (name TEXT PRIMARY KEY, holder TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
