import { Suspense } from "react";
import type { Metadata } from "next";
import Nav from "./nav";
import styles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CompilEd",
  description:
    "Compare colleges on cost, debt and earnings by major, using U.S. Department of Education College Scorecard data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.brand}>Compiled.</h1>

            <div className={styles.navArea}>
              {/* Nav reads the query string with useSearchParams, and that isn't
                  known until a request actually arrives. React requires a Suspense
                  boundary around anything that does this, so it can render the rest
                  of the page immediately and fill in this space afterwards. */}
              <Suspense fallback={<div className={styles.navPlaceholder} />}>
                <Nav />
              </Suspense>
            </div>

            {/* This balances the logo on the left so the navigation remains
                centered relative to the full page. It can hold a theme button later. */}
            <div className={styles.headerRight} />
          </header>

          {children}
        </main>
      </body>
    </html>
  );
}
