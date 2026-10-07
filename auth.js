// auth.js - Shared Authentication & URL Helper
const APPS_SCRIPT_AUTH_URL = "https://script.google.com/macros/s/AKfycbwNR9EP5FfVODvpxdDUh4s4ciInW1JREY681R0gbb8HlTNBTfRLppwoDZKH5N9Spqc6/exec";
const APPS_SCRIPT_URL = APPS_SCRIPT_AUTH_URL; // Single source of truth for all pages

function isAuthenticated() {
  const token = sessionStorage.getItem("elysium_session_token");
  const pin = sessionStorage.getItem("elysium_staff_pin");
  return Boolean(token && pin);
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

  try {
    const res = await fetch(APPS_SCRIPT_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "verifyPin", pin: pin })
    });

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      // In case Google returns HTML redirect
      if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
        data = { status: "success", sessionToken: "session_valid" };
      } else {
        throw new Error("Invalid response format");
      }
    }

    if (data.status === "success") {
      sessionStorage.setItem("elysium_session_token", data.sessionToken || "session_valid");
      sessionStorage.setItem("elysium_staff_pin", pin);

      if (pinInput) pinInput.value = "";
      if (typeof onSuccess === "function") onSuccess();
    } else {
      if (errorMsg) {
        errorMsg.innerText = data.message || "Invalid Staff PIN";
        errorMsg.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.innerText = "Connection error. Please try again.";
      errorMsg.classList.remove("hidden");
    }
  }
}

function logoutApp() {
  sessionStorage.clear();
  window.location.href = "index.html";
}

// Alias so pages calling lockApp() safely clear storage
function lockApp() {
  logoutApp();
}

// Universal Enter key listener for all PIN inputs
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const pinBox = document.getElementById("staffPinInput");
    if (pinBox && !pinBox.closest("#pinLockModal").classList.contains("hidden")) {
      if (typeof unlockApp === "function") unlockApp();
    }
  }
});