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
  { id: "budget",  title: "Budget",  bg: "#0a2e14" },
  { id: "bills",   title: "Bills",   bg: "#0d1a3a" },
  { id: "savings", title: "Savings", bg: "#1a0a2e" },
  { id: "debts",   title: "Debts",   bg: "#2a0a0a" },
];


/* ── 2. DOM REFERENCES ──────────────────────────────────── */
const bg         = document.getElementById("bg");
const strip      = document.getElementById("strip");
const pillLabel  = document.getElementById("pill-label");
const pillIcon   = document.getElementById("pill-icon");
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
const _themeMeta = document.querySelector('meta[name="theme-color"]');

function applyBgColour(rgb) {
  const col = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const dark = `rgb(${Math.round(rgb[0]*0.75)},${Math.round(rgb[1]*0.75)},${Math.round(rgb[2]*0.75)})`;
  bg.style.backgroundColor = col;
  document.body.style.backgroundColor = dark;
  document.documentElement.style.backgroundColor = dark;
  if (_themeMeta) _themeMeta.content = dark;
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

  const pageIndex = pages.findIndex(p => p.title === newLabel);
  const newIcon = pageIndex >= 0 ? menuIcons[pageIconKeys[pageIndex]] : "";

  // 1. Lock current width
  const fromWidth = pill.getBoundingClientRect().width;
  pill.style.width = fromWidth + "px";

  // 2. Fade label and icon out
  pillLabel.classList.add("fading");
  pillIcon.classList.add("fading");

  setTimeout(() => {
    // 3. Swap content while invisible
    pillLabel.textContent = newLabel;
    pillIcon.innerHTML = newIcon;

    // 4. Fade back in
    pillLabel.classList.remove("fading");
    pillIcon.classList.remove("fading");

    // 5. Animate pill width to fit new content
    pill.style.width = "max-content";
    const toWidth = pill.scrollWidth + 24;

    pill.style.transition = "none";
    pill.style.width = fromWidth + "px";
    void pill.offsetWidth;
    pill.style.transition = "";
    pill.style.width = toWidth + "px";

  }, 75);
}


