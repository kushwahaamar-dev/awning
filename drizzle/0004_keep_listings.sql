CREATE TABLE "listings" (
	"query" text PRIMARY KEY NOT NULL,
	"markets" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
