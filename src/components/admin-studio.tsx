"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Package,
  ShoppingBag,
  DollarSign,
  ArrowUpRight,
  Pencil,
  Archive,
  Upload,
  LogOut,
  CheckCircle2,
  Mail,
  Truck,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { money, type Product } from "@/lib/types";
import { browserDatabase } from "@/lib/supabase/client";
import { archiveProduct, saveProduct, shipOrder } from "@/app/admin/actions";
import { Modal, ProductImage } from "./store";
type Order = {
  id: string;
  status: string;
  total_cents: number | null;
  subtotal_cents: number;
  created_at: string;
  customer_email: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  shipping: {
    name?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  };
  order_items: { name: string; quantity: number; unit_price_cents: number }[];
};
const empty: Omit<Product, "created_at"> = {
  id: "",
  slug: "",
  name: "",
  category: "Diecast",
  brand: "",
  price_cents: 0,
  stock: 1,
  condition: "New in box",
  description: "",
  image_url: "",
  active: false,
  featured: false,
  details: {},
};

export function SellerLogin() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const db = browserDatabase();
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setMessage(
        "Check your email for a secure sign-in link. Open it in this browser.",
      );
    } catch {
      setError(
        "We couldn’t send a sign-in link. Check that this email has been added as a seller, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <span className="eyebrow">FOR THE BROTHERS</span>
        <h1>Your seller studio.</h1>
        <p>
          Sign in to manage the collection, keep an eye on stock, and get orders
          on their way.
        </p>
        <form onSubmit={login}>
          <label>
            Seller email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
            <Mail size={17} />
          </button>
        </form>
        {message && (
          <p role="status" className="notice success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <p className="small muted">Access is limited to invited sellers.</p>
      </div>
    </main>
  );
}

export function AdminStudio({
  products,
  orders,
  demo,
  email,
  live,
}: {
  products: Product[];
  orders: Order[];
  demo: boolean;
  email: string;
  live: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("products");
  const [editor, setEditor] = useState<typeof empty | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const paid = orders.filter((o) => ["paid", "shipped"].includes(o.status));
  const pending = orders.filter((o) => o.status === "paid");
  async function archive(p: Product) {
    if (demo) {
      setNotice(
        "This is an example product. Connect the store to manage your real inventory.",
      );
      return;
    }
    try {
      await archiveProduct(p.id);
      setNotice(`${p.name} moved to drafts.`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function signOut() {
    if (!demo) {
      await browserDatabase().auth.signOut();
      router.refresh();
    }
  }
  async function shipment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || demo) return;
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await shipOrder({
        id: selected.id,
        tracking: data.get("tracking"),
        carrier: data.get("carrier"),
      });
      setSelected(null);
      setNotice("Shipment saved. Tracking is recorded with the order.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="studio">
      <aside className="studio-sidebar">
        <span className="eyebrow">SELLER STUDIO</span>
        <h2>Behind the finds.</h2>
        <button
          className={tab === "products" ? "active" : ""}
          onClick={() => setTab("products")}
        >
          <Package size={19} /> Products <span>{products.length}</span>
        </button>
        <button
          className={tab === "orders" ? "active" : ""}
          onClick={() => setTab("orders")}
        >
          <ShoppingBag size={19} /> Orders <span>{orders.length}</span>
        </button>
        <button
          className={tab === "setup" ? "active" : ""}
          onClick={() => setTab("setup")}
        >
          <CheckCircle2 size={19} /> Store setup
        </button>
        <div className="studio-profile">
          <small>{email}</small>
          {!demo && (
            <button onClick={signOut}>
              <LogOut size={15} /> Sign out
            </button>
          )}
          <Link href="/">
            Visit storefront <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="studio-content">
        <div className="studio-title">
          <div>
            <span className="eyebrow">SUPER PHILLIY BRO’S COLLECTIBLES</span>
            <h1>
              {tab === "products"
                ? "Your collection, in order."
                : tab === "orders"
                  ? "Make someone’s mail day."
                  : "Ready for your first sale."}
            </h1>
          </div>
          <button
            className="icon-btn"
            onClick={() => router.refresh()}
            aria-label="Refresh studio"
          >
            <RefreshCw size={19} />
          </button>
        </div>
        {demo && (
          <p className="notice">
            You’re exploring a preview. Connect Supabase to save products,
            invite your brother, and manage real orders.
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice success" role="status">
            {notice}
          </p>
        )}
        <div className="stats-grid">
          <div>
            <span>
              <DollarSign size={16} /> Sales
            </span>
            <strong>
              {money(paid.reduce((n, o) => n + (o.total_cents || 0), 0))}
            </strong>
            <small>From {paid.length} paid orders in this view</small>
          </div>
          <div>
            <span>
              <Truck size={16} /> Ready to ship
            </span>
            <strong>{pending.length}</strong>
            <small>Paid and waiting for a tracking number</small>
          </div>
          <div>
            <span>
              <Package size={16} /> Low stock
            </span>
            <strong>
              {products.filter((p) => p.active && p.stock <= 2).length}
            </strong>
            <small>Live products with 2 or fewer available</small>
          </div>
        </div>
        {tab === "products" ? (
          <section className="studio-panel">
            <div className="panel-title">
              <h2>Products</h2>
              <button
                className="button primary"
                onClick={() => setEditor({ ...empty })}
              >
                <Plus size={17} /> Add product
              </button>
            </div>
            <input
              className="studio-search"
              aria-label="Search inventory"
              placeholder="Search your inventory…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Status</th>
                    <th>Available</th>
                    <th>Price</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) =>
                      p.name.toLowerCase().includes(filter.toLowerCase()),
                    )
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="inventory-product">
                            <ProductImage product={p} />
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.category} · {p.condition}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${p.active ? "paid" : ""}`}>
                            {demo ? "Example" : p.active ? "Active" : "Draft"}
                          </span>
                        </td>
                        <td>
                          <span className={p.stock <= 2 ? "low-stock" : ""}>
                            {p.stock} in stock
                          </span>
                        </td>
                        <td>{money(p.price_cents)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              onClick={() => setEditor(p)}
                              aria-label={`Edit ${p.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => archive(p)}
                              aria-label={`Archive ${p.name}`}
                            >
                              <Archive size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!products.length && (
              <div className="empty-state">
                <Package size={35} />
                <h3>Start with your first great find.</h3>
                <p>Add photos, price, condition, and the number available.</p>
              </div>
            )}
          </section>
        ) : tab === "orders" ? (
          <section className="studio-panel">
            <div className="panel-title">
              <h2>Orders</h2>
              <span className="small muted">Latest 200 orders</span>
            </div>
            {orders.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>#{o.id.slice(0, 8).toUpperCase()}</strong>
                          <small>
                            {new Date(o.created_at).toLocaleDateString()}
                          </small>
                        </td>
                        <td>{o.customer_email || "Checkout in progress"}</td>
                        <td>
                          <span className={`status ${o.status}`}>
                            {o.status.replace("_", " ")}
                          </span>
                        </td>
                        <td>{money(o.total_cents ?? o.subtotal_cents)}</td>
                        <td>
                          <button
                            className="button secondary compact"
                            onClick={() => setSelected(o)}
                          >
                            View order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <ShoppingBag size={38} />
                <h3>Your first order starts here.</h3>
                <p>
                  Paid purchases will appear automatically, ready for packing.
                </p>
                <Link className="button secondary" href="/">
                  Visit the store <ExternalLink size={15} />
                </Link>
              </div>
            )}
          </section>
        ) : (
          <section className="studio-panel setup-panel">
            <h2>Store setup</h2>
            {[
              {
                name: "Storefront",
                detail: "Catalog, product details, search, and shopping bag.",
                ready: true,
              },
              {
                name: "Inventory & seller accounts",
                detail:
                  "Supabase stores your listings, photos, stock, and orders.",
                ready: !demo,
              },
              {
                name: "Payments",
                detail: "Stripe Checkout and verified payment notifications.",
                ready: live,
              },
              {
                name: "Live sales",
                detail:
                  "Add real product photos and confirm shipping and tax settings before opening checkout.",
                ready: live,
              },
            ].map((s) => (
              <div className="setup-row" key={s.name}>
                <CheckCircle2
                  className={s.ready ? "connected" : "muted"}
                  size={23}
                />
                <div>
                  <strong>{s.name}</strong>
                  <p>{s.detail}</p>
                </div>
                <span className="status">
                  {s.ready ? "Ready" : "To connect"}
                </span>
              </div>
            ))}
            <p className="notice">
              Payments update orders and inventory automatically. You and your
              brother still choose what to list, pack sold items, and add
              shipment tracking.
            </p>
            <p className="small muted">
              Shipping is configured by the store owner. Stripe can calculate
              tax once its tax settings are configured. Customer payment
              receipts are managed in Stripe.
            </p>
          </section>
        )}
      </div>
      <Modal
        label="Product editor"
        open={!!editor}
        close={() => setEditor(null)}
        className="editor-modal"
      >
        {editor && (
          <ProductEditor
            initial={editor}
            demo={demo}
            saved={() => {
              setEditor(null);
              setNotice("Product saved.");
              router.refresh();
            }}
          />
        )}
      </Modal>
      <Modal
        label="Order details"
        open={!!selected}
        close={() => setSelected(null)}
      >
        {selected && (
          <>
            <span className="eyebrow">
              ORDER #{selected.id.slice(0, 8).toUpperCase()}
            </span>
            <h2 className="order-heading">
              {selected.status === "paid"
                ? "Ready for a mail day."
                : "Order details"}
            </h2>
            <p>{selected.customer_email}</p>
            {selected.order_items.map((item, index) => (
              <div className="order-item" key={index}>
                <span>
                  {item.quantity} × {item.name}
                </span>
                <strong>{money(item.unit_price_cents * item.quantity)}</strong>
              </div>
            ))}
            <div className="subtotal">
              <span>Total</span>
              <strong>
                {money(selected.total_cents ?? selected.subtotal_cents)}
              </strong>
            </div>
            <h3 className="address-heading">Ship to</h3>
            <address>
              {selected.shipping?.name}
              <br />
              {selected.shipping?.address?.line1}
              <br />
              {selected.shipping?.address?.line2 && (
                <>
                  {selected.shipping.address.line2}
                  <br />
                </>
              )}
              {[
                selected.shipping?.address?.city,
                selected.shipping?.address?.state,
                selected.shipping?.address?.postal_code,
              ]
                .filter(Boolean)
                .join(", ")}
              <br />
              {selected.shipping?.address?.country}
            </address>
            {["paid", "shipped"].includes(selected.status) && (
              <form className="shipment-form" onSubmit={shipment}>
                <label>
                  Shipping carrier
                  <input
                    name="carrier"
                    placeholder="USPS, UPS, FedEx…"
                    minLength={2}
                    maxLength={50}
                    required
                    defaultValue={selected.shipping_carrier || ""}
                  />
                </label>
                <label>
                  Tracking number
                  <input
                    name="tracking"
                    minLength={3}
                    maxLength={100}
                    required
                    defaultValue={selected.tracking_number || ""}
                  />
                </label>
                <button className="button primary full" disabled={busy}>
                  {busy ? "Saving…" : "Save tracking & mark shipped"}
                </button>
              </form>
            )}
            {selected.status === "payment_review" && (
              <p className="notice error">
                A payment arrived after this reservation was released. Review
                the payment in Stripe and confirm inventory before fulfilling.
              </p>
            )}
          </>
        )}
      </Modal>
    </main>
  );
}

function ProductEditor({
  initial,
  demo,
  saved,
}: {
  initial: typeof empty;
  demo: boolean;
  saved: () => void;
}) {
  const [product, setProduct] = useState(initial);
  const [price, setPrice] = useState(
    initial.price_cents ? (initial.price_cents / 100).toFixed(2) : "",
  );
  const [detailText, setDetailText] = useState(
    Object.entries(initial.details)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  function change(key: string, value: unknown) {
    setProduct((p) => ({ ...p, [key]: value }));
  }
  async function upload(file?: File) {
    if (!file) return;
    if (demo) {
      setError("Connect Supabase before uploading your product photos.");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5242880
    ) {
      setError("Choose a JPG, PNG, or WebP image smaller than 5 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const db = browserDatabase();
      const path = `${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { error } = await db.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      change(
        "image_url",
        db.storage.from("product-images").getPublicUrl(path).data.publicUrl,
      );
    } catch {
      setError("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (demo) {
      setError(
        "This is a preview. Connect Supabase to save your first real listing.",
      );
      return;
    }
    setBusy(true);
    try {
      const details: Record<string, string> = {};
      for (const line of detailText.split("\n").filter(Boolean)) {
        const at = line.indexOf(":");
        if (at < 1) throw new Error("Write each detail as Label: Value.");
        details[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      }
      const { id, ...fields } = product;
      delete (fields as Record<string, unknown>).created_at;
      delete (fields as Record<string, unknown>).updated_at;
      await saveProduct({
        ...fields,
        ...(id ? { id } : {}),
        price_cents: Math.round(Number(price) * 100),
        details,
      });
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="product-form" onSubmit={save}>
      <span className="eyebrow">BUILD THE COLLECTION</span>
      <h2>{initial.id ? "Edit your find." : "Add a great find."}</h2>
      <div className="form-grid">
        <label className="wide">
          Product name
          <input
            required
            minLength={3}
            maxLength={160}
            value={product.name}
            onChange={(e) => {
              change("name", e.target.value);
              if (!initial.id)
                change(
                  "slug",
                  e.target.value
                    .toLowerCase()
                    .normalize("NFKD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
            }}
            placeholder="Hot Wheels Porsche 911 GT3"
          />
        </label>
        <label>
          Category
          <select
            value={product.category}
            onChange={(e) => change("category", e.target.value)}
          >
            <option>Diecast</option>
            <option>Pokémon</option>
          </select>
        </label>
        <label>
          Brand or series
          <input
            maxLength={100}
            value={product.brand}
            onChange={(e) => change("brand", e.target.value)}
            placeholder="Hot Wheels / Scarlet & Violet"
          />
        </label>
        <label>
          Price (USD)
          <input
            required
            type="number"
            min="0.50"
            max="99999.99"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Available quantity
          <input
            required
            type="number"
            min="0"
            max="100000"
            step="1"
            value={product.stock}
            onChange={(e) => change("stock", Number(e.target.value))}
          />
        </label>
        <label>
          Condition
          <input
            required
            minLength={2}
            maxLength={100}
            value={product.condition}
            onChange={(e) => change("condition", e.target.value)}
            placeholder="New in box, near mint, PSA 10…"
          />
        </label>
        <label>
          Product slug
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={180}
            value={product.slug}
            onChange={(e) => change("slug", e.target.value)}
          />
        </label>
        <label className="wide">
          Description
          <textarea
            required
            minLength={10}
            maxLength={6000}
            rows={4}
            value={product.description}
            onChange={(e) => change("description", e.target.value)}
            placeholder="Describe the exact item, condition, packaging, and any wear."
          />
        </label>
        <label className="wide">
          Photo URL
          <input
            type="url"
            required
            value={product.image_url}
            onChange={(e) => change("image_url", e.target.value)}
            placeholder="https://…"
          />
        </label>
        <div className="wide upload-row">
          {product.image_url && (
            <div className="upload-preview">
              <img src={product.image_url} alt="Product photo preview" />
            </div>
          )}
          <label className="upload-button">
            <Upload size={18} />
            {uploading ? "Uploading…" : "Upload product photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          <small>JPG, PNG, or WebP · Up to 5 MB</small>
        </div>
        <label className="wide">
          Item details{" "}
          <span className="muted">(one Label: Value per line)</span>
          <textarea
            rows={3}
            value={detailText}
            onChange={(e) => setDetailText(e.target.value)}
            placeholder={"Scale: 1:64\nPackaging: Original box\nSet: …"}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={product.featured}
            onChange={(e) => change("featured", e.target.checked)}
          />{" "}
          Mark as a Bro’s pick
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={product.active}
            onChange={(e) => change("active", e.target.checked)}
          />{" "}
          Publish in the store
        </label>
      </div>
      <p className="small muted">
        Available quantity excludes units already reserved in checkout. Use your
        own photographs and describe any imperfections.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy || uploading}>
        {busy
          ? "Saving…"
          : product.active
            ? "Save & publish product"
            : "Save as draft"}
      </button>
    </form>
  );
}
