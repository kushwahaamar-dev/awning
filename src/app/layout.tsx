import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { AccountProvider } from "@/components/account";
import { Footer } from "@/components/Footer";
import { Storefront } from "@/components/Storefront";
import "./globals.css";

const text = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
const figures = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Awning",
  description: "Say what could go wrong for your business. Awning finds cover for it on Gemini prediction markets.",
};

export const viewport: Viewport = { themeColor: "#08090a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${text.variable} ${figures.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <div aria-hidden className="backdrop" />
        <Storefront />
        <main className="mx-auto w-full max-w-6xl grow px-5 pb-32 sm:px-8">
          <AccountProvider>{children}</AccountProvider>
        </main>
        <Footer />
      </body>
    </html>
  );
}
