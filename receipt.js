// receipt.js - rent receipts as PDF, shared to the resident on WhatsApp.
// Everything runs in the browser with jsPDF (free, open source) and the phone's own
// share sheet / wa.me links. No paid WhatsApp API and no server involved.
// Needs: auth.js (esc, whatsappNumber, PG_CONFIG) and the jsPDF script on the page.
// ---------------------------------------------------------------------------

let currentReceipt = null;
let currentReceiptFile = null;

function inr(n) {
  return "Rs. " + (Number(n) || 0).toLocaleString("en-IN");
}

// jsPDF's built-in fonts only cover Latin characters
function pdfText(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[^\x20-\xFF]/g, "?");
}

function prettyDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || "");
  return `${m[3]} ${MONTH_NAMES[parseInt(m[2], 10) - 1].slice(0, 3)} ${m[1]}`;
}

function receiptFileName(r) {
  const safeName = String(r.name || "resident").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const no = r.receiptNo && r.receiptNo !== "-" ? r.receiptNo : "statement";
  return `Receipt_${no}_Room${r.room}_${safeName}.pdf`;
}

function receiptMessage(r) {
  const paidLine = r.balance > 0
    ? `Balance still due for ${r.month}: ${inr(r.balance)}.`
    : `Your rent for ${r.month} is fully paid.`;
  return `Hi ${r.name}, thank you! We have received ${inr(r.amount)} towards ${r.month} rent for Room ${r.room} on ${prettyDate(r.paymentDate)}. ${paidLine} Your receipt is attached. - ${PG_CONFIG.pgName}`;
}

