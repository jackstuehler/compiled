"use client";

import type { ChangeEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./major-picker.module.css";
import type { Major } from "@/lib/measures";

export default function MajorPicker({
  majors,
  selected,
  className,
}: {
  majors: Major[];
  selected: string;
  // Lets a caller style the menu differently — the sidebar needs a narrower,
  // full-width version. Replaces the default styling rather than adding to it.
  className?: string;
}) {
  // useRouter lets us change the URL from code, the way clicking a <Link> does.
  const router = useRouter();

  // The path we're currently on, "/" or "/scatter". We keep the user on the
  // screen they're already on and swap only the major.
  const pathname = usePathname();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    // event.target is the <select> element itself. Its .value is the value of
    // whichever <option> the user picked — here, that option's cip_code.
    const newMajor = event.target.value;

    // Picking a major changes the URL rather than any local state. The URL is
    // where the selected major lives: that's what makes it bookmarkable, and
    // it's what lets the nav links carry it between screens. Next notices the
    // new URL and re-runs the page's database query for that major.
    router.push(`${pathname}?major=${encodeURIComponent(newMajor)}`);
  }

  return (
    <select
      className={className ?? styles.select}
      value={selected}
      onChange={handleChange}
    >
      {majors.map((major) => (
        <option key={major.cip_code} value={major.cip_code}>
          {major.cip_desc}
        </option>
      ))}
    </select>
  );
}
