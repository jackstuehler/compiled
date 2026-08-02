import MajorPicker from "./major-picker";
import CollegeTable from "./college-table";
import { DEFAULT_MAJOR, loadMajorData } from "@/lib/queries";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ major?: string }>;
}) {
  // searchParams arrives as a promise, not an object: Next can begin rendering
  // the page before it has finished working out the request's query string.
  const { major } = await searchParams;
  const selected = major ?? DEFAULT_MAJOR;

  const { majors, schools, majorName } = await loadMajorData(selected);

  return (
    <>
      <MajorPicker majors={majors} selected={selected} />
      <h2>{majorName}</h2>
      <CollegeTable rows={schools} />
    </>
  );
}
