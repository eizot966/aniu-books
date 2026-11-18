// ============================================================================
// 《阿牛书院 · Calibre-Pro Serverless 旗舰版》核心前端引擎 (app.js)
// 适配：iPhone · iPad · Apple Books · Amazon Kindle App · Kindle 墨水屏
// ============================================================================

const STATE = {
  directBooks: [],
  treasureBooks: [], // Normalized objects from treasure_index.json
  categories: [],    // [[catName, count], ...]
  gutendexResults: [],
  currentShelf: "all",
  selectedCategory: "",
  searchQuery: "",
  formatFilter: "all",
  pageSize: 48,
  currentPage: 1,
  filteredList: [],
  favorites: new Set(JSON.parse(localStorage.getItem("aniu_book_favs") || "[]")),
  history: JSON.parse(localStorage.getItem("aniu_book_history") || "[]"),
  siteTheme: localStorage.getItem("aniu_site_theme") || "dark",
  // Reader state
  currentBookObj: null,
  epubBook: null,
  epubRendition: null,
  readerFontSize: parseInt(localStorage.getItem("aniu_reader_fontsize") || "105", 10),
  readerTheme: localStorage.getItem("aniu_reader_theme") || "dark"
};

const COVER_PALETTES = [
  "linear-gradient(145deg, #991b1b 0%, #450a0a 100%)",
  "linear-gradient(145deg, #1e3a8a 0%, #0f172a 100%)",
  "linear-gradient(145deg, #065f46 0%, #022c22 100%)",
  "linear-gradient(145deg, #5b21b6 0%, #1e1b4b 100%)",
  "linear-gradient(145deg, #92400e 0%, #3f1d06 100%)",
  "linear-gradient(145deg, #155e75 0%, #082f49 100%)",
  "linear-gradient(145deg, #831843 0%, #3b0764 100%)",
  "linear-gradient(145deg, #374151 0%, #111827 100%)",
  "linear-gradient(145deg, #b45309 0%, #451a03 100%)",
  "linear-gradient(145deg, #047857 0%, #064e3b 100%)"
];

function getCoverStyle(title, category) {
  const str = (title || "") + (category || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return COVER_PALETTES[hash % COVER_PALETTES.length];
}

function showToast(msg) {
  const el = document.getElementById("toastMsg");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// 初始化入口
document.addEventListener("DOMContentLoaded", async () => {
  applySiteTheme(STATE.siteTheme);
  updatePrivateCounts();
  renderContinueReadingBar();

  // 检查 URL 参数是否指定了墨水屏模式 (?mode=eink 或 /kindle)
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "eink") {
    applySiteTheme("eink");
  }

  // 绑定搜索框防抖监听
  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    let timer = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        STATE.searchQuery = e.target.value.trim();
        document.getElementById("clearSearchBtn").style.display = STATE.searchQuery ? "block" : "none";
        applyFilters();
      }, 150);
    });
  }

  // 绑定键盘左右翻页
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("readerModal");
    if (!modal || !modal.classList.contains("open")) return;
    if (e.key === "ArrowLeft") readerPrevPage();
    if (e.key === "ArrowRight") readerNextPage();
    if (e.key === "Escape") closeReader();
  });

  // 恢复保存的 Kindle 邮箱
  const savedEmail = localStorage.getItem("aniu_kindle_email") || "";
  const emailInput = document.getElementById("kindleEmailInput");
  if (emailInput && savedEmail) emailInput.value = savedEmail;

  // 第一步：秒加载 182 册免网盘直链秒读库
  try {
    const r1 = await fetch("/data/featured_direct.json?v=2.0");
    STATE.directBooks = (await r1.json()).map(b => ({
      ...b,
      isDirect: true,
      categories: [b.category]
    }));
    document.getElementById("countDirect").textContent = STATE.directBooks.length.toLocaleString();
    document.getElementById("statDirectNum").textContent = STATE.directBooks.length.toLocaleString();
    applyFilters();
  } catch (err) {
    console.error("Failed to load featured_direct.json:", err);
  }

  // 第二步：并行流式加载 24,071 条万卷藏书阁索引
  try {
    const r2 = await fetch("/data/treasure_index.json?v=2.0");
    const tData = await r2.json();
    const prefix = tData.url_prefix || "https://url89.ctfile.com/f/31084289-";
    const suffix = tData.url_suffix || "?p=8866";

    STATE.categories = tData.categories || [];
    STATE.treasureBooks = (tData.books || []).map((row, idx) => {
      const [title, author, code, cats] = row;
      const fullLink = code.startsWith("http") ? code : `${prefix}${code}${suffix}`;
      return {
        id: `tr-${idx}`,
        title,
        author,
        category: cats[0] || "精选",
        categories: cats,
        tag: "📦 万卷藏书阁",
        ctlink: fullLink,
        passcode: "8866",
        formats: ["epub", "mobi", "azw3"],
        isDirect: false
      };
    });

    const totalCombined = STATE.directBooks.length + (tData.total_entries || STATE.treasureBooks.length);
    document.getElementById("countAll").textContent = totalCombined.toLocaleString();
    document.getElementById("countTreasure").textContent = STATE.treasureBooks.length.toLocaleString();
    document.getElementById("statTreasureNum").textContent = (tData.total_entries || 24071).toLocaleString();

    renderCategoryChips("");
    applyFilters();
  } catch (err) {
    console.error("Failed to load treasure_index.json:", err);
  }
});

