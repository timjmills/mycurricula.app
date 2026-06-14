// The Boards home (/boards) — the primary board surface (replaces "Teach" in the
// nav; the Wave 3 consolidation). A thin server component that renders the client
// <BoardsHome>; it inherits the planner shell (SideNav, top bar, providers) from
// app/(planner)/layout.tsx. The board EDITOR remains its own full-screen route
// group (/teach), reached by opening a board from here.
import { BoardsHome } from "@/components/boards";

export default function BoardsPage() {
  return <BoardsHome />;
}
