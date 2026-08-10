import { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import type { Major, School } from "@/lib/measures";

// The mysql2 driver requires the type it returns to extend RowDataPacket.
// These two lines combine our own row shapes with what the driver expects.
type MajorRow = RowDataPacket & Major;
type SchoolRow = RowDataPacket & School;

/** Computer Science — used when the URL doesn't name a major. */
export const DEFAULT_MAJOR = "1107";

/**
 * Everything either screen needs, for one major.
 *
 * This lives here rather than in the page files because both pages need
 * exactly the same data. A query copied into two places is a query that will
 * eventually get fixed in only one of them.
 */
export async function loadMajorData(cipCode: string) {
  // The two queries don't depend on each other, so start them both and then
  // wait for both. Run one after the other and the page waits for the sum of
  // the two; run them together and it waits for the slower one.
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
       FROM majors m
       JOIN fos_bachelors f ON f.cip_code = m.cip_code
       JOIN institutions i ON i.unitid = f.unitid
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
            i.grad_debt_mdn, f.debt_all_stgp_eval_mdn
       FROM fos_bachelors f
       JOIN institutions i ON i.unitid = f.unitid
      WHERE f.cip_code = ? AND f.earn_mdn_4yr IS NOT NULL
      ORDER BY f.earn_mdn_4yr DESC`,
    // The "?" above is a placeholder. Handing the value over separately means
    // MySQL treats it strictly as data, so a crafted major code can never be
    // executed as SQL. Never build a query by gluing strings together.
    [cipCode],
  );

  // Rows from the driver carry hidden extras beyond the fields we asked for.
  // Spreading each into a fresh object produces a plain, ordinary object —
  // which is what Next requires for anything a server component hands to a
  // client component, because it has to be converted to text to reach the
  // browser and only plain data survives that trip.
  return rows.map((row) => ({ ...row }));
}
