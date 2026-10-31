// auth.js - Shared configuration, authentication & API helpers for Elysium PG
// ---------------------------------------------------------------------------
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwNR9EP5FfVODvpxdDUh4s4ciInW1JREY681R0gbb8HlTNBTfRLppwoDZKH5N9Spqc6/exec";
const APPS_SCRIPT_AUTH_URL = APPS_SCRIPT_URL; // legacy alias used by a few pages

// Central, editable settings (keep in sync with the constants at the top of code.gs)
const PG_CONFIG = {
  pgName: "Elysium PG",
  // Rooms shown in the room pickers (floor -> room numbers)
  rooms: {
    1: ["101", "102", "103", "104", "105", "106", "107"],
    2: ["201", "202", "203", "204", "205", "206", "207"],
    3: ["301", "302", "303", "304", "305", "306", "307"],
    4: ["401", "402", "403", "404", "405", "406", "407"],
    5: ["501", "502", "503", "504", "505", "506", "507"],
    6: ["601", "602", "603", "604", "605", "606", "607"]
  },
  // true  = pro-rate using the real number of days in the month (28/29/30/31)
  // false = always divide by 30
  prorateUseActualDays: true,
  // Default maintenance deduction when returning an advance
  defaultMaintenanceDeduction: 1000,
  // Country code for WhatsApp links (India)
  countryCode: "91"
};

const TOKEN_KEY = "elysium_auth_token";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

// Escapes text before it is placed inside innerHTML templates
function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Local (device) calendar date as yyyy-MM-dd. toISOString() is UTC and returns
// "yesterday" between 12:00 AM and 5:30 AM in India, so it must not be used.
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

// "November 2026" -> { year: 2026, month: 10 }  (month is 0-based) or null
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
// Days used as the divisor for pro-rating a month's rent
function prorateDays(monthName) {
  if (!PG_CONFIG.prorateUseActualDays) return 30;
  const p = parseMonthName(monthName);
  if (!p) return 30;
  return new Date(p.year, p.month + 1, 0).getDate();
}

// Normalises an Indian mobile number to digits with country code, or "" if invalid
function whatsappNumber(mobile) {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith(PG_CONFIG.countryCode)) return digits;
  digits = digits.replace(/^0+/, "");
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return "";
  return PG_CONFIG.countryCode + digits;
}

// ---------------------------------------------------------------------------
// Session handling (token issued by the server after a PIN login)
// ---------------------------------------------------------------------------
function decodeTokenExpiry(token) {
  try {
    const body = String(token).split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(body));
    return Number(payload.exp) || 0;
  } catch (e) {
    return 0;
  }
}

function getAuthToken() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) return "";
  if (decodeTokenExpiry(token) <= Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    return "";
  }
  return token;
}

function isAuthenticated() {
  return Boolean(getAuthToken());
}

async function verifyStaffPin(pinInputId, errorMsgId, onSuccess) {
  const pinInput = document.getElementById(pinInputId);
  const errorMsg = document.getElementById(errorMsgId);
  const pin = (pinInput ? pinInput.value : "").trim();
  if (!pin) return;

  if (errorMsg) errorMsg.classList.add("hidden");
  if (pinInput) pinInput.disabled = true;

  try {
    // PIN goes in a POST body (never in the URL)
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "login", pin: pin })
    });
    const rawText = await res.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      throw new Error("Server did not respond properly. Please try again.");
    }

    if (data.status === "success" && data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      if (pinInput) pinInput.value = "";
      if (typeof onSuccess === "function") onSuccess();
    } else {
      showPinError(errorMsg, (data && data.message) || "Invalid Staff PIN");
    }
  } catch (err) {
    showPinError(errorMsg, err.message || "Connection error. Please try again.");
  } finally {
    if (pinInput) pinInput.disabled = false;
  }
}

function showPinError(errorMsg, text) {
  if (!errorMsg) return;
  errorMsg.innerText = text;
  errorMsg.classList.remove("hidden");
}

// Clears the session and redirects to portal home
function logoutApp() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.clear();
  window.location.href = "index.html";
}

function lockApp() {
  logoutApp();
}

// Called whenever the server says the session is no longer valid
function handleSessionExpired() {
  localStorage.removeItem(TOKEN_KEY);
  const modal = document.getElementById("pinLockModal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    window.location.href = "index.html";
  }
}

// Universal Enter key listener for all PIN inputs
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const pinBox = document.getElementById("staffPinInput");
    if (pinBox && !pinBox.closest("#pinLockModal")?.classList.contains("hidden")) {
      if (typeof unlockApp === "function") unlockApp();
    }
  }
});

// ---------------------------------------------------------------------------
// API helpers - every call goes through these so errors are never shown as success
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

// Read-only request. Throws on any problem. Retries once on a non-JSON reply
// (Apps Script cold starts occasionally return an HTML page).
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

  if (json.code === "unauthorized") {
    handleSessionExpired();
    throw new Error(json.message || "Session expired. Please unlock again.");
  }
  if (json.status !== "success") {
    throw new Error(json.message || "Request failed.");
  }
  return json;
}

// Write request. Resolves ONLY when the server confirms success.
// A request id lets the server ignore a repeat of the same write, so retrying
// after a timeout can never create a duplicate row.
const uncertainWrites = new Map();

async function apiPost(payload) {
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
      lastError = new Error("The server did not confirm the save. Please check the sheet before retrying (a retry will not create duplicates).");
      uncertainWrites.set(fingerprint, requestId);
      await sleep(1500);
      continue;
    }

    uncertainWrites.delete(fingerprint);

    if (json.code === "unauthorized") {
      handleSessionExpired();
      throw new Error(json.message || "Session expired. Please unlock again.");
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

// ---------------------------------------------------------------------------
// Dynamic month dropdown (chronologically sorted, defaults to the current month)
// ---------------------------------------------------------------------------
async function initDynamicMonthSelect(selectId = "monthSelect") {
  const select = document.getElementById(selectId);
  if (!select) return;

  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();

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

      if (months.includes(currentMonthName)) {
        select.value = currentMonthName;
      } else {
        // Latest month that is not in the future, else the latest available
        const nowKey = now.getFullYear() * 12 + now.getMonth();
        const past = months.filter(m => monthSortKey(m) <= nowKey);
        select.value = past.length ? past[past.length - 1] : months[months.length - 1];
      }
    }
  } catch (err) {
    console.warn("Could not fetch dynamic months, falling back to existing options.", err);
  }
}

// ---------------------------------------------------------------------------
// Image compression for uploads (phones produce 5-10 MB photos)
// ---------------------------------------------------------------------------
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // keep in sync with MAX_DOC_BYTES in code.gs

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
    } catch (e) {
      // fall back to the original file
    }
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
