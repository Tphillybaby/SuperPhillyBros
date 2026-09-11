import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { checkoutSchema } from "@/lib/validation";
import { serviceDatabase } from "@/lib/supabase/server";
import { storeOrigin, stripeClient } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STORE_LIVE !== "true"
  )
    return NextResponse.json(
      {
        error:
          "This store is in preview. Purchases will open once the sellers finish setting up payments and real inventory.",
      },
      { status: 503 },
    );
  try {
    if (request.headers.get("origin") !== storeOrigin())
      return NextResponse.json(
        { error: "Please start checkout from the store." },
        { status: 403 },
      );
    if (Number(request.headers.get("content-length") || 0) > 12000)
      return NextResponse.json(
        { error: "Your bag is too large." },
        { status: 413 },
      );
    const body = await request.text();
    if (body.length > 12000)
      return NextResponse.json(
        { error: "Your bag is too large." },
        { status: 413 },
      );
    const parsed = checkoutSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return NextResponse.json(
        {
          error: "Your bag contains invalid items. Remove them and try again.",
        },
        { status: 400 },
      );
    const ip =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "local";
    const clientHash = createHash("sha256")
      .update(`${process.env.CRON_SECRET}:${ip}`)
      .digest("hex");
    const db = serviceDatabase();
    const { data: orderId, error } = await db.rpc("reserve_order", {
      p_items: parsed.data.items,
      p_request_id: parsed.data.requestId,
      p_client_hash: clientHash,
    });
    if (error)
      return NextResponse.json(
        {
          error: error.message.includes("Too many")
            ? "Too many checkout attempts. Please wait a few minutes."
            : "An item is no longer available in that quantity. Please refresh the store and update your bag.",
        },
        { status: 409 },
      );
    const { data: order, error: readError } = await db
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();
    if (readError || !order) throw new Error("Could not read order.");
    if (
      order.status !== "pending" ||
      new Date(order.expires_at).getTime() <= Date.now() + 1000
    )
      return NextResponse.json(
        {
          error:
            "This checkout has ended. Update your bag to start a new checkout.",
        },
        { status: 409 },
      );
    const stripe = stripeClient();
    if (order.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(
        order.stripe_session_id,
      );
      if (existing.status === "open" && existing.url)
        return NextResponse.json({ url: existing.url });
      return NextResponse.json(
        {
          error:
            "This checkout has ended. Update your bag to start a new checkout.",
        },
        { status: 409 },
      );
    }
    const shipping = Number(process.env.SHIPPING_FLAT_CENTS || "599");
    if (!Number.isSafeInteger(shipping) || shipping < 0 || shipping > 100000)
      throw new Error("Invalid shipping configuration.");
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: order.id,
        metadata: { order_id: order.id },
        expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
        line_items: order.order_items.map(
          (item: {
            name: string;
            unit_price_cents: number;
            quantity: number;
          }) => ({
            quantity: item.quantity,
            price_data: {
              currency: "usd",
              unit_amount: item.unit_price_cents,
              product_data: { name: item.name },
              tax_behavior: "exclusive",
            },
          }),
        ),
        shipping_address_collection: { allowed_countries: ["US"] },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: shipping, currency: "usd" },
              display_name: "Standard shipping",
            },
          },
        ],
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
        success_url: `${storeOrigin()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${storeOrigin()}/?checkout=cancelled#collection`,
      },
      { idempotencyKey: `checkout-${order.id}` },
    );
    const { error: attachError } = await db.rpc("attach_checkout_session", {
      p_order_id: order.id,
      p_session_id: session.id,
    });
    if (attachError) throw attachError;
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(
      "Checkout error:",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return NextResponse.json(
      {
        error:
          "Checkout could not open. Please try again shortly; you have not been charged by this request.",
      },
      { status: 500 },
    );
  }
}
