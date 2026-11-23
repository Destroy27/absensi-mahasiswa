/**
 * Halaman Absen (index.html)
 * - Memuat anggota & sesi hari ini
 * - Cek jendela waktu buka/tutup + hitung mundur
 * - Simpan / perbarui absensi ke Firestore
 * - Daftar "sudah absen" diperbarui real-time (onSnapshot)
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  db, STATUS, STATUS_KEYS, todayStr, fmtDateID,
  escapeHtml, toast, statusBadge, sessionState
} from "./common.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  members: [],
  session: null,
  settings: {},
  status: "hadir",
  existing: null,
  timer: null,
  unsubToday: null,
  lastCode: null
};

init();

/* =========================================================
   Inisialisasi
   ========================================================= */
async function init() {
  $("#todayLabel").textContent = fmtDateID(todayStr());
  renderStatusGrid();

  // Listener dipasang lebih dulu supaya form tetap hidup walau data gagal dimuat.
  $("#member").addEventListener("change", onMemberChange);
  $("#absenForm").addEventListener("submit", onSubmit);

  try {
    await Promise.all([loadSettings(), loadMembers(), loadSession()]);
  } catch (err) {
    console.error(err);
    setMsg("Gagal memuat data: " + err.message, "err");
    return;
  }

  applyBranding();
  renderMembers();
  renderSession();
  startCountdown();

  try {
    watchToday();
  } catch (err) {
    console.error(err);
    setMsg("Gagal memuat daftar absen: " + err.message, "err");
  }
}

/* =========================================================
   Data
   ========================================================= */
async function loadSettings() {
  const snap = await getDoc(doc(db, "settings", "app"));
  state.settings = snap.exists() ? snap.data() : {};
}

function applyBranding() {
  const title = state.settings.appTitle || "Absensi Harian";
  document.title = `Absen — ${title}`;
  $("#brandName").textContent = title;
  $("#pageTitle").textContent = state.settings.pageTitle || "Absen Hari Ini";
  $("#pageSub").textContent = state.settings.subtitle || "Pilih nama, lalu tandai kehadiranmu.";
  $("#reasonHint").textContent = state.settings.requireReason
    ? "(wajib untuk Sakit / Izin / Dispen)"
    : "(opsional)";
}

async function loadMembers() {
  const snap = await getDocs(collection(db, "members"));
  state.members = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id"));
}

async function loadSession() {
  const date = todayStr();
  const snap = await getDocs(query(collection(db, "sessions"), where("date", "==", date)));
  let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Belum ada sesi hari ini -> buat sesi harian otomatis (00:00–23:59)
  if (!list.length) {
    const id = `s_${date}`;
    const payload = {
      title: "Absen Harian",
      date,
      openAt: "00:00",
      closeAt: "23:59",
      auto: true,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, "sessions", id), payload, { merge: true });
    list = [{ id, ...payload }];
  }

  const now = new Date();
  state.session = list.find((s) => sessionState(s, now).open) || list[0];
}

/* =========================================================
   Render
   ========================================================= */
function renderStatusGrid() {
  $("#statusGrid").innerHTML = STATUS_KEYS.map((key) => {
    const s = STATUS[key];
    return `<label class="status-chip ${s.cls}">
      <input type="radio" name="status" value="${key}" ${key === state.status ? "checked" : ""}>
      <span class="emoji">${s.emoji}</span>
      <span>${s.label}</span>
    </label>`;
  }).join("");

  document.querySelectorAll('input[name="status"]').forEach((radio) => {
    radio.addEventListener("change", () => { state.status = radio.value; });
  });
}

function setStatus(status) {
  state.status = STATUS[status] ? status : "hadir";
  const radio = document.querySelector(`input[name="status"][value="${state.status}"]`);
  if (radio) radio.checked = true;
}

function renderMembers() {
  const select = $("#member");
  if (!state.members.length) {
    select.innerHTML = `<option value="">Belum ada anggota — tambah di halaman Admin</option>`;
    $("#submitBtn").disabled = true;
    return;
  }
  select.innerHTML = `<option value="">Pilih nama…</option>` + state.members.map((m) =>
    `<option value="${escapeHtml(m.id)}">${escapeHtml(m.emoji || "💗")} ${escapeHtml(m.name)}${m.nickname ? ` (${escapeHtml(m.nickname)})` : ""}</option>`
  ).join("");
}

function renderSession() {
  const s = state.session;
  const st = sessionState(s);

  $("#sessionPill").textContent = st.text;
  $("#sessionPill").className = `pill ${st.code}`;
  $("#sessionTitle").textContent = s?.title || "—";
  $("#openAt").textContent = s?.openAt || "—";
  $("#closeAt").textContent = s?.closeAt || "—";

  const blocked = !st.open;
  $("#submitBtn").disabled = blocked || !state.members.length;

  if (blocked && s) {
    setMsg(st.code === "wait"
      ? `Absen belum dibuka. Buka pukul ${s.openAt}.`
      : `Absen sudah ditutup pukul ${s.closeAt}.`, "err");
  } else if (!blocked) {
    setMsg("", "");
  }
}

/* =========================================================
   Hitung mundur
   ========================================================= */