// Builds the PDF and returns a File (null if jsPDF failed to load)
function buildReceiptFile(r) {
  if (!window.jspdf || !window.jspdf.jsPDF) return null;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const W = 148;
  const left = 14;
  const right = W - 14;

  // Header
  doc.setFillColor(67, 56, 202);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfText(PG_CONFIG.pgName), left, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Rent Receipt", left, 21);
  doc.setFontSize(9);
  doc.text(`Receipt No: ${pdfText(r.receiptNo && r.receiptNo !== "-" ? r.receiptNo : "-")}`, right, 14, { align: "right" });
  doc.text(`Date: ${pdfText(prettyDate(r.paymentDate))}`, right, 21, { align: "right" });

  // Details
  doc.setTextColor(30, 41, 59);
  let y = 44;
  const row = (label, value) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(label, left, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(pdfText(value), right, y, { align: "right" });
    y += 8;
  };
  row("Received from", r.name);
  row("Room", r.room);
  row("Rent month", r.month);
  row("Payment mode", r.mode || "-");

  // Amount block
  y += 2;
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(left, y, right - left, 24, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Amount received", left + 5, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(67, 56, 202);
  doc.text(inr(r.amount), left + 5, y + 19);
  y += 34;

  // Month summary
  doc.setDrawColor(226, 232, 240);
  doc.line(left, y - 6, right, y - 6);
  row("Rent for the month", inr(r.rentDue));
  if (Number(r.arrears) > 0) row("Previous dues carried forward", inr(r.arrears));
  row("Total paid so far", inr(r.totalPaid));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (r.balance > 0) {
    doc.setTextColor(190, 18, 60);
    doc.text("Balance due", left, y);
    doc.text(inr(r.balance), right, y, { align: "right" });
  } else {
    doc.setTextColor(5, 150, 105);
    doc.text("Status", left, y);
    doc.text("Paid in full", right, y, { align: "right" });
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a computer-generated receipt and does not need a signature.", W / 2, 196, { align: "center" });
  doc.text(`Thank you for staying with ${pdfText(PG_CONFIG.pgName)}.`, W / 2, 201, { align: "center" });

  const blob = doc.output("blob");
  return new File([blob], receiptFileName(r), { type: "application/pdf" });
}

function setReceiptStatus(text, kind) {
  const box = document.getElementById("receiptStatus");
  if (!box) return;
  if (!text) { box.classList.add("hidden"); return; }
  const tone = kind === "error"
    ? "bg-rose-50 text-rose-700 border border-rose-200"
    : (kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-50 text-slate-600 border border-slate-200");
  box.className = `mt-3 p-2.5 rounded-xl text-xs font-semibold ${tone}`;
  box.textContent = text;
}

function openReceiptModal(receipt) {
  currentReceipt = receipt;
  currentReceiptFile = buildReceiptFile(receipt); // built now so the share button can respond instantly

  const rows = [
    ["Receipt", receipt.receiptNo && receipt.receiptNo !== "-" ? receipt.receiptNo : "Statement"],
    ["Resident", `${receipt.name} (Room ${receipt.room})`],
    ["Month", receipt.month],
    ["Amount received", inr(receipt.amount)],
    ["Total paid", inr(receipt.totalPaid)],
    ["Balance", receipt.balance > 0 ? inr(receipt.balance) : "Paid in full"]
  ];
  document.getElementById("receiptPreview").innerHTML = rows.map(([k, v]) =>
    `<div class="flex justify-between gap-3"><span class="text-slate-500">${esc(k)}</span><span class="font-bold text-slate-800 text-right">${esc(v)}</span></div>`
  ).join("");

  const hasNumber = Boolean(whatsappNumber(receipt.mobile));
  document.getElementById("receiptChatBtn").disabled = !hasNumber;
  document.getElementById("receiptChatBtn").classList.toggle("opacity-50", !hasNumber);

  if (!currentReceiptFile) {
    setReceiptStatus("PDF library did not load. Check your internet connection and reopen this receipt.", "error");
  } else if (!hasNumber) {
    setReceiptStatus("No valid mobile number is saved for this resident - you can still share the PDF and pick the contact yourself.", "info");
  } else {
    setReceiptStatus("");
  }
  document.getElementById("receiptModal").classList.remove("hidden");
}

function closeReceiptModal() {
  document.getElementById("receiptModal").classList.add("hidden");
  currentReceipt = null;
  currentReceiptFile = null;
}

function downloadReceiptPdf() {
  if (!currentReceiptFile) return;
  const url = URL.createObjectURL(currentReceiptFile);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentReceiptFile.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function openReceiptChat() {
  if (!currentReceipt) return;
  const num = whatsappNumber(currentReceipt.mobile);
  if (!num) return;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(receiptMessage(currentReceipt))}`, "_blank");
}

// One tap: opens the phone's share sheet with the PDF attached - choose WhatsApp, then the resident.
// Where the browser cannot share files (most desktops), the PDF is downloaded and the resident's
// WhatsApp chat opens with the message ready, so only the attach step is manual.
async function shareReceiptPdf() {
  if (!currentReceipt || !currentReceiptFile) return;
  const text = receiptMessage(currentReceipt);

  try {
    if (navigator.canShare && navigator.canShare({ files: [currentReceiptFile] })) {
      await navigator.share({ files: [currentReceiptFile], title: "Rent receipt", text: text });
      setReceiptStatus("Shared. Pick the resident's chat in WhatsApp to send it.", "ok");
      return;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return; // person closed the share sheet
    console.warn("File share failed, using fallback", err);
  }

  downloadReceiptPdf();
  const num = whatsappNumber(currentReceipt.mobile);
  if (num) {
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank");
    setReceiptStatus("PDF downloaded and the chat is opening. Attach the downloaded PDF (paperclip) and send.", "info");
  } else {
    setReceiptStatus("PDF downloaded. Open WhatsApp and attach it to the resident's chat.", "info");
  }
}

// Builds a receipt object from a Payments-tab history row
function receiptFromHistory(p, resident) {
  return {
    receiptNo: p.receiptNo,
    month: p.month,
    room: p.room,
    name: p.name,
    mobile: (resident && resident.mobile) || p.mobile || "",
    amount: p.amount,
    totalPaid: p.totalPaid,
    rentDue: resident && resident.expectedRent !== undefined ? Number(resident.expectedRent) || 0 : p.rentDue,
    arrears: resident ? Number(resident.arrears) || 0 : 0,
    balance: p.balance,
    paymentDate: p.paymentDate,
    mode: p.mode
  };
}
