/**
 * Apply Drizzle migrations via nk-db's drift-aware runner. Works against
 * DATABASE_URL (shared RDS in prod, or the PGlite socket in dev).
 */
import { runMigrations } from "@ingram-tech/nk-db/migrate";

import { authMigrationChain } from "../src/lib/auth-migrations";
import { pool } from "../src/lib/db";

async function main() {
	// nk-auth's chain first: the app's tables FK to `user`.
	const auth = await runMigrations({
		pool,
		migrationsFolder: authMigrationChain.folder,
		migrationsTable: authMigrationChain.table,
	});
	const app = await runMigrations({ pool, migrationsFolder: "./drizzle" });
	await pool.end();

	const applied = [...auth.applied, ...app.applied];
	console.log(
		applied.length > 0
			? `migrations applied: ${applied.join(", ")}`
			: "migrations up to date",
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