function startCountdown() {
  clearInterval(state.timer);
  const tick = () => {
    const s = state.session;
    const el = $("#countdown");
    if (!s) { el.textContent = "—"; return; }

    const now = new Date();
    const st = sessionState(s, now);

    // Status jendela berubah (buka -> tutup) -> segarkan tombol & pill.
    if (st.code !== state.lastCode) {
      state.lastCode = st.code;
      renderSession();
    }

    if (st.code === "closed" || st.code === "none") {
      el.classList.remove("is-urgent");
      el.innerHTML = `<span class="lbl">Status</span>Absen ditutup`;
      return;
    }

    const label = st.code === "open" ? "Sisa waktu absen" : "Absen dibuka dalam";
    const target = atTime(st.code === "open" ? s.closeAt : s.openAt);
    const diff = Math.max(0, target - now);

    // Beri denyut halus saat sisa waktu di bawah 60 detik.
    el.classList.toggle("is-urgent", st.code === "open" && diff > 0 && diff < 60000);

    const h = Math.floor(diff / 3.6e6);
    const m = Math.floor((diff % 3.6e6) / 6e4);
    const sec = Math.floor((diff % 6e4) / 1000);
    el.innerHTML = `<span class="lbl">${label}</span>${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

function atTime(hm) {
  const [h, m] = String(hm || "0:0").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/* =========================================================
   Absensi hari ini (real-time)
   ========================================================= */
function watchToday() {
  if (!state.session) return;

  state.unsubToday?.();
  const q = query(collection(db, "attendance"), where("sessionId", "==", state.session.id));

  state.unsubToday = onSnapshot(q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
      renderToday(rows);
    },
    (err) => {
      console.error(err);
      $("#todayList").innerHTML = `<li class="empty">Gagal memuat daftar absen.</li>`;
    }
  );
}

function renderToday(rows) {
  $("#todayCount").textContent = `${rows.length} orang`;
  const list = $("#todayList");

  if (!rows.length) {
    list.innerHTML = `<li class="empty">Belum ada yang absen.</li>`;
    return;
  }

  list.innerHTML = rows.map((r) => {
    const member = state.members.find((m) => m.id === r.memberId);
    const time = r.updatedAt?.toDate?.() || r.createdAt?.toDate?.();
    const hhmm = time
      ? `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
      : "—";
    return `<li>
      <span class="avatar">${escapeHtml(member?.emoji || "💗")}</span>
      <span class="meta">
        <strong>${escapeHtml(r.memberName || member?.name || "—")}</strong>
        <span>${escapeHtml(hhmm)}${r.reason ? " · " + escapeHtml(r.reason) : ""}</span>
      </span>
      ${statusBadge(r.status)}
    </li>`;
  }).join("");
}

const millis = (ts) => ts?.toMillis?.() || 0;

/* =========================================================
   Form
   ========================================================= */
async function onMemberChange() {
  const memberId = $("#member").value;
  state.existing = null;
  $("#reason").value = "";
  setStatus("hadir");

  if (!memberId || !state.session) return;

  try {
    const snap = await getDoc(doc(db, "attendance", attendanceId(memberId)));
    if (snap.exists()) {
      const data = snap.data();
      state.existing = data;
      setStatus(data.status);
      $("#reason").value = data.reason || "";
      setMsg("Kamu sudah absen hari ini. Kirim ulang untuk mengubah.", "");
    } else {
      setMsg("", "");
    }
  } catch (err) {
    console.error(err);
  }
}

async function onSubmit(event) {
  event.preventDefault();

  const memberId = $("#member").value;
  const member = state.members.find((m) => m.id === memberId);
  const reason = $("#reason").value.trim();
  const btn = $("#submitBtn");

  if (!member) return setMsg("Pilih nama dulu ya.", "err");

  const st = sessionState(state.session);
  if (!st.open) return setMsg("Absen sedang tidak dibuka.", "err");

  if (state.settings.requireReason && state.status !== "hadir" && !reason) {
    return setMsg("Alasan wajib diisi untuk status Sakit / Izin / Dispen.", "err");
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan…";

  try {
    const ref = doc(db, "attendance", attendanceId(memberId));
    const payload = {
      sessionId: state.session.id,
      sessionDate: state.session.date,
      sessionTitle: state.session.title || "",
      memberId,
      memberName: member.name,
      status: state.status,
      reason,
      updatedAt: serverTimestamp(),
      createdAt: state.existing?.createdAt || serverTimestamp()
    };

    await setDoc(ref, payload, { merge: true });

    // Simpan hanya data asli dari server (bukan sentinel serverTimestamp)
    // agar createdAt tidak tertimpa saat kirim ulang.
    const fresh = await getDoc(ref);
    state.existing = fresh.exists() ? fresh.data() : null;

    const label = STATUS[state.status]?.label || state.status;
    setMsg(`Tersimpan: ${member.name} — ${label}`, "ok");
    toast("Absen berhasil disimpan 💗", "ok");
    showSuccess("Absen tersimpan");
  } catch (err) {
    console.error(err);
    setMsg("Gagal menyimpan: " + err.message, "err");
    toast("Gagal menyimpan absen", "err");
  } finally {
    btn.textContent = "Kirim Absen";
    btn.disabled = !sessionState(state.session).open || !state.members.length;
  }
}

const attendanceId = (memberId) => `${state.session.id}__${memberId}`;

function setMsg(text, kind) {
  const el = $("#formMsg");
  el.textContent = text;
  el.className = "msg" + (kind ? " " + kind : "");
}

/* Overlay centang singkat setelah absen tersimpan (check-draw). */
let successTimer = null;
function showSuccess(text) {
  const overlay = $("#successOverlay");
  if (!overlay) return;
  $("#successText").textContent = text;
  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }, 1200);
}
