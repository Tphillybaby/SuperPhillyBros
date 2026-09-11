import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import { reconcileSession, stripeClient } from "@/lib/payments";
import { ClearPaidCart } from "@/components/clear-paid-cart";
export const dynamic = "force-dynamic";
export default async function Success({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  let paid = false;
  let saved = false;
  if (session_id?.startsWith("cs_") && process.env.STRIPE_SECRET_KEY) {
    try {
      const session =
        await stripeClient().checkout.sessions.retrieve(session_id);
      paid = session.payment_status === "paid" && !!session.metadata?.order_id;
      if (paid) {
        await reconcileSession(session);
        saved = true;
      }
    } catch {
      /* The webhook will retry fulfillment. No personal data is exposed. */
    }
  }
  return (
    <main className="message-page">
      {paid ? <CheckCircle2 size={52} /> : <Clock3 size={52} />}
      <span className="eyebrow">SUPER PHILLIY BRO’S COLLECTIBLES</span>
      <h1>{paid ? "A great find. Now yours." : "Checking your payment."}</h1>
      <p>
        {paid
          ? saved
            ? "Your payment is confirmed and your order is in our studio. Thanks for collecting with us."
            : "Your payment is confirmed. We’re finishing the order update; no further payment is needed."
          : "If you just paid, confirmation can take a moment. Refresh this page shortly or check your payment receipt."}
      </p>
      {paid && <ClearPaidCart />}
      <Link className="button primary" href="/">
        Back to the collection
      </Link>
    </main>
  );
}
