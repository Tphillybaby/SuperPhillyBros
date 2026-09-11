export type Category = "Diecast" | "Pokémon";
export type Product = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  brand: string;
  price_cents: number;
  stock: number;
  condition: string;
  description: string;
  image_url: string;
  featured: boolean;
  active: boolean;
  created_at: string;
  details: Record<string, string>;
};
export type CartItem = { product: Product; quantity: number };
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
