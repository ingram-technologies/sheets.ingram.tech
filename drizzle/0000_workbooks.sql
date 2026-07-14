CREATE TABLE "workbook" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
