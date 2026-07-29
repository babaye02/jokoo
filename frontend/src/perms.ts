// Helpers permissions côté frontend.
import type { User, StaffRole } from "@/src/api";

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: "Super Administrateur",
  admin: "Administrateur",
  marketing: "Équipe Marketing",
  support: "Support Client",
  operator: "Opérateur",
  tech: "Équipe Technique",
};

export const ROLE_ICON: Record<StaffRole, any> = {
  super_admin: "shield",
  admin: "briefcase",
  marketing: "megaphone",
  support: "help-buoy",
  operator: "person-add",
  tech: "code-slash",
};

const ROLE_PERMS: Record<StaffRole, string[]> = {
  super_admin: ["*"],
  admin: ["users:read","users:write","bookings:read","bookings:write","categories:write","providers:read","providers:write","providers:validate","ads:read","stats:read"],
  marketing: ["ads:read","ads:write","notifications:send","stats:marketing"],
  support: ["users:read","bookings:read","reports:handle","passwords:reset"],
  operator: ["operator:create_account","users:read","users:write","providers:write","providers:validate","docs:upload"],
  tech: ["tech:logs","stats:tech"],
};

export function userPerms(u: User | null | undefined): Set<string> {
  if (!u) return new Set();
  const perms = new Set<string>(u.permissions || []);
  if (u.staff_role) for (const p of (ROLE_PERMS[u.staff_role] || [])) perms.add(p);
  if (u.is_admin && u.staff_role !== "super_admin") perms.add("*");
  return perms;
}

export function hasPerm(u: User | null | undefined, key: string): boolean {
  const p = userPerms(u);
  return p.has("*") || p.has(key);
}

export function isStaff(u: User | null | undefined): boolean {
  return !!(u?.staff_role || u?.is_admin);
}

export function isSuperAdmin(u: User | null | undefined): boolean {
  return u?.staff_role === "super_admin" || (!!u?.is_admin && !u?.staff_role);
}
