"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

const LINKS = [
  { href: "/", label: "Compare colleges" },
  { href: "/scatter", label: "Scatterplot" },
];

const linkStyle: CSSProperties = {
  padding: "8px 14px",
  fontSize: 15,
  textDecoration: "none",
  color: "inherit",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#8886",
  borderRadius: 6,
  backgroundColor: "transparent",
  fontWeight: 400,
};

const activeStyle: CSSProperties = {
  ...linkStyle,
  fontWeight: 600,
  backgroundColor: "#8882",
  borderColor: "#8889",
};

export default function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const major = searchParams.get("major");
  const suffix = major ? `?major=${encodeURIComponent(major)}` : "";

  return (
    <nav style={{ display: "flex", gap: 8, margin: "16px 0 24px" }}>
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={`${l.href}${suffix}`}
            style={active ? activeStyle : linkStyle}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
