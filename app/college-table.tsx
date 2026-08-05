"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import FilterButton, {
  NO_FILTERS,
  matchesFilters,
  type FilterState,
} from "./filters";
import ui from "./ui.module.css";
import styles from "./college-table.module.css";
import {
  CONTROL,
  DASH,
  MEASURES,
  measure,
  money,
  num,
  pct,
  place,
  tokenize,
  type School,
} from "@/lib/measures";

/**
 * True if every word the user typed starts some word in the college name.
 * "penn eri" matches "Pennsylvania State University - Erie".
 *
 * An empty search matches everything: with no terms, the loop never runs and
 * never finds a reason to say no.
 */
function matchesSearch(nameWords: string[], searchTerms: string[]): boolean {
  for (const term of searchTerms) {
    const someWordStartsWithTerm = nameWords.some((word) =>
      word.startsWith(term),
    );
    if (!someWordStartsWithTerm) {
      return false;
    }
  }
  return true;
}

/**
 * Compares two values so .sort() can order them.
 *
 * The contract .sort() expects: return a negative number if `a` belongs first,
 * a positive number if `b` does, and 0 if they tie.
 *
 * `direction` is 1 for ascending or -1 for descending — multiplying by it
 * flips the result, which saves writing the comparison twice.
 */
function compareValues(
  a: number | string | null,
  b: number | string | null,
  direction: 1 | -1,
): number {
  // Colleges missing this measure always sink to the bottom, whichever way
  // we're sorting. These three lines ignore `direction` on purpose.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Text sorts alphabetically. localeCompare handles capitals and accented
  // letters properly, which comparing with < and > does not.
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b) * direction;
  }

  // Numbers sort by subtraction: if `a` is bigger, the result is positive.
  return (Number(a) - Number(b)) * direction;
}

export default function CollegeTable({ rows }: { rows: School[] }) {
  const [sortKey, setSortKey] = useState("earn_mdn_4yr");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);

  // Split every college name into lowercase words once, ahead of time, so
  // searching doesn't redo that work for every college on every keystroke.
  // Only rebuilt when a different major is chosen and `rows` changes.
  const searchIndex = useMemo(() => {
    return rows.map((school) => ({
      school: school,
      words: tokenize(school.instnm),
    }));
  }, [rows]);

  // The rows actually on screen, after searching, filtering and sorting.
  // useMemo re-runs this only when one of the values in the list at the bottom
  // changes — not on every render.
  const visibleRows = useMemo(() => {
    const searchTerms = tokenize(query);
    const sortBy = measure(sortKey);
    const direction = order === "asc" ? 1 : -1;

    const kept: School[] = [];
    for (const entry of searchIndex) {
      if (!matchesFilters(entry.school, filters)) {
        continue;
      }
      if (!matchesSearch(entry.words, searchTerms)) {
        continue;
      }
      kept.push(entry.school);
    }

    // .sort() rearranges the array it is called on. `kept` is a list we just
    // built ourselves, so sorting it is safe — sorting `rows` would quietly
    // reorder data the page above us owns.
    kept.sort((a, b) => compareValues(sortBy.get(a), sortBy.get(b), direction));

    return kept;
  }, [searchIndex, sortKey, order, query, filters]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  function handleSortKeyChange(event: ChangeEvent<HTMLSelectElement>) {
    setSortKey(event.target.value);
  }

  function toggleOrder() {
    if (order === "asc") {
      setOrder("desc");
    } else {
      setOrder("asc");
    }
  }

  const isAscending = order === "asc";
  const orderArrow = isAscending ? "↑" : "↓";
  const orderLabel = isAscending ? "Sorted ascending" : "Sorted descending";
  const orderHint = isAscending
    ? "Ascending — click for descending"
    : "Descending — click for ascending";

  let countLabel = `${visibleRows.length.toLocaleString()} colleges`;
  if (visibleRows.length === 1) {
    countLabel = "1 college";
  }

  return (
    <div className={styles.tableSection}>
      <div className={styles.controls}>
        <label className={ui.field}>
          Search
          <input
            className={ui.input}
            type="search"
            value={query}
            placeholder="e.g. Tufts University"
            onChange={handleQueryChange}
          />
        </label>

        <FilterButton
          rows={rows}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <div className={styles.sortGroup}>
          <label className={ui.field}>
            Sort by
            <select
              className={ui.input}
              value={sortKey}
              onChange={handleSortKeyChange}
            >
              {MEASURES.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`${ui.button} ${styles.orderButton}`}
            onClick={toggleOrder}
            aria-label={orderLabel}
            title={orderHint}
          >
            {orderArrow}
          </button>
        </div>
      </div>

      <p className={styles.count}>{countLabel}</p>

      <div className={styles.scrollBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.firstColumn}>Rank / College</th>
              <th>Location</th>
              <th>Type</th>
              <th className={styles.numeric}>Undergrads</th>
              <th className={styles.numeric}>Stu:Fac</th>
              <th className={styles.numeric}>Admit rate</th>
              <th className={styles.numeric}>SAT avg</th>
              <th className={styles.numeric}>ACT med</th>
              <th className={styles.numeric}>Grad rate</th>
              <th className={styles.numeric}>Avg cost</th>
              <th className={styles.numeric}>Salary (all)</th>
              <th className={styles.numeric}>Salary (major)</th>
              <th className={styles.numeric}>Debt (all)</th>
              <th className={styles.numeric}>Debt (major)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((school, index) => (
              <tr key={school.unitid}>
                <td className={styles.firstColumn}>
                  {/* The rank is the row's position in what's on screen right
                      now, so it renumbers whenever the sort or filters change. */}
                  <span className={styles.rank}>{index + 1}</span>
                  {school.instnm}
                </td>
                <td>{place(school.city, school.stabbr)}</td>
                <td>{CONTROL[school.control] ?? DASH}</td>
                <td className={styles.numeric}>{num(school.ugds)}</td>
                <td className={styles.numeric}>{num(school.stufacr)}</td>
                <td className={styles.numeric}>{pct(school.adm_rate)}</td>
                <td className={styles.numeric}>{num(school.sat_avg)}</td>
                <td className={styles.numeric}>{num(school.actcm50)}</td>
                <td className={styles.numeric}>{pct(school.grad_rate)}</td>
                <td className={styles.numeric}>{money(school.npt4)}</td>
                <td className={styles.numeric}>{money(school.md_earn_4yr)}</td>
                <td className={styles.numeric}>{money(school.earn_mdn_4yr)}</td>
                <td className={styles.numeric}>
                  {money(school.grad_debt_mdn)}
                </td>
                <td className={styles.numeric}>
                  {money(school.debt_all_stgp_eval_mdn)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
