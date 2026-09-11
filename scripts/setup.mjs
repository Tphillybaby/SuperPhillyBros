import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import Stripe from "stripe";
import { saveEnv } from "./env.mjs";
import { migrateStore } from "./migrate.mjs";
async function main() {
  // The requested bare neon.ts pulls Postgres only; restore Auth's independent setting.
  if (!process.env.NEON_AUTH_BASE_URL) {
    const status = JSON.parse(
      execFileSync("neon", ["neon-auth", "status", "--output", "json"], {
        encoding: "utf8",
      }),
    );
    if (!status.base_url)
      throw new Error("Enable Neon Auth before running store setup.");
    saveEnv({ NEON_AUTH_BASE_URL: status.base_url });
  }
  await migrateStore();
  saveEnv({
    CRON_SECRET: process.env.CRON_SECRET || randomBytes(32).toString("hex"),
    NEON_AUTH_COOKIE_SECRET:
      process.env.NEON_AUTH_COOKIE_SECRET || randomBytes(32).toString("hex"),
    STORE_LIVE: process.env.STORE_LIVE || "false",
  });
  const emails = (process.env.SELLER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))
    throw new Error("SELLER_EMAILS must contain valid email addresses.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    max: 1,
  });
  try {
    for (const [index, email] of emails.entries())
      await pool.query(
        "insert into public.sellers(email,is_owner) values($1,$2) on conflict(email) do nothing",
        [email, index === 0],
      );
  } finally {
    await pool.end();
  }
  console.log(
    `Configured ${emails.length} approved seller address(es). No emails sent.`,
  );
  if (
    process.env.STRIPE_SECRET_KEY &&
    process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")
  ) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const url = `${new URL(process.env.NEXT_PUBLIC_SITE_URL).origin}/api/stripe/webhook`;
    let existing;
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (endpoint.url === url) {
        existing = endpoint;
        break;
      }
    }
    const events = [
      "checkout.session.completed",
      "checkout.session.expired",
      "checkout.session.async_payment_succeeded",
    ];
    if (!existing) {
      const endpoint = await stripe.webhookEndpoints.create({
        url,
        enabled_events: events,
        description: "Super Philliy Bros inventory and order automation",
      });
      saveEnv({ STRIPE_WEBHOOK_SECRET: endpoint.secret });
    } else {
      await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: events,
      });
      if (!process.env.STRIPE_WEBHOOK_SECRET)
        throw new Error(
          "Webhook already exists. Save its signing secret in .env.local; it cannot be retrieved again.",
        );
    }
    console.log("Stripe webhook configured.");
  }
  console.log(
    "Neon store setup complete. Checkout stays disabled until STORE_LIVE=true.",
  );
}
main().catch(() => {
  console.error(
    "Store setup failed. Check Neon connection, seller addresses, and Stripe configuration.",
  );
  process.exitCode = 1;
});
