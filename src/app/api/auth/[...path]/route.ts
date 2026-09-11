import { getAuth } from "@/lib/auth/server";
import { query, sql } from "@/lib/database";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  return getAuth().handler().GET(request, context);
}
export async function POST(request: NextRequest, context: Context) {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    if (typeof body?.email !== "string" || body.email.length > 254)
      return Response.json(
        { message: "Use an approved seller email." },
        { status: 400 },
      );
    const rows = await query(
      sql`select email from public.sellers where email=${body.email.trim().toLowerCase()}`,
    );
    if (!rows.length)
      return Response.json(
        { message: "Use an approved seller email." },
        { status: 403 },
      );
  }
  return getAuth().handler().POST(request, context);
}
