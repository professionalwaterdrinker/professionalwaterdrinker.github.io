// Landing page only: hard-sell slider, nervous MABEL and the hero rays.
/* ---------- Hard-sell slider ---------- */
// EDIT HERE: one entry per slider stop, from softest to hardest.
// "pitch" replaces the intro sentence (HTML allowed). "stickers" are added on top of the
// stickers from the softer levels. style can be "", "tile-style" or "burst".
// The text below is placeholder copy until Mabel sends the real lines.
const HARD_SELL = [
  {
    name: "No hard sell",
    pitch: "Hi, I'm Mabel. I like <em>Scrabble</em>, <em>physics</em> and <em>teaching</em>.",
    stickers: [],
  },
  {
    name: "Gentle nudge",
    pitch: "Hi, I'm Mabel. I like <em>Scrabble</em>, <em>physics</em> and <em>teaching</em>, and I'm pretty good at all three.",
    stickers: [{ text: "Scrabble fan", style: "tile-style" }],
  },
  {
    name: "Soft sell",
    pitch: "Mabel here. Scrabble player, <em>fluid dynamics</em> enthusiast and patient teacher. Worth an email.",
    stickers: [{ text: "Physics nerd", style: "" }, { text: "QI = 11 pts", style: "tile-style" }],
  },
  {
    name: "Hard sell",
    pitch: "Mabel. <em>Scrabble shark.</em> <em>Physics brain.</em> A teacher who actually explains things. You should get in touch.",
    stickers: [{ text: "Great explainer", style: "" }, { text: "Ask me about vortices", style: "tile-style" }],
  },
  {
    name: "Very hard sell",
    pitch: "<em>MABEL!!!</em> The Scrabble-playing, fluid-simulating, physics-teaching person you've been looking for. <em>Email me right now.</em>",
    stickers: [{ text: "Book me now!", style: "burst" }, { text: "Limited time only", style: "" }, { text: "100% Mabel", style: "burst" }],
  },
];
// Where stickers land inside the intro section, in order of appearance.
const SPOTS = [
  { x: 74, y: 4, r: -8 }, { x: 52, y: 44, r: 6 }, { x: 4, y: 56, r: -5 }, { x: 86, y: 38, r: 9 },
  { x: 30, y: 2, r: 7 }, { x: 1, y: 2, r: -10 }, { x: 88, y: 0, r: 12 }, { x: 18, y: 36, r: -12 },
];

const sell = document.getElementById("sell-level");
const sellName = document.getElementById("sell-name");
const pitch = document.getElementById("pitch");
const stickerBox = document.getElementById("stickers");
const hero = document.querySelector(".hero");
let sellLevel = 0;

// Each sticker gets its own point on the slider, evenly spaced from start to end
// (in the order they are listed above), so they pop in one at a time as the handle moves.
const MAX_SELL = HARD_SELL.length - 1;
const ALL_STICKERS = HARD_SELL.flatMap((lvl) => lvl.stickers);
const STICKERS = ALL_STICKERS.map((s, n) => ({ ...s, at: ((n + 1) / (ALL_STICKERS.length + 1)) * MAX_SELL }));

function syncStickers(v) {
  const wanted = STICKERS.filter((s) => v >= s.at).length;
  while (stickerBox.children.length > wanted) stickerBox.lastChild.remove();
  for (let n = stickerBox.children.length; n < wanted; n++) {
    const s = STICKERS[n], spot = SPOTS[n % SPOTS.length];
    const el = document.createElement("div");
    el.className = `sticker ${s.style}`;
    el.textContent = s.text;
    if (spot.x > 50) el.style.right = `${100 - spot.x}%`;
    else el.style.left = `${spot.x}%`;
    el.style.top = `${spot.y}%`;
    el.style.setProperty("--rot", `${spot.r}deg`);
    el.style.fontSize = s.style === "burst" ? "20px" : "22px";
    stickerBox.appendChild(el);
  }
}

