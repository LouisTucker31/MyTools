/* ============================================================
   BUDGET TOOL — pages/budget.js
   v6: period history, calendar navigation, auto-rollover
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
    /*
      periodHistory: array of completed-period snapshots, oldest first.
      Each entry: { periodStart, periodEnd, disposableIncome, incomeAdjustments[] }
      Written on rollover. Never mutated after writing.
    */
    periodHistory: [],
  };

  let state = loadState();

  // Current-period computed (always for the live period)
  let computed = {
    days: [], today: null, baseDailyBudget: 0,
    totalIncome: 0, totalSpent: 0, totalRemaining: 0,
    daysUnder: 0, daysOver: 0, daysOnTrack: 0,
    categoryTotals: {}, extraIncomeTotal: 0,
  };

  let editingId   = null;
  let lastAddedId = null;
  let listViewDate = todayISO(); // which day the transaction list is showing

  // Calendar view state — which month/year the calendar is showing
  const nowForView = new Date();
  let calViewYear  = nowForView.getFullYear();
  let calViewMonth = nowForView.getMonth(); // 0-based

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const saved = JSON.parse(raw);
      return {
        settings:       Object.assign({}, DEFAULT_STATE.settings, saved.settings || {}),
        transactions:   Array.isArray(saved.transactions)      ? saved.transactions      : [],
        incomeAdjustments: Array.isArray(saved.incomeAdjustments) ? saved.incomeAdjustments : [],
        periodHistory:  Array.isArray(saved.periodHistory)     ? saved.periodHistory     : [],
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // Migration: if paycheck mode and no payday stored, the periodEnd IS the
  // raw payday — subtract one day to make it the last day of the period.
  function migrateState() {
    const s = state.settings;
    if (s.periodMode === 'paycheck' && s.periodEnd && !s.payday) {
      s.payday    = s.periodEnd;
      const d     = parseISO(s.periodEnd);
      d.setDate(d.getDate() - 1);
      s.periodEnd = toISO(d);
      saveState();
    }
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

  function shortDate(d, offsetDays = 0) {
    if (offsetDays) { d = new Date(d); d.setDate(d.getDate() + offsetDays); }
    return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  }

  const fmt    = n => '£'               + Math.abs(n).toFixed(2);
  const fmtSgn = n => (n > 0 ? '+£' : n < 0 ? '−£' : '£') + Math.abs(n).toFixed(2);
  const fmtBal = n => (n <  0 ? '−£' : '£')  + Math.abs(n).toFixed(2);

  function uuid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function catColor(name) {
    return (CATEGORIES.find(c => c.name === name) || {}).color || '#8E8E93';
  }

  // Is the calendar view showing the current live month?
  function isViewingCurrentMonth() {
    const now = new Date();
    return calViewYear === now.getFullYear() && calViewMonth === now.getMonth();
  }


  /* ── 5. PERIOD ROLLOVER ───────────────────────────────────── */
  /*
    checkRollover() runs on boot. If the saved period has ended
    (today > periodEnd), it:
      1. Archives the completed period into periodHistory (preserved for reference)
      2. Advances period dates for the new period (no balance carried over)
      3. Marks isSetup=false and stores pendingRollover so the user is
         prompted to confirm their new disposable income before the period
         becomes active. pendingRollover.prevIncome enables "use previous amount".
  */

  function checkRollover() {
    if (!state.settings.isSetup) return;
    const today = todayISO();
    const { periodEnd, periodMode } = state.settings;
    if (!periodEnd || today <= periodEnd) return;

    // Archive the completed period — kept for history/reference, never mutated
    state.periodHistory.push({
      periodStart:       state.settings.periodStart,
      periodEnd:         state.settings.periodEnd,
      disposableIncome:  state.settings.disposableIncome,
      incomeAdjustments: state.incomeAdjustments.slice(),
    });

    // Clear income adjustments — they belong to the archived period only
    state.incomeAdjustments = [];

    // Advance period dates — new period starts fresh with no carry-over
    initPeriod();

    // Require the user to confirm income for the new period
    state.settings.isSetup         = false;
    state.settings.pendingRollover = { prevIncome: state.settings.disposableIncome };
    state.settings.disposableIncome = 0;

    saveState();
  }

  function initPeriod() {
    const today = new Date();
    if (state.settings.periodMode === 'month') {
      const y = today.getFullYear(), m = today.getMonth();
      state.settings.periodStart = toISO(new Date(y, m, 1));
      state.settings.periodEnd   = toISO(new Date(y, m + 1, 0));
    } else {
      state.settings.periodStart = todayISO();
      // periodEnd (payday) kept as set by the user
    }
  }


  /* ── 6. CARRY-OVER ENGINE ─────────────────────────────────── */

  function computeAll() {
    const { periodStart, periodEnd, disposableIncome } = state.settings;
    const days      = buildDayList(periodStart, periodEnd);
    const totalDays = days.length;

    const base               = totalDays > 0 ? disposableIncome / totalDays : 0;
    computed.baseDailyBudget = base;

    const dailyBudgets = days.map(() => base);
    const today        = todayISO();
    let   extraTotal   = 0;

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

    computed.days  = days;
    computed.today = days.find(d => d.status === 'today') || null;

    const active            = days.filter(d => d.status !== 'future');
    computed.totalSpent     = active.reduce((s, d) => s + d.spent, 0);
    computed.totalRemaining = computed.totalIncome - computed.totalSpent;
    computed.daysUnder      = days.filter(d => d.status === 'past-under').length;
    computed.daysOver       = days.filter(d => d.status === 'past-over').length;
    const todayOver         = (computed.today && computed.today.carryOut < 0) ? 1 : 0;
    const todayUnder        = (computed.today && computed.today.carryOut >= 0) ? 1 : 0;
    computed.daysOver      += todayOver;
    computed.daysOnTrack    = computed.daysUnder + todayUnder;

    computed.categoryTotals = {};
    for (const t of state.transactions) {
      computed.categoryTotals[t.category] =
        (computed.categoryTotals[t.category] || 0) + t.amount;
    }
  }

  /*
    computeForMonth(y, m) — re-runs the carry-over engine for an
    arbitrary calendar month, using the matching period snapshot if
    available, or current settings if it's the live month.
    Returns the same shape as `computed` but scoped to that month.
  */
  function computeForMonth(y, m) {
    const monthStart = toISO(new Date(y, m, 1));
    const monthEnd   = toISO(new Date(y, m + 1, 0));

    // Find the matching period snapshot (periodStart falls in same month)
    const snapshot = state.periodHistory.find(h => {
      const s = parseISO(h.periodStart);
      return s.getFullYear() === y && s.getMonth() === m;
    });

    const income = snapshot ? snapshot.disposableIncome : state.settings.disposableIncome;
    const adjs   = snapshot ? snapshot.incomeAdjustments : state.incomeAdjustments;

    // Use the snapshot's actual period bounds if available, else full month
    const start = snapshot ? snapshot.periodStart : monthStart;
    const end   = snapshot ? snapshot.periodEnd   : monthEnd;

    const days      = buildDayList(start, end);
    const totalDays = days.length;
    if (totalDays === 0) return { days: [], categoryTotals: {} };

    const base         = income / totalDays;
    const dailyBudgets = days.map(() => base);
    const today        = todayISO();
    let   extraTotal   = 0;

    for (const adj of adjs) {
      const effectiveDate = adj.date > today ? adj.date : today;
      const idx           = days.findIndex(d => d.date >= effectiveDate);
      if (idx === -1) continue;
      const perDay = adj.amount / (days.length - idx);
      for (let i = idx; i < days.length; i++) dailyBudgets[i] += perDay;
      extraTotal += adj.amount;
    }

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

    const cats = {};
    for (const d of days) {
      for (const t of d.transactions) {
        cats[t.category] = (cats[t.category] || 0) + t.amount;
      }
    }

    const totalSpent   = days.filter(d => d.status !== 'future').reduce((s, d) => s + d.spent, 0);
    const totalIncome  = income + extraTotal;

    return {
      days, categoryTotals: cats,
      totalIncome, totalSpent,
      totalRemaining: totalIncome - totalSpent,
      daysUnder:  days.filter(d => d.status === 'past-under').length,
      daysOver:   days.filter(d => d.status === 'past-over').length,
      extraIncomeTotal: extraTotal,
      income,
    };
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
    if (endEl)    endEl.value   = state.settings.payday || state.settings.periodEnd || '';
    endWrap?.classList.toggle('b-hidden', state.settings.periodMode !== 'paycheck');

    panel.classList.remove('b-hidden');
    toggle.textContent = 'Done';
    setTimeout(() => incomeEl?.focus(), 50);
  }

  function openEntry() {
    document.getElementById('b-entry-panel')?.classList.remove('b-hidden');
    const toggle = document.getElementById('b-entry-toggle');
    if (toggle) toggle.textContent = 'Cancel';

    // Set date field: default today, min = period start, max = today
    const dateEl = document.getElementById('b-txn-date');
    if (dateEl) {
      const today = todayISO();
      dateEl.value = today;
      dateEl.max   = today;
      dateEl.min   = state.settings.periodStart || today;
    }

    setTimeout(() => document.getElementById('b-amt')?.focus(), 50);
  }

  function closeEntry() {
    document.getElementById('b-entry-panel')?.classList.add('b-hidden');
    const toggle = document.getElementById('b-entry-toggle');
    if (toggle) toggle.textContent = 'Add';
  }

  function closeSetup() {
    document.getElementById('b-setup-panel')?.classList.add('b-hidden');
    const toggle = document.getElementById('b-setup-toggle');
    if (toggle) toggle.textContent = state.settings.isSetup ? 'Edit' : 'Set Up';
    document.getElementById('b-income-panel')?.classList.add('b-hidden');
    const incToggle = document.getElementById('b-income-toggle');
    if (incToggle) incToggle.textContent = '+ Add Income';
  }


  function openRollover() {
    const panel   = document.getElementById('b-rollover-panel');
    const prevAmt = document.getElementById('b-rollover-prev-amt');
    const input   = document.getElementById('b-rollover-income');
    if (!panel) return;
    const prev = state.settings.pendingRollover?.prevIncome || 0;
    if (prevAmt) prevAmt.textContent = prev.toFixed(2);
    if (input)   input.value = '';
    panel.classList.remove('b-hidden');
    setTimeout(() => input?.focus(), 50);
  }

  function closeRollover() {
    document.getElementById('b-rollover-panel')?.classList.add('b-hidden');
  }

  function saveRollover(income) {
    if (isNaN(income) || income <= 0) {
      flashInput(document.getElementById('b-rollover-income'));
      return;
    }
    state.settings.disposableIncome  = income;
    state.settings.isSetup           = true;
    state.settings.pendingRollover   = null;
    saveState();
    computeAll();
    closeRollover();
    render();
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

    <!-- Rollover prompt — shown instead of full setup when a period just ended -->
    <div class="b-setup-panel b-hidden" id="b-rollover-panel">
      <div class="b-field">
        <span class="b-field-lbl">New Period Income</span>
        <input type="number" class="b-input" id="b-rollover-income"
               min="0" step="0.01" placeholder="£0.00">
      </div>
      <div class="b-setup-actions">
        <button class="b-btn-primary" id="b-rollover-save">Start New Period</button>
        <button class="b-btn-ghost"   id="b-rollover-prev">Use £<span id="b-rollover-prev-amt"></span></button>
      </div>
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
        <span class="b-field-lbl">Payday</span>
        <input type="date" class="b-input" id="b-enddate">
      </div>
      <div class="b-setup-actions">
        <button class="b-btn-primary" id="b-save-setup">Save Settings</button>
        <button class="b-btn-ghost"   id="b-cancel-setup">Cancel</button>
      </div>
      <div class="b-income-section">
        <button class="b-btn-ghost b-income-toggle" id="b-income-toggle">+ Add Income</button>
        <div class="b-income-panel b-hidden" id="b-income-panel">
          <div class="b-income-history" id="b-income-history"></div>
          <div class="b-income-entry">
            <input type="number" class="b-input" id="b-extra-amt"
                   min="0" step="0.01" placeholder="Extra amount (£)">
            <button class="b-btn-income" id="b-add-income">Add</button>
          </div>
          <p class="b-income-hint" id="b-income-hint"></p>
        </div>
      </div>
    </div>
  </div>

  <!-- B: Stat pills -->
  <div class="b-stats-row b-area-stats" id="b-stats-row"></div>

  <!-- D: Spend entry -->
  <div class="b-module b-area-entry">
    <div class="b-setup-bar">
      <span class="b-setup-text">Add Spending</span>
      <button class="b-btn-ghost" id="b-entry-toggle">Add</button>
    </div>
    <div class="b-setup-panel b-hidden" id="b-entry-panel">
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
      <div class="b-entry-note">
        <input type="date" class="b-input" id="b-txn-date">
      </div>
      <button class="b-btn-add" id="b-btn-add">Add Spending</button>
    </div>
  </div>

  <!-- E: Today's list -->
  <div class="b-module b-area-list">
    <div class="b-list-header">
      <span class="b-label" id="b-today-label">Today</span>
      <div class="b-cal-nav">
        <button class="b-cal-nav-btn" id="b-list-prev">‹</button>
        <button class="b-cal-nav-btn" id="b-list-next">›</button>
      </div>
    </div>
    <div class="b-txn-list" id="b-txn-list"></div>
  </div>

  <!-- F: Calendar -->
  <div class="b-module b-area-calendar">
    <div class="b-cal-title-row">
      <span class="b-label" id="b-cal-label">—</span>
      <div class="b-cal-nav">
        <button class="b-cal-nav-btn" id="b-cal-prev">‹</button>
        <button class="b-cal-nav-btn" id="b-cal-next">›</button>
      </div>
    </div>
    <div class="b-cal-header">${wdays}</div>
    <div class="b-cal-grid" id="b-cal-grid"></div>
  </div>

  <!-- G: Period summary -->
  <div class="b-module b-area-summary">
    <div class="b-label" id="b-sum-label">Period Summary</div>
    <div class="b-sum-grid" id="b-sum-grid"></div>
  </div>

  <!-- H: Categories + pie -->
  <div class="b-module b-area-cats">
    <div class="b-label" id="b-cats-label">Spending by Category</div>
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
    renderSummaryAndCats();
  }

  // ── Setup bar ────────────────────────────────────────────────

  function renderSetupBar() {
    const el = document.getElementById('b-setup-text');
    if (!el) return;

    if (!state.settings.isSetup) {
      el.innerHTML = '<strong style="color:#fff;font-weight:700">Set up your budget</strong>';
      // Always ensure panel is closed — never auto-open on load
      document.getElementById('b-setup-panel')?.classList.add('b-hidden');
      const toggle = document.getElementById('b-setup-toggle');
      if (toggle) toggle.textContent = 'Set Up';
      return;
    }

    const { disposableIncome, periodMode, periodStart, periodEnd } = state.settings;
    const daysLeft = computed.days
      .filter(d => d.status === 'today' || d.status === 'future').length;

    const periodStr = periodMode === 'month'
      ? `${MONTH_NAMES[parseISO(periodStart).getMonth()]} ${parseISO(periodStart).getFullYear()}`
      : `${shortDate(parseISO(periodStart))} – ${shortDate(parseISO(periodEnd))}`;

    const remainingDisplay = computed.totalRemaining < 0
      ? `<span style="color:#FF4F40">−£${Math.abs(computed.totalRemaining).toFixed(2)}</span>`
      : `£${computed.totalRemaining.toFixed(2)}`;

    el.innerHTML =
      `<strong>${remainingDisplay}</strong> · ${periodStr}<br>` +
      `<strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</strong>`;
  }

  // ── Stat pills ───────────────────────────────────────────────

  function renderStats() {
    const el = document.getElementById('b-stats-row');
    if (!el) return;

    if (!state.settings.isSetup || !computed.today) {
      el.innerHTML = ["Daily Limit", 'Remaining', 'Carried Over', 'Spent Today']
        .map(lbl => `<div class="b-stat">
          <span class="b-stat-val">—</span>
          <span class="b-stat-lbl">${lbl}</span></div>`).join('');
      return;
    }

    const t = computed.today;
    el.innerHTML = `
      <div class="b-stat">
        <span class="b-stat-val">${fmt(t.available)}</span>
        <span class="b-stat-lbl">Daily Limit</span>
      </div>
      <div class="b-stat">
        <span class="b-stat-val">${fmt(t.spent)}</span>
        <span class="b-stat-lbl">Spent Today</span>
      </div>
      <div class="b-stat ${t.carryIn > 0 ? 'b-stat--pos-outline' : t.carryIn < 0 ? 'b-stat--neg-outline' : ''}">
        <span class="b-stat-val" style="color:${t.carryIn > 0 ? '#34C759' : t.carryIn < 0 ? '#FF4F40' : ''}">${fmtSgn(t.carryIn)}</span>
        <span class="b-stat-lbl">Carried Over</span>
      </div>
      <div class="b-stat ${t.carryOut > 0 ? 'b-stat--pos-outline' : t.carryOut < 0 ? 'b-stat--neg-outline' : ''}">
        <span class="b-stat-val" style="color:${t.carryOut > 0 ? '#34C759' : t.carryOut < 0 ? '#FF4F40' : ''}">${fmtBal(t.carryOut)}</span>
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
    const el = document.getElementById('b-today-label');
    if (!el) return;
    const now = new Date();
    el.textContent =
      `Today · ${DAY_SHORT[now.getDay()]} ${now.getDate()} ${MON_SHORT[now.getMonth()]}`;
  }

  // ── Transaction list ─────────────────────────────────────────

  function renderList() {
    const el      = document.getElementById('b-txn-list');
    const labelEl = document.getElementById('b-today-label');
    const prevBtn = document.getElementById('b-list-prev');
    const nextBtn = document.getElementById('b-list-next');
    if (!el) return;

    // Ensure listViewDate stays within the current period
    const periodDays = computed.days;
    if (periodDays.length) {
      const first = periodDays[0].date;
      const last  = periodDays[periodDays.length - 1].date;
      if (listViewDate < first) listViewDate = first;
      if (listViewDate > last)  listViewDate = last;
    }

    const today   = todayISO();
    const isToday = listViewDate === today;
    const viewDay = periodDays.find(d => d.date === listViewDate);
    const txns    = viewDay ? viewDay.transactions : [];

    // Update label
    if (labelEl) {
      if (isToday) {
        labelEl.textContent = `Today · ${shortDate(parseISO(listViewDate))}`;
      } else {
        const d = parseISO(listViewDate);
        labelEl.textContent = `${DAY_SHORT[d.getDay()]} ${shortDate(d)}`;
      }
    }

    // Grey out nav arrows at period bounds — always visible, never hidden
    const atFirst = listViewDate <= (periodDays[0]?.date || listViewDate);
    const lastPast = [...periodDays].reverse().find(d => d.date <= today);
    const atLast  = listViewDate >= (lastPast?.date || listViewDate);
    if (prevBtn) { prevBtn.disabled = atFirst; prevBtn.style.opacity = atFirst ? '0.3' : ''; }
    if (nextBtn) { nextBtn.disabled = atLast;  nextBtn.style.opacity = atLast  ? '0.3' : ''; }

    if (!txns.length) {
      el.innerHTML = `<div class="b-txn-empty">${isToday ? 'No spending logged today' : 'No spending this day'}</div>`;
      const existingFooter = document.getElementById('b-txn-footer');
      if (existingFooter) existingFooter.innerHTML = '';
      return;
    }

    const rows = txns.map(t =>
      t.id === editingId ? buildEditRow(t) : buildTxnRow(t)
    ).join('');

    const total  = txns.reduce((s, t) => s + t.amount, 0);
    const lbl    = isToday ? 'Total today' : 'Total this day';

    el.innerHTML = rows;

    let footerEl = document.getElementById('b-txn-footer');
    if (!footerEl) {
      footerEl = document.createElement('div');
      footerEl.id = 'b-txn-footer';
      el.closest('.b-area-list')?.appendChild(footerEl);
    }
    footerEl.innerHTML = `
<div class="b-txn-footer">
  <span class="b-txn-footer-lbl">${lbl}</span>
  <span class="b-txn-footer-val">${fmt(total)}</span>
</div>`;
  }

  function buildTxnRow(t) {
    const isNew = t.id === lastAddedId;
    return `
<div class="b-txn-row${isNew ? ' b-txn-row--new' : ''}" data-id="${t.id}" role="button">
  <div class="b-txn-dot" style="background:${catColor(t.category)}"></div>
  <div class="b-txn-info">
    <div class="b-txn-cat">${t.category}</div>
    ${t.note ? `<div class="b-txn-note">${t.note}</div>` : ''}
  </div>
  <span class="b-txn-amt">${fmt(t.amount)}</span>
  <span class="b-txn-chevron">›</span>
</div>`;
  }

  function buildEditRow(t) {
    const opts   = CATEGORIES.map(c =>
      `<option value="${c.name}" ${c.name === t.category ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    const today  = todayISO();
    const pStart = state.settings.periodStart || today;

    return `
<div class="b-txn-row b-txn-row--editing" data-id="${t.id}">
  <div class="b-txn-edit-fields">
    <div class="b-txn-edit-top">
      <input  type="number" class="b-input b-edit-amt"
              value="${t.amount}" min="0" step="0.01">
      <select class="b-input b-edit-cat">${opts}</select>
    </div>
    <input type="text" class="b-input b-edit-note"
           value="${t.note}" placeholder="Note (optional)">
    <input type="date" class="b-input b-edit-date"
           value="${t.date}" min="${pStart}" max="${today}">
    <div class="b-txn-edit-actions">
      <button class="b-txn-save">Save</button>
      <button class="b-txn-cancel">Cancel</button>
    </div>
    <button class="b-txn-delete">Delete</button>
  </div>
</div>`;
  }

  // ── Calendar ─────────────────────────────────────────────────

  function renderCalendar() {
    const gridEl   = document.getElementById('b-cal-grid');
    const labelEl  = document.getElementById('b-cal-label');
    const prevBtn = document.getElementById('b-cal-prev');
    const nextBtn = document.getElementById('b-cal-next');
    if (!gridEl || !labelEl) return;

    const y     = calViewYear;
    const m     = calViewMonth;
    const total = new Date(y, m + 1, 0).getDate();
    const today = todayISO();
    const isCurrent = isViewingCurrentMonth();

    // Grey out arrows at bounds
    if (prevBtn) { prevBtn.disabled = false; prevBtn.style.opacity = ''; }
    if (nextBtn) { nextBtn.disabled = isCurrent; nextBtn.style.opacity = isCurrent ? '0.3' : ''; }

    // Get computed data for the viewed month
    const viewData = isCurrent ? computed : computeForMonth(y, m);
    const dayMap   = {};
    for (const d of viewData.days) dayMap[d.date] = d;

    const isSetup = state.settings.isSetup;
    const { periodMode, periodEnd } = state.settings;

    // Label
    if (!isSetup) {
      labelEl.innerHTML =
        `${MONTH_NAMES[m]} ${y} <span class="b-cal-unset">· set up to activate</span>`;
    } else if (isCurrent && periodMode === 'paycheck' && periodEnd) {
      labelEl.innerHTML =
        `${MONTH_NAMES[m]} ${y} <span class="b-cal-unset">· payday ${shortDate(parseISO(state.settings.payday || periodEnd))}</span>`;
    } else {
      labelEl.textContent = `${MONTH_NAMES[m]} ${y}`;
    }

    // Legend
    // Grid offset — Mon=0 … Sun=6
    let dow = new Date(y, m, 1).getDay();
    dow = dow === 0 ? 6 : dow - 1;

    let html = '';
    for (let i = 0; i < dow; i++) {
      html += `<div class="b-cal-cell b-cal-cell--empty"></div>`;
    }

    for (let d = 1; d <= total; d++) {
      const iso     = toISO(new Date(y, m, d));
      const dayData = dayMap[iso];
      const isToday = iso === today;
      const isPast  = iso  < today;

      let cls = 'b-cal-cell';

      if (dayData) {
        if (dayData.status === 'today') {
          cls += dayData.carryOut >= 0
            ? ' b-cal-cell--today'
            : ' b-cal-cell--today b-cal-cell--today-over';
        } else if (dayData.status === 'past-over') {
          cls += ' b-cal-cell--over';
        } else if (dayData.status === 'past-under') {
          cls += ' b-cal-cell--under';
        } else {
          cls += ' b-cal-cell--future';
        }
      } else if (isToday) {
        cls += ' b-cal-cell--today';
      } else if (isPast) {
        cls += ' b-cal-cell--placeholder-past';
      } else {
        cls += ' b-cal-cell--placeholder';
      }

      const showSpent = dayData && dayData.status !== 'future' && dayData.spent > 0;
      const spentEl   = showSpent
        ? `<span class="b-cal-ds">${fmtSpent(dayData.spent)}</span>`
        : '';

      const titleAttr = dayData ? `title="${calCellTitle(dayData)}"` : '';

      html += `<div class="${cls}" ${titleAttr}>
        <span class="b-cal-dn">${d}</span>${spentEl}
      </div>`;
    }

    gridEl.innerHTML = html;
  }

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

  // ── Summary + Categories (context-aware) ─────────────────────
  /*
    When viewing a past month, the summary and category breakdown
    reflect that month's data from its period snapshot.
    When viewing the current month, uses live computed data.
  */

  function renderSummaryAndCats() {
    const isCurrent = isViewingCurrentMonth();
    const viewData  = isCurrent ? computed : computeForMonth(calViewYear, calViewMonth);
    renderSummary(viewData, isCurrent);
    renderCategories(viewData, isCurrent);
  }

  function renderSummary(data, isCurrent) {
    const el       = document.getElementById('b-sum-grid');
    const labelEl  = document.getElementById('b-sum-label');
    if (!el) return;

    if (labelEl) {
      labelEl.textContent = isCurrent
        ? 'Period Summary'
        : `${MONTH_NAMES[calViewMonth]} ${calViewYear} Summary`;
    }

    if (!state.settings.isSetup) {
      el.style.display = 'block';
      el.innerHTML = '<div class="b-txn-empty">Set up your budget to see summary</div>';
      return;
    }

    el.style.display = '';
    const remainCls = data.totalRemaining < 0 ? ' b-sum-val--neg' : '';

    const extraLine = data.extraIncomeTotal > 0
      ? `<div class="b-sum-tile b-sum-tile--income">
           <div class="b-sum-val b-sum-val--income">+${fmt(data.extraIncomeTotal)}</div>
           <div class="b-sum-lbl">Extra Added</div>
         </div>`
      : '';

    el.innerHTML = `
<div class="b-sum-tile">
  <div class="b-sum-val">${fmt(data.totalIncome)}</div>
  <div class="b-sum-lbl">Total<br>Income</div>
</div>
<div class="b-sum-tile">
  <div class="b-sum-val">${fmt(data.totalSpent)}</div>
  <div class="b-sum-lbl">Total<br>Spent</div>
</div>
<div class="b-sum-tile">
  <div class="b-sum-val${remainCls}">${fmtBal(data.totalRemaining)}</div>
  <div class="b-sum-lbl">Remaining<br>Budget</div>
</div>
${extraLine}
<div class="b-sum-tile b-sum-tile--under">
  <div class="b-sum-val b-sum-val--under">${data.daysUnder}</div>
  <div class="b-sum-lbl">Days<br>Under</div>
</div>
<div class="b-sum-tile b-sum-tile--over">
  <div class="b-sum-val b-sum-val--over">${data.daysOver}</div>
  <div class="b-sum-lbl">Days<br>Over</div>
</div>
<div class="b-sum-tile b-sum-tile--track">
  <div class="b-sum-val b-sum-val--track">${isCurrent ? computed.daysOnTrack : data.daysUnder}</div>
  <div class="b-sum-lbl">Days On<br>Track</div>
</div>`;
  }

  function renderCategories(data, isCurrent) {
    const listEl   = document.getElementById('b-cat-list');
    const pieEl    = document.getElementById('b-pie-wrap');
    const labelEl  = document.getElementById('b-cats-label');
    if (!listEl || !pieEl) return;

    if (labelEl) {
      labelEl.textContent = isCurrent
        ? 'Spending by Category'
        : `${MONTH_NAMES[calViewMonth]} Spending`;
    }

    const totals     = data.categoryTotals || {};
    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    if (grandTotal === 0) {
      listEl.innerHTML =
        '<div class="b-txn-empty">No spending this period yet</div>';
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

  function buildPie(cats, total) {
    const cx = 50, cy = 50, r = 40, ri = 25;
    const GAP_RAD = 0.04;

    let angle = -Math.PI / 2;
    let paths = '';

    cats.forEach(c => {
      const sweep = (c.amount / total) * 2 * Math.PI;
      const a0    = angle       + GAP_RAD;
      const a1    = angle + sweep - GAP_RAD;
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
    if (mode === 'paycheck') {
      state.settings.payday    = endDate; // the actual payday date (display only)
      const d = parseISO(endDate);
      d.setDate(d.getDate() - 1);
      state.settings.periodEnd = toISO(d); // day before payday = last day of period
    }

    state.settings.isSetup = true;
    initPeriod();
    saveState();
    computeAll();
    render();
    closeSetup();
  }

  function addTransaction(amount, category, note, date) {
    const today  = todayISO();
    const pStart = state.settings.periodStart || today;
    const pEnd   = state.settings.periodEnd   || today;

    // Clamp date to within the active period and no later than today
    const txnDate = (date && date >= pStart && date <= pEnd && date <= today)
      ? date : today;

    if (!computed.days.find(d => d.date === txnDate)) {
      setAddButtonMessage('Outside period — update settings', 2200);
      return;
    }

    const t = { id: uuid(), date: txnDate, amount: parseFloat(amount), category, note: note || '' };
    lastAddedId = t.id;
    state.transactions.push(t);
    saveState();
    computeAll();
    // Navigate the list view to show the date the transaction was added to
    listViewDate = txnDate;
    render();
    setTimeout(() => { lastAddedId = null; }, 600);
  }

  function editTransaction(id, amount, category, note, date) {
    const t = state.transactions.find(t => t.id === id);
    if (!t) return;
    const today  = todayISO();
    const pStart = state.settings.periodStart || today;
    const pEnd   = state.settings.periodEnd   || today;
    t.amount   = parseFloat(amount);
    t.category = category;
    t.note     = note || '';
    // Only update date if valid within the active period and not future
    if (date && date >= pStart && date <= pEnd && date <= today) t.date = date;
    editingId  = null;
    saveState();
    computeAll();
    listViewDate = t.date;
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

    // Transaction list day navigation
    document.getElementById('b-list-prev')?.addEventListener('click', () => {
      const idx = computed.days.findIndex(d => d.date === listViewDate);
      if (idx > 0) { listViewDate = computed.days[idx - 1].date; renderList(); }
    });
    document.getElementById('b-list-next')?.addEventListener('click', () => {
      const today = todayISO();
      const idx   = computed.days.findIndex(d => d.date === listViewDate);
      if (idx !== -1 && idx < computed.days.length - 1 && computed.days[idx + 1].date <= today) {
        listViewDate = computed.days[idx + 1].date;
        renderList();
      }
    });

    document.getElementById('b-setup-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('b-setup-panel');
      panel?.classList.contains('b-hidden') ? openSetup() : closeSetup();
    });

    document.getElementById('b-cancel-setup')?.addEventListener('click', closeSetup);
    document.getElementById('b-save-setup')?.addEventListener('click', saveSettings);

    // Rollover prompt
    document.getElementById('b-rollover-save')?.addEventListener('click', () => {
      const income = parseFloat(document.getElementById('b-rollover-income')?.value);
      saveRollover(income);
    });
    document.getElementById('b-rollover-income')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('b-rollover-save')?.click(); }
    });
    document.getElementById('b-rollover-prev')?.addEventListener('click', () => {
      saveRollover(state.settings.pendingRollover?.prevIncome || 0);
    });

    document.getElementById('b-mode')?.addEventListener('change', e =>
      document.getElementById('b-enddate-wrap')
        ?.classList.toggle('b-hidden', e.target.value !== 'paycheck')
    );

    // Add Income toggle
    document.getElementById('b-income-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('b-income-panel');
      const btn   = document.getElementById('b-income-toggle');
      const hidden = panel?.classList.toggle('b-hidden');
      if (btn) btn.textContent = hidden ? '+ Add Income' : '− Add Income';
    });

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

    document.getElementById('b-entry-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('b-entry-panel');
      panel?.classList.contains('b-hidden') ? openEntry() : closeEntry();
    });

    // Spend entry
    function submitSpend() {
      const amtEl    = document.getElementById('b-amt');
      const catEl    = document.getElementById('b-cat');
      const noteEl   = document.getElementById('b-note');
      const dateEl   = document.getElementById('b-txn-date');

      if (!state.settings.isSetup) { openSetup(); return; }

      const amount = parseFloat(amtEl?.value);
      if (isNaN(amount) || amount <= 0) { flashInput(amtEl); return; }
      if (!catEl?.value)                { flashInput(catEl); return; }

      addTransaction(amount, catEl.value, noteEl?.value || '', dateEl?.value || '');
      amtEl.value  = '';
      catEl.value  = '';
      if (noteEl) noteEl.value = '';
      closeEntry();
    }

    document.getElementById('b-btn-add')?.addEventListener('click', submitSpend);

    ['b-amt', 'b-cat', 'b-note', 'b-txn-date'].forEach(id =>
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitSpend(); }
      })
    );

    // Transaction list — delegated
    document.getElementById('b-txn-list')?.addEventListener('click', e => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const id = row.dataset.id;

      if (e.target.closest('.b-txn-save')) {
        const amtEl  = row.querySelector('.b-edit-amt');
        const catEl  = row.querySelector('.b-edit-cat');
        const noteEl = row.querySelector('.b-edit-note');
        const dateEl = row.querySelector('.b-edit-date');
        const amount = parseFloat(amtEl?.value);
        if (isNaN(amount) || amount <= 0) { flashInput(amtEl); return; }
        editTransaction(id, amount, catEl?.value, noteEl?.value || '', dateEl?.value || '');

      } else if (e.target.closest('.b-txn-cancel')) {
        editingId = null;
        renderList();

      } else if (e.target.closest('.b-txn-delete')) {
        deleteTransaction(id);

      } else if (!row.classList.contains('b-txn-row--editing')) {
        editingId = id;
        renderList();
        document.querySelector(`[data-id="${id}"] .b-edit-amt`)?.focus();
      }
    });

    document.getElementById('b-txn-list')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('.b-txn-row--editing');
      if (!row) return;
      e.preventDefault();
      row.querySelector('.b-txn-save')?.click();
    });

    // Calendar navigation
    document.getElementById('b-cal-prev')?.addEventListener('click', () => {
      calViewMonth--;
      if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
      renderCalendar();
      renderSummaryAndCats();
    });

    document.getElementById('b-cal-next')?.addEventListener('click', () => {
      calViewMonth++;
      if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
      renderCalendar();
      renderSummaryAndCats();
    });


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
      if (!e.isPrimary || e.pointerType === 'mouse') return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;

      cancelMomentum();
      // Track intent but don't capture yet — only capture once threshold is crossed
      dragging    = true;
      moved       = false;
      pointerId   = e.pointerId;
      startY      = e.clientY;
      startScroll = el.scrollTop;
      lastY       = e.clientY;
      lastT       = e.timeStamp;
      velY        = 0;
    });

    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;

      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < DRAG_THRESHOLD) return;

      // First time we cross the threshold — capture the pointer
      if (!moved) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
      moved = true;

      const dt = e.timeStamp - lastT;
      if (dt > 0) velY = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;

      el.scrollTop = startScroll - dy;
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('pointerup', e => {
      if (e.pointerId !== pointerId) return;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      stopDrag(moved);
    });

    el.addEventListener('pointercancel', e => {
      if (e.pointerId !== pointerId) return;
      stopDrag(false);
    });

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

  // Auto-rollover: if the saved period has ended, snapshot it and advance
  checkRollover();

  // For month mode, always sync periodStart/End to current month
  if (state.settings.isSetup && state.settings.periodMode === 'month') {
    initPeriod();
    saveState();
  }

  migrateState();
  computeAll();
  container.innerHTML = buildSkeleton();
  render();
  wireAll();

  if (state.settings.pendingRollover) {
    openRollover();
  }

})();
