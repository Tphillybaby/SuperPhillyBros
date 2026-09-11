import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.STORE_LIVE === "true"
        ? {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/api/", "/auth/", "/checkout/"],
          }
        : { userAgent: "*", disallow: "/" },
  };
}
