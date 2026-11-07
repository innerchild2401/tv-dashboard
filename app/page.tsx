import { ro } from "@/i18n/ro";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home">
      <h1>{ro.appTitle}</h1>
      <p>{ro.homeIntro}</p>
      <Link href="/tv">{ro.openTv}</Link>
    </main>
  );
}
