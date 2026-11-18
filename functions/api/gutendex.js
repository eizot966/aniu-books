export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const lang = url.searchParams.get("lang") || "";

  let apiUrl = `https://gutendex.com/books/?search=${encodeURIComponent(q)}`;
  if (lang) {
    apiUrl += `&languages=${encodeURIComponent(lang)}`;
  }

  try {
    const resp = await fetch(apiUrl, {
      headers: { "User-Agent": "AniuBooks/2.0 (https://book.88996688.xyz)" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const data = await resp.json();

    const results = (data.results || []).slice(0, 24).map(b => {
      const pgId = b.id;
      const mirrorEpub = `https://gutenberg.pglaf.org/cache/epub/${pgId}/pg${pgId}-images.epub`;
      const mirrorMobi = `https://gutenberg.pglaf.org/cache/epub/${pgId}/pg${pgId}-images.kf8.mobi`;
      const cover = b.formats ? (b.formats["image/jpeg"] || "") : "";
      const authors = (b.authors || []).map(a => a.name).join(" / ") || "佚名";
      return {
        id: `pg-${pgId}`,
        title: b.title,
        author: authors,
        category: "全球公版直链",
        tag: "🌐 Gutenberg直链",
        epub: mirrorEpub,
        mobi: mirrorMobi,
        cover,
        downloads: b.download_count || 0,
        formats: ["epub", "mobi"]
      };
    });

    return new Response(JSON.stringify({ count: data.count || 0, results }), {
      status: 200,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ count: 0, results: [], error: err.message }), {
      status: 200,
      headers: { "Content-Type": "application/json;charset=UTF-8" }
    });
  }
}
