/* ============================================================
   MY TOOLS — app.js
   Core: page definitions, carousel, swipe tracking,
         background interpolation, pill animation
   ============================================================ */

/* ── 1. PAGE DEFINITIONS ────────────────────────────────────
   To change a page title  → edit the `title` field
   To change a page colour → edit the `bg` field (any CSS hex colour)
   To add a new page       → add a new object to this array
   ─────────────────────────────────────────────────────────── */
const pages = [
  {
    id: "budget",
    title: "Budget",           // ← pill label and card title
    bg: "#0a2e14",             // ← rich deep green background
    pillBg: "rgba(255,255,255,0.18)", // pill tint (future use)
  },
  {
    id: "placeholder2",
    title: "Habits",
    bg: "#0d1a3a",             // ← deep indigo/navy
    pillBg: "rgba(255,255,255,0.18)",
  },
  {
    id: "placeholder3",
    title: "Focus",
    bg: "#2a0a1a",             // ← deep burgundy
    pillBg: "rgba(255,255,255,0.18)",
  },
];


/* ── 2. DOM REFERENCES ──────────────────────────────────── */
const bg         = document.getElementById("bg");
const strip      = document.getElementById("strip");
const pillLabel  = document.getElementById("pill-label");
const pill       = document.getElementById("pill");
const dotsWrap   = document.createElement("div");
dotsWrap.id      = "dots";
document.getElementById("app").appendChild(dotsWrap);


/* ── 3. BUILD DOM ───────────────────────────────────────────
   Creates one .page > .card per page entry and appends to #strip.
   Also builds dot indicators.
   ─────────────────────────────────────────────────────────── */
pages.forEach((page, i) => {
  // Page wrapper
  const pageEl = document.createElement("div");
  pageEl.className = "page";
  pageEl.dataset.index = i;

  // Card — the main content tile
  // ──────────────────────────────────────────────────────────
  // TO ADD TOOL CONTENT LATER:
  //   Replace or append inside `cardInner` div below.
  //   You can check `page.id` to target a specific tool.
  // ──────────────────────────────────────────────────────────
  const card = document.createElement("div");
  card.className = "card card--placeholder";
  card.innerHTML = `
    <div class="card-title">${page.title}</div>
    <div class="card-placeholder" id="card-content-${page.id}">
      <p>Coming soon</p>
    </div>
  `;

  pageEl.appendChild(card);
  strip.appendChild(pageEl);

  // Dot
  const dot = document.createElement("div");
  dot.className = "dot" + (i === 0 ? " active" : "");
  dot.dataset.index = i;
  dotsWrap.appendChild(dot);
});

// Set strip width to fit all pages
strip.style.width = `${pages.length * 100}vw`;


/* ── 4. STATE ───────────────────────────────────────────── */
let currentIndex   = 0;       // the settled page we're on
let targetIndex    = 0;       // the page we're snapping to
let isDragging     = false;
let startX         = 0;       // pointer X at drag start
let startY         = 0;       // pointer Y at drag start
let currentTranslateX = 0;   // current strip translateX in px
let baseTranslateX = 0;       // translateX at the moment drag started
let lastX          = 0;       // for velocity calculation
let lastTime       = 0;
let velocity       = 0;       // px/ms at release
let rafId          = null;    // requestAnimationFrame ID for bg lerp
let bgAnimStart    = null;    // timestamp when snap bg anim started
let bgAnimFrom     = null;    // colour at snap start
let bgAnimTo       = null;    // target colour
const BG_ANIM_DURATION = 380; // ms — matches CSS snap transition


/* ── 5. COLOUR UTILITIES ────────────────────────────────── */

/** Parse a hex colour string → [r, g, b] */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0,2), 16),
    parseInt(h.slice(2,4), 16),
    parseInt(h.slice(4,6), 16),
  ];
}

/** Linear interpolate two [r,g,b] arrays by t (0–1) */
function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Apply an [r,g,b] array to the #bg element's background-color */
function applyBgColour(rgb) {
  const col = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  bg.style.backgroundColor = col;
  document.body.style.backgroundColor = col;
  document.documentElement.style.backgroundColor = col;
  document.getElementById("app").style.setProperty("--footer-bg", col);
}

/* ── 6. BACKGROUND INTERPOLATION ───────────────────────────
   Called every frame during drag AND during snap animation.
   During drag:   uses the live fractional position.
   During snap:   uses a rAF loop with a matching easing curve.
   ─────────────────────────────────────────────────────────── */

/**
 * Update background colour to match the current strip position.
 * Called from pointermove — pure real-time live blending.
 */
function updateBgFromPosition(translateX) {
  const vw = window.innerWidth;
  // fractionalIndex: 0.0 = page 0, 1.0 = page 1, etc.
  const raw = -translateX / vw;
  const fi  = Math.max(0, Math.min(pages.length - 1, raw));

  const leftIdx  = Math.floor(fi);
  const rightIdx = Math.min(pages.length - 1, leftIdx + 1);
  const t        = fi - leftIdx;

  const colA = hexToRgb(pages[leftIdx].bg);
  const colB = hexToRgb(pages[rightIdx].bg);
  applyBgColour(lerpRgb(colA, colB, t));
}

