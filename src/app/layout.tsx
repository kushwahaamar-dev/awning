import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Martian_Mono } from "next/font/google";
import { AccountProvider } from "@/components/account";
import { Footer } from "@/components/Footer";
import { Storefront } from "@/components/Storefront";
import "./globals.css";

const text = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz", "wdth"] });
const till = Martian_Mono({ variable: "--font-martian", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: "Awning",
  description: "Say what could go wrong for your business. Awning finds cover for it on Gemini prediction markets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${text.variable} ${display.variable} ${till.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Storefront />
        <main className="mx-auto w-full max-w-7xl grow px-5 pb-28 sm:px-10">
          <AccountProvider>{children}</AccountProvider>
        </main>
        <Footer />
      </body>
    </html>
  );
}
