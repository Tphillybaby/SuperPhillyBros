"use client";
import Link from "next/link";
import { ArrowLeft, Plus, PackageCheck } from "lucide-react";
import { ProductImage, useCart } from "./store";
import { money, type Product } from "@/lib/types";
export function ProductListing({
  product,
  demo,
}: {
  product: Product;
  demo: boolean;
}) {
  const { add } = useCart();
  return (
    <main className="listing-page section">
      <Link href="/#collection" className="text-link">
        <ArrowLeft size={16} /> Back to the collection
      </Link>
      {demo && (
        <p className="notice">
          Example listing · illustrative artwork · not available to purchase
        </p>
      )}
      <div className="product-detail">
        <ProductImage product={product} />
        <div>
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>
          <p className="detail-price">{money(product.price_cents)}</p>
          <span className="condition-tag">{product.condition}</span>
          <p className="description">{product.description}</p>
          <dl>
            {Object.entries(product.details || {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="stock-note">
            <PackageCheck size={17} />
            {product.stock
              ? `${product.stock} available${demo ? " in this example" : ""}`
              : "Sold out"}
          </p>
          <button
            className="button primary full"
            disabled={!product.stock}
            onClick={() => add(product)}
          >
            Add to bag <Plus size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
