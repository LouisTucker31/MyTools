/* ============================================================
   SAVINGS TOOL — pages/savings.js
   Track savings pots and investments with goal projections
   ============================================================ */

(function () {

  /* ── 1. BOOTSTRAP ─────────────────────────────────────────── */

  const container = document.getElementById('card-content-savings');
  if (!container) return;

  container.classList.remove('card-placeholder');
  container.closest('.card')?.classList.add('card--savings');


  /* ── 2. STATE ─────────────────────────────────────────────── */

  const STORAGE_KEY = 'savings_v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { pots: [] };
    } catch { return { pots: [] }; }
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
    return '£' + parseFloat(Math.abs(n)).toFixed(2);
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
    Project how many months until goal is reached.
    Returns a formatted string like "~14 months" or "Goal reached" or "No goal set".
  */
  function projectGoal(pot) {
    if (!pot.goal || pot.goal <= 0) return null;
    if (pot.current >= pot.goal) return 'Goal reached';
    const monthly = pot.monthly || 0;
    const rate    = (pot.rate || 0) / 100 / 12; // monthly interest rate
    const gap     = pot.goal - pot.current;

    if (monthly <= 0 && rate <= 0) return null;

    let months = 0;
    let balance = pot.current;
    // Simulate month by month (cap at 600 months / 50 years)
    while (balance < pot.goal && months < 600) {
      balance += balance * rate + monthly;
      months++;
    }
    if (months >= 600) return null;

    if (months < 12) return `~${months} month${months !== 1 ? 's' : ''}`;
    const yrs = Math.floor(months / 12);
    const mth = months % 12;
    return mth === 0
      ? `~${yrs} yr${yrs !== 1 ? 's' : ''}`
      : `~${yrs}yr ${mth}mo`;
  }


  /* ── 4. SKELETON ──────────────────────────────────────────── */

  container.innerHTML = `
<div class="b-root sv-root">

  <!-- Add savings bar -->
  <div class="b-module sv-area-add">
    <div class="b-setup-bar">
      <span class="b-setup-text" style="color:#fff;font-weight:700">Add Savings</span>
      <button class="b-btn-ghost" id="sv-add-toggle">Add</button>
    </div>
    <div class="b-setup-panel b-hidden" id="sv-add-panel">
      <div class="b-two-col">
        <div class="b-field">
          <input type="text" class="b-input" id="sv-name" placeholder="Name (e.g. Holiday Fund)">
        </div>
        <div class="b-field">
          <select class="b-input" id="sv-type">
            <option value="savings">Savings</option>
            <option value="investment">Investment</option>
          </select>
        </div>
      </div>
      <div class="b-two-col">
        <div class="b-field">
          <input type="number" class="b-input" id="sv-current" placeholder="Current value (£)" min="0" step="0.01">
        </div>
        <div class="b-field">
          <input type="number" class="b-input" id="sv-goal" placeholder="Goal value (£)" min="0" step="0.01">
        </div>
      </div>
      <div class="b-two-col">
        <div class="b-field">
          <input type="number" class="b-input" id="sv-monthly" placeholder="Monthly payment (£)" min="0" step="0.01">
        </div>
        <div class="b-field">
          <input type="number" class="b-input" id="sv-day" placeholder="Payment date (1–31)" min="1" max="31">
        </div>
      </div>
      <div class="b-field">
        <input type="number" class="b-input" id="sv-rate" placeholder="Interest rate (% per year, optional)" min="0" step="0.01">
      </div>
      <button class="b-btn-add" id="sv-btn-save">Add</button>
    </div>
  </div>

  <!-- Savings list -->
  <div class="b-module sv-area-savings" id="sv-savings-module">
    <div class="b-label">My Savings</div>
    <div id="sv-savings-list"></div>
  </div>

  <!-- Investments list -->
  <div class="b-module sv-area-invest" id="sv-invest-module">
    <div class="b-label">My Investments</div>
    <div id="sv-invest-list"></div>
  </div>

  <!-- Totals -->
  <div class="sv-area-totals" id="sv-totals"></div>

</div>`;


  /* ── 5. RENDER ────────────────────────────────────────────── */

  function render() {
    renderSavingsList();
    renderInvestList();
    renderTotals();
  }

  function renderSavingsList() {
    const el = document.getElementById('sv-savings-list');
    if (!el) return;
    const pots = state.pots.filter(p => p.type !== 'investment');
    el.innerHTML = pots.length
      ? pots.map(p => p.id === editingId ? buildEditRow(p) : buildRow(p)).join('')
      : '<div class="b-txn-empty">No savings added yet</div>';
  }

  function renderInvestList() {
    const el = document.getElementById('sv-invest-list');
    if (!el) return;
    const pots = state.pots.filter(p => p.type === 'investment');
    el.innerHTML = pots.length
      ? pots.map(p => p.id === editingId ? buildEditRow(p) : buildRow(p)).join('')
      : '<div class="b-txn-empty">No investments added yet</div>';
  }

  function buildRow(p) {
    const projection = projectGoal(p);
    const isInvest   = p.type === 'investment';
    const tagClass   = isInvest ? 'sv-tag--invest' : 'sv-tag--savings';
    const tagLabel   = isInvest ? 'Investment' : 'Savings';
    const progress   = p.goal > 0 ? Math.min(100, (p.current / p.goal) * 100) : 0;

    return `
<div class="sv-row" data-id="${p.id}">
  <div class="sv-row-main">
    <div class="sv-row-top">
      <span class="sv-name">${p.name}</span>
      <span class="sv-tag ${tagClass}">${tagLabel}</span>
    </div>
    <div class="sv-row-vals">
      <span class="sv-current">${fmt(p.current)}</span>
      ${p.goal > 0 ? `<span class="sv-goal">of ${fmt(p.goal)}</span>` : ''}
    </div>
    ${p.goal > 0 ? `
    <div class="sv-progress-track">
      <div class="sv-progress-fill ${isInvest ? 'sv-progress-fill--invest' : ''}" style="width:${progress}%"></div>
    </div>` : ''}
    <div class="sv-row-meta">
      ${p.monthly > 0 ? `<span class="sv-meta-item">£${parseFloat(p.monthly).toFixed(2)}/mo${p.day ? ` · ${ordinal(p.day)}` : ''}</span>` : ''}
      ${p.rate > 0 ? `<span class="sv-meta-item">${parseFloat(p.rate).toFixed(2)}% p.a.</span>` : ''}
      ${projection ? `<span class="sv-meta-item sv-meta-goal">${projection}</span>` : ''}
    </div>
  </div>
  <button class="bl-edit-btn" data-action="edit" aria-label="Edit">›</button>
</div>`;
  }

  function buildEditRow(p) {
    return `
<div class="sv-row sv-row--editing" data-id="${p.id}">
  <div class="b-txn-edit-fields" style="width:100%">
    <div class="b-two-col">
      <input type="text"   class="b-input" placeholder="Name" value="${p.name}" data-field="name">
      <select class="b-input" data-field="type">
        <option value="savings"    ${p.type === 'savings'    ? 'selected' : ''}>Savings</option>
        <option value="investment" ${p.type === 'investment' ? 'selected' : ''}>Investment</option>
      </select>
    </div>
    <div class="b-two-col">
      <input type="number" class="b-input" placeholder="Current (£)"  value="${p.current}" min="0" step="0.01" data-field="current">
      <input type="number" class="b-input" placeholder="Goal (£)"     value="${p.goal || ''}" min="0" step="0.01" data-field="goal">
    </div>
    <div class="b-two-col">
      <input type="number" class="b-input" placeholder="Monthly (£)"  value="${p.monthly || ''}" min="0" step="0.01" data-field="monthly">
      <input type="number" class="b-input" placeholder="Payment date" value="${p.day || ''}" min="1" max="31" data-field="day">
    </div>
    <input type="number" class="b-input" placeholder="Interest rate (% p.a.)" value="${p.rate || ''}" min="0" step="0.01" data-field="rate">
    <div class="b-txn-edit-actions">
      <button class="b-txn-save" data-action="save">Save</button>
      <button class="b-txn-cancel" data-action="cancel">Cancel</button>
    </div>
    <button class="b-txn-delete" data-action="delete">Delete</button>
  </div>
</div>`;
  }

  function renderTotals() {
    const el = document.getElementById('sv-totals');
    if (!el) return;

    const savings   = state.pots.filter(p => p.type !== 'investment');
    const invest    = state.pots.filter(p => p.type === 'investment');
    const totalSav  = savings.reduce((s, p) => s + p.current, 0);
    const totalInv  = invest.reduce((s, p) => s + p.current, 0);
    const totalAll  = totalSav + totalInv;

    el.innerHTML = `
<div class="sv-totals-grid">
  <div class="b-stat">
    <span class="b-stat-val">${fmt(totalAll)}</span>
    <span class="b-stat-lbl">Total<br>Wealth</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(totalSav)}</span>
    <span class="b-stat-lbl">Total<br>Savings</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(totalInv)}</span>
    <span class="b-stat-lbl">Total<br>Investments</span>
  </div>
</div>`;
  }


  /* ── 6. ACTIONS ───────────────────────────────────────────── */

  function openAdd() {
    document.getElementById('sv-add-panel')?.classList.remove('b-hidden');
    document.getElementById('sv-add-toggle').textContent = 'Cancel';
    setTimeout(() => document.getElementById('sv-name')?.focus(), 50);
  }

  function closeAdd() {
    document.getElementById('sv-add-panel')?.classList.add('b-hidden');
    document.getElementById('sv-add-toggle').textContent = 'Add';
    ['sv-name','sv-current','sv-goal','sv-monthly','sv-day','sv-rate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const typeEl = document.getElementById('sv-type');
    if (typeEl) typeEl.value = 'savings';
  }

  function savePot() {
    const nameEl    = document.getElementById('sv-name');
    const typeEl    = document.getElementById('sv-type');
    const currentEl = document.getElementById('sv-current');
    const goalEl    = document.getElementById('sv-goal');
    const monthlyEl = document.getElementById('sv-monthly');
    const dayEl     = document.getElementById('sv-day');
    const rateEl    = document.getElementById('sv-rate');

    const name    = nameEl?.value.trim();
    const type    = typeEl?.value || 'savings';
    const current = parseFloat(currentEl?.value) || 0;
    const goal    = parseFloat(goalEl?.value) || 0;
    const monthly = parseFloat(monthlyEl?.value) || 0;
    const day     = parseInt(dayEl?.value) || 0;
    const rate    = parseFloat(rateEl?.value) || 0;

    if (!name) { flashInput(nameEl); return; }
    if (isNaN(current) || current < 0) { flashInput(currentEl); return; }

    state.pots.push({ id: uuid(), name, type, current, goal, monthly, day, rate });
    saveState();
    closeAdd();
    render();
  }

  function editPot(id) {
    editingId = id;
    renderList();
    document.querySelector(`[data-id="${id}"] [data-field="name"]`)?.focus();
  }

  function saveEdit(id) {
    const row = document.querySelector(`[data-id="${id}"]`);
    if (!row) return;

    const name    = row.querySelector('[data-field="name"]')?.value.trim();
    const type    = row.querySelector('[data-field="type"]')?.value || 'savings';
    const current = parseFloat(row.querySelector('[data-field="current"]')?.value) || 0;
    const goal    = parseFloat(row.querySelector('[data-field="goal"]')?.value) || 0;
    const monthly = parseFloat(row.querySelector('[data-field="monthly"]')?.value) || 0;
    const day     = parseInt(row.querySelector('[data-field="day"]')?.value) || 0;
    const rate    = parseFloat(row.querySelector('[data-field="rate"]')?.value) || 0;

    const nameEl    = row.querySelector('[data-field="name"]');
    const currentEl = row.querySelector('[data-field="current"]');
    if (!name) { flashInput(nameEl); return; }
    if (isNaN(current) || current < 0) { flashInput(currentEl); return; }

    const p = state.pots.find(p => p.id === id);
    if (!p) return;
    Object.assign(p, { name, type, current, goal, monthly, day, rate });
    editingId = null;
    saveState();
    render();
  }

  function deletePot(id) {
    state.pots = state.pots.filter(p => p.id !== id);
    if (editingId === id) editingId = null;
    saveState();
    render();
  }


  /* ── 7. WIRE ──────────────────────────────────────────────── */

  document.getElementById('sv-add-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('sv-add-panel');
    panel?.classList.contains('b-hidden') ? openAdd() : closeAdd();
  });

  document.getElementById('sv-btn-save')?.addEventListener('click', savePot);

  document.getElementById('sv-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); savePot(); }
  });

  ['sv-savings-list', 'sv-invest-list'].forEach(listId => {
    document.getElementById(listId)?.addEventListener('click', e => {
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const id     = row.dataset.id;
      const action = e.target.closest('[data-action]')?.dataset.action;

      if (action === 'edit')        editPot(id);
      else if (action === 'save')   saveEdit(id);
      else if (action === 'cancel') { editingId = null; render(); }
      else if (action === 'delete') deletePot(id);
    });
  });


  /* ── 8. BOOT ──────────────────────────────────────────────── */

  render();

})();
