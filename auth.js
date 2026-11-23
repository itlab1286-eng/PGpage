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

function showLogoutConfirmModal_() {
  return new Promise((resolve) => {
    if (typeof ensureSaveModal_ !== "function") {
      resolve(confirm("Are you sure you want to log out of Elysium PG?"));
      return;
    }
    const modal = ensureSaveModal_();
    const card = document.getElementById("elysiumSaveModalCard");
    const currentUser = getAuthUser();

    card.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div class="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-lg shrink-0">
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
          </div>
          <div>
            <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Session Control</p>
            <h3 class="text-base font-black text-slate-900">Confirm Logout</h3>
          </div>
        </div>
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-semibold leading-relaxed">
          Are you sure you want to log out${currentUser && currentUser !== "User" ? ` as <b>${esc(currentUser)}</b>` : ""}?
        </div>
        <div class="flex gap-2.5 pt-1">
          <button type="button" id="elyLogoutCancelBtn" class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition">
            Cancel
          </button>
          <button type="button" id="elyLogoutConfirmBtn" class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-lg shadow-rose-600/30 transition flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-power-off"></i>
            <span>Yes, Log Out</span>
          </button>
        </div>
      </div>`;

    modal.classList.remove("hidden");
    document.getElementById("elyLogoutCancelBtn").onclick = () => {
      closeSaveModal_();
      resolve(false);
    };
    document.getElementById("elyLogoutConfirmBtn").onclick = () => {
      closeSaveModal_();
      resolve(true);
    };
  });
}

async function logoutApp(skipConfirm = false) {
  if (!skipConfirm) {
    const confirmed = await showLogoutConfirmModal_();
    if (!confirmed) return;
  }

  // Clear browser session & cached SWR views
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (typeof invalidateAllSWR === "function") invalidateAllSWR();

  // Note: Do NOT clear AndroidBiometric here so fingerprint unlock stays ready next time the app opens.
  if (window.AndroidBiometric && typeof window.AndroidBiometric.closeApp === "function") {
    window.AndroidBiometric.closeApp("You are successfully logged out.");
    return;
  }

  window.location.replace("login.html?loggedOut=1");
}

function lockApp(skipConfirm = false) {
  logoutApp(skipConfirm);
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
// Silent/background actions that should NOT pop the pre-save re-validation modal
const SILENT_POST_ACTIONS = ["login", "verifyPin", "deviceLogin", "enrollDevice", "revokeDevice", "saveDuesMeta", "reorderHandlers"];

function formatRupeeVal_(v) {
  const n = Number(v);
  return isFinite(n) ? "₹" + n.toLocaleString("en-IN") : String(v || "");
}

function describeSavePayload_(payload) {
  const act = String((payload && payload.action) || "");
  const rows = [];
  const push = (label, val) => {
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      rows.push([label, String(val).trim()]);
    }
  };
  let title = "Confirm Data Save";
  let month = payload.targetMonth || payload.month || "";
  let isDestructive = false;

  switch (act) {
    case "recordRentPayment":
      isDestructive = Number(payload.rentPaid) === 0 && payload.entryType === "replace";
      title = isDestructive ? "Reset Rent Payment to ₹0" : (payload.entryType === "replace" ? "Correct Total Rent Paid" : "Record Rent Payment");
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Resident", payload.residentName);
      push(payload.entryType === "replace" ? "New Total Paid" : "Amount Received", formatRupeeVal_(payload.rentPaid));
      if (payload.currentMonthRent !== undefined && payload.currentMonthRent !== "") push("This Month Rent", formatRupeeVal_(payload.currentMonthRent));
      push("Mode / Receiver", payload.mode);
      push("Payment Date", payload.paymentDate);
      push("Remarks", payload.remarks);
      break;

    case "onboardNewResident":
      title = payload.isFutureMonthJoining ? "Advance Booking (Future Month)" : "Register New Resident";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Name", payload.name);
      push("Mobile", payload.mobile);
      push("Joining Date", payload.joiningDate);
      push("Agreed Rent", payload.rent ? formatRupeeVal_(payload.rent) : "");
      if (payload.isFutureMonthJoining) {
        push((payload.month || "This Month") + " Rent", formatRupeeVal_(payload.currentMonthRent || 0) + " (Starts in " + (payload.joiningMonthName || "future month") + ")");
      } else {
        push("This Month Rent", payload.currentMonthRent !== "" && payload.currentMonthRent !== undefined ? formatRupeeVal_(payload.currentMonthRent) : "");
      }
      if (Number(payload.advance) > 0) push("Agreed Advance", formatRupeeVal_(payload.advance));
      if (Number(payload.advancePaid) > 0) push("Advance Paid", formatRupeeVal_(payload.advancePaid) + (payload.advanceReceivedBy ? ` (${payload.advanceReceivedBy})` : ""));
      if (Number(payload.rentPaid) > 0) push("Joining Rent Paid", formatRupeeVal_(payload.rentPaid) + (payload.paymentMode ? ` (${payload.paymentMode})` : ""));
      if (payload.fileName) push("Document", payload.fileName);
      break;

    case "recordAdvancePayment":
      title = "Collect Security Advance";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Resident", payload.residentName);
      push("Advance Amount", formatRupeeVal_(payload.advancePaid));
      push("Received By", payload.receivedBy);
      break;

    case "settleAdvanceReturn":
      title = "Settle & Return Advance";
      isDestructive = true;
      push("Room", payload.room ? "Room " + payload.room : "");
      push("Resident", payload.name);
      push("Net Refund (Written as -₹)", "-" + formatRupeeVal_(payload.refundAmount));
      push("Maint. Deduction", formatRupeeVal_(payload.maintenanceDeducted));
      push("Returned By", payload.returnedBy);
      push("Vacating Date", payload.vacatingDate);
      break;

    case "reportVacancy":
      title = payload.isFutureMonthDeparture ? "Record Future-Month Vacancy Notice" : "Record Vacancy Notice";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Resident", payload.residentName);
      push("Vacating Date", payload.vacancyDate);
      push("Informed Date", payload.informedDate);
      if (payload.isFutureMonthDeparture) {
        push((payload.month || "Current Month") + " Rent", "Unchanged (Full Month)");
        if (payload.adjustedRent !== undefined && payload.adjustedRent !== "") {
          push("Saved " + (payload.departureMonthName || "Future") + " Rent", formatRupeeVal_(payload.adjustedRent) + " (for Rollover)");
        }
      } else if (payload.adjustedRent !== undefined && payload.adjustedRent !== "") {
        push("Adjusted " + (payload.month || "Current") + " Rent (Col H)", formatRupeeVal_(payload.adjustedRent));
      }
      break;

    case "cancelVacancyNotice":
      title = "Cancel Vacate Notice (Continue Stay)";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Resident", payload.residentName);
      if (payload.isFutureMonthDeparture) {
        push((payload.month || "Current Month") + " Rent", "Unchanged");
      } else if (payload.restoredRent) {
        push("Restored Monthly Rent", formatRupeeVal_(payload.restoredRent));
      }
      break;

    case "shiftResident":
      title = "Shift Resident to New Room";
      push("Resident", payload.residentName);
      push("Transfer", `Room ${payload.fromRoom} → Room ${payload.toRoom}`);
      push("Shift Date", payload.shiftDate);
      push("Old Room Rent", formatRupeeVal_(payload.oldRoomRent));
      push("New Room Rent", formatRupeeVal_(payload.newRoomProRatedRent || payload.newRoomStandardRent));
      if (Number(payload.additionalRentPaidNow) > 0) push("Collected Now", formatRupeeVal_(payload.additionalRentPaidNow) + (payload.additionalRentMode ? " (" + payload.additionalRentMode + ")" : ""));
      if (Number(payload.additionalAdvance) > 0) push("Extra Advance", formatRupeeVal_(payload.additionalAdvance) + (payload.additionalAdvanceReceiver ? " (" + payload.additionalAdvanceReceiver + ")" : ""));
      break;

    case "checkInDailyGuest":
      title = "Check-In Daily Guest";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Guest Name", payload.name);
      push("Mobile", payload.mobile);
      push("Duration", (payload.days || 1) + " day(s)");
      push("Check-In", payload.joinedDate);
      push("Expected Checkout", payload.vacatedDate);
      push("Paid", formatRupeeVal_(payload.paid));
      if (Number(payload.balance) > 0) push("Balance Due", formatRupeeVal_(payload.balance));
      if (Number(payload.cautionDeposit) > 0) push("Caution Deposit", formatRupeeVal_(payload.cautionDeposit));
      push("Mode", payload.mode);
      break;

    case "extendDailyStay":
      title = "Extend Daily Stay";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Guest Name", payload.guestName);
      push("New Checkout", payload.newVacatedDate);
      push("Total Days", payload.newDays);
      if (Number(payload.additionalPaid) > 0) push("Additional Paid", formatRupeeVal_(payload.additionalPaid));
      if (Number(payload.additionalBalance) > 0) push("Additional Balance", formatRupeeVal_(payload.additionalBalance));
      push("Mode", payload.additionalMode);
      break;

    case "checkOutDailyGuest":
      title = "Checkout Daily Guest";
      isDestructive = true;
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Guest Name", payload.guestName);
      push("Vacated Date", payload.vacatedDate);
      if (Number(payload.balanceCollected) > 0) push("Balance Collected", formatRupeeVal_(payload.balanceCollected));
      push("Deposit / Settled By", payload.returnedBy);
      push("Note", payload.checkoutNote);
      break;

    case "recordExpense":
    case "updateExpense":
      title = act === "updateExpense" ? "Update Expense Entry" : "Record New Expense";
      push("Item / Purpose", payload.itemPurpose);
      push("Amount", formatRupeeVal_(payload.amount));
      push("Spent By", payload.spentBy);
      push("Date", payload.date);
      push("Remarks", payload.remarks);
      break;

    case "deleteExpense":
      title = "Delete Expense Row";
      isDestructive = true;
      if (payload.expected) {
        push("Item", payload.expected.itemPurpose);
        push("Amount", formatRupeeVal_(payload.expected.amount));
        push("Spent By", payload.expected.spentBy);
      }
      break;

    case "updateResidentDetails":
      title = "Update Resident Details";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      push("Resident", payload.residentName);
      push("Agreed Rent", payload.standardRent ? formatRupeeVal_(payload.standardRent) : "");
      push("This Month Rent", payload.currentMonthRent !== "" ? formatRupeeVal_(payload.currentMonthRent) : "");
      push("Target Advance", payload.agreedAdvance ? formatRupeeVal_(payload.agreedAdvance) : "");
      push("Mobile", payload.mobile);
      push("Joining Date", payload.joiningDate);
      push("Vacating Date", payload.vacatingDate || "(Cleared / Active)");
      break;

    case "updateRoomHardware":
      title = "Update Room Hardware & Rent";
      push("Room", payload.roomNumber ? "Room " + payload.roomNumber : "");
      if (payload.roomSharing) push("New Sharing", payload.roomSharing + " Sharing");
      push("AC Fitted", payload.ac);
      push("AC In Use", payload.acUsing);
      if (payload.updatedRentPerResident) push("New Rent (All Beds)", formatRupeeVal_(payload.updatedRentPerResident));
      break;

    case "saveWalkin":
      title = payload.rowIndex ? "Update Walk-In Inquiry" : "Log New Walk-In Inquiry";
      push("Contact Name", payload.name || "Walk-in Visitor");
      push("Phone", payload.phone);
      push("Requirement", `${payload.requirement || ""} (${payload.persons || 1} person)`);
      push("Amount Said", payload.amountSaid);
      push("Remarks", payload.remarks);
      break;

    case "deleteWalkin":
      title = "Delete Walk-In Inquiry";
      isDestructive = true;
      if (payload.expected) {
        push("Name", payload.expected.name || "Walk-in");
        push("Phone", payload.expected.phone);
        push("Requirement", payload.expected.requirement);
      }
      break;

    case "recordPartnerSettlement":
      title = "Log Partner Settlement Transfer";
      push("Transfer", `${payload.fromPartner} → ${payload.toPartner}`);
      push("Amount", formatRupeeVal_(payload.amount));
      push("Note", payload.note || "Partner settlement transfer");
      break;

    case "uploadResidentDocument":
      title = "Upload Resident Document";
      push("Folder", "Room " + payload.roomNumber);
      push("Resident", payload.resident);
      push("File Name", payload.fileName);
      break;

    case "executeRollover":
      title = payload.forceOverwrite ? "Overwrite & Re-Create Target Month" : "Generate Next Month Workbook";
      isDestructive = Boolean(payload.forceOverwrite);
      push("Source Month", payload.sourceMonth);
      push("Target Month", payload.targetMonth);
      break;

    case "saveWorker":
      title = payload.rowIndex ? "Update Worker Profile" : "Add New Worker";
      push("Workbook", "Elysium PG master");
      push("Name", payload.name);
      push("Role", payload.role);
      push("Monthly Salary", formatRupeeVal_(payload.monthlySalary));
      if (payload.salaryEffectiveMonth) {
        push(
          "Salary Change Applies",
          payload.salaryEffectiveMonth === "ALL_RETRO"
            ? "All Months (Retroactive Typo Fix)"
            : ("Effective from " + payload.salaryEffectiveMonth + " onward (earlier months preserved)")
        );
      }
      if (payload.salaryReason) push("Revision Reason", payload.salaryReason);
      push("Status", payload.status);
      push("Keywords", payload.keywords);
      break;

    case "saveWorkerAdjustment":
      title = payload.type === "Month Override" ? "Save 1-Month Pay Override" : "Save Permanent Salary Revision";
      push("Workbook", "Elysium PG master (Worker Adjustments)");
      push("Worker", payload.workerName + (payload.workerRole ? " (" + payload.workerRole + ")" : ""));
      push(payload.type === "Month Override" ? "Applies To (1 Month Only)" : "Effective From (Onward)", payload.effectiveMonth);
      push("Adjusted Amount", formatRupeeVal_(payload.amount));
      if (payload.reason) push("Reason", payload.reason);
      break;

    case "deleteWorkerAdjustment":
      title = "Remove Salary Adjustment";
      isDestructive = true;
      push("Workbook", "Elysium PG master (Worker Adjustments)");
      if (payload.expected) {
        push("Worker", payload.expected.workerName);
        push("Type", payload.expected.type);
        push("Month", payload.expected.effectiveMonth);
      }
      break;

    case "deleteWorker":
      title = "Remove Worker Profile";
      isDestructive = true;
      push("Workbook", "Elysium PG master");
      if (payload.expected) {
        push("Worker", payload.expected.name);
        push("Role", payload.expected.role);
      }
      push("Note", "Past monthly Expenses rows will remain untouched");
      break;

    case "saveComplaint":
      title = payload.rowIndex ? "Update Complaint" : "Log New Complaint";
      push("Workbook", "Elysium PG master");
      push("Room / Area", payload.room);
      push("Priority", payload.priority);
      push("Status", payload.status);
      push("Issue", payload.description);
      if (payload.progressNotes) push("Progress Note", payload.progressNotes);
      if (payload.resolutionNotes) push("Resolution", payload.resolutionNotes);
      break;

    case "updateComplaintStatus":
      title = payload.status === "Resolved"
        ? "Mark Complaint Resolved"
        : (payload.status === "In Progress" ? "Update In-Progress Status" : "Reopen Complaint");
      push("Workbook", "Elysium PG master");
      push("Room / Area", payload.room || (payload.expected && payload.expected.room));
      push("New Status", payload.status);
      if (payload.progressNotes) push("Progress Note", payload.progressNotes);
      if (payload.resolvedDate) push("Resolved Date", payload.resolvedDate);
      if (payload.resolutionNotes) push("Resolution Notes", payload.resolutionNotes);
      break;

    case "deleteComplaint":
      title = "Delete Complaint";
      isDestructive = true;
      push("Workbook", "Elysium PG master");
      if (payload.expected) {
        push("Room / Area", payload.expected.room);
        push("Issue", payload.expected.description);
      }
      break;

    case "saveHandler":
      title = payload.id ? "Update Payment / Expense Handler" : "Add Payment / Expense Handler";
      push("Display Name", payload.name);
      if (payload.aliases) push("Cashflow Aliases", payload.aliases);
      push("Equal Profit Split", payload.profitSplit ? "Included" : "Excluded");
      break;

    case "toggleHandlerStatus":
      title = payload.active ? "Reactivate Handler" : "Archive Handler";
      isDestructive = !payload.active;
      push("Handler", payload.name || payload.id);
      push("New Status", payload.active ? "Active (visible in all dropdowns)" : "Archived (hidden from new forms; past history preserved)");
      break;

    case "saveUser":
      title = "Save Partner / Staff Account";
      push("Username", "@" + payload.username);
      push("Display Name", payload.displayName);
      push("Role", payload.role);
      break;

    case "deleteUser":
      title = "Delete User Account";
      isDestructive = true;
      push("Username", "@" + payload.username);
      break;

    case "revokeUserAccess":
      title = "Sign Out User Everywhere";
      isDestructive = true;
      push("Username", "@" + payload.username);
      break;

    default:
      title = "Confirm Save (" + act + ")";
      break;
  }

  return { title, month, rows, isDestructive };
}

function ensureSaveModal_() {
  let modal = document.getElementById("elysiumSaveModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "elysiumSaveModal";
    modal.className = "fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden";
    modal.innerHTML = `<div id="elysiumSaveModalCard" class="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 max-h-[88vh] overflow-y-auto"></div>`;
    document.body.appendChild(modal);
  }
  return modal;
}

function closeSaveModal_() {
  const modal = document.getElementById("elysiumSaveModal");
  if (modal) modal.classList.add("hidden");
}

function showSaveConfirmModal_(meta) {
  return new Promise((resolve) => {
    const modal = ensureSaveModal_();
    const card = document.getElementById("elysiumSaveModalCard");
    const now = new Date();
    const currentCalMonth = MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
    const isMonthMismatch = Boolean(meta.month && meta.month !== currentCalMonth && !meta.title.includes("Workbook") && !meta.title.includes("Target Month"));

    const monthBanner = meta.month ? `
      <div class="p-3 rounded-2xl border ${isMonthMismatch ? 'bg-amber-50 border-amber-300' : 'bg-indigo-50 border-indigo-200'} flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-calendar-check ${isMonthMismatch ? 'text-amber-600' : 'text-indigo-600'}"></i>
          <div>
            <p class="text-[10px] font-extrabold uppercase tracking-wider ${isMonthMismatch ? 'text-amber-700' : 'text-indigo-600'}">Target Month</p>
            <p class="text-sm font-black ${isMonthMismatch ? 'text-amber-900' : 'text-indigo-950'}">${esc(meta.month)}</p>
          </div>
        </div>
        ${isMonthMismatch ? `<span class="px-2 py-0.5 rounded-lg bg-amber-200/80 text-amber-900 text-[10px] font-black">Not ${esc(currentCalMonth)}!</span>` : `<span class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">Current Month</span>`}
      </div>` : "";

    const rowsHtml = meta.rows.length ? `
      <div class="rounded-2xl bg-slate-50 border border-slate-200 divide-y divide-slate-200/70 text-xs">
        ${meta.rows.map(([k, v]) => `
          <div class="px-3.5 py-2 flex items-start justify-between gap-3">
            <span class="text-slate-500 font-semibold shrink-0">${esc(k)}</span>
            <span class="text-slate-900 font-extrabold text-right break-words">${esc(v)}</span>
          </div>`).join("")}
      </div>` : "";

    const confirmBtnClass = meta.isDestructive
      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30"
      : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30";

    card.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div class="w-10 h-10 rounded-2xl ${meta.isDestructive ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'} flex items-center justify-center text-lg shrink-0">
            <i class="fa-solid ${meta.isDestructive ? 'fa-triangle-exclamation' : 'fa-clipboard-check'}"></i>
          </div>
          <div>
            <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Re-Validate Before Saving</p>
            <h3 class="text-base font-black text-slate-900">${esc(meta.title)}</h3>
          </div>
        </div>
        ${monthBanner}
        ${rowsHtml}
        <p class="text-[11px] text-slate-500 text-center">Please verify the details and target month above before writing to Google Sheets.</p>
        <div class="flex gap-2.5 pt-1">
          <button type="button" id="elySaveCancelBtn" class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition">
            Cancel / Edit
          </button>
          <button type="button" id="elySaveConfirmBtn" class="flex-1 py-2.5 rounded-xl ${confirmBtnClass} text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-check"></i>
            <span>Confirm &amp; Save</span>
          </button>
        </div>
      </div>`;

    modal.classList.remove("hidden");
    document.getElementById("elySaveCancelBtn").onclick = () => {
      closeSaveModal_();
      resolve(false);
    };
    document.getElementById("elySaveConfirmBtn").onclick = () => {
      resolve(true);
    };
  });
}

