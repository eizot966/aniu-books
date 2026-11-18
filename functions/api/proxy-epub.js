export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const filename = url.searchParams.get("name") || "aniu-book.epub";
  const isDownload = url.searchParams.get("dl") === "1";

  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json;charset=UTF-8" }
    });
  }

  // 安全白名单校验
  let parsedTarget;
  try {
    parsedTarget = new URL(target);
  } catch (e) {
    return new Response("Invalid URL", { status: 400 });
  }

  const allowedHosts = [
    "raw.githubusercontent.com",
    "github.com",
    "objects.githubusercontent.com",
    "gutenberg.pglaf.org",
    "www.gutenberg.org",
    "aleph.gutenberg.org",
    "book.88996688.xyz"
  ];

  if (!allowedHosts.some(h => parsedTarget.hostname === h || parsedTarget.hostname.endsWith("." + h))) {
    return new Response("Host not in proxy allowlist", { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AniuBooks/2.0"
      },
      cf: {
        cacheTtl: 86400,
        cacheEverything: true
      }
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });
    }

    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400");

    if (filename.endsWith(".mobi")) {
      headers.set("Content-Type", "application/x-mobipocket-ebook");
    } else if (filename.endsWith(".pdf")) {
      headers.set("Content-Type", "application/pdf");
    } else if (filename.endsWith(".azw3")) {
      headers.set("Content-Type", "application/vnd.amazon.ebook");
    } else {
      headers.set("Content-Type", "application/epub+zip");
    }

    if (isDownload) {
      const safeName = encodeURIComponent(filename);
      headers.set("Content-Disposition", `attachment; filename="aniu-book.epub"; filename*=UTF-8''${safeName}`);
    }

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(`Proxy fetch failed: ${err.message}`, { status: 502 });
  }
}
