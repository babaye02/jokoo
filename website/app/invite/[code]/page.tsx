import { redirect } from "next/navigation";

export default async function InviteAlias({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/i/${encodeURIComponent(code)}`);
}
