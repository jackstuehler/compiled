// ---------------------------------------------------------------------------
// One college, as it comes back from the database
// ---------------------------------------------------------------------------

export type School = {
	unitid: number; // the federal ID for this institution — unique, so we use it as the React key
	instnm: string; // the official institution name, as the Dept. of Education publishes it
	short_name: string | null; // our shortened version, or null when we never wrote one
	city: string | null;
	stabbr: string; // two-letter state code
	control: number; // 1 public, 2 private non-profit, 3 for-profit

	ugds: number | null; // undergraduates enrolled
	stufacr: number | null; // students per faculty member

	// adm_rate and grad_rate are DECIMAL columns in MySQL, and the driver hands
	// those back as STRINGS rather than numbers so that no precision is lost in
	// the conversion. That's why they're typed `string | null` here, and why
	// anything doing arithmetic on them has to call Number() first.
	adm_rate: string | null; // 0.04 means a 4% admit rate
	grad_rate: string | null;

	sat_avg: number | null;
	actcm50: number | null;
	npt4: number | null; // average net price. SIGNED on purpose: aid can exceed cost

	md_earn_4yr: number | null; // median salary across all majors at this college
	earn_mdn_4yr: number | null; // median salary for the selected major
	grad_debt_mdn: number | null; // median debt across all majors
	debt_all_stgp_eval_mdn: number | null; // median debt for the selected major
};

/** Shown in place of a value the data doesn't have. */
export const DASH = "—";

/** One major, as offered in the picker. */
export type Major = {
	cip_code: string; // the federal CIP code, e.g. "1107"
	cip_desc: string; // its name, e.g. "Computer Science"
};

// ---------------------------------------------------------------------------
// College names
// ---------------------------------------------------------------------------

/**
 * Official names longer than this get replaced by the short version.
 *
 * The first column of the table is sticky, so its width comes straight out of
 * the horizontal space available to every other column. One
 * "Pennsylvania State University-Penn State Harrisburg" in the results pushes
 * every numeric column off the right-hand edge for the whole table.
 *
 * This is only a display choice, so it's safe to change. Every college whose
 * official name runs past 28 characters has a short_name, so any cutoff from
 * 29 up behaves consistently. Set it lower and nothing breaks — the colleges
 * in between simply have no short name and keep their official one.
 */
export const NAME_CUTOFF = 30;

/**
 * The name to put on screen for one college: the longest one that still fits.
 *
 * Most colleges have no short_name at all, because their official name was
 * already short enough that we never wrote one. Where a short name does exist
 * it's normally an abbreviation, and we'd rather show the official name
 * whenever there's room for it.
 *
 * The exception is the two dozen colleges that share an official name with
 * some other college — there are three separate Bethel Universities, and three
 * St. John's Colleges. For those, short_name is the official name with a state
 * added, so it's LONGER, and it has to win no matter what the cutoff says.
 * Otherwise all three Bethels render as "Bethel University" and the table
 * looks like it's repeating itself.
 */
export function collegeName(school: School): string {
	if (school.short_name === null) {
		return school.instnm;
	}
	if (school.short_name.length > school.instnm.length) {
		// Longer than the official name means it's a disambiguating name, not an
		// abbreviation. Always prefer it.
		return school.short_name;
	}
	if (school.instnm.length >= NAME_CUTOFF) {
		return school.short_name;
	}
	return school.instnm;
}

/**
 * Everything the search box should look inside, for one college.
 *
 * Both names go in, so "Massachusetts" finds MIT and "MIT" finds it too —
 * whichever one happens to be on screen. Where the two names share words the
 * index just sees the same word twice, which costs nothing.
 */
export function searchableText(school: School): string {
	if (school.short_name === null) {
		return school.instnm;
	}
	return `${school.instnm} ${school.short_name}`;
}

// ---------------------------------------------------------------------------
// Types of college
// ---------------------------------------------------------------------------

/** Turns the number stored in the `control` column into something readable. */
export const CONTROL: Record<number, string> = {
	1: "Public",
	2: "Private",
	3: "For-profit",
};

/** The three codes, in the order the filter checkboxes should list them. */
export const TYPE_CODES = [1, 2, 3];

