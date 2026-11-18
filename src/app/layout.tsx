import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { AccountProvider } from "@/components/account";
import { Footer } from "@/components/Footer";
import { Storefront } from "@/components/Storefront";
import { THEME_KEY } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Awning",
  openGraph: { title: "Awning", description: "Say what could go wrong. Get paid when it does.", type: "website" },
  description: "Cover for the bad days insurers won’t touch, priced by Gemini prediction markets and paid out on Arc.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0e" },
  ],
};

// Run by the browser as it reads the page, before anything is painted: the visitor's own choice of light or dark
// if they have made one, and their device's otherwise. Without it a dark page would flash light first.
const SET_THEME = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script changes <html> before React wakes up, which React is told to expect.
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SET_THEME }} />
      </head>
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
