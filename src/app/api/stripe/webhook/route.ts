import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { reconcileSession, stripeClient } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json(
      { error: "Missing webhook signature." },
      { status: 400 },
    );
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  try {
    if (
      [
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      await reconcileSession(event.data.object as Stripe.Checkout.Session);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Payment reconciliation failed:",
      error instanceof Error ? error.message : "Database failure",
    );
    return NextResponse.json(
      { error: "Could not reconcile payment. Stripe should retry." },
      { status: 500 },
    );
  }
}
