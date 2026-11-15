/** Forward only Tapll traffic, never the app's cookies or authorization headers. */
export async function proxyTapll(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.slice("/_tapll/".length);
  const script = path === "u.js" && request.method === "GET";
  if (!script && !(path.startsWith("v1/") && ["GET", "POST", "OPTIONS"].includes(request.method))) {
    return new Response(null, { status: 404 });
  }
  const target = new URL(script ? "https://cdn.tapll.com/v0/u.js" : `https://in.tapll.com/${path}`);
  if (target.origin !== (script ? "https://cdn.tapll.com" : "https://in.tapll.com")) {
    return new Response(null, { status: 400 });
  }
  target.search = url.search;
  const headers = new Headers({ Origin: url.origin });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("User-Agent", userAgent);
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) return new Response(null, { status: 502 });
    const outgoing = new Headers();
    outgoing.set("Content-Type", response.headers.get("content-type") ?? "application/octet-stream");
    outgoing.set("Cache-Control", script && response.ok ? "public, max-age=300" : "no-store");
    outgoing.set("X-Content-Type-Options", "nosniff");
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) outgoing.set("Retry-After", retryAfter);
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return new Response(null, { status: 502 });
  }
}
