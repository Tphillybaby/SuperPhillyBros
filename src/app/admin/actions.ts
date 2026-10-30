"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSeller } from "@/lib/auth/server";
import { query, sql } from "@/lib/database";
import { productSchema } from "@/lib/validation";
import { sendTrackingEmail } from "@/lib/tracking-email";
import { setShippingRate } from "@/lib/shipping";

export async function saveShippingRate(value: unknown) {
  await requireSeller();
  const cents = await setShippingRate(value);
  revalidatePath("/admin");
  return cents;
}

export async function saveProduct(input: unknown) {
  await requireSeller();
  const p = productSchema.parse(input);
  try {
    const [result] = await query<{ id: string }>(
      p.id
        ? sql`update public.products set slug=${p.slug}, name=${p.name}, category=${p.category}, brand=${p.brand}, price_cents=${p.price_cents}, stock=${p.stock}, condition=${p.condition}, description=${p.description}, image_url=${p.image_url}, featured=${p.featured}, active=${p.active}, details=${JSON.stringify(p.details)}::jsonb where id=${p.id} and stock=${p.expected_stock} returning id`
        : sql`insert into public.products (slug,name,category,brand,price_cents,stock,condition,description,image_url,featured,active,details) values (${p.slug},${p.name},${p.category},${p.brand},${p.price_cents},${p.stock},${p.condition},${p.description},${p.image_url},${p.featured},${p.active},${JSON.stringify(p.details)}::jsonb) returning id`,
    );
    if (!result) throw new Error("Product missing");
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/products", "layout");
    return result;
  } catch {
    throw new Error(
      "The product could not be saved. Reload the product if inventory changed, check its fields, and choose a unique product URL.",
    );
  }
}
export async function archiveProduct(id: string) {
  await requireSeller();
  z.uuid().parse(id);
  await query(sql`update public.products set active=false where id=${id}`);
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/products", "layout");
}
export async function shipOrder(input: unknown) {
  await requireSeller();
  const p = z
    .object({
      id: z.uuid(),
      tracking: z.string().trim().min(3).max(100),
      carrier: z.string().trim().min(2).max(50),
    })
    .parse(input);
  try {
    await query(
      sql`select public.ship_order(${p.id}::uuid,${p.tracking},${p.carrier})`,
    );
  } catch {
    throw new Error(
      "Could not update shipment. Only paid orders can be shipped.",
    );
  }
  const message = await sendTrackingEmail(p.id);
  revalidatePath("/admin");
  return { message };
}
