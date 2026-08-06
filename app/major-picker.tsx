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
  /* Lets callers replace the default width when embedding the picker in a
     different layout. */
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    // The selected major lives in the URL so it persists across pages and can
    // be bookmarked or shared.
    router.push(`${pathname}?major=${encodeURIComponent(event.target.value)}`);
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
