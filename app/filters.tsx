"use client";

import { useMemo, useRef } from "react";
import type { ChangeEvent } from "react";
import { CONTROL, TYPE_CODES, type School } from "@/lib/measures";
import ui from "./ui.module.css";
import styles from "./filters.module.css";

/** Which filters the user currently has applied. */
export type FilterState = {
  state: string; // a two-letter state code, or "" meaning all states
  types: number[]; // control codes to include: 1 public, 2 private, 3 for-profit
};

/** The starting point: no state chosen, every type included. */
export const NO_FILTERS: FilterState = { state: "", types: TYPE_CODES };

/** How many filters are narrowing the results. Shown on the Filters button. */
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

/** True if this college should be visible given the current filters. */
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
  // A ref is a handle on the real <dialog> element in the page, so we can call
  // its built-in showModal() method. It's empty until React has actually put
  // the element on screen — that's why the call below uses "?." to skip the
  // call safely if it isn't there yet.
  const dialogRef = useRef<HTMLDialogElement>(null);

  // The states to offer in the dropdown, built from the colleges actually in
  // the data rather than a hardcoded list of 50.
  //
  // useMemo caches the result and only recalculates when `rows` changes. Without
  // it, this would rebuild every time the user ticks a checkbox or opens the
  // dialog — work that can't change the answer.
  const states = useMemo(() => {
    // A Set can only ever hold one copy of a value, so adding every college's
    // state to it leaves us with each state exactly once.
    const seen = new Set<string>();
    for (const school of rows) {
      seen.add(school.stabbr);
    }
    // A Set remembers insertion order, so sort alphabetically for the menu.
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
    // Never edit `filters` in place. React only re-renders when it is handed a
    // NEW object, so we build a copy: "..." copies every existing field, then
    // `state:` overwrites just the one that changed.
    onFiltersChange({ ...filters, state: event.target.value });
  }

  function toggleType(typeCode: number) {
    const isCurrentlyChecked = filters.types.includes(typeCode);

    let nextTypes: number[];
    if (isCurrentlyChecked) {
      // Unchecking: keep every type except this one.
      nextTypes = filters.types.filter((code) => code !== typeCode);
    } else {
      // Checking: a copy of the current list, plus this one.
      nextTypes = [...filters.types, typeCode];
    }

    onFiltersChange({ ...filters, types: nextTypes });
  }

  return (
    <>
      <button type="button" className={ui.button} onClick={openDialog}>
        {buttonLabel}
      </button>

      <dialog ref={dialogRef} className={ui.dialog}>
        {/* method="dialog" is plain HTML, not React: submitting a form inside a
            <dialog> closes the dialog. That's why Done needs no onClick. */}
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

          <button className={`${ui.button} ${styles.doneButton}`}>Done</button>
        </form>
      </dialog>
    </>
  );
}
