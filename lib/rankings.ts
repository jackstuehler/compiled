import { collegeName, formatValue, type MeasureFormat, type School } from "./measures";

export const categories = {
  affordability: "Affordability",
  debt: "Student debt",
  earnings: "Earnings",
  success: "Student success",
  selectivity: "Selectivity",
  campus: "Campus & learning environment",
};

export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as Category[];
export const prices = {
  npt4: "Overall average",
  npt4_0_30: "$0–$30,000",
  npt4_30_48: "$30,001–$48,000",
  npt4_48_75: "$48,001–$75,000",
  npt4_75_110: "$75,001–$110,000",
  npt4_110_plus: "Above $110,000",
};
export const settings = { 1: "City", 2: "Suburb", 3: "Town", 4: "Rural" };
export const sizes = { small: "Small (under 5,000)", medium: "Medium (5,000–14,999)", large: "Large (15,000+)" };
export type Preferences = {
  weights: Record<Category, number>;
  price: keyof typeof prices;
  selectivity: "" | "more" | "less";
  size: "" | keyof typeof sizes;
  settings: number[];
  program: "" | "smaller" | "larger";
  lowerRatio: boolean;
};

export const initialPreferences: Preferences = {
  weights: { affordability: 0, debt: 0, earnings: 0, success: 0, selectivity: 0, campus: 0 },
  price: "npt4",
  selectivity: "",
  size: "",
  settings: [],
  program: "",
  lowerRatio: false,
};

export function rankingIssue(p: Preferences) {
  if (!categoryKeys.some((key) => p.weights[key])) return "Give at least one category an importance above zero.";
  if (p.weights.selectivity && !p.selectivity) return "Choose a selectivity preference.";
  if (p.weights.campus && !p.size && !p.settings.length && !p.program && !p.lowerRatio) {
    return "Choose at least one campus preference.";
  }
  return null;
}

type Metric = ReturnType<typeof buildMetric>;

function buildMetric(
  rows: School[],
  field: keyof School,
  label: string,
  format: MeasureFormat,
  scoreMatch?: (value: number) => number,
) {
  const values = new Map<number, number>();
  for (const school of rows) {
    const raw = school[field];
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) values.set(school.unitid, value);
  }
  const sorted = [...values.values()].sort((a, b) => a - b);
  const percentiles = new Map<number, number>();
  for (let first = 0; first < sorted.length;) {
    let end = first + 1;
    while (sorted[end] === sorted[first]) end++;
    const midrank = (first + end - 1) / 2;
    percentiles.set(sorted[first], sorted.length === 1 ? 50 : 100 * midrank / (sorted.length - 1));
    first = end;
  }
  return (id: number) => {
    const value = values.get(id);
    return {
      label,
      value: value === undefined ? null : formatValue(value, format),
      score: value === undefined ? null : (scoreMatch ? scoreMatch(value) : percentiles.get(value)!),
    };
  };
}

function reverse(metric: Metric): Metric {
  return (id) => {
    const result = metric(id);
    return { ...result, score: result.score === null ? null : 100 - result.score };
  };
}

type Reading = ReturnType<Metric>;
type CategoryScore = { score: number | null; readings: Reading[]; missing: string[]; note?: string };

function combine(readings: Reading[], weights = readings.map(() => 1)): CategoryScore {
  const missing = readings.filter((item) => item.score === null).map((item) => item.label);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const total = readings.reduce((sum, item, index) => sum + (item.score ?? 0) * weights[index], 0);
  return { score: missing.length ? null : total / totalWeight, readings, missing };
}

export function rankSchools(rows: School[], p: Preferences) {
  if (rankingIssue(p)) return [];
  const active = categoryKeys.filter((key) => p.weights[key] > 0);
  const totalWeight = active.reduce((sum, key) => sum + p.weights[key], 0);
  const metric = (field: keyof School, label: string, format: MeasureFormat) =>
    buildMetric(rows, field, label, format);
  const priceLabel = p.price === "npt4" ? "Average annual net price" : `Annual net price · ${prices[p.price]}`;
  const price = reverse(metric(p.price, priceLabel, "money"));
  const debt = reverse(metric("debt_all_stgp_eval_mdn", "Median student debt for this major", "money"));
  const earnings = metric("earn_mdn_4yr", "Four-year major earnings", "money");
  const graduation = metric("grad_rate", "Graduation rate", "percent");
  const retention = metric("retention_rate", "First-year retention", "percent");
  const admission = metric("adm_rate", "Admission rate", "percent");
  const sat = metric("sat_avg", "Average SAT", "number");
  const act = metric("actcm50", "Median ACT", "number");
  const moreSelective = p.selectivity === "more";
  const admissionScore = moreSelective ? reverse(admission) : admission;
  const testMetrics = moreSelective ? [sat, act] : [reverse(sat), reverse(act)];

  const campus: Metric[] = [];
  if (p.size) {
    campus.push(buildMetric(rows, "ugds", "Undergraduate enrollment", "number", (value) => {
      const size = value < 5000 ? "small" : value < 15000 ? "medium" : "large";
      return size === p.size ? 100 : 0;
    }));
  }
  if (p.settings.length) {
    const setting = buildMetric(rows, "locale", "Campus setting", "number", (value) =>
      p.settings.includes(Math.floor(value / 10)) ? 100 : 0);
    campus.push((id) => {
      const reading = setting(id);
      const label = settings[Math.floor(Number(reading.value) / 10) as keyof typeof settings];
      return { ...reading, value: label ?? null, score: label ? reading.score : null };
    });
  }
  if (p.program) {
    const program = metric("major_completions", "Major completions", "number");
    campus.push(p.program === "smaller" ? reverse(program) : program);
  }
  if (p.lowerRatio) campus.push(reverse(metric("stufacr", "Students per faculty member", "number")));

  function selectivity(id: number): CategoryScore {
    const rate = admissionScore(id);
    const tests = testMetrics.map((test) => test(id)).filter((reading) => reading.score !== null);
    if (!tests.length) return { ...combine([rate]), note: "Admission rate only. SAT and ACT unavailable." };
    const score = combine([rate, ...tests], [0.5, ...tests.map(() => 0.5 / tests.length)]);
    return { ...score, note: "50% admission rate and 50% reported test scores." };
  }

  const evaluate: Record<Category, (id: number) => CategoryScore> = {
    affordability: (id) => combine([price(id)]),
    debt: (id) => combine([debt(id)]),
    earnings: (id) => combine([earnings(id)]),
    success: (id) => combine([graduation(id), retention(id)], [2, 1]),
    selectivity,
    campus: (id) => combine(campus.map((get) => get(id))),
  };

  return rows.map((school) => {
    const breakdown = active.map((key) => ({
      key,
      weight: p.weights[key] / totalWeight,
      ...evaluate[key](school.unitid),
    }));
    const missing = breakdown.flatMap((category) => category.missing);
    const score = missing.length ? null : breakdown.reduce(
      (sum, category) => sum + (category.score ?? 0) * category.weight, 0,
    );
    return { school, breakdown, score, missing };
  }).sort((a, b) =>
    (b.score ?? -1) - (a.score ?? -1)
    || collegeName(a.school).localeCompare(collegeName(b.school))
    || a.school.unitid - b.school.unitid,
  );
}
