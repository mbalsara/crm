DROP TABLE IF EXISTS "runs";
DROP TYPE IF EXISTS "run_status";
DROP TYPE IF EXISTS "run_type";

-- Create enums for runs
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'failed');
CREATE TYPE "public"."run_type" AS ENUM('initial', 'incremental', 'historical', 'webhook');

-- Create runs table
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "run_status" NOT NULL,
	"run_type" "run_type" NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_inserted" integer DEFAULT 0 NOT NULL,
	"items_skipped" integer DEFAULT 0 NOT NULL,
	"start_token" text,
	"end_token" text,
	"error_message" text,
	"error_stack" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for runs table
CREATE INDEX IF NOT EXISTS "idx_runs_tenant_status" ON "runs" USING btree ("tenant_id","status","started_at");
CREATE INDEX IF NOT EXISTS "idx_runs_integration_status" ON "runs" USING btree ("integration_id","status","started_at");
