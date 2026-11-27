"use client";

import { useMemo, useRef, useState } from "react";
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
  collegeName,
  matchesSearch,
  measure,
  formatValue,
  place,
  searchableText,
  tokenize,
  type Measure,
  type School,
} from "@/lib/measures";

type TableColumn = Measure & { heading?: string };

function numericColumn(
  key: keyof School,
  label: string,
  format: "money" | "number" | "percent",
  heading?: string,
): TableColumn {
  return {
    key,
    label,
    format,
    heading,
    get: (school) => {
      const value = school[key];
      return value == null ? null : Number(value);
    },
  };
}

const columns: TableColumn[] = [
  { ...measure("earn_mdn_4yr"), heading: "Major earnings (4\u00a0yr)" },
  measure("npt4"),
  measure("debt_all_stgp_eval_mdn"),
  measure("grad_rate"),
  numericColumn("retention_rate", "First-year retention", "percent"),
  measure("adm_rate"),
  measure("sat_avg"),
  numericColumn("satvr25", "SAT reading/writing (25th)", "number", "SAT R/W (25th)"),
  numericColumn("satvr50", "SAT reading/writing (50th)", "number", "SAT R/W (50th)"),
  numericColumn("satvr75", "SAT reading/writing (75th)", "number", "SAT R/W (75th)"),
  numericColumn("satmt25", "SAT math (25th)", "number"),
  numericColumn("satmt50", "SAT math (50th)", "number"),
  numericColumn("satmt75", "SAT math (75th)", "number"),
  numericColumn("actcm25", "ACT (25th)", "number"),
  measure("actcm50"),
  numericColumn("actcm75", "ACT (75th)", "number"),
  measure("ugds"),
  measure("stufacr"),
  numericColumn("major_completions", "Major completions", "number"),
  measure("md_earn_4yr"),
  numericColumn("earn_count_wne_4yr", "Major earnings cohort", "number"),
  measure("grad_debt_mdn"),
  numericColumn("debt_all_pp_eval_mdn", "Major Parent PLUS debt", "money"),
  numericColumn("repay_3yr", "Three-year repayment rate", "percent"),
  numericColumn("npt4_0_30", "Net price · income $0–30k", "money"),
  numericColumn("npt4_30_48", "Net price · income $30–48k", "money"),
  numericColumn("npt4_48_75", "Net price · income $48–75k", "money"),
  numericColumn("npt4_75_110", "Net price · income $75–110k", "money"),
  numericColumn("npt4_110_plus", "Net price · income above $110k", "money"),
];

const collegeSort = measure("instnm");
const allColumnKeys = columns.map((column) => column.key);

/** Returns the official name only when it differs from the displayed name. */
function officialNameTooltip(school: School): string | undefined {
  if (collegeName(school) === school.instnm) {
    return undefined;
  }
  return school.instnm;
}

/**
 * Compares sortable values in the requested direction.
 * Missing values always sort to the bottom.
 */
function compareValues(
  a: number | string | null,
  b: number | string | null,
  direction: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b) * direction;
  }

  return (Number(a) - Number(b)) * direction;
}

