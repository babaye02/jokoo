"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type LegalDoc = {
  slug: string;
  title: string;
  content: string;
  version: number;
  effective_date: string;
};

async function fetchDocFromBrowser(slug: string): Promise<LegalDoc | null> {
  // Try authenticated endpoint (returns `content`) first, then fall back to
  // the public endpoint (returns `content_md`). Both go through the Vercel
  // same-origin rewrite `/api/*` which we know reliably reaches the backend.
  const candidates: Array<{ url: string; key: "content" | "content_md" }> = [
    { url: `/api/legal/documents/${slug}`, key: "content" },
    { url: `/api/public/legal/${slug}`, key: "content_md" },
  ];
  for (const { url, key } of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!r.ok) continue;
      const raw = (await r.json()) as Record<string, unknown>;
      const content = String(raw[key] ?? "");
      if (!content) continue;
      return {
        slug: String(raw.slug ?? slug),
        title: String(raw.title ?? ""),
        content,
        version: Number(raw.version ?? 1),
        effective_date: String(raw.effective_date ?? ""),
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function LegalDocClientFallback({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [status, setStatus] = useState<"loading" | "not_found" | "loaded">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchDocFromBrowser(slug).then((d) => {
      if (cancelled) return;
      if (d) {
        setDoc(d);
        setStatus("loaded");
      } else {
        setStatus("not_found");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "loading") {
    return (
      <div className="not-prose text-center py-16">
        <div className="inline-block w-8 h-8 border-4 border-turquoise/20 border-t-turquoise rounded-full animate-spin mb-4" />
        <div className="text-gray-500">Chargement du document…</div>
      </div>
    );
  }

  if (status === "not_found" || !doc) {
    return (
      <div className="not-prose text-center py-16">
        <div className="text-5xl mb-3">📄</div>
        <div className="font-medium text-gray-700">
          Ce document n'est momentanément pas disponible.
        </div>
        <div className="text-sm mt-2 text-gray-500">
          Merci de réessayer dans quelques instants ou contactez{" "}
          <a href="mailto:legal@jokooservices.com" className="text-turquoise font-bold">
            legal@jokooservices.com
          </a>
          .
        </div>
      </div>
    );
  }

  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>;
}
