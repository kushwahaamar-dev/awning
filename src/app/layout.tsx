import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import { GeistSerif } from "geist/font/serif";
import { AccountProvider } from "@/components/account";
import { Footer } from "@/components/Footer";
import { Storefront } from "@/components/Storefront";
import "./globals.css";

// The Geist family, each face with one job: Sans for the interface, Serif for the two big lines,
// Mono for values in running text, Pixel for figures read live from the chain.
const fonts = [GeistSans, GeistSerif, GeistMono, GeistPixelCircle].map((font) => font.variable).join(" ");

export const metadata: Metadata = {
  title: "Awning",
  description: "Cover for the bad days insurers won't touch, priced by Gemini prediction markets and paid out on Arc.",
};

export const viewport: Viewport = { themeColor: "#08090a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fonts} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <Storefront />
        <main className="wrap grow pb-32">
          <AccountProvider>{children}</AccountProvider>
        </main>
        <Footer />
      </body>
    </html>
  );
}
