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
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(TOKEN_KEY, session.token);
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
  applyViewerRestrictions();
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

async function apiPost(payload) {
  if (getAuthRole() === "VIEWER") {
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

  let hasTarget = Array.from(select.options).some(o => o.value === targetInitialMonth);
  if (!hasTarget) {
    const opt = document.createElement("option");
    opt.value = targetInitialMonth;
    opt.textContent = targetInitialMonth;
    select.prepend(opt);
  }
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