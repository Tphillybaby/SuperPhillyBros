import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { checkoutSchema, productSchema } from "../src/lib/validation";
import { randomUUID } from "node:crypto";

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
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text); alter table storage.objects enable row level security;`);
  await db.exec(
    readFileSync(
      new URL("../supabase/migrations/202609110001_store.sql", import.meta.url),
      "utf8",
    ),
  );
  const seller = randomUUID();
  const buyer = randomUUID();
  const product = randomUUID();
  const draft = randomUUID();
  const hash = "a".repeat(64);
  await db.query("insert into auth.users values($1),($2)", [seller, buyer]);
  await db.query("insert into public.sellers(user_id) values($1)", [seller]);
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
    "anonymous and ordinary accounts cannot access seller records or write inventory",
    async () => {
      await db.exec("set role anon");
      assert.equal(
        (await db.query("select * from public.products")).rows.length,
        1,
      );
      await assert.rejects(
        db.query("select * from public.orders"),
        /permission denied/,
      );
      await assert.rejects(reserve(randomUUID()), /permission denied/);
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        buyer,
      ]);
      await db.exec("set role authenticated");
      assert.equal(
        (await db.query("select * from public.orders")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update public.products set stock=99 where id=$1 returning id",
            [product],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query("insert into public.sellers(user_id) values($1)", [buyer]),
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
  await t.test("only sellers can ship paid orders", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      buyer,
    ]);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.ship_order($1,'123456789','USPS')", [order!]),
      /Seller access required/,
    );
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      seller,
    ]);
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query("select * from public.products")).rows.length,
      2,
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
    await db.exec("reset role");
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
