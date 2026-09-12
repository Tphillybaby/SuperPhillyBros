import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { finalSaleSummary, finalSaleDetails } from "@/lib/store-policy";
export const metadata = {
  title: "Return policy | Super Philly Bros",
  description:
    "Super Philly Bros Collectibles return policy: all sales are final.",
};
export default function Returns() {
  return (
    <main className="policy-page section">
      <span className="eyebrow">SUPER PHILLY BROS · OHIO</span>
      <h1>Return policy</h1>
      <div className="policy-card">
        <span className="policy-star" aria-hidden="true">
          ★
        </span>
        <h2>{finalSaleSummary}</h2>
        <p>{finalSaleDetails}</p>
      </div>
      <Link className="button secondary" href="/#collection">
        <ArrowLeft size={17} /> Back to the collection
      </Link>
    </main>
  );
}
