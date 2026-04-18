/* ============================================================
   BILLS TOOL — pages/bills.js
   Monthly bill tracker with dates, amounts, tick-off, totals
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
    return '£' + Math.abs(n).toFixed(2);
  }

  function todayDay() {
    return new Date().getDate(); // day of month 1–31
  }

  // A bill is "due" if its day <= today's day of month
  function isDue(bill) {
    return bill.day <= todayDay();
  }

  // Sort bills by day of month
  function sortedBills() {
    return [...state.bills].sort((a, b) => a.day - b.day);
  }

  function flashInput(el) {
    if (!el) return;
    el.style.outline = '2px solid #FF4F40';
    setTimeout(() => el.style.outline = '', 800);
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

  <!-- Totals -->
  <div class="b-module bl-area-totals" id="bl-totals"></div>

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
    const due      = isDue(b);
    const checked  = b.paid;
    const dayLabel = ordinal(b.day);
    return `
<div class="bl-row${checked ? ' bl-row--paid' : ''}" data-id="${b.id}">
  <button class="bl-tick${checked ? ' bl-tick--checked' : ''}" data-action="tick" aria-label="Mark paid">
    ${checked ? `<svg viewBox="0 0 20 20" fill="none"><polyline points="4,10 8,14 16,6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
  </button>
  <div class="bl-info">
    <div class="bl-name${checked ? ' bl-name--paid' : ''}">${b.name}</div>
    <div class="bl-day${due && !checked ? ' bl-day--due' : ''}">${due && !checked ? `Due · ${dayLabel}` : dayLabel}</div>
  </div>
  <span class="bl-amt${checked ? ' bl-amt--paid' : ''}">${fmt(b.amount)}</span>
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

    const bills      = sortedBills();
    const total      = bills.reduce((s, b) => s + b.amount, 0);
    const paid       = bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);
    const remaining  = total - paid;

    if (!bills.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
<div class="bl-totals-grid">
  <div class="b-stat">
    <span class="b-stat-val">${fmt(total)}</span>
    <span class="b-stat-lbl">Total<br>Bills</span>
  </div>
  <div class="b-stat ${paid > 0 ? 'b-stat--pos-outline' : ''}">
    <span class="b-stat-val" style="color:${paid > 0 ? '#4FC3F7' : ''}">${fmt(paid)}</span>
    <span class="b-stat-lbl">Paid<br>So Far</span>
  </div>
  <div class="b-stat ${remaining > 0 ? 'b-stat--neg-outline' : ''}">
    <span class="b-stat-val" style="color:${remaining > 0 ? '#FF4F40' : ''}">${fmt(remaining)}</span>
    <span class="b-stat-lbl">Still<br>To Pay</span>
  </div>
</div>`;
  }

  function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
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

    if (!name)                         { flashInput(nameEl); return; }
    if (isNaN(amount) || amount <= 0)  { flashInput(amtEl);  return; }
    if (isNaN(day) || day < 1 || day > 31) { flashInput(dayEl); return; }

    state.bills.push({ id: uuid(), name, amount, day, paid: false });
    saveState();
    closeAdd();
    render();
  }

  function tickBill(id) {
    const b = state.bills.find(b => b.id === id);
    if (!b) return;
    b.paid = !b.paid;
    saveState();
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

    if (action === 'tick')   tickBill(id);
    else if (action === 'edit')   editBill(id);
    else if (action === 'save')   saveEdit(id);
    else if (action === 'cancel') { editingId = null; renderList(); }
    else if (action === 'delete') deleteBill(id);
  });


  /* ── 8. BOOT ──────────────────────────────────────────────── */

  // Auto-reset paid status on new month
  const now       = new Date();
  const resetKey  = `bills_reset_${now.getFullYear()}_${now.getMonth()}`;
  if (!localStorage.getItem(resetKey)) {
    state.bills.forEach(b => b.paid = false);
    saveState();
    localStorage.setItem(resetKey, '1');
  }

  render();

})();
