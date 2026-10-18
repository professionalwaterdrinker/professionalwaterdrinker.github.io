const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pointer = { x: -9999, y: -9999, active: false };

window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
});
document.addEventListener("pointerleave", () => (pointer.active = false));

/* ---------- Background: a small fluid simulation drawn as a contour plot ---------- */
// Stable-fluids solver (semi-Lagrangian advection + pressure projection) on a coarse grid.
// The cursor pushes the fluid; the contour lines are level sets of a dye field it carries.
const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");
const CELL = 14;
let gridColor = "#999", accent = "#c00";

function readColors() {
  const s = getComputedStyle(document.documentElement);
  gridColor = s.getPropertyValue("--grid").trim() || gridColor;
  accent = s.getPropertyValue("--red").trim() || accent;
}
readColors();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

let NX = 0, NY = 0, u, v, u0, v0, dye, dye0, base, pr, div;
const IX = (i, j) => i + (NX + 2) * j;

function buildGrid() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  NX = Math.ceil(innerWidth / CELL) + 1;
  NY = Math.ceil(innerHeight / CELL) + 1;
  const n = (NX + 2) * (NY + 2);
  [u, v, u0, v0, dye, dye0, base, pr, div] = Array.from({ length: 9 }, () => new Float32Array(n));
  // A smooth starting landscape so there are contours before anyone moves.
  for (let j = 0; j < NY + 2; j++) {
    for (let i = 0; i < NX + 2; i++) {
      const x = i * CELL, y = j * CELL;
      base[IX(i, j)] =
        0.5 +
        0.22 * Math.sin(x * 0.006 + Math.cos(y * 0.004) * 2) * Math.cos(y * 0.007) +
        0.14 * Math.sin((x - y) * 0.004 + 1.3);
    }
  }
  dye.set(base);
}
buildGrid();
window.addEventListener("resize", buildGrid);

function setBounds(b, x) {
  for (let i = 1; i <= NX; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  for (let j = 1; j <= NY; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
}

function advect(b, dst, src, vx, vy) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      const x = clamp(i - vx[k], 0.5, NX + 0.5);
      const y = clamp(j - vy[k], 0.5, NY + 0.5);
      const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
      dst[k] =
        s0 * (t0 * src[IX(i0, j0)] + t1 * src[IX(i0, j0 + 1)]) +
        s1 * (t0 * src[IX(i0 + 1, j0)] + t1 * src[IX(i0 + 1, j0 + 1)]);
    }
  }
  setBounds(b, dst);
}

function project() {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      div[IX(i, j)] = -0.5 * (u[IX(i + 1, j)] - u[IX(i - 1, j)] + v[IX(i, j + 1)] - v[IX(i, j - 1)]);
      pr[IX(i, j)] = 0;
    }
  }
  setBounds(0, div);
  setBounds(0, pr);
  for (let it = 0; it < 14; it++) {
    for (let j = 1; j <= NY; j++) {
      for (let i = 1; i <= NX; i++) {
        pr[IX(i, j)] = (div[IX(i, j)] + pr[IX(i - 1, j)] + pr[IX(i + 1, j)] + pr[IX(i, j - 1)] + pr[IX(i, j + 1)]) / 4;
      }
    }
    setBounds(0, pr);
  }
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      u[IX(i, j)] -= 0.5 * (pr[IX(i + 1, j)] - pr[IX(i - 1, j)]);
      v[IX(i, j)] -= 0.5 * (pr[IX(i, j + 1)] - pr[IX(i, j - 1)]);
    }
  }
  setBounds(1, u);
  setBounds(2, v);
}

// Push fluid (and a little dye) in a soft circle around a point given in screen pixels.
function splat(px, py, fx, fy, amount, radius) {
  const ci = px / CELL + 1, cj = py / CELL + 1;
  const r = Math.ceil(radius * 2);
  for (let j = Math.max(1, (cj - r) | 0); j <= Math.min(NY, (cj + r) | 0); j++) {
    for (let i = Math.max(1, (ci - r) | 0); i <= Math.min(NX, (ci + r) | 0); i++) {
      const dx = i - ci, dy = j - cj;
      const w = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
      const k = IX(i, j);
      if (fx === null) {
        // Radial burst: outward from the centre.
        const d = Math.hypot(dx, dy) || 1;
        u[k] += (dx / d) * fy * w;
        v[k] += (dy / d) * fy * w;
      } else {
        u[k] += fx * w;
        v[k] += fy * w;
      }
      dye[k] += amount * w;
    }
  }
}

// A click sends a burst through the fluid.
const bursts = [];
window.addEventListener("pointerdown", (e) => bursts.push({ x: e.clientX, y: e.clientY }));

