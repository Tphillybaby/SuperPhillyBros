import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { ProductListing } from "@/components/product-listing";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { products, demo } = await getCatalog();
  const product = products.find((p) => p.slug === slug);
  return {
    title: product
      ? `${product.name} | Super Philly Bros`
      : "Product not found",
    description: product?.description,
    ...(demo ? { robots: { index: false, follow: false } } : {}),
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { products, demo } = await getCatalog();
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  return <ProductListing product={product} demo={demo} />;
}
