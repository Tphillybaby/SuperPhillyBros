import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileSession, stripeClient } from "@/lib/payments";
import { serviceDatabase } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  const received = request.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    received.length !== expected.length ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.STRIPE_SECRET_KEY)
    return NextResponse.json({ skipped: "Store setup is incomplete." });
  try {
    const db = serviceDatabase();
    const stripe = stripeClient();
    const { data: orders, error } = await db
      .from("orders")
      .select("id, stripe_session_id, expires_at")
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .order("created_at")
      .limit(100);
    if (error) throw error;
    let processed = 0;
    for (const order of orders || []) {
      if (order.stripe_session_id) {
        await reconcileSession(
          await stripe.checkout.sessions.retrieve(order.stripe_session_id),
        );
      } else {
        // Recover a session created before a network interruption prevented saving its ID.
        const recovered = await stripe.checkout.sessions.list({
          created: {
            gte: Math.floor(
              (new Date(order.expires_at).getTime() - 40 * 60000) / 1000,
            ),
            lte: Math.floor(new Date(order.expires_at).getTime() / 1000),
          },
          limit: 100,
        });
        if (recovered.has_more)
          throw new Error(
            "Manual reconciliation needed: session recovery window exceeds 100 sessions.",
          );
        const session = recovered.data.find(
          (s) => s.metadata?.order_id === order.id,
        );
        if (session) {
          const { error: attachError } = await db.rpc(
            "attach_checkout_session",
            { p_order_id: order.id, p_session_id: session.id },
          );
          if (attachError) throw attachError;
          await reconcileSession(session);
        } else {
          const { error: releaseError } = await db.rpc("release_order", {
            p_order_id: order.id,
          });
          if (releaseError) throw releaseError;
        }
      }
      processed++;
    }
    return NextResponse.json({ processed });
  } catch {
    return NextResponse.json(
      {
        error:
          "Reconciliation failed. Reserved inventory was retained for review.",
      },
      { status: 500 },
    );
  }
}
