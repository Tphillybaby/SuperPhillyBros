import { z } from "zod";
import { shippingCents } from "./shipping-rate";
export const checkoutSchema = z
  .object({
    requestId: z.uuid(),
    items: z
      .array(
        z
          .object({ id: z.uuid(), quantity: z.number().int().min(1).max(20) })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((i) => i.id)).size === value.items.length,
    "Duplicate items are not allowed.",
  );
export const productSchema = z
  .object({
    id: z.uuid().optional(),
    expected_stock: z.number().int().min(0).max(100000).optional(),
    name: z.string().trim().min(3).max(160),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(180),
    category: z.enum(["Diecast", "Pokémon"]),
    brand: z.string().trim().max(100),
    price_cents: z.number().int().min(50).max(9999999),
    stock: z.number().int().min(0).max(100000),
    condition: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(6000),
    image_url: z
      .url()
      .refine((s) => s.startsWith("https://"), "Use an HTTPS image URL."),
    featured: z.boolean(),
    active: z.boolean(),
    details: z
      .record(z.string().max(60), z.string().max(250))
      .refine((d) => Object.keys(d).length <= 20),
  })
  .strict()
  .refine((p) => {
    if (p.details["Shipping (USD)"] === undefined) return true;
    try { shippingCents(p.details["Shipping (USD)"]); return true; } catch { return false; }
  }, { message: "Enter a valid listing shipping price from $0 to $1,000." })
  .refine((p) => !p.id || p.expected_stock !== undefined, {
    message: "Reload this product before editing its inventory.",
  });
