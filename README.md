# Super Philliy Bro’s Collectibles

An Ohio-based Next.js store for two brothers selling diecast cars and Pokémon collectibles. Neon provides PostgreSQL and seller authentication, Vercel Blob stores product photos, Stripe handles hosted checkout, and Vercel hosts the site.

Store: https://super-philliy-bros-collectibles.vercel.app
Seller studio: https://super-philliy-bros-collectibles.vercel.app/admin

## Connected Neon project

Project `flat-glade-72499023`, branch `production` (`br-super-base-aeawvd60`). The requested `neon.ts` intentionally contains `defineConfig({})`; PostgreSQL is included by default. Neon Auth was enabled separately through the CLI. The `.neon` link and all environment secrets are ignored by Git.

The Neon CLI, project skills, and MCP configuration are installed. The CLI's skills command needs Node 22.20 or newer. On machines with an older Node 22 installation, use `npx --yes --package=node@22 --package=skills@latest -- neon skills -y`.

`neon deploy` applies Neon service configuration. `npm run deploy` validates and deploys the storefront to Vercel. These commands serve different purposes.

## Seller access

Open the seller studio and sign in with an approved email address and password. Access is private to the two brothers. Public visitors cannot grant themselves seller access. The “Set up your approved account” form requires an allowlisted address and email verification; passwords are entered directly on the site, never shared in chat.

`SELLER_EMAILS` privately configures the approved addresses (one during initial setup, at most two). `npm run setup` atomically replaces seller access with exactly that list; it does not delete authentication accounts or send email. The first address is the owner. The studio has no seller-invitation endpoint. Final email addresses will be supplied when the custom domain is chosen; the existing approved address remains unchanged until then.

The storefront identifies the business as based in Ohio. “Super Philly Bros” is the store name. Its return policy is **All sales are final**, displayed on `/returns`, product details, and the shopping bag.

Add a real product, upload its photo, set its price and available quantity, and publish it. Empty storefronts show explicitly labeled examples; those examples are never inserted into the real database. The decorative illustration is not a photograph of sellable inventory.

## Development and deployment

```sh
npm ci
neon link --project-id flat-glade-72499023 --branch production -y
npm run dev
```

Linking pulls PostgreSQL credentials into `.env.local`. Because the requested bare `neon.ts` only declares PostgreSQL, Neon env pull can remove the independently configured Auth URL; run `npm run setup` afterward to restore it automatically from Neon Auth status. Configure the additional values listed in `.env.example`: Neon Auth URL/cookie secret, Blob token, store URL and, when available, Stripe keys. Keep secrets server-side. For local auth, Neon must allow localhost; for a new hosted domain, add it using `neon neon-auth domain add https://your-domain.example`.

Database migrations are versioned in `drizzle/`, applied through Drizzle using the **unpooled** connection. Test schema changes on an isolated Neon branch before applying them to production.

```sh
npm run setup        # Apply migrations, register approved sellers and optionally Stripe webhook
npm run deploy       # Typecheck, tests, build, sync runtime settings, deploy to Vercel
```

`npm run db:migrate` applies only the versioned migrations. Setup is repeatable; it does not duplicate existing sellers or migrations. GitHub Actions validates pushed changes, and the connected Vercel project deploys updates from GitHub. Database migrations are applied explicitly before code that needs them is deployed; deployment does not automatically modify the production schema.

## Checkout and order automation

Checkout stays disabled while `STORE_LIVE=false`. Before opening sales, add actual inventory and complete Stripe business onboarding, payment keys/webhook setup, shipping settings, and tax configuration. Run a test purchase and verify the order, reserved stock, payment receipt, and expiration behavior.

The checkout endpoint accepts product IDs and quantities; prices are read from the database. PostgreSQL functions reserve inventory atomically, reject overselling, and deduplicate retries. Stripe Checkout collects payment and shipping details. Verified Stripe webhooks record paid orders automatically; repeated events cannot decrement stock twice. The seller records shipment tracking in the studio.

A Vercel cron reconciles expired reservations daily at 07:00 UTC. It checks Stripe before releasing stock. Failed Stripe lookups retain reservations for review. A late payment after released stock is marked `payment_review`. Shipping is US-only in USD. Sellers can set the flat shipping price per order in **Seller studio → Store setup → Shipping prices**, including $0 for free delivery. The saved database rate is used for new Stripe Checkout sessions; open sessions retain their original rate. Until the first save, `SHIPPING_FLAT_CENTS` applies (default 599 cents). On the first authenticated save, the app atomically provisions a private, RLS-protected `shipping_settings` table and stores the rate. No shipping settings are writable by public visitors. Optional Stripe automatic tax requires the store's Stripe tax settings to be configured.

The studio loads the latest 200 orders and up to 500 products. Sales totals cover the loaded paid/shipped orders. Refunds, returns, disputes, shipping-label purchases, customer service, tax registration, and packing remain seller responsibilities; payment administration is available through Stripe.

## Data protection and checks

Database connections exist only on the server. The Neon Data API is not enabled. Application tables use row-level security with no public grants, and privileged order functions are not executable by ordinary database roles. Seller operations require a verified Neon session and allowlist membership. All SQL values are parameterized. Photo upload tokens require seller authorization, a generated image path, an allowed image MIME type, and a 5 MB limit. Card information stays in Stripe Checkout.

```sh
npm run typecheck
npm test
npm run build
```

The tests execute the actual PostgreSQL migration in PGlite: access restrictions, transaction rollback, overselling attempts, idempotent retries, amount checks, expiration, replayed fulfillment, shipment status, and late-payment review. The migration and two simultaneous reservations for the last unit were also verified on an isolated hosted Neon branch. Browser authentication and upload checks are performed separately; payment processing still requires Stripe credentials.
