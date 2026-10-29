"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveShippingRate } from "@/app/admin/actions";
import { money } from "@/lib/types";

export function ShippingSettings({
  initialCents,
  demo,
}: {
  initialCents: number;
  demo: boolean;
}) {
  const router = useRouter();
  const [rate, setRate] = useState((initialCents / 100).toFixed(2));
  const [saved, setSaved] = useState(initialCents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const cents = await saveShippingRate(rate);
      setSaved(cents);
      setRate((cents / 100).toFixed(2));
      setMessage(
        "Shipping price saved. Applies to new checkouts; existing checkout sessions keep their original rate.",
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save shipping. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="product-form"
      onSubmit={submit}
      aria-label="Shipping prices"
    >
      <h3>Shipping prices</h3>
      <p>
        Set one flat shipping charge per order for US delivery. Enter 0 for free
        shipping.
      </p>
      <p>
        Current rate:{" "}
        <strong>
          {saved === 0 ? "Free shipping" : money(saved) + " per order"}
        </strong>
      </p>
      <label>
        Shipping price (USD)
        <input
          type="number"
          required
          min="0"
          max="1000"
          step="0.01"
          value={rate}
          disabled={demo || busy}
          onChange={(e) => setRate(e.target.value)}
        />
      </label>
      {demo && (
        <p className="small muted">
          Connect the store to save shipping prices.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <button className="button primary" disabled={demo || busy}>
        {busy ? "Saving…" : "Save shipping price"}
      </button>
    </form>
  );
}
