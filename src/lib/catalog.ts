import "server-only";
import { demoProducts } from "./demo";
import type { Product } from "./types";
import { databaseConfigured, query, sql } from "./database";
export async function getCatalog(): Promise<{
  products: Product[];
  demo: boolean;
}> {
  if (!databaseConfigured()) return { products: demoProducts, demo: true };
  const products = await query<Product>(
    sql`select * from public.products where active = true order by created_at desc limit 500`,
  );
  // Empty connected stores show clearly labeled examples until sellers publish inventory.
  return products.length
    ? { products, demo: false }
    : { products: demoProducts, demo: true };
}
