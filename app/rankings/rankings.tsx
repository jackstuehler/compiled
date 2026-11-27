"use client";

import { useMemo, useState, type FormEvent } from "react";
import { collegeName, place, type Major, type School } from "@/lib/measures";
import {
  categories, categoryKeys, initialPreferences, prices, rankingIssue,
  rankSchools, settings, sizes, type Category, type Preferences,
} from "@/lib/rankings";
import FilterButton, { matchesFilters, NO_FILTERS } from "../filters";
import MajorPicker from "../major-picker";
import ui from "../ui.module.css";
import pageStyles from "../page.module.css";
import styles from "./rankings.module.css";

const levels = [0, 1, 2, 3, 4, 5];

export default function Rankings({ rows, majors, selected }: {
  rows: School[];
  majors: Major[];
  selected: string;
}) {
  const [draft, setDraft] = useState(initialPreferences);
  const [applied, setApplied] = useState<Preferences | null>(null);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [editing, setEditing] = useState(true);
  const totalWeight = Object.values(draft.weights).reduce((sum, weight) => sum + weight, 0);
  const issue = rankingIssue(draft);
  const ranked = useMemo(() => applied ? rankSchools(rows, applied) : [], [rows, applied]);
  const visible = ranked.map((result, index) => ({ ...result, rank: index + 1 }))
    .filter(({ school }) => matchesFilters(school, filters));
  const scoredCount = visible.filter(({ score }) => score !== null).length;

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function setWeight(key: Category, weight: number) {
    setDraft((previous) => ({ ...previous, weights: { ...previous.weights, [key]: weight } }));
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (issue) return;
    setApplied(draft);
    setEditing(false);
  }

  return (
    <div className={styles.page}>
      <header className={pageStyles.majorControl}>
        <h1>Personalized rankings</h1>
        <label className={pageStyles.majorLabel}>Major <MajorPicker majors={majors} selected={selected} /></label>
      </header>

      <div className={styles.workspace}>
        <button type="button" className={`${ui.button} ${styles.edit}`}
          aria-expanded={editing} aria-controls="ranking-priorities" onClick={() => setEditing(!editing)}>
          {editing ? "Hide priorities" : "Edit priorities"}
        </button>

        <form id="ranking-priorities" className={styles.priorities} data-editing={editing} onSubmit={apply}>
          <h2>Priorities</h2>
          <p className={styles.muted}>Set importance from 0 (ignore) to 5 (highest).</p>
          {categoryKeys.map((key) => (
            <div key={key} className={styles.category}>
              <fieldset>
                <legend>{categories[key]}</legend>
                <div className={styles.levelRow}>
                  <div className={styles.levels}>
                    {levels.map((level) => (
                      <label key={level}>
                        <input type="radio" name={key} value={level} checked={draft.weights[key] === level}
                          onChange={() => setWeight(key, level)} aria-label={`Importance ${level}`} />
                        <span>{level}</span>
                      </label>
                    ))}
                  </div>
                  <span className={styles.weight} aria-label="Share of total weight">
                    {totalWeight ? Math.round(100 * draft.weights[key] / totalWeight) : 0}%
                  </span>
                </div>
              </fieldset>

              {draft.weights[key] > 0 && key === "affordability" && (
                <label className={ui.field}>Household income
                  <select className={ui.input} value={draft.price}
                    onChange={(event) => update("price", event.target.value as Preferences["price"])}>
                    {Object.entries(prices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              )}
              {draft.weights[key] > 0 && key === "debt" && (
                <p className={styles.muted}>Favors colleges with lower median student debt for this major.</p>
              )}
              {draft.weights[key] > 0 && key === "success" && (
                <p className={styles.muted}>
                  Favors higher graduation and student retention rates.
                </p>
              )}
              {draft.weights[key] > 0 && key === "selectivity" && (
                <fieldset>
                  <legend>Selectivity preference</legend>
                  <div className={`${styles.levels} ${styles.directions}`}>
                    {(["more", "less"] as const).map((direction) => (
                      <label key={direction}>
                        <input type="radio" name="selectivity-direction" value={direction}
                          checked={draft.selectivity === direction}
                          onChange={() => update("selectivity", direction)} />
                        <span>{direction === "more" ? "More selective" : "Less selective"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {draft.weights[key] > 0 && key === "campus" && (
                <div className={styles.campus}>
                  <label className={ui.field}>Undergraduate enrollment
                    <select className={ui.input} value={draft.size}
                      onChange={(event) => update("size", event.target.value as Preferences["size"])}>
                      <option value="">Any size</option>
                      {Object.entries(sizes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <fieldset>
                    <legend>Campus setting</legend>
                    <div className={styles.settings}>
                      {Object.entries(settings).map(([value, label]) => {
                        const code = Number(value);
                        return (
                          <label key={value}>
                            <input type="checkbox" checked={draft.settings.includes(code)}
                              onChange={(event) => update("settings", event.target.checked
                                ? [...draft.settings, code] : draft.settings.filter((setting) => setting !== code))} />
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className={ui.field}>Program size
                    <select className={ui.input} value={draft.program}
                      onChange={(event) => update("program", event.target.value as Preferences["program"])}>
                      <option value="">Any size</option>
                      <option value="smaller">Smaller programs</option>
                      <option value="larger">Larger programs</option>
                    </select>
                  </label>
                  <label className={styles.check}>
                    <input type="checkbox" checked={draft.lowerRatio}
                      onChange={(event) => update("lowerRatio", event.target.checked)} />
                    Favor a lower student-to-faculty ratio
                  </label>
                </div>
              )}
            </div>
          ))}
          {issue && <p className={styles.muted}>{issue}</p>}
          <button type="submit" className={`${ui.button} ${styles.apply}`} disabled={Boolean(issue)}>
            {applied ? "Update ranking" : "Rank colleges"}
          </button>
        </form>

        <section aria-labelledby="ranking-results" className={styles.results}>
          <header className={styles.resultsHeader}>
            <div>
              <h2 id="ranking-results">Results</h2>
              <p className={styles.muted} role="status">
                {applied
                  ? `${scoredCount.toLocaleString()} ranked`
                  : "Set your priorities to rank colleges for this major."}
              </p>
            </div>
            {applied && <FilterButton rows={rows} filters={filters} onFiltersChange={setFilters} />}
          </header>

          {applied && (
            <p className={styles.applied}>
              {categoryKeys.filter((key) => applied.weights[key]).map((key) =>
                `${categories[key]} ${Math.round(100 * applied.weights[key] /
                  Object.values(applied.weights).reduce((sum, weight) => sum + weight, 0))}%`).join(" · ")}
            </p>
          )}
          {applied && visible.length === 0 && <p className={styles.empty}>No colleges match the current selection.</p>}
          {visible.length > 0 && (
            <table className={styles.table}>
              <thead><tr><th scope="col">Rank</th><th scope="col">College</th><th scope="col">Score</th></tr></thead>
              <tbody>
                {visible.map(({ school, rank, score, breakdown, missing }) => (
                  <tr key={school.unitid}>
                    <td>{score === null ? "—" : rank}</td>
                    <td>
                      <strong>{collegeName(school)}</strong>
                      <small>{place(school.city, school.stabbr)}</small>
                      <details className={styles.breakdown}>
                        <summary>Score breakdown</summary>
                        {missing.length > 0 && <p>Missing {missing.join(", ")}.</p>}
                        <ul>
                          {breakdown.map((category) => (
                            <li key={category.key}>
                              <strong>{categories[category.key]} · {Math.round(category.weight * 100)}% weight</strong>
                              <span>{category.score === null ? "Unavailable" : `${category.score.toFixed(1)} / 100`}</span>
                              {category.readings.map((reading) => (
                                <small key={reading.label}>{reading.label} · {reading.value ?? "Unavailable"}</small>
                              ))}
                              {category.note && <small>{category.note}</small>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td>{score === null ? <small>Insufficient data</small> : <strong>{score.toFixed(1)}</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
