import type { ReactNode } from "react";

// Settings section layout — a scrolling neutral surface that hosts each
// settings page (Appearance, and future panels). Page content centers
// itself; this just supplies the background and vertical scroll.

export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <main
      className="cp-root"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        background: "var(--ink-50)",
      }}
    >
      {children}
    </main>
  );
}
