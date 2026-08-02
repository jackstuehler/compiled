"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

export type School = {
  unitid: number;
  instnm: string;
  city: string | null;
  stabbr: string;
  control: number;
  ugds: number | null;
  stufacr: number | null;
  adm_rate: string | null;
  sat_avg: number | null;
  actcm50: number | null;
  grad_rate: string | null;
  npt4: number | null;
  md_earn_4yr: number | null;
  earn_mdn_4yr: number | null;
  grad_debt_mdn: number | null;
  debt_all_stgp_eval_mdn: number | null;
};

const DASH = "—";

const CONTROL: Record<number, string> = {
  1: "Public",
  2: "Private",
  3: "For-profit",
};

const TYPE_KEYS = Object.keys(CONTROL);

function money(v: number | null) {
  return v == null ? DASH : "$" + v.toLocaleString("en-US");
}
function num(v: number | null) {
  return v == null ? DASH : v.toLocaleString("en-US");
}
function pct(v: string | null) {
  return v == null ? DASH : (Number(v) * 100).toFixed(1) + "%";
}
function place(city: string | null, stabbr: string) {
  return city ? `${city}, ${stabbr}` : stabbr;
}
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

type SortOption = {
  key: string;
  label: string;
  get: (r: School) => number | string | null;
};

const SORT_OPTIONS: SortOption[] = [
  { key: "instnm", label: "College name", get: (r) => r.instnm },
  { key: "ugds", label: "Undergrads", get: (r) => r.ugds },
  { key: "stufacr", label: "Student:faculty", get: (r) => r.stufacr },
  {
    key: "adm_rate",
    label: "Admit rate",
    get: (r) => (r.adm_rate == null ? null : Number(r.adm_rate)),
  },
  { key: "sat_avg", label: "SAT average", get: (r) => r.sat_avg },
  { key: "actcm50", label: "ACT median", get: (r) => r.actcm50 },
  {
    key: "grad_rate",
    label: "Graduation rate",
    get: (r) => (r.grad_rate == null ? null : Number(r.grad_rate)),
  },
  { key: "npt4", label: "Average cost", get: (r) => r.npt4 },
  {
    key: "md_earn_4yr",
    label: "Salary (all majors)",
    get: (r) => r.md_earn_4yr,
  },
  {
    key: "earn_mdn_4yr",
    label: "Salary (this major)",
    get: (r) => r.earn_mdn_4yr,
  },
  {
    key: "grad_debt_mdn",
    label: "Debt (all majors)",
    get: (r) => r.grad_debt_mdn,
  },
  {
    key: "debt_all_stgp_eval_mdn",
    label: "Debt (this major)",
    get: (r) => r.debt_all_stgp_eval_mdn,
  },
];

const th: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: "var(--background)",
  boxShadow: "inset 0 -2px 0 #999",
  zIndex: 2,
};
const thNum: CSSProperties = { ...th, textAlign: "right" };
const thFirst: CSSProperties = {
  ...th,
  left: 0,
  zIndex: 3,
  boxShadow: "inset -2px 0 0 #8886, inset 0 -2px 0 #999",
};
const td: CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #8883",
  whiteSpace: "nowrap",
};
const tdNum: CSSProperties = { ...td, textAlign: "right" };
const tdFirst: CSSProperties = {
  ...td,
  position: "sticky",
  left: 0,
  background: "var(--background)",
  zIndex: 1,
  boxShadow: "inset -2px 0 0 #8886",
};
const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
};
const inputStyle: CSSProperties = { padding: 6, fontSize: 15 };
const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: 15,
  cursor: "pointer",
  background: "var(--background)",
  color: "inherit",
  border: "1px solid #8886",
  borderRadius: 4,
};
const dialogStyle: CSSProperties = {
  border: "1px solid #8886",
  borderRadius: 8,
  padding: 20,
  minWidth: 260,
  background: "var(--background)",
  color: "inherit",
};

