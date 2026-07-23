"use client";

// rich-text-editor.lazy.tsx — the lazy (code-split) RichTextEditor.
//
// WHY. rich-text-editor.tsx is ~1,800 lines and statically pulls DOMPurify
// (via lib/sanitize-html) + lib/resource-embed; importing it eagerly lands
// all of that in the first-load JS of every route that can EVER show an
// editor. Every mount site is an edit surface (double-click-to-edit inline
// fields, the resource composer, lesson-editor/lesson-plan modal tabs) — the
// editor is never part of a route's read-only initial paint — so the module
// is deferred into its own chunk and fetched on first mount.
//
// The barrel (index.ts) re-exports THIS component as `RichTextEditor`, so
// every consumer gets the lazy version without changing its import, and the
// barrel's static module graph no longer includes the editor (command-bus
// consumers like RtToolbar/FloatingBar stop paying for it too). The
// command-bus itself stays static — it is tiny and external toolbars need it
// before any editor has mounted.
//
// ssr: false — the editor is contentEditable/execCommand-driven; it is fully
// SSR-guarded internally, but server-rendering it is pointless because every
// mount is a response to a client interaction. The `loading` fallback mirrors
// the empty editable region's one-line box (.lazyFallback) so swapping in the
// real editor causes no layout shift; it is aria-hidden because the load is
// transient and the editor announces itself once mounted.
//
// Late-mount safety (verified against the module):
//   • `autoFocus` runs in a mount effect — it fires when the chunk arrives,
//     so click-to-edit fields still receive the caret.
//   • Command-bus registration (useRichTextCommandTarget) is register-on-
//     FOCUS; the bus tolerates having no target until then.
//   • No consumer passes a ref (dynamic() does not forward refs) — the
//     RichEditorWrapper/TitleEditorShell shells are pure event delegators.

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor";
import styles from "./rich-text-editor.module.css";

export const RichTextEditor = dynamic<RichTextEditorProps>(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className={styles.lazyFallback} aria-hidden="true" />,
  },
);
