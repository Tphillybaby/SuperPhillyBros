import "server-only";
import { Pool, types } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
export { sql };
// Keep timestamps serializable across the server/client boundary.
types.setTypeParser(1184, (value: string) => new Date(value).toISOString());
let database: ReturnType<typeof drizzle> | undefined;
export const databaseConfigured = () => Boolean(process.env.DATABASE_URL);
export function getDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error("The store database is not connected yet.");
  if (!database) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 15000,
    });
    attachDatabasePool(pool);
    database = drizzle(pool);
  }
  return database;
}
export async function query<T extends Record<string, unknown>>(
  statement: SQL,
): Promise<T[]> {
  return (await getDatabase().execute<T>(statement)).rows as T[];
}
