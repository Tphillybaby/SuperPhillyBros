import Storefront from "@/components/storefront";
import { getCatalog } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [params, catalog] = await Promise.all([searchParams, getCatalog()]);
  return (
    <Storefront
      {...catalog}
      initialCategory={
        ["Diecast", "Pokémon"].includes(params.category || "")
          ? params.category
          : "All finds"
      }
    />
  );
}
