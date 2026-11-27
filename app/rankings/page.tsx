import { permanentRedirect } from "next/navigation";

export default async function RankingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ major?: string }>;
}) {
  const { major } = await searchParams;
  permanentRedirect(major ? `/?major=${encodeURIComponent(major)}` : "/");
}
