import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSeller } from "@/lib/auth/server";
import { storeOrigin } from "@/lib/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (request.headers.get("origin") !== storeOrigin())
          throw new Error("Invalid origin");
        await requireSeller();
        if (!/^products\/[a-f0-9-]{36}\.(jpeg|png|webp)$/.test(pathname))
          throw new Error("Invalid image path");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 5242880,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch {
    return Response.json(
      {
        error:
          "Photo upload requires an approved seller and a JPG, PNG, or WebP under 5 MB.",
      },
      { status: 403 },
    );
  }
}
