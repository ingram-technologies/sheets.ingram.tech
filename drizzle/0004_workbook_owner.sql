-- Per-user workbook ownership.
--
-- Until now `workbook` had no owner column and every query in lib/workbooks.ts
-- ran unscoped, so any signed-in user could list, open, rename, overwrite and
-- delete every workbook in the database. This closes that.
--
-- DESTRUCTIVE, deliberately: the pre-ownership rows have no owner to infer.
-- Rather than invent one — silently handing one user another's work — or carry
-- a nullable owner (i.e. "still visible to everyone") forever, they are
-- dropped so `user_id` can be NOT NULL from the start. Authorised on the basis
-- that the only rows were empty dev/test workbooks ("Test Workbook",
-- "Untitled workbook" x2, ~3KB each — an empty IronCalc model serialises to
-- ~2.8KB). This runs against prod too, and there is no recovery path.
DELETE FROM "workbook";--> statement-breakpoint

ALTER TABLE "workbook" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint

-- Hand-written: "user" is Better Auth's table, created by raw SQL in 0001 and
-- deliberately absent from the drizzle schema (declaring it there would make
-- drizzle-kit try to manage Better Auth's DDL), so drizzle-kit cannot emit
-- this FK itself. ON DELETE cascade: deleting an account takes its workbooks
-- with it, which is what account erasure needs anyway.
ALTER TABLE "workbook"
	ADD CONSTRAINT "workbook_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "workbook_user_id_updated_at_idx" ON "workbook" USING btree ("user_id","updated_at" DESC NULLS LAST);
