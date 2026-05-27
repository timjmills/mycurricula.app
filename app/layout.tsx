import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider, DEFAULT_STYLE, DEFAULT_PALETTE } from "@/lib/theme";
import { LabelsProvider } from "@/lib/labels";

// GeistSans/GeistMono expose `--font-geist-sans` / `--font-geist-mono`,
// which globals.css and the ported tokens.css reference for --font-sans/mono.

export const metadata: Metadata = {
  // Root metadata is rendered server-side and cannot read per-team
  // curriculumLabel state. Keep it generic; surface the team's label inside
  // the app chrome instead (top bar + per-page headers).
  title: "MyCurricula — Curriculum Planner",
  description: "Curriculum planning tool for teaching teams.",
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
        <ThemeProvider>
          {/* LabelsProvider hosts the renameable Subject/Unit/Lesson/Section
              captions. Mounted near the root so every surface — Settings,
              the ResourceComposer's routing pickers, future breadcrumbs —
              reads from the same source. SSR-safe: it initializes with the
              defaults and loads saved overrides post-mount so hydration
              cannot mismatch. */}
          <LabelsProvider>{children}</LabelsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