// 渲染左侧 1,000 个细分分类胶囊
function renderCategoryChips(filterKeyword) {
  const wrap = document.getElementById("categoryChipsWrap");
  if (!wrap) return;
  const kw = (filterKeyword || "").trim().toLowerCase();
  const list = kw
    ? STATE.categories.filter(([name]) => name.toLowerCase().includes(kw)).slice(0, 60)
    : STATE.categories.slice(0, 36);

  wrap.innerHTML = list.map(([name, count]) => {
    const isAct = STATE.selectedCategory === name ? "active" : "";
    return `<span class="cat-chip ${isAct}" onclick="selectCategory('${name.replace(/'/g, "\\'")}')">${escapeHtml(name)} <small>(${count})</small></span>`;
  }).join("");
}

function selectCategory(catName) {
  if (STATE.selectedCategory === catName) {
    STATE.selectedCategory = "";
  } else {
    STATE.selectedCategory = catName;
    STATE.currentShelf = "treasure";
    updateSidebarActive();
  }
  renderCategoryChips(document.getElementById("catFilterInput")?.value || "");
  applyFilters();
}

function switchShelf(shelf) {
  STATE.currentShelf = shelf;
  if (shelf !== "treasure") {
    STATE.selectedCategory = "";
    renderCategoryChips(document.getElementById("catFilterInput")?.value || "");
  }
  updateSidebarActive();

  if (shelf === "gutendex" && STATE.gutendexResults.length === 0) {
    searchGutendexLive(STATE.searchQuery || "classic");
  } else {
    applyFilters();
  }
}

function updateSidebarActive() {
  document.querySelectorAll(".sidebar .nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-shelf") === STATE.currentShelf);
  });
}

function clearSearch() {
  const inp = document.getElementById("globalSearchInput");
  if (inp) inp.value = "";
  STATE.searchQuery = "";
  document.getElementById("clearSearchBtn").style.display = "none";
  applyFilters();
}

