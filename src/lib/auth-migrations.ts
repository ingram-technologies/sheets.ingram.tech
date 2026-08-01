/**
 * nk-auth owns the Better Auth tables as its own journaled migration chain,
 * shipped inside the package. We don't copy it in; we point the runner at the
 * shipped folder so a better-auth schema change arrives as a dependency bump.
 *
 * It must run BEFORE `drizzle/`, because `workbook.user_id` FKs to `user`.
 *
 * `drizzle/0001_better_auth.sql` is the old copy-in of this same baseline and
 * stays where it is — deleting an applied migration is journal drift. Its DDL
 * is all `… if not exists`, so whichever chain runs second is a no-op.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Anchored on the journal rather than the README's `package.json`, which
// nk-auth's `exports` map does not expose; `./migrations/*` is exported.
const journal = createRequire(import.meta.url).resolve(
	"@ingram-tech/nk-auth/migrations/meta/_journal.json",
);

/** The shipped chain, as `dependencyMigrations` wants it. Its own journal table
 *  keeps it versioned independently of the app's `drizzle/` chain. */
export const authMigrationChain = {
	folder: join(dirname(journal), ".."),
	table: "__nkauth_migrations",
} as const;
