"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./nav.module.css";

/* The screens in the app. Add a new page here and it automatically appears
   in the navigation. */
const SCREENS = [
  { href: "/", label: "Table" },
  { href: "/scatter", label: "Scatterplot" },
];

export default function Nav() {
  // The current page's path ("/" or "/scatter").
  const pathname = usePathname();

  // The current URL's query string.
  const searchParams = useSearchParams();

  // Preserve the selected major when navigating between pages.
  const major = searchParams.get("major");
  const majorSuffix = major ? `?major=${encodeURIComponent(major)}` : "";

  return (
    <nav className={styles.nav}>
      {SCREENS.map((screen) => {
        const isActive = pathname === screen.href;

        return (
          <Link
            key={screen.href}
            href={screen.href + majorSuffix}
            className={`${styles.link}${isActive ? ` ${styles.active}` : ""}`}
            /* Identifies the current page for screen readers. */
            data-label={screen.label}
            aria-current={isActive ? "page" : undefined}
          >
            {screen.label}
          </Link>
        );
      })}
    </nav>
  );
}