// 核心筛选与排序逻辑
function applyFilters() {
  STATE.formatFilter = document.getElementById("formatFilterSelect")?.value || "all";
  STATE.currentPage = 1;

  const q = STATE.searchQuery.toLowerCase();
  const titleEl = document.getElementById("currentSectionTitle");
  const subEl = document.getElementById("currentSectionSub");
  const shadowBox = document.getElementById("shadowMatrixBox");

  // 展示或隐藏全网影子书库矩阵
  if (q || STATE.currentShelf === "gutendex") {
    shadowBox.style.display = "block";
    renderShadowLinks(STATE.searchQuery || "经典名著");
  } else {
    shadowBox.style.display = "none";
  }

  let pool = [];
  if (STATE.currentShelf === "direct") {
    pool = [...STATE.directBooks];
    titleEl.textContent = "⚡ 免网盘直链秒读馆（182 册直链 EPUB）";
    subEl.textContent = "全部支持浏览器内【📖 在线即读】与 iPhone/iPad【📲 一键直下导入 Kindle App / 苹果图书】";
  } else if (STATE.currentShelf === "cdn") {
    pool = STATE.directBooks.filter(b => b.id.startsWith("cdn-"));
    titleEl.textContent = "🏛️ 本站 CDN 极速名著与特供馆（22 册精校直链）";
    subEl.textContent = "托管于 book.88996688.xyz 全球边缘节点，0.1 秒即点即读";
  } else if (STATE.currentShelf === "magazine") {
    pool = STATE.directBooks.filter(b => b.category === "外刊精读");
    titleEl.textContent = "🌍 全球顶级英文外刊馆（经济学人 · 纽约客 · 连线 · 大西洋月刊）";
    subEl.textContent = "提供原版 EPUB / MOBI / PDF 直链，支持在线即读与导入 iPad 记笔记";
  } else if (STATE.currentShelf === "geek") {
    pool = STATE.directBooks.filter(b => b.id.startsWith("gt-"));
    titleEl.textContent = "💻 极客时间 153 册名师专栏全集（直链 EPUB）";
    subEl.textContent = "涵盖 AI、架构、算法、前端、后端、摄影与产品思维，全套直链免网盘";
  } else if (STATE.currentShelf === "treasure") {
    pool = [...STATE.treasureBooks];
    const catLabel = STATE.selectedCategory ? ` · 【${STATE.selectedCategory}】专栏` : "（11,390 册去重 / 24,071 分类条目）";
    titleEl.textContent = `📦 万卷藏书阁全分类精校库${catLabel}`;
    subEl.textContent = "涵盖樊登读书、微信读书、京东读书、喜马拉雅热门好书，点击自动复制提取码 8866";
  } else if (STATE.currentShelf === "gutendex") {
    pool = [...STATE.gutendexResults];
    titleEl.textContent = "🌐 Project Gutenberg 全球 70,000+ 册公版直链书库";
    subEl.textContent = "实时对接全球公版图书直链镜像，全部提供免验证 EPUB 与 Kindle MOBI 直下";
  } else if (STATE.currentShelf === "favorites") {
    const allMap = new Map([...STATE.directBooks, ...STATE.treasureBooks].map(b => [b.id, b]));
    pool = Array.from(STATE.favorites).map(id => allMap.get(id)).filter(Boolean);
    titleEl.textContent = `❤️ 我的私人收藏书架（共 ${pool.length} 册）`;
    subEl.textContent = "保存在当前设备的私人精选书单";
  } else if (STATE.currentShelf === "history") {
    pool = STATE.history;
    titleEl.textContent = `🕒 最近阅读记录与书签进度（共 ${pool.length} 册）`;
    subEl.textContent = "点击【📖 继续阅读】可自动恢复到上次离开时的精确章节与页码";
  } else {
    // 默认 "all" 精选总览：直链秒读排最前，随后是万卷藏书阁
    pool = [...STATE.directBooks, ...STATE.treasureBooks];
    titleEl.textContent = q
      ? `🔍 搜索「${STATE.searchQuery}」的结果`
      : "🌟 阿牛书院 · 全馆精选总览（直链秒读优先展示）";
    subEl.textContent = "免网盘直链书籍排在最前，支持浏览器内直接翻页阅读或一键导入 iPhone/iPad Kindle App 与苹果图书";
  }

  // 分类过滤
  if (STATE.selectedCategory) {
    pool = pool.filter(b => (b.categories && b.categories.includes(STATE.selectedCategory)) || b.category === STATE.selectedCategory);
  }

  // 格式来源过滤
  if (STATE.formatFilter === "direct") {
    pool = pool.filter(b => b.isDirect);
  } else if (STATE.formatFilter === "ctfile") {
    pool = pool.filter(b => !b.isDirect);
  }

  // 搜索词过滤
  if (q) {
    pool = pool.filter(b => {
      const t = (b.title || "").toLowerCase();
      const a = (b.author || "").toLowerCase();
      const c = (b.categories ? b.categories.join(" ") : (b.category || "")).toLowerCase();
      return t.includes(q) || a.includes(q) || c.includes(q);
    });
  }

  STATE.filteredList = pool;
  renderBooksGrid();
}

