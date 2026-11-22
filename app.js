/* Compiled Bible: a tiny hash router.  #/  = the 66 books,  #/REV = a book's chapters,  #/REV/2 = a chapter. */
const app = document.getElementById("app");
const cache = {};
const getJSON = url => cache[url] || (cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); }));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let BOOKS = [];

function setNav(prev, next) {
  for (const [id, t] of [["prev", prev], ["next", next]]) {
    const a = document.getElementById(id);
    a.hidden = !t;
    if (t) { a.href = t.href; document.getElementById(id + "-label").textContent = t.label; }
  }
}

function home() {
  document.title = "Compiled Bible";
  setNav(null, { href: "#/GEN", label: "Genesis" });
  const list = t => BOOKS.filter(b => b.testament === t).map(b => `<a href="#/${b.code}">${esc(b.name)}</a>`).join("");
  app.innerHTML = `<h1>The Holy Bible</h1><p class="sub">King James Version, with other translations' readings beneath</p>
    <h2>Old Testament</h2><div class="books">${list("OT")}</div>
    <h2>New Testament</h2><div class="books">${list("NT")}</div>`;
}

function book(code) {
  const i = BOOKS.findIndex(b => b.code === code), b = BOOKS[i];
  if (!b) return home();
  document.title = `${b.name} · Compiled Bible`;
  const p = BOOKS[i - 1], n = BOOKS[i + 1];
  setNav(p ? { href: `#/${p.code}`, label: p.name } : { href: "#/", label: "All books" },
         n ? { href: `#/${n.code}`, label: n.name } : null);
  let links = "";
  for (let c = 1; c <= b.chapters; c++) links += `<a href="#/${b.code}/${c}" aria-label="${esc(b.name)} chapter ${c}">${c}</a>`;
  app.innerHTML = `<h1>${esc(b.name)}</h1><p class="sub">${b.chapters === 1 ? "1 chapter" : b.chapters + " chapters"}</p><div class="chapters">${links}</div>`;
}

function neighbors(i, c) {
  const b = BOOKS[i];
  const prev = c > 1 ? { href: `#/${b.code}/${c - 1}`, label: `${b.name} ${c - 1}` }
    : i > 0 ? { href: `#/${BOOKS[i - 1].code}/${BOOKS[i - 1].chapters}`, label: `${BOOKS[i - 1].name} ${BOOKS[i - 1].chapters}` } : { href: "#/", label: "All books" };
  const next = c < b.chapters ? { href: `#/${b.code}/${c + 1}`, label: `${b.name} ${c + 1}` }
    : i < BOOKS.length - 1 ? { href: `#/${BOOKS[i + 1].code}/1`, label: `${BOOKS[i + 1].name} 1` } : null;
  return [prev, next];
}

async function chapter(code, c) {
  const i = BOOKS.findIndex(b => b.code === code), b = BOOKS[i];
  if (!b || c < 1 || c > b.chapters) return book(code);
  document.title = `${b.name} ${c} · Compiled Bible`;
  setNav(...neighbors(i, c));
  app.innerHTML = `<p class="loading">Loading ${esc(b.name)} ${c}…</p>`;
  let D;
  try { D = await getJSON(`data/ch/${code}.${c}.json`); }
  catch { app.innerHTML = `<p class="loading">${esc(b.name)} ${c} didn't load. Check the connection and reload the page.</p>`; return; }
  const lang = b.testament === "OT" ? "Hebrew" : "Greek";
  let html = `<h1><a href="#/${code}" style="text-decoration:none">${esc(b.name)}</a> ${c}</h1><p class="sub">${D.jst ? "Joseph Smith Translation, with JST verse numbers" : "King James Version · readings from other translations beneath"}</p>`;
  for (const [n, text] of D.v) html += verseHTML(n, text, D.a[n] || [], !!D.w[n]);
  const hasAlts = Object.keys(D.a).length;
  html += `<div class="note">
    ${hasAlts ? `<div><span class="a">Red italic</span> under a word: another translation reads it differently. Tap it to see which ones. A + means words added before that word.</div>` : ""}
    <div>Tap a verse number to see the ${lang}, word by word, in English letters with Strong's definitions. For more, use an interlinear Bible.</div>
  </div>`;
  app.innerHTML = html;
  app.dataset.ch = `${code}.${c}`;
  fit();
  window.scrollTo(0, 0);
}

