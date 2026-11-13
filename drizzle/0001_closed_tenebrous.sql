CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"standing_id" integer NOT NULL,
	"owner" text NOT NULL,
	"day" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"facts" jsonb NOT NULL,
	"cover_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"exposure" jsonb NOT NULL,
	"cover_ratio" double precision NOT NULL,
	"daily_cap" double precision NOT NULL,
	"instruction" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_standing_id_day_index" ON "decisions" USING btree ("standing_id","day");--> statement-breakpoint
CREATE INDEX "decisions_owner_index" ON "decisions" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "standing_owner_index" ON "standing" USING btree ("owner");