"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShoppingBag,
  X,
  Minus,
  Plus,
  Package,
  LockKeyhole,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { money, type CartItem, type Product } from "@/lib/types";

const CartContext = createContext<{
  items: CartItem[];
  ready: boolean;
  add: (p: Product) => void;
  open: () => void;
  clear: () => void;
}>({ items: [], ready: false, add: () => {}, open: () => {}, clear: () => {} });
export const useCart = () => useContext(CartContext);

export function Modal({
  open,
  close,
  children,
  label,
  className = "",
}: {
  open: boolean;
  close: () => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`modal ${className}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-inner">
        <button
          className="icon-btn close-btn"
          aria-label="Close dialog"
          onClick={close}
        >
          <X />
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const checkoutAttempt = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    try {
      const stored: CartItem[] = JSON.parse(
        localStorage.getItem("spb-cart-v1") || "[]",
      );
      if (Array.isArray(stored))
        setItems(
          stored
            .filter(
              (i) =>
                i?.product?.id &&
                Number.isInteger(i.quantity) &&
                i.quantity > 0 &&
                i.quantity <= 20,
            )
            .slice(0, 30),
        );
    } catch {
      /* Empty cart if browser storage is unavailable. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("spb-cart-v1", JSON.stringify(items));
      } catch {
        /* Cart remains available in memory. */
      }
    }
  }, [items, ready]);
  function add(product: Product) {
    if (product.stock < 1) return;
    setItems((prev) => {
      const found = prev.find((i) => i.product.id === product.id);
      return found
        ? prev.map((i) =>
            i.product.id === product.id
              ? {
                  product,
                  quantity: Math.min(i.quantity + 1, product.stock, 20),
                }
              : i,
          )
        : [...prev, { product, quantity: 1 }];
    });
    setError("");
    setOpen(true);
  }
  function quantity(id: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === id
            ? {
                ...i,
                quantity: Math.min(i.product.stock, 20, i.quantity + delta),
              }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const payload = JSON.stringify(
        items.map((i) => ({ id: i.product.id, quantity: i.quantity })),
      );
      if (checkoutAttempt.current?.payload !== payload)
        checkoutAttempt.current = { payload, id: crypto.randomUUID() };
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: checkoutAttempt.current!.id,
          items: JSON.parse(payload),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) checkoutAttempt.current = null;
        throw new Error(
          data.error || "Checkout is unavailable. Please try again.",
        );
      }
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open checkout.");
      setBusy(false);
    }
  }
  return (
    <CartContext.Provider
      value={{
        items,
        ready,
        add,
        open: () => setOpen(true),
        clear: () => setItems([]),
      }}
    >
      {children}
      <Modal
        label="Shopping bag"
        open={isOpen}
        close={() => setOpen(false)}
        className="cart-modal"
      >
        <span className="eyebrow">YOUR NEXT GREAT FINDS</span>
        <h2>
          Your bag{" "}
          <span className="muted">
            ({items.reduce((n, i) => n + i.quantity, 0)})
          </span>
        </h2>
        {items.length ? (
          <>
            <div className="cart-lines">
              {items.map((i) => (
                <div className="cart-line" key={i.product.id}>
                  <ProductImage product={i.product} />
                  <div className="cart-line-info">
                    <strong>{i.product.name}</strong>
                    <small>{i.product.condition}</small>
                    <div className="quantity">
                      <button
                        aria-label={`Remove one ${i.product.name}`}
                        onClick={() => quantity(i.product.id, -1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        aria-label={`Add one ${i.product.name}`}
                        disabled={i.quantity >= i.product.stock}
                        onClick={() => quantity(i.product.id, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="cart-price">
                    <strong>{money(i.product.price_cents * i.quantity)}</strong>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${i.product.name} from bag`}
                      onClick={() =>
                        setItems(
                          items.filter(
                            (item) => item.product.id !== i.product.id,
                          ),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="subtotal">
              <span>Subtotal</span>
              <strong>
                {money(
                  items.reduce(
                    (n, i) => n + i.quantity * i.product.price_cents,
                    0,
                  ),
                )}
              </strong>
            </div>
            <p className="small muted">
              Shipping and applicable tax are calculated at checkout.
              Availability is confirmed before payment.
            </p>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              onClick={checkout}
              disabled={busy}
            >
              {busy ? "Opening secure checkout…" : "Continue to checkout"}
              <ArrowRight size={18} />
            </button>
            <p className="secure-note">
              <LockKeyhole size={14} /> Secure payment through Stripe
            </p>
          </>
        ) : (
          <div className="empty-state">
            <ShoppingBag size={44} />
            <h3>A little room for something good.</h3>
            <p>Your bag is waiting for its first find.</p>
            <button className="button primary" onClick={() => setOpen(false)}>
              Explore the collection <ArrowRight size={17} />
            </button>
          </div>
        )}
      </Modal>
    </CartContext.Provider>
  );
}

export function Header() {
  const { items, open } = useCart();
  return (
    <>
      <div className="announcement">
        TWO BROTHERS. ONE SHARED OBSESSION.{" "}
        <span>Welcome to the collection.</span>
      </div>
      <header className="header">
        <Link
          href="/"
          className="brand"
          aria-label="Super Philliy Bro’s Collectibles home"
        >
          <span className="brand-mark">
            SP<span>✦</span>
          </span>
          <span className="brand-name">
            Super Philliy Bro’s<small>COLLECTIBLES</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="/?category=All%20finds#collection">Shop all</a>
          <a href="/?category=Diecast#collection">Diecast</a>
          <a href="/?category=Pok%C3%A9mon#collection">Pokémon</a>
          <a href="/#our-story">Our story</a>
        </nav>
        <div className="header-actions">
          <Link className="seller-link" href="/admin">
            Seller studio <ArrowUpRight size={14} />
          </Link>
          <button
            className="bag-button"
            onClick={open}
            aria-label={`Open shopping bag, ${items.reduce((n, i) => n + i.quantity, 0)} items`}
          >
            <ShoppingBag size={20} />
            <span className="bag-count">
              {items.reduce((n, i) => n + i.quantity, 0)}
            </span>
          </button>
        </div>
      </header>
    </>
  );
}

export function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`product-image ${product.image_url === "/collectibles-hero.png" ? "illustrative" : ""} ${product.id.endsWith("4") ? "alternate-shot" : ""} ${product.category === "Pokémon" ? "cards-image" : "car-image"}`}
    >
      {product.image_url && !failed ? (
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="image-fallback">
          <Package size={34} />
          <span>Photo coming soon</span>
        </div>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Link href="/" className="footer-brand">
          Super Philliy Bro’s<span>COLLECTIBLES</span>
        </Link>
        <p>Good finds. Great company.</p>
      </div>
      <div className="footer-links">
        <a href="/#collection">The collection</a>
        <a href="/#our-story">Meet the brothers</a>
        <Link href="/admin">
          Seller studio <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Super Philliy Bro’s Collectibles
        </span>
        <span>
          Independent collectors. Pokémon and other brands belong to their
          respective owners.
        </span>
      </div>
    </footer>
  );
}
