import type { MetadataRoute } from "next";
import { POSTS } from "./lib/blog";
import { api } from "./lib/api-server";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jokooservices.com";

type LegalDocMeta = { slug: string; updated_at: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/prestataires`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/apropos`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/legal`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: p.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  let legalRoutes: MetadataRoute.Sitemap = [];
  try {
    const docs = await api<LegalDocMeta[]>("/legal/documents");
    legalRoutes = docs.map((d) => ({
      url: `${SITE}/legal/${d.slug}`,
      lastModified: d.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {}

  return [...staticRoutes, ...blogRoutes, ...legalRoutes];
}