let lastPX = null, lastPY = null, tSim = 0;
function stepGrid() {
  tSim++;
  if (pointer.active && lastPX !== null) {
    const mx = (pointer.x - lastPX) / CELL, my = (pointer.y - lastPY) / CELL;
    const sp = Math.hypot(mx, my);
    if (sp > 0.01) splat(pointer.x, pointer.y, mx * 0.5, my * 0.5, Math.min(sp * 0.02, 0.06), 3.2);
  }
  lastPX = pointer.active ? pointer.x : null;
  lastPY = pointer.active ? pointer.y : null;
  while (bursts.length) {
    const b = bursts.pop();
    splat(b.x, b.y, null, 1.6, 0.18, 5);
  }
  // Slow cellular drift so the plot keeps breathing when nobody touches it.
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      u[k] += 0.0008 * Math.sin(j * 0.12 + tSim * 0.004);
      v[k] += 0.0008 * Math.cos(i * 0.1 - tSim * 0.003);
    }
  }
  u0.set(u);
  v0.set(v);
  advect(1, u, u0, u0, v0);
  advect(2, v, v0, u0, v0);
  project();
  for (let k = 0; k < u.length; k++) {
    u[k] *= 0.99;
    v[k] *= 0.99;
  }
  dye0.set(dye);
  advect(0, dye, dye0, u, v);
  // Let the dye relax back toward the starting landscape over time.
  for (let k = 0; k < dye.length; k++) dye[k] += (base[k] - dye[k]) * 0.002;
}

// Marching squares: which cell edges a contour crosses, by corner pattern (TL,TR,BR,BL bits).
const CASES = [[], [[2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[0, 3], [1, 2]], [[0, 2]], [[0, 3]],
  [[0, 3]], [[0, 2]], [[0, 1], [2, 3]], [[0, 1]], [[1, 3]], [[1, 2]], [[2, 3]], []];
const LEVELS = [];
for (let L = 0.16; L < 1.2; L += 0.055) LEVELS.push(L);

function drawGrid() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const thin = new Path2D(), bold = new Path2D();
  const pt = (e, x0, y0, a, b, c, d, L) => {
    if (e === 0) return [x0 + (CELL * (L - a)) / (b - a), y0];
    if (e === 1) return [x0 + CELL, y0 + (CELL * (L - b)) / (c - b)];
    if (e === 2) return [x0 + (CELL * (L - d)) / (c - d), y0 + CELL];
    return [x0, y0 + (CELL * (L - a)) / (d - a)];
  };
  for (let j = 1; j < NY; j++) {
    for (let i = 1; i < NX; i++) {
      const a = dye[IX(i, j)], b = dye[IX(i + 1, j)], c = dye[IX(i + 1, j + 1)], d = dye[IX(i, j + 1)];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      const x0 = (i - 1) * CELL, y0 = (j - 1) * CELL;
      for (let n = 0; n < LEVELS.length; n++) {
        const L = LEVELS[n];
        if (L <= lo || L > hi) continue;
        const idx = ((a > L) << 3) | ((b > L) << 2) | ((c > L) << 1) | (d > L);
        const path = n % 5 === 2 ? bold : thin;
        for (const [e1, e2] of CASES[idx]) {
          const p1 = pt(e1, x0, y0, a, b, c, d, L), p2 = pt(e2, x0, y0, a, b, c, d, L);
          path.moveTo(p1[0], p1[1]);
          path.lineTo(p2[0], p2[1]);
        }
      }
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = gridColor;
  ctx.stroke(thin);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = accent;
  ctx.stroke(bold);
  ctx.globalAlpha = 1;
}

/* ---------- Scrabble tiles: drag them, they spring back ---------- */
const tiles = [...document.querySelectorAll(".rack .tile")].map((el) => ({ el, box: el.parentElement.classList.contains("slot") ? el.parentElement : el, x: 0, y: 0, vx: 0, vy: 0, drag: null, last: "" }));

tiles.forEach((t) => {
  t.el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    t.el.setPointerCapture(e.pointerId);
    t.drag = { sx: e.clientX - t.x, sy: e.clientY - t.y, lx: e.clientX, ly: e.clientY };
    t.box.classList.add("dragging");
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
    t.box.classList.remove("dragging");
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
    const tf = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
    if (tf !== t.last) t.box.style.transform = t.last = tf; // skip the write when nothing moved
  }
}

/* ---------- Scroll scene: blue circle grows, then each interest takes a turn ---------- */
const scene = document.querySelector(".scene");
const sceneBg = document.querySelector(".scene-bg");
const words = [...document.querySelectorAll(".words li")];
const rack = document.querySelector(".rack");

function stepScroll() {
  if (!scene) return;
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



/* ---------- Tile headers and their anagram cards ---------- */
const POINTS = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
const score = (w) => [...w].reduce((s, ch) => s + (POINTS[ch] || 0), 0);
// Checked against an English word list. "full" uses every tile; "hidden" uses some of them.
const ANAGRAMS = {
  mabel: { full: ["amble", "blame", "melba"], hidden: ["lamb", "meal"] },
  work: { full: [], hidden: ["row", "wok"] },
  about: { full: [], hidden: ["boat", "tuba", "bout", "auto", "abut"] },
  contact: { full: [], hidden: ["octant", "canto", "coact", "taco", "tact"] },
  scrabble: { full: ["clabbers"], hidden: ["rabble", "cables", "brace", "blabs"] },
  physics: { full: [], hidden: ["physic", "psych", "chips", "spicy", "ship"] },
  teaching: { full: ["cheating"], hidden: ["heating", "etching", "chant", "giant"] },
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
