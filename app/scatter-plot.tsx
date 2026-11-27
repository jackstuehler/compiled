"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import FilterButton, {
  NO_FILTERS,
  matchesFilters,
  type FilterState,
} from "./filters";
import Chart, { type Point } from "./chart";
import {
  AXIS_MEASURES,
  collegeName,
  matchesSearch,
  measure,
  searchableText,
  tokenize,
  type School,
} from "@/lib/measures";
import ui from "./ui.module.css";
import styles from "./scatter-plot.module.css";

/** Reusable axis selector for choosing a numeric measure. */
function AxisSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (nextKey: string) => void;
}) {
  return (
    <label className={ui.field}>
      {label}
      <select
        className={ui.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {AXIS_MEASURES.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ScatterPlot({
  rows,
  majorPicker,
}: {
  rows: School[];
  majorPicker: ReactNode;
}) {
  const [xKey, setXKey] = useState("sat_avg");
  const [yKey, setYKey] = useState("earn_mdn_4yr");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);

  const xMeasure = measure(xKey);
  const yMeasure = measure(yKey);

  // Search highlights points rather than removing them, so `query` is not a
  // dependency and typing does not reset the chart's point set or zoom state.
  const points = useMemo(() => {
    const points: Point[] = [];

    for (const school of rows) {
      if (!matchesFilters(school, filters)) {
        continue;
      }

      const x = xMeasure.get(school);
      const y = yMeasure.get(school);

      // A college can only be plotted when both axis values are numeric.
      if (typeof x === "number" && typeof y === "number") {
        points.push({ id: school.unitid, label: collegeName(school), x, y });
      }
    }

    return points;
  }, [rows, filters, xMeasure, yMeasure]);

  // Precompute searchable name tokens when the college dataset changes.
  const searchIndex = useMemo(() => {
    return rows.map((school) => ({
      school: school,
      words: tokenize(searchableText(school)),
    }));
  }, [rows]);

  // null means no active search, so all plotted colleges render normally.
  const highlightedIds = useMemo(() => {
    const searchTerms = tokenize(query);
    if (searchTerms.length === 0) {
      return null;
    }

    const ids = new Set<number>();
    for (const entry of searchIndex) {
      if (matchesSearch(entry.words, searchTerms)) {
        ids.add(entry.school.unitid);
      }
    }
    return ids;
  }, [searchIndex, query]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  // Count only matches that are actually plotted; highlightedIds can also
  // contain colleges removed by filters or missing axis data.
  let matchCount = 0;
  if (highlightedIds !== null) {
    for (const point of points) {
      if (highlightedIds.has(point.id)) {
        matchCount += 1;
      }
    }
  }

  let summary = `${points.length.toLocaleString()} colleges plotted`;
  if (points.length === 1) {
    summary = "1 college plotted";
  }

  let matchNote = null;
  if (highlightedIds !== null) {
    matchNote = `${matchCount.toLocaleString()} match your search`;
    if (matchCount === 1) {
      matchNote = "1 matches your search";
    }
    if (matchCount === 0) {
      matchNote = "no plotted college matches your search";
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        {majorPicker}

        <label className={ui.field}>
          Highlight colleges
          <input
            className={`${ui.input} ${styles.fullWidth}`}
            type="search"
            value={query}
            placeholder="e.g. Tufts"
            onChange={handleQueryChange}
          />
        </label>

        <AxisSelect label="X-axis" value={xKey} onChange={setXKey} />
        <AxisSelect label="Y-axis" value={yKey} onChange={setYKey} />

        <div>
          <FilterButton
            rows={rows}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </aside>

      <div className={styles.chartArea}>
        <p className={styles.summary}>
          {summary}
          {matchNote !== null && (
            <span className={styles.matchNote}> · {matchNote}</span>
          )}
        </p>

        <Chart
          points={points}
          xLabel={xMeasure.label}
          yLabel={yMeasure.label}
          xFormat={xMeasure.format}
          yFormat={yMeasure.format}
          highlightedIds={highlightedIds}
        />
      </div>
    </div>
  );
}
