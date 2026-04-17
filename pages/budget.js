/* ============================================================
   BUDGET TOOL — pages/budget.js
   v5: polished calendar, summary, categories, pie
   ============================================================ */

(function () {

  /* ── 1. BOOTSTRAP ─────────────────────────────────────────── */

  const container = document.getElementById('card-content-budget');
  if (!container) return;

  container.classList.remove('card-placeholder');
  container.closest('.card')?.classList.add('card--budget');


  /* ── 2. CONSTANTS ─────────────────────────────────────────── */

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const CATEGORIES = [
    { name: 'Food',      color: '#34C759' },
    { name: 'Transport', color: '#007AFF' },
    { name: 'Shopping',  color: '#FF9500' },
    { name: 'Social',    color: '#AF52DE' },
    { name: 'Bills',     color: '#FF6B6B' },
    { name: 'Health',    color: '#5AC8FA' },
    { name: 'Other',     color: '#8E8E93' },
  ];

  const STORAGE_KEY = 'budget_v1';


  /* ── 3. STATE ─────────────────────────────────────────────── */

  const DEFAULT_STATE = {
    settings: {
      disposableIncome: 0,
      periodMode:  'month',
      periodStart: '',
      periodEnd:   '',
      isSetup:     false,
    },
    transactions:      [],
    incomeAdjustments: [],
  };

  let state       = loadState();
  let computed    = {
    days: [], today: null, baseDailyBudget: 0,
    totalIncome: 0, totalSpent: 0, totalRemaining: 0,
    daysUnder: 0, daysOver: 0, daysOnTrack: 0,
    categoryTotals: {}, extraIncomeTotal: 0,
  };
  let editingId   = null;
  let lastAddedId = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const saved = JSON.parse(raw);
      return {
        settings:          Object.assign({}, DEFAULT_STATE.settings, saved.settings || {}),
        transactions:      Array.isArray(saved.transactions)      ? saved.transactions      : [],
        incomeAdjustments: Array.isArray(saved.incomeAdjustments) ? saved.incomeAdjustments : [],
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }


  /* ── 4. DATE UTILITIES ────────────────────────────────────── */

  function toISO(d) {
    return d.getFullYear()                            + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function todayISO() { return toISO(new Date()); }

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function shortDate(d) {
    return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  }

  const fmt    = n => '£'               + Math.abs(n).toFixed(2);
  const fmtSgn = n => (n >= 0 ? '+£' : '−£') + Math.abs(n).toFixed(2);
  const fmtBal = n => (n <  0 ? '−£' : '£')  + Math.abs(n).toFixed(2);

  function uuid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function catColor(name) {
    return (CATEGORIES.find(c => c.name === name) || {}).color || '#8E8E93';
  }


  /* ── 5. PERIOD INITIALISATION ─────────────────────────────── */

  function initPeriod() {
    const today = new Date();

    if (state.settings.periodMode === 'month') {
      const y = today.getFullYear(), m = today.getMonth();
      state.settings.periodStart = toISO(new Date(y, m, 1));
      state.settings.periodEnd   = toISO(new Date(y, m + 1, 0));
    } else {
      // Paycheck mode: budget period is always today → payday.
      // periodStart is always today; periodEnd is the saved payday.
      // The calendar module renders the full current month independently —
      // it never uses periodStart/periodEnd for its grid layout.
      state.settings.periodStart = todayISO();
      // periodEnd (payday) is kept as set by the user — don't overwrite it.
    }
  }


  /* ── 6. CARRY-OVER ENGINE ─────────────────────────────────── */
  /*
    computeAll() is the sole writer to `computed`.

    Day statuses:
      'today'      — the current calendar day
      'past-under' — completed day, spent ≤ available (green)
      'past-over'  — completed day, spent > available  (red)
      'future'     — not yet reached

    "On track" in the summary counts today separately — it means
    the current day is not yet over budget (carryOut ≥ 0).

    Income redistribution:
      Each incomeAdjustment spreads its amount equally across
      today + all future days. The effectiveDate guard ensures
      past days are never retroactively changed.
  */

  function computeAll() {
    const { periodStart, periodEnd, disposableIncome } = state.settings;
    const days      = buildDayList(periodStart, periodEnd);
    const totalDays = days.length;

    const base              = totalDays > 0 ? disposableIncome / totalDays : 0;
    computed.baseDailyBudget = base;

    const dailyBudgets  = days.map(() => base);
    const today         = todayISO();
    let   extraTotal    = 0;

    for (const adj of state.incomeAdjustments) {
      const effectiveDate = adj.date > today ? adj.date : today;
      const idx           = days.findIndex(d => d.date >= effectiveDate);
      if (idx === -1) continue;
      const perDay = adj.amount / (days.length - idx);
      for (let i = idx; i < days.length; i++) dailyBudgets[i] += perDay;
      extraTotal += adj.amount;
    }

    computed.extraIncomeTotal = extraTotal;
    computed.totalIncome      = disposableIncome + extraTotal;

    let carryIn = 0;

    for (let i = 0; i < days.length; i++) {
      const day        = days[i];
      day.baseBudget   = dailyBudgets[i];
      day.carryIn      = carryIn;
      day.available    = dailyBudgets[i] + carryIn;
      day.transactions = state.transactions.filter(t => t.date === day.date);
      day.spent        = day.transactions.reduce((s, t) => s + t.amount, 0);
      day.carryOut     = day.available - day.spent;

      if      (day.date === today) day.status = 'today';
      else if (day.date  < today)  day.status = day.carryOut >= 0 ? 'past-under' : 'past-over';
      else                         day.status = 'future';

      carryIn = day.carryOut;
    }

    computed.days   = days;
    computed.today  = days.find(d => d.status === 'today') || null;

    const active              = days.filter(d => d.status !== 'future');
    computed.totalSpent       = active.reduce((s, d) => s + d.spent, 0);
    computed.totalRemaining   = computed.totalIncome - computed.totalSpent;
    computed.daysUnder        = days.filter(d => d.status === 'past-under').length;
    computed.daysOver         = days.filter(d => d.status === 'past-over').length;
    // "On track" = today exists and hasn't gone over (carryOut ≥ 0)
    computed.daysOnTrack      = (computed.today && computed.today.carryOut >= 0) ? 1 : 0;

    computed.categoryTotals   = {};
    for (const t of state.transactions) {
      computed.categoryTotals[t.category] =
        (computed.categoryTotals[t.category] || 0) + t.amount;
    }
  }

  function buildDayList(start, end) {
    if (!start || !end) return [];
    const days = [];
    const cur  = parseISO(start);
    const last = parseISO(end);
    while (cur <= last) {
      days.push({
        date: toISO(cur), dayNum: cur.getDate(),
        baseBudget: 0, carryIn: 0, available: 0,
        spent: 0, carryOut: 0, transactions: [], status: 'future',
      });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }


  /* ── 7. SETUP PANEL HELPERS ───────────────────────────────── */

  function openSetup() {
    const panel   = document.getElementById('b-setup-panel');
    const toggle  = document.getElementById('b-setup-toggle');
    const endWrap = document.getElementById('b-enddate-wrap');
    if (!panel || !toggle) return;

    const incomeEl = document.getElementById('b-income');
    const modeEl   = document.getElementById('b-mode');
    const endEl    = document.getElementById('b-enddate');

    if (incomeEl) incomeEl.value = state.settings.disposableIncome || '';
    if (modeEl)   modeEl.value  = state.settings.periodMode       || 'month';
    if (endEl)    endEl.value   = state.settings.periodEnd        || '';
    endWrap?.classList.toggle('b-hidden', state.settings.periodMode !== 'paycheck');

    panel.classList.remove('b-hidden');
    toggle.textContent = 'Done';
    setTimeout(() => incomeEl?.focus(), 50);
  }

  function closeSetup() {
    document.getElementById('b-setup-panel')?.classList.add('b-hidden');
    const toggle = document.getElementById('b-setup-toggle');
    if (toggle) toggle.textContent = 'Edit';
  }


  /* ── 8. HTML SKELETON ─────────────────────────────────────── */

  function buildSkeleton() {
    const catOpts = CATEGORIES
      .map(c => `<option value="${c.name}">${c.name}</option>`)
      .join('');

    const wdays = ['M','T','W','T','F','S','S']
      .map(d => `<div class="b-cal-wday">${d}</div>`).join('');

    return `
<div class="b-root">

  <!-- A: Setup -->
  <div class="b-module b-area-setup">
    <div class="b-setup-bar">
      <span class="b-setup-text" id="b-setup-text">Loading…</span>
      <button class="b-btn-ghost" id="b-setup-toggle">Edit</button>
    </div>
    <div class="b-setup-panel b-hidden" id="b-setup-panel">
      <div class="b-two-col">
        <div class="b-field">
          <span class="b-field-lbl">Disposable Income</span>
          <input type="number" class="b-input" id="b-income"
                 min="0" step="0.01" placeholder="£0.00">
        </div>
        <div class="b-field">
          <span class="b-field-lbl">Period Mode</span>
          <select class="b-input" id="b-mode">
            <option value="month">Calendar Month</option>
            <option value="paycheck">Paycheck Cycle</option>
          </select>
        </div>
      </div>
      <div class="b-field b-hidden" id="b-enddate-wrap">
        <span class="b-field-lbl">Period End / Payday</span>
        <input type="date" class="b-input" id="b-enddate">
      </div>
      <div class="b-setup-actions">
        <button class="b-btn-primary" id="b-save-setup">Save Settings</button>
        <button class="b-btn-ghost"   id="b-cancel-setup">Cancel</button>
      </div>
    </div>
  </div>

  <!-- B: Stat pills -->
  <div class="b-stats-row b-area-stats" id="b-stats-row"></div>

  <!-- C: Add Income -->
  <div class="b-module b-area-income">
    <div class="b-income-header">
      <div class="b-label">Add Income</div>
      <div class="b-income-history" id="b-income-history"></div>
    </div>
    <div class="b-income-entry">
      <input type="number" class="b-input" id="b-extra-amt"
             min="0" step="0.01" placeholder="Extra amount (£)">
      <button class="b-btn-income" id="b-add-income">Add</button>
    </div>
    <p class="b-income-hint" id="b-income-hint"></p>
  </div>

  <!-- D: Spend entry -->
  <div class="b-module b-area-entry">
    <div class="b-label">Add Spending</div>
    <div class="b-entry-fields">
      <div class="b-field">
        <input type="number" class="b-input" id="b-amt"
               placeholder="£0.00" min="0" step="0.01">
      </div>
      <div class="b-field">
        <select class="b-input" id="b-cat">
          <option value="">Category</option>
          ${catOpts}
        </select>
      </div>
    </div>
    <div class="b-entry-note">
      <input type="text" class="b-input" id="b-note" placeholder="Note (optional)">
    </div>
    <button class="b-btn-add" id="b-btn-add">Add Spending</button>
  </div>

  <!-- E: Today's list -->
  <div class="b-module b-area-list">
    <div class="b-label" id="b-today-label">Today</div>
    <div class="b-txn-list" id="b-txn-list"></div>
  </div>

  <!-- F: Calendar -->
  <div class="b-module b-area-calendar">
    <div class="b-cal-title-row">
      <span class="b-label" id="b-cal-label">—</span>
      <div class="b-cal-legend" id="b-cal-legend"></div>
    </div>
    <div class="b-cal-header">${wdays}</div>
    <div class="b-cal-grid" id="b-cal-grid"></div>
  </div>

  <!-- G: Period summary -->
  <div class="b-module b-area-summary">
    <div class="b-label">Period Summary</div>
    <div class="b-sum-grid" id="b-sum-grid"></div>
  </div>

  <!-- H: Categories + pie -->
  <div class="b-module b-area-cats">
    <div class="b-label">Spending by Category</div>
    <div class="b-cats-layout">
      <div class="b-cat-list" id="b-cat-list"></div>
      <div class="b-pie-wrap" id="b-pie-wrap"></div>
    </div>
  </div>

</div>`;
  }


  /* ── 9. RENDER FUNCTIONS ──────────────────────────────────── */

  function render() {
    renderSetupBar();
    renderStats();
    renderTodayLabel();
    renderList();
    renderIncome();
    renderCalendar();
    renderSummary();
    renderCategories();
  }

  // ── Setup bar ────────────────────────────────────────────────

  function renderSetupBar() {
    const el = document.getElementById('b-setup-text');
    if (!el) return;

    if (!state.settings.isSetup) {
      el.textContent = 'Set up your budget to get started';
      return;
    }

    const { disposableIncome, periodMode, periodStart, periodEnd } = state.settings;
    const daysLeft = computed.days
      .filter(d => d.status === 'today' || d.status === 'future').length;

    const periodStr = periodMode === 'month'
      ? `${MONTH_NAMES[parseISO(periodStart).getMonth()]} ${parseISO(periodStart).getFullYear()}`
      : `${shortDate(parseISO(periodStart))} – ${shortDate(parseISO(periodEnd))}`;

    const incomeDisplay = computed.extraIncomeTotal > 0
      ? `${fmt(computed.totalIncome)} <span class="b-setup-extra">(+${fmt(computed.extraIncomeTotal)} added)</span>`
      : fmt(disposableIncome);

    el.innerHTML =
      `<strong>${incomeDisplay}</strong> · ${periodStr} · ` +
      `<strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</strong>`;
  }

  // ── Stat pills ───────────────────────────────────────────────

  function renderStats() {
    const el = document.getElementById('b-stats-row');
    if (!el) return;

    if (!state.settings.isSetup || !computed.today) {
      el.innerHTML = ["Today's Limit", 'Spent Today', 'Carried In', 'Remaining']
        .map(lbl => `<div class="b-stat">
          <span class="b-stat-val">—</span>
          <span class="b-stat-lbl">${lbl}</span></div>`).join('');
      return;
    }

    const t = computed.today;
    el.innerHTML = `
      <div class="b-stat">
        <span class="b-stat-val">${fmt(t.available)}</span>
        <span class="b-stat-lbl">Today's Limit</span>
      </div>
      <div class="b-stat">
        <span class="b-stat-val">${fmt(t.spent)}</span>
        <span class="b-stat-lbl">Spent Today</span>
      </div>
      <div class="b-stat ${t.carryIn >= 0 ? 'b-stat--pos' : 'b-stat--neg'}">
        <span class="b-stat-val">${fmtSgn(t.carryIn)}</span>
        <span class="b-stat-lbl">Carried In</span>
      </div>
      <div class="b-stat ${t.carryOut >= 0 ? 'b-stat--pos' : 'b-stat--neg'}">
        <span class="b-stat-val">${fmtBal(t.carryOut)}</span>
        <span class="b-stat-lbl">Remaining</span>
      </div>`;
  }

  // ── Add Income ────────────────────────────────────────────────

  function renderIncome() {
    const hintEl    = document.getElementById('b-income-hint');
    const historyEl = document.getElementById('b-income-history');
    if (!hintEl || !historyEl) return;

    if (!state.settings.isSetup || !computed.today) {
      hintEl.textContent = 'Set up your budget first.';
      historyEl.innerHTML = '';
      return;
    }

    const remaining = computed.days
      .filter(d => d.status === 'today' || d.status === 'future').length;

    hintEl.textContent = remaining > 0
      ? `Split equally across ${remaining} remaining day${remaining !== 1 ? 's' : ''} including today.`
      : 'No days remaining in this period.';

    const adj = state.incomeAdjustments;
    historyEl.innerHTML = adj.length
      ? adj.map(a =>
          `<span class="b-income-tag">+${fmt(a.amount)} · ${shortDate(parseISO(a.date))}</span>`
        ).join('')
      : '';
  }

  // ── Today label ──────────────────────────────────────────────

  function renderTodayLabel() {
    const el  = document.getElementById('b-today-label');
    if (!el) return;
    const now = new Date();
    el.textContent =
      `Today · ${DAY_SHORT[now.getDay()]} ${now.getDate()} ${MON_SHORT[now.getMonth()]}`;
  }

  // ── Transaction list ─────────────────────────────────────────

  function renderList() {
    const el = document.getElementById('b-txn-list');
    if (!el) return;

    const txns = computed.today ? computed.today.transactions : [];

    if (!txns.length) {
      el.innerHTML = '<div class="b-txn-empty">No spending logged today</div>';
      return;
    }

    const rows = txns.map(t =>
      t.id === editingId ? buildEditRow(t) : buildTxnRow(t)
    ).join('');

    const total  = txns.reduce((s, t) => s + t.amount, 0);
    const footer = `
<div class="b-txn-footer">
  <span class="b-txn-footer-lbl">Total today</span>
  <span class="b-txn-footer-val">${fmt(total)}</span>
</div>`;

    el.innerHTML = rows + footer;
  }

  function buildTxnRow(t) {
    const isNew = t.id === lastAddedId;
    return `
<div class="b-txn-row${isNew ? ' b-txn-row--new' : ''}" data-id="${t.id}">
  <div class="b-txn-dot" style="background:${catColor(t.category)}"></div>
  <div class="b-txn-info">
    <div class="b-txn-cat">${t.category}</div>
    ${t.note ? `<div class="b-txn-note">${t.note}</div>` : ''}
  </div>
  <span class="b-txn-amt">${fmt(t.amount)}</span>
  <div class="b-txn-actions">
    <button class="b-txn-btn b-txn-btn--edit" title="Edit">✎</button>
    <button class="b-txn-btn b-txn-btn--del"  title="Delete">✕</button>
  </div>
</div>`;
  }

  function buildEditRow(t) {
    const opts = CATEGORIES.map(c =>
      `<option value="${c.name}" ${c.name === t.category ? 'selected' : ''}>${c.name}</option>`
    ).join('');

    return `
<div class="b-txn-row b-txn-row--editing" data-id="${t.id}">
  <div class="b-txn-dot" style="background:${catColor(t.category)}"></div>
  <div class="b-txn-edit-fields">
    <div class="b-txn-edit-top">
      <input  type="number" class="b-input b-edit-amt"
              value="${t.amount}" min="0" step="0.01">
      <select class="b-input b-edit-cat">${opts}</select>
    </div>
    <input type="text" class="b-input b-edit-note"
           value="${t.note}" placeholder="Note (optional)">
  </div>
  <div class="b-txn-actions b-txn-actions--edit">
    <button class="b-txn-btn b-txn-save"   title="Save">✓</button>
    <button class="b-txn-btn b-txn-cancel" title="Cancel">✕</button>
  </div>
</div>`;
  }

  // ── Calendar ─────────────────────────────────────────────────
  /*
    Cell states visualised:
      today + carryOut ≥ 0  → b-cal-cell--today      (white ring, on track)
      today + carryOut < 0  → b-cal-cell--today b-cal-cell--today-over  (red tint ring)
      past, carryOut ≥ 0    → b-cal-cell--under       (green tint)
      past, carryOut < 0    → b-cal-cell--over         (red tint)
      future                → b-cal-cell--future       (dim)

    Spent amount shown below day number for all active + today cells.
    Available amount shown as a small hint on hover (desktop) for future cells.
  */

  function renderCalendar() {
    const gridEl   = document.getElementById('b-cal-grid');
    const labelEl  = document.getElementById('b-cal-label');
    const legendEl = document.getElementById('b-cal-legend');
    if (!gridEl || !labelEl) return;

    // The calendar ALWAYS shows the full current calendar month.
    // Budget data (colours, spent amounts) is overlaid per-day using
    // the computed.days lookup. This means paycheck mode and month mode
    // both produce the same full-month grid — only the coloured cells differ.
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = now.getMonth();
    const total = new Date(y, m + 1, 0).getDate();
    const today = todayISO();

    const { periodMode, periodEnd } = state.settings;
    const isSetup = state.settings.isSetup;

    // Label: always show the current month, with payday annotation if paycheck mode
    if (isSetup && periodMode === 'paycheck' && periodEnd) {
      const paydayDate = parseISO(periodEnd);
      labelEl.innerHTML =
        `${MONTH_NAMES[m]} ${y} <span class="b-cal-unset">· payday ${shortDate(paydayDate)}</span>`;
    } else if (isSetup) {
      labelEl.textContent = `${MONTH_NAMES[m]} ${y}`;
    } else {
      labelEl.innerHTML =
        `${MONTH_NAMES[m]} ${y} <span class="b-cal-unset">· set up to activate</span>`;
    }

    // Legend — only show once there's some past activity
    if (legendEl) {
      const hasActivity = computed.days.some(d => d.status === 'past-under' || d.status === 'past-over');
      legendEl.innerHTML = !isSetup ? '' : hasActivity ? `
        <span class="b-cal-leg b-cal-leg--under">Under</span>
        <span class="b-cal-leg b-cal-leg--over">Over</span>
        <span class="b-cal-leg b-cal-leg--today">Today</span>` : `
        <span class="b-cal-leg b-cal-leg--today">Today</span>`;
    }

    // Build a lookup map: ISO date → computed day object
    const dayMap = {};
    for (const d of computed.days) dayMap[d.date] = d;

    // Offset grid so day 1 lands on the correct weekday (Mon=0 … Sun=6)
    let dow = new Date(y, m, 1).getDay();
    dow = dow === 0 ? 6 : dow - 1;

    let html = '';
    for (let i = 0; i < dow; i++) {
      html += `<div class="b-cal-cell b-cal-cell--empty"></div>`;
    }

    for (let d = 1; d <= total; d++) {
      const iso      = toISO(new Date(y, m, d));
      const computed = dayMap[iso];   // undefined if outside budget period
      const isToday  = iso === today;
      const isPast   = iso  < today;

      let cls = 'b-cal-cell';

      if (computed) {
        // Day is inside the active budget period — apply status colour
        if (computed.status === 'today') {
          cls += computed.carryOut >= 0
            ? ' b-cal-cell--today'
            : ' b-cal-cell--today b-cal-cell--today-over';
        } else if (computed.status === 'past-over') {
          cls += ' b-cal-cell--over';
        } else if (computed.status === 'past-under') {
          cls += ' b-cal-cell--under';
        } else {
          cls += ' b-cal-cell--future';
        }
      } else if (isToday) {
        // Today but outside the budget period (shouldn't happen normally)
        cls += ' b-cal-cell--today';
      } else if (isPast) {
        cls += ' b-cal-cell--placeholder-past';
      } else {
        cls += ' b-cal-cell--placeholder';
      }

      const showSpent = computed && computed.status !== 'future' && computed.spent > 0;
      const spentEl   = showSpent
        ? `<span class="b-cal-ds">${fmtSpent(computed.spent)}</span>`
        : '';

      const titleAttr = computed ? `title="${calCellTitle(computed)}"` : '';

      html += `<div class="${cls}" ${titleAttr}>
        <span class="b-cal-dn">${d}</span>${spentEl}
      </div>`;
    }

    gridEl.innerHTML = html;
  }

  // Format spent amount to fit inside a tiny cell
  function fmtSpent(n) {
    if (n < 10)   return '£' + n.toFixed(1);
    if (n < 1000) return '£' + Math.round(n);
    return '£' + (n / 1000).toFixed(1) + 'k';
  }

  function calCellTitle(day) {
    if (day.status === 'future')
      return `${day.date} · Budget £${day.baseBudget.toFixed(2)}`;
    return `${day.date} · Spent £${day.spent.toFixed(2)} · Balance £${day.carryOut.toFixed(2)}`;
  }

  // ── Period summary ───────────────────────────────────────────
  /*
    Tiles shown:
      Total Income  (base + any extras)
      Total Spent
      Remaining     (coloured red if negative)
      Days Under    (green)
      Days Over     (red)
      On Track      (blue — today is ≥ 0 balance)
  */

  function renderSummary() {
    const el = document.getElementById('b-sum-grid');
    if (!el) return;

    const remainCls = computed.totalRemaining < 0 ? ' b-sum-val--neg' : '';

    const extraLine = computed.extraIncomeTotal > 0
      ? `<div class="b-sum-tile b-sum-tile--income">
           <div class="b-sum-val b-sum-val--income">+${fmt(computed.extraIncomeTotal)}</div>
           <div class="b-sum-lbl">Extra Added</div>
         </div>`
      : '';

    el.innerHTML = `
<div class="b-sum-tile">
  <div class="b-sum-val">${fmt(computed.totalIncome)}</div>
  <div class="b-sum-lbl">Total Income</div>
</div>
<div class="b-sum-tile">
  <div class="b-sum-val">${fmt(computed.totalSpent)}</div>
  <div class="b-sum-lbl">Total Spent</div>
</div>
<div class="b-sum-tile">
  <div class="b-sum-val${remainCls}">${fmtBal(computed.totalRemaining)}</div>
  <div class="b-sum-lbl">Remaining</div>
</div>
${extraLine}
<div class="b-sum-tile b-sum-tile--under">
  <div class="b-sum-val b-sum-val--under">${computed.daysUnder}</div>
  <div class="b-sum-lbl">Days Under</div>
</div>
<div class="b-sum-tile b-sum-tile--over">
  <div class="b-sum-val b-sum-val--over">${computed.daysOver}</div>
  <div class="b-sum-lbl">Days Over</div>
</div>
<div class="b-sum-tile b-sum-tile--track">
  <div class="b-sum-val b-sum-val--track">${computed.daysOnTrack ? '✓' : '—'}</div>
  <div class="b-sum-lbl">On Track</div>
</div>`;
  }

  // ── Categories + pie ─────────────────────────────────────────
  /*
    Each row shows: colour dot · name · bar (filled to % of total) · £amount · % label
    The SVG donut segments have a 2px gap between them via a slight
    angular padding so they read as distinct slices.
  */

  function renderCategories() {
    const listEl = document.getElementById('b-cat-list');
    const pieEl  = document.getElementById('b-pie-wrap');
    if (!listEl || !pieEl) return;

    const totals     = computed.categoryTotals;
    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    if (grandTotal === 0) {
      listEl.innerHTML =
        '<div class="b-txn-empty" style="text-align:left;padding:4px 0 0">No spending this period yet</div>';
      pieEl.innerHTML = buildEmptyPie();
      return;
    }

    const cats = CATEGORIES
      .map(c  => ({ ...c, amount: totals[c.name] || 0 }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    listEl.innerHTML = cats.map(c => {
      const pct    = c.amount / grandTotal * 100;
      const pctStr = pct < 1 ? '<1%' : Math.round(pct) + '%';
      return `
<div class="b-cat-row">
  <div class="b-cat-dot"   style="background:${c.color}"></div>
  <div class="b-cat-name">${c.name}</div>
  <div class="b-cat-track">
    <div class="b-cat-fill" style="width:${pct.toFixed(1)}%;background:${c.color}"></div>
  </div>
  <div class="b-cat-pct">${pctStr}</div>
  <div class="b-cat-amt">${fmt(c.amount)}</div>
</div>`;
    }).join('');

    pieEl.innerHTML = buildPie(cats, grandTotal);
  }

  // ── SVG donut pie ────────────────────────────────────────────
  /*
    Segments are drawn as filled SVG paths (arc + inner arc back).
    A small angular gap (GAP_RAD) is applied at both edges of each
    segment so slices read as clearly separate even on small screens.
  */

  function buildPie(cats, total) {
    const cx = 50, cy = 50, r = 40, ri = 25;
    const GAP_RAD = 0.04; // ~2° gap between segments in radians

    let angle = -Math.PI / 2;
    let paths = '';

    cats.forEach(c => {
      const sweep    = (c.amount / total) * 2 * Math.PI;
      const a0       = angle       + GAP_RAD;
      const a1       = angle + sweep - GAP_RAD;

      // Skip segments too small to draw cleanly
      if (a1 <= a0) { angle += sweep; return; }

      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const pt    = (a, rad) => [
        (cx + rad * Math.cos(a)).toFixed(3),
        (cy + rad * Math.sin(a)).toFixed(3),
      ];

      const [ox0,oy0] = pt(a0, r);
      const [ox1,oy1] = pt(a1, r);
      const [ix1,iy1] = pt(a1, ri);
      const [ix0,iy0] = pt(a0, ri);

      paths += `<path d="M${ox0} ${oy0} A${r} ${r} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${ri} ${ri} 0 ${large} 0 ${ix0} ${iy0}Z" fill="${c.color}"/>`;

      angle += sweep;
    });

    // Inner ring border
    paths += `<circle cx="50" cy="50" r="${ri}" fill="rgba(0,0,0,0.18)"/>`;
    paths += `<circle cx="50" cy="50" r="${ri}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>`;

    return `<svg viewBox="0 0 100 100" width="120" height="120" style="display:block;flex-shrink:0;overflow:visible">${paths}</svg>`;
  }

  function buildEmptyPie() {
    return `<svg viewBox="0 0 100 100" width="120" height="120" style="display:block">
      <circle cx="50" cy="50" r="40" fill="none"
        stroke="rgba(255,255,255,0.06)" stroke-width="15"/>
      <circle cx="50" cy="50" r="25" fill="rgba(0,0,0,0.18)"/>
    </svg>`;
  }


  /* ── 10. MUTATION FUNCTIONS ───────────────────────────────── */

  function saveSettings() {
    const incomeEl = document.getElementById('b-income');
    const modeEl   = document.getElementById('b-mode');
    const endEl    = document.getElementById('b-enddate');

    const income  = parseFloat(incomeEl?.value);
    const mode    = modeEl?.value || 'month';
    const endDate = endEl?.value  || '';

    if (isNaN(income) || income <= 0) { flashInput(incomeEl); return; }
    if (mode === 'paycheck' && !endDate) { flashInput(endEl); return; }

    state.settings.disposableIncome = income;
    state.settings.periodMode       = mode;
    if (mode === 'paycheck') state.settings.periodEnd = endDate;

    state.settings.isSetup = true;
    initPeriod();
    saveState();
    computeAll();
    render();
    closeSetup();
  }

  function addTransaction(amount, category, note) {
    if (!computed.today) {
      setAddButtonMessage('Outside period — update settings', 2200);
      return;
    }

    const t = {
      id: uuid(), date: todayISO(),
      amount: parseFloat(amount), category, note: note || '',
    };
    lastAddedId = t.id;
    state.transactions.push(t);
    saveState();
    computeAll();
    render();
    setTimeout(() => { lastAddedId = null; }, 600);
  }

  function editTransaction(id, amount, category, note) {
    const t = state.transactions.find(t => t.id === id);
    if (!t) return;
    t.amount   = parseFloat(amount);
    t.category = category;
    t.note     = note || '';
    editingId  = null;
    saveState();
    computeAll();
    render();
  }

  function deleteTransaction(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    if (editingId === id) editingId = null;
    saveState();
    computeAll();
    render();
  }

  function addIncome(amount) {
    if (!state.settings.isSetup) { openSetup(); return; }
    if (!computed.today) {
      flashAddIncome('Outside current period');
      return;
    }
    state.incomeAdjustments.push({
      id: uuid(), date: todayISO(), amount: parseFloat(amount),
    });
    saveState();
    computeAll();
    render();
  }

  function setAddButtonMessage(msg, duration) {
    const btn = document.getElementById('b-btn-add');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent   = msg;
    btn.style.opacity = '0.55';
    setTimeout(() => { btn.textContent = original; btn.style.opacity = ''; }, duration);
  }

  function flashAddIncome(msg) {
    const btn = document.getElementById('b-add-income');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent   = msg;
    btn.style.opacity = '0.55';
    setTimeout(() => { btn.textContent = original; btn.style.opacity = ''; }, 2000);
  }


  /* ── 11. EVENT WIRING ─────────────────────────────────────── */

  function wireAll() {

    document.getElementById('b-setup-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('b-setup-panel');
      panel?.classList.contains('b-hidden') ? openSetup() : closeSetup();
    });

    document.getElementById('b-cancel-setup')?.addEventListener('click', closeSetup);
    document.getElementById('b-save-setup')?.addEventListener('click', saveSettings);

    document.getElementById('b-mode')?.addEventListener('change', e =>
      document.getElementById('b-enddate-wrap')
        ?.classList.toggle('b-hidden', e.target.value !== 'paycheck')
    );

    // Add Income
    document.getElementById('b-add-income')?.addEventListener('click', () => {
      const el     = document.getElementById('b-extra-amt');
      const amount = parseFloat(el?.value);
      if (isNaN(amount) || amount <= 0) { flashInput(el); return; }
      addIncome(amount);
      el.value = '';
    });

    document.getElementById('b-extra-amt')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('b-add-income')?.click(); }
    });

    // Spend entry
    function submitSpend() {
      const amtEl  = document.getElementById('b-amt');
      const catEl  = document.getElementById('b-cat');
      const noteEl = document.getElementById('b-note');

      if (!state.settings.isSetup) { openSetup(); return; }

      const amount = parseFloat(amtEl?.value);
      if (isNaN(amount) || amount <= 0) { flashInput(amtEl); return; }
      if (!catEl?.value)                { flashInput(catEl); return; }

      addTransaction(amount, catEl.value, noteEl?.value || '');
      amtEl.value  = '';
      catEl.value  = '';
      noteEl.value = '';
      amtEl.focus();
    }

    document.getElementById('b-btn-add')?.addEventListener('click', submitSpend);

    ['b-amt', 'b-cat', 'b-note'].forEach(id =>
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitSpend(); }
      })
    );

    // Transaction list — delegated
    document.getElementById('b-txn-list')?.addEventListener('click', e => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      if (e.target.closest('.b-txn-btn--edit')) {
        editingId = id;
        renderList();
        row.querySelector?.('.b-edit-amt')?.focus();

      } else if (e.target.closest('.b-txn-btn--del')) {
        deleteTransaction(id);

      } else if (e.target.closest('.b-txn-save')) {
        const amtEl  = row.querySelector('.b-edit-amt');
        const catEl  = row.querySelector('.b-edit-cat');
        const noteEl = row.querySelector('.b-edit-note');
        const amount = parseFloat(amtEl?.value);
        if (isNaN(amount) || amount <= 0) { flashInput(amtEl); return; }
        editTransaction(id, amount, catEl?.value, noteEl?.value || '');

      } else if (e.target.closest('.b-txn-cancel')) {
        editingId = null;
        renderList();
      }
    });

    document.getElementById('b-txn-list')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('.b-txn-row--editing');
      if (!row) return;
      e.preventDefault();
      row.querySelector('.b-txn-save')?.click();
    });

    // ── Drag-to-scroll on the card content area ───────────────────
    // Gives smooth pointer-drag scrolling (mouse or touch) without
    // any visible scrollbar. Momentum coasts after release.
    wireScrollDrag(container);
  }

  function wireScrollDrag(el) {
    let dragging    = false;
    let pointerId   = null;
    let startY      = 0;
    let startScroll = 0;
    let lastY       = 0;
    let lastT       = 0;
    let velY        = 0;
    let momentumId  = null;
    // Minimum pixels moved before we treat it as a drag (vs. a tap/click)
    const DRAG_THRESHOLD = 4;
    let moved = false;

    function cancelMomentum() {
      if (momentumId) { cancelAnimationFrame(momentumId); momentumId = null; }
    }

    function stopDrag(kick) {
      if (!dragging) return;
      dragging   = false;
      pointerId  = null;
      moved      = false;
      el.style.cursor = '';

      if (!kick) return;
      // Momentum: exponential-decay coast after release
      if (Math.abs(velY) > 0.05) {
        let v = -velY * 14;
        const decay = 0.91;
        const step = () => {
          el.scrollTop += v;
          v *= decay;
          if (Math.abs(v) > 0.4) momentumId = requestAnimationFrame(step);
          else momentumId = null;
        };
        momentumId = requestAnimationFrame(step);
      }
    }

    el.addEventListener('pointerdown', e => {
      if (!e.isPrimary) return;
      // Skip interactive elements — let them receive their own events
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;

      cancelMomentum();
      dragging    = true;
      moved       = false;
      pointerId   = e.pointerId;
      startY      = e.clientY;
      startScroll = el.scrollTop;
      lastY       = e.clientY;
      lastT       = e.timeStamp;
      velY        = 0;

      // Don't preventDefault here — let the browser handle text selection etc.
      // setPointerCapture ensures move/up fire even when cursor leaves the element.
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });

    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;

      const dy = e.clientY - startY;

      // Only commit to drag mode after threshold — preserves click intent
      if (!moved && Math.abs(dy) < DRAG_THRESHOLD) return;
      moved = true;

      const dt = e.timeStamp - lastT;
      if (dt > 0) velY = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;

      el.scrollTop = startScroll - dy;
      // Only suppress default once we've confirmed it's a drag
      e.preventDefault();
    }, { passive: false });

    // pointerup: normal release
    el.addEventListener('pointerup', e => {
      if (e.pointerId !== pointerId) return;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      stopDrag(moved); // only kick momentum if we actually dragged
    });

    // pointercancel: browser interrupted (e.g. scroll took over)
    el.addEventListener('pointercancel', e => {
      if (e.pointerId !== pointerId) return;
      stopDrag(false);
    });

    // lostpointercapture: fires when capture is released for ANY reason,
    // including mouse-up outside the browser window — the sticky-click fix.
    el.addEventListener('lostpointercapture', e => {
      if (e.pointerId !== pointerId) return;
      stopDrag(moved);
    });
  }

  function flashInput(el) {
    if (!el) return;
    el.style.borderColor = 'rgba(255,59,48,0.65)';
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; }, 900);
  }


  /* ── 12. BOOT ─────────────────────────────────────────────── */

  if (state.settings.isSetup && state.settings.periodMode === 'month') {
    initPeriod();
    saveState();
  }

  computeAll();
  container.innerHTML = buildSkeleton();
  render();
  wireAll();

  if (!state.settings.isSetup) openSetup();

})();