function showSaveProgressModal_(meta) {
  const modal = ensureSaveModal_();
  const card = document.getElementById("elysiumSaveModalCard");
  card.innerHTML = `
    <div class="py-6 text-center space-y-3">
      <div class="w-14 h-14 mx-auto rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
      </div>
      <h3 class="text-base font-black text-slate-900">Saving to Google Sheets...</h3>
      <p class="text-xs text-slate-500">${esc(meta.title)}${meta.month ? ` &bull; <b>${esc(meta.month)}</b>` : ""}</p>
      <p class="text-[11px] text-slate-400">Please wait until confirmation appears.</p>
    </div>`;
  modal.classList.remove("hidden");
}

function showSaveResultModal_(kind, title, message, meta, warningText) {
  return new Promise((resolve) => {
    const modal = ensureSaveModal_();
    const card = document.getElementById("elysiumSaveModalCard");

    let iconBg = "bg-emerald-100 text-emerald-600";
    let iconCls = "fa-circle-check";
    let badgeHtml = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">Updated in Sheet</span>`;
    let btnCls = "bg-emerald-600 hover:bg-emerald-700";

    if (kind === "error") {
      iconBg = "bg-rose-100 text-rose-600";
      iconCls = "fa-circle-xmark";
      badgeHtml = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">Not Updated in Sheet</span>`;
      btnCls = "bg-rose-600 hover:bg-rose-700";
    } else if (kind === "uncertain") {
      iconBg = "bg-amber-100 text-amber-600";
      iconCls = "fa-triangle-exclamation";
      badgeHtml = `<span class="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">Unconfirmed — Check Sheet First</span>`;
      btnCls = "bg-amber-600 hover:bg-amber-700";
    }

    card.innerHTML = `
      <div class="text-center space-y-3.5 py-2">
        <div class="w-14 h-14 mx-auto rounded-full ${iconBg} flex items-center justify-center text-2xl">
          <i class="fa-solid ${iconCls}"></i>
        </div>
        <div>
          ${badgeHtml}
          <h3 class="text-lg font-black text-slate-900 mt-1.5">${esc(title)}</h3>
          ${meta && meta.month ? `<p class="text-[11px] font-bold text-indigo-600 mt-0.5">Sheet: ${esc(meta.month)}</p>` : ""}
        </div>
        <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-semibold leading-relaxed">
          ${esc(message)}
        </div>
        ${warningText ? `<div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-bold"><i class="fa-solid fa-circle-info mr-1"></i>${esc(warningText)}</div>` : ""}
        <button type="button" id="elySaveDoneBtn" class="w-full py-3 rounded-2xl ${btnCls} text-white font-black text-sm shadow-lg transition">
          Done
        </button>
      </div>`;

    modal.classList.remove("hidden");
    document.getElementById("elySaveDoneBtn").onclick = () => {
      closeSaveModal_();
      resolve();
    };
  });
}

async function apiPost(payload, opts = {}) {
  if (getAuthRole() === "VIEWER" && SELF_SERVICE_ACTIONS.indexOf(payload && payload.action) === -1) {
    alert("Action blocked: Your account has View-Only permissions.");
    throw new Error("FORBIDDEN: View-Only accounts cannot modify data.");
  }

  const act = String((payload && payload.action) || "");
  const isSilent = opts.silent === true || SILENT_POST_ACTIONS.indexOf(act) !== -1;
  const skipPreConfirm = isSilent || opts.skipConfirm === true || (act === "updateRoomHardware" && payload.confirmed === true);
  const meta = !isSilent ? describeSavePayload_(payload) : null;

  // Step 1: Pre-Save Re-Validation Prompt
  if (!skipPreConfirm && meta) {
    const confirmed = await showSaveConfirmModal_(meta);
    if (!confirmed) {
      const cancelErr = new Error("Save cancelled by user.");
      cancelErr.cancelled = true;
      throw cancelErr;
    }
  }

  if (!isSilent && meta) {
    showSaveProgressModal_(meta);
  }

  const body = Object.assign({}, payload);
  delete body.pin;
  body.token = getAuthToken();

  const fingerprint = quickHash(JSON.stringify(Object.assign({}, body, { token: "" })));
  const requestId = uncertainWrites.get(fingerprint) || makeRequestId();
  body.requestId = requestId;

  let lastError = null;
  let lastUncertain = false;

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
      lastError = new Error("Connection dropped while saving. Google Sheets may still have received this entry — please tap Refresh and check the sheet before trying again.");
      lastUncertain = true;
      uncertainWrites.set(fingerprint, requestId);
      await sleep(1500);
      continue;
    }

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      lastError = new Error("The server response was interrupted (non-JSON). Your data may have already been written to Google Sheets — please refresh and check before retrying.");
      lastUncertain = true;
      uncertainWrites.set(fingerprint, requestId);
      await sleep(1500);
      continue;
    }

    uncertainWrites.delete(fingerprint);

    if (json.code === "unauthorized" || (json.message && json.message.toLowerCase().includes("unauthorized"))) {
      closeSaveModal_();
      handleSessionExpired();
      throw new Error(json.message || "Session expired. Please log in again.");
    }

    // Two-step prompts (updateRoomHardware needsConfirm / rollover already_exists) pass back cleanly
    if (json.needsConfirm === true || json.status === "already_exists") {
      closeSaveModal_();
      if (json.status !== "success") {
        const err = new Error(json.message || "Confirmation needed.");
        err.response = json;
        throw err;
      }
      return json;
    }

    if (json.status !== "success") {
      const wasWritten = json.sheetWritten === true;
      const errMsg = json.message || "The server rejected this request.";
      if (!isSilent && meta) {
        if (wasWritten) {
          await showSaveResultModal_(
            "uncertain",
            "Partially Updated — Please Verify Sheet",
            errMsg + " Because the main write had already started, please refresh and inspect the sheet.",
            meta
          );
        } else {
          await showSaveResultModal_(
            "error",
            "Not Updated",
            errMsg + " No changes were saved to the sheet.",
            meta
          );
        }
      }
      const err = new Error(errMsg);
      err.response = json;
      err.modalShown = !isSilent;
      err.uncertain = wasWritten;
      throw err;
    }

    invalidateAllSWR();
    if (!isSilent && meta) {
      await showSaveResultModal_(
        "success",
        "Saved Successfully!",
        json.message || "Your changes have been saved to Google Sheets.",
        meta,
        json.warning || ""
      );
    }
    return json;
  }

  // Both network/parse attempts failed without receiving a JSON verdict -> HONEST UNCERTAIN WARNING
  const finalErr = lastError || new Error("Request failed.");
  finalErr.uncertain = lastUncertain;
  if (!isSilent && meta) {
    await showSaveResultModal_(
      lastUncertain ? "uncertain" : "error",
      lastUncertain ? "Status Unconfirmed — Check Sheet" : "Not Updated",
      finalErr.message,
      meta
    );
    finalErr.modalShown = true;
  }
  throw finalErr;
}

const ACTIVE_MONTH_KEY = "elysium_active_month";
const MONTHS_CACHE_KEY = "elysium_months_cache_v17";

function invalidateMonthsCache() {
  sessionStorage.removeItem(MONTHS_CACHE_KEY);
}

function invalidateAllSWR() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith("swr_") || k.startsWith("elysium_dir_cache_"))) {
        sessionStorage.removeItem(k);
      }
    }
  } catch (e) {}
}

// Stale-While-Revalidate helper: paints cached data in 0ms, then refreshes silently in background
async function apiGetSWR(action, params = {}, onData) {
  const cleanParams = Object.assign({}, params);
  const isForced = cleanParams.forceRefresh === "true" || cleanParams.forceRefresh === true;
  delete cleanParams.forceRefresh;
  const cacheKey = "swr_" + action + "_" + JSON.stringify(cleanParams);

  let servedCache = false;
  if (!isForced) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && (Date.now() - parsed.ts < 300000)) {
          servedCache = true;
          if (typeof onData === "function") onData(parsed.data, true);
        }
      }
    } catch (e) {}
  }

  try {
    const fresh = await apiGet(action, params);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: fresh }));
    } catch (e) {}
    if (typeof onData === "function") onData(fresh, false);
    return fresh;
  } catch (err) {
    if (!servedCache) throw err;
    console.warn("Background SWR refresh failed:", err);
    return null;
  }
}

function getActiveMonthFallback() {
  const saved = localStorage.getItem(ACTIVE_MONTH_KEY);
  if (saved && parseMonthName(saved)) return saved;
  const now = new Date();
  return MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
}

function populateMonthDropdown_(select, months, currentMonthName) {
  const now = new Date();
  const sorted = months.slice().sort((a, b) => monthSortKey(a) - monthSortKey(b));
  select.innerHTML = "";
  sorted.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });

  const savedMonth = localStorage.getItem(ACTIVE_MONTH_KEY);
  if (savedMonth && sorted.includes(savedMonth)) {
    select.value = savedMonth;
  } else if (sorted.includes(currentMonthName)) {
    select.value = currentMonthName;
  } else {
    const nowKey = now.getFullYear() * 12 + now.getMonth();
    const past = sorted.filter(m => monthSortKey(m) <= nowKey);
    select.value = past.length ? past[past.length - 1] : sorted[sorted.length - 1];
  }
  localStorage.setItem(ACTIVE_MONTH_KEY, select.value);
}

async function initDynamicMonthSelect(selectId = "monthSelect") {
  const select = document.getElementById(selectId);
  if (!select) return;

  const now = new Date();
  const currentMonthName = MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
  const targetInitialMonth = getActiveMonthFallback();

  if (!select.dataset.listenerAttached) {
    select.addEventListener("change", () => {
      if (select.value) {
        localStorage.setItem(ACTIVE_MONTH_KEY, select.value);
      }
    });
    select.dataset.listenerAttached = "true";
  }

  // Serve cached months immediately (eliminates the sequential 2-step load waterfall!)
  try {
    const cachedRaw = sessionStorage.getItem(MONTHS_CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && Array.isArray(parsed.months) && parsed.months.length > 0 && (Date.now() - parsed.ts < 1800000)) {
        populateMonthDropdown_(select, parsed.months, currentMonthName);
        return select.value;
      }
    }
  } catch (e) {}

  select.innerHTML = "";
  const initOpt = document.createElement("option");
  initOpt.value = targetInitialMonth;
  initOpt.textContent = targetInitialMonth;
  select.appendChild(initOpt);
  select.value = targetInitialMonth;

  try {
    const json = await apiGet("getAvailableMonths");
    if (json.months && json.months.length > 0) {
      try {
        sessionStorage.setItem(MONTHS_CACHE_KEY, JSON.stringify({ ts: Date.now(), months: json.months }));
      } catch (e) {}
      populateMonthDropdown_(select, json.months, currentMonthName);
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
  const isLight = document.documentElement.classList.contains("light-theme");
  const icon = document.getElementById("dockThemeIcon");
  const label = document.getElementById("dockThemeLabel");
  if (icon && label) {
    icon.className = isLight ? "fa-solid fa-moon text-indigo-400" : "fa-solid fa-sun text-amber-400";
    label.textContent = isLight ? "Dark" : "Light";
  }
  const dIcon = document.getElementById("drawerThemeIcon");
  const dLabel = document.getElementById("drawerThemeLabel");
  if (dIcon && dLabel) {
    dIcon.className = isLight ? "fa-solid fa-moon text-indigo-400" : "fa-solid fa-sun text-amber-400";
    dLabel.textContent = isLight ? "Dark Mode" : "Light Mode";
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

function quickJumpToRoom(targetPage, roomOverride = "", residentName = "", monthOverride = "") {
  const inp = document.getElementById("globalQuickRoomInput");
  const rm = roomOverride || (inp ? String(inp.value || "").trim() : "");
  if (!/^[1-6]0[1-7]$/.test(rm)) {
    alert("Enter a valid room number between 101 and 607 (e.g. 101, 304, 607), or pick a resident below.");
    return;
  }
  localStorage.setItem("elysium_quick_room", rm);
  let url = `${targetPage}?room=${encodeURIComponent(rm)}`;
  if (residentName) url += `&resident=${encodeURIComponent(residentName)}`;
  if (monthOverride) url += `&month=${encodeURIComponent(monthOverride)}`;
  window.location.href = url;
}

let __globalDirCache = null;
let __globalDirFetching = false;

async function onGlobalDrawerSearch() {
  const inp = document.getElementById("globalQuickRoomInput");
  const box = document.getElementById("globalDrawerSearchResults");
  if (!inp || !box) return;
  const raw = (inp.value || "").trim();
  if (!raw) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");

  if (!__globalDirCache) {
    try {
      const saved = sessionStorage.getItem("elysium_dir_cache_v25");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.list) && (Date.now() - parsed.ts < 180000)) {
          __globalDirCache = parsed.list;
        }
      }
    } catch (e) {}
  }

  if (!__globalDirCache) {
    if (__globalDirFetching) return;
    __globalDirFetching = true;
    box.innerHTML = `<p class="text-[11px] text-slate-400 py-2 text-center"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Loading directory...</p>`;
    try {
      const json = await apiGet("getAllResidentsIndex");
      if (json && json.status === "success" && Array.isArray(json.residents)) {
        __globalDirCache = json.residents;
        try {
          sessionStorage.setItem("elysium_dir_cache_v25", JSON.stringify({ ts: Date.now(), list: __globalDirCache }));
        } catch (e) {}
      }
    } catch (e) {
      box.innerHTML = `<p class="text-[11px] text-rose-400 py-1">${esc(e.message)}</p>`;
      __globalDirFetching = false;
      return;
    }
    __globalDirFetching = false;
  }

  const qLower = raw.toLowerCase();
  const qDigits = raw.replace(/\D/g, "");
  const matches = (__globalDirCache || []).filter(r => {
    const roomMatch = String(r.roomNumber || "").includes(raw);
    const nameMatch = String(r.name || "").toLowerCase().includes(qLower);
    const mobDigits = String(r.mobile || "").replace(/\D/g, "");
    const mobileMatch = qDigits.length >= 2 && mobDigits.includes(qDigits);
    return roomMatch || nameMatch || mobileMatch;
  });

  if (matches.length === 0) {
    box.innerHTML = `<p class="text-[11px] text-slate-400 py-1.5 px-1">No matches for "${esc(raw)}".</p>`;
    return;
  }

  box.innerHTML = matches.slice(0, 10).map(r => {
    const isDaily = r.type === "Daily";
    const hasLeft = Boolean(r.hasLeft);
    const bal = Number(r.balance) || 0;
    const cleanMob = String(r.mobile || "").replace(/\D/g, "").slice(-10);
    const tag = isDaily
      ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">Daily &bull; ${esc(r.roomNumber)}</span>`
      : `<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold">Rm ${esc(r.roomNumber)}</span>`;
    const vacTag = hasLeft ? `<span class="px-1.5 py-0.5 rounded bg-slate-600/40 text-slate-300 text-[9px] font-bold">Vacated</span>` : "";
    const idTag = !isDaily ? (r.hasAadhaar
      ? `<span class="text-emerald-400 text-[10px]" title="Aadhaar Verified"><i class="fa-solid fa-id-card"></i></span>`
      : `<span class="text-rose-400 text-[10px]" title="Aadhaar Missing"><i class="fa-solid fa-id-card"></i></span>`) : "";
    const recMonth = r.month || "";
    const actions = isDaily
      ? `<a href="daily_staying.html?tab=${hasLeft ? 'completed' : 'active'}&q=${encodeURIComponent(r.name)}${recMonth ? `&month=${encodeURIComponent(recMonth)}` : ""}" class="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold no-underline">${hasLeft ? 'Past' : 'Daily'}</a>`
      : `${(!hasLeft || bal > 0) ? `<button type="button" data-room="${esc(r.roomNumber)}" data-name="${esc(r.name)}" data-month="${esc(recMonth)}" onclick="quickJumpToRoom('rent.html', this.dataset.room, this.dataset.name, this.dataset.month)" class="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold">Rent</button>` : ""}
         <button type="button" data-room="${esc(r.roomNumber)}" data-name="${esc(r.name)}" data-month="${esc(recMonth)}" onclick="quickJumpToRoom('resident_details.html', this.dataset.room, this.dataset.name, this.dataset.month)" class="px-2 py-1 rounded bg-teal-600 text-white text-[10px] font-bold">Specs</button>`;
    return `
      <div class="p-2 rounded-xl bg-slate-800/80 flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${tag}
            <span class="font-bold text-white truncate">${esc(r.name)}</span>
            ${idTag}
            ${vacTag}
          </div>
          <p class="text-[10px] text-slate-400 font-mono">${cleanMob || "No mobile"}${r.vacatedOn ? ` &bull; ${hasLeft ? 'Vacated' : 'Vacating'} ${esc(r.vacatedOn)}` : ''}</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${cleanMob ? `<a href="tel:${cleanMob}" class="w-6 h-6 rounded bg-blue-500/20 text-blue-300 flex items-center justify-center text-[10px] no-underline"><i class="fa-solid fa-phone"></i></a>` : ""}
          ${actions}
        </div>
      </div>`;
  }).join("");
}

