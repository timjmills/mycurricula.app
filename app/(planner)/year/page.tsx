// Year view stub — resolves the /year route so the activated top-bar tab
// does not 404. This page will be replaced in the R1 build wave with the
// full curriculum roadmap + progression surface.
//
// Layout mirrors the other planner pages: a <main> that inherits the shell
// chrome (top bar, left panel) from the (planner) layout.

export default function YearPage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minHeight: "60vh",
        gap: "var(--space-3, 8px)",
        color: "var(--ink-500)",
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "var(--t-22)",
          fontWeight: 700,
          color: "var(--ink-900)",
          letterSpacing: "-0.3px",
          margin: 0,
        }}
      >
        Year view
      </h1>
      <p
        style={{
          fontSize: "var(--t-14)",
          fontWeight: 400,
          color: "var(--ink-500)",
          margin: 0,
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        Curriculum roadmap + progression — coming soon in this wave.
      </p>
    </main>
  );
}
