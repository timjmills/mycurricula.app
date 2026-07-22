// components/catchup-v2 — the v2 Catch-Up modal (Wave 10).
//
// The v2 replacement for the full-page components/catchup screen: a light,
// frosted, single-job overlay reachable from the /catch-up route AND the chrome
// Tools-dock. A module-level singleton (modal-state) guarantees exactly ONE
// modal is ever open, no matter how many Hosts are mounted (Codex W10 gate).
//
// Public surface:
//   • CatchUpModalHost           — the ONE renderer; drop it into ChromeShell
//                                  and/or the route. The controlled modal itself
//                                  is intentionally NOT exported (single-modal
//                                  invariant — callers open via the singleton).
//   • CATCHUP_MODAL_TOGGLE_EVENT — the window event the Tools-dock dispatches.
//   • open/close/toggle + useCatchupModalOpen — the singleton the route drives.

export { CatchUpModalHost, CATCHUP_MODAL_TOGGLE_EVENT } from "./CatchUpModal";
export {
  openCatchupModal,
  closeCatchupModal,
  toggleCatchupModal,
  useCatchupModalOpen,
  onCatchupModalClosed,
} from "./modal-state";
