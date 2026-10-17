const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pointer = { x: -9999, y: -9999, active: false };

window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
});
document.addEventListener("pointerleave", () => (pointer.active = false));

/* ---------- Background: a springy grid that bends around the cursor ---------- */
const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const GAP = 44;
let cols = 0, rows = 0, pts = [], gridColor = "#999", accent = "#22f";

function readColors() {
  const s = getComputedStyle(document.documentElement);
  gridColor = s.getPropertyValue("--grid").trim() || gridColor;
  accent = s.getPropertyValue("--blue").trim() || accent;
}
readColors();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function buildGrid() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(innerWidth / GAP) + 2;
  rows = Math.ceil(innerHeight / GAP) + 2;
  pts = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i - 1) * GAP, y = (j - 1) * GAP;
      pts.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
    }
  }
}
buildGrid();
window.addEventListener("resize", buildGrid);

// A click sends a ripple through the grid.
const ripples = [];
window.addEventListener("pointerdown", (e) => ripples.push({ x: e.clientX, y: e.clientY, r: 0 }));

function stepGrid() {
  const R = 190;
  for (const p of pts) {
    // Cursor pushes points outward, like a ball pressed into a sheet.
    if (pointer.active) {
      const dx = p.ox - pointer.x, dy = p.oy - pointer.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < R) {
        const f = (1 - d / R) ** 2 * 3.2;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
    for (const w of ripples) {
      const dx = p.ox - w.x, dy = p.oy - w.y;
      const d = Math.hypot(dx, dy) || 1;
      const band = Math.abs(d - w.r);
      if (band < 40) {
        const f = (1 - band / 40) * 2.4 * Math.max(0, 1 - w.r / 900);
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
    // Spring back to rest, with damping.
    p.vx += (p.ox - p.x) * 0.06;
    p.vy += (p.oy - p.y) * 0.06;
    p.vx *= 0.82;
    p.vy *= 0.82;
    p.x += p.vx;
    p.y += p.vy;
  }
  for (let k = ripples.length - 1; k >= 0; k--) {
    ripples[k].r += 14;
    if (ripples[k].r > 900) ripples.splice(k, 1);
  }
}

function drawGrid() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = pts[j * cols + i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const p = pts[j * cols + i];
      if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  // Light up the points that are moving fastest.
  ctx.fillStyle = accent;
  for (const p of pts) {
    const sp = Math.abs(p.vx) + Math.abs(p.vy);
    if (sp > 0.6) {
      ctx.globalAlpha = clamp(sp / 6, 0, 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- Scrabble tiles: drag them, they spring back ---------- */
const tiles = [...document.querySelectorAll(".rack .tile")].map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, drag: null }));

tiles.forEach((t) => {
  t.el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    t.el.setPointerCapture(e.pointerId);
    t.drag = { sx: e.clientX - t.x, sy: e.clientY - t.y, lx: e.clientX, ly: e.clientY };
    t.el.classList.add("dragging");
  });
  t.el.addEventListener("pointermove", (e) => {
    if (!t.drag) return;
    t.vx = e.clientX - t.drag.lx;
    t.vy = e.clientY - t.drag.ly;
    t.drag.lx = e.clientX;
    t.drag.ly = e.clientY;
    t.x = e.clientX - t.drag.sx;
    t.y = e.clientY - t.drag.sy;
  });
  const drop = () => {
    t.drag = null;
    t.el.classList.remove("dragging");
  };
  t.el.addEventListener("pointerup", drop);
  t.el.addEventListener("pointercancel", drop);
});

function stepTiles() {
  for (const t of tiles) {
    if (!t.drag) {
      t.vx += -t.x * 0.08;
      t.vy += -t.y * 0.08;
      t.vx *= 0.84;
      t.vy *= 0.84;
      t.x += t.vx;
      t.y += t.vy;
    }
    // Tiles near the cursor lean away a little.
    let lean = 0;
    if (!t.drag && pointer.active) {
      const r = t.el.getBoundingClientRect();
      const dx = pointer.x - (r.left + r.width / 2);
      const dy = pointer.y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      lean = d < 300 ? (-dx / 300) * (1 - d / 300) * 14 : 0;
    }
    const rot = clamp(t.vx * 1.2, -30, 30) + lean;
    t.el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${rot}deg)`;
  }
}

/* ---------- Ticker: speeds up and flips direction with your scroll ---------- */
const track = document.querySelector(".ticker-track");
let tickX = 0, lastScroll = scrollY, boost = 0, dir = -1;
function stepTicker() {
  const ds = scrollY - lastScroll;
  lastScroll = scrollY;
  if (ds !== 0) dir = ds > 0 ? -1 : 1;
  boost = boost * 0.9 + Math.abs(ds) * 0.25;
  tickX += dir * (1 + boost);
  const half = track.scrollWidth / 2;
  if (tickX <= -half) tickX += half;
  if (tickX > 0) tickX -= half;
  track.style.transform = `translateX(${tickX}px)`;
}

/* ---------- Scroll scene: blue circle grows, then each interest takes a turn ---------- */
const scene = document.querySelector(".scene");
const sceneBg = document.querySelector(".scene-bg");
const words = [...document.querySelectorAll(".words li")];
const rack = document.querySelector(".rack");

function stepScroll() {
  const r = scene.getBoundingClientRect();
  const total = r.height - innerHeight;
  const p = clamp(-r.top / total, 0, 1);
  // Circle starts opening as the scene arrives on screen.
  const enter = clamp(1 - r.top / innerHeight, 0, 1);
  sceneBg.style.setProperty("--r", `${enter * 75}%`);
  const idx = p < 0.05 ? -1 : Math.min(words.length - 1, Math.floor((p - 0.05) / 0.3));
  words.forEach((w, i) => w.classList.toggle("on", i === idx));

  // The rack of tiles drifts up and tilts as you leave the top of the page.
  const h = clamp(scrollY / innerHeight, 0, 1);
  rack.style.transform = `translateY(${-h * 80}px) rotate(${-h * 4}deg) scale(${1 - h * 0.15})`;
}

/* ---------- Reveal sections as they scroll in ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- Tile card follows the cursor over project rows ---------- */
const peek = document.querySelector(".peek");
document.querySelectorAll(".project > div").forEach((row) => {
  row.addEventListener("pointerenter", () => {
    peek.textContent = row.dataset.mark;
    peek.classList.add("on");
  });
  row.addEventListener("pointerleave", () => peek.classList.remove("on"));
  row.addEventListener("pointermove", (e) => {
    peek.style.left = e.clientX + "px";
    peek.style.top = e.clientY + "px";
  });
});

/* ---------- Main loop ---------- */
function frame() {
  stepGrid();
  drawGrid();
  stepTiles();
  stepTicker();
  stepScroll();
  requestAnimationFrame(frame);
}
if (reduced) {
  drawGrid();
  stepScroll();
  window.addEventListener("scroll", stepScroll, { passive: true });
  window.addEventListener("resize", drawGrid);
} else {
  requestAnimationFrame(frame);
}

/* ---------- Copy email ---------- */
const copyBtn = document.getElementById("copy-email");
copyBtn?.addEventListener("click", async () => {
  const emailEl = document.querySelector(".email");
  try {
    await navigator.clipboard.writeText(emailEl.textContent.trim());
    copyBtn.textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(emailEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    copyBtn.textContent = "Selected, press Ctrl+C";
  }
  setTimeout(() => (copyBtn.textContent = "Copy email"), 2000);
});

/* ---------- Footer clock and year ---------- */
const clock = document.getElementById("clock");
const tick = () => {
  clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
tick();
setInterval(tick, 1000);


/* ---------- Tile headers and their anagram cards ---------- */
const POINTS = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
const score = (w) => [...w].reduce((s, ch) => s + (POINTS[ch] || 0), 0);
// Checked against an English word list. "full" uses every tile; "hidden" uses some of them.
const ANAGRAMS = {
  mabel: { full: ["amble", "blame", "melba"], hidden: ["lamb", "meal"] },
  work: { full: [], hidden: ["row", "wok"] },
  about: { full: [], hidden: ["boat", "tuba", "bout", "auto", "abut"] },
  contact: { full: [], hidden: ["octant", "canto", "coact", "taco", "tact"] },
};

document.querySelectorAll(".tile-word").forEach((h) => {
  const word = h.textContent.trim();
  h.setAttribute("aria-label", word);
  h.innerHTML = [...word.toUpperCase()]
    .map((ch) => `<span class="tile" aria-hidden="true">${ch}<sub>${POINTS[ch.toLowerCase()]}</sub></span>`)
    .join("");
});

document.querySelectorAll(".tile-head").forEach((head) => {
  const word = head.dataset.word;
  const data = ANAGRAMS[word];
  if (!data) return;
  const list = [
    ...data.full.map((w) => ({ w, full: true })),
    ...data.hidden.map((w) => ({ w, full: false })),
  ].slice(0, 5);
  const title = data.full.length
    ? `${data.full.length} anagram${data.full.length > 1 ? "s" : ""} of ${word.toUpperCase()}`
    : `No full anagrams of ${word.toUpperCase()}`;
  const note = data.full.length && list.some((x) => !x.full)
    ? "Red words use every tile. The rest use some of them."
    : data.full.length ? "" : "These words hide inside it instead.";
  const card = document.createElement("div");
  card.className = "anagrams";
  card.innerHTML =
    `<span class="label">${title}</span><ol>` +
    list.map((x) => `<li class="${x.full ? "full" : ""}"><b>${x.w.toUpperCase()}</b><span>${score(x.w)} pts</span></li>`).join("") +
    `</ol>` + (note ? `<p>${note}</p>` : "");
  head.appendChild(card);
});
