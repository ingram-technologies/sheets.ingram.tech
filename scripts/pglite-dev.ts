/**
 * Local dev boot: PGlite (no-Docker Postgres) + migrations + `next dev`,
 * via nk-db's harness. `bun run dev -- --fresh` resets the local database.
 */
import { startPgliteDev } from "@ingram-tech/nk-db/pglite";

import { authMigrationChain } from "../src/lib/auth-migrations";

const fresh = process.argv.includes("--fresh");
const nextArgs = process.argv.slice(2).filter((arg) => arg !== "--fresh");

startPgliteDev({
	fresh,
	nextArgs,
	dependencyMigrations: [authMigrationChain],
}).catch((error) => {
	console.error("pglite-dev: failed to start —", error);
	process.exit(1);
});
