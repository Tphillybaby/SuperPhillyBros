import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { saveEnv } from "./env.mjs";

function cli(args, json = false) {
  const result = spawnSync("supabase", args, {
    encoding: "utf8",
    env: process.env,
    timeout: 180000,
  });
  if (result.status !== 0) {
    let message = result.stderr || result.error?.message || "Command failed";
    for (const [key, value] of Object.entries(process.env))
      if (/PASSWORD|TOKEN|SECRET|KEY/.test(key) && value && value.length > 5)
        message = message.split(value).join("[redacted]");
    throw new Error(`Supabase ${args[0]} failed: ${message.slice(0, 1600)}`);
  }
  return json ? JSON.parse(result.stdout) : result.stdout;
}
async function main() {
  const create = process.argv.includes("--create");
  const configureAuth = process.argv.includes("--configure-auth");
  const projects = cli(["projects", "list", "-o", "json"], true);
  let ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) {
    const existing = projects.filter(
      (p) => p.name === "super-philliy-bros-collectibles",
    );
    if (existing.length === 1) ref = existing[0].id;
    else if (!create)
      throw new Error(
        "Set SUPABASE_PROJECT_REF in .env.local, or run npm run setup -- --create to create a dedicated project.",
      );
    else {
      const orgs = cli(["orgs", "list", "-o", "json"], true);
      const org =
        process.env.SUPABASE_ORG_ID || (orgs.length === 1 ? orgs[0].id : null);
      if (!org)
        throw new Error(
          "Set SUPABASE_ORG_ID to choose the organization for the new project.",
        );
      saveEnv({
        SUPABASE_DB_PASSWORD:
          process.env.SUPABASE_DB_PASSWORD ||
          randomBytes(30).toString("base64url"),
      });
      console.log("Creating the dedicated Supabase project…");
      const created = cli(
        [
          "projects",
          "create",
          "super-philliy-bros-collectibles",
          "--org-id",
          org,
          "--db-password",
          process.env.SUPABASE_DB_PASSWORD,
          "--region",
          "us-east-1",
          "-o",
          "json",
        ],
        true,
      );
      ref = created.id;
      if (!ref)
        throw new Error(
          "Project creation did not return an ID. Check the Supabase dashboard before retrying.",
        );
    }
    saveEnv({ SUPABASE_PROJECT_REF: ref });
  }
  if (!/^[a-z0-9]{20}$/.test(ref))
    throw new Error("Invalid Supabase project reference.");
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const project = cli(["projects", "list", "-o", "json"], true).find(
      (p) => p.id === ref,
    );
    if (project?.status === "ACTIVE_HEALTHY") {
      healthy = true;
      break;
    }
    console.log("Waiting for the project to become ready…");
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!healthy)
    throw new Error(
      "The project is still provisioning. Run setup again when it is ready.",
    );
  if (!process.env.SUPABASE_DB_PASSWORD)
    throw new Error(
      "Set SUPABASE_DB_PASSWORD for this project in .env.local to apply migrations.",
    );
  cli(["link", "--project-ref", ref, "--yes"]);
  cli(["db", "push", "--linked", "--yes"]);
  console.log("Database migration and storage policies applied.");
  const keys = cli(
    ["projects", "api-keys", "--project-ref", ref, "-o", "json"],
    true,
  );
  const publicKey = keys.find((k) => k.name === "anon")?.api_key;
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!publicKey || !serviceKey)
    throw new Error(
      "Project API keys were unavailable. Add the publishable and service keys to .env.local.",
    );
  saveEnv({
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    CRON_SECRET: process.env.CRON_SECRET || randomBytes(32).toString("hex"),
    STORE_LIVE: process.env.STORE_LIVE || "false",
  });
  if (create || configureAuth) {
    const origin = new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    ).origin;
    const config = readFileSync("supabase/config.toml", "utf8")
      .replace(/^site_url = .*$/m, `site_url = ${JSON.stringify(origin)}`)
      .replace(
        /^additional_redirect_urls = .*$/m,
        `additional_redirect_urls = [${JSON.stringify(`${origin}/auth/callback`)}]`,
      );
    writeFileSync("supabase/config.toml", config);
    cli(["config", "push", "--project-ref", ref, "--yes"]);
    console.log("Seller sign-in URL configured; public signups disabled.");
  } else
    console.log(
      "Auth config preserved. For this dedicated store, use --configure-auth to apply its sign-in settings.",
    );
  const emails = (process.env.SELLER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))
    throw new Error("SELLER_EMAILS must be comma-separated email addresses.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  for (const email of emails) {
    let user;
    let page = 1;
    while (!user) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (error) throw new Error("Could not list seller accounts.");
      user = data.users.find((u) => u.email?.toLowerCase() === email);
      if (data.users.length < 100) break;
      page++;
    }
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (error) throw new Error("Could not create a seller account.");
      user = data.user;
    }
    const { error } = await db
      .from("sellers")
      .upsert({ user_id: user.id, display_name: "Seller" });
    if (error) throw new Error("Could not grant seller access.");
  }
  console.log(
    `${emails.length} seller account(s) configured. No invitation emails were sent.`,
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
    "Setup finished. Add real products, verify shipping/tax/payment settings, then run npm run deploy. Checkout stays disabled until STORE_LIVE=true.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
