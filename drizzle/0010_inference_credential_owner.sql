-- Hand-written, like drizzle/0004: "user" is Better Auth's table, created by
-- raw SQL in 0001 and deliberately absent from the drizzle schema (declaring
-- it there would make drizzle-kit try to manage Better Auth's DDL), so
-- drizzle-kit cannot emit this FK itself. ON DELETE cascade: deleting an
-- account takes its Ingram Cloud credential with it.
ALTER TABLE "inference_credential"
	ADD CONSTRAINT "inference_credential_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
	ON DELETE cascade ON UPDATE no action;
