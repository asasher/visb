CREATE TABLE IF NOT EXISTS "visb_tracks" (
  "spotify_track_id" text PRIMARY KEY NOT NULL,
  "user_tap_tempo" integer,
  "beat_grid_offset" integer,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone
);