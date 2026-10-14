import type { Role } from "@/db/schema";

/** The three portals and which roles may enter each one. */
export const PORTALS = {
  student: { home: "/student", login: "/login", roles: ["student"] as Role[] },
  teacher: { home: "/teacher", login: "/teacher/login", roles: ["teacher"] as Role[] },
  admin: { home: "/admin", login: "/admin/login", roles: ["admin", "super_admin"] as Role[] },
} as const;

export type Portal = keyof typeof PORTALS;

export function portalForRole(role: Role): Portal {
  if (role === "student") return "student";
  if (role === "teacher") return "teacher";
  return "admin";
}

export function homeForRole(role: Role) {
  return PORTALS[portalForRole(role)].home;
}
