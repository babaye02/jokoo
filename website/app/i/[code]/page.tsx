import { Metadata } from "next";
import InviteLanding from "./InviteLanding";

interface InviteData {
  valid: boolean;
  code?: string;
  slug?: string;
  tier?: string;
  badge?: string;
  inviter_name?: string;
  inviter_avatar?: string;
  links?: {
    web?: string;
    web_slug?: string;
    app?: string;
    share_text?: string;
  };
}

async function fetchInvite(code: string): Promise<InviteData | null> {
  const backend =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://jokoo-mobile-dev.emergent.host";
  try {
    const res = await fetch(`${backend}/api/public/invite/${encodeURIComponent(code)}`, {
      // Léger cache SSR de 5 min (économise DB, invalide vite si code désactivé)
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as InviteData;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const { code } = await params;
  const data = await fetchInvite(code);
  const inviter = data?.inviter_name || "Un partenaire Jokoo";
  const title = data?.valid
    ? `${inviter} vous invite sur Jokoo`
    : "Rejoignez Jokoo";
  const description = data?.valid
    ? `Utilisez le code ${data.code} pour bénéficier de la marketplace de confiance au Sénégal.`
    : "Jokoo — la marketplace des services de confiance au Sénégal.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: data?.inviter_avatar ? [{ url: data.inviter_avatar }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await fetchInvite(code);
  return <InviteLanding code={code} data={data} />;
}