// ---------------------------------------------------------------------------
// Formatting numbers for display
// ---------------------------------------------------------------------------

export type MeasureFormat = "text" | "number" | "money" | "percent";

/** Full precision — used in table cells and the chart's tooltip. */
export function formatValue(value: number | null, format: MeasureFormat): string {
	if (value === null) {
		return DASH;
	}
	if (format === "money") {
		return "$" + value.toLocaleString("en-US");
	}
	if (format === "percent") {
		// Percentages are stored as fractions: 0.043 is a 4.3% admit rate.
		return (value * 100).toFixed(1) + "%";
	}
	// toLocaleString inserts thousands separators: 21496 becomes "21,496".
	return value.toLocaleString("en-US");
}

// Three shorthands for the table, so a cell reads money(...) rather than
// formatValue(..., "money"). They all defer to formatValue, so there's still
// only one place that decides what a dollar amount looks like.

export function money(value: number | null) {
	return formatValue(value, "money");
}

export function num(value: number | null) {
	return formatValue(value, "number");
}

export function pct(value: string | null) {
	// Takes a string because this is used on the DECIMAL columns described above.
	if (value === null) {
		return DASH;
	}
	return formatValue(Number(value), "percent");
}

/** "Erie, PA" — or just "PA" when the data has no city. */
export function place(city: string | null, stabbr: string) {
	if (city === null) {
		return stabbr;
	}
	return `${city}, ${stabbr}`;
}

/**
 * A shorter format for axis tick labels, where "$175,000" printed six times
 * across a chart is far too wide.
 *
 * `step` is the gap between neighbouring ticks. It decides how much precision
 * to show: ticks five percentage points apart need no decimal, but ticks half
 * a point apart would otherwise print as "0%, 0%, 1%, 1%".
 */
