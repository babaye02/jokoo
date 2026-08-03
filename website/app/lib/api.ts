export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://jokooservices.com/api";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { ...init, next: { revalidate: 60 } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
