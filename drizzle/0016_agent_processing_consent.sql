CREATE TABLE "app"."agent_processing_consent" (
	"user_id" text PRIMARY KEY NOT NULL,
	"consent_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"provider_profile_id" text NOT NULL,
	"provider_profile_version" text NOT NULL,
	"data_egress_policy_version" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."agent_processing_consent" ADD CONSTRAINT "agent_processing_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;