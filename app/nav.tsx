"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./nav.module.css";

// The screens in the app. To add a third, add one line here.
const SCREENS = [
  { href: "/", label: "Compare colleges" },
  { href: "/scatter", label: "Scatterplot" },
];

export default function Nav() {
  // The part of the URL before the "?" — either "/" or "/scatter".
  // We compare against it to find which screen we're on.
  const pathname = usePathname();

  // The part of the URL after the "?", as an object we can read values out of.
  const searchParams = useSearchParams();

  // Carry the selected major from screen to screen. If the current URL is
  // "/?major=1107", we add "?major=1107" to both nav links, so switching
  // screens keeps you on the same major. encodeURIComponent makes the value
  // safe to drop into a URL.
  const major = searchParams.get("major");
  let majorSuffix = "";
  if (major) {
    majorSuffix = `?major=${encodeURIComponent(major)}`;
  }

  return (
    <nav className={styles.nav}>
      {SCREENS.map((screen) => {
        const isActive = pathname === screen.href;

        // Every link gets the "link" class. The current screen's link gets
        // "active" as well, which overrides a few of the properties.
        let className = styles.link;
        if (isActive) {
          className = `${styles.link} ${styles.active}`;
        }

        return (
          <Link
            key={screen.href}
            href={screen.href + majorSuffix}
            className={className}
            // Tells screen readers which link is the page they're on.
            aria-current={isActive ? "page" : undefined}
          >
            {screen.label}
          </Link>
        );
      })}
    </nav>
  );
}