function applySell(level) {
  const lvl = HARD_SELL[level];
  pitch.innerHTML = lvl.pitch;
  sellName.textContent = lvl.name;
  sell.setAttribute("aria-valuetext", lvl.name);
  hero.classList.toggle("max", level === HARD_SELL.length - 1);
  // Selling harder stirs up the fluid behind the page.
  if (level > sellLevel && typeof bursts !== "undefined") {
    const r = sell.getBoundingClientRect();
    bursts.push({ x: r.left + (r.width * level) / (HARD_SELL.length - 1), y: r.top + r.height / 2 });
  }
  sellLevel = level;
}
/* ---------- Nervous MABEL: trembles, then shakes and sweats ---------- */
// Sweat is drawn on its own canvas with flat colours. Beads grow on the tiles, sag under
// gravity, slide once they are too heavy to stay pinned, neck off the bottom edge and
// pinch off. Falling drops wobble (decaying shape oscillation) and flatten slightly
// against the air as they speed up.
let nerves = 0;
const heroHead = document.querySelector(".hero .tile-head");
const heroTiles = [...document.querySelectorAll(".rack .tile")];
const sweatCanvas = document.createElement("canvas");
sweatCanvas.className = "sweat";
sweatCanvas.setAttribute("aria-hidden", "true");
document.body.appendChild(sweatCanvas);
const sctx = sweatCanvas.getContext("2d");
let sweatFill = "#ffffff", sweatShine = "rgba(0,0,0,0)", sweatInk = "#0b0b0b";
function readSweat() {
  const s = getComputedStyle(document.documentElement);
  sweatFill = s.getPropertyValue("--sweat").trim() || sweatFill;
  sweatShine = s.getPropertyValue("--sweat-shine").trim() || sweatShine;
  sweatInk = s.getPropertyValue("--sweat-ink").trim() || sweatInk;
}
readSweat();
function sizeSweat() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  sweatCanvas.width = innerWidth * dpr;
  sweatCanvas.height = innerHeight * dpr;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeSweat();
window.addEventListener("resize", sizeSweat);

// Beads: positions are in pixels relative to their tile's top-left corner, scaled by tile size.
const beads = [];
heroTiles.forEach((tile, i) => {
  for (let k = 0; k < 3; k++) {
    const u = 0.14 + Math.random() * 0.72, v0 = 0.1 + Math.random() * 0.45;
    beads.push({ tile, u, v0, v: v0, r: 0, vy: 0, state: "grow", hang: 0, at: 0.12 + ((i * 3 + k) / 15) * 0.82 });
  }
});
const drops = [];

function addDrop(x, y, vx, vy, r, amp) {
  drops.push({ x, y, vx, vy, r, amp, age: 0 });
}

function flingDrop() {
  const tile = heroTiles[(Math.random() * heroTiles.length) | 0];
  const tr = tile.getBoundingClientRect();
  const side = Math.random() < 0.5 ? -1 : 1;
  const r = tr.width * (0.018 + Math.random() * 0.02 * (0.5 + nerves));
  addDrop(
    side < 0 ? tr.left : tr.right,
    tr.top + tr.height * (0.15 + Math.random() * 0.5),
    side * (0.8 + Math.random() * 3.5 * nerves),
    -Math.random() * 3 * nerves,
    r,
    0.3
  );
}

// A drop stuck to a wall: round bottom, top drawn out into a tail as it sags or slides.
function wallDrop(x, y, r, tail) {
  const s = tail / (tail + r);
  const topY = y - r - tail;
  sctx.beginPath();
  sctx.moveTo(x + r, y);
  sctx.arc(x, y, r, 0, Math.PI);
  sctx.bezierCurveTo(x - r, y - r * 0.55 - tail * 0.45, x - r * 0.55 * (1 - s), topY, x, topY);
  sctx.bezierCurveTo(x + r * 0.55 * (1 - s), topY, x + r, y - r * 0.55 - tail * 0.45, x + r, y);
  sctx.fill();
  sctx.stroke();
}

// A drop hanging from the tile's bottom edge, thinning at the neck before it pinches off.
function hangingDrop(x, edgeY, r, neckLen, neckW) {
  const cy = edgeY + neckLen + r;
  sctx.beginPath();
  sctx.moveTo(x - neckW, edgeY);
  sctx.bezierCurveTo(x - neckW, edgeY + neckLen * 0.6, x - r, cy - r * 0.9, x - r, cy);
  sctx.arc(x, cy, r, Math.PI, 0, true);
  sctx.bezierCurveTo(x + r, cy - r * 0.9, x + neckW, edgeY + neckLen * 0.6, x + neckW, edgeY);
  sctx.closePath();
  sctx.fill();
  sctx.stroke();
  return cy;
}

function shine(x, y, r) {
  sctx.fillStyle = sweatShine;
  sctx.beginPath();
  sctx.ellipse(x - r * 0.38, y - r * 0.32, r * 0.24, r * 0.15, -0.6, 0, Math.PI * 2);
  sctx.fill();
  sctx.fillStyle = sweatFill;
}

