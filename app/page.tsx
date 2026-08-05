import MajorPicker from "./major-picker";
import CollegeTable from "./college-table";
import { DEFAULT_MAJOR, loadMajorData } from "@/lib/queries";
import styles from "./page.module.css";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ major?: string }>;
}) {
  const { major } = await searchParams;
  const selected = major ?? DEFAULT_MAJOR;

  const { majors, schools } = await loadMajorData(selected);

  return (
    <div className={styles.content}>
      <section className={styles.majorControl}>
        <label className={styles.majorLabel}>
          Major
          <MajorPicker majors={majors} selected={selected} />
        </label>
      </section>

      <CollegeTable rows={schools} />
    </div>
  );
}
