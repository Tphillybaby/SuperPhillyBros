import { getAuth } from "@/lib/auth/server";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET)
    return NextResponse.next();
  const response = await getAuth().middleware({ loginUrl: "/auth/sign-in" })(
    request,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/admin/:path*"] };
