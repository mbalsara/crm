DROP TABLE IF EXISTS "emails";

CREATE TABLE IF NOT EXISTS "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"subject" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"tos" jsonb NOT NULL,
	"ccs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bccs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text,
	"priority" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for emails table
CREATE INDEX IF NOT EXISTS "idx_emails_tenant_message" ON "emails" USING btree ("tenant_id","gmail_message_id");
CREATE INDEX IF NOT EXISTS "idx_emails_tenant_received" ON "emails" USING btree ("tenant_id","received_at");
CREATE INDEX IF NOT EXISTS "idx_emails_thread" ON "emails" USING btree ("tenant_id","gmail_thread_id");
