// components/composer — the Shared Composer engine (B4.0 + B4.1).
//
// Consumers import from "@/components/composer"; never from a deep file.
// The provider is mounted once in app/(planner)/layout.tsx; surfaces reach the
// composer + resource menu imperatively through useComposer().

export {
  ComposerProvider,
  useComposer,
  useComposerOptional,
} from "./ComposerProvider";
export type { ComposerActions } from "./ComposerProvider";

export { ComposerHost } from "./ComposerHost";

// NOTE: <ResMenu> itself is deliberately NOT re-exported as a value.
//
// It is loaded through next/dynamic by ComposerHost, and this barrel is pulled
// into the planner layout — so re-exporting the component here made it
// statically reachable and silently undid its own lazy boundary. Nothing
// outside ComposerHost renders <ResMenu> directly; surfaces open it
// imperatively via useComposer().openResMenu(). Export the TYPE only; if a
// future surface truly needs the component eagerly, import it deep and say why.
export type { ResMenuProps } from "./ResMenu";

export { ResMenuTrigger } from "./ResMenuTrigger";
export type { ResMenuTriggerProps } from "./ResMenuTrigger";

export {
  resMenuOpenUrl,
  hasResMenuActions,
  composerPropsFrom,
} from "./composer-state";
export type {
  ComposerOpenOptions,
  ResMenuOptions,
  ComposerState,
  ComposerAction,
} from "./composer-state";
