import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Martian_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "wdth"] });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"] });
const mono = Martian_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Toll Bridge: a PayPal tab for AI agents",
  description: "Approve one PayPal hold. Your agent pays per tool call, only for results that pass their checks. The rest is voided.",
};

export const viewport: Viewport = { themeColor: "#D4FF3F" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="top">
          <Link href="/" className="mark" aria-label="Toll Bridge home">
            <span className="mark-a">TOLL</span>
            <span className="mark-b">BRIDGE</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/#how">How it works</Link>
            <Link href="/#agents">For agents</Link>
            <Link href="/tab" className="nav-cta">
              Open a tab
            </Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="foot">
          <span>PayPal sandbox only. No real money moves.</span>
          <a href="https://github.com/JoeProAI/toll-bridge">Source on GitHub</a>
        </footer>
      </body>
    </html>
  );
}