let sweatWasDrawn = false;
function stepNerves() {
  const t = nerves;
  if (t > 0 && !reduced) {
    const amp = 0.5 + t * t * 7, rot = t * t * 2.5;
    const rnd = () => Math.random() * 2 - 1;
    heroHead.style.transform = `translate(${rnd() * amp}px, ${rnd() * amp * 0.6}px) rotate(${rnd() * rot}deg)`;
  } else if (heroHead.style.transform) {
    heroHead.style.transform = "";
  }

  const busy = t > 0 || drops.length || beads.some((b) => b.r > 0.2);
  if (!busy) {
    if (sweatWasDrawn) sctx.clearRect(0, 0, innerWidth, innerHeight);
    sweatWasDrawn = false;
    requestAnimationFrame(stepNerves);
    return;
  }
  sweatWasDrawn = true;
  sctx.clearRect(0, 0, innerWidth, innerHeight);
  sctx.fillStyle = sweatFill;
  sctx.strokeStyle = sweatInk;
  sctx.lineWidth = 2;
  sctx.lineJoin = "round";

  const rects = new Map(heroTiles.map((el) => [el, el.getBoundingClientRect()]));
  for (const b of beads) {
    const tr = rects.get(b.tile);
    const size = tr.width;
    const rc = size * 0.045; // biggest bead that stays pinned
    const rTarget = t >= b.at ? size * (0.026 + 0.034 * t) : 0;
    if (b.state === "grow") {
      b.r += (rTarget - b.r) * (rTarget > b.r ? 0.03 : 0.08);
      if (!reduced && b.r > rc) b.state = "slide";
    }
    if (b.state === "slide") {
      b.vy += 0.0009 * (b.r / rc - 0.8); // heavier drops slide faster
      b.vy *= 0.93; // viscous drag on the surface
      if (Math.random() < 0.04) b.vy *= 0.3; // stick-slip
      b.v += b.vy;
      if (rTarget > 0) b.r += 0.004 * size * 0.05;
      if (b.v * size + b.r >= size * 0.97) {
        b.state = "hang";
        b.hang = 0;
      }
    }
    const x = tr.left + b.u * size;
    if (b.state === "hang") {
      b.hang++;
      const p = Math.min(1, b.hang / 26);
      const neckLen = b.r * (0.15 + 1.1 * p * p);
      const neckW = b.r * 0.75 * (1 - p);
      const cy = hangingDrop(x, tr.bottom - 1, b.r, neckLen, Math.max(neckW, 0.4));
      shine(x, cy, b.r);
      if (p >= 1) {
        addDrop(x, cy, 0, 1, b.r, 0.28); // pinches off and wobbles as it falls
        Object.assign(b, { state: "grow", r: 0, v: b.v0, vy: 0 });
      }
      continue;
    }
    if (b.r < 0.3) continue;
    const y = tr.top + b.v * size;
    const sag = Math.max(0, b.r - rc * 0.55) * 0.9; // gravity drags the top into a tail
    const tail = sag + (b.state === "slide" ? Math.min(b.vy * size * 9, b.r * 2.2) : 0);
    wallDrop(x, y, b.r, tail);
    shine(x, y, b.r);
  }

  if (!reduced && t > 0.35 && Math.random() < (t - 0.35) * 0.55) flingDrop();

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.age++;
    d.vy += 0.3;
    d.vx *= 0.99;
    d.x += d.vx;
    d.y += d.vy;
    // Shape oscillation after pinch-off, plus flattening along the direction of motion.
    const k = d.amp * Math.exp(-d.age / 22) * Math.sin(d.age * 0.55);
    const speed = Math.hypot(d.vx, d.vy);
    const f = Math.min(0.16, speed * 0.008);
    const along = d.r * (1 + k) * (1 - f);
    const across = d.r * (1 - k * 0.8) * (1 + f * 0.5);
    const ang = Math.atan2(d.vy, d.vx);
    sctx.beginPath();
    sctx.ellipse(d.x, d.y, along, across, ang, 0, Math.PI * 2);
    sctx.fill();
    sctx.stroke();
    shine(d.x, d.y, Math.min(along, across));
    if (d.y > innerHeight + 30 || d.age > 240) drops.splice(i, 1);
  }
  requestAnimationFrame(stepNerves);
}
requestAnimationFrame(stepNerves);

