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
    if (n === 0) return '—';
    return '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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


  /* ── 4. AUTO-UPDATE ──────────────────────────────────────── */

  /*
    On each boot, walk through every pot that has a payment day set.
    For each one, find all payment dates that have passed since lastUpdated
    and apply: balance += balance * (annualRate/12/100) + monthlyPayment
    Store today as lastUpdated so we never double-apply.
  */
  function applyMissedPayments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let changed = false;

    state.pots.forEach(pot => {
      if (!pot.day || pot.day < 1 || pot.day > 31) return;
      if (!pot.monthly && !pot.rate) return;

      // Parse lastUpdated, default to one month before today if never set
      let cursor;
      if (pot.lastUpdated) {
        cursor = new Date(pot.lastUpdated + 'T12:00:00');
      } else {
        // First run — treat as if last updated yesterday so we only apply
        // if today IS the payment date, not retroactively for all past months
        cursor = new Date(today);
        cursor.setDate(cursor.getDate() - 1);
      }
      cursor.setHours(0, 0, 0, 0);

      // Walk forward month by month, applying each payment date that has passed
      // Start from the month of cursor and step forward
      let check = new Date(cursor.getFullYear(), cursor.getMonth(), pot.day);
      // If the payment day in cursor's month is on or before cursor, start next month
      if (check <= cursor) {
        check = new Date(cursor.getFullYear(), cursor.getMonth() + 1, pot.day);
      }

      const monthlyRate = (pot.rate || 0) / 100 / 12;
      const monthlyPmt  = pot.monthly || 0;

      while (check <= today) {
        pot.current = pot.current * (1 + monthlyRate) + monthlyPmt;
        pot.current = Math.round(pot.current * 100) / 100;
        changed = true;
        // Advance to same day next month
        check = new Date(check.getFullYear(), check.getMonth() + 1, pot.day);
      }

      // Record today so next boot knows where we left off
      const todayStr = today.toISOString().slice(0, 10);
      if (pot.lastUpdated !== todayStr) {
        pot.lastUpdated = todayStr;
        changed = true;
      }
    });

    if (changed) saveState();
  }


  /* ── 5. SKELETON ──────────────────────────────────────────── */

  container.innerHTML = `
<div class="b-root sv-root">

  <!-- Left column: add box -->
  <div class="sv-left-col">
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
              <option value="other">Other</option>
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
  </div>

  <!-- Right column: rendered dynamically -->
  <div class="sv-right-col" id="sv-right-col"></div>

  <!-- Totals: always at the bottom -->
  <div class="sv-area-totals" id="sv-totals"></div>

</div>`;


  /* ── 5. RENDER ────────────────────────────────────────────── */

  function render() {
    renderRightCol();
    renderTotals();
  }

  const SV_SECTIONS = [
    { type: 'savings',    label: 'My Savings' },
    { type: 'investment', label: 'My Investments' },
    { type: 'other',      label: 'Other' },
  ];

  function renderRightCol() {
    const col = document.getElementById('sv-right-col');
    if (!col) return;

    const hasPots = state.pots.length > 0;

    if (!hasPots) {
      col.innerHTML = `
        <div class="b-module">
          <div class="b-label">My Savings</div>
          <div class="b-txn-empty">No savings added yet</div>
        </div>`;
      return;
    }

    col.innerHTML = SV_SECTIONS
      .filter(s => state.pots.some(p => p.type === s.type))
      .map(s => {
        const pots = state.pots.filter(p => p.type === s.type);
        return `
        <div class="b-module">
          <div class="b-label">${s.label}</div>
          ${pots.map(p => p.id === editingId ? buildEditRow(p) : buildRow(p)).join('')}
        </div>`;
      }).join('');

    // Re-wire click handlers after DOM rebuild
    col.querySelectorAll('[data-id]').forEach(row => {
      row.addEventListener('click', e => {
        const id     = row.dataset.id;
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'save')        saveEdit(id);
        else if (action === 'cancel') { editingId = null; render(); }
        else if (action === 'delete') deletePot(id);
        else if (!row.classList.contains('sv-row--editing')) editPot(id);
      });
    });
  }

  function buildRow(p) {
    const projection = projectGoal(p);
    const tagMap = {
      savings:    { cls: 'sv-tag--savings', label: 'Savings' },
      investment: { cls: 'sv-tag--invest',  label: 'Investment' },
      other:      { cls: 'sv-tag--other',   label: 'Other' },
    };
    const { cls: tagClass, label: tagLabel } = tagMap[p.type] || tagMap.savings;
    const isInvest = p.type === 'investment';
    const progress = p.goal > 0 ? Math.min(100, (p.current / p.goal) * 100) : 0;

    return `
<div class="sv-row" data-id="${p.id}">
  <div class="sv-row-main">
    <div class="sv-row-top">
      <span class="sv-name">${p.name}</span>
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
      ${p.monthly > 0 ? `<span class="sv-meta-item">${fmt(p.monthly)}/mo${p.day >= 1 ? ` · ${ordinal(p.day)}` : ''}</span>` : ''}
      ${p.rate > 0 ? `<span class="sv-meta-item">${parseFloat(p.rate).toFixed(2)}% p.a.</span>` : ''}
      ${projection ? `<span class="sv-meta-item sv-meta-goal">${projection}</span>` : ''}
    </div>
  </div>
  <span class="bl-edit-btn" aria-hidden="true">›</span>
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
        <option value="other"      ${p.type === 'other'      ? 'selected' : ''}>Other</option>
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

    const totalAll     = state.pots.reduce((s, p) => s + p.current, 0);
    const totalPayments = state.pots.reduce((s, p) => s + (p.monthly || 0), 0);

    el.innerHTML = `
<div class="sv-totals-grid">
  <div class="b-stat">
    <span class="b-stat-val">${fmt(totalAll)}</span>
    <span class="b-stat-lbl">Total<br>Savings</span>
  </div>
  <div class="b-stat">
    <span class="b-stat-val">${fmt(totalPayments)}</span>
    <span class="b-stat-lbl">Total<br>Payments</span>
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
    document.getElementById('sv-type').value = 'savings';
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
    render();
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
    // If monthly payment or rate changed, reset lastUpdated to today so future
    // applyMissedPayments uses the new values from now, not retroactively.
    const todayStr = new Date().toISOString().slice(0, 10);
    if (monthly !== p.monthly || rate !== p.rate || current !== p.current) {
      p.lastUpdated = todayStr;
    }
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



  /* ── 8. SCROLL DRAG ──────────────────────────────────────── */

  function wireScrollDrag(el) {
    let dragging = false, pointerId = null, startY = 0, startScroll = 0;
    let lastY = 0, lastT = 0, velY = 0, momentumId = null, moved = false;
    const DRAG_THRESHOLD = 4;
    function cancelMomentum() { if (momentumId) { cancelAnimationFrame(momentumId); momentumId = null; } }
    function stopDrag(kick) {
      if (!dragging) return;
      dragging = false; pointerId = null; moved = false; el.style.cursor = '';
      if (!kick) return;
      if (Math.abs(velY) > 0.05) {
        let v = -velY * 14;
        const decay = 0.91;
        const step = () => { el.scrollTop += v; v *= decay; if (Math.abs(v) > 0.4) momentumId = requestAnimationFrame(step); else momentumId = null; };
        momentumId = requestAnimationFrame(step);
      }
    }
    el.addEventListener('pointerdown', e => {
      if (!e.isPrimary || e.pointerType === 'mouse') return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
      cancelMomentum(); dragging = true; moved = false; pointerId = e.pointerId;
      startY = e.clientY; startScroll = el.scrollTop; lastY = e.clientY; lastT = e.timeStamp; velY = 0;
    });
    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < DRAG_THRESHOLD) return;
      if (!moved) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
      moved = true;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velY = (e.clientY - lastY) / dt;
      lastY = e.clientY; lastT = e.timeStamp;
      el.scrollTop = startScroll - dy;
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('pointerup', e => { if (e.pointerId !== pointerId) return; try { el.releasePointerCapture(e.pointerId); } catch (_) {} stopDrag(moved); });
    el.addEventListener('pointercancel', e => { if (e.pointerId !== pointerId) return; stopDrag(false); });
    el.addEventListener('lostpointercapture', e => { if (e.pointerId !== pointerId) return; stopDrag(moved); });
  }

  wireScrollDrag(container);

  /* ── 9. BOOT ──────────────────────────────────────────────── */

  applyMissedPayments();
  render();

})();
