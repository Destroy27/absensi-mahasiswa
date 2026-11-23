/**
 * Halaman Admin (admin.html)
 * - Gerbang PIN sederhana (bukan autentikasi kuat — lihat README)
 * - CRUD anggota & sesi
 * - Pengaturan aplikasi
 */
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, fmtDateID, todayStr, toMinutes, toast, escapeHtml, sessionState } from "./common.js";

const $ = (sel) => document.querySelector(sel);

const DEFAULT_SETTINGS = {
  adminPin: "123456",
  appTitle: "Absensi Harian",
  pageTitle: "Absen Hari Ini",
  subtitle: "Pilih nama, lalu tandai kehadiranmu.",
  requireReason: false
};

const state = { settings: {}, members: [], sessions: [] };

init();

/* =========================================================
   Gerbang admin
   ========================================================= */
async function init() {
  $("#gateForm").addEventListener("submit", onGateSubmit);

  try {
    state.settings = await ensureSettings();
  } catch (err) {
    console.error(err);
    $("#gateMsg").textContent = "Gagal membaca pengaturan: " + err.message;
    $("#gateMsg").className = "msg err";
    return;
  }

  if (sessionStorage.getItem("absensi_admin") === "1") {
    openAdmin();
  }
}

async function ensureSettings() {
  const ref = doc(db, "settings", "app");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { ...DEFAULT_SETTINGS, createdAt: serverTimestamp() }, { merge: true });
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

function onGateSubmit(event) {
  event.preventDefault();
  const pin = $("#pin").value.trim();

  if (pin && pin === String(state.settings.adminPin)) {
    sessionStorage.setItem("absensi_admin", "1");
    $("#pin").value = "";
    openAdmin();
  } else {
    $("#gateMsg").textContent = "PIN salah. Coba lagi.";
    $("#gateMsg").className = "msg err";
  }
}

async function openAdmin() {
  $("#gateCard").classList.add("hidden");
  $("#adminBody").classList.remove("hidden");

  bindTabs();
  bindMemberForm();
  bindSessionForm();
  bindSettingsForm();
  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("absensi_admin");
    location.reload();
  });

  await Promise.all([loadMembers(), loadSessions()]);
  fillSettingsForm();
}

/* =========================================================
   Tab
   ========================================================= */
function bindTabs() {
  document.querySelectorAll(".tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab[data-tab]").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.panel !== tab.dataset.tab);
      });
    });
  });
}

/* =========================================================
   Anggota
   ========================================================= */
async function loadMembers() {
  const snap = await getDocs(collection(db, "members"));
  state.members = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id"));
  renderMembers();
}

function renderMembers() {
  $("#memberCount").textContent = `${state.members.length} orang`;
  const list = $("#memberList");

  if (!state.members.length) {
    list.innerHTML = `<li class="empty">Belum ada anggota.</li>`;
    return;
  }

  list.innerHTML = state.members.map((m) => `
    <li>
      <span class="avatar">${escapeHtml(m.emoji || "💗")}</span>
      <span class="meta">
        <strong>${escapeHtml(m.name)}</strong>
        <span>${escapeHtml(m.nickname || "—")}${m.active === false ? " · nonaktif" : ""}</span>
      </span>
      <span class="actions">
        <button class="btn btn-ghost btn-sm" data-edit-member="${escapeHtml(m.id)}" type="button">Edit</button>
        <button class="btn btn-danger btn-sm" data-del-member="${escapeHtml(m.id)}" type="button">Hapus</button>
      </span>
    </li>`).join("");

  list.querySelectorAll("[data-edit-member]").forEach((btn) => {
    btn.addEventListener("click", () => editMember(btn.dataset.editMember));
  });
  list.querySelectorAll("[data-del-member]").forEach((btn) => {
    btn.addEventListener("click", () => removeMember(btn.dataset.delMember));
  });
}

function bindMemberForm() {
  $("#memberForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = $("#memberId").value;
    const name = $("#memberName").value.trim();
    if (!name) return;

    const data = {
      name,
      nickname: $("#memberNick").value.trim(),
      emoji: $("#memberEmoji").value.trim() || "💗",
      active: $("#memberActive").checked
    };

    try {
      if (id) {
        await setDoc(doc(db, "members", id), data, { merge: true });
        toast("Anggota diperbarui", "ok");
      } else {
        await addDoc(collection(db, "members"), { ...data, createdAt: serverTimestamp() });
        toast("Anggota ditambahkan", "ok");
      }
      resetMemberForm();
      await loadMembers();
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan anggota: " + err.message, "err");
    }
  });

  $("#memberReset").addEventListener("click", resetMemberForm);
}

function editMember(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  $("#memberId").value = m.id;
  $("#memberName").value = m.name || "";
  $("#memberNick").value = m.nickname || "";
  $("#memberEmoji").value = m.emoji || "💗";
  $("#memberActive").checked = m.active !== false;
  $("#memberFormTitle").textContent = "Edit Anggota";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetMemberForm() {
  $("#memberId").value = "";
  $("#memberName").value = "";
  $("#memberNick").value = "";
  $("#memberEmoji").value = "💗";
  $("#memberActive").checked = true;
  $("#memberFormTitle").textContent = "Tambah Anggota";
}

async function removeMember(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  if (!confirm(`Hapus anggota "${m.name}"? Data absensi lamanya tetap tersimpan.`)) return;

  try {
    await deleteDoc(doc(db, "members", id));
    toast("Anggota dihapus", "ok");
    await loadMembers();
  } catch (err) {
    console.error(err);
    toast("Gagal menghapus: " + err.message, "err");
  }
}

/* =========================================================
   Sesi
   ========================================================= */
async function loadSessions() {
  const snap = await getDocs(collection(db, "sessions"));
  state.sessions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  renderSessions();
}

function renderSessions() {
  $("#sessionCount").textContent = `${state.sessions.length} sesi`;
  const list = $("#sessionList");

  if (!state.sessions.length) {
    list.innerHTML = `<li class="empty">Belum ada sesi.</li>`;
    return;
  }

  const now = new Date();
  list.innerHTML = state.sessions.map((s) => {
    const isToday = s.date === todayStr();
    const st = isToday ? sessionState(s, now) : null;
    return `<li>
      <span class="avatar">📅</span>
      <span class="meta">
        <strong>${escapeHtml(s.title || "Sesi")}</strong>
        <span>${escapeHtml(fmtDateID(s.date))} · ${escapeHtml(s.openAt)}–${escapeHtml(s.closeAt)}</span>
      </span>
      ${st ? `<span class="pill ${st.code}">${escapeHtml(st.text)}</span>` : ""}
      <span class="actions">
        <button class="btn btn-ghost btn-sm" data-edit-session="${escapeHtml(s.id)}" type="button">Edit</button>
        <button class="btn btn-danger btn-sm" data-del-session="${escapeHtml(s.id)}" type="button">Hapus</button>
      </span>
    </li>`;
  }).join("");

  list.querySelectorAll("[data-edit-session]").forEach((btn) => {
    btn.addEventListener("click", () => editSession(btn.dataset.editSession));
  });
  list.querySelectorAll("[data-del-session]").forEach((btn) => {
    btn.addEventListener("click", () => removeSession(btn.dataset.delSession));
  });
}

function bindSessionForm() {
  $("#sessionDate").value = todayStr();

  $("#sessionForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = $("#sessionId").value;
    const data = {
      title: $("#sessionTitleInput").value.trim() || "Absen Harian",
      date: $("#sessionDate").value,
      openAt: $("#sessionOpen").value,
      closeAt: $("#sessionClose").value
    };

    if (!data.date) return toast("Tanggal wajib diisi", "err");
    if (toMinutes(data.closeAt) <= toMinutes(data.openAt)) {
      return toast("Jam tutup harus lebih akhir dari jam buka", "err");
    }

    try {
      if (id) {
        await setDoc(doc(db, "sessions", id), data, { merge: true });
        toast("Sesi diperbarui", "ok");
      } else {
        await addDoc(collection(db, "sessions"), { ...data, createdAt: serverTimestamp() });
        toast("Sesi ditambahkan", "ok");
      }
      resetSessionForm();
      await loadSessions();
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan sesi: " + err.message, "err");
    }
  });

  $("#sessionReset").addEventListener("click", resetSessionForm);
}

function editSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  $("#sessionId").value = s.id;
  $("#sessionTitleInput").value = s.title || "";
  $("#sessionDate").value = s.date || todayStr();
  $("#sessionOpen").value = s.openAt || "06:00";
  $("#sessionClose").value = s.closeAt || "21:00";
  $("#sessionFormTitle").textContent = "Edit Sesi";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetSessionForm() {
  $("#sessionId").value = "";
  $("#sessionTitleInput").value = "";
  $("#sessionDate").value = todayStr();
  $("#sessionOpen").value = "06:00";
  $("#sessionClose").value = "21:00";
  $("#sessionFormTitle").textContent = "Tambah Sesi";
}

async function removeSession(id) {
  if (!confirm("Hapus sesi ini? Data absensi pada sesi ini tetap tersimpan.")) return;
  try {
    await deleteDoc(doc(db, "sessions", id));
    toast("Sesi dihapus", "ok");
    await loadSessions();
  } catch (err) {
    console.error(err);
    toast("Gagal menghapus: " + err.message, "err");
  }
}

/* =========================================================
   Pengaturan
   ========================================================= */
function fillSettingsForm() {
  const s = state.settings;
  $("#setTitle").value = s.appTitle || "";
  $("#setPageTitle").value = s.pageTitle || "";
  $("#setSubtitle").value = s.subtitle || "";
  $("#setRequireReason").checked = !!s.requireReason;
}

function bindSettingsForm() {
  $("#settingForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const data = {
      appTitle: $("#setTitle").value.trim() || "Absensi Harian",
      pageTitle: $("#setPageTitle").value.trim() || "Absen Hari Ini",
      subtitle: $("#setSubtitle").value.trim(),
      requireReason: $("#setRequireReason").checked
    };

    const newPin = $("#setPin").value.trim();
    if (newPin) {
      if (newPin.length < 4) return toast("PIN minimal 4 digit", "err");
      data.adminPin = newPin;
    }

    try {
      await setDoc(doc(db, "settings", "app"), data, { merge: true });
      state.settings = { ...state.settings, ...data };
      $("#setPin").value = "";
      toast("Pengaturan disimpan", "ok");
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan: " + err.message, "err");
    }
  });
}
