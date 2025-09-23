export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Normalize /blog -> /blog/
    if (url.pathname === "/blog") {
      return Response.redirect(url.origin + "/blog/", 301);
    }

    if (url.pathname.startsWith("/blog/")) {
      // Build upstream URL to Ghost
      const upstream = new URL(request.url);
      upstream.hostname = "blog.eden.studio";
      upstream.pathname = url.pathname.replace(/^\/blog/, "") || "/";

      // Clone request with adjusted headers
      const hdrs = new Headers(request.headers);
      hdrs.set("Host", "blog.eden.studio");
      hdrs.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      hdrs.set("X-Forwarded-Host", url.host);
      hdrs.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

      const upstreamReq = new Request(upstream.toString(), {
        method: request.method,
        headers: hdrs,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
        redirect: "manual", // so we can rewrite Location
      });

      // Cache only safe GETs (skip admin/members/preview)
      const skipCache = /\/ghost\/|\/members\/|preview=|__amp_source_origin/.test(upstream.pathname) || request.method !== "GET";
      if (!skipCache) {
        const cache = caches.default;
        const cached = await cache.match(request);
        if (cached) return cached;
      }

      const resp = await fetch(upstreamReq);
      const headers = new Headers(resp.headers);

      // Rewrite redirect targets back into /blog
      if (headers.has("location")) {
        const loc = new URL(headers.get("location"), "https://blog.eden.studio");
        if (loc.hostname === "blog.eden.studio") {
          headers.set("location", url.origin + "/blog" + loc.pathname + loc.search + loc.hash);
        }
      }

      // OPTIONAL: If you use Members, keep cookies on /blog and apex domain
      const sc = headers.get("set-cookie");
      if (sc) {
        headers.set(
          "set-cookie",
          sc.replace(/;\s*Path=\/(?!blog\/?)/gi, "; Path=/blog/")
            .replace(/;\s*Domain=\.?blog\.eden\.studio/gi, "; Domain=eden.studio")
        );
      }

      const out = new Response(resp.body, { status: resp.status, headers });
      if (!skipCache && resp.ok && resp.status === 200) {
        ctx.waitUntil(caches.default.put(request, out.clone()));
      }
      return out;
    }

    // Everything else goes to your normal origin
    return fetch(request);
  }
}
