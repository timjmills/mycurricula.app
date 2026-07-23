// components/rich-text — public surface
//
// `RichTextEditor` resolves to the LAZY wrapper (rich-text-editor.lazy.tsx):
// the ~1,800-line editor module + DOMPurify load as their own chunk on first
// editor mount instead of riding in every consumer route's first-load JS.
// The props type still comes from the eager module (type-only — erased at
// compile time, so it does not re-add the editor to the static graph).
export { RichTextEditor } from "./rich-text-editor.lazy";
export type { RichTextEditorProps } from "./rich-text-editor";

// Shared focused-editor registry for external toolbars (6.11.26 /daily
// sticky toolbar). Chromeless RichTextEditors register here on focus; an
// external toolbar (components/daily/rt-toolbar) drives them through the
// RichTextCommandBus facade. See command-bus.ts for the full contract.
export {
  RichTextCommandBus,
  RICH_TEXT_TOOLBAR_ATTR,
  registerRichTextCommandTarget,
  unregisterRichTextCommandTarget,
  notifyRichTextStateChanged,
  getRichTextCommandTarget,
  subscribeRichTextCommandBus,
  getRichTextCommandBusVersion,
  useRichTextCommandBus,
  useRichTextCommandTarget,
} from "./command-bus";
export type {
  RichTextCommand,
  RichTextCommandTarget,
  RichTextCommandImpl,
} from "./command-bus";
