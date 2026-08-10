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
    <>
      <ScatterPlot rows={schools} majors={majors} selected={selected} />
    </>
  );
}