// The handle glides freely; the content switches when it passes the halfway point between stops.
function onSell() {
  const v = Number(sell.value);
  sell.style.setProperty("--fill", `${(v / (HARD_SELL.length - 1)) * 100}%`);
  const level = Math.round(v);
  if (level !== sellLevel) applySell(level);
  syncStickers(v);
  // Over the last stretch (between the last two stops) MABEL gets more and more nervous.
  nerves = clamp(v - (HARD_SELL.length - 2), 0, 1);
}
sell.addEventListener("input", onSell);
// Arrow keys jump a whole stop at a time.
sell.addEventListener("keydown", (e) => {
  const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (!dir) return;
  e.preventDefault();
  sell.value = clamp(Math.round(Number(sell.value)) + dir, 0, HARD_SELL.length - 1);
  onSell();
});
applySell(Math.round(Number(sell.value)));
onSell();

/* ---------- Hero rays: electric field lines of an oscillating charge ---------- */
// Each red ray is a field line. The charge behind the name wobbles up and down, and every
// change in its velocity sends out a shell of radiation at light speed. Where a shell passes,
// the field line kinks sideways (most at 90° to the motion, not at all along it), so the
// lines zigzag and the kinks ripple outward.
const rays = document.getElementById("rays");
const rctx = rays.getContext("2d");
let raySize = 0, rayRed = "#c4121a";
function sizeRays() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  raySize = rays.getBoundingClientRect().width;
  rays.width = raySize * dpr;
  rays.height = raySize * dpr;
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rayRed = getComputedStyle(document.documentElement).getPropertyValue("--red").trim() || rayRed;
}
sizeRays();
window.addEventListener("resize", sizeRays);

const RAY_COUNT = 24, RAY_HALF = (2.5 * Math.PI) / 180, KINK = 0.13, AXIS = -Math.PI / 2;
const EMIT_EVERY = 70; // frames between shells
let rayFrame = 0;

function drawRays() {
  const S = raySize, c = S / 2;
  const rIn = S * 0.06, rOut = S * 0.45;
  const speed = (rOut - rIn) / (EMIT_EVERY * 6);
  const thick = S * 0.022;
  // Live shells: radius grows at light speed; sign flips each half-oscillation.
  const shells = [];
  for (let k = 0; ; k++) {
    const age = (rayFrame % EMIT_EVERY) + k * EMIT_EVERY;
    const r = rIn + age * speed;
    if (r > rOut + thick) break;
    const n = Math.floor(rayFrame / EMIT_EVERY) - k;
    shells.push({ r, s: n % 2 === 0 ? 1 : -1 });
  }
  const spin = (rayFrame / (90 * 60)) * Math.PI * 2;
  rctx.clearRect(0, 0, S, S);
  rctx.fillStyle = rayRed;
  const steps = 160;
  for (let i = 0; i < RAY_COUNT; i++) {
    const th0 = (i / RAY_COUNT) * Math.PI * 2;
    const bend = KINK * Math.sin(th0 - AXIS); // transverse kick ∝ sinθ
    const left = [], right = [];
    for (let q = 0; q <= steps; q++) {
      const r = rIn + ((rOut - rIn) * q) / steps;
      let off = 0;
      for (const sh of shells) {
        if (r < sh.r) off += sh.s * bend * Math.min(1, (sh.r - r) / thick) * 0.5;
      }
      const th = th0 + spin + off;
      left.push([c + r * Math.cos(th - RAY_HALF), c + r * Math.sin(th - RAY_HALF)]);
      right.push([c + r * Math.cos(th + RAY_HALF), c + r * Math.sin(th + RAY_HALF)]);
    }
    rctx.beginPath();
    rctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) rctx.lineTo(p[0], p[1]);
    for (let q = right.length - 1; q >= 0; q--) rctx.lineTo(right[q][0], right[q][1]);
    rctx.closePath();
    rctx.fill();
  }
  // Fade in near the centre and out at the edge.
  rctx.globalCompositeOperation = "destination-in";
  const g = rctx.createRadialGradient(c, c, 0, c, c, S * 0.44);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.16, "rgba(0,0,0,0)");
  g.addColorStop(0.2, "rgba(0,0,0,0.9)");
  g.addColorStop(0.72, "rgba(0,0,0,0.9)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  rctx.fillStyle = g;
  rctx.fillRect(0, 0, S, S);
  rctx.globalCompositeOperation = "source-over";
}

function stepRays() {
  rayFrame++;
  drawRays();
  requestAnimationFrame(stepRays);
}
if (reduced) {
  rayFrame = 40;
  drawRays();
  window.addEventListener("resize", drawRays);
} else {
  requestAnimationFrame(stepRays);
}
