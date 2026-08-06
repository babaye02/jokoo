import type { MetadataRoute } from "next";
import { POSTS } from "./lib/blog";
import { LEGAL_DOCS_BUNDLE } from "./legal/content";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jokooservices.com";

export default function sitemap(): MetadataRoute.Sitemap {
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

  const legalRoutes: MetadataRoute.Sitemap = LEGAL_DOCS_BUNDLE.filter((d) => d.published).map((d) => ({
    url: `${SITE}/legal/${d.slug}`,
    lastModified: d.updated_at || now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes, ...legalRoutes];
}