function renderBooksGrid() {
  const grid = document.getElementById("booksGrid");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  if (!grid) return;

  const total = STATE.filteredList.length;
  const limit = STATE.currentPage * STATE.pageSize;
  const slice = STATE.filteredList.slice(0, limit);

  if (slice.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:3rem 1rem; background:var(--bg-panel); border-radius:16px; border:1px dashed var(--border-color);">
        <div style="font-size:2.4rem; margin-bottom:0.5rem;">📭</div>
        <h4 style="margin-bottom:0.4rem;">本馆暂未匹配到该书，请使用上方「全网影子书库穿透矩阵」一键检索！</h4>
        <p style="font-size:0.84rem; color:var(--text-sub);">您也可以点击页面右上角【📂 打开本地书】直接阅读您手机或电脑里的 .epub / .txt 文件。</p>
      </div>`;
    loadMoreWrap.style.display = "none";
    return;
  }

  grid.innerHTML = slice.map(b => renderBookCardHtml(b)).join("");
  loadMoreWrap.style.display = total > limit ? "block" : "none";
}

function loadMoreBooks() {
  STATE.currentPage += 1;
  renderBooksGrid();
}

function renderBookCardHtml(b) {
  const isFav = STATE.favorites.has(b.id);
  const coverBg = getCoverStyle(b.title, b.category);
  const catsText = (b.categories && b.categories.length > 0) ? b.categories.slice(0, 3).join(" · ") : (b.category || "精选");
  const safeId = escapeAttr(b.id);
  const formatsHtml = (b.formats || ["epub"]).map(f => `<span class="fmt-pill">${escapeHtml(f)}</span>`).join("");

  let actionsHtml = "";
  if (b.isDirect || b.epub) {
    const dlUrl = getDirectDownloadUrl(b);
    actionsHtml = `
      <button class="btn-card btn-read" onclick="openReaderById('${safeId}')">📖 在线即读</button>
      <a class="btn-card btn-dl" href="${escapeAttr(dlUrl)}" download="${escapeAttr(b.title)}.epub" onclick="onDirectDownloadClick('${escapeAttr(b.title)}')">📲 导入Kindle/图书</a>
    `;
    if (b.mobi) {
      actionsHtml += `<a class="btn-card" href="${escapeAttr(b.mobi)}" target="_blank" rel="noopener">📟 MOBI</a>`;
    }
    if (b.pdf) {
      actionsHtml += `<a class="btn-card" href="${escapeAttr(b.pdf)}" target="_blank" rel="noopener">📄 PDF</a>`;
    }
  } else {
    actionsHtml = `
      <button class="btn-card btn-dl" onclick="openCtfileBook('${safeId}')">📦 领书 (自动复制8866)</button>
      <button class="btn-card" onclick="quickSearchDirectMatrix('${escapeAttr(b.title)}')" title="在安娜的档案/Z-Lib中搜免网盘直链">⚡ 搜直链</button>
    `;
  }

  return `
    <article class="book-card">
      <div>
        <div class="book-top">
          <div class="book-cover" style="background:${coverBg}" onclick="${(b.isDirect || b.epub) ? `openReaderById('${safeId}')` : `openCtfileBook('${safeId}')`}">
            <span class="cover-cat">${escapeHtml(b.category || "典藏")}</span>
            <div class="cover-title">${escapeHtml(b.title)}</div>
            <span class="cover-author">${escapeHtml(b.author || "佚名")}</span>
          </div>
          <div class="book-info">
            <div class="book-badge-row">
              <span class="source-tag ${(b.isDirect || b.epub) ? "direct" : ""}">${escapeHtml(b.tag || "馆藏")}</span>
              <button class="fav-btn ${isFav ? "active" : ""}" onclick="toggleFavorite('${safeId}')" title="收藏到我的私人书架">
                ${isFav ? "★" : "☆"}
              </button>
            </div>
            <h4 class="book-title" title="${escapeAttr(b.title)}">${escapeHtml(b.title)}</h4>
            <div class="book-author">✍️ ${escapeHtml(b.author || "佚名")} · ${escapeHtml(catsText)}</div>
            <div class="format-pills">${formatsHtml}</div>
          </div>
        </div>
        ${b.desc ? `<p class="book-desc" style="margin-top:0.55rem;">${escapeHtml(b.desc)}</p>` : ""}
      </div>
      <div class="book-actions">
        ${actionsHtml}
      </div>
    </article>
  `;
}

// 生成适配 iPhone / iPad 一键导入 Kindle App & 苹果图书的下载链接
function getDirectDownloadUrl(b) {
  if (!b.epub) return "#";
  if (b.epub.startsWith("/epubs/")) {
    return b.epub;
  }
  const cleanFileName = `${b.title.replace(/[\\/:*?"<>|]/g, "_")}.epub`;
  return `/api/proxy-epub?url=${encodeURIComponent(b.epub)}&dl=1&name=${encodeURIComponent(cleanFileName)}`;
}

function onDirectDownloadClick(title) {
  showToast(`📲 正在下载《${title}》(.epub)，下载后点分享即可一键导入 Kindle App 或苹果图书！`);
}

// 打开万卷藏书阁城通网盘链接并自动复制提取码 8866
function openCtfileBook(bookId) {
  const b = findBookById(bookId);
  if (!b) return;
  const code = b.passcode || "8866";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).catch(() => {});
  }
  showToast(`✅ 已自动为您复制提取码【${code}】！跳转后直接粘贴即可下载 EPUB/MOBI/AZW3`);
  saveToHistory(b, "已获取网盘提取码 8866");
  setTimeout(() => {
    window.open(b.ctlink, "_blank", "noopener");
  }, 350);
}

// 一键唤起全网影子书库矩阵搜索该书
function quickSearchDirectMatrix(title) {
  const cleanTitle = title.replace(/（.*?）|\(.*?\)/g, "").trim();
  const inp = document.getElementById("globalSearchInput");
  if (inp) inp.value = cleanTitle;
  STATE.searchQuery = cleanTitle;
  document.getElementById("clearSearchBtn").style.display = "block";
  applyFilters();
  const box = document.getElementById("shadowMatrixBox");
  if (box) {
    box.style.display = "block";
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  showToast(`🌐 已为您激活《${cleanTitle}》全网影子书库直链穿透矩阵！`);
}

function renderShadowLinks(keyword) {
  const wrap = document.getElementById("shadowLinksWrap");
  if (!wrap) return;
  const enc = encodeURIComponent(keyword);
  const mirrors = [
    { name: "🏛️ 安娜的档案 (Anna's Archive 全球最大直链库)", url: `https://zh.annas-archive.li/search?q=${enc}&ext=epub` },
    { name: "⚡ Liber3 (IPFS 免登录秒下 EPUB/AZW3)", url: `https://liber3.eth.limo/#/search?q=${enc}` },
    { name: "📚 Z-Library 官方搜索镜像", url: `https://z-lib.gs/s/${enc}?extensions%5B%5D=EPUB` },
    { name: "🔍 鸠摩搜书 (Jiumo 中文聚合)", url: `https://www.jiumodiary.com/` },
    { name: "⭐ 豆瓣读书书评与评分对照", url: `https://search.douban.com/book/subject_search?search_text=${enc}` }
  ];
  wrap.innerHTML = mirrors.map(m =>
    `<a href="${m.url}" target="_blank" rel="noopener" class="action-pill">${m.name} ↗</a>`
  ).join("");
}

// 实时检索 Project Gutenberg 70,000+ 册公版直链库
async function searchGutendexLive(customQuery) {
  const q = customQuery || STATE.searchQuery || "chinese";
  showToast(`🌐 正在实时检索全球公版直链书库: ${q}...`);
  try {
    const resp = await fetch(`/api/gutendex?q=${encodeURIComponent(q)}`);
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      STATE.gutendexResults = data.results.map(b => ({ ...b, isDirect: true }));
      STATE.currentShelf = "gutendex";
      updateSidebarActive();
      applyFilters();
      showToast(`✅ 找到 ${data.results.length} 册免验证直链 EPUB/MOBI 图书！`);
    } else {
      showToast("⚠️ 公版库未找到匹配项，可使用上方安娜的档案/Liber3直链穿透");
    }
  } catch (err) {
    console.error("Gutendex live search error:", err);
    showToast("⚠️ 实时接口繁忙，请使用安娜的档案或本馆 2.4 万册书库");
  }
}

function findBookById(bookId) {
  return (
    STATE.directBooks.find(x => x.id === bookId) ||
    STATE.gutendexResults.find(x => x.id === bookId) ||
    STATE.history.find(x => x.id === bookId) ||
    STATE.treasureBooks.find(x => x.id === bookId)
  );
}

// ============================================================================
// 内置 Calibre-Web 级全屏 EPUB / TXT 阅读器引擎 (基于 epub.js + JSZip)
// ============================================================================
async function openReaderById(bookId) {
  const b = findBookById(bookId);
  if (!b || !b.epub) return;

  const modal = document.getElementById("readerModal");
  const titleEl = document.getElementById("readerBookTitle");
  const viewerEl = document.getElementById("epubViewer");
  const dlBtn = document.getElementById("readerDownloadBtn");

  STATE.currentBookObj = b;
  modal.classList.add("open");
  applyReaderThemeClass(STATE.readerTheme);
  titleEl.textContent = `📖 ${b.title} — ${b.author || ""}`;
  dlBtn.href = getDirectDownloadUrl(b);
  dlBtn.setAttribute("download", `${b.title}.epub`);
  viewerEl.innerHTML = `<div style="padding:3rem; text-align:center; color:#94a3b8;">⚡ 正在从阿牛书院高速流式加载《${escapeHtml(b.title)}》...</div>`;

  saveToHistory(b, "正在阅读");

  try {
    let fetchUrl = b.epub;
    if (!b.epub.startsWith("/")) {
      fetchUrl = `/api/proxy-epub?url=${encodeURIComponent(b.epub)}`;
    }

    let resp = await fetch(fetchUrl);
    if (!resp.ok && !b.epub.startsWith("/")) {
      // 本地开发或边缘回退：直接请求源地址
      resp = await fetch(b.epub);
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const buffer = await resp.arrayBuffer();
    await mountEpubBuffer(buffer, b.id);
  } catch (err) {
    console.error("Reader load error:", err);
    viewerEl.innerHTML = `
      <div style="padding:3rem 1.5rem; text-align:center;">
        <h3 style="margin-bottom:0.75rem;">📲 该书体积较大或适合在阅读器 App 中打开</h3>
        <p style="color:#94a3b8; margin-bottom:1.25rem;">您可以点击下方按钮直接下载 .epub 导入 iPhone / iPad 的 Kindle App 或苹果自带「图书」阅读：</p>
        <a href="${escapeAttr(getDirectDownloadUrl(b))}" download="${escapeAttr(b.title)}.epub" class="action-pill primary" style="font-size:1rem; padding:0.7rem 1.6rem;">
          ⚡ 立即下载《${escapeHtml(b.title)}》(.epub)
        </a>
      </div>`;
  }
}

async function mountEpubBuffer(arrayBuffer, bookKey) {
  const viewerEl = document.getElementById("epubViewer");
  viewerEl.innerHTML = "";

  if (STATE.epubBook) {
    try { STATE.epubBook.destroy(); } catch (e) {}
  }

  const book = window.ePub(arrayBuffer);
  STATE.epubBook = book;

  const rendition = book.renderTo("epubViewer", {
    width: "100%",
    height: "100%",
    flow: "paginated",
    manager: "default",
    spread: "none"
  });
  STATE.epubRendition = rendition;

  applyEpubRenditionStyles();

  // 恢复上次阅读进度 CFI
  const savedCfi = localStorage.getItem(`aniu_cfi_${bookKey}`);
  if (savedCfi) {
    await rendition.display(savedCfi);
  } else {
    await rendition.display();
  }

  // 加载章节目录
  const nav = await book.loaded.navigation;
  const tocList = document.getElementById("readerTocList");
  if (tocList && nav && nav.toc) {
    tocList.innerHTML = nav.toc.map(item =>
      `<button class="toc-item" onclick="jumpToHref('${escapeAttr(item.href)}')">${escapeHtml(item.label.trim())}</button>`
    ).join("");
  }

  rendition.on("relocated", (location) => {
    if (location && location.start && location.start.cfi) {
      localStorage.setItem(`aniu_cfi_${bookKey}`, location.start.cfi);
      const idx = location.start.displayed ? `${location.start.displayed.page} / ${location.start.displayed.total} 页` : "";
      document.getElementById("readerProgressText").textContent = `已自动保存阅读书签 ${idx ? "· 本章第 " + idx : ""}`;
    }
  });
}

function jumpToHref(href) {
  if (STATE.epubRendition) {
    STATE.epubRendition.display(href);
    document.getElementById("readerTocDrawer")?.classList.remove("open");
  }
}

function toggleTocDrawer() {
  document.getElementById("readerTocDrawer")?.classList.toggle("open");
}

function readerPrevPage() {
  if (STATE.epubRendition) STATE.epubRendition.prev();
}

function readerNextPage() {
  if (STATE.epubRendition) STATE.epubRendition.next();
}

function changeReaderFontSize(delta) {
  STATE.readerFontSize = Math.max(75, Math.min(180, STATE.readerFontSize + delta));
  localStorage.setItem("aniu_reader_fontsize", String(STATE.readerFontSize));
  applyEpubRenditionStyles();
}

function setReaderTheme(theme) {
  STATE.readerTheme = theme;
  localStorage.setItem("aniu_reader_theme", theme);
  applyReaderThemeClass(theme);
  applyEpubRenditionStyles();
}

function applyReaderThemeClass(theme) {
  const modal = document.getElementById("readerModal");
  if (!modal) return;
  modal.classList.remove("r-sepia", "r-light", "r-eink");
  if (theme === "sepia") modal.classList.add("r-sepia");
  if (theme === "light") modal.classList.add("r-light");
  if (theme === "eink") modal.classList.add("r-eink");
}

function applyEpubRenditionStyles() {
  if (!STATE.epubRendition) return;
  const themes = {
    dark: { body: { background: "#0f172a !important", color: "#e2e8f0 !important" }, p: { color: "#e2e8f0 !important" }, h1: { color: "#f8fafc !important" }, h2: { color: "#f8fafc !important" } },
    sepia: { body: { background: "#f4ecd8 !important", color: "#2c221e !important" }, p: { color: "#2c221e !important" } },
    light: { body: { background: "#ffffff !important", color: "#111827 !important" }, p: { color: "#111827 !important" } },
    eink: { body: { background: "#ffffff !important", color: "#000000 !important", "font-weight": "600 !important" }, p: { color: "#000000 !important" } }
  };
  const active = themes[STATE.readerTheme] || themes.dark;
  STATE.epubRendition.themes.default(active);
  STATE.epubRendition.themes.fontSize(`${STATE.readerFontSize}%`);
}

function closeReader() {
  const modal = document.getElementById("readerModal");
  if (modal) modal.classList.remove("open");
  renderContinueReadingBar();
}

// 支持直接打开手机/电脑本地的 .epub 或 .txt 文件在线阅读
async function handleLocalFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const modal = document.getElementById("readerModal");
  const titleEl = document.getElementById("readerBookTitle");
  const viewerEl = document.getElementById("epubViewer");
  modal.classList.add("open");
  applyReaderThemeClass(STATE.readerTheme);
  titleEl.textContent = `📂 本地阅读：${file.name}`;

  if (file.name.toLowerCase().endsWith(".txt")) {
    const text = await file.text();
    const paragraphs = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    viewerEl.innerHTML = `
      <div style="max-width:800px; margin:0 auto; padding:2rem 1.5rem; font-size:${STATE.readerFontSize}%; line-height:1.9;">
        <h2 style="margin-bottom:1.2rem;">${escapeHtml(file.name)}</h2>
        ${paragraphs.map(p => `<p style="margin-bottom:0.9rem; text-indent:2em;">${escapeHtml(p)}</p>`).join("")}
      </div>`;
  } else {
    const buffer = await file.arrayBuffer();
    await mountEpubBuffer(buffer, `local_${file.name}`);
  }
  event.target.value = "";
}

// ============================================================================
// 私人书架收藏、阅读历史与主题切换
// ============================================================================
function toggleFavorite(bookId) {
  if (STATE.favorites.has(bookId)) {
    STATE.favorites.delete(bookId);
    showToast("已从我的私人书架移除");
  } else {
    STATE.favorites.add(bookId);
    showToast("⭐ 已加入我的私人书架！");
  }
  localStorage.setItem("aniu_book_favs", JSON.stringify(Array.from(STATE.favorites)));
  updatePrivateCounts();
  renderBooksGrid();
}

function saveToHistory(book, statusLabel) {
  const entry = {
    ...book,
    lastReadAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    statusLabel
  };
  STATE.history = [entry, ...STATE.history.filter(x => x.id !== book.id)].slice(0, 30);
  localStorage.setItem("aniu_book_history", JSON.stringify(STATE.history));
  updatePrivateCounts();
  renderContinueReadingBar();
}

function updatePrivateCounts() {
  const favEl = document.getElementById("countFav");
  const histEl = document.getElementById("countHist");
  if (favEl) favEl.textContent = STATE.favorites.size;
  if (histEl) histEl.textContent = STATE.history.length;
}

function renderContinueReadingBar() {
  const bar = document.getElementById("continueReadingBar");
  if (!bar) return;
  const latest = STATE.history[0];
  if (!latest) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  const actionBtn = (latest.isDirect || latest.epub)
    ? `<button class="action-pill primary" onclick="openReaderById('${escapeAttr(latest.id)}')">📖 继续在线阅读</button>`
    : `<button class="action-pill primary" onclick="openCtfileBook('${escapeAttr(latest.id)}')">📦 再次打开网盘 (码8866)</button>`;

  bar.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap;">
      <span style="font-weight:800; color:var(--accent-emerald);">🕒 上次阅读：</span>
      <strong>《${escapeHtml(latest.title)}》</strong>
      <span style="font-size:0.78rem; color:var(--text-sub);">${escapeHtml(latest.author || "")} · ${escapeHtml(latest.lastReadAt || "")}</span>
    </div>
    <div>${actionBtn}</div>
  `;
}

function cycleSiteTheme() {
  const order = ["dark", "sepia", "eink"];
  const next = order[(order.indexOf(STATE.siteTheme) + 1) % order.length];
  applySiteTheme(next);
}

function toggleEinkMode() {
  applySiteTheme(STATE.siteTheme === "eink" ? "dark" : "eink");
}

function applySiteTheme(theme) {
  STATE.siteTheme = theme;
  localStorage.setItem("aniu_site_theme", theme);
  document.body.classList.remove("theme-sepia", "theme-eink");
  const btn = document.getElementById("themeToggleBtn");
  if (theme === "sepia") {
    document.body.classList.add("theme-sepia");
    if (btn) btn.textContent = "📜 书香羊皮纸";
  } else if (theme === "eink") {
    document.body.classList.add("theme-eink");
    if (btn) btn.textContent = "📟 墨水屏模式";
  } else {
    if (btn) btn.textContent = "🌙 赛博暗黑";
  }
}

function openKindleModal() {
  document.getElementById("kindleModal")?.classList.add("open");
}

function closeKindleModal() {
  document.getElementById("kindleModal")?.classList.remove("open");
}

function saveKindleEmail() {
  const val = document.getElementById("kindleEmailInput")?.value.trim() || "";
  localStorage.setItem("aniu_kindle_email", val);
  showToast(val ? `✅ 已记住您的 Kindle 接收邮箱：${val}` : "已清空 Kindle 邮箱记录");
}

function copyOpdsUrl() {
  const url = "https://book.88996688.xyz/opds.xml";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
  showToast("📡 已复制 OPDS 订阅地址：https://book.88996688.xyz/opds.xml");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}
