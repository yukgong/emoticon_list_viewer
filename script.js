/*********************
 * CONFIG
 *********************/
const BASE = new URL("./", window.location.href);
const PACKS_URL = new URL("data/emoticon_pack.csv", BASE);
const EMOS_URL  = new URL("data/emoticons.csv", BASE);

// GitHub Pages에서 / 없이 들어오면 상대경로가 꼬일 수 있어 강제 보정
if (!window.location.pathname.endsWith("/")) {
  window.location.replace(
    window.location.pathname + "/" + window.location.search + window.location.hash
  );
}

/*********************
 * CSV/TSV PARSER
 *********************/
function parseDelimited(text) {
  const raw = text.replace(/^\uFEFF/, "").trim(); // BOM 제거
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const headerLine = lines.shift();
  const delimiter = headerLine.includes("\t") ? "\t" : ",";

  const headers = headerLine.split(delimiter).map(h => h.trim());

  return lines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const cols = line.split(delimiter);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? "").trim();
      });
      return row;
    });
}

/*********************
 * URL HELPERS
 *********************/
function joinPathEncoded(...parts) {
    return parts
      .map(p =>
        encodeURIComponent(p.normalize("NFC"))
      )
      .join("/");
  }
  

// BASE 기준으로 최종 URL 만들기 (GitHub Pages 하위경로 대응)
function toAbsUrl(pathLike) {
  return new URL(pathLike, BASE).href;
}

// NFC/NFD 둘 다 만들어서 "존재하는 쪽"을 선택 (HEAD로 확인)
async function pickExistingImageUrl(packTitle, fileName) {
    // 일단 화면/레포에서 일반적으로 쓰는 NFC로 강제
    const pack = String(packTitle ?? "").normalize("NFC");
    const file = String(fileName ?? "").normalize("NFC");
  
    // GitHub Pages 하위경로 안전 + 한글/공백 안전
    const url = new URL(encodeURI(`images/${pack}/${file}`), BASE).href;
  
    // 존재 확인
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (res.ok) return url;
    } catch (_) {}
  
    // 실패하면 디버그용으로 url 반환
    return url;
  }
  

/*********************
 * LOAD DATA
 *********************/
async function loadData() {
  const [packsText, emosText] = await Promise.all([
    fetch(PACKS_URL, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`Failed to load packs: ${r.status} ${r.statusText}`);
      return r.text();
    }),
    fetch(EMOS_URL, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`Failed to load emoticons: ${r.status} ${r.statusText}`);
      return r.text();
    }),
  ]);

  const packs = parseDelimited(packsText).map(p => ({
    id: Number(p.id),
    title: p.title,
  }));

  const packMap = new Map(packs.map(p => [p.id, p]));

  // emoticons는 이미지 URL 확정이 필요해서 async로 처리
  const rawEmos = parseDelimited(emosText);

  // HEAD가 너무 많아지면 느릴 수 있어 "팩별로 먼저 한번만" 같은 최적화도 가능하지만,
  // 일단 안정적으로 동작하는 버전 먼저.
  const emoticons = await Promise.all(
    rawEmos.map(async (e) => {
      const packId = Number(e.emoticon_pack_id);
      const pack = packMap.get(packId);

      const packTitle = (pack?.title ?? `UNKNOWN_${packId}`);
      const fileName  = (e.title ?? "");

      const imgUrl = await pickExistingImageUrl(packTitle, fileName);

      const keywords = (e.keyword || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      return {
        packId,
        packTitle,
        title: fileName,         // 표시용: 파일명
        description: e.description || "",
        keywords,
        imgSrc: imgUrl,          // ✅ 절대 URL
      };
    })
  );

  return { packs, emoticons };
}

/*********************
 * RENDER
 *********************/
function render({ packs, emoticons }) {
  const packSelect = document.querySelector("#packSelect");
  const searchInput = document.querySelector("#searchInput");
  const grid = document.querySelector("#grid");
  const count = document.querySelector("#count");

  packSelect.innerHTML = `
    <option value="all">전체 팩</option>
    ${packs.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("")}
  `;

  function apply() {
    const packId = packSelect.value;
    const q = (searchInput.value || "").trim().toLowerCase();

    const filtered = emoticons.filter(e => {
      const packOk = (packId === "all") || (String(e.packId) === packId);
      if (!packOk) return false;
      if (!q) return true;

      const inTitle = e.title.toLowerCase().includes(q);
      const inDesc = e.description.toLowerCase().includes(q);
      const inKeys = e.keywords.some(k => k.toLowerCase().includes(q));
      const inPack = e.packTitle.toLowerCase().includes(q);
      return inTitle || inDesc || inKeys || inPack;
    });

    count.textContent = `${filtered.length}개`;

    grid.innerHTML = filtered.map(e => `
      <div class="card">
        <img src="${e.imgSrc}" alt="${escapeHtml(e.title)}" loading="lazy"
             onerror="this.classList.add('broken'); this.alt='이미지 없음';" />
        <div class="meta">
          <div class="title">${escapeHtml(e.title)}</div>
          <div class="pack">${escapeHtml(e.packTitle)}</div>
          <div class="desc">${escapeHtml(e.description)}</div>
          <div class="tags">${e.keywords.map(k => `<span>#${escapeHtml(k)}</span>`).join("")}</div>
          <button class="copy" data-src="${escapeAttr(decodeURIComponentSafe(e.imgSrc))}">경로 복사</button>
        </div>
      </div>
    `).join("");

    grid.querySelectorAll("button.copy").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.src);
          const old = btn.textContent;
          btn.textContent = "복사됨!";
          setTimeout(() => btn.textContent = old, 800);
        } catch (e) {
          console.error("clipboard failed", e);
        }
      });
    });
  }

  packSelect.addEventListener("change", apply);
  searchInput.addEventListener("input", apply);
  apply();
}

/*********************
 * HTML ESCAPE (XSS 방지)
 *********************/
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) {
  // attribute용 최소 이스케이프
  return escapeHtml(s).replaceAll("\n", " ");
}
function decodeURIComponentSafe(url) {
  try { return decodeURIComponent(url); }
  catch { return url; }
}

/*********************
 * MAIN
 *********************/
(async function main() {
  try {
    console.log("main start:", window.location.href);
    const data = await loadData();
    console.log("loaded:", { packs: data.packs.length, emoticons: data.emoticons.length });
    render(data);
    console.log("rendered");
  } catch (e) {
    console.error("main error", e);
    onsole.log(img.src);
  }
})();
