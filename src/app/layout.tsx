import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { AccountProvider } from "@/components/account";
import { Footer } from "@/components/Footer";
import { Storefront } from "@/components/Storefront";
import "./globals.css";

export const metadata: Metadata = {
  title: "Awning",
  openGraph: { title: "Awning", description: "Say what could go wrong. Get paid when it does.", type: "website" },
  description: "Cover for the bad days insurers won’t touch, priced by Gemini prediction markets and paid out on Arc.",
};

export const viewport: Viewport = { themeColor: "#fafafa" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30">
          Skip to content
        </a>
        <Storefront />
        <main id="main" className="wrap grow pb-24">
          <AccountProvider>{children}</AccountProvider>
        </main>
        <Footer />
      </body>
    </html>
  );
}
