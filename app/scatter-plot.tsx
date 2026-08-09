"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import MajorPicker from "./major-picker";
import FilterButton, { NO_FILTERS, matchesFilters, type FilterState } from "./filters";
import Chart, { type Point } from "./chart";
import { AXIS_MEASURES, collegeName, matchesSearch, measure, searchableText, tokenize, type Major, type School } from "@/lib/measures";
import ui from "./ui.module.css";
import styles from "./scatter-plot.module.css";

/**
 * One axis chooser: a caption and a menu of measures. A component is just a
 * function that returns markup, so pulling this out means the X and Y pickers
 * are one line each instead of twelve identical ones twice over.
 */
function AxisSelect({ label, value, onChange }: { label: string; value: string; onChange: (nextKey: string) => void }) {
	return (
		<label className={ui.field}>
			{label}
			<select className={ui.input} value={value} onChange={(event) => onChange(event.target.value)}>
				{AXIS_MEASURES.map((option) => (
					<option key={option.key} value={option.key}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

export default function ScatterPlot({ rows, majors, selected }: { rows: School[]; majors: Major[]; selected: string }) {
	const [xKey, setXKey] = useState("sat_avg");
	const [yKey, setYKey] = useState("earn_mdn_4yr");
	const [query, setQuery] = useState("");
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
	//
	// `query` is deliberately NOT in this list. Searching highlights colleges
	// rather than removing them, so the set of points never changes as you type —
	// which is also what stops the chart from throwing away your zoom on every
	// keystroke (see the reset effect in chart.tsx).
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
				points.push({ id: school.unitid, label: collegeName(school), x, y });
			} else {
				dropped += 1;
			}
		}

		return { points, dropped };
	}, [rows, filters, xMeasure, yMeasure]);

	// Split every college name into lowercase words once, ahead of time, so
	// searching doesn't redo that work for every college on every keystroke.
	// searchableText hands back both of a college's names, so a college can be
	// found by either one. Only rebuilt when a different major is chosen and
	// `rows` changes. Same index the table builds, for the same reason.
	const searchIndex = useMemo(() => {
		return rows.map((school) => ({
			school: school,
			words: tokenize(searchableText(school)),
		}));
	}, [rows]);

	// The ids the chart should single out — or null when the search box is empty,
	// meaning nothing is singled out and every college is drawn the same.
	//
	// This can name colleges that aren't on the chart at all, because it doesn't
	// consult the filters or the missing-data rule. That's harmless: the chart
	// only ever asks whether a point it is already drawing is in here.
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

	// How many of the colleges actually on the chart match. Counted here rather
	// than taken from highlightedIds.size, because that set includes colleges
	// filtered out or dropped for missing data — reporting those would promise
	// matches the reader can't see.
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
				<label className={ui.field}>
					Major
					<MajorPicker majors={majors} selected={selected} className={`${ui.input} ${styles.fullWidth}`} />
				</label>

				<label className={ui.field}>
					Search
					<input className={`${ui.input} ${styles.fullWidth}`} type="search" value={query} placeholder="e.g. MIT or Tufts" onChange={handleQueryChange} />
				</label>

				<AxisSelect label="X-axis" value={xKey} onChange={setXKey} />
				<AxisSelect label="Y-axis" value={yKey} onChange={setYKey} />

				<div>
					<FilterButton rows={rows} filters={filters} onFiltersChange={setFilters} />
				</div>
			</aside>

			<div className={styles.chartArea}>
				<p className={styles.summary}>
					{summary}
					{dropped > 0 && <span className={styles.droppedNote}> · {dropped.toLocaleString()} hidden (missing data on one axis)</span>}
					{matchNote !== null && <span className={styles.matchNote}> · {matchNote}</span>}
				</p>

				<Chart points={points} xLabel={xMeasure.label} yLabel={yMeasure.label} xFormat={xMeasure.format} yFormat={yMeasure.format} highlightedIds={highlightedIds} />
			</div>
		</div>
	);
}
