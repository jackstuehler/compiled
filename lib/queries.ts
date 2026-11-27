import { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import type { Major, School } from "@/lib/measures";

// mysql2 query results must extend RowDataPacket.
type MajorRow = RowDataPacket & Major;
type SchoolRow = RowDataPacket & School;

/** Computer Science — used when the URL doesn't name a major. */
export const DEFAULT_MAJOR = "1107";

/** Loads the major list and schools for the selected major. */
export async function loadMajorData(cipCode: string) {
  const [majors, schools] = await Promise.all([
    loadMajors(),
    loadSchools(cipCode),
  ]);

  return { majors, schools };
}

/** Every major with at least five colleges reporting salary data for it. */
async function loadMajors(): Promise<Major[]> {
  const [rows] = await pool.query<MajorRow[]>(
    `SELECT m.cip_code, m.cip_desc
       FROM majors_v2 m
       JOIN fos_bachelors_v2 f ON f.cip_code = m.cip_code
       JOIN institutions_v2 i ON i.unitid = f.unitid
      WHERE f.earn_mdn_4yr IS NOT NULL
      GROUP BY m.cip_code, m.cip_desc
     HAVING COUNT(*) >= 5
      ORDER BY m.cip_desc`,
  );

  // Copy each row into a plain object — see the note in loadSchools below.
  return rows.map((row) => ({
    cip_code: row.cip_code,
    cip_desc: row.cip_desc,
  }));
}

/** Every college offering the given major, best-paid first. */
async function loadSchools(cipCode: string): Promise<School[]> {
  const [rows] = await pool.query<SchoolRow[]>(
    `SELECT i.unitid, i.instnm, i.short_name,
            i.city, i.stabbr, i.control, i.ugds, i.stufacr,
            i.adm_rate, i.sat_avg, i.actcm50, i.grad_rate, i.npt4,
            i.md_earn_4yr, f.earn_mdn_4yr,
            i.grad_debt_mdn, f.debt_all_stgp_eval_mdn,
            i.satvr25, i.satvr50, i.satvr75,
            i.satmt25, i.satmt50, i.satmt75,
            i.actcm25, i.actcm75,
            i.locale, i.retention_rate, i.repay_3yr,
            i.npt4_0_30, i.npt4_30_48, i.npt4_48_75,
            i.npt4_75_110, i.npt4_110_plus,
            f.debt_all_stgp_any_mdn, f.debt_all_pp_eval_mdn,
            f.debt_all_pp_any_mdn, f.debt_all_stgp_eval_mdn10yrpay,
            f.earn_count_wne_4yr, f.major_completions, f.earn_mdn_4yr_nat
       FROM fos_bachelors_v2 f
       JOIN institutions_v2 i ON i.unitid = f.unitid
      WHERE f.cip_code = ? AND f.earn_mdn_4yr IS NOT NULL
      ORDER BY f.earn_mdn_4yr DESC`,
    // Parameterize the CIP code instead of interpolating it into SQL.
    [cipCode],
  );

  // Convert mysql2 rows to plain objects before passing them to client
  // components.
  return rows.map((row) => ({ ...row }));
}
