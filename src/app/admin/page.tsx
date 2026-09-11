import { databaseConfigured, query, sql } from "@/lib/database";
import { requireSeller } from "@/lib/auth/server";
import {
  AdminStudio,
  SellerLogin,
  type Order,
} from "@/components/admin-studio";
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
  let account;
  try {
    account = await requireSeller();
  } catch (error) {
    return <SellerLogin reason={(error as Error).message} />;
  }
  const [products, orders] = await Promise.all([
    query<Product>(
      sql`select * from public.products order by created_at desc limit 500`,
    ),
    query<Order>(
      sql`select o.*, coalesce((select json_agg(i) from public.order_items i where i.order_id = o.id), '[]'::json) as order_items from public.orders o order by o.created_at desc limit 200`,
    ),
  ]);
  return (
    <AdminStudio
      products={products}
      orders={orders}
      demo={false}
      email={account.user.email}
      live={process.env.STORE_LIVE === "true"}
      isOwner={account.seller.is_owner}
    />
  );
}