function verseHTML(n, text, alts, hasWords) {
  const toks = text.split(/\s+/);
  const starts = {};
  alts.forEach(a => {
    const [s, e] = a.pos;
    if (s === e) { const at = Math.min(s, toks.length - 1); (starts[at] = starts[at] || []).push({ ...a, pos: [at, at + 1], plus: s < toks.length ? "+ " : "… + " }); }
    else (starts[s] = starts[s] || []).push(a);
  });
  const alt = a => `<span class="a" tabindex="0" role="button" data-src="${esc(a.sources.join("; "))}">${a.plus || ""}${a.text === "(omits)" ? "(left out)" : esc(a.text)}</span>`;
  const num = n === 0 ? `<span class="n title"></span>`
    : `<span class="n" tabindex="0" role="button" data-v="${n}" title="Show the original language">${n}</span>`;
  let html = num, i = 0;
  while (i < toks.length) {
    const here = starts[i];
    if (here) {
      let end = Math.max(...here.map(a => a.pos[1]));
      for (let j = i + 1; j < end; j++) (starts[j] || []).forEach(a => { here.push(a); end = Math.max(end, a.pos[1]); });
      html += `<span class="g">${toks.slice(i, end).map(esc).join(" ")}${here.map(alt).join("")}</span> `;
      i = end;
    } else { html += esc(toks[i]) + " "; i++; }
  }
  return `<p class="v" data-v="${n}">${html}</p>`;
}

/* Keep alternates inside the column, and stack ones that would collide into a second row. */
function fit() {
  const edge = app.getBoundingClientRect().right - 16;
  const alts = [...app.querySelectorAll(".g .a")];
  if (!alts.length) return;
  alts.forEach(a => { a.style.top = ""; a.classList.remove("flip", "drop"); if (a.getBoundingClientRect().right > edge) a.classList.add("flip"); });
  const lines = new Map();
  alts.forEach(a => { const r = a.getBoundingClientRect(), k = Math.round(r.top); if (!lines.has(k)) lines.set(k, []); lines.get(k).push({ a, left: r.left, right: r.right }); });
  const step = 1.1 * parseFloat(getComputedStyle(alts[0]).fontSize);
  lines.forEach(items => {
    items.sort((x, y) => x.left - y.left);
    const ends = [];
    items.forEach(it => {
      let row = ends.findIndex(e => it.left > e + 6);
      if (row === -1) { row = ends.length; ends.push(0); }
      ends[row] = it.right;
      if (row) { it.a.style.top = `calc(1.5rem + ${row * step}px)`; it.a.style.setProperty("--lift", `${row * step}px`); it.a.classList.add("drop"); }
    });
  });
}

/* Boxes opened under a verse sit between it and the next verse. */
function under(p, cls) {
  for (let s = p.nextElementSibling; s && !s.classList.contains("v"); s = s.nextElementSibling) if (s.classList.contains(cls)) return s;
  return null;
}
function showSources(el) {
  const p = el.closest(".v"), old = under(p, "pop"), text = el.dataset.src;
  if (old) old.remove();
  if (old && old.dataset.for === text) return;
  const box = document.createElement("div"); box.className = "pop"; box.dataset.for = text; box.textContent = "Reads this way: " + text; p.after(box);
}
async function showWords(el) {
  const p = el.closest(".v"), old = under(p, "words");
  if (old) { old.remove(); return; }
  const [code, c] = app.dataset.ch.split(".");
  const b = BOOKS.find(x => x.code === code), lang = b.testament === "OT" ? "hebrew" : "greek";
  const box = document.createElement("div"); box.className = "words"; box.textContent = "Loading…"; p.after(box);
  try {
    const [D, lex] = await Promise.all([getJSON(`data/ch/${code}.${c}.json`), getJSON(`data/lex-${lang}.json`)]);
    const ws = D.w[el.dataset.v] || [];
    box.innerHTML = `<div class="cap">Verse ${el.dataset.v} in ${lang === "greek" ? "Greek (the Textus Receptus, the text behind the KJV)" : "Hebrew (read right to left; shown here in reading order)"}: each word in English letters, its meaning here, and its Strong's definition</div>` +
      ws.map(([tr, gl, sn]) => `<div><div class="head"><span class="tr">${esc(tr)}</span><span>“${esc(gl)}”</span><span class="sn">${esc(sn)}</span></div>${lex[sn] ? `<div class="df">${esc(lex[sn])}</div>` : ""}</div>`).join("");
  } catch { box.textContent = "The word list didn't load. Check the connection and tap the verse number again."; }
}
document.addEventListener("click", e => {
  const n = e.target.closest(".n[data-v]"); if (n) return showWords(n);
  const a = e.target.closest(".a[data-src]"); if (a) return showSources(a);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".a, .n[data-v]")) { e.preventDefault(); e.target.click(); }
});
addEventListener("resize", () => fit());

function route() {
  const [code, c] = location.hash.replace(/^#\/?/, "").split("/");
  if (!code) home();
  else if (!c) book(code.toUpperCase());
  else chapter(code.toUpperCase(), parseInt(c, 10));
}
addEventListener("hashchange", route);
getJSON("data/books.json").then(b => { BOOKS = b; route(); })
  .catch(() => { app.innerHTML = `<p class="loading">The book list didn't load. Reload the page.</p>`; });
