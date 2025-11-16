DROP TABLE IF EXISTS "integrations";

DROP TYPE IF EXISTS "integration_auth_type";
DROP TYPE IF EXISTS "integration_source";

-- Create enums for integrations
CREATE TYPE "public"."integration_auth_type" AS ENUM('oauth', 'service_account', 'api_key');
CREATE TYPE "public"."integration_source" AS ENUM('gmail', 'outlook', 'slack', 'other');

-- Create integrations table
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" "integration_source" NOT NULL,
	"auth_type" "integration_auth_type" NOT NULL,
	"keys" text NOT NULL,
	"token_expires_at" timestamp,
	"last_run_token" text,
	"last_run_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