/**
 * Easing function matching the CSS snap cubic-bezier(0.25,1,0.5,1).
 * Used by the rAF loop so the background colour tracks the strip
 * snap animation exactly.
 */
function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Animate background colour from bgAnimFrom → bgAnimTo over
 * BG_ANIM_DURATION ms, matching the strip snap animation.
 */
function animateBgSnap(timestamp) {
  if (!bgAnimStart) bgAnimStart = timestamp;
  const elapsed = timestamp - bgAnimStart;
  const t = Math.min(elapsed / BG_ANIM_DURATION, 1);
  const eased = easeOutExpo(t);

  applyBgColour(lerpRgb(bgAnimFrom, bgAnimTo, eased));

  if (t < 1) {
    rafId = requestAnimationFrame(animateBgSnap);
  } else {
    rafId = null;
    bgAnimStart = null;
  }
}


/* ── 7. PILL ANIMATION ──────────────────────────────────────
   The pill wraps tightly around its text and stretches/shrinks
   with a springy cubic-bezier when the label changes.
   ─────────────────────────────────────────────────────────── */

/**
 * Snapshot the pill's current rendered width, then switch the
 * label text, then animate from old width to new width.
 * The springy transition is defined in CSS on #pill (transition: width).
 */
function updatePill(newLabel) {
  if (pillLabel.textContent === newLabel) return;

  // 1. Lock current width so we have a from-state
  const fromWidth = pill.getBoundingClientRect().width;
  pill.style.width = fromWidth + "px";

  // 2. Fade the label out
  pillLabel.classList.add("fading");

  setTimeout(() => {
    // 3. Swap the text while invisible
    pillLabel.textContent = newLabel;

    // 4. Fade back in
    pillLabel.classList.remove("fading");

    // 5. Let the pill measure its new natural width, then animate to it
    // We do this by briefly allowing width: max-content to measure,
    // then animating from fromWidth → measured width.
    pill.style.width = "max-content";
    const toWidth = pill.scrollWidth + 40; // 40 = 2 × 20px padding

    // Force layout read, then snap back to fromWidth and animate
    pill.style.transition = "none";
    pill.style.width = fromWidth + "px";

    // Trigger a reflow so the next width assignment animates
    void pill.offsetWidth;

    // Re-enable springy transition and animate to new width
    pill.style.transition = "";
    pill.style.width = toWidth + "px";

  }, 75); // 75ms = half of the 150ms label fade
}


