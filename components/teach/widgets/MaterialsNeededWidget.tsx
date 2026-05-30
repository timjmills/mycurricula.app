// MaterialsNeededWidget — a grid of the materials students need (5.31 handoff,
// Lesson Essentials #4). Display-only: renders the configured material cards,
// falling back to the handoff's journal/pencil/book/folder/highlighter set.
// The first two items render large (the handoff's 2-up hero row); the rest fill
// a 3-up grid below.
//
// DEFAULT THEME: { bg: "purple", accent: "purple" } (Lilac card, purple accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, FootNote } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./MaterialsNeededWidget.module.css";
import kit from "./widgets530.module.css";

interface Material {
  icon: KitIconName;
  name: string;
}

const FALLBACK: Material[] = [
  { icon: "note", name: "Journal" },
  { icon: "pencil", name: "Pencil" },
  { icon: "book", name: "Reading Book" },
  { icon: "boxIco", name: "Folder" },
  { icon: "marker", name: "Highlighter" },
];

const ICONS: readonly KitIconName[] = [
  "note",
  "pencil",
  "book",
  "boxIco",
  "marker",
  "calc",
];

function readMaterials(config: Record<string, unknown>): Material[] {
  const raw = config.materials;
  if (Array.isArray(raw)) {
    const items = raw
      .map((m, i): Material | null => {
        const name =
          typeof m === "string"
            ? m
            : m && typeof m === "object" && typeof (m as Record<string, unknown>).name === "string"
              ? ((m as Record<string, unknown>).name as string)
              : null;
        return name ? { icon: ICONS[i % ICONS.length] ?? "boxIco", name } : null;
      })
      .filter((m): m is Material => m !== null);
    if (items.length > 0) return items;
  }
  return FALLBACK;
}

function readNote(config: Record<string, unknown>): string {
  const n = config.note;
  return typeof n === "string" && n.trim().length > 0
    ? n
    : "Make sure you have everything before we begin!";
}

function MatCard({
  icon,
  name,
  big,
}: {
  icon: KitIconName;
  name: string;
  big?: boolean;
}): ReactNode {
  return (
    <div className={`${kit.card} ${styles.mat} ${big ? styles.matBig : ""}`}>
      <span className={styles.matIcon}>
        <KitIcon name={icon} size={big ? 2.4 : 1.9} />
      </span>
      <span className={styles.matName}>{name}</span>
    </div>
  );
}

export function MaterialsNeededWidget({ widget }: WidgetBodyProps): ReactNode {
  const materials = readMaterials(widget.config);
  const hero = materials.slice(0, 2);
  const rest = materials.slice(2);
  const note = readNote(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Materials Needed" />
      {hero.length > 0 ? (
        <div className={styles.heroGrid}>
          {hero.map((m, i) => (
            <MatCard key={i} icon={m.icon} name={m.name} big />
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div className={styles.restGrid}>
          {rest.map((m, i) => (
            <MatCard key={i} icon={m.icon} name={m.name} />
          ))}
        </div>
      ) : null}
      <FootNote tone="purple" icon={<KitIcon name="star" size={1} />}>
        {note}
      </FootNote>
    </div>
  );
}
