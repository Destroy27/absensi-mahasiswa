/**
 * Helper bersama: inisialisasi Firebase, konstanta status,
 * format tanggal/jam, dan komponen kecil (toast, badge).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/* ===== Status kehadiran ===== */
export const STATUS = {
  hadir:  { label: "Hadir",  emoji: "✅", cls: "hadir"  },
  sakit:  { label: "Sakit",  emoji: "🤒", cls: "sakit"  },
  izin:   { label: "Izin",   emoji: "📝", cls: "izin"   },
  dispen: { label: "Dispen", emoji: "🎫", cls: "dispen" }
};
export const STATUS_KEYS = Object.keys(STATUS);

/* ===== Waktu ===== */
export const pad = (n) => String(n).padStart(2, "0");

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const nowHM = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "HH:MM" -> menit sejak tengah malam */
export const toMinutes = (hm) => {
  const [h, m] = String(hm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-11-20" -> "Jumat, 20 November 2026" */
export function fmtDateID(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-11-20" -> "20 Nov 2026" */
export function fmtShortID(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** Firestore Timestamp -> "HH:MM" */
export function fmtTime(ts) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Firestore Timestamp -> Date (atau null) */
export const toDate = (ts) => ts?.toDate?.() ?? null;

/* ===== Keamanan tampilan ===== */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ===== Komponen ===== */
export function statusBadge(key) {
  const s = STATUS[key] || { label: key || "—", emoji: "•", cls: "" };
  return `<span class="badge ${s.cls}">${s.emoji} ${escapeHtml(s.label)}</span>`;
}

let toastTimer = null;
export function toast(message, kind = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 2800);
}

/**
 * Status sesi pada waktu tertentu.
 * @returns {{open:boolean, code:'open'|'wait'|'closed'|'none', text:string}}
 */
export function sessionState(session, now = new Date()) {
  if (!session) return { open: false, code: "none", text: "Belum ada sesi" };
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(session.openAt);
  const close = toMinutes(session.closeAt);

  if (cur < open) return { open: false, code: "wait", text: "Belum dibuka" };
  if (cur > close) return { open: false, code: "closed", text: "Sudah ditutup" };
  return { open: true, code: "open", text: "Absen dibuka" };
}
