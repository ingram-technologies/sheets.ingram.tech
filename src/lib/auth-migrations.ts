/**
 * nk-auth owns the Better Auth tables, OAuth provider tables included, as its
 * own journaled migration chain shipped inside the package. It runs BEFORE
 * `drizzle/`, because `workbook.user_id` FKs to `user`.
 */
import { AUTH_MIGRATIONS_TABLE, authMigrationsFolder } from "@ingram-tech/nk-auth";

/** The shipped chain, as `dependencyMigrations` wants it. */
export const authMigrationChain = {
	folder: authMigrationsFolder(),
	table: AUTH_MIGRATIONS_TABLE,
} as const;
