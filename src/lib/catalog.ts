import "server-only";
import { createClient } from "@supabase/supabase-js";
import { demoProducts } from "./demo";
import type { Product } from "./types";
import { databaseConfigured } from "./supabase/server";
export async function getCatalog(): Promise<{
  products: Product[];
  demo: boolean;
}> {
  if (!databaseConfigured()) return { products: demoProducts, demo: true };
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error)
    throw new Error(
      "The collection is temporarily unavailable. Please try again shortly.",
    );
  return { products: data as Product[], demo: false };
}
