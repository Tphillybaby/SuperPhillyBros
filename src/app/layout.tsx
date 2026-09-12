import type { Metadata } from "next";
import { Footer, Header, StoreProvider } from "@/components/store";
import "./globals.css";
import "./platform-theme.css";
export const metadata: Metadata = {
  title: "Super Philly Bros Collectibles | Diecast & Pokémon",
  description:
    "Level up your collection with diecast cars, Pokémon cards, and nostalgic finds from Super Philly Bros Collectibles.",
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
