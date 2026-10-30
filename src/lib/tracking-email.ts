import "server-only";
import { createHash } from "node:crypto";
import { getDatabase, sql } from "./database";
import { trackingMessage } from "./tracking-email-content";

export const trackingEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.SHIPPING_EMAIL_FROM);

// Invoked only after an authenticated seller saves a shipment. A private ledger
// prevents duplicate notices, including retries beyond the provider's key window.
export async function sendTrackingEmail(id: string): Promise<string> {
  if (!trackingEmailConfigured()) return "Tracking saved. Customer email was not sent: connect the store's email service first.";
  try {
    return await getDatabase().transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(73910518)`);
      await tx.execute(sql`create table if not exists public.shipment_email_receipts (fingerprint text primary key, provider_id text not null, sent_at timestamptz not null default now())`);
      await tx.execute(sql`alter table public.shipment_email_receipts enable row level security`);
      await tx.execute(sql`revoke all on public.shipment_email_receipts from public`);
      const result = await tx.execute(sql`select id,customer_email,tracking_number,shipping_carrier from public.orders where id=${id} and status='shipped' for update`);
      const order = result.rows[0] as { id: string; customer_email: string; tracking_number: string; shipping_carrier: string } | undefined;
      if (!order?.customer_email) return "Tracking saved. No customer email address is available; contact the buyer directly.";
      const fingerprint = createHash("sha256").update(JSON.stringify([order.id,order.customer_email,order.tracking_number,order.shipping_carrier])).digest("hex");
      const previous = await tx.execute(sql`select fingerprint from public.shipment_email_receipts where fingerprint=${fingerprint}`);
      if (previous.rows.length) return "Tracking saved. This tracking email was already sent; no duplicate was sent.";
      const message = trackingMessage(order);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `tracking-${fingerprint}` },
        body: JSON.stringify({ from: process.env.SHIPPING_EMAIL_FROM, to: [order.customer_email], ...message }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Email provider rejected request");
      const sent = await response.json() as { id?: string };
      if (!sent.id) throw new Error("Email provider did not acknowledge request");
      await tx.execute(sql`insert into public.shipment_email_receipts (fingerprint,provider_id) values (${fingerprint},${sent.id})`);
      return "Shipment saved. Tracking email accepted for delivery to the customer.";
    });
  } catch {
    return "Tracking saved, but the customer email could not be sent. Check the email service and save this shipment again to retry.";
  }
}
