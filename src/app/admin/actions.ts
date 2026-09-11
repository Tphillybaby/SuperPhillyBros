"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSeller } from "@/lib/supabase/server";
import { productSchema } from "@/lib/validation";
export async function saveProduct(input: unknown) {
  const { db } = await requireSeller();
  const product = productSchema.parse(input);
  const { id, ...fields } = product;
  const result = id
    ? await db
        .from("products")
        .update(fields)
        .eq("id", id)
        .select("id")
        .single()
    : await db.from("products").insert(fields).select("id").single();
  if (result.error)
    throw new Error(
      result.error.code === "23505"
        ? "That product URL is already in use. Choose a different name or slug."
        : "The product could not be saved. Check its fields and try again.",
    );
  revalidatePath("/");
  revalidatePath("/admin");
  return { id: result.data.id };
}
export async function archiveProduct(id: string) {
  const { db } = await requireSeller();
  z.uuid().parse(id);
  const { error } = await db
    .from("products")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error("Could not archive this product.");
  revalidatePath("/");
  revalidatePath("/admin");
}
export async function shipOrder(input: unknown) {
  const values = z
    .object({
      id: z.uuid(),
      tracking: z.string().trim().min(3).max(100),
      carrier: z.string().trim().min(2).max(50),
    })
    .parse(input);
  const { db } = await requireSeller();
  const { error } = await db.rpc("ship_order", {
    p_order_id: values.id,
    p_tracking: values.tracking,
    p_carrier: values.carrier,
  });
  if (error)
    throw new Error(
      "Could not update shipment. Only paid orders can be shipped.",
    );
  revalidatePath("/admin");
}
