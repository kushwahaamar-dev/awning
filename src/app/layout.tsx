import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { AccountProvider } from "@/components/account";
import { Storefront } from "@/components/Storefront";
import "./globals.css";

const text = Hanken_Grotesk({ variable: "--font-text", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: "Awning",
  description: "Say what could go wrong for your business. Awning finds cover for it on Gemini prediction markets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${text.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Storefront />
        <main className="mx-auto w-full max-w-5xl px-5 pt-8 pb-24 sm:px-8">
          <AccountProvider>{children}</AccountProvider>
        </main>
      </body>
    </html>
  );
}
