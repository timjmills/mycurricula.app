"use client";

// ToolsModule — the "Tools" panel module: a vertical STACK of dockable
// tool-widgets (5.31 "dock into panels / stack"). The same tool-widgets a
// teacher can place on the board canvas (timer, dice, poll, traffic, …) can be
// docked here and stacked in the side panel. State is the local, user-scoped
// `useDockedTools` store (persisted; never board content, never names §11.4).

import { type ReactNode } from "react";
import { ToolsDock } from "@/components/teach/tools";
import { useDockedTools } from "@/lib/teach/use-docked-tools";

export function ToolsModule(): ReactNode {
  const { tools, add, remove, clear } = useDockedTools();
  return (
    <ToolsDock tools={tools} onAdd={add} onRemove={remove} onClear={clear} />
  );
}