/* ── 8. DOTS UPDATE ─────────────────────────────────────── */
function updateDots(index) {
  dotsWrap.querySelectorAll(".dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}

/* ── 8b. DESKTOP ARROW NAV ──────────────────────────────── */
const prevBtn = document.createElement("button");
prevBtn.id = "nav-prev";
prevBtn.innerHTML = "‹";
prevBtn.setAttribute("aria-label", "Previous page");

const nextBtn = document.createElement("button");
nextBtn.id = "nav-next";
nextBtn.innerHTML = "›";
nextBtn.setAttribute("aria-label", "Next page");

document.getElementById("app").appendChild(prevBtn);
document.getElementById("app").appendChild(nextBtn);

prevBtn.addEventListener("click", () => snapToPage(currentIndex - 1));
nextBtn.addEventListener("click", () => snapToPage(currentIndex + 1));

// Also make dots clickable on desktop
dotsWrap.addEventListener("click", e => {
  const dot = e.target.closest(".dot");
  if (!dot) return;
  snapToPage(parseInt(dot.dataset.index, 10));
});


/* ── 9. SNAP TO PAGE ────────────────────────────────────── */
function snapToPage(index, fromVelocity, instant) {
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

  // Instant jump (from menu) — no slide animation
  if (instant) {
    setTranslate(targetX);
    currentTranslateX = targetX;
  } else {
    strip.classList.add("snapping");
    setTranslate(targetX);
    currentTranslateX = targetX;
    strip.addEventListener("transitionend", () => {
      strip.classList.remove("snapping");
    }, { once: true });
  }

  // Update pill and dots
  updatePill(pages[clampedIndex].title);
  updateDots(clampedIndex);
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
  const adx = Math.abs(dx), ady = Math.abs(dy);

  // Wait for enough movement, then require dx to clearly dominate
  // (1.8× ratio) before locking as horizontal — prevents diagonal
  // swipes from triggering page changes while also scrolling.
  if (isHorizontalSwipe === null && (adx > 6 || ady > 6)) {
    isHorizontalSwipe = adx > ady * 1.8;
  }

  // Vertical gesture — release carousel capture so the content area
  // can handle its own drag-scroll (wired in budget.js wireScrollDrag)
  if (isHorizontalSwipe === false) {
    try { viewport.releasePointerCapture(e.pointerId); } catch(_) {}
    isDragging = false;
    return;
  }

  // Still deciding — don't move the strip yet
  if (isHorizontalSwipe === null) return;

  // Prevent vertical scroll while swiping horizontally
  e.preventDefault();

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


/* ── 12. PILL DROPDOWN MENU ─────────────────────────────── */

const menuIcons = {
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  budget:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M7 15h2M12 15h3"/></svg>`,
  bills:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  savings:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  debts:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6.5C14 4.5 12.5 3.5 10.5 3.5c-2.8 0-4.5 2-4.5 5 0 1.2 0 5.5 0 8.5"/><line x1="5" y1="11.5" x2="13" y2="11.5"/><line x1="5" y1="17" x2="17" y2="17"/></svg>`,
};
const pageIconKeys = ["budget", "bills", "savings", "debts"];

const menuBackdrop = document.createElement("div");
menuBackdrop.id = "pill-menu-backdrop";
document.getElementById("app").appendChild(menuBackdrop);

const pillMenu = document.createElement("div");
pillMenu.id = "pill-menu";

function positionMenu() {
  // Align menu top-right to pill top-right — menu appears to grow from the pill
  const pillRect = pill.getBoundingClientRect();
  pillMenu.style.top   = pillRect.top + "px";
  pillMenu.style.right = (window.innerWidth - pillRect.right) + "px";
}

function menuRow(svgIcon, label) {
  const btn = document.createElement("button");
  btn.className = "pill-menu-item";
  btn.innerHTML = `<span class="pill-menu-item-inner">
    <span class="pill-menu-icon">${svgIcon}</span>
    <span class="pill-menu-label">${label}</span>
  </span>`;
  return btn;
}

// Settings row
const settingsBtn = menuRow(menuIcons.settings, "Settings");
settingsBtn.addEventListener("click", () => closeMenu());
pillMenu.appendChild(settingsBtn);

// Page rows
pages.forEach((page, i) => {
  const item = menuRow(menuIcons[pageIconKeys[i]], page.title);
  item.dataset.menuIndex = i;
  item.addEventListener("click", () => {
    closeMenu();
    snapToPage(i, null, true);
  });
  pillMenu.appendChild(item);
});

document.getElementById("app").appendChild(pillMenu);

function updateMenuBg() {
  const rgb = hexToRgb(pages[currentIndex].bg);
  pillMenu.style.setProperty("--menu-bg",
    `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.52)`);
}

function positionAndOpen() {
  positionMenu();
  updateMenuBg();
  updateMenuActive();
  pillMenu.classList.add("open");
  menuBackdrop.classList.add("open");
  pill.classList.add("menu-open");
}

function closeMenu() {
  pillMenu.classList.remove("open");
  menuBackdrop.classList.remove("open");
  // Delay re-showing pill until menu has faded out
  setTimeout(() => pill.classList.remove("menu-open"), 180);
}

function updateMenuActive() {
  pillMenu.querySelectorAll(".pill-menu-item[data-menu-index]").forEach(el => {
    el.classList.toggle("pill-menu-item--active",
      parseInt(el.dataset.menuIndex, 10) === currentIndex);
  });
}

pill.addEventListener("click", () => {
  pillMenu.classList.contains("open") ? closeMenu() : positionAndOpen();
});

menuBackdrop.addEventListener("click", closeMenu);


/* ── 13. INITIALISE ─────────────────────────────────────── */
function init() {
  // Set initial background colour (also sets theme-color via applyBgColour)
  applyBgColour(hexToRgb(pages[0].bg));
  // Set initial pill label and icon
  pillLabel.textContent = pages[0].title;
  pillIcon.innerHTML = menuIcons[pageIconKeys[0]];
  // Set strip width in px (vw units don't work for translateX math)
  // The CSS sets it in vw units but we also ensure starting translate is 0
  setTranslate(0);
  currentTranslateX = 0;
  // Set initial dots
  updateDots(0);
}

init();

// Lock to portrait-primary (right-way-up only) on touch devices
if ('screen' in window && 'orientation' in screen && typeof screen.orientation.lock === 'function') {
  screen.orientation.lock('portrait-primary').catch(() => {});
}

/* ── 14. SETTINGS SHEET ─────────────────────────────────── */

// ── App-level settings (shared across pages) ──────────────────
const APP_SETTINGS_KEY = 'app_settings_v1';

function loadAppSettings() {
  try {
    return Object.assign({
      periodType:     'fixed',   // 'fixed' | 'lastWeekday'
      paydayDay:      1,         // 1–28, used when periodType='fixed'
      budgetStart:    'period',  // 'today' | 'period'
      budgetStyle:    'fixed',   // 'fixed' | 'adaptive'
      currency:       'GBP',     // 'GBP' | 'USD' | 'EUR'
      notifications:  false,
    }, JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || '{}'));
  } catch { return {}; }
}

function saveAppSettings(s) {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(s));
}

window.appSettings = loadAppSettings();

const settingsSheet     = document.createElement("div");
settingsSheet.id        = "settings-sheet";
settingsSheet.innerHTML = `
  <div id="settings-drag-handle"></div>
  <div id="settings-header">
    <span id="settings-title">Settings</span>
    <button id="settings-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
  <div id="settings-body">

    <div class="st-group">

      <!-- Period type -->
      <div class="st-row">
        <label class="st-label" for="st-period-type-sel">Period type</label>
        <select class="st-select" id="st-period-type-sel">
          <option value="fixed">Fixed date</option>
          <option value="lastWeekday">Last weekday</option>
        </select>
      </div>
      <!-- Payday day — shown only when period type = fixed -->
      <div class="st-row st-sub b-hidden" id="st-payday-day-row">
        <label class="st-label" for="st-payday-input">Payday date</label>
        <input class="st-input" type="number" id="st-payday-input" min="1" max="28" placeholder="1" />
      </div>
      <!-- Budget start -->
      <div class="st-row">
        <label class="st-label" for="st-budget-start-sel">Budget starts</label>
        <select class="st-select" id="st-budget-start-sel">
          <option value="period">From period start</option>
          <option value="today">From today</option>
        </select>
      </div>
      <!-- Budget style -->
      <div class="st-row">
        <label class="st-label" for="st-budget-style-sel">Daily budget</label>
        <select class="st-select" id="st-budget-style-sel">
          <option value="fixed">Fixed daily</option>
          <option value="adaptive">Adaptive daily</option>
        </select>
      </div>

    </div>

    <div class="st-group">

      <!-- Currency -->
      <div class="st-row">
        <label class="st-label" for="st-currency-sel">Currency</label>
        <select class="st-select" id="st-currency-sel">
          <option value="GBP">GBP (£)</option>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

    </div>

    <div class="st-group">

      <!-- Notifications -->
      <div class="st-row">
        <span class="st-label">Notifications</span>
        <button class="st-toggle" id="st-notif-toggle" role="switch" aria-checked="false">
          <span class="st-toggle-thumb"></span>
        </button>
      </div>

    </div>

    <button id="st-save-btn">Save Settings</button>

  </div>
`;

const settingsBackdrop  = document.createElement("div");
settingsBackdrop.id     = "settings-backdrop";

document.getElementById("app").appendChild(settingsBackdrop);
document.getElementById("app").appendChild(settingsSheet);

let _settingsSnapshot = null;

function settingsChanged() {
  if (!_settingsSnapshot) return false;
  const keys = ['periodType','paydayDay','budgetStart','budgetStyle','currency','notifications'];
  return keys.some(k => String(window.appSettings[k]) !== String(_settingsSnapshot[k]));
}

function _doCloseSettings() {
  settingsSheet.classList.remove("open");
  settingsBackdrop.classList.remove("open");
  settingsSheet.style.transform = "";
  _settingsSnapshot = null;
}

function tryCloseSettings() {
  if (!settingsChanged()) { _doCloseSettings(); return; }
  showDiscardSheet();
}

// ── iOS-style discard action sheet ───────────────────────────
const discardSheet = document.createElement("div");
discardSheet.id = "discard-sheet-wrap";
discardSheet.innerHTML = `
  <div id="discard-backdrop"></div>
  <div id="discard-sheet">
    <div id="discard-title-group">
      <span id="discard-title">Unsaved Changes</span>
      <span id="discard-msg">Your settings haven't been saved.</span>
    </div>
    <button id="discard-confirm">Discard Changes</button>
    <button id="discard-cancel">Keep Editing</button>
  </div>
`;
document.getElementById("app").appendChild(discardSheet);

function showDiscardSheet() {
  discardSheet.classList.add("open");
}
function hideDiscardSheet() {
  discardSheet.classList.remove("open");
}

document.getElementById("discard-confirm").addEventListener("click", () => {
  Object.assign(window.appSettings, _settingsSnapshot);
  saveAppSettings(window.appSettings);
  hideDiscardSheet();
  _doCloseSettings();
});
document.getElementById("discard-cancel").addEventListener("click", hideDiscardSheet);
document.getElementById("discard-backdrop").addEventListener("click", hideDiscardSheet);

function closeSettings() {
  _doCloseSettings();
}

function openSettings() {
  renderSettingsValues();
  _settingsSnapshot = Object.assign({}, window.appSettings);
  settingsSheet.classList.add("open");
  settingsBackdrop.classList.add("open");
  settingsSheet.style.transform = "";
}

document.getElementById("settings-close").addEventListener("click", tryCloseSettings);
settingsBackdrop.addEventListener("click", tryCloseSettings);
settingsBtn.addEventListener("click", () => { closeMenu(); openSettings(); });

// Drag-to-dismiss
let sheetDragStartY = 0;
let sheetDragCurrent = 0;
let sheetDragging = false;
const DISMISS_THRESHOLD = 120; // px down to auto-dismiss

function onSheetPointerDown(e) {
  // Only allow drag from the handle or header on mobile
  const isMobile = window.matchMedia("(hover: none)").matches;
  if (!isMobile) return;
  sheetDragStartY = e.touches ? e.touches[0].clientY : e.clientY;
  sheetDragCurrent = 0;
  sheetDragging = true;
  settingsSheet.style.transition = "none";
}

function onSheetPointerMove(e) {
  if (!sheetDragging) return;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  sheetDragCurrent = Math.max(0, y - sheetDragStartY); // only drag down
  settingsSheet.style.transform = `translateY(${sheetDragCurrent}px)`;
  // Fade backdrop as user drags down
  const progress = Math.min(sheetDragCurrent / DISMISS_THRESHOLD, 1);
  settingsBackdrop.style.opacity = 1 - progress * 0.8;
}

function onSheetPointerUp() {
  if (!sheetDragging) return;
  sheetDragging = false;
  settingsSheet.style.transition = "";
  settingsBackdrop.style.opacity = "";
  if (sheetDragCurrent > DISMISS_THRESHOLD) {
    tryCloseSettings();
  } else {
    settingsSheet.style.transform = "";
  }
}

const sheetHandle = document.getElementById("settings-drag-handle");
const sheetHeader = document.getElementById("settings-header");
[sheetHandle, sheetHeader].forEach(el => {
  el.addEventListener("touchstart",  onSheetPointerDown, { passive: true });
  el.addEventListener("touchmove",   onSheetPointerMove, { passive: true });
  el.addEventListener("touchend",    onSheetPointerUp);
});

// ── Settings rows wiring ───────────────────────────────────────

function renderSettingsValues() {
  const s = window.appSettings;
  document.getElementById('st-period-type-sel').value  = s.periodType  || 'fixed';
  document.getElementById('st-budget-start-sel').value = s.budgetStart || 'period';
  document.getElementById('st-budget-style-sel').value = s.budgetStyle || 'fixed';
  document.getElementById('st-currency-sel').value     = s.currency    || 'GBP';
  document.getElementById('st-payday-input').value     = s.paydayDay   || 1;
  document.getElementById('st-payday-day-row').classList.toggle('b-hidden', s.periodType !== 'fixed');
  const toggle = document.getElementById('st-notif-toggle');
  toggle.classList.toggle('st-toggle--on', !!s.notifications);
  toggle.setAttribute('aria-checked', String(!!s.notifications));
}

function notifySettingsChanged() {
  window.dispatchEvent(new CustomEvent('appsettingschanged'));
}

function onSelectChange(id, key) {
  document.getElementById(id).addEventListener('change', e => {
    window.appSettings[key] = e.target.value;
    saveAppSettings(window.appSettings);
    if (key === 'periodType') renderSettingsValues();
  });
}

onSelectChange('st-period-type-sel',  'periodType');
onSelectChange('st-budget-start-sel', 'budgetStart');
onSelectChange('st-budget-style-sel', 'budgetStyle');
onSelectChange('st-currency-sel',     'currency');

document.getElementById('st-payday-input').addEventListener('change', e => {
  const v = Math.max(1, Math.min(28, parseInt(e.target.value, 10) || 1));
  e.target.value = v;
  window.appSettings.paydayDay = v;
  saveAppSettings(window.appSettings);
});

document.getElementById('st-notif-toggle').addEventListener('click', () => {
  const s = window.appSettings;
  s.notifications = !s.notifications;
  saveAppSettings(s);
  renderSettingsValues();
});

document.getElementById('st-save-btn').addEventListener('click', () => {
  notifySettingsChanged();
  closeSettings();
});



/* ── Service Worker registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
