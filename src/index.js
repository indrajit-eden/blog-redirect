export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 301 everything from blog.eden.studio → eden.studio/blog/*
    if (url.hostname === "blog.eden.studio") {
      const target = `https://eden.studio/blog${url.pathname}${url.search}${url.hash}`;
      return Response.redirect(target, 301);
    }

    // Normalize /blog → /blog/
    if (url.hostname === "eden.studio" && url.pathname === "/blog") {
      return Response.redirect(`${url.origin}/blog/`, 301);
    }

    // Proxy /blog/* → blog.eden.studio/*
    if (url.hostname === "eden.studio" && url.pathname.startsWith("/blog/")) {
      const upstream = new URL(request.url);
      upstream.hostname = "blog.eden.studio";
      upstream.pathname = url.pathname.replace(/^\/blog/, "") || "/";

      // clone request & add proxy headers
      const headers = new Headers(request.headers);
      headers.set("Host", "blog.eden.studio");
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      headers.set("X-Forwarded-Host", url.host);
      headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

      const upstreamReq = new Request(upstream.toString(), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
        redirect: "manual" // so we can rewrite Location
      });

      // Optionally skip caching for admin/members/preview
      const skipCache = /\/ghost\/|\/members\/|preview=|__amp_source_origin/.test(upstream.pathname) || request.method !== "GET";
      if (!skipCache) {
        const cached = await caches.default.match(request);
        if (cached) return cached;
      }

      const resp = await fetch(upstreamReq);
      const outHeaders = new Headers(resp.headers);

      // Rewrite redirects back into /blog
      const loc = outHeaders.get("location");
      if (loc) {
        const locUrl = new URL(loc, "https://blog.eden.studio");
        if (locUrl.hostname === "blog.eden.studio") {
          outHeaders.set("location", `${url.origin}/blog${locUrl.pathname}${locUrl.search}${locUrl.hash}`);
        }
      }

      // (Optional) adjust cookies for apex domain + /blog path
      const setCookie = outHeaders.get("set-cookie");
      if (setCookie) {
        outHeaders.set(
          "set-cookie",
          setCookie
            .replace(/;\s*Path=\/(?!blog\/?)/gi, "; Path=/blog/")
            .replace(/;\s*Domain=\.?blog\.eden\.studio/gi, "; Domain=eden.studio")
        );
      }

      const out = new Response(resp.body, { status: resp.status, headers: outHeaders });
      if (!skipCache && resp.ok && resp.status === 200) {
        ctx.waitUntil(caches.default.put(request, out.clone()));
      }
      return out;
    }

    // Anything else: just pass through
    return fetch(request);
  }
};
