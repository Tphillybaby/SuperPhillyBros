import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { query, sql } from "../database";
let auth: ReturnType<typeof createNeonAuth> | undefined;
export function getAuth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET)
    throw new Error("Seller sign-in is not configured yet.");
  return (auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET,
      sessionDataTtl: 60,
    },
  }));
}
export async function requireSeller() {
  const { data, error } = await getAuth().getSession();
  if (error || !data?.user)
    throw new Error("Please sign in to the seller studio.");
  if (!data.user.emailVerified)
    throw new Error("Verify your email to access the seller studio.");
  const [seller] = await query<{ email: string; is_owner: boolean }>(
    sql`select email, is_owner from public.sellers where email = ${data.user.email.trim().toLowerCase()}`,
  );
  if (!seller) throw new Error("This account does not have seller access.");
  return { user: data.user, seller };
}
