"use client";
import { useEffect, useRef } from "react";
import { useCart } from "./store";
export function ClearPaidCart() {
  const { clear, ready } = useCart();
  const done = useRef(false);
  useEffect(() => {
    if (ready && !done.current) {
      done.current = true;
      clear();
    }
  }, [clear, ready]);
  return null;
}
