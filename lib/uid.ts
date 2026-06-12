/**
 * Short unique ids for entities created at runtime (sections, resources,
 * duplicated lessons, …). Single shared counter — previously duplicated in
 * lesson-flow.ts and planner-store.tsx.
 */
let seq = 0;

export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}
