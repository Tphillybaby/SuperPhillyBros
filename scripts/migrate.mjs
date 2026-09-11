import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
export async function migrateStore(
  connectionString = process.env.DATABASE_URL_UNPOOLED,
) {
  if (!connectionString)
    throw new Error("DATABASE_URL_UNPOOLED is required for migrations.");
  if (new URL(connectionString).hostname.includes("-pooler"))
    throw new Error("Migrations require the direct database URL.");
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("/migrate.mjs")) {
  try {
    await migrateStore();
    console.log("Store migrations applied.");
  } catch {
    console.error(
      "Store migration failed. Check the database connection and migration history.",
    );
    process.exitCode = 1;
  }
}
