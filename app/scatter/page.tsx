import { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import MajorPicker, { Major } from "../major-picker";

type MajorRow = RowDataPacket & Major;

const DEFAULT_MAJOR = "1107"; // Computer Science

export default async function Scatter({
  searchParams,
}: {
  searchParams: Promise<{ major?: string }>;
}) {
  const { major } = await searchParams;
  const selected = major ?? DEFAULT_MAJOR;

  const [majorRows] = await pool.query<MajorRow[]>(
    `SELECT m.cip_code, m.cip_desc
       FROM majors m
       JOIN fos_bachelors f ON f.cip_code = m.cip_code
       JOIN institutions i ON i.unitid = f.unitid
      WHERE f.earn_mdn_4yr IS NOT NULL
      GROUP BY m.cip_code, m.cip_desc
     HAVING COUNT(*) >= 5
      ORDER BY m.cip_desc`,
  );

  const majors: Major[] = majorRows.map(({ cip_code, cip_desc }) => ({
    cip_code,
    cip_desc,
  }));

  const current = majors.find((m) => m.cip_code === selected);

  return (
    <>
      <MajorPicker majors={majors} selected={selected} />
      <h2>{current?.cip_desc ?? "Unknown major"}</h2>
      <p style={{ opacity: 0.6, fontSize: 15 }}>
        The scatterplot will go here.
      </p>
    </>
  );
}