export function formatTick(value: number, format: MeasureFormat, step: number): string {
	if (format === "percent") {
		// step is a fraction, same as the values, so × 100 puts it in the units
		// we're about to print in.
		const stepInPercentagePoints = step * 100;
		let decimals = 0;
		if (stepInPercentagePoints < 1) {
			decimals = 1;
		}
		return (value * 100).toFixed(decimals) + "%";
	}

	if (format === "money") {
		if (Math.abs(value) >= 1000) {
			const thousands = value / 1000;
			// "$50k" reads better than "$50.0k", but "$62.5k" needs its decimal.
			if (Number.isInteger(thousands)) {
				return "$" + thousands + "k";
			}
			return "$" + thousands.toFixed(1) + "k";
		}
		return "$" + value.toLocaleString("en-US");
	}

	return value.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Measures — the columns you can sort by and plot
// ---------------------------------------------------------------------------

/**
 * A Measure is one thing you can look at about a college: its admit rate, its
 * median salary, how many undergraduates it has.
 *
 * The interesting part is `get`. Rather than storing the NAME of a database
 * column and looking it up later, each measure carries a small FUNCTION that
 * knows how to pull its own value out of a college. That buys three things:
 *
 *   - A measure that needs converting — adm_rate arrives as text — does the
 *     conversion itself, and nothing downstream has to know about it.
 *   - A measure could be calculated from several columns, or from none of
 *     them, without anything else changing.
 *   - The sort menu, both axis pickers and the tooltip all read this one list,
 *     so adding a measure is a single entry here instead of edits in four files.
 *
 * The cost is a step of indirection when reading the code: `sortBy.get(school)`
 * doesn't tell you which column it reads, because that depends on which
 * measure the user picked. That's the price of treating the columns as data
 * rather than as code, and it's why this file is worth understanding first.
 *
 * Name is the measure that shows why this is worth the indirection: it reads
 * two columns and a length rule, and the sort menu neither knows nor cares.
 */
export type Measure = {
	key: string; // usually the database column name, and is what we store in state
	label: string; // what the user sees in a menu
	format: MeasureFormat; // how to print its values
	get: (school: School) => number | string | null;
};

export const MEASURES: Measure[] = [
	{
		key: "instnm",
		label: "Name",
		format: "text",
		// Sorts by whichever name is on screen, so the A–Z order matches what you
		// can actually read. The cost is that a college filed under its short name
		// sorts there too: UT Austin lands under U, not under T for "The
		// University of Texas at Austin".
		get: (school) => collegeName(school),
	},
	{
		key: "ugds",
		label: "Undergrads",
		format: "number",
		get: (school) => school.ugds,
	},
	{
		key: "stufacr",
		label: "Stu:Fac",
		format: "number",
		get: (school) => school.stufacr,
	},
	{
		key: "adm_rate",
		label: "Acc. Rate",
		format: "percent",
		// Arrives from MySQL as a string, so convert before anyone sorts on it.
		get: (school) => {
			if (school.adm_rate === null) {
				return null;
			}
			return Number(school.adm_rate);
		},
	},
	{
		key: "sat_avg",
		label: "Avg. SAT",
		format: "number",
		get: (school) => school.sat_avg,
	},
	{
		key: "actcm50",
		label: "Mdn. ACT",
		format: "number",
		get: (school) => school.actcm50,
	},
	{
		key: "grad_rate",
		label: "Grad Rate",
		format: "percent",
		get: (school) => {
			if (school.grad_rate === null) {
				return null;
			}
			return Number(school.grad_rate);
		},
	},
	{
		key: "npt4",
		label: "Net Cost",
		format: "money",
		get: (school) => school.npt4,
	},
	{
		key: "md_earn_4yr",
		label: "Mdn. Salary",
		format: "money",
		get: (school) => school.md_earn_4yr,
	},
	{
		key: "earn_mdn_4yr",
		label: "Major Salary",
		format: "money",
		get: (school) => school.earn_mdn_4yr,
	},
	{
		key: "grad_debt_mdn",
		label: "Mdn. Debt",
		format: "money",
		get: (school) => school.grad_debt_mdn,
	},
	{
		key: "debt_all_stgp_eval_mdn",
		label: "Major Debt",
		format: "money",
		get: (school) => school.debt_all_stgp_eval_mdn,
	},
];

/** Everything except College name — you can't put text on a numeric axis. */
export const AXIS_MEASURES = MEASURES.filter((candidate) => candidate.format !== "text");

/**
 * Finds a measure by its key.
 *
 * Falls back to the first measure if the key isn't recognised, so a stale
 * value left over in the URL or in state can't crash the page.
 *
 * Note that this always returns the SAME object for the same key, because it
 * hands back entries from MEASURES rather than building new ones. ScatterPlot
 * relies on that when it lists a measure in a useMemo dependency array.
 */
export function measure(key: string): Measure {
	const found = MEASURES.find((candidate) => candidate.key === key);
	if (found === undefined) {
		return MEASURES[0];
	}
	return found;
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/**
 * Splits text into lowercase words, for the search box.
 *
 * The regular expression reads as "one or more characters that are neither a
 * letter nor a digit": \p{L} matches a letter in any alphabet, \p{N} matches a
 * digit, ^ inside the brackets negates them, and the `u` flag at the end is
 * what makes that \p{...} notation available at all. So it breaks on spaces,
 * hyphens, commas, ampersands and anything else that shows up in a name.
 *
 *   "Penn State - Erie, The Behrend College"
 *     → ["penn", "state", "erie", "the", "behrend", "college"]
 *
 * It also handles the punctuation our short names introduce, so "Univ." and
 * "St." break down to "univ" and "st" rather than keeping their full stops.
 */
export function tokenize(text: string): string[] {
	const pieces = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
	// Splitting can leave empty strings behind — a name ending in punctuation
	// produces one at the end — so drop anything with no characters in it.
	return pieces.filter((piece) => piece.length > 0);
}

/**
 * True if every word the user typed starts some word in the college name.
 * "penn eri" matches "Pennsylvania State University - Erie".
 *
 * The words come from BOTH names a college has — the official one and our
 * short one — so "massachusetts" and "mit" both find MIT, whichever of the two
 * happens to be the one on screen.
 *
 * An empty search matches everything: with no terms, the loop never runs and
 * never finds a reason to say no.
 */
export function matchesSearch(nameWords: string[], searchTerms: string[]): boolean {
	for (const term of searchTerms) {
		const someWordStartsWithTerm = nameWords.some((word) => word.startsWith(term));
		if (!someWordStartsWithTerm) {
			return false;
		}
	}
	return true;
}
