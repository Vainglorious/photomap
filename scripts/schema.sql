-- Photomap schema. Run with: npm run migrate
--
-- The app moved from a single global manifest.json to per-user maps, so metadata
-- now lives in Postgres (Neon). Blob still stores only the image files.
-- Every statement is idempotent so the migration can be re-run safely.

create extension if not exists pgcrypto; -- provides gen_random_uuid()

-- One row per account. A user may authenticate with a password, with Google, or
-- both (linked by email). `username` is null until the user picks one in the
-- welcome step; it is the public handle in /<username> and is stored lowercased.
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text,                       -- null for Google-only accounts
  google_sub    text unique,                -- Google 'sub' claim; null if not linked
  username      text unique,                -- <=12 chars, [a-z0-9_], lowercased; null until chosen
  name          text,                       -- display name (from signup or Google)
  image         text,                       -- avatar URL (from Google)
  created_at    timestamptz not null default now()
);

-- A pinned collection of photos, owned by one user.
create table if not exists collections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,
  date            date not null,            -- the single date this pin carries on the timeline
  lat             double precision not null,
  lng             double precision not null,
  cover_photo_id  uuid,                     -- points at a photos.id; set after photos insert
  created_at      timestamptz not null default now()
);
create index if not exists collections_user_id_idx on collections (user_id);

-- Photos keep the author's filename order within a collection (not date order).
create table if not exists photos (
  id                uuid primary key default gen_random_uuid(),
  collection_id     uuid not null references collections(id) on delete cascade,
  web_url           text not null,          -- 2048px webp shown in the slideshow
  thumb_url         text not null,          -- 400px webp for pins/grids
  caption           text not null default '',
  "order"           integer not null default 0,
  order_suffix      text not null default '',
  taken_at          timestamptz,            -- EXIF DateTimeOriginal; null if absent
  width             integer not null,
  height            integer not null,
  original_filename text not null,
  created_at        timestamptz not null default now()
);
create index if not exists photos_collection_id_idx on photos (collection_id);
