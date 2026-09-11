import { databaseConfigured, requireSeller } from "@/lib/supabase/server";
import { AdminStudio, SellerLogin } from "@/components/admin-studio";
import { demoProducts } from "@/lib/demo";
import type { Product } from "@/lib/types";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Seller Studio | Super Philliy Bro’s",
  robots: { index: false, follow: false },
};
export default async function Admin() {
  if (!databaseConfigured())
    return (
      <AdminStudio
        products={demoProducts}
        orders={[]}
        demo
        email="Store preview"
        live={false}
      />
    );
  let seller;
  try {
    seller = await requireSeller();
  } catch {
    return <SellerLogin />;
  }
  const [products, orders] = await Promise.all([
    seller.db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    seller.db
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (products.error || orders.error)
    throw new Error("Could not load the seller studio.");
  return (
    <AdminStudio
      products={products.data as Product[]}
      orders={orders.data}
      demo={false}
      email={seller.user.email || "Seller"}
      live={process.env.STORE_LIVE === "true"}
    />
  );
}
