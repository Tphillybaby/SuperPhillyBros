export function combinedShipping(rates: (string | undefined)[], defaultCents: number): number {
  return Math.max(0, ...rates.map(rate => rate === undefined ? defaultCents : shippingCents(rate)));
}

// Dollar input stays a string until it has been validated, then becomes cents.
export function shippingCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,4}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Enter a shipping price from $0.00 to $1,000.00 with at most two decimal places.",
    );
  const cents = Math.round(Number(value.trim()) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000)
    throw new Error("Shipping must be between $0.00 and $1,000.00.");
  return cents;
}
