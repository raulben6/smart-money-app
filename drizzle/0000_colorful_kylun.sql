CREATE TYPE "public"."capture_phase" AS ENUM('before', 'after');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('indices', 'acciones', 'opciones', 'futuros', 'forex', 'cripto');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'mentor');--> statement-breakpoint
CREATE TABLE "trade_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"phase" "capture_phase" NOT NULL,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_journals" (
	"trade_id" uuid PRIMARY KEY NOT NULL,
	"why_took" text DEFAULT '' NOT NULL,
	"what_saw" text DEFAULT '' NOT NULL,
	"followed_plan" text DEFAULT '' NOT NULL,
	"did_well" text DEFAULT '' NOT NULL,
	"did_wrong" text DEFAULT '' NOT NULL,
	"improve" text DEFAULT '' NOT NULL,
	"emotions" jsonb DEFAULT '{"antes":[],"durante":[],"despues":[]}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trade_date" date NOT NULL,
	"asset" text NOT NULL,
	"market" "market" NOT NULL,
	"direction" "direction" NOT NULL,
	"entry_time" time,
	"exit_time" time,
	"entry_price" numeric(12, 2),
	"exit_price" numeric(12, 2),
	"contracts" numeric(12, 4),
	"position_size" numeric(12, 2),
	"stop_loss" numeric(12, 2),
	"take_profit" numeric(12, 2),
	"risk_usd" numeric(12, 2),
	"risk_pct" numeric(6, 3),
	"pnl_usd" numeric(12, 2) NOT NULL,
	"r_multiple" numeric(8, 2),
	"setup" text DEFAULT '' NOT NULL,
	"timeframe" text DEFAULT '' NOT NULL,
	"market_conditions" text,
	"entry_type" text,
	"confirmations" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"role" "role" DEFAULT 'student' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"initial_balance" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "trade_captures" ADD CONSTRAINT "trade_captures_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_journals" ADD CONSTRAINT "trade_journals_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "captures_trade_phase_idx" ON "trade_captures" USING btree ("trade_id","phase");--> statement-breakpoint
CREATE INDEX "trades_user_date_idx" ON "trades" USING btree ("user_id","trade_date");