import { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

type MajorRow = RowDataPacket & {
  cip_code: string;
  cip_desc: string;
};

export default async function Home() {
  const [majors] = await pool.query<MajorRow[]>(
    `SELECT cip_code, cip_desc
       FROM majors
      ORDER BY cip_desc
      LIMIT 20`,
  );

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>CompilEd</h1>
      <p>{majors.length} majors</p>
      <ul>
        {majors.map((m) => (
          <li key={m.cip_code}>
            {m.cip_code} — {m.cip_desc}
          </li>
        ))}
      </ul>
    </main>
  );
}
