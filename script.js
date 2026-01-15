const PACKS_URL = "data/emoticon_pack.csv";
const EMOS_URL  = "data/emoticons.csv";

function parseDelimited(text) {
  const lines = text.trim().split(/\r?\n/);
  const headerLine = lines.shift();
  const delimiter = headerLine.includes("\t") ? "\t" : ",";

  const headers = headerLine.split(delimiter).map(h => h.trim());
  return lines
    .filter(Boolean)
    .map(line => {
      const cols = line.split(delimiter);
      const row = {};
      headers.forEach((h, i) => row[h] = (cols[i] ?? "").trim());
      return row;
    });
}

function safePathJoin(...parts) {
  // 각 path segment를 encodeURIComponent로 감싸서 한글/공백 안전하게
  return parts
    .map(p => encodeURIComponent(p).replaceAll("%2F", "/"))
    .join("/")
    .replaceAll("%2F", "/");
}

async function loadData() {
  const [packsText, emosText] = await Promise.all([
    fetch(PACKS_URL).then(r => r.text()),
    fetch(EMOS_URL).then(r => r.text())
  ]);

  const packs = parseDelimited(packsText).map(p => ({
    id: Number(p.id),
    title: p.title
  }));

  const packMap = new Map(packs.map(p => [p.id, p]));

  const emoticons = parseDelimited(emosText).map(e => {
    const pack = packMap.get(Number(e.emoticon_pack_id));
    const packTitle = pack?.title ?? "UNKNOWN_PACK";

    const fileName = e.title; // 파일명(확장자 포함)
    const imgSrc = safePathJoin("images", packTitle, fileName);

    const keywords = (e.keyword || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    return {
      packId: Number(e.emoticon_pack_id),
      packTitle,
      title: fileName,
      description: e.description || "",
      keywords,
      imgSrc
    };
  });

  return { packs, emoticons };
}

function render({ packs, emoticons }) {
  const packSelect = document.querySelector("#packSelect");
  const searchInput = document.querySelector("#searchInput");
  const grid = document.querySelector("#grid");
  const count = document.querySelector("#count");

  // 팩 드롭다운
  packSelect.innerHTML = `
    <option value="all">전체 팩</option>
    ${packs.map(p => `<option value="${p.id}">${p.title}</option>`).join("")}
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
        <img src="${e.imgSrc}" alt="${e.title}" loading="lazy"
             onerror="this.classList.add('broken'); this.alt='이미지 없음';"/>
        <div class="meta">
          <div class="title">${e.title}</div>
          <div class="pack">${e.packTitle}</div>
          <div class="desc">${e.description}</div>
          <div class="tags">${e.keywords.map(k => `<span>#${k}</span>`).join("")}</div>
          <button class="copy" data-src="${decodeURIComponent(e.imgSrc)}">경로 복사</button>
        </div>
      </div>
    `).join("");

    // 복사 버튼
    grid.querySelectorAll("button.copy").forEach(btn => {
      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(btn.dataset.src);
        btn.textContent = "복사됨!";
        setTimeout(() => btn.textContent = "경로 복사", 800);
      });
    });
  }

  packSelect.addEventListener("change", apply);
  searchInput.addEventListener("input", apply);

  apply();
}

(async function main(){
  const data = await loadData();
  render(data);
})();