export default function CollegeTable({ rows }: { rows: School[] }) {
  const [sortKey, setSortKey] = useState("earn_mdn_4yr");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [types, setTypes] = useState<string[]>(TYPE_KEYS);

  const dialogRef = useRef<HTMLDialogElement>(null);

  function toggleType(v: string) {
    setTypes((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  const activeFilters =
    (state !== "" ? 1 : 0) + (types.length !== TYPE_KEYS.length ? 1 : 0);

  const indexed = useMemo(
    () => rows.map((r) => ({ row: r, words: tokenize(r.instnm) })),
    [rows],
  );

  const states = useMemo(
    () => Array.from(new Set(rows.map((r) => r.stabbr))).sort(),
    [rows],
  );

  const view = useMemo(() => {
    const opt = SORT_OPTIONS.find((o) => o.key === sortKey) ?? SORT_OPTIONS[0];
    const terms = tokenize(query);

    const filtered = indexed
      .filter(({ row, words }) => {
        if (state !== "" && row.stabbr !== state) return false;
        if (!types.includes(String(row.control))) return false;
        return terms.every((t) => words.some((w) => w.startsWith(t)));
      })
      .map(({ row }) => row);

    const dir = order === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const av = opt.get(a);
      const bv = opt.get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  }, [indexed, sortKey, order, query, state, types]);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-end",
          flexWrap: "wrap",
          margin: "16px 0",
        }}
      >
        <label style={fieldStyle}>
          Search for college
          <input
            style={inputStyle}
            type="search"
            value={query}
            placeholder="e.g. Penn Eri"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <button
          type="button"
          style={buttonStyle}
          onClick={() => dialogRef.current?.showModal()}
        >
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={fieldStyle}>
            Sort by
            <select
              style={inputStyle}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            style={{ ...buttonStyle, lineHeight: 1.4, minWidth: 40 }}
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            aria-label={
              order === "asc" ? "Sorted ascending" : "Sorted descending"
            }
            title={
              order === "asc"
                ? "Ascending — click for descending"
                : "Descending — click for ascending"
            }
          >
            {order === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      <dialog ref={dialogRef} style={dialogStyle}>
        <form
          method="dialog"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>Filters</h3>

          <label style={fieldStyle}>
            State
            <select
              style={inputStyle}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, padding: 0, marginBottom: 6 }}>
              Type
            </legend>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 15,
              }}
            >
              {TYPE_KEYS.map((k) => (
                <label
                  key={k}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={types.includes(k)}
                    onChange={() => toggleType(k)}
                  />
                  {CONTROL[Number(k)]}
                </label>
              ))}
            </div>
          </fieldset>

          <button style={{ ...buttonStyle, alignSelf: "flex-end" }}>
            Done
          </button>
        </form>
      </dialog>

      <p>
        {view.length.toLocaleString()} college{view.length === 1 ? "" : "s"}
      </p>

      <div
        style={{
          overflow: "auto",
          maxHeight: "70vh",
          border: "1px solid #8883",
        }}
      >
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={thFirst}>Rank / College</th>
              <th style={th}>Location</th>
              <th style={th}>Type</th>
              <th style={thNum}>Undergrads</th>
              <th style={thNum}>Stu:Fac</th>
              <th style={thNum}>Admit rate</th>
              <th style={thNum}>SAT avg</th>
              <th style={thNum}>ACT med</th>
              <th style={thNum}>Grad rate</th>
              <th style={thNum}>Avg cost</th>
              <th style={thNum}>Salary (all)</th>
              <th style={thNum}>Salary (major)</th>
              <th style={thNum}>Debt (all)</th>
              <th style={thNum}>Debt (major)</th>
            </tr>
          </thead>
          <tbody>
            {view.map((s, i) => (
              <tr key={s.unitid}>
                <td style={tdFirst}>
                  <span style={{ opacity: 0.5, marginRight: 8 }}>{i + 1}</span>
                  {s.instnm}
                </td>
                <td style={td}>{place(s.city, s.stabbr)}</td>
                <td style={td}>{CONTROL[s.control] ?? DASH}</td>
                <td style={tdNum}>{num(s.ugds)}</td>
                <td style={tdNum}>{num(s.stufacr)}</td>
                <td style={tdNum}>{pct(s.adm_rate)}</td>
                <td style={tdNum}>{num(s.sat_avg)}</td>
                <td style={tdNum}>{num(s.actcm50)}</td>
                <td style={tdNum}>{pct(s.grad_rate)}</td>
                <td style={tdNum}>{money(s.npt4)}</td>
                <td style={tdNum}>{money(s.md_earn_4yr)}</td>
                <td style={tdNum}>{money(s.earn_mdn_4yr)}</td>
                <td style={tdNum}>{money(s.grad_debt_mdn)}</td>
                <td style={tdNum}>{money(s.debt_all_stgp_eval_mdn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