/* ── 8. DOTS UPDATE ─────────────────────────────────────── */
function updateDots(index) {
  dotsWrap.querySelectorAll(".dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}


/* ── 9. SNAP TO PAGE ────────────────────────────────────── */
function snapToPage(index, fromVelocity) {
  const clampedIndex = Math.max(0, Math.min(pages.length - 1, index));
  targetIndex = clampedIndex;
  currentIndex = clampedIndex;

  const targetX = -clampedIndex * window.innerWidth;

  // Start background colour animation
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  bgAnimStart = null;
  bgAnimFrom  = hexToRgb(getComputedBgColour());
  bgAnimTo    = hexToRgb(pages[clampedIndex].bg);
  rafId = requestAnimationFrame(animateBgSnap);

  // Animate the strip
  strip.classList.add("snapping");
  setTranslate(targetX);
  currentTranslateX = targetX;

  // Keep body/html background in sync so no gap shows around #app on iOS
  document.body.style.backgroundColor = pages[clampedIndex].bg;
  document.documentElement.style.backgroundColor = pages[clampedIndex].bg;

  // Update pill and dots
  updatePill(pages[clampedIndex].title);
  updateDots(clampedIndex);

  // Remove snap class after transition ends
  strip.addEventListener("transitionend", () => {
    strip.classList.remove("snapping");
  }, { once: true });
}

/**
 * Read the current background colour from #bg as [r,g,b].
 * Used as the "from" colour when starting a snap animation.
 */
function getComputedBgColour() {
  // bg.style.backgroundColor is set as rgb(r,g,b) by applyBgColour
  const s = bg.style.backgroundColor;
  if (!s || s === "") return pages[currentIndex].bg;
  const match = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return pages[currentIndex].bg;
  // Convert back to hex for hexToRgb consistency
  const r = parseInt(match[1]).toString(16).padStart(2,"0");
  const g = parseInt(match[2]).toString(16).padStart(2,"0");
  const b = parseInt(match[3]).toString(16).padStart(2,"0");
  return `#${r}${g}${b}`;
}

/** Apply translateX to the strip without triggering layout */
function setTranslate(x) {
  strip.style.transform = `translateX(${x}px)`;
}


/* ── 10. OVERSCROLL / RUBBER BAND ───────────────────────────
   When the user drags beyond page 0 (right) or the last page
   (left), resistance is applied: excess drag is dampened by
   a factor so it feels like stretching against a spring.
   ─────────────────────────────────────────────────────────── */
const RUBBER_BAND_FACTOR = 0.18; // 0 = no movement, 1 = no resistance

function applyRubberBand(rawX) {
  const minX = -(pages.length - 1) * window.innerWidth;
  const maxX = 0;

  if (rawX > maxX) {
    // Past page 0 — dragging right
    const excess = rawX - maxX;
    return maxX + excess * RUBBER_BAND_FACTOR;
  } else if (rawX < minX) {
    // Past last page — dragging left
    const excess = rawX - minX;
    return minX + excess * RUBBER_BAND_FACTOR;
  }

  return rawX;
}


/* ── 11. SWIPE / POINTER EVENT HANDLERS ─────────────────────
   Handles both touch (mobile) and mouse (desktop) via pointer events.
   pointer capture ensures events keep firing even if pointer leaves
   the element.
   ─────────────────────────────────────────────────────────── */
const viewport = document.getElementById("carousel-viewport");

let isHorizontalSwipe = null; // null = undecided, true/false = locked

viewport.addEventListener("pointerdown", onPointerDown, { passive: true });
viewport.addEventListener("pointermove", onPointerMove, { passive: false });
viewport.addEventListener("pointerup",   onPointerUp);
viewport.addEventListener("pointercancel", onPointerUp);

// Forward mouse-wheel/trackpad scroll to the active page's scrollable content.
// The viewport has overflow:hidden so wheel events can't naturally reach the
// inner scrollable element — we capture and redirect them here.
viewport.addEventListener("wheel", e => {
  const activePage = strip.children[currentIndex];
  if (!activePage) return;
  const scrollable = activePage.querySelector('[id^="card-content-"]');
  if (!scrollable) return;

  // Normalise delta across deltaMode: 0=px, 1=lines(~20px), 2=page
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 20;
  if (e.deltaMode === 2) dy *= scrollable.clientHeight;

  e.preventDefault();
  e.stopPropagation();
  scrollable.scrollTop += dy;
}, { passive: false });

function onPointerDown(e) {
  // Ignore multi-touch and mouse (desktop/laptop — touch only)
  if (e.isPrimary === false || e.pointerType === 'mouse') return;

  isDragging = true;
  isHorizontalSwipe = null;
  startX = e.clientX;
  startY = e.clientY;
  baseTranslateX = currentTranslateX;
  lastX = e.clientX;
  lastTime = e.timeStamp;
  velocity = 0;

  // Capture pointer so move/up keep firing even outside element
  try { viewport.setPointerCapture(e.pointerId); } catch(_) {}

  // Kill any in-progress snap animation
  strip.classList.remove("snapping");
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function onPointerMove(e) {
  if (!isDragging || e.isPrimary === false) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  // On first significant move, determine if this is a horizontal or
  // vertical gesture, then lock in for the rest of this drag.
  if (isHorizontalSwipe === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    isHorizontalSwipe = Math.abs(dx) > Math.abs(dy);
  }

  // Vertical gesture — release carousel capture so the content area
  // can handle its own drag-scroll (wired in budget.js wireScrollDrag)
  if (isHorizontalSwipe === false) {
    try { viewport.releasePointerCapture(e.pointerId); } catch(_) {}
    isDragging = false;
    return;
  }

  // Prevent vertical scroll while swiping horizontally
  if (isHorizontalSwipe) e.preventDefault();

  // Velocity tracking (for flick detection on release)
  const dt = e.timeStamp - lastTime;
  if (dt > 0) velocity = (e.clientX - lastX) / dt;
  lastX = e.clientX;
  lastTime = e.timeStamp;

  // Raw translateX following the finger
  const rawX = baseTranslateX + dx;

  // Apply rubber band at edges
  const clampedX = applyRubberBand(rawX);

  currentTranslateX = clampedX;
  setTranslate(clampedX);

  // Live background colour blend
  updateBgFromPosition(clampedX);
}

function onPointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  isHorizontalSwipe = null;

  const vw = window.innerWidth;

  // Which page are we closest to?
  const rawIndex = -currentTranslateX / vw;

  // Flick detection — if velocity is strong, snap one page in that direction
  const FLICK_THRESHOLD = 0.3; // px/ms
  let snapIndex;
  if (velocity > FLICK_THRESHOLD) {
    // Flicked right — go to previous page
    snapIndex = Math.floor(rawIndex);
  } else if (velocity < -FLICK_THRESHOLD) {
    // Flicked left — go to next page
    snapIndex = Math.ceil(rawIndex);
  } else {
    // No flick — snap to nearest
    snapIndex = Math.round(rawIndex);
  }

  snapToPage(snapIndex);
}


/* ── 12. INITIALISE ─────────────────────────────────────── */
function init() {
  // Set initial background colour
  applyBgColour(hexToRgb(pages[0].bg));
  document.body.style.backgroundColor = pages[0].bg;
  document.documentElement.style.backgroundColor = pages[0].bg;
  // Set initial pill label
  pillLabel.textContent = pages[0].title;
  // Set strip width in px (vw units don't work for translateX math)
  // The CSS sets it in vw units but we also ensure starting translate is 0
  setTranslate(0);
  currentTranslateX = 0;
  // Set initial dots
  updateDots(0);
}

init();
