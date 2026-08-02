"use client";

import { useMemo, useState } from "react";
import MajorPicker from "./major-picker";
import FilterButton, {
  NO_FILTERS,
  matchesFilters,
  type FilterState,
} from "./filters";
import Chart, { type Point } from "./chart";
import {
  AXIS_MEASURES,
  measure,
  type Major,
  type School,
} from "@/lib/measures";
import ui from "./ui.module.css";
import styles from "./scatter-plot.module.css";

/**
 * One axis chooser: a caption and a menu of measures. A component is just a
 * function that returns markup, so pulling this out means the X and Y pickers
 * are one line each instead of twelve identical ones twice over.
 */
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
  majors,
  selected,
}: {
  rows: School[];
  majors: Major[];
  selected: string;
}) {
  const [xKey, setXKey] = useState("sat_avg");
  const [yKey, setYKey] = useState("earn_mdn_4yr");
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);

  // Look up everything we know about the chosen measures: the label to print,
  // how to format its numbers, and the function that reads the value out of a
  // college.
  const xMeasure = measure(xKey);
  const yMeasure = measure(yKey);

  // Turn the colleges into points the chart can draw, and count the ones we
  // couldn't place.
  //
  // The dependency list names xMeasure and yMeasure rather than xKey and yKey.
  // That's safe because measure() returns the same object every time it's
  // asked for a given key — if it built a fresh one on each call, React would
  // see a different dependency every render and this memo would never hit.
  const { points, dropped } = useMemo(() => {
    const points: Point[] = [];
    let dropped = 0;

    for (const school of rows) {
      if (!matchesFilters(school, filters)) {
        continue;
      }

      const x = xMeasure.get(school);
      const y = yMeasure.get(school);

      // A point needs a real number on BOTH axes. Missing either one, there is
      // nowhere on the chart to put this college.
      if (typeof x === "number" && typeof y === "number") {
        points.push({ id: school.unitid, label: school.instnm, x, y });
      } else {
        dropped += 1;
      }
    }

    return { points, dropped };
  }, [rows, filters, xMeasure, yMeasure]);

  let summary = `${points.length.toLocaleString()} colleges plotted`;
  if (points.length === 1) {
    summary = "1 college plotted";
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <label className={ui.field}>
          Major
          <MajorPicker
            majors={majors}
            selected={selected}
            className={`${ui.input} ${styles.fullWidth}`}
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
          {dropped > 0 && (
            <span className={styles.droppedNote}>
              {" "}
              · {dropped.toLocaleString()} hidden (missing data on one axis)
            </span>
          )}
        </p>

        <Chart
          points={points}
          xLabel={xMeasure.label}
          yLabel={yMeasure.label}
          xFormat={xMeasure.format}
          yFormat={yMeasure.format}
        />
      </div>
    </div>
  );
}
