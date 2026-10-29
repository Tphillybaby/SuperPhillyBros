import "server-only";
import { getDatabase, query, sql } from "./database";
import { shippingCents } from "./shipping-rate";

// Provisioned only on an authenticated seller's first save. Reads preserve the
// existing environment rate until then; ordinary storefront visits never run DDL.
export const shippingTableSql = `create table if not exists public.shipping_settings (
  id boolean primary key default true check (id),
  flat_cents integer not null check (flat_cents between 0 and 100000)
)`;

export async function getShippingCents(): Promise<number> {
  try {
    const [row] = await query<{ flat_cents: number }>(
      sql`select flat_cents from public.shipping_settings where id=true`,
    );
    if (row) return row.flat_cents;
  } catch (error) {
    let cause: unknown = error;
    while (cause && typeof cause === "object") {
      if ("code" in cause && cause.code === "42P01") break;
      cause = "cause" in cause ? cause.cause : undefined;
    }
    if (!cause) throw error;
  }
  const rate = Number(process.env.SHIPPING_FLAT_CENTS ?? "599");
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100000)
    throw new Error("Invalid shipping configuration.");
  return rate;
}

// Caller must authenticate the seller before invoking this server-only helper.
export async function setShippingRate(value: unknown) {
  const cents = shippingCents(value);
  await getDatabase().transaction(async (tx) => {
    // Serialize first saves so table creation and its permissions are atomic.
    await tx.execute(sql`select pg_advisory_xact_lock(73910517)`);
    await tx.execute(sql.raw(shippingTableSql));
    await tx.execute(
      sql`alter table public.shipping_settings enable row level security`,
    );
    await tx.execute(sql`revoke all on public.shipping_settings from public`);
    await tx.execute(
      sql`insert into public.shipping_settings (id,flat_cents) values (true,${cents}) on conflict (id) do update set flat_cents=excluded.flat_cents`,
    );
  });
  return cents;
}
