/* ============================================================
   DEBTS TOOL — pages/debts.js
   Track debts with balances, interest, and payoff projections
   ============================================================ */

(function () {

  /* ── 1. BOOTSTRAP ─────────────────────────────────────────── */

  const container = document.getElementById('card-content-debts');
  if (!container) return;

  container.classList.remove('card-placeholder');
  container.closest('.card')?.classList.add('card--debts');


  /* ── 2. STATE ─────────────────────────────────────────────── */

  const STORAGE_KEY = 'debts_v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { debts: [] };
    } catch { return { debts: [] }; }
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

  const TYPE_MAP = {
    credit:   { cls: 'dt-tag--credit',  label: 'Credit Card' },
    loan:     { cls: 'dt-tag--loan',    label: 'Loan' },
    borrowed: { cls: 'dt-tag--borrowed',label: 'Borrowed' },
    other:    { cls: 'dt-tag--other',   label: 'Other' },
  };

  /*
    Project months until debt is paid off.
    Balance reduces by monthly payment then grows by interest.
    Returns a string like "~14 months" or "Paid off" or null.
  */
  function projectPayoff(debt) {
    if (debt.balance <= 0) return 'Paid off';
    const monthly = debt.monthly || 0;
    const rate    = (debt.rate || 0) / 100 / 12;
    if (monthly <= 0) return null;

    let balance = debt.balance;
    let months  = 0;
    while (balance > 0 && months < 600) {
      balance = balance * (1 + rate) - monthly;
      months++;
      if (balance <= 0) break;
    }
    if (months >= 600) return null;

    if (months < 12) return `~${months} month${months !== 1 ? 's' : ''}`;
    const yrs = Math.floor(months / 12);
    const mth = months % 12;
    return mth === 0
      ? `~${yrs} yr${yrs !== 1 ? 's' : ''}`
      : `~${yrs}yr ${mth}mo`;
  }


  /* ── 4. AUTO-UPDATE ──────────────────────────────────────── */

  /*
    On boot, for each debt with a payment day, apply any missed monthly
    cycles: balance = balance * (1 + rate/12) - monthlyPayment
    Clamp to 0 so it never goes negative.
  */
  function applyMissedPayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let changed = false;

    state.debts.forEach(debt => {
      if (!debt.day || debt.day < 1 || debt.day > 31) return;
      if (!debt.monthly && !debt.rate) return;

      let cursor;
      if (debt.lastUpdated) {
        cursor = new Date(debt.lastUpdated + 'T12:00:00');
      } else {
        cursor = new Date(today);
        cursor.setDate(cursor.getDate() - 1);
      }
      cursor.setHours(0, 0, 0, 0);

      let check = new Date(cursor.getFullYear(), cursor.getMonth(), debt.day);
      if (check <= cursor) {
        check = new Date(cursor.getFullYear(), cursor.getMonth() + 1, debt.day);
      }

      const monthlyRate = (debt.rate || 0) / 100 / 12;
      const monthlyPmt  = debt.monthly || 0;

      while (check <= today && debt.balance > 0) {
        debt.balance = debt.balance * (1 + monthlyRate) - monthlyPmt;
        debt.balance = Math.max(0, Math.round(debt.balance * 100) / 100);
        changed = true;
        check = new Date(check.getFullYear(), check.getMonth() + 1, debt.day);
      }

      const todayStr = today.toISOString().slice(0, 10);
      if (debt.lastUpdated !== todayStr) {
        debt.lastUpdated = todayStr;
        changed = true;
      }
    });

    if (changed) saveState();
  }


  /* ── 5. SKELETON ──────────────────────────────────────────── */

  container.innerHTML = `
<div class="b-root dt-root">

  <!-- Left column: add + totals stacked together -->
  <div class="sv-left-col">
    <div class="b-module dt-area-add">
      <div class="b-setup-bar">
        <span class="b-setup-text" style="color:#fff;font-weight:700">Add Debt</span>
        <button class="b-btn-ghost" id="dt-add-toggle">Add</button>
      </div>
      <div class="b-setup-panel b-hidden" id="dt-add-panel">
        <div class="b-two-col">
          <div class="b-field">
            <input type="text" class="b-input" id="dt-name" placeholder="Name (e.g. Visa Card)">
          </div>
          <div class="b-field">
            <select class="b-input" id="dt-type">
              <option value="credit">Credit Card</option>
              <option value="loan">Loan</option>
              <option value="borrowed">Borrowed</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="b-two-col">
          <div class="b-field">
            <input type="number" class="b-input" id="dt-balance" placeholder="Current balance (£)" min="0" step="0.01">
          </div>
          <div class="b-field">
            <input type="number" class="b-input" id="dt-rate" placeholder="Interest rate (% p.a.)" min="0" step="0.01">
          </div>
        </div>
        <div class="b-two-col">
          <div class="b-field">
            <input type="number" class="b-input" id="dt-monthly" placeholder="Monthly payment (£)" min="0" step="0.01">
          </div>
          <div class="b-field">
            <input type="number" class="b-input" id="dt-day" placeholder="Payment date (1–31)" min="1" max="31">
          </div>
        </div>
        <button class="b-btn-add" id="dt-btn-save">Add</button>
      </div>
    </div>
    <div class="dt-area-totals" id="dt-totals"></div>
  </div>

  <!-- Right column: all debt lists -->
  <!-- Right column: rendered dynamically -->
  <div class="sv-right-col" id="dt-right-col"></div>

</div>`;


  /* ── 6. RENDER ────────────────────────────────────────────── */

  const DT_SECTIONS = [
    { type: 'credit',   label: 'My Credit Cards' },
    { type: 'loan',     label: 'My Loans' },
    { type: 'borrowed', label: 'My Borrowed' },
    { type: 'other',    label: 'Other' },
  ];

  function render() {
    renderRightCol();
    renderTotals();
  }

  function renderRightCol() {
    const col = document.getElementById('dt-right-col');
    if (!col) return;

    if (!state.debts.length) {
      col.innerHTML = `
        <div class="b-module">
          <div class="b-label">My Debts</div>
          <div class="b-txn-empty">No debts added yet</div>
        </div>`;
      return;
    }

    col.innerHTML = DT_SECTIONS
      .filter(s => state.debts.some(d => d.type === s.type))
      .map(s => {
        const items = state.debts.filter(d => d.type === s.type);
        return `
        <div class="b-module">
          <div class="b-label">${s.label}</div>
          ${items.map(d => d.id === editingId ? buildEditRow(d) : buildRow(d)).join('')}
        </div>`;
      }).join('');

    col.querySelectorAll('[data-id]').forEach(row => {
      row.addEventListener('click', e => {
        const id     = row.dataset.id;
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'edit')        editDebt(id);
        else if (action === 'save')   saveEdit(id);
        else if (action === 'cancel') { editingId = null; render(); }
        else if (action === 'delete') deleteDebt(id);
      });
    });
  }

  function buildRow(d) {
    const payoff = projectPayoff(d);
    const { cls: tagClass, label: tagLabel } = TYPE_MAP[d.type] || TYPE_MAP.other;

    // Progress toward £0 — use originalBalance as the starting point
    const orig     = d.originalBalance > 0 ? d.originalBalance : d.balance;
    const progress = orig > 0 ? Math.min(100, Math.max(0, ((orig - d.balance) / orig) * 100)) : 0;

    return `
<div class="sv-row" data-id="${d.id}">
  <div class="sv-row-main">
    <div class="sv-row-top">
      <span class="sv-name">${d.name}</span>
    </div>
    <div class="sv-row-vals">
      <span class="sv-current">${fmt(d.balance)}</span>
      <span class="sv-goal">of ${fmt(orig)}</span>
    </div>
    <div class="sv-progress-track">
      <div class="sv-progress-fill sv-progress-fill--debt" style="width:${progress}%"></div>
    </div>
    <div class="sv-row-meta">
      ${d.monthly > 0 ? `<span class="sv-meta-item">£${parseFloat(d.monthly).toFixed(2)}/mo${d.day ? ` · ${ordinal(d.day)}` : ''}</span>` : ''}
      <span class="sv-meta-item">${parseFloat(d.rate || 0).toFixed(2)}% p.a.</span>
      ${payoff ? `<span class="sv-meta-item sv-meta-goal">${payoff}</span>` : ''}
    </div>
  </div>
  <button class="bl-edit-btn" data-action="edit" aria-label="Edit">›</button>
</div>`;
  }

  function buildEditRow(d) {
    return `
<div class="sv-row sv-row--editing" data-id="${d.id}">
  <div class="b-txn-edit-fields" style="width:100%">
    <div class="b-two-col">
      <input type="text" class="b-input" placeholder="Name" value="${d.name}" data-field="name">
      <select class="b-input" data-field="type">
        <option value="credit"   ${d.type==='credit'   ?'selected':''}>Credit Card</option>
        <option value="loan"     ${d.type==='loan'     ?'selected':''}>Loan</option>
        <option value="borrowed" ${d.type==='borrowed' ?'selected':''}>Borrowed</option>
        <option value="other"    ${d.type==='other'    ?'selected':''}>Other</option>
      </select>
    </div>
    <div class="b-two-col">
      <input type="number" class="b-input" placeholder="Balance (£)" value="${d.balance}" min="0" step="0.01" data-field="balance">
      <input type="number" class="b-input" placeholder="Interest (% p.a.)" value="${d.rate || ''}" min="0" step="0.01" data-field="rate">
    </div>
    <div class="b-two-col">
      <input type="number" class="b-input" placeholder="Monthly (£)" value="${d.monthly || ''}" min="0" step="0.01" data-field="monthly">
      <input type="number" class="b-input" placeholder="Payment date" value="${d.day || ''}" min="1" max="31" data-field="day">
    </div>
    <div class="b-txn-edit-actions">
      <button class="b-txn-save" data-action="save">Save</button>
      <button class="b-txn-cancel" data-action="cancel">Cancel</button>
    </div>
    <button class="b-txn-delete" data-action="delete">Delete</button>
  </div>
</div>`;
  }

  function renderTotals() {
    const el = document.getElementById('dt-totals');
    if (!el) return;

    const total    = state.debts.reduce((s, d) => s + d.balance, 0);
    const cards    = state.debts.filter(d => d.type === 'credit').reduce((s, d) => s + d.balance, 0);
    const loans    = state.debts.filter(d => d.type === 'loan').reduce((s, d) => s + d.balance, 0);
    const other    = state.debts.filter(d => !['credit','loan'].includes(d.type)).reduce((s, d) => s + d.balance, 0);

    el.innerHTML = `
<div class="sv-totals-grid">
  <div class="b-stat">
    <span class="b-stat-val">${fmt(total)}</span>
    <span class="b-stat-lbl">Total<br>Debt</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(cards)}</span>
    <span class="b-stat-lbl">Credit<br>Cards</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(loans)}</span>
    <span class="b-stat-lbl">Total<br>Loans</span>
  </div>
</div>`;
  }


  /* ── 7. ACTIONS ───────────────────────────────────────────── */

  function openAdd() {
    document.getElementById('dt-add-panel')?.classList.remove('b-hidden');
    document.getElementById('dt-add-toggle').textContent = 'Cancel';
    setTimeout(() => document.getElementById('dt-name')?.focus(), 50);
  }

  function closeAdd() {
    document.getElementById('dt-add-panel')?.classList.add('b-hidden');
    document.getElementById('dt-add-toggle').textContent = 'Add';
    ['dt-name','dt-balance','dt-rate','dt-monthly','dt-day'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const typeEl = document.getElementById('dt-type');
    if (typeEl) typeEl.value = 'credit';
  }

  function saveDebt() {
    const nameEl    = document.getElementById('dt-name');
    const typeEl    = document.getElementById('dt-type');
    const balanceEl = document.getElementById('dt-balance');
    const rateEl    = document.getElementById('dt-rate');
    const monthlyEl = document.getElementById('dt-monthly');
    const dayEl     = document.getElementById('dt-day');

    const name    = nameEl?.value.trim();
    const type    = typeEl?.value || 'credit';
    const balance = parseFloat(balanceEl?.value) || 0;
    const rate    = parseFloat(rateEl?.value) || 0;
    const monthly = parseFloat(monthlyEl?.value) || 0;
    const day     = parseInt(dayEl?.value) || 0;

    if (!name) { flashInput(nameEl); return; }
    if (isNaN(balance) || balance < 0) { flashInput(balanceEl); return; }

    state.debts.push({ id: uuid(), name, type, balance, originalBalance: balance, rate, monthly, day });
    saveState();
    closeAdd();
    render();
  }

  function editDebt(id) {
    editingId = id;
    render();
    document.querySelector(`[data-id="${id}"] [data-field="name"]`)?.focus();
  }

  function saveEdit(id) {
    const row = document.querySelector(`[data-id="${id}"]`);
    if (!row) return;

    const name    = row.querySelector('[data-field="name"]')?.value.trim();
    const type    = row.querySelector('[data-field="type"]')?.value || 'credit';
    const balance = parseFloat(row.querySelector('[data-field="balance"]')?.value) || 0;
    const rate    = parseFloat(row.querySelector('[data-field="rate"]')?.value) || 0;
    const monthly = parseFloat(row.querySelector('[data-field="monthly"]')?.value) || 0;
    const day     = parseInt(row.querySelector('[data-field="day"]')?.value) || 0;

    const nameEl    = row.querySelector('[data-field="name"]');
    const balanceEl = row.querySelector('[data-field="balance"]');
    if (!name) { flashInput(nameEl); return; }
    if (isNaN(balance) || balance < 0) { flashInput(balanceEl); return; }

    const d = state.debts.find(d => d.id === id);
    if (!d) return;
    Object.assign(d, { name, type, balance, rate, monthly, day });
    editingId = null;
    saveState();
    render();
  }

  function deleteDebt(id) {
    state.debts = state.debts.filter(d => d.id !== id);
    if (editingId === id) editingId = null;
    saveState();
    render();
  }


  /* ── 8. WIRE ──────────────────────────────────────────────── */

  document.getElementById('dt-add-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('dt-add-panel');
    panel?.classList.contains('b-hidden') ? openAdd() : closeAdd();
  });

  document.getElementById('dt-btn-save')?.addEventListener('click', saveDebt);

  document.getElementById('dt-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveDebt(); }
  });



  /* ── 9. BOOT ──────────────────────────────────────────────── */

  applyMissedPayments();
  render();

})();
