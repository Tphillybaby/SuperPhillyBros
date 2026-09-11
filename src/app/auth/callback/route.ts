import { NextResponse } from "next/server";
import { userDatabase } from "@/lib/supabase/server";
import { storeOrigin } from "@/lib/payments";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    try {
      const db = await userDatabase();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${storeOrigin()}/admin`);
    } catch {
      /* Redirect to a useful error. */
    }
  }
  return NextResponse.redirect(`${storeOrigin()}/admin?error=link`);
}
