import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { checkoutSchema, productSchema } from "../src/lib/validation";
import { randomUUID } from "node:crypto";
import { configureSellerAccess } from "../scripts/seller-access.mjs";

test("checkout validation rejects price injection, duplicates and invalid quantities", () => {
  const id = randomUUID();
  const base = { requestId: randomUUID(), items: [{ id, quantity: 1 }] };
  assert.ok(checkoutSchema.safeParse(base).success);
  for (const quantity of [0, -1, 0.5, 21, "1", null])
    assert.equal(
      checkoutSchema.safeParse({ ...base, items: [{ id, quantity }] }).success,
      false,
    );
  assert.equal(checkoutSchema.safeParse({ ...base, price: 1 }).success, false);
  assert.equal(
    checkoutSchema.safeParse({ ...base, items: [...base.items, ...base.items] })
      .success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({
      ...base,
      items: [{ id, quantity: 1, price_cents: 1 }],
    }).success,
    false,
  );
});

test("listing validation rejects unsafe photo URLs and invalid money", () => {
  const listing = {
    name: "Model car",
    slug: "model-car",
    category: "Diecast",
    brand: "",
    price_cents: 1000,
    stock: 1,
    condition: "New",
    description: "A real model car listing.",
    image_url: "https://example.com/car.jpg",
    featured: false,
    active: false,
    details: {},
  };
  assert.ok(productSchema.safeParse(listing).success);
  assert.equal(
    productSchema.safeParse({ ...listing, image_url: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...listing, price_cents: 12.5 }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...listing, stock: -1 }).success,
    false,
  );
});

test("PostgreSQL migration, RLS and order lifecycle protect stock and payments", async (t) => {
  const db = new PGlite();
  await db.exec(
    "create role visitor; grant usage on schema public to visitor;",
  );
  await db.exec(
    readFileSync(new URL("../drizzle/0000_store.sql", import.meta.url), "utf8"),
  );
  await t.test(
    "seller setup allows only the approved pair and rejects invalid replacements",
    async () => {
      await configureSellerAccess(db, "previous@example.com");
      await configureSellerAccess(
        db,
        " Owner@example.com, brother@example.com, OWNER@example.com ",
      );
      const readSellers = async () =>
        (
          await db.query(
            "select email,is_owner from public.sellers order by email",
          )
        ).rows;
      const approved = await readSellers();
      assert.deepEqual(approved, [
        { email: "brother@example.com", is_owner: false },
        { email: "owner@example.com", is_owner: true },
      ]);
      for (const invalid of [
        "",
        "not-an-email",
        "owner@example.com,brother@example.com,third@example.com",
      ]) {
        await assert.rejects(configureSellerAccess(db, invalid));
        assert.deepEqual(await readSellers(), approved);
      }
    },
  );
  const product = randomUUID();
  const draft = randomUUID();
  const hash = "a".repeat(64);
  await db.query(
    "insert into public.products(id,slug,name,category,price_cents,stock,condition,active) values($1,'red-car','Red car','Diecast',2500,1,'New',true),($2,'draft-car','Draft car','Diecast',4000,0,'New',false)",
    [product, draft],
  );
  const stock = async () =>
    (
      await db.query<{ stock: number }>(
        "select stock from public.products where id=$1",
        [product],
      )
    ).rows[0].stock;
  const reserve = async (id: string, quantity = 1, items?: unknown[]) =>
    (
      await db.query<{ id: string }>(
        "select public.reserve_order($1::jsonb,$2::uuid,$3) as id",
        [JSON.stringify(items || [{ id: product, quantity }]), id, hash],
      )
    ).rows[0].id;
  await t.test(
    "unprivileged database users cannot read or mutate store data",
    async () => {
      await db.exec("set role visitor");
      for (const table of ["products", "orders", "order_items", "sellers"])
        await assert.rejects(
          db.query(`select * from public.${table}`),
          /permission denied/,
        );
      await assert.rejects(reserve(randomUUID()), /permission denied/);
      await assert.rejects(
        db.query("select public.ship_order($1,'12345','USPS')", [randomUUID()]),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  let order: string;
  await t.test(
    "stock reservations are atomic, reject overselling and deduplicate retries",
    async () => {
      const request = randomUUID();
      order = await reserve(request);
      assert.equal(await stock(), 0);
      assert.equal(await reserve(request), order);
      assert.equal(await stock(), 0);
      await assert.rejects(reserve(randomUUID()), /Not enough stock/);
      await assert.rejects(reserve(request, 2), /Invalid request reuse/);
      assert.equal(
        (await db.query("select * from public.orders")).rows.length,
        1,
      );
    },
  );
  await t.test("expiration restores inventory once", async () => {
    await db.query("select public.release_order($1)", [order!]);
    await db.query("select public.release_order($1)", [order!]);
    assert.equal(await stock(), 1);
  });
  await t.test(
    "a failed multi-item reservation rolls back earlier inventory changes",
    async () => {
      await assert.rejects(
        reserve(randomUUID(), 1, [
          { id: product, quantity: 1 },
          { id: draft, quantity: 1 },
        ]),
        /Not enough stock/,
      );
      assert.equal(await stock(), 1);
      assert.equal(
        (await db.query("select * from public.orders")).rows.length,
        1,
      );
    },
  );
  await t.test(
    "amount checks and replay-safe fulfillment preserve paid inventory",
    async () => {
      order = await reserve(randomUUID());
      await db.query("select public.attach_checkout_session($1,$2)", [
        order,
        "cs_test_store",
      ]);
      const complete = (total: number) =>
        db.query(
          "select public.complete_order($1,'cs_test_store',$2,2500,'usd','buyer@example.com','{}','pi_test_store',0,599)",
          [order, total],
        );
      await assert.rejects(complete(1), /Payment amount mismatch/);
      await complete(3099);
      await complete(3099);
      await db.query("select public.release_order($1)", [order]);
      assert.equal(await stock(), 0);
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from public.orders where id=$1",
            [order],
          )
        ).rows[0].status,
        "paid",
      );
      await assert.rejects(
        db.query("select public.attach_checkout_session($1,$2)", [
          order,
          "cs_wrong",
        ]),
        /Session mismatch/,
      );
    },
  );
  await t.test("server shipment calls only accept paid orders", async () => {
    await assert.rejects(
      db.query("select public.ship_order($1,'123456789','USPS')", [
        randomUUID(),
      ]),
      /Only paid orders/,
    );
    await db.query("select public.ship_order($1,'123456789','USPS')", [order!]);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.orders where id=$1",
          [order!],
        )
      ).rows[0].status,
      "shipped",
    );
  });
  await t.test(
    "late payments after release require seller review",
    async () => {
      await db.query("update public.products set stock=1 where id=$1", [
        product,
      ]);
      const late = await reserve(randomUUID());
      await db.query("select public.release_order($1)", [late]);
      await db.query(
        "select public.complete_order($1,'cs_late',3099,2500,'usd',null,'{}','pi_late',0,599)",
        [late],
      );
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from public.orders where id=$1",
            [late],
          )
        ).rows[0].status,
        "payment_review",
      );
      assert.equal(await stock(), 1);
    },
  );
  await db.close();
});
