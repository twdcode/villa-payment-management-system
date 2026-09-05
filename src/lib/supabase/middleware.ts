import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages reachable without a session. Everything else requires one. */
const PUBLIC_ROUTES = ["/login", "/auth/reset-password", "/auth/callback"];

/** Where a signed-in user with a temporary password is forced to go. */
const CHANGE_PASSWORD_ROUTE = "/auth/change-password";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Validates the JWT signature against Supabase's published keys. `getSession()` reads
  // storage without re-validating, so it must never be used to protect anything.
  // Do not put code between createServerClient and this call — it refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back here after signing in, rather than always landing on the dashboard.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (claims) {
    // A temporary password gets you exactly one destination until it is changed.
    const metadata = (claims.app_metadata ?? {}) as { must_change_password?: boolean };
    const mustChange = metadata.must_change_password === true;

    if (mustChange && pathname !== CHANGE_PASSWORD_ROUTE && !pathname.startsWith("/auth/")) {
      const url = request.nextUrl.clone();
      url.pathname = CHANGE_PASSWORD_ROUTE;
      return NextResponse.redirect(url);
    }

    // Already signed in — no reason to see the login page again.
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = mustChange ? CHANGE_PASSWORD_ROUTE : "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Return this exact response object. Building a new one drops the refreshed auth
  // cookies and the user is signed out at random.
  return response;
}
