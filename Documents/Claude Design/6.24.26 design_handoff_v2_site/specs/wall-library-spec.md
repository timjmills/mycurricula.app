# Wall Library — build spec (from user, to implement next)

A popup to browse/present/manage Resource **Walls**.

## Open from
- A **"Walls"** button in the Resource Wall (Post) toolbar, AND from the Teach board (switch the board's wall). (User said "decide for me".)

## Tabs
- **Presets** | **My Walls** (these are the two tab names).
- Within each, a **filter for Personal vs Team** (walls are personal and team/shared).

## Presets (auto-generated)
- Generated from the existing presets: **Today, This Week, Subject: Math, Unit 4 Explorers, …** (one card per preset/subject/unit context).
- Thumbnail = a **wash derived from the wall's subject color**; if the wall is **mixed-subject → a neutral wash**; OR a **custom background / picture** if one is set.

## My Walls (custom)
- Background options: **theme wash · solid color · custom uploaded image · gradient presets**.
- The **wall name overlays top-left** on the thumbnail.

## Library layout
- **16:10 landscape cards** in a grid.
- **Search box at the top.**
- **Default sort: Last used (most recent first).**
- Sort options: **Last used · Alphabetical · Subject · Unit · Date created · Manual drag order**.

## Per-wall actions
- **Open / present · Rename · Duplicate · Delete · Set background · Pin / favorite · Share**.

## Notes
- Custom walls already persist via `cc_customwalls` (loadCustomWalls/saveCustomWalls in resource-wall.jsx). Section backgrounds already support wash/solid/photo + upload (`rw-secbgpop`) — reuse that background picker for whole-wall backgrounds.
- Name top-left overlay; subject-derived wash for presets; neutral wash for mixed.
- Build as a popup component (e.g. `wall-library.jsx` → `window.WallLibrary`), opened from the Post toolbar's existing icon row and the Teach board.
