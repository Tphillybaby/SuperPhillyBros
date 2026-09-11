import type { Metadata } from "next";
import { Footer, Header, StoreProvider } from "@/components/store";
import "./globals.css";
export const metadata: Metadata = {
  title: "Super Philliy Bro’s Collectibles | Diecast & Pokémon",
  description:
    "Explore diecast cars, Pokémon cards, and collectible finds from Super Philliy Bro’s Collectibles.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <StoreProvider>
          <Header />
          <div id="main-content">{children}</div>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
