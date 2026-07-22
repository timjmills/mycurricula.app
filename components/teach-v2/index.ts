// components/teach-v2 — the v2 Teach board shell (Wave 11). Consumers import
// from this barrel. TeachWorkspace mounts <TeachV2Shell> behind the v2 flag,
// swapping it for the shipped <TeachV1Zones> against the SAME TeachZonesProps
// contract (defined here — the integration boundary the two shells share).

export { TeachV2Shell } from "./TeachV2Shell";
export type { TeachZonesProps } from "@/components/teach/zones-contract";
