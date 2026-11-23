/**
 * Halaman Data (data.html)
 * - Rekap semua absensi
 * - Filter sesi / status / pencarian
 * - Statistik, export CSV, cetak, hapus baris
 */
import {
  collection, getDocs, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  db, STATUS, fmtShortID, fmtTime, escapeHtml, toast, statusBadge
} from "./common.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  rows: [],
  members: [],
  sessions: [],
  filtered: []
};

/* Nilai statistik terakhir, supaya count-up hanya jalan saat angka berubah. */
const statPrev = [];

init();

/* =========================================================
   Inisialisasi
   ========================================================= */
async function init() {
  $("#resetBtn").addEventListener("click", resetFilters);
  $("#csvBtn").addEventListener("click", exportCsv);
  $("#printBtn").addEventListener("click", () => window.print());

  ["#fSession", "#fStatus"].forEach((sel) =>
    $(sel).addEventListener("change", applyFilters));
  $("#fSearch").addEventListener("input", applyFilters);

  try {
    const [memberSnap, sessionSnap, attSnap] = await Promise.all([
      getDocs(collection(db, "members")),
      getDocs(collection(db, "sessions")),
      getDocs(collection(db, "attendance"))
    ]);

    state.members = memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.sessions = sessionSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    const memberMap = Object.fromEntries(state.members.map((m) => [m.id, m]));
    const sessionMap = Object.fromEntries(state.sessions.map((s) => [s.id, s]));

    state.rows = attSnap.docs.map((d) => {
      const data = d.data();
      const member = memberMap[data.memberId];
      const session = sessionMap[data.sessionId];
      return {
        id: d.id,
        ...data,
        memberName: data.memberName || member?.name || "—",
        memberEmoji: member?.emoji || "💗",
        sessionTitle: data.sessionTitle || session?.title || "—",
        date: data.sessionDate || session?.date || ""
      };
    }).sort(sortRowsDesc);

  } catch (err) {
    console.error(err);
    $("#tbody").innerHTML = `<tr><td colspan="7" class="empty">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  fillSessionFilter();
  applyFilters();
}

/* =========================================================
   Filter
   ========================================================= */
function fillSessionFilter() {
  const options = state.sessions
    .map((s) => `<option value="${s.id}">${escapeHtml(fmtShortID(s.date))} — ${escapeHtml(s.title || "Sesi")}</option>`)
    .join("");
  $("#fSession").innerHTML = `<option value="">Semua sesi</option>${options}`;
}

function resetFilters() {
  $("#fSession").value = "";
  $("#fStatus").value = "";
  $("#fSearch").value = "";
  applyFilters();
}

function applyFilters() {
  const sessionId = $("#fSession").value;
  const status = $("#fStatus").value;
  const term = $("#fSearch").value.trim().toLowerCase();

  state.filtered = state.rows.filter((r) => {
    if (sessionId && r.sessionId !== sessionId) return false;
    if (status && r.status !== status) return false;
    if (term) {
      const hay = `${r.memberName} ${r.reason || ""} ${r.sessionTitle || ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  renderStats();
  renderTable();
}

/* =========================================================
   Render
   ========================================================= */
function renderStats() {
  const counts = { hadir: 0, sakit: 0, izin: 0, dispen: 0 };
  state.filtered.forEach((r) => { if (counts[r.status] != null) counts[r.status]++; });

  const total = state.filtered.length;
  const pct = total ? Math.round((counts.hadir / total) * 100) : 0;

  const cells = [
    { value: total, label: "Total", cls: "", suffix: "" },
    { value: counts.hadir, label: "Hadir", cls: "hadir", suffix: "" },
    { value: counts.sakit, label: "Sakit", cls: "sakit", suffix: "" },
    { value: counts.izin, label: "Izin", cls: "izin", suffix: "" },
    { value: counts.dispen, label: "Dispen", cls: "dispen", suffix: "" },
    { value: pct, label: "Kehadiran", cls: "pct", suffix: "%" }
  ];

  const statsEl = $("#stats");
  statsEl.innerHTML = cells.map((c) =>
    `<div class="stat${c.cls ? " " + c.cls : ""}"><b>${c.value}${c.suffix}</b><span>${c.label}</span></div>`
  ).join("");

  statsEl.querySelectorAll(".stat b").forEach((b, i) => {
    const c = cells[i];
    const key = c.value + c.suffix;
    if (statPrev[i] === key) return; // angka sama, tidak perlu animasi ulang
    statPrev[i] = key;
    countUp(b, c.value, c.suffix);
  });
}

/* Angka statistik berjalan 0 -> nilai akhir (count-up). */
function countUp(el, target, suffix = "") {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target + suffix;
    return;
  }
  const duration = 600;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3); // mendekati cubic-bezier(.22,1,.36,1)
  el.textContent = "0" + suffix;
  const frame = (now) => {
    const p = Math.min(1, (now - start) / duration);
    if (p < 1) {
      el.textContent = Math.round(ease(p) * target) + suffix;
      requestAnimationFrame(frame);
    } else {
      el.textContent = target + suffix;
    }
  };
  requestAnimationFrame(frame);
}

function renderTable() {
  const tbody = $("#tbody");
  $("#rowInfo").textContent = `${state.filtered.length} baris`;

  if (!state.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Tidak ada data yang cocok.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.filtered.map((r) => `
    <tr>
      <td>${escapeHtml(fmtShortID(r.date))}</td>
      <td>${escapeHtml(r.sessionTitle)}</td>
      <td>${escapeHtml(r.memberEmoji)} ${escapeHtml(r.memberName)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="reason">${r.reason ? escapeHtml(r.reason) : '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(fmtTime(r.updatedAt || r.createdAt))}</td>
      <td class="no-print">
        <button class="btn btn-danger btn-sm" data-del="${escapeHtml(r.id)}" type="button">Hapus</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => removeRow(btn.dataset.del));
  });
}

/* =========================================================
   Aksi
   ========================================================= */
async function removeRow(id) {
  if (!confirm("Hapus data absensi ini?")) return;
  try {
    await deleteDoc(doc(db, "attendance", id));
    state.rows = state.rows.filter((r) => r.id !== id);
    applyFilters();
    toast("Data dihapus", "ok");
  } catch (err) {
    console.error(err);
    toast("Gagal menghapus: " + err.message, "err");
  }
}

function exportCsv() {
  if (!state.filtered.length) return toast("Tidak ada data untuk diexport", "err");

  const head = ["Tanggal", "Sesi", "Nama", "Status", "Alasan", "Jam"];
  const lines = state.filtered.map((r) => [
    r.date,
    r.sessionTitle,
    r.memberName,
    STATUS[r.status]?.label || r.status,
    r.reason || "",
    fmtTime(r.updatedAt || r.createdAt)
  ]);

  const csv = [head, ...lines]
    .map((cols) => cols.map(csvCell).join(";"))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `absensi-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Beri waktu browser memulai unduhan sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("CSV diunduh", "ok");
}

/** Cegah CSV/formula injection saat dibuka di Excel. */
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  s = s.replace(/"/g, '""');
  return /[;"\r\n]/.test(s) ? `"${s}"` : s;
}

function sortRowsDesc(a, b) {
  const ta = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
  const tb = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
  if (tb !== ta) return tb - ta;
  return String(b.date).localeCompare(String(a.date));
}
