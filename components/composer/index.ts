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

export { ResMenu } from "./ResMenu";
export type { ResMenuProps } from "./ResMenu";

export { resMenuOpenUrl, composerPropsFrom } from "./composer-state";
export type {
  ComposerOpenOptions,
  ResMenuOptions,
  ComposerState,
  ComposerAction,
} from "./composer-state";
