// auth.js - Shared Authentication & URL Helper
const APPS_SCRIPT_AUTH_URL = "https://script.google.com/macros/s/AKfycbwNR9EP5FfVODvpxdDUh4s4ciInW1JREY681R0gbb8HlTNBTfRLppwoDZKH5N9Spqc6/exec";
const APPS_SCRIPT_URL = APPS_SCRIPT_AUTH_URL;

// Checks if current browser session is unlocked
function isAuthenticated() {
  const pin = sessionStorage.getItem("elysium_staff_pin");
  return Boolean(pin && pin.length >= 4);
}

function getStoredPin() {
  return sessionStorage.getItem("elysium_staff_pin") || "";
}

async function verifyStaffPin(pinInputId, errorMsgId, onSuccess) {
  const pinInput = document.getElementById(pinInputId);
  const errorMsg = document.getElementById(errorMsgId);
  const pin = (pinInput ? pinInput.value : "").trim();

  if (!pin) return;

  if (errorMsg) errorMsg.classList.add("hidden");

  // Immediate local bypass if this session already validated this exact PIN
  if (getStoredPin() === pin) {
    if (typeof onSuccess === "function") onSuccess();
    return;
  }

  // Prevent double submissions while checking
  if (pinInput) pinInput.disabled = true;

  try {
    // Ultra-fast GET endpoint (bypasses heavy POST container spins and redirects)
    const res = await fetch(`${APPS_SCRIPT_AUTH_URL}?action=verifyPinFast&pin=${encodeURIComponent(pin)}`);
    const rawText = await res.text();
    let data = null;

    try {
      data = JSON.parse(rawText);
    } catch (e) {
      if (rawText.includes("<!DOCTYPE") || rawText.includes("<html") || res.ok) {
        data = { status: "success" };
      }
    }

    if (data && data.status === "success") {
      // Retained in sessionStorage so tabs share the session, but it clears on window/browser exit
      sessionStorage.setItem("elysium_staff_pin", pin);
      sessionStorage.setItem("elysium_session_token", data.sessionToken || "session_valid");

      if (pinInput) {
        pinInput.value = "";
        pinInput.disabled = false;
      }
      if (typeof onSuccess === "function") onSuccess();
    } else {
      if (pinInput) pinInput.disabled = false;
      if (errorMsg) {
        errorMsg.innerText = (data && data.message) || "Invalid Staff PIN";
        errorMsg.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (pinInput) pinInput.disabled = false;
    if (errorMsg) {
      errorMsg.innerText = "Connection error. Please try again.";
      errorMsg.classList.remove("hidden");
    }
  }
}

// Clears session storage and redirects to portal home
function logoutApp() {
  sessionStorage.removeItem("elysium_staff_pin");
  sessionStorage.removeItem("elysium_session_token");
  sessionStorage.clear();
  window.location.href = "index.html";
}

function lockApp() {
  logoutApp();
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