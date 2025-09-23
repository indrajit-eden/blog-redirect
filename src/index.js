export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Normalize /blog -> /blog/
    if (url.hostname === "eden.studio" && url.pathname === "/blog") {
      return Response.redirect(`${url.origin}/blog/`, 301);
    }

    // Proxy only /blog/* on eden.studio
    if (url.hostname === "eden.studio" && url.pathname.startsWith("/blog")) {
      // IMPORTANT: Keep /blog in the upstream path (Ghost will be configured for /blog)
      const upstream = new URL(request.url);
      upstream.hostname = "eden-studio-sf.ghost.io";

      // Clone request & set required headers
      const proxyReq = new Request(upstream.toString(), request);
      const hdrs = new Headers(proxyReq.headers);

      hdrs.set("Host", "eden-studio-sf.ghost.io"); // must be ghost.io host
      hdrs.set("X-Forwarded-Host", "eden.studio"); // must match custom domain in Ghost Admin
      hdrs.set("X-Forwarded-Proto", "https");
      hdrs.set("X-Forwarded-For", proxyReq.headers.get("CF-Connecting-IP") || "");

      return fetch(new Request(upstream.toString(), {
        method: proxyReq.method,
        headers: hdrs,
        body: ["GET","HEAD"].includes(proxyReq.method) ? undefined : await proxyReq.arrayBuffer(),
        redirect: "follow"
      }));
    }

    // Everything else: passthrough
    return fetch(request);
  }
};
