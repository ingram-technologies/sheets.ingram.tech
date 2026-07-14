-- Workbook ids: nanoid text -> DB-minted UUIDv7 (Postgres >= 18 everywhere),
-- skinned as `wb_<base58>` on the public contract via @ingram-tech/nk-db/id.
-- Existing rows (pre-launch test data) get FRESH ids — old /w/<nanoid> URLs
-- die here, deliberately: nanoids cannot be cast or mapped into UUIDs.
ALTER TABLE "workbook" ADD COLUMN "id_v7" uuid NOT NULL DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "workbook" DROP CONSTRAINT "workbook_pkey";--> statement-breakpoint
ALTER TABLE "workbook" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "workbook" RENAME COLUMN "id_v7" TO "id";--> statement-breakpoint
ALTER TABLE "workbook" ADD CONSTRAINT "workbook_pkey" PRIMARY KEY ("id");
