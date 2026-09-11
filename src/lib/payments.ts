import "server-only";
import Stripe from "stripe";
import { query, sql } from "./database";
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Payments are not connected yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}
export function storeOrigin() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("Store URL is not configured.");
  return new URL(url).origin;
}
export async function reconcileSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;
  if (session.payment_status === "paid") {
    const paymentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;
    await query(
      sql`select public.complete_order(${orderId}::uuid,${session.id},${session.amount_total}::integer,${session.amount_subtotal}::integer,${session.currency},${session.customer_details?.email || null},${JSON.stringify(session.collected_information?.shipping_details || {})}::jsonb,${paymentId},${session.total_details?.amount_tax || 0}::integer,${session.total_details?.amount_shipping || 0}::integer)`,
    );
  } else if (session.status === "expired") {
    await query(sql`select public.release_order(${orderId}::uuid)`);
  }
}
