CREATE TYPE "public"."access_scope" AS ENUM('global', 'scoped');--> statement-breakpoint
CREATE TYPE "public"."activity_event_type" AS ENUM('payment_recorded');--> statement-breakpoint
CREATE TYPE "public"."advance_credit_status" AS ENUM('available', 'partially_applied', 'applied');--> statement-breakpoint
CREATE TYPE "public"."allocation_order" AS ENUM('interest_first', 'principal_first');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('confirmed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interest_start_rule" AS ENUM('after_grace', 'from_due_date');--> statement-breakpoint
CREATE TYPE "public"."note_scope" AS ENUM('villa', 'customer');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'cash', 'cheque', 'card');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."reminder_origin" AS ENUM('system', 'user');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('awaiting_approval', 'ready_to_send', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('project', 'villa');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('upcoming', 'overdue', 'payment_received', 'final_notice', 'custom');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'editor', 'staff', 'view_only');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."villa_programme_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."villa_sale_status" AS ENUM('available', 'reserved', 'scheduled', 'sold');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text NOT NULL,
	"currency" text DEFAULT 'LKR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"date_format" text DEFAULT 'dd/MM/yyyy' NOT NULL,
	"receipt_prefix" text DEFAULT 'JVM-RCP' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1),
	CONSTRAINT "app_settings_currency_is_lkr" CHECK ("app_settings"."currency" = 'LKR')
);
--> statement-breakpoint
CREATE TABLE "grace_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"days" integer NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "grace_periods_days_not_negative" CHECK ("grace_periods"."days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "interest_defaults" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"charge_interest" boolean DEFAULT true NOT NULL,
	"monthly_rate" numeric(8, 6) NOT NULL,
	"grace_days" integer NOT NULL,
	"prorata_divisor" integer DEFAULT 30 NOT NULL,
	"interest_start" "interest_start_rule" DEFAULT 'after_grace' NOT NULL,
	"first_reminder_day" integer NOT NULL,
	"second_reminder_day" integer NOT NULL,
	"final_notice_day" integer NOT NULL,
	"allocation_order" "allocation_order" DEFAULT 'interest_first' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interest_defaults_singleton" CHECK ("interest_defaults"."id" = 1),
	CONSTRAINT "interest_defaults_rate_is_fraction" CHECK ("interest_defaults"."monthly_rate" >= 0 AND "interest_defaults"."monthly_rate" < 1),
	CONSTRAINT "interest_defaults_divisor_positive" CHECK ("interest_defaults"."prorata_divisor" > 0),
	CONSTRAINT "interest_defaults_grace_not_negative" CHECK ("interest_defaults"."grace_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reminder_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "template_type" DEFAULT 'custom' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_assignments_unique" UNIQUE("user_id","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'view_only' NOT NULL,
	"scope" "access_scope" DEFAULT 'global' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"nic_passport" text,
	"address" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"planned_villa_count" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "villa_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"unassigned_at" timestamp with time zone,
	"unassigned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "villa_interest_terms" (
	"villa_id" uuid PRIMARY KEY NOT NULL,
	"charge_interest" boolean DEFAULT true NOT NULL,
	"monthly_rate" numeric(8, 6) NOT NULL,
	"grace_days" integer NOT NULL,
	"prorata_divisor" integer DEFAULT 30 NOT NULL,
	"interest_start" "interest_start_rule" DEFAULT 'after_grace' NOT NULL,
	"first_reminder_day" integer NOT NULL,
	"second_reminder_day" integer NOT NULL,
	"final_notice_day" integer NOT NULL,
	"allocation_order" "allocation_order" DEFAULT 'interest_first' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villa_terms_rate_is_fraction" CHECK ("villa_interest_terms"."monthly_rate" >= 0 AND "villa_interest_terms"."monthly_rate" < 1),
	CONSTRAINT "villa_terms_divisor_positive" CHECK ("villa_interest_terms"."prorata_divisor" > 0),
	CONSTRAINT "villa_terms_grace_not_negative" CHECK ("villa_interest_terms"."grace_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "villas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"villa_number" text NOT NULL,
	"villa_type" text,
	"villa_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"sale_status" "villa_sale_status" DEFAULT 'available' NOT NULL,
	"programme_status" "villa_programme_status" DEFAULT 'active' NOT NULL,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "villas_number_per_project" UNIQUE("project_id","villa_number"),
	CONSTRAINT "villas_value_not_negative" CHECK ("villas"."villa_value" >= 0),
	CONSTRAINT "villas_cancellation_has_reason" CHECK ("villas"."programme_status" <> 'cancelled' OR "villas"."cancellation_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "advance_credit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advance_credit_id" uuid NOT NULL,
	"payment_stage_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_applications_amount_positive" CHECK ("advance_credit_applications"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "advance_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" "advance_credit_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_credits_amount_positive" CHECK ("advance_credits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "collection_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"payment_stage_id" uuid NOT NULL,
	"principal_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"interest_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_not_negative" CHECK ("collection_allocations"."principal_amount" >= 0 AND "collection_allocations"."interest_amount" >= 0),
	CONSTRAINT "allocations_move_money" CHECK ("collection_allocations"."principal_amount" + "collection_allocations"."interest_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference_no" text,
	"receipt_no" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"receipt_document_url" text,
	"notes" text,
	"status" "collection_status" DEFAULT 'confirmed' NOT NULL,
	"supersedes_id" uuid,
	"superseded_at" timestamp with time zone,
	"superseded_by" uuid,
	"edit_reason" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "collections_amount_positive" CHECK ("collections"."amount" > 0),
	CONSTRAINT "collections_supersede_consistent" CHECK (("collections"."status" = 'superseded') = ("collections"."superseded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"stage_no" integer NOT NULL,
	"stage_name" text NOT NULL,
	"deliverables" text,
	"due_date" date,
	"principal_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"principal_paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"interest_paid" numeric(18, 2) DEFAULT '0' NOT NULL,
	"interest_charged" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stages_stage_no" UNIQUE("villa_id","stage_no"),
	CONSTRAINT "payment_stages_principal_not_negative" CHECK ("payment_stages"."principal_amount" >= 0),
	CONSTRAINT "payment_stages_grace_not_negative" CHECK ("payment_stages"."grace_period_days" >= 0),
	CONSTRAINT "payment_stages_paid_not_negative" CHECK ("payment_stages"."principal_paid" >= 0 AND "payment_stages"."interest_paid" >= 0),
	CONSTRAINT "payment_stages_no_overpay" CHECK ("payment_stages"."principal_paid" <= "payment_stages"."principal_amount")
);
--> statement-breakpoint
CREATE TABLE "project_schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_no" integer NOT NULL,
	"stage_name" text NOT NULL,
	"deliverables" text,
	"grace_period_days" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_templates_stage_no" UNIQUE("project_id","stage_no"),
	CONSTRAINT "project_templates_grace_not_negative" CHECK ("project_schedule_templates"."grace_period_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "activity_event_type" NOT NULL,
	"villa_id" uuid,
	"customer_id" uuid,
	"collection_id" uuid,
	"payment_stage_id" uuid,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"name" text NOT NULL,
	"document_date" date,
	"url" text NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_url_is_http" CHECK ("documents"."url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "note_scope" NOT NULL,
	"villa_id" uuid,
	"customer_id" uuid,
	"content" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "notes_scope_matches_target" CHECK (("notes"."scope" = 'villa' AND "notes"."villa_id" IS NOT NULL AND "notes"."customer_id" IS NULL)
        OR ("notes"."scope" = 'customer' AND "notes"."customer_id" IS NOT NULL AND "notes"."villa_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"user_id" uuid NOT NULL,
	"notification_key" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_user_id_notification_key_pk" PRIMARY KEY("user_id","notification_key")
);
--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_request_id" uuid,
	"template_id" uuid,
	"payment_stage_id" uuid,
	"customer_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" uuid,
	"delivery_status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"delivery_error" text
);
--> statement-breakpoint
CREATE TABLE "reminder_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"villa_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_stage_id" uuid,
	"template_id" uuid,
	"origin" "reminder_origin" DEFAULT 'system' NOT NULL,
	"status" "reminder_status" DEFAULT 'awaiting_approval' NOT NULL,
	"send_date" date NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attachment_name" text,
	"attachment_url" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"delivery_status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_sent_has_timestamp" CHECK ("reminder_requests"."status" <> 'sent' OR "reminder_requests"."sent_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_customers" ADD CONSTRAINT "villa_customers_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_customers" ADD CONSTRAINT "villa_customers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_customers" ADD CONSTRAINT "villa_customers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_customers" ADD CONSTRAINT "villa_customers_unassigned_by_users_id_fk" FOREIGN KEY ("unassigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_interest_terms" ADD CONSTRAINT "villa_interest_terms_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villa_interest_terms" ADD CONSTRAINT "villa_interest_terms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villas" ADD CONSTRAINT "villas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villas" ADD CONSTRAINT "villas_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "villas" ADD CONSTRAINT "villas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_credit_applications" ADD CONSTRAINT "advance_credit_applications_advance_credit_id_advance_credits_id_fk" FOREIGN KEY ("advance_credit_id") REFERENCES "public"."advance_credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_credit_applications" ADD CONSTRAINT "advance_credit_applications_payment_stage_id_payment_stages_id_fk" FOREIGN KEY ("payment_stage_id") REFERENCES "public"."payment_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_credit_applications" ADD CONSTRAINT "advance_credit_applications_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_credits" ADD CONSTRAINT "advance_credits_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_credits" ADD CONSTRAINT "advance_credits_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_allocations" ADD CONSTRAINT "collection_allocations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_allocations" ADD CONSTRAINT "collection_allocations_payment_stage_id_payment_stages_id_fk" FOREIGN KEY ("payment_stage_id") REFERENCES "public"."payment_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_stages" ADD CONSTRAINT "payment_stages_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_stages" ADD CONSTRAINT "payment_stages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedule_templates" ADD CONSTRAINT "project_schedule_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedule_templates" ADD CONSTRAINT "project_schedule_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_payment_stage_id_payment_stages_id_fk" FOREIGN KEY ("payment_stage_id") REFERENCES "public"."payment_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_reminder_request_id_reminder_requests_id_fk" FOREIGN KEY ("reminder_request_id") REFERENCES "public"."reminder_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_template_id_reminder_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."reminder_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_payment_stage_id_payment_stages_id_fk" FOREIGN KEY ("payment_stage_id") REFERENCES "public"."payment_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_villa_id_villas_id_fk" FOREIGN KEY ("villa_id") REFERENCES "public"."villas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_payment_stage_id_payment_stages_id_fk" FOREIGN KEY ("payment_stage_id") REFERENCES "public"."payment_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_template_id_reminder_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."reminder_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_requests" ADD CONSTRAINT "reminder_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_assignments_user_idx" ON "user_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "villa_customers_one_active" ON "villa_customers" USING btree ("villa_id") WHERE unassigned_at IS NULL;--> statement-breakpoint
CREATE INDEX "villa_customers_customer_idx" ON "villa_customers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "villas_project_idx" ON "villas" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "villas_sale_status_idx" ON "villas" USING btree ("sale_status");--> statement-breakpoint
CREATE INDEX "villas_programme_status_idx" ON "villas" USING btree ("programme_status");--> statement-breakpoint
CREATE INDEX "credit_applications_credit_idx" ON "advance_credit_applications" USING btree ("advance_credit_id");--> statement-breakpoint
CREATE INDEX "advance_credits_villa_idx" ON "advance_credits" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "advance_credits_collection_idx" ON "advance_credits" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "allocations_collection_idx" ON "collection_allocations" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "allocations_stage_idx" ON "collection_allocations" USING btree ("payment_stage_id");--> statement-breakpoint
CREATE INDEX "collections_villa_idx" ON "collections" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "collections_customer_idx" ON "collections" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "collections_payment_date_idx" ON "collections" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "collections_superseded_idx" ON "collections" USING btree ("superseded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_live_receipt_no" ON "collections" USING btree ("receipt_no") WHERE superseded_at IS NULL;--> statement-breakpoint
CREATE INDEX "payment_stages_due_idx" ON "payment_stages" USING btree ("villa_id","due_date");--> statement-breakpoint
CREATE INDEX "activity_events_created_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_events_villa_idx" ON "activity_events" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_villa_idx" ON "documents" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "notes_villa_idx" ON "notes" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "notes_customer_idx" ON "notes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "notification_reads_user_idx" ON "notification_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminder_logs_customer_idx" ON "reminder_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reminder_logs_sent_idx" ON "reminder_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "reminders_villa_idx" ON "reminder_requests" USING btree ("villa_id");--> statement-breakpoint
CREATE INDEX "reminders_customer_idx" ON "reminder_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reminders_status_idx" ON "reminder_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reminders_send_date_idx" ON "reminder_requests" USING btree ("send_date");