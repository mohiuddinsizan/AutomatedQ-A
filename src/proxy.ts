import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";
import { PORTALS, type Portal } from "@/lib/roles";

/**
 * Fast first-line check that runs before every page.
 * It only reads the cookie (no database). The full check happens
 * in requirePortal() inside each portal's layout.
 */
function portalFor(path: string): Portal | null {
  if (path === "/teacher/login" || path === "/admin/login") return null;
  if (path.startsWith("/student")) return "student";
  if (path.startsWith("/teacher")) return "teacher";
  if (path.startsWith("/admin")) return "admin";
  return null;
}

export default async function proxy(req: NextRequest) {
  const portal = portalFor(req.nextUrl.pathname);
  if (!portal) return NextResponse.next();

  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);
  const cfg = PORTALS[portal];

  if (!session || !cfg.roles.includes(session.role)) {
    return NextResponse.redirect(new URL(cfg.login, req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
