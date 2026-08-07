CREATE TYPE "public"."goal_kind" AS ENUM('ganancia', 'operaciones', 'win_rate', 'riesgo_diario', 'manual');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('felicitacion', 'correccion', 'recordatorio', 'observacion', 'progreso');--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "goal_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target_value" numeric(12, 2) NOT NULL,
	"threshold_value" numeric(6, 2),
	"manual_progress" numeric(5, 1),
	"start_date" date NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"goal_amount" numeric(12, 2) NOT NULL,
	"min_profit_factor" numeric(6, 2),
	"min_trades" integer,
	"max_drawdown_pct" numeric(6, 2),
	"manual_unlock" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "levels_position_unique" UNIQUE("position")
);
--> statement-breakpoint
CREATE TABLE "manual_level_grants" (
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "manual_level_grants_user_id_level_id_pk" PRIMARY KEY("user_id","level_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"trade_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_level_grants" ADD CONSTRAINT "manual_level_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_level_grants" ADD CONSTRAINT "manual_level_grants_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
INSERT INTO "levels" ("position", "name", "goal_amount", "min_profit_factor", "min_trades", "max_drawdown_pct", "manual_unlock") VALUES
(1, 'Nivel 1', 500, NULL, 10, NULL, false),
(2, 'Nivel 2', 1000, 1.5, 20, 10, false),
(3, 'Nivel 3', 2000, 1.8, 30, 8, false),
(4, 'Nivel 4', 5000, 2.0, 50, 6, false),
(5, 'Nivel 5 · Cuenta fondeada', 5000, 2.0, 50, 6, true);