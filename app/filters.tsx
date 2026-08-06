"use client";

import { useMemo, useRef } from "react";
import type { ChangeEvent } from "react";
import { CONTROL, TYPE_CODES, type School } from "@/lib/measures";
import ui from "./ui.module.css";
import styles from "./filters.module.css";

/** Filters currently applied to the college list. */
export type FilterState = {
  state: string; // two-letter state code, or "" for all states
  types: number[]; // 1 public, 2 private nonprofit, 3 private for-profit
};

/** No state restriction and every school type included. */
export const NO_FILTERS: FilterState = {
  state: "",
  types: TYPE_CODES,
};

/** Number of filter categories currently narrowing the results. */
export function activeFilterCount(filters: FilterState): number {
  let count = 0;

  if (filters.state !== "") {
    count += 1;
  }

  if (filters.types.length !== TYPE_CODES.length) {
    count += 1;
  }

  return count;
}

/** Whether a college matches the current filters. */
export function matchesFilters(school: School, filters: FilterState): boolean {
  if (filters.state !== "" && school.stabbr !== filters.state) {
    return false;
  }

  return filters.types.includes(school.control);
}

export default function FilterButton({
  rows,
  filters,
  onFiltersChange,
}: {
  rows: School[];
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}) {
  // Lets us call the dialog element's built-in showModal() method.
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Build the state menu from the colleges currently available.
  const states = useMemo(() => {
    const seen = new Set<string>();

    for (const school of rows) {
      seen.add(school.stabbr);
    }

    return Array.from(seen).sort();
  }, [rows]);

  const count = activeFilterCount(filters);

  let buttonLabel = "Filters";
  if (count > 0) {
    buttonLabel = `Filters (${count})`;
  }

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function handleStateChange(event: ChangeEvent<HTMLSelectElement>) {
    onFiltersChange({
      ...filters,
      state: event.target.value,
    });
  }

  function toggleType(typeCode: number) {
    const isChecked = filters.types.includes(typeCode);

    let nextTypes: number[];

    if (isChecked) {
      nextTypes = filters.types.filter((code) => code !== typeCode);
    } else {
      nextTypes = [...filters.types, typeCode];
    }

    onFiltersChange({
      ...filters,
      types: nextTypes,
    });
  }

  return (
    <>
      <button type="button" className={ui.button} onClick={openDialog}>
        {buttonLabel}
      </button>

      <dialog ref={dialogRef} className={ui.dialog}>
        {/* Submitting a form inside a dialog closes it automatically. */}
        <form method="dialog" className={styles.form}>
          <h3 className={styles.title}>Filters</h3>

          <label className={ui.field}>
            State
            <select
              className={ui.input}
              value={filters.state}
              onChange={handleStateChange}
            >
              <option value="">All states</option>

              {states.map((stateCode) => (
                <option key={stateCode} value={stateCode}>
                  {stateCode}
                </option>
              ))}
            </select>
          </label>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Type</legend>

            <div className={styles.checkboxList}>
              {TYPE_CODES.map((typeCode) => (
                <label key={typeCode} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={filters.types.includes(typeCode)}
                    onChange={() => toggleType(typeCode)}
                  />
                  {CONTROL[typeCode]}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className={`${ui.button} ${styles.doneButton}`}>
            Done
          </button>
        </form>
      </dialog>
    </>
  );
}
