# Super Philliy Bro’s Collectibles

A Next.js store for two sellers, with Supabase inventory, seller authentication and photo storage, Stripe Checkout, and Vercel hosting. The spelling **Philliy** follows the requested store name.

## Run locally

```sh
npm ci
npm run dev
```

Without Supabase credentials, the store and seller studio show clearly labeled examples. Example merchandise is never seeded into a live database. Checkout is disabled by default. The generated illustration is decorative and is not a photo of real inventory.

## Connect the accounts

1. Sign in with `supabase login` and `vercel login` if needed.
2. Copy `.env.example` to `.env.local`. Add `NEXT_PUBLIC_SITE_URL` (your deployed HTTPS address) and comma-separated `SELLER_EMAILS` for the two sellers. Never commit this file or paste keys into chat.
3. For a new, dedicated Supabase project, run `npm run setup -- --create`. This selects a sole organization automatically; if there are multiple organizations, set `SUPABASE_ORG_ID` first. A database password is generated and stored privately in `.env.local`. The command creates the database, applies migrations and row security, creates product photo storage, configures seller sign-in, and creates seller accounts without sending mail.
4. For an existing **dedicated store project**, set `SUPABASE_PROJECT_REF` and its `SUPABASE_DB_PASSWORD`, then run `npm run setup`. Add `--configure-auth` to apply this store’s auth settings. Existing shared projects should be reviewed before applying the store schema or disabling public signups.
5. Add `STRIPE_SECRET_KEY` to `.env.local` and run setup again. Setup registers the production webhook and saves its signing secret locally. If that webhook already exists, supply its original signing secret; Stripe does not return it again.
6. Run `npm run deploy`. This tests, builds, synchronizes only the runtime environment variables to Vercel, and deploys production. Setup-only credentials are never sent to Vercel.

Supabase project provisioning, account access, provider quotas, Stripe business onboarding, and live bank/payment details require the account owner. No paid plan upgrades, domain purchases, or live charges are performed by these scripts.

## Before taking orders

- Add actual inventory and your own photographs in `/admin`. Drafts are private. Available quantity excludes inventory held by pending checkouts.
- Verify the two seller email accounts and magic-link delivery. Supabase’s default email service has production limitations; configure custom SMTP for dependable seller sign-in. See [Supabase email setup](https://supabase.com/docs/guides/auth/auth-smtp).
- Confirm US shipping and set `SHIPPING_FLAT_CENTS`. The initial **599 cents is a configurable assumption**, not an established business policy. This implementation supports US addresses and USD.
- Set your business tax registrations and other tax settings in Stripe before enabling `STRIPE_AUTOMATIC_TAX=true`. Configure customer receipts in Stripe. Shipping-label purchases, refunds and customer email campaigns are not automated here.
- Test a complete checkout using Stripe test keys and a real test listing, including payment webhook, inventory deduction, duplicate webhook, order display, expiration and shipment tracking. `STORE_LIVE=true` allows checkout with whichever Stripe key you supply; start with test keys. Switch to live credentials only after this verification and business setup.
- Publish the store’s actual contact information, shipping timing and return/privacy terms before promoting it to customers. Business-specific terms were not invented.

## What is automated

- Inventory is reserved in a PostgreSQL transaction before Stripe Checkout. Server-side product prices are authoritative; browser prices are never accepted.
- Duplicate checkout retries use an idempotency key. Duplicate Stripe notifications do not deduct stock or fulfill twice.
- Signed payment webhooks mark an order paid. Expired sessions restore stock once. Late payments after stock release require seller review.
- A protected Vercel cron job at 07:00 UTC daily reconciles missed notifications and stale reservations. This low-frequency fallback fits daily cron use; Stripe expiration webhooks normally release inventory promptly. If a notification is missed, a hold may remain until reconciliation. The job processes the oldest 100 expired orders per run; use a more frequent scheduler / appropriate Vercel plan for higher volume.
- Sellers manage product photos, stock, publishing, orders and tracking from the studio. Packing and shipping physical goods remain with the sellers.
- GitHub runs type checks, database/security tests, and production builds. Vercel’s Git integration deploys commits pushed to the connected production branch. Vercel deployment checks must be configured separately if you want CI failures to block its automatic deployments.

## Security and operational notes

Supabase row-level security restricts customer/order data and product writes to seller accounts. Privileged inventory/payment RPCs are callable only by the server service role. Order shipment RPCs verify seller membership and require an already paid order. Product uploads allow only JPG, PNG, or WebP, up to 5 MB. Payment card information stays in Stripe Checkout.

The payment code follows [Stripe’s fulfillment guidance](https://docs.stripe.com/checkout/fulfillment), and authentication follows [Supabase’s Next.js SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Only verified server-side user identity is used for seller authorization.

The browser shopping bag uses device-local storage. Its prices and availability are estimates until checkout. The inventory view loads up to 500 products; the order view shows the latest 200 orders, and sales totals cover those loaded orders. This is an initial store implementation, not a complete replacement for every Shopify service.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

The tests execute the migration in PGlite (PostgreSQL), including RLS restrictions, transaction rollback, overselling attempts, retry deduplication, amount verification, expiration, replayed fulfillment, seller-only shipping, and late-payment review. Hosted Supabase, live email, and Stripe end-to-end verification still require connected credentials. Browser checks are performed separately against the running storefront.

## Key files

- `src/app/` — store, seller studio, product pages, checkout, webhook and cron routes
- `src/components/` — storefront, shopping bag, product editor and order management
- `supabase/migrations/202609110001_store.sql` — database and security policies
- `scripts/setup.mjs` — Supabase, seller and Stripe webhook setup
- `scripts/deploy.mjs` — verified Vercel deployment and secret synchronization
- `.github/workflows/ci.yml` — automatic build and database/security checks

Secrets are ignored by Git. `.env.local` is stored with owner-only file permissions by setup. Regenerate production secrets through each provider if they are ever disclosed.
