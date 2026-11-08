import { Detail } from "@/components/remote/detail";

export default async function DetailPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  return <Detail view={view} />;
}
