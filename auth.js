// auth.js - Shared configuration, authentication & API helpers for Elysium PG
// ---------------------------------------------------------------------------
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwNR9EP5FfVODvpxdDUh4s4ciInW1JREY681R0gbb8HlTNBTfRLppwoDZKH5N9Spqc6/exec";
const APPS_SCRIPT_AUTH_URL = APPS_SCRIPT_URL;

const PG_CONFIG = {
  pgName: "Elysium PG",
  rooms: {
    1: ["101", "102", "103", "104", "105", "106", "107"],
    2: ["201", "202", "203", "204", "205", "206", "207"],
    3: ["301", "302", "303", "304", "305", "306", "307"],
    4: ["401", "402", "403", "404", "405", "406", "407"],
    5: ["501", "502", "503", "504", "505", "506", "507"],
    6: ["601", "602", "603", "604", "605", "606", "607"]
  },
  prorateUseActualDays: true,
  defaultMaintenanceDeduction: 1000,
  countryCode: "91"
};

const SESSION_KEY = "elysium_session_data";
const TOKEN_KEY = "elysium_auth_token";

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toLocalISO(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() {
  return toLocalISO(new Date());
}
function addDaysISO(days, fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function parseMonthName(name) {
  const m = String(name || "").trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTH_NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase());
  if (idx < 0) return null;
  return { year: parseInt(m[2], 10), month: idx };
}
function monthSortKey(name) {
  const p = parseMonthName(name);
  return p ? p.year * 12 + p.month : -1;
}
function nextMonthName(name) {
  const p = parseMonthName(name);
  if (!p) return "";
  const idx = p.year * 12 + p.month + 1;
  return `${MONTH_NAMES[idx % 12]} ${Math.floor(idx / 12)}`;
}
function prorateDays(monthName) {
  if (!PG_CONFIG.prorateUseActualDays) return 30;
  const p = parseMonthName(monthName);
  if (!p) return 30;
  return new Date(p.year, p.month + 1, 0).getDate();
}

function whatsappNumber(mobile) {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith(PG_CONFIG.countryCode)) return digits;
  digits = digits.replace(/^0+/, "");
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return "";
  return PG_CONFIG.countryCode + digits;
}

// ---------------------------------------------------------------------------
// Smart Indian Mobile Number Sanitization & Validation
// ---------------------------------------------------------------------------
function cleanIndianMobile(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith(PG_CONFIG.countryCode)) {
    digits = digits.slice(PG_CONFIG.countryCode.length);
  }
  digits = digits.replace(/^0+/, "");
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function isValidIndianMobile(digits) {
  return /^[6-9]\d{9}$/.test(String(digits || ""));
}

function validateMobileInput(inputEl, required = false) {
  if (!inputEl) return "";
  const cleaned = cleanIndianMobile(inputEl.value);
  inputEl.value = cleaned;
  if (!cleaned) {
    if (required) {
      inputEl.setCustomValidity("Please enter a 10-digit Indian mobile number.");
      inputEl.reportValidity();
      throw new Error("Mobile number is required (10 digits starting with 6-9).");
    }
    inputEl.setCustomValidity("");
    return "";
  }
  if (!isValidIndianMobile(cleaned)) {
    inputEl.setCustomValidity("Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
    inputEl.reportValidity();
    throw new Error("Invalid mobile number: must be 10 digits starting with 6-9.");
  }
  inputEl.setCustomValidity("");
  return cleaned;
}

function attachMobileSanitizers() {
  document.querySelectorAll('input[type="tel"], input[data-mobile="true"]').forEach(el => {
    if (el.dataset.mobileBound) return;
    el.dataset.mobileBound = "true";
    el.removeAttribute("maxlength");
    el.setAttribute("inputmode", "numeric");
    const sanitize = () => {
      const cleaned = cleanIndianMobile(el.value);
      if (el.value !== cleaned) el.value = cleaned;
      el.setCustomValidity("");
    };
    el.addEventListener("input", sanitize);
    el.addEventListener("paste", () => setTimeout(sanitize, 0));
    el.addEventListener("blur", sanitize);
  });
}


// ---------------------------------------------------------------------------
// Session & Auth Handling (1-Hour Expiry + Session Closure via sessionStorage)
// ---------------------------------------------------------------------------
function getActiveSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session || !session.token || !session.expiry) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.now() > Number(session.expiry)) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session) {
  if (!session) return;
  // The session lives in sessionStorage only (cleared when the tab / app closes).
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem(TOKEN_KEY); // remove any copy left by older versions
}

function getAuthToken() {
  const s = getActiveSession();
  return s ? s.token : "";
}

function getAuthRole() {
  const s = getActiveSession();
  return s ? s.role : "GUEST";
}

function getAuthUser() {
  const s = getActiveSession();
  return s ? (s.displayName || s.username) : "User";
}

function isAuthenticated() {
  return getActiveSession() !== null;
}

function logoutApp() {
  // Clear browser session storage
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);

  // Note: Do NOT clear AndroidBiometric here. 
  // This allows the registered user to unlock with their fingerprint upon returning.

  window.location.replace("login.html");
}

function lockApp() {
  logoutApp();
}

function handleSessionExpired() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
  const current = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
  window.location.replace(`login.html?redirect=${current}`);
}

// Direct URL Protection (Guards every HTML page upon loading)
function enforcePageAuthentication() {
  const isLoginPage = window.location.pathname.endsWith("login.html");
  const session = getActiveSession();

  if (!session) {
    if (!isLoginPage) {
      const page = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
      window.location.replace(`login.html?redirect=${page}`);
    }
  } else if (isLoginPage) {
    window.location.replace("index.html");
  }
}

enforcePageAuthentication();

// ---------------------------------------------------------------------------
// Strict Viewer Mode Frontend Restrictions
// ---------------------------------------------------------------------------
function applyViewerRestrictions() {
  const role = getAuthRole();
  if (role === "VIEWER") {
    const selectors = [
      "button[type='submit']",
      ".btn-save",
      ".btn-delete",
      ".btn-add",
      "#confirmDeleteBtn",
      "#saveUserBtn",
      "#uploadSubmitBtn",
      "#generateMonthBtn"
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.display = "none";
      });
    });

    document.querySelectorAll("input, select, textarea").forEach(input => {
      const id = (input.id || "").toLowerCase();
      const isFilter = id.includes("filter") || id.includes("search") || id.includes("monthselect") || id.includes("roomsearch");
      if (!isFilter) {
        input.setAttribute("disabled", "true");
        input.classList.add("opacity-60", "cursor-not-allowed");
      }
    });

    const header = document.querySelector("header");
    if (header && !document.getElementById("viewerNoticeBadge")) {
      const badge = document.createElement("div");
      badge.id = "viewerNoticeBadge";
      badge.className = "bg-amber-100 text-amber-800 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5 shadow-sm";
      badge.innerHTML = `<i class="fa-solid fa-eye text-amber-600"></i> <span>View-Only Account</span>`;
      header.appendChild(badge);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const legacyPinModal = document.getElementById("pinLockModal");
  if (legacyPinModal && isAuthenticated()) {
    legacyPinModal.classList.add("hidden");
  }
  attachMobileSanitizers();
  applyViewerRestrictions();
  injectQuickNavDock();
});

function unlockApp() {
  const legacyPinModal = document.getElementById("pinLockModal");
  if (legacyPinModal) legacyPinModal.classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Robust API Helpers
// ---------------------------------------------------------------------------
function makeRequestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function quickHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h + ":" + str.length;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function apiGet(action, params = {}, retries = 2) {
  const qs = new URLSearchParams({ action, token: getAuthToken() });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });

  let rawText = "";
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?${qs.toString()}`);
    rawText = await res.text();
  } catch (netErr) {
    if (retries > 0) {
      await sleep(800);
      return apiGet(action, params, retries - 1);
    }
    throw new Error("Network error. Check your connection and try again.");
  }

  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    if (retries > 0) {
      await sleep(800);
      return apiGet(action, params, retries - 1);
    }
    throw new Error("Server is warming up. Please tap refresh.");
  }

  if (json.code === "unauthorized" || (json.message && json.message.toLowerCase().includes("unauthorized"))) {
    handleSessionExpired();
    throw new Error(json.message || "Session expired. Please log in again.");
  }
  if (json.status !== "success") {
    throw new Error(json.message || "Request failed.");
  }
  return json;
}

const uncertainWrites = new Map();

// Actions every logged-in user may perform on their own account (even view-only accounts)
const SELF_SERVICE_ACTIONS = ["enrollDevice", "revokeDevice"];

async function apiPost(payload) {
  if (getAuthRole() === "VIEWER" && SELF_SERVICE_ACTIONS.indexOf(payload && payload.action) === -1) {
    alert("Action blocked: Your account has View-Only permissions.");
    throw new Error("FORBIDDEN: View-Only accounts cannot modify data.");
  }

  const body = Object.assign({}, payload);
  delete body.pin;
  body.token = getAuthToken();

  const fingerprint = quickHash(JSON.stringify(Object.assign({}, body, { token: "" })));
  const requestId = uncertainWrites.get(fingerprint) || makeRequestId();
  body.requestId = requestId;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let rawText = "";
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      rawText = await res.text();
    } catch (netErr) {
      lastError = new Error("Network error - the save may not have gone through. Check before retrying.");
      uncertainWrites.set(fingerprint, requestId);
      await sleep(1500);
      continue;
    }

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      lastError = new Error("The server did not confirm the save. Please check the sheet before retrying.");
      uncertainWrites.set(fingerprint, requestId);
      await sleep(1500);
      continue;
    }

    uncertainWrites.delete(fingerprint);

    if (json.code === "unauthorized" || (json.message && json.message.toLowerCase().includes("unauthorized"))) {
      handleSessionExpired();
      throw new Error(json.message || "Session expired. Please log in again.");
    }
    if (json.status !== "success") {
      const err = new Error(json.message || "The server rejected this request.");
      err.response = json;
      throw err;
    }
    return json;
  }
  throw lastError || new Error("Request failed.");
}

const ACTIVE_MONTH_KEY = "elysium_active_month";

function getActiveMonthFallback() {
  const saved = localStorage.getItem(ACTIVE_MONTH_KEY);
  if (saved && parseMonthName(saved)) return saved;
  const now = new Date();
  return MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
}

async function initDynamicMonthSelect(selectId = "monthSelect") {
  const select = document.getElementById(selectId);
  if (!select) return;

  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
  const targetInitialMonth = getActiveMonthFallback();

  select.innerHTML = "";
  const initOpt = document.createElement("option");
  initOpt.value = targetInitialMonth;
  initOpt.textContent = targetInitialMonth;
  select.appendChild(initOpt);
  select.value = targetInitialMonth;

  if (!select.dataset.listenerAttached) {
    select.addEventListener("change", () => {
      if (select.value) {
        localStorage.setItem(ACTIVE_MONTH_KEY, select.value);
      }
    });
    select.dataset.listenerAttached = "true";
  }

  try {
    const json = await apiGet("getAvailableMonths");
    if (json.months && json.months.length > 0) {
      const months = json.months.slice().sort((a, b) => monthSortKey(a) - monthSortKey(b));
      select.innerHTML = "";
      months.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });

      const savedMonth = localStorage.getItem(ACTIVE_MONTH_KEY);
      if (savedMonth && months.includes(savedMonth)) {
        select.value = savedMonth;
      } else if (months.includes(currentMonthName)) {
        select.value = currentMonthName;
      } else {
        const nowKey = now.getFullYear() * 12 + now.getMonth();
        const past = months.filter(m => monthSortKey(m) <= nowKey);
        select.value = past.length ? past[past.length - 1] : months[months.length - 1];
      }
      localStorage.setItem(ACTIVE_MONTH_KEY, select.value);
    }
  } catch (err) {
    console.warn("Could not fetch dynamic months, falling back to local month.", err);
  }

  return select.value;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function prepareUploadFile(file) {
  if (!file) throw new Error("No file selected.");
  const type = (file.type || "").toLowerCase();
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const isHeic = type === "image/heic" || type === "image/heif";
  if (!allowed.includes(type) && !isHeic) {
    throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  }

  let blob = file;
  let outType = type;
  let outName = file.name;

  if (type.startsWith("image/") && !isHeic && file.size > 700 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const compressed = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.82));
      if (compressed && compressed.size < file.size) {
        blob = compressed;
        outType = "image/jpeg";
        outName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      }
    } catch (e) {}
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (${(blob.size / 1048576).toFixed(1)} MB). Maximum is ${MAX_UPLOAD_BYTES / 1048576} MB.`);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(blob);
  });

  return { base64: String(dataUrl).split(",")[1] || "", mimeType: outType, fileName: outName, size: blob.size };
}


// ---------------------------------------------------------------------------
// Elysium OS v3 Shell: Dark/Light Theme + Bottom Dock + Universal App Drawer
// ---------------------------------------------------------------------------
const THEME_KEY = "elysium_ui_theme_v3";

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  if (saved === "light") {
    document.documentElement.classList.add("light-theme");
    document.documentElement.classList.remove("dark-theme");
  } else {
    document.documentElement.classList.remove("light-theme");
    document.documentElement.classList.add("dark-theme");
  }
  const icon = document.getElementById("dockThemeIcon");
  const label = document.getElementById("dockThemeLabel");
  if (icon && label) {
    const isLight = document.documentElement.classList.contains("light-theme");
    icon.className = isLight ? "fa-solid fa-moon text-indigo-400" : "fa-solid fa-sun text-amber-400";
    label.textContent = isLight ? "Dark" : "Light";
  }
}

function toggleAppTheme() {
  const isCurrentlyLight = document.documentElement.classList.contains("light-theme");
  localStorage.setItem(THEME_KEY, isCurrentlyLight ? "dark" : "light");
  applySavedTheme();
  window.dispatchEvent(new CustomEvent("elysium:themechange"));
}

applySavedTheme();

function toggleElysiumDrawer(forceState) {
  const drawer = document.getElementById("elysiumAppDrawer");
  if (!drawer) return;
  const shouldOpen = forceState !== undefined ? forceState : !drawer.classList.contains("open");
  if (shouldOpen) drawer.classList.add("open");
  else drawer.classList.remove("open");
}

function quickJumpToRoom(targetPage) {
  const inp = document.getElementById("globalQuickRoomInput");
  const rm = inp ? String(inp.value || "").trim() : "";
  if (!/^[1-6]0[1-7]$/.test(rm)) {
    alert("Enter a valid room number between 101 and 607 (e.g. 101, 304, 607).");
    return;
  }
  localStorage.setItem("elysium_quick_room", rm);
  window.location.href = `${targetPage}?room=${encodeURIComponent(rm)}`;
}