function injectQuickNavDock() {
  applySavedTheme();
  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (path === "login.html" || document.getElementById("elysiumAppDrawer")) return;

  const isAndroidApp = !!(window.AndroidBiometric && typeof window.AndroidBiometric.isApp === "function" && window.AndroidBiometric.isApp());
  if (isAndroidApp) document.body.classList.add("is-android-app");
  const isIndexPage = (path === "" || path === "index.html");
  const isMobileViewport = !!(window.matchMedia && window.matchMedia("(max-width: 767px)").matches);
  const hideBottomDock = isIndexPage && (isAndroidApp || isMobileViewport);

  // Auto-select room if navigated via Quick Room Jump (rent.html & resident_details.html handle deep links natively)
  const handlesDeepLinkNatively = (path === "rent.html" || path === "resident_details.html");
  const urlRoom = new URLSearchParams(window.location.search).get("room") || localStorage.getItem("elysium_quick_room");
  if (urlRoom && /^[1-6]0[1-7]$/.test(urlRoom)) {
    localStorage.removeItem("elysium_quick_room");
    if (!handlesDeepLinkNatively) {
      setTimeout(() => {
        if (typeof showFloor === "function" && typeof selectRoom === "function") {
          showFloor(parseInt(urlRoom[0], 10));
          selectRoom(urlRoom);
        }
      }, 350);
    }
  }

  const isLight = document.documentElement.classList.contains("light-theme");

  if (!hideBottomDock) {
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
    themeBtn.innerHTML = `<i id="dockThemeIcon" class="fa-solid ${isLight ? 'fa-moon text-indigo-400' : 'fa-sun text-amber-400'}"></i><span id="dockThemeLabel">${isLight ? 'Dark' : 'Light'}</span>`;
    dock.appendChild(themeBtn);

    document.body.appendChild(dock);
  }

  // Universal Slide-Up App Drawer (Quick Room Jump + All 10 Modules)
  const role = getAuthRole();
  const drawer = document.createElement("div");
  drawer.id = "elysiumAppDrawer";
  drawer.onclick = (e) => { if (e.target === drawer) toggleElysiumDrawer(false); };
  drawer.innerHTML = `
    <div class="drawer-sheet">
      <div class="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-4"></div>
      <div class="flex items-center justify-between gap-2 mb-4">
        <div>
          <p class="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Elysium OS Command</p>
          <h3 class="text-base font-bold text-white">Menu &amp; Quick Jump</h3>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="toggleAppTheme()" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1.5" title="Switch Theme">
            <i id="drawerThemeIcon" class="fa-solid ${isLight ? 'fa-moon text-indigo-400' : 'fa-sun text-amber-400'}"></i>
            <span id="drawerThemeLabel">${isLight ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          <button type="button" onclick="toggleElysiumDrawer(false)" class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center" aria-label="Close Menu">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Universal Smart Search (Room #, Name, or Mobile) -->
      <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 mb-4 space-y-2.5">
        <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-amber-400 mr-1"></i> Smart Search (Room #, Name, or Mobile)
        </label>
        <div class="flex items-center gap-2">
          <input type="text" id="globalQuickRoomInput" oninput="onGlobalDrawerSearch()" onfocus="onGlobalDrawerSearch()"
                 autocomplete="off" placeholder="Room, Name, or Phone..."
                 class="flex-1 min-w-0 text-xs font-bold px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white" />
          <button type="button" onclick="quickJumpToRoom('rent.html')" class="py-2 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl">
            Rent
          </button>
          <button type="button" onclick="quickJumpToRoom('resident_details.html')" class="py-2 px-2.5 bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold rounded-xl">
            Specs
          </button>
          <button type="button" onclick="quickJumpToRoom('new_resident.html')" class="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl">
            Join
          </button>
        </div>
        <div id="globalDrawerSearchResults" class="hidden space-y-1.5 max-h-56 overflow-y-auto pt-1 border-t border-slate-800"></div>
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
        <a href="workers.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center"><i class="fa-solid fa-users-gear"></i></span>
          <span>Workers</span>
        </a>
        <a href="complaints.html" class="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 text-white no-underline">
          <span class="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center"><i class="fa-solid fa-clipboard-list"></i></span>
          <span>Complaints</span>
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


// =============================================================
// V28: DYNAMIC PAYMENT & EXPENSE HANDLERS AUTO-SYNC ENGINE
// =============================================================
(function initElysiumHandlersEngine() {
  const CACHE_KEY = "elysium_handlers_v28";
  const DEFAULT_LIST = [
    { id: "h_sreekaran", name: "Sreekaran", aliases: ["karan"], active: true, system: false, profitSplit: true },
    { id: "h_manohar", name: "Manohar", aliases: [], active: true, system: false, profitSplit: true },
    { id: "h_sudheer", name: "Sudheer", aliases: [], active: true, system: false, profitSplit: true },
    { id: "h_cash", name: "Cash", aliases: ["direct"], active: true, system: true, profitSplit: false },
    { id: "h_office", name: "Office Account", aliases: ["office"], active: true, system: false, profitSplit: false }
  ];
  const SEED_NAMES = ["sreekaran", "manohar", "sudheer", "office account"];

  function readCachedHandlers() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}
    return DEFAULT_LIST.slice();
  }

  function writeCachedHandlers(list) {
    if (!Array.isArray(list) || !list.length) return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  window.getElysiumHandlers = function (opts) {
    const all = readCachedHandlers();
    if (opts && opts.includeArchived) return all;
    return all.filter(h => h.active !== false);
  };

  window.setElysiumHandlersCache = function (list) {
    writeCachedHandlers(list);
    window.hydrateHandlerSelects();
    window.dispatchEvent(new CustomEvent("elysium:handlerschange", { detail: { handlers: readCachedHandlers() } }));
  };

  window.refreshElysiumHandlers = async function (force) {
    if (typeof apiGet !== "function" || !isAuthenticated()) return readCachedHandlers();
    try {
      const res = await apiGet("getHandlers", force ? { forceRefresh: "true" } : {});
      if (res && res.status === "success" && Array.isArray(res.handlers)) {
        writeCachedHandlers(res.handlers);
        window.hydrateHandlerSelects();
        window.dispatchEvent(new CustomEvent("elysium:handlerschange", { detail: { handlers: res.handlers } }));
        return res.handlers;
      }
    } catch (e) {}
    return readCachedHandlers();
  };

  function isHandlerSelect(sel) {
    if (!sel || sel.tagName !== "SELECT") return false;
    if (sel.dataset.elysiumHandlerSelect === "1") return true;
    const vals = Array.from(sel.options).map(o => String(o.value || "").trim().toLowerCase());
    let hits = 0;
    SEED_NAMES.forEach(n => { if (vals.indexOf(n) !== -1) hits++; });
    if (hits >= 2) {
      sel.dataset.elysiumHandlerSelect = "1";
      sel.dataset.includeCash = vals.indexOf("cash") !== -1 ? "1" : "0";
      const specials = [];
      Array.from(sel.options).forEach((o, idx) => {
        const vLow = String(o.value || "").trim().toLowerCase();
        const isKnown = SEED_NAMES.indexOf(vLow) !== -1 || vLow === "cash";
        if (!isKnown) {
          specials.push({ value: o.value, text: o.text, pos: idx === 0 ? "top" : "bottom" });
        }
      });
      sel.dataset.specialOptions = JSON.stringify(specials);
      return true;
    }
    return false;
  }

  function hydrateSingleSelect(sel, activeList, allList) {
    const prevVal = sel.value;
    const includeCash = sel.dataset.includeCash !== "0";
    let specials = [];
    try { specials = JSON.parse(sel.dataset.specialOptions || "[]"); } catch (e) {}

    const targetList = activeList.filter(h => includeCash || !h.system);
    const frag = document.createDocumentFragment();

    // 1. Preserve top placeholder / "All" / "None (Cash)" option
    specials.filter(s => s.pos === "top").forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.value;
      opt.textContent = s.text;
      frag.appendChild(opt);
    });

    // 2. Populate Active handlers in Master Admin's configured order
    const presentLow = {};
    targetList.forEach(h => {
      const opt = document.createElement("option");
      opt.value = h.name;
      opt.textContent = h.name;
      frag.appendChild(opt);
      presentLow[h.name.toLowerCase()] = true;
    });

    // 3. Preserve bottom special options (e.g. "None (Cash)", "No Deposit Refunded")
    specials.filter(s => s.pos !== "top").forEach(s => {
      if (presentLow[String(s.value || "").toLowerCase()]) return;
      const opt = document.createElement("option");
      opt.value = s.value;
      opt.textContent = s.text;
      frag.appendChild(opt);
      presentLow[String(s.value || "").toLowerCase()] = true;
    });

    // 4. Archive-safe preservation if currently selected value is an archived/historical name
    if (prevVal && !presentLow[String(prevVal).trim().toLowerCase()]) {
      const isSpecial = specials.some(s => String(s.value) === String(prevVal));
      if (!isSpecial) {
        const archived = allList.find(h => h.name.toLowerCase() === String(prevVal).trim().toLowerCase());
        const opt = document.createElement("option");
        opt.value = prevVal;
        opt.textContent = archived ? `${archived.name} (Archived)` : `${prevVal} (Historical)`;
        frag.appendChild(opt);
      }
    }

    sel.innerHTML = "";
    sel.appendChild(frag);
    if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
      sel.value = prevVal;
    }
  }

  window.hydrateHandlerSelects = function (root) {
    const scope = root || document;
    const allList = readCachedHandlers();
    const activeList = allList.filter(h => h.active !== false);
    scope.querySelectorAll("select").forEach(sel => {
      if (isHandlerSelect(sel)) hydrateSingleSelect(sel, activeList, allList);
    });
  };

  // Archive-safe programmatic `select.value = oldArchivedPerson` for Edit modals
  const valDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  if (valDesc && valDesc.set) {
    Object.defineProperty(HTMLSelectElement.prototype, "value", {
      get: function () { return valDesc.get.call(this); },
      set: function (v) {
        if (this.dataset && this.dataset.elysiumHandlerSelect === "1" && v !== null && v !== undefined && String(v).trim() !== "") {
          const sv = String(v);
          const exists = Array.from(this.options).some(o => o.value === sv);
          if (!exists) {
            const opt = document.createElement("option");
            opt.value = sv;
            opt.textContent = `${sv} (Archived)`;
            this.appendChild(opt);
          }
        }
        valDesc.set.call(this, v);
      }
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    window.hydrateHandlerSelects();
    if (!/login\.html/i.test(window.location.pathname) && isAuthenticated()) {
      window.refreshElysiumHandlers(false);
    }
  });
})();
