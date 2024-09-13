CREATE TABLE IF NOT EXISTS "visb_account" (
	"user_id" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "visb_account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visb_session" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visb_track_slices" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"spotify_track_id" text NOT NULL,
	"start_position" integer NOT NULL,
	"end_position" integer NOT NULL,
	"should_play" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "id_track_idx" UNIQUE("id","spotify_track_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visb_tracks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"spotify_track_id" text NOT NULL,
	"user_tap_tempo" integer,
	"beat_grid_offset" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "tracks_id_spotifyTrackId_idx" UNIQUE("id","spotify_track_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visb_user" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"image" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visb_verification_token" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "visb_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visb_account" ADD CONSTRAINT "visb_account_user_id_visb_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."visb_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visb_session" ADD CONSTRAINT "visb_session_user_id_visb_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."visb_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "visb_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "visb_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_idx" ON "visb_track_slices" USING btree ("spotify_track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_spotifyTrackId_idx" ON "visb_tracks" USING btree ("spotify_track_id");