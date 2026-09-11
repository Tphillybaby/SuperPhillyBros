"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CarFront,
  Layers3,
  Search,
  SlidersHorizontal,
  Plus,
  PackageCheck,
  HeartHandshake,
  Sparkles,
  X,
} from "lucide-react";
import { money, type Product } from "@/lib/types";
import { Modal, ProductImage, useCart } from "./store";

export default function Storefront({
  products,
  demo,
  initialCategory = "All finds",
}: {
  products: Product[];
  demo: boolean;
  initialCategory?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Product | null>(null);
  const { add } = useCart();
  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);
  const visible = useMemo(
    () =>
      products
        .filter(
          (p) =>
            (category === "All finds" || p.category === category) &&
            `${p.name} ${p.brand} ${p.condition}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "low"
            ? a.price_cents - b.price_cents
            : sort === "high"
              ? b.price_cents - a.price_cents
              : b.created_at.localeCompare(a.created_at),
        ),
    [products, category, query, sort],
  );
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => Promise<void> | void;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    };
    register({
      name: "search_collectibles",
      title: "Search the collection",
      description:
        "Filter the visible product collection by search text and category. Does not buy anything.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: {
            type: "string",
            enum: ["All finds", "Diecast", "Pokémon"],
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input: { query?: string; category?: string }) => {
        if (
          (input.query !== undefined && typeof input.query !== "string") ||
          (input.category &&
            !["All finds", "Diecast", "Pokémon"].includes(input.category))
        )
          throw new Error("Invalid search");
        setQuery(input.query || "");
        setCategory(input.category || "All finds");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return {
          products: products
            .filter(
              (p) =>
                (!input.category ||
                  input.category === "All finds" ||
                  p.category === input.category) &&
                `${p.name} ${p.brand} ${p.condition}`
                  .toLowerCase()
                  .includes((input.query || "").toLowerCase()),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              price_cents: p.price_cents,
              stock: p.stock,
            })),
        };
      },
    });
    return () => lifecycle.abort();
  }, [products]);
  function filter(value: string) {
    setCategory(value);
    document
      .getElementById("collection")
      ?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <main>
      {demo && (
        <div className="preview-notice">
          STORE PREVIEW{" "}
          <span>
            Example listings and illustrative photos. Purchases are disabled.
          </span>
        </div>
      )}
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-star">✦</span> COLLECTED WITH CHARACTER
          </div>
          <h1>
            Your next
            <br />
            great <em>find.</em>
          </h1>
          <p>
            Diecast icons. Pokémon favorites.
            <br />A little nostalgia, handpicked by two brothers.
          </p>
          <button
            className="button primary"
            onClick={() => filter("All finds")}
          >
            Explore the collection <ArrowUpRight size={19} />
          </button>
          <div className="hero-footnote">
            <span>01 /</span> FOR THE LOVE OF COLLECTING
          </div>
        </div>
        <div className="hero-art">
          <img
            src="/collectibles-hero.png"
            alt="Illustrative studio display of a red diecast car and trading cards"
            fetchPriority="high"
          />
          <div className="art-label">
            <Sparkles size={17} />
            <span>
              SMALL FINDS.
              <br />
              <strong>BIG COLLECTOR ENERGY.</strong>
            </span>
          </div>
          <span className="hero-edition">THE SUPER PHILLIY COLLECTION</span>
        </div>
      </section>
      <div className="values-strip">
        <span>
          <CarFront /> Small scale. Big personality.
        </span>
        <span>
          <Layers3 /> A new favorite for your binder.
        </span>
        <span>
          <HeartHandshake /> From our collection to yours.
        </span>
      </div>
      <section className="collection section" id="collection">
        <div className="section-heading">
          <div className="eyebrow">THE COLLECTION</div>
          <div className="heading-line">
            <h2>A shelf full of possibilities.</h2>
            <span className="item-count">
              {products.length} finds to explore
            </span>
          </div>
        </div>
        <div className="collection-toolbar">
          <div className="category-tabs" aria-label="Product categories">
            {["All finds", "Diecast", "Pokémon"].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c === "Diecast" ? (
                  <CarFront size={17} />
                ) : c === "Pokémon" ? (
                  <Layers3 size={17} />
                ) : null}
                {c}
              </button>
            ))}
          </div>
          <div className="collection-controls">
            <label className="search-field">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find your next favorite"
                aria-label="Search collectibles"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="sort-field">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
              </select>
            </label>
          </div>
        </div>
        <div className="product-grid">
          {visible.map((p, i) => (
            <article className="product-card" key={p.id}>
              <button
                className="product-preview"
                onClick={() => setSelected(p)}
                aria-label={`View ${p.name}`}
              >
                <ProductImage product={p} />
                <span className={`product-badge ${p.stock < 1 ? "sold" : ""}`}>
                  {demo
                    ? "EXAMPLE FIND"
                    : p.stock < 1
                      ? "SOLD OUT"
                      : p.featured
                        ? "BRO’S PICK"
                        : "JUST ADDED"}
                </span>
                <span className="view-item">
                  <ArrowUpRight size={19} />
                </span>
              </button>
              <div className="product-meta">
                <span>{p.category.toUpperCase()}</span>
                <span>{p.condition}</span>
              </div>
              <button className="product-name" onClick={() => setSelected(p)}>
                {p.name}
              </button>
              <div className="product-bottom">
                <strong>{money(p.price_cents)}</strong>
                <button
                  className="add-button"
                  aria-label={`Add ${p.name} to bag`}
                  disabled={!p.stock}
                  onClick={() => add(p)}
                >
                  <Plus size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="empty-state">
            <Search size={34} />
            <h3>
              {products.length
                ? "No finds just yet."
                : "The next drop is on its way."}
            </h3>
            <p>
              {products.length
                ? "Try another search or explore the full collection."
                : "Check back soon for new diecast and Pokémon listings."}
            </p>
            {products.length > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("All finds");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </section>
      <section className="category-stories section">
        <button
          className="category-story diecast-story"
          onClick={() => filter("Diecast")}
        >
          <div>
            <span className="eyebrow">BUILT FOR YOUR SHELF</span>
            <h3>
              The little things.
              <br />
              The legendary rides.
            </h3>
            <span className="text-link">
              Shop diecast <ArrowRight size={17} />
            </span>
          </div>
          <CarFront strokeWidth={1} />
        </button>
        <button
          className="category-story pokemon-story"
          onClick={() => filter("Pokémon")}
        >
          <div>
            <span className="eyebrow">ONE MORE FOR THE BINDER</span>
            <h3>
              Gotta love
              <br />a good find.
            </h3>
            <span className="text-link">
              Shop Pokémon <ArrowRight size={17} />
            </span>
          </div>
          <Layers3 strokeWidth={1} />
        </button>
      </section>
      <section className="our-story section" id="our-story">
        <div className="story-stamp">
          SP<span>✦</span>
          <small>BROTHERS & COLLECTORS</small>
        </div>
        <div>
          <span className="eyebrow">THE PEOPLE BEHIND THE PICKS</span>
          <h2>
            Two brothers.
            <br />A lifelong kind of hobby.
          </h2>
          <p>
            Super Philliy Bro’s Collectibles is our place to share the things we
            love collecting. From a miniature dream car to the next card in your
            collection, we’re here for that “found it” feeling, too.
          </p>
          <a className="text-link" href="#collection">
            Find something that’s you <ArrowRight size={18} />
          </a>
        </div>
      </section>
      <Modal
        open={!!selected}
        close={() => setSelected(null)}
        label={selected?.name || "Product details"}
        className="product-modal"
      >
        {selected && (
          <div className="product-detail">
            <ProductImage product={selected} />
            <div>
              <span className="eyebrow">{selected.category}</span>
              <h2>{selected.name}</h2>
              <p className="detail-price">{money(selected.price_cents)}</p>
              <span className="condition-tag">{selected.condition}</span>
              <p className="description">{selected.description}</p>
              <dl>
                {Object.entries(selected.details || {}).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="stock-note">
                <PackageCheck size={16} />
                {selected.stock
                  ? `${selected.stock} available${demo ? " in this example" : ""}`
                  : "Sold out"}
              </p>
              <button
                disabled={!selected.stock}
                className="button primary full"
                onClick={() => {
                  add(selected);
                  setSelected(null);
                }}
              >
                Add to bag <Plus size={17} />
              </button>
              <Link
                className="text-link full-listing-link"
                href={`/products/${selected.slug}`}
              >
                View full listing <ArrowUpRight size={15} />
              </Link>
              {demo && (
                <p className="small muted">
                  Preview item · not available to purchase
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
