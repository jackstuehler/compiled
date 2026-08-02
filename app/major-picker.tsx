"use client";

import { usePathname, useRouter } from "next/navigation";

export type Major = {
  cip_code: string;
  cip_desc: string;
};

export default function MajorPicker({
  majors,
  selected,
}: {
  majors: Major[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={selected}
      onChange={(e) =>
        router.push(`${pathname}?major=${encodeURIComponent(e.target.value)}`)
      }
      style={{ padding: 8, fontSize: 16, maxWidth: 600 }}
    >
      {majors.map((m) => (
        <option key={m.cip_code} value={m.cip_code}>
          {m.cip_desc}
        </option>
      ))}
    </select>
  );
}
