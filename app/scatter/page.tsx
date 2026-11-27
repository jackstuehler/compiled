import MajorPicker from "../major-picker";
import ui from "../ui.module.css";
import styles from "../page.module.css";
import ScatterPlot from "../scatter-plot";
import { DEFAULT_MAJOR, loadMajorData } from "@/lib/queries";

export default async function Scatter({
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
        <h1>Scatterplot</h1>
      </section>

      <ScatterPlot rows={schools} majorPicker={
        <label className={ui.field}>
          Major
          <MajorPicker majors={majors} selected={selected} className={ui.input} />
        </label>
      } />
    </div>
  );
}
