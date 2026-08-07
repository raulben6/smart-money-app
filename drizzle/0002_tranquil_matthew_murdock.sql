ALTER TABLE "users" ADD COLUMN "start_level_position" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "level_baseline_net" numeric(12, 2) DEFAULT 0 NOT NULL;