import test from "node:test";
import assert from "node:assert/strict";
import { shippingCents } from "../src/lib/shipping-rate";

test("shipping accepts free delivery and exact dollar/cents amounts", () => {
  assert.equal(shippingCents("0"), 0);
  assert.equal(shippingCents("5.99"), 599);
  assert.equal(shippingCents("10.10"), 1010);
  assert.equal(shippingCents("1000.00"), 100000);
});
test("shipping rejects negative, non-finite, excessive and fractional-cent prices", () => {
  for (const value of ["", " ", "-1", "NaN", "Infinity", "1e2", "5.999", "1000.01", null, 599])
    assert.throws(() => shippingCents(value));
});

test("shipping settings persist one rate, reject invalid cents, and deny public access", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/lib/shipping.ts", import.meta.url), "utf8");
  const schema = source.match(/shippingTableSql = `([^`]+)`/)?.[1];
  assert.ok(schema);
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec("alter table public.shipping_settings enable row level security; revoke all on public.shipping_settings from public;");
    await db.exec("insert into public.shipping_settings values (true,599); insert into public.shipping_settings values (true,0) on conflict(id) do update set flat_cents=excluded.flat_cents;");
    assert.deepEqual((await db.query("select flat_cents from public.shipping_settings")).rows, [{ flat_cents: 0 }]);
    await assert.rejects(db.exec("update public.shipping_settings set flat_cents=-1"));
    await assert.rejects(db.exec("update public.shipping_settings set flat_cents=100001"));
    await db.exec("create role shipping_visitor; set role shipping_visitor;");
    await assert.rejects(db.query("select * from public.shipping_settings"));
    await assert.rejects(db.exec("update public.shipping_settings set flat_cents=1"));
  } finally { await db.close(); }
});

test("combined shipping charges the highest listing rate once", async () => {
  const { combinedShipping } = await import("../src/lib/shipping-rate");
  assert.equal(combinedShipping(["4.99", "10.00"], 599), 1000);
  assert.equal(combinedShipping(["0", "0"], 599), 0);
  assert.equal(combinedShipping([undefined, "2.00"], 599), 599);
});
