CREATE TABLE "inference_credential" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_hint" text NOT NULL,
	"source" text NOT NULL,
	"base_url" text,
	"agent_id" text NOT NULL,
	"agent_sig" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone
);
