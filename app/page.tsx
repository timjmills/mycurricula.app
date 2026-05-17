import { redirect } from "next/navigation";

// The weekly view is the app's primary surface; the root path forwards to it.
export default function Home() {
  redirect("/weekly");
}
