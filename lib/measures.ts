export type School = {
  unitid: number; // the federal ID for this institution, used as the React key
  instnm: string; // the official institution name
  short_name: string | null; // our shortened name, or null if never written
  city: string | null;
  stabbr: string; // two-letter state code
  control: number; // 1 public, 2 private non-profit, 3 for-profit

  ugds: number | null; // undergraduates enrolled
  stufacr: number | null; // students per faculty member

  // adm_rate and grad_rate are DECIMAL columns in MySQL, and the driver hands
  // those back as STRINGS rather than numbers so that no precision is lost in
  // the conversion.
  adm_rate: string | null;
  grad_rate: string | null;

  sat_avg: number | null;
  actcm50: number | null;
  npt4: number | null; // average net price

  md_earn_4yr: number | null; // median salary across all majors at this college
  earn_mdn_4yr: number | null; // median salary for the selected major
  grad_debt_mdn: number | null; // median debt across all majors
  debt_all_stgp_eval_mdn: number | null; // median debt for the selected major
};

/** Shown in place of a value the data doesn't have. */
export const DASH = "—";

export type Major = {
  cip_code: string; // the federal CIP code, e.g. "1107"
  cip_desc: string; // its name, e.g. "Computer Science"
};

/** Official names at or above this length use short_name when available. */
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

/** Returns both names so either can match a search. */
export function searchableText(school: School): string {
  if (school.short_name === null) {
    return school.instnm;
  }
  return `${school.instnm} ${school.short_name}`;
}

export const CONTROL: Record<number, string> = {
  1: "Public",
  2: "Private",
  3: "For-profit",
};

/** The three codes, in the order the filter checkboxes should list them. */
export const TYPE_CODES = [1, 2, 3];

export type MeasureFormat = "text" | "number" | "money" | "percent";

/** Full formatting for table cells and chart tooltips. */
export function formatValue(
  value: number | null,
  format: MeasureFormat,
): string {
  if (value === null) {
    return DASH;
  }
  if (format === "money") {
    return "$" + value.toLocaleString("en-US");
  }
  if (format === "percent") {
    // Percentages are stored as fractions
    return (value * 100).toFixed(1) + "%";
  }
  return value.toLocaleString("en-US");
}

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
export function formatTick(
  value: number,
  format: MeasureFormat,
  step: number,
): string {
  if (format === "percent") {
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

/**
 * Metadata and value accessor for a sortable/plottable college measure.
 * Shared definitions keep tables, charts, and controls consistent.
 */
export type Measure = {
  key: string; // usually the database column name
  label: string; // what the user sees in a menu
  format: MeasureFormat; // how to print its values
  get: (school: School) => number | string | null;
};

export const MEASURES: Measure[] = [
  {
    key: "instnm",
    label: "Name",
    format: "text",
    // Sort by the displayed name so the order matches what the user sees.
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
export const AXIS_MEASURES = MEASURES.filter(
  (candidate) => candidate.format !== "text",
);

/** Returns the matching measure, falling back to the first for invalid keys. */
export function measure(key: string): Measure {
  const found = MEASURES.find((candidate) => candidate.key === key);
  if (found === undefined) {
    return MEASURES[0];
  }
  return found;
}

/**
 * Splits text into lowercase alphanumeric words for prefix search.
 * Unicode letters and numbers are preserved; punctuation acts as a separator.
 */
export function tokenize(text: string): string[] {
  const pieces = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return pieces.filter((piece) => piece.length > 0);
}

/**
 * Matches when every search term prefixes at least one name word.
 * Example: "penn eri" matches "Pennsylvania State University - Erie".
 */
export function matchesSearch(
  nameWords: string[],
  searchTerms: string[],
): boolean {
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
