/* ============================================================
   BILLS TOOL — pages/bills.js
   Monthly bill tracker with dates, amounts, auto-grey, totals
   ============================================================ */

(function () {

  /* ── 1. BOOTSTRAP ─────────────────────────────────────────── */

  const container = document.getElementById('card-content-bills');
  if (!container) return;

  container.classList.remove('card-placeholder');
  container.closest('.card')?.classList.add('card--bills');


  /* ── 2. STATE ─────────────────────────────────────────────── */

  const STORAGE_KEY = 'bills_v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { bills: [] };
    } catch { return { bills: [] }; }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let editingId = null;


  /* ── 3. HELPERS ───────────────────────────────────────────── */

  function uuid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function fmt(n) {
    if (n === 0) return '—';
    return '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Sort bills by next due date in the current pay cycle.
  // Upcoming bills come first (ascending day from today), past bills at the bottom.
  function sortedBills() {
    const today = new Date().getDate();
    const P = getPaydayOfMonth();

    // Cycle position: days run from P, P+1, ..., 28/29/30/31, 1, 2, ..., P-1
    function cyclePos(day) {
      return day >= P ? day - P : day + (32 - P);
    }

    return [...state.bills].sort((a, b) => {
      const aPos = cyclePos(a.day);
      const bPos = cyclePos(b.day);
      const todayPos = cyclePos(today);
      // Upcoming = cycle position strictly after today's position
      const aUpcoming = aPos > todayPos;
      const bUpcoming = bPos > todayPos;
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
      return aPos - bPos;
    });
  }

  function flashInput(el) {
    if (!el) return;
    el.style.outline = '2px solid #FF4F40';
    setTimeout(() => el.style.outline = '', 800);
  }

  function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
  }

  /*
    Read the payday day-of-month from the budget tool's saved state.
    Returns a number 1–31, defaulting to 1 if not configured or month mode.
  */
  function getPaydayOfMonth() {
    try {
      const raw = localStorage.getItem('budget_v1');
      if (!raw) return 1;
      const budget = JSON.parse(raw);
      const { periodMode, payday, periodEnd } = budget.settings || {};
      if (periodMode !== 'paycheck') return 1;
      // payday is stored as ISO date string e.g. "2026-04-30"
      const dateStr = payday || periodEnd;
      if (!dateStr) return 1;
      return new Date(dateStr + 'T12:00:00').getDate();
    } catch { return 1; }
  }

  /*
    Determine if a bill is "past" in the current pay cycle.

    The pay cycle starts on paydayOfMonth (P) each month.
    Bills are ordered by their day within that cycle:
      - Bills with day >= P: they fall in the first part of the cycle (same calendar month as payday)
      - Bills with day < P:  they fall in the second part (next calendar month after payday)

    Today's position in the cycle:
      - If today >= P: we're in the first part — bills with day >= P and day <= today are past
      - If today < P:  we're in the second part (post-payday of prev month) — bills with day >= P
                       from last month are past, AND bills with day < P and day <= today are past

    Simplified: a bill is past if today has reached or passed its day within the current cycle.
    "Current cycle" means: since the most recent payday.

    Most recent payday = this month's day P if today >= P, else last month's day P.

    A bill on day D is past if the bill's date in the current cycle <= today.
      - If today >= P: bill cycle date is this month's D. Past if D <= today AND D >= P.
                       Also, bills from D < P already fired this cycle (last month), so also past.
      - If today < P:  we're mid-cycle (after last month's payday). Bills from last cycle's
                       first half (D >= P, fired last month) are past. Bills in the second half
                       with D < P are past if D <= today.
  */
  function isPast(bill) {
    const today = new Date().getDate();
    const P = getPaydayOfMonth();
    const D = bill.day;

    if (today >= P) {
      // We're in the first half of the cycle (on or after payday this month).
      // Bills due >= P and <= today are past. Bills due < P fired last cycle — also past.
      return D <= today;
    } else {
      // We're in the second half (after last month's payday, before this month's).
      // Bills due >= P fired last month — past.
      // Bills due < P and <= today — past.
      return D >= P || D <= today;
    }
  }


  /* ── 4. SKELETON ──────────────────────────────────────────── */

  container.innerHTML = `
<div class="b-root bl-root">

  <!-- Header module: add bill bar -->
  <div class="b-module bl-area-add">
    <div class="b-setup-bar">
      <span class="b-setup-text" style="color:#fff;font-weight:700">Add Bill</span>
      <button class="b-btn-ghost" id="bl-add-toggle">Add</button>
    </div>
    <div class="b-setup-panel b-hidden" id="bl-add-panel">
      <div class="b-entry-fields">
        <div class="b-field">
          <input type="text" class="b-input" id="bl-name" placeholder="Bill name">
        </div>
        <div class="b-field">
          <input type="number" class="b-input" id="bl-amt" placeholder="£0.00" min="0" step="0.01">
        </div>
      </div>
      <div class="b-entry-note">
        <input type="number" class="b-input" id="bl-day" placeholder="Day of month (1–31)" min="1" max="31">
      </div>
      <button class="b-btn-add" id="bl-btn-save">Add Bill</button>
    </div>
  </div>

  <!-- Bill list -->
  <div class="b-module bl-area-list" id="bl-list-module">
    <div class="b-label">Bills this month</div>
    <div id="bl-list"></div>
  </div>

  <!-- Totals: 3 bare stat tiles, no wrapper module -->
  <div class="bl-area-totals" id="bl-totals"></div>

</div>`;


  /* ── 5. RENDER ────────────────────────────────────────────── */

  function render() {
    renderList();
    renderTotals();
  }

  function renderList() {
    const el = document.getElementById('bl-list');
    if (!el) return;

    const bills = sortedBills();
    if (!bills.length) {
      el.innerHTML = '<div class="b-txn-empty">No bills added yet</div>';
      return;
    }

    el.innerHTML = bills.map(b =>
      b.id === editingId ? buildEditRow(b) : buildRow(b)
    ).join('');
  }

  function buildRow(b) {
    const past     = isPast(b);
    const dayLabel = ordinal(b.day);
    const dueLabel = !past ? `Due · ${dayLabel}` : dayLabel;
    return `
<div class="bl-row${past ? ' bl-row--past' : ''}" data-id="${b.id}">
  <div class="bl-info">
    <div class="bl-name${past ? ' bl-name--past' : ''}">${b.name}</div>
    <div class="bl-day${!past ? ' bl-day--due' : ''}">${dueLabel}</div>
  </div>
  <span class="bl-amt${past ? ' bl-amt--past' : ''}">${fmt(b.amount)}</span>
  <button class="bl-edit-btn" data-action="edit" aria-label="Edit">›</button>
</div>`;
  }

  function buildEditRow(b) {
    return `
<div class="bl-row bl-row--editing" data-id="${b.id}">
  <div class="b-txn-edit-fields" style="width:100%">
    <div class="b-txn-edit-top">
      <input type="text"   class="b-input bl-edit-name" value="${b.name}" placeholder="Bill name">
      <input type="number" class="b-input bl-edit-amt"  value="${b.amount}" min="0" step="0.01">
    </div>
    <input type="number" class="b-input bl-edit-day" value="${b.day}" min="1" max="31" placeholder="Day of month">
    <div class="b-txn-edit-actions">
      <button class="b-txn-save" data-action="save">Save</button>
      <button class="b-txn-cancel" data-action="cancel">Cancel</button>
    </div>
    <button class="b-txn-delete" data-action="delete">Delete</button>
  </div>
</div>`;
  }

  function renderTotals() {
    const el = document.getElementById('bl-totals');
    if (!el) return;

    const bills     = sortedBills();
    const total     = bills.reduce((s, b) => s + b.amount, 0);
    const paid      = bills.filter(b => isPast(b)).reduce((s, b) => s + b.amount, 0);
    const remaining = total - paid;

    el.innerHTML = `
<div class="bl-totals-grid">
  <div class="b-stat">
    <span class="b-stat-val">${fmt(total)}</span>
    <span class="b-stat-lbl">Total<br>Bills</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(paid)}</span>
    <span class="b-stat-lbl">Gone<br>Out</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(remaining)}</span>
    <span class="b-stat-lbl">Still<br>To Come</span>
  </div>
</div>`;
  }


  /* ── 6. ACTIONS ───────────────────────────────────────────── */

  function openAdd() {
    document.getElementById('bl-add-panel')?.classList.remove('b-hidden');
    document.getElementById('bl-add-toggle').textContent = 'Cancel';
    setTimeout(() => document.getElementById('bl-name')?.focus(), 50);
  }

  function closeAdd() {
    document.getElementById('bl-add-panel')?.classList.add('b-hidden');
    document.getElementById('bl-add-toggle').textContent = 'Add';
    ['bl-name','bl-amt','bl-day'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function saveBill() {
    const nameEl = document.getElementById('bl-name');
    const amtEl  = document.getElementById('bl-amt');
    const dayEl  = document.getElementById('bl-day');

    const name   = nameEl?.value.trim();
    const amount = parseFloat(amtEl?.value);
    const day    = parseInt(dayEl?.value);

    if (!name)                           { flashInput(nameEl); return; }
    if (isNaN(amount) || amount <= 0)    { flashInput(amtEl);  return; }
    if (isNaN(day) || day < 1 || day > 31) { flashInput(dayEl); return; }

    state.bills.push({ id: uuid(), name, amount, day });
    saveState();
    closeAdd();
    render();
  }

  function editBill(id) {
    editingId = id;
    renderList();
    document.querySelector(`[data-id="${id}"] .bl-edit-name`)?.focus();
  }

  function saveEdit(id) {
    const row    = document.querySelector(`[data-id="${id}"]`);
    const nameEl = row?.querySelector('.bl-edit-name');
    const amtEl  = row?.querySelector('.bl-edit-amt');
    const dayEl  = row?.querySelector('.bl-edit-day');

    const name   = nameEl?.value.trim();
    const amount = parseFloat(amtEl?.value);
    const day    = parseInt(dayEl?.value);

    if (!name)                             { flashInput(nameEl); return; }
    if (isNaN(amount) || amount <= 0)      { flashInput(amtEl);  return; }
    if (isNaN(day) || day < 1 || day > 31) { flashInput(dayEl); return; }

    const b = state.bills.find(b => b.id === id);
    if (!b) return;
    b.name = name; b.amount = amount; b.day = day;
    editingId = null;
    saveState();
    render();
  }

  function deleteBill(id) {
    state.bills = state.bills.filter(b => b.id !== id);
    if (editingId === id) editingId = null;
    saveState();
    render();
  }


  /* ── 7. WIRE ──────────────────────────────────────────────── */

  document.getElementById('bl-add-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('bl-add-panel');
    panel?.classList.contains('b-hidden') ? openAdd() : closeAdd();
  });

  document.getElementById('bl-btn-save')?.addEventListener('click', saveBill);

  ['bl-name','bl-amt','bl-day'].forEach(id =>
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveBill(); }
    })
  );

  // Delegated clicks on bill list
  document.getElementById('bl-list')?.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id     = row.dataset.id;
    const action = e.target.closest('[data-action]')?.dataset.action;

    if (action === 'edit')   editBill(id);
    else if (action === 'save')   saveEdit(id);
    else if (action === 'cancel') { editingId = null; renderList(); }
    else if (action === 'delete') deleteBill(id);
  });


  /* ── 8. BOOT ──────────────────────────────────────────────── */

  render();

})();
