/**
 * Apply Drizzle migrations via nk-db's drift-aware runner. Works against
 * DATABASE_URL (shared RDS in prod, or the PGlite socket in dev).
 */
import { runMigrations } from "@ingram-tech/nk-db/migrate";

import { pool } from "../src/lib/db";

async function main() {
	const { applied } = await runMigrations({ pool, migrationsFolder: "./drizzle" });
	await pool.end();
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
