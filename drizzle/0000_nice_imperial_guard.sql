CREATE TABLE "covers" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"status" text NOT NULL,
	"plan" jsonb NOT NULL,
	"mode" text NOT NULL,
	"venue" text NOT NULL,
	"premium" double precision NOT NULL,
	"max_payout" double precision NOT NULL,
	"payout" double precision,
	"orders" jsonb NOT NULL,
	"market_ticker" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"open_tx" text,
	"close_tx" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"wanted" text NOT NULL,
	"sentence" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"kind" text NOT NULL,
	"args" jsonb NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odds" (
	"symbol" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"bid" double precision,
	"ask" double precision,
	CONSTRAINT "odds_symbol_at_pk" PRIMARY KEY("symbol","at")
);
--> statement-breakpoint
CREATE INDEX "covers_owner_index" ON "covers" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "covers_status_index" ON "covers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_owner_block_number_index" ON "ledger" USING btree ("owner","block_number");