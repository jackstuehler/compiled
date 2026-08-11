import { Suspense } from "react";
import type { Metadata } from "next";
import Nav from "./nav";
import styles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compiled",
  description:
    "Compare colleges on cost, debt, and earnings by major using U.S. Department of Education College Scorecard data.",
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
            <h1 className={styles.brand}>
              Compil<span className={styles.brandAccent}>ed.</span>
            </h1>

            <div className={styles.navArea}>
              {/* Nav reads the URL query string, so it needs a Suspense boundary
                  during server rendering. The fallback reserves its space to
                  prevent the header from shifting when Nav appears. */}
              <Suspense fallback={<div className={styles.navPlaceholder} />}>
                <Nav />
              </Suspense>
            </div>

            {/* Balances the logo column so the navigation stays centered. */}
            <div className={styles.headerRight} aria-hidden="true" />
          </header>

          {children}
        </main>
      </body>
    </html>
  );
}
