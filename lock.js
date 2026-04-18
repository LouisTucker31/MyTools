/* ============================================================
   LOCK.JS — Local PIN lock screen
   ─────────────────────────────────────────────────────────────
   Where PIN is stored:
     localStorage key "mt_pin_hash" — a simple SHA-256 hex hash
     of the PIN. Never stored as plain text.

   How lock triggers on reopen/background:
     • On first load — always shows lock screen.
     • On visibilitychange — if the page is hidden for >10s and
       then becomes visible again, it re-locks.

   How to change or disable PIN:
     • Call window.lockScreen.showChangePIN() from any page.
       (The settings button in the lock overlay calls this.)
     • To disable lock: not offered by default (privacy tool).
       You could add a flag in localStorage if needed later.
   ============================================================ */

(function () {

  /* ── SHA-256 helper ──────────────────────────────────────── */
  async function sha256(text) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /* ── Storage ─────────────────────────────────────────────── */
  const STORAGE_KEY = 'mt_pin_hash';
  const DEFAULT_PIN = '0000';

  async function getStoredHash() {
    let hash = localStorage.getItem(STORAGE_KEY);
    if (!hash) {
      hash = await sha256(DEFAULT_PIN);
      localStorage.setItem(STORAGE_KEY, hash);
    }
    return hash;
  }

  async function setPIN(pin) {
    const hash = await sha256(pin);
    localStorage.setItem(STORAGE_KEY, hash);
  }

  async function checkPIN(pin) {
    const stored = await getStoredHash();
    const entered = await sha256(pin);
    return stored === entered;
  }

  /* ── Build DOM ───────────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'lock-overlay';
  overlay.innerHTML = `
    <div id="lock-inner">
      <p id="lock-title">Enter Passcode</p>
      <div id="lock-dots">
        <span class="lock-dot"></span>
        <span class="lock-dot"></span>
        <span class="lock-dot"></span>
        <span class="lock-dot"></span>
      </div>
      <p id="lock-error"></p>
      <div id="lock-keypad">
        <button class="lk-key" data-val="1"><span class="lk-num">1</span></button>
        <button class="lk-key" data-val="2"><span class="lk-num">2</span><span class="lk-sub">ABC</span></button>
        <button class="lk-key" data-val="3"><span class="lk-num">3</span><span class="lk-sub">DEF</span></button>
        <button class="lk-key" data-val="4"><span class="lk-num">4</span><span class="lk-sub">GHI</span></button>
        <button class="lk-key" data-val="5"><span class="lk-num">5</span><span class="lk-sub">JKL</span></button>
        <button class="lk-key" data-val="6"><span class="lk-num">6</span><span class="lk-sub">MNO</span></button>
        <button class="lk-key" data-val="7"><span class="lk-num">7</span><span class="lk-sub">PQRS</span></button>
        <button class="lk-key" data-val="8"><span class="lk-num">8</span><span class="lk-sub">TUV</span></button>
        <button class="lk-key" data-val="9"><span class="lk-num">9</span><span class="lk-sub">WXYZ</span></button>
        <button class="lk-key lk-key--empty" disabled></button>
        <button class="lk-key" data-val="0"><span class="lk-num">0</span></button>
        <button class="lk-key lk-key--del" id="lk-del" aria-label="Delete">
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
            <path d="M8 1H20C20.5523 1 21 1.44772 21 2V14C21 14.5523 20.5523 15 20 15H8L1 8L8 1Z" stroke="white" stroke-opacity="0.75" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M9 5.5L15.5 11M15.5 5.5L9 11" stroke="white" stroke-opacity="0.75" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <button id="lk-change-pin">Change Passcode</button>
    </div>
  `;
  document.body.appendChild(overlay);

  /* ── State ───────────────────────────────────────────────── */
  let entered      = '';
  let mode         = 'unlock';  // 'unlock' | 'change-old' | 'change-new' | 'change-confirm'
  let newPINTemp   = '';
  let isLocked     = true;

  const dotEls     = overlay.querySelectorAll('.lock-dot');
  const titleEl    = overlay.querySelector('#lock-title');
  const errorEl    = overlay.querySelector('#lock-error');
  const changePINBtn = overlay.querySelector('#lk-change-pin');

  /* ── Dot display ─────────────────────────────────────────── */
  function updateDots() {
    dotEls.forEach((d, i) => {
      d.classList.toggle('lock-dot--filled', i < entered.length);
    });
  }

  /* ── Error shake ─────────────────────────────────────────── */
  function shakeError(msg) {
    errorEl.textContent = msg;
    const dotsWrap = overlay.querySelector('#lock-dots');
    dotsWrap.classList.remove('lock-shake');
    void dotsWrap.offsetWidth;
    dotsWrap.classList.add('lock-shake');
    setTimeout(() => dotsWrap.classList.remove('lock-shake'), 500);
    entered = '';
    updateDots();
  }

  /* ── Unlock animation ────────────────────────────────────── */
  function unlock() {
    overlay.classList.add('lock-overlay--unlocking');
    isLocked = false;
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.classList.remove('lock-overlay--unlocking');
    }, 380);
  }

  /* ── Lock (re-show overlay) ──────────────────────────────── */
  function lock() {
    entered = '';
    mode = 'unlock';
    newPINTemp = '';
    updateDots();
    titleEl.textContent = 'Enter Passcode';
    errorEl.textContent = '';
    changePINBtn.style.display = '';
    overlay.style.display = 'flex';
    overlay.classList.remove('lock-overlay--unlocking');
    isLocked = true;
  }

  /* ── Digit input handler ─────────────────────────────────── */
  async function handleDigit(digit) {
    if (entered.length >= 4) return;
    entered += digit;
    updateDots();

    if (entered.length < 4) return;

    // Tiny delay so the last dot fills before processing
    await new Promise(r => setTimeout(r, 80));

    if (mode === 'unlock') {
      const ok = await checkPIN(entered);
      if (ok) {
        errorEl.textContent = '';
        unlock();
      } else {
        shakeError('Incorrect passcode');
      }

    } else if (mode === 'change-old') {
      const ok = await checkPIN(entered);
      if (ok) {
        mode = 'change-new';
        titleEl.textContent = 'Enter New Passcode';
        errorEl.textContent = '';
        entered = '';
        updateDots();
      } else {
        shakeError('Incorrect passcode');
      }

    } else if (mode === 'change-new') {
      newPINTemp = entered;
      mode = 'change-confirm';
      titleEl.textContent = 'Confirm New Passcode';
      errorEl.textContent = '';
      entered = '';
      updateDots();

    } else if (mode === 'change-confirm') {
      if (entered === newPINTemp) {
        await setPIN(entered);
        titleEl.textContent = 'Passcode Changed ✓';
        errorEl.textContent = '';
        entered = '';
        updateDots();
        await new Promise(r => setTimeout(r, 900));
        mode = 'unlock';
        unlock();
      } else {
        shakeError('Passcodes did not match');
        mode = 'change-new';
        newPINTemp = '';
        titleEl.textContent = 'Enter New Passcode';
      }
    }
  }

  /* ── Keypad events ───────────────────────────────────────── */
  overlay.querySelector('#lock-keypad').addEventListener('click', e => {
    const key = e.target.closest('.lk-key');
    if (!key || key.disabled) return;

    if (key.id === 'lk-del') {
      entered = entered.slice(0, -1);
      updateDots();
      return;
    }

    const val = key.dataset.val;
    if (val !== undefined) handleDigit(val);
  });

  /* ── Change PIN button ───────────────────────────────────── */
  changePINBtn.addEventListener('click', () => showChangePIN());

  function showChangePIN() {
    mode = 'change-old';
    entered = '';
    newPINTemp = '';
    updateDots();
    titleEl.textContent = 'Enter Current Passcode';
    errorEl.textContent = '';
    changePINBtn.style.display = 'none';
    overlay.style.display = 'flex';
    isLocked = true;
  }

  /* ── Background/reopen detection ────────────────────────── */
  let hiddenAt = null;
  const RELOCK_TIMEOUT = 10_000; // 10 seconds hidden → re-lock on return

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      if (!isLocked && hiddenAt !== null) {
        const away = Date.now() - hiddenAt;
        if (away > RELOCK_TIMEOUT) lock();
      }
      hiddenAt = null;
    }
  });

  /* ── Expose public API ───────────────────────────────────── */
  window.lockScreen = { lock, showChangePIN };

  /* ── Init: show lock on first load ──────────────────────── */
  getStoredHash(); // ensure default hash is seeded on first run
  // overlay is visible by default (CSS: display:flex)

})();
