import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Staging auth gate — basic auth + shared-secret bypass.
 * Only active when STAGING_BASIC_AUTH is set (Vercel staging only, not local dev). */
function stagingGate(request: NextRequest): NextResponse | null {
  const basicAuth = process.env.STAGING_BASIC_AUTH;
  const sharedSecret = process.env.STAGING_SHARED_SECRET;
  if (!basicAuth && !sharedSecret) return null;

  const path = request.nextUrl.pathname;
  if (path === "/api/health") return null;
  // Public marketing landing page — reviewers can view it without credentials.
  // Login/signup and app routes stay gated.
  if (path === "/" || path === "/landing") return null;

  if (sharedSecret && request.headers.get("x-staging-auth") === sharedSecret) return null;

  if (basicAuth) {
    const auth = request.headers.get("authorization") ?? "";
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded && atob(encoded) === basicAuth) return null;
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Staging"' },
    });
  }

  // sharedSecret set but not matched — block without basic auth prompt
  return new NextResponse("Unauthorized", { status: 401 });
}

/** Session refresh + auth gating. Public: landing, login, auth callback,
 * health. Everything else requires a session. */
export default async function middleware(request: NextRequest) {
  const gate = stagingGate(request);
  if (gate) return gate;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/health");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

// Middleware runs on Edge Runtime (default for middleware.ts), which is required
// for the Supabase SSR client to run before the request reaches the server.

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
