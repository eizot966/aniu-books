const BUILTIN_GUTENBERG = [
  { id: "pg-23962", title: "西遊記 (Journey to the West)", author: "吳承恩 (Wu Cheng'en)", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/23962/pg23962-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/23962/pg23962-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-24264", title: "紅樓夢 (Dream of the Red Chamber)", author: "曹雪芹 (Cao Xueqin)", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/24264/pg24264-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/24264/pg24264-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-23950", title: "三國志演義 (Romance of the Three Kingdoms)", author: "羅貫中 (Luo Guanzhong)", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/23950/pg23950-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/23950/pg23950-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-23863", title: "水滸傳 (Water Margin)", author: "施耐庵 (Shi Nai'an)", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/23863/pg23863-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/23863/pg23863-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-1342", title: "Pride and Prejudice (傲慢与偏见英文原版)", author: "Jane Austen", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/1342/pg1342-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/1342/pg1342-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-1661", title: "The Adventures of Sherlock Holmes (福尔摩斯探案集英文原版)", author: "Arthur Conan Doyle", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/1661/pg1661-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/1661/pg1661-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-11", title: "Alice's Adventures in Wonderland (爱丽丝梦游仙境原版)", author: "Lewis Carroll", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/11/pg11-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/11/pg11-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-84", title: "Frankenstein (科学怪人英文原版)", author: "Mary Wollstonecraft Shelley", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/84/pg84-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/84/pg84-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-64317", title: "The Great Gatsby (了不起的盖茨比英文原版)", author: "F. Scott Fitzgerald", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/64317/pg64317-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/64317/pg64317-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-1513", title: "Romeo and Juliet (罗密欧与朱丽叶原版)", author: "William Shakespeare", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/1513/pg1513-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/1513/pg1513-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-2701", title: "Moby Dick (白鲸英文原版)", author: "Herman Melville", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/2701/pg2701-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/2701/pg2701-images.kf8.mobi", formats: ["epub", "mobi"] },
  { id: "pg-345", title: "Dracula (德古拉英文原版)", author: "Bram Stoker", category: "全球公版直链", tag: "🌐 Gutenberg直链", epub: "https://gutenberg.pglaf.org/cache/epub/345/pg345-images.epub", mobi: "https://gutenberg.pglaf.org/cache/epub/345/pg345-images.kf8.mobi", formats: ["epub", "mobi"] }
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3800);

  try {
    const apiUrl = `https://gutendex.com/books/?search=${encodeURIComponent(q)}`;
    const resp = await fetch(apiUrl, {
      headers: { "User-Agent": "AniuBooks/2.0 (https://book.88996688.xyz)" },
      signal: controller.signal,
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const results = (data.results || []).slice(0, 24).map(b => {
      const pgId = b.id;
      return {
        id: `pg-${pgId}`,
        title: b.title,
        author: (b.authors || []).map(a => a.name).join(" / ") || "佚名",
        category: "全球公版直链",
        tag: "🌐 Gutenberg直链",
        epub: `https://gutenberg.pglaf.org/cache/epub/${pgId}/pg${pgId}-images.epub`,
        mobi: `https://gutenberg.pglaf.org/cache/epub/${pgId}/pg${pgId}-images.kf8.mobi`,
        formats: ["epub", "mobi"]
      };
    });

    const finalResults = results.length > 0 ? results : BUILTIN_GUTENBERG;
    return new Response(JSON.stringify({ count: finalResults.length, results: finalResults }), {
      status: 200,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const kw = q.toLowerCase();
    const filtered = kw
      ? BUILTIN_GUTENBERG.filter(b => b.title.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw))
      : BUILTIN_GUTENBERG;
    const finalResults = filtered.length > 0 ? filtered : BUILTIN_GUTENBERG;
    return new Response(JSON.stringify({ count: finalResults.length, results: finalResults, fallback: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
