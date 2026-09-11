import "server-only";
import Stripe from "stripe";
import { serviceDatabase } from "./supabase/server";
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
  const db = serviceDatabase();
  if (session.payment_status === "paid") {
    const { error } = await db.rpc("complete_order", {
      p_order_id: orderId,
      p_session_id: session.id,
      p_total: session.amount_total,
      p_subtotal: session.amount_subtotal,
      p_currency: session.currency,
      p_email: session.customer_details?.email || null,
      p_shipping: session.collected_information?.shipping_details || {},
      p_payment_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null,
      p_tax: session.total_details?.amount_tax || 0,
      p_shipping_cents: session.total_details?.amount_shipping || 0,
    });
    if (error) throw error;
  } else if (session.status === "expired") {
    const { error } = await db.rpc("release_order", { p_order_id: orderId });
    if (error) throw error;
  }
}