export default function CollegeTable({ rows }: { rows: School[] }) {
  const [sortKey, setSortKey] = useState("earn_mdn_4yr");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);
  const [columnKeys, setColumnKeys] = useState(allColumnKeys);
  const columnsDialog = useRef<HTMLDialogElement>(null);
  const visibleColumns = columns.filter((column) => columnKeys.includes(column.key));
  const activeSort = columns.find((column) => column.key === sortKey) ?? collegeSort;

  function updateColumns(next: string[]) {
    setColumnKeys(next);
    if (sortKey !== collegeSort.key && !next.includes(sortKey)) {
      setSortKey(collegeSort.key);
      setOrder("asc");
    }
  }


  // Split every college name into lowercase words once, ahead of time, so
  // searching doesn't redo that work for every college on every keystroke.
  // searchableText hands back both of a college's names, so a college can be
  // found by either one. Only rebuilt when a different major is chosen and
  // `rows` changes.
  const searchIndex = useMemo(() => {
    return rows.map((school) => ({
      school: school,
      words: tokenize(searchableText(school)),
    }));
  }, [rows]);

  // The rows actually on screen, after searching, filtering and sorting.
  // useMemo re-runs this only when one of the values in the list at the bottom
  // changes — not on every render.
  const visibleRows = useMemo(() => {
    const searchTerms = tokenize(query);
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

    // Sort the newly built array rather than mutating the rows prop.
    kept.sort((a, b) => compareValues(activeSort.get(a), activeSort.get(b), direction));

    return kept;
  }, [searchIndex, activeSort, order, query, filters]);

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
          Find a college
          <input
            className={ui.input}
            type="search"
            value={query}
            placeholder="e.g. Tufts"
            onChange={handleQueryChange}
          />
        </label>

        <FilterButton
          rows={rows}
          filters={filters}
          onFiltersChange={setFilters}
        />

        <button type="button" className={ui.button} aria-haspopup="dialog"
          onClick={() => columnsDialog.current?.showModal()}>
          Columns ({visibleColumns.length})
        </button>

        <dialog ref={columnsDialog} className={`${ui.dialog} ${styles.columnsDialog}`}
          aria-labelledby="table-columns-title">
          <form method="dialog" className={styles.columnsForm}>
            <h2 id="table-columns-title">Table columns</h2>
            <div className={styles.columnActions}>
              <button type="button" className={ui.button} onClick={() => updateColumns(allColumnKeys)}>
                Select all
              </button>
              <button type="button" className={ui.button} onClick={() => updateColumns([])}>
                Clear all
              </button>
            </div>
            <fieldset className={styles.columnChoices} aria-label="Metrics to display">
              {columns.map((column) => (
                <label key={column.key}>
                  <input type="checkbox" checked={columnKeys.includes(column.key)}
                    onChange={(event) => updateColumns(event.target.checked
                      ? [...columnKeys, column.key]
                      : columnKeys.filter((key) => key !== column.key))} />
                  {column.label}
                </label>
              ))}
            </fieldset>
            <button type="submit" className={`${ui.button} ${styles.columnsDone}`}>Done</button>
          </form>
        </dialog>

        <div className={styles.sortGroup}>
          <label className={ui.field}>
            Sort by
            <select
              className={ui.input}
              value={sortKey}
              onChange={handleSortKeyChange}
            >
              {[collegeSort, ...visibleColumns].map((option) => (
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

      <div className={styles.scrollBox} role="region" aria-label="College data table" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.firstColumn}
                aria-sort={sortKey === "instnm" ? (isAscending ? "ascending" : "descending") : undefined}>
                <span className={styles.collegeCell}>
                  <span className={styles.collegeHeading}>College</span>
                </span>
              </th>
              {visibleColumns.map((column) => (
                <th key={column.key} scope="col" className={styles.numeric}
                  aria-label={column.heading ? column.label : undefined}
                  aria-sort={column.key === sortKey ? (isAscending ? "ascending" : "descending") : undefined}>
                  <span title={column.heading ? column.label : undefined}>
                    {column.heading ?? column.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((school, index) => (
              <tr key={school.unitid}>
                <td
                  className={styles.firstColumn}
                  title={officialNameTooltip(school)}
                >
                  <div className={styles.collegeCell}>
                    <span className={styles.rank}>{index + 1}</span>
                    <span className={styles.identity}>
                      {collegeName(school)}
                      <small>{place(school.city, school.stabbr)} · {CONTROL[school.control] ?? DASH}</small>
                    </span>
                  </div>
                </td>
                {visibleColumns.map((column) => {
                  const value = column.get(school);
                  return (
                    <td key={column.key} className={column.key === sortKey ? styles.sorted : styles.numeric}>
                      {typeof value === "string" ? value : formatValue(value, column.format)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
