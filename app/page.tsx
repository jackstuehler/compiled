import { DEFAULT_MAJOR, loadMajorData } from "@/lib/queries";
import Rankings from "./rankings/rankings";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ major?: string }>;
}) {
  const { major } = await searchParams;
  const selected = major ?? DEFAULT_MAJOR;
  const { majors, schools } = await loadMajorData(selected);
  return <Rankings key={selected} rows={schools} majors={majors} selected={selected} />;
}
