// components/rich-text — public surface
export { RichTextEditor } from "./rich-text-editor";
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