function injectQuickNavDock() {
  applySavedTheme();
  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (path === "login.html" || document.getElementById("elysiumBottomDock")) return;

  // Auto-select room if navigated via Quick Room Jump
  const urlRoom = new URLSearchParams(window.location.search).get("room") || localStorage.getItem("elysium_quick_room");
  if (urlRoom && /^[1-6]0[1-7]$/.test(urlRoom)) {
    localStorage.removeItem("elysium_quick_room");
    setTimeout(() => {
      if (typeof showFloor === "function" && typeof selectRoom === "function") {
        showFloor(parseInt(urlRoom[0], 10));
        selectRoom(urlRoom);
      }
    }, 350);
  }

  const navItems = [
    { href: "index.html", icon: "fa-compass", label: "Hub" },
    { href: "vacancies.html", icon: "fa-door-open", label: "Beds" },
    { href: "rent.html", icon: "fa-indian-rupee-sign", label: "Rents" },
    { href: "daily_staying.html", icon: "fa-bed-pulse", label: "Daily" },
    { href: "expenses.html", icon: "fa-bolt", label: "Spends" },
    { href: "settlements.html", icon: "fa-chart-simple", label: "Cashflow" }
  ];

  const dock = document.createElement("nav");
  dock.id = "elysiumBottomDock";
  dock.setAttribute("aria-label", "Elysium OS Dock");

  navItems.forEach(item => {
    const a = document.createElement("a");
    a.href = item.href;
    if (path === item.href) a.className = "dock-active";
    a.innerHTML = `<i class="fa-solid ${item.icon}"></i><span>${item.label}</span>`;
    dock.appendChild(a);
  });

  // All-Modules & Quick Jump Launcher Button
  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "dock-action-btn";
  menuBtn.onclick = () => toggleElysiumDrawer();
  menuBtn.innerHTML = `<i class="fa-solid fa-grip text-indigo-400"></i><span>Menu</span>`;
  dock.appendChild(menuBtn);

  // Theme Switcher Button
  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "dock-action-btn";
  themeBtn.onclick = toggleAppTheme;
  const isLight = document.documentElement.classList.contains("light-theme");
  themeBtn.innerHTML = `<i id="dockThemeIcon" class="fa-solid ${isLight ? 'fa-moon text-indigo-400' : 'fa-sun text-amber-400'}"></i><span id="dockThemeLabel">${isLight ? 'Dark' : 'Light'}</span>`;
  dock.appendChild(themeBtn);

  document.body.appendChild(dock);

  // Universal Slide-Up App Drawer (Quick Room Jump + All 10 Modules)
  const role = getAuthRole();
  const drawer = document.createElement("div");
  drawer.id = "elysiumAppDrawer";
  drawer.onclick = (e) => { if (e.target === drawer) toggleElysiumDrawer(false); };
  drawer.innerHTML = `
    <div class="drawer-sheet">
      <div class="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-4"></div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Elysium OS Command</p>
          <h3 class="text-base font-bold text-white">Quick Jump &amp; All Modules</h3>
        </div>
        <button type="button" onclick="toggleElysiumDrawer(false)" class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Instant Room Jump Box -->
      <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 mb-4">
        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          <i class="fa-solid fa-bolt text-amber-400 mr-1"></i> Instant Room Jump (101 – 607)
        </label>
        <div class="flex items-center gap-2">
          <input type="number" id="globalQuickRoomInput" placeholder="Room # (e.g. 406)" class="w-36 text-xs font-mono font-bold px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white" />
          <button type="button" onclick="quickJumpToRoom('rent.html')" class="flex-1 py-2 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl">
            Rent
          </button>
          <button type="button" onclick="quickJumpToRoom('resident_details.html')" class="flex-1 py-2 px-2.5 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold rounded-xl">
            Specs
          </button>
          <button type="button" onclick="quickJumpToRoom('new_resident.html')" class="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl">
            Join
          </button>
        </div>
      </div>

      <!-- Full Module Matrix -->
      <div class="grid grid-cols-2 gap-2.5 text-xs font-bold">
        <a href="vacancies.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center"><i class="fa-solid fa-door-open"></i></span>
          <span>Vacancies</span>
        </a>
        <a href="rent.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center"><i class="fa-solid fa-receipt"></i></span>
          <span>Rent Ledger</span>
        </a>
        <a href="new_resident.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center"><i class="fa-solid fa-user-plus"></i></span>
          <span>New Check-In</span>
        </a>
        <a href="daily_staying.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><i class="fa-solid fa-bed-pulse"></i></span>
          <span>Daily Staying</span>
        </a>
        <a href="walkins.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center"><i class="fa-solid fa-person-walking-arrow-right"></i></span>
          <span>Walk-in Leads</span>
        </a>
        <a href="expenses.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center"><i class="fa-solid fa-wallet"></i></span>
          <span>Expenses</span>
        </a>
        <a href="resident_details.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center"><i class="fa-solid fa-sliders"></i></span>
          <span>Room Specs</span>
        </a>
        <a href="settlements.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center"><i class="fa-solid fa-scale-balanced"></i></span>
          <span>Settlements</span>
        </a>
        <a href="rollover.html" class="${role === 'VIEWER' ? 'col-span-2' : ''} p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center"><i class="fa-solid fa-calendar-plus"></i></span>
          <span>Month Rollover</span>
        </a>
        ${role !== "VIEWER" ? `
        <a href="aadhar.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center"><i class="fa-solid fa-id-card"></i></span>
          <span>ID Uploader</span>
        </a>` : ""}
        ${role === "MASTER_ADMIN" ? `
        <a href="users.html" class="col-span-2 p-3 rounded-2xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 flex items-center justify-center gap-2.5 text-purple-200 no-underline">
          <i class="fa-solid fa-user-shield text-purple-400"></i>
          <span>Master Admin: Partner &amp; User Access Control</span>
        </a>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(drawer);
}
