import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileSession, stripeClient } from "@/lib/payments";
import { query, sql } from "@/lib/database";
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
  if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY)
    return NextResponse.json({ skipped: "Store setup is incomplete." });
  try {
    const stripe = stripeClient();
    const orders = await query<{
      id: string;
      stripe_session_id: string | null;
      expires_at: string;
    }>(
      sql`select id,stripe_session_id,expires_at from public.orders where status='pending' and expires_at < now() order by created_at limit 100`,
    );
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
          await query(
            sql`select public.attach_checkout_session(${order.id}::uuid,${session.id})`,
          );
          await reconcileSession(session);
        } else {
          await query(sql`select public.release_order(${order.id}::uuid)`);
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
