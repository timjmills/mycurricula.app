import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider, DEFAULT_STYLE, DEFAULT_PALETTE } from "@/lib/theme";

// GeistSans/GeistMono expose `--font-geist-sans` / `--font-geist-mono`,
// which globals.css and the ported tokens.css reference for --font-sans/mono.

export const metadata: Metadata = {
  title: "MyCurricula — Grade 5 Curriculum Planner",
  description: "Weekly curriculum planning tool for Grade 5 teachers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // data-style / data-palette are rendered on the server with the dev
  // defaults so token CSS is correct before hydration; ThemeProvider then
  // owns subsequent changes.
  return (
    <html
      lang="en"
      data-style={DEFAULT_STYLE}
      data-palette={DEFAULT_PALETTE}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="cp-root flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
