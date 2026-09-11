/* admin.js — Logika Panel Admin */
(function () {
  'use strict';
  var A = window.Absensi;

  var editingKelasId = null;   // id kelas yang sedang diedit via form
  var currentAdmin = null;     // akun yang sedang login

  function $(id) { return document.getElementById(id); }
  function esc(s) { return A.esc(s); }

  /* ================= LOGIN ================= */
  function isUnlocked() {
    try { return sessionStorage.getItem('absv2_admin_unlocked') === '1'; } catch (e) { return false; }
  }
  function cekLogin() {
    $('login-screen').classList.toggle('hidden', isUnlocked());
  }
  async function attemptLogin() {
    var user = $('login-user').value.trim();
    var pass = $('login-pass').value;
    if (!user || !pass) { A.showToast('Input Kurang', 'Isi username dan password.', 'warn'); return; }

    var admins = (A.config.admins || []);
    if (!admins.length) {
      // Seed akun default admin / admin123
      await seedDefaultAdmin();
      admins = A.config.admins || [];
    }
    var acc = null;
    for (var i = 0; i < admins.length; i++) {
      if (admins[i].username === user) { acc = admins[i]; break; }
    }
    if (!acc) { A.showToast('Login Gagal', 'Username tidak ditemukan.', 'err'); return; }

    var hash = await A.sha256(pass);
    var ok = hash ? hash === acc.passwordHash : (pass === acc.passwordHash);
    if (!ok) { A.showToast('Login Gagal', 'Password salah. Coba lagi.', 'err'); return; }

    currentAdmin = acc;
    try { sessionStorage.setItem('absv2_admin_unlocked', '1'); } catch (e) {}
    cekLogin();
    renderAllAdmin();
    A.showToast('Selamat Datang!', 'Panel admin terbuka. Kelola sesi, mahasiswa, dan akun.', 'ok');
  }

  async function seedDefaultAdmin() {
    var hash = await A.sha256('admin123');
    A.config.admins = [{ id: A.uid(), nama: 'Administrator', username: 'admin', passwordHash: hash }];
    await A.saveConfig(A.config);
    A.showToast('Akun Default Dibuat', 'Username: admin · Password: admin123 — segera ganti password.', 'warn');
  }

  function lockPanel() {
    try { sessionStorage.removeItem('absv2_admin_unlocked'); } catch (e) {}
    currentAdmin = null;
    cekLogin();
    A.showToast('Panel Terkunci', 'Masukkan username & password untuk membuka lagi.', 'warn');
  }

  /* ================= INIT ================= */
  document.addEventListener('DOMContentLoaded', function () {
    A.loadCache();
    cekLogin();
    $('login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') attemptLogin(); });
    $('mhs-cari').addEventListener('input', renderMaster);
    $('mhs-kelas').addEventListener('change', function () {
      try { localStorage.setItem('absv2_admin_mhs_kelas', $('mhs-kelas').value); } catch (e) {}
      renderMaster();
      renderDashboard();
    });

    A.startAutoSync(function (r) {
      renderAllAdmin();
      if (r && !r.ok && isUnlocked()) A.showToast('Sinkron', r.msg, 'warn');
    }, 45000);
    A.setOnExternalChange(function () { renderAllAdmin(); });

    fillFormKelas(); // kosong/buat baru
  });

  function renderAllAdmin() {
    $('header-admin-name').textContent = isUnlocked() && currentAdmin
      ? ('Login: ' + currentAdmin.nama + ' (' + currentAdmin.username + ')')
      : 'Masuk dengan akun admin';
    renderKelasList();
    renderMhsKelasSelect();
    renderMaster();
    renderAdminTable();
    renderDashboard();
    $('set-app-name').value = A.config.appName || 'Absensi Mahasiswa';
    $('set-script-url').value = A.scriptURL || '';
    updateSheetStatus();
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    var sel = $('mhs-kelas');
    var k = sel && sel.value ? A.getKelas(sel.value) : (A.classes[0] || null);
    if (!k) {
      $('dash-kelas').textContent = 'Belum ada kelas';
      $('dash-matkul').textContent = 'Buat kelas di bagian atas.';
      return;
    }
    var info = A.getSessionInfo(k);
    $('dash-kelas').textContent = k.nama;
    $('dash-matkul').textContent = (k.matkul || 'Tanpa mata kuliah') + (k.hari ? ' · ' + k.hari : '') + ' · Pertemuan Ke-' + k.pertemuan + (k.judul ? ' — ' + k.judul : '');
    $('status-sesi-label').innerHTML = '<span class="dot pulse-dot' + (info.level === 'success' ? '' : info.level === 'warn' ? ' amber' : info.level === 'danger' ? ' rose' : ' slate') + '"></span> ' + esc(info.shortLabel);
    $('dash-note').textContent = info.label + ' · jam ' + (k.jamBuka || '--:--') + ' – ' + (k.jamTutup || '--:--');

    var logs = A.getLogsFor(k.id, k.pertemuan);
    var c = { Hadir: 0, Sakit: 0, Izin: 0, Dispen: 0 };
    logs.forEach(function (l) { if (c[l.status] !== undefined) c[l.status]++; });
    $('dash-total').textContent = logs.length;
    $('dash-hadir').textContent = c.Hadir;
    $('dash-sakit').textContent = c.Sakit;
    $('dash-izin').textContent = c.Izin;
    $('dash-dispen').textContent = c.Dispen;
  }

  /* ================= KELAS ================= */
  function fillFormKelas(k) {
    editingKelasId = k ? k.id : null;
    $('kelas-nama').value = k ? k.nama : '';
    $('kelas-matkul').value = k ? (k.matkul || '') : '';
    $('kelas-hari').value = k ? (k.hari || '') : '';
    $('kelas-jam-buka').value = k ? (k.jamBuka || '08:00') : '08:00';
    $('kelas-jam-tutup').value = k ? (k.jamTutup || '10:00') : '10:00';
    $('kelas-pertemuan').value = k ? k.pertemuan : 1;
    $('kelas-mode').value = k ? (k.mode || 'OPEN') : 'OPEN';
    $('kelas-judul').value = k ? (k.judul || '') : '';
    $('kelas-dokumen-wajib').checked = k ? !!k.dokumenWajib : false;
    $('btn-save-kelas-text').textContent = k ? 'Simpan Perubahan Kelas' : 'Tambah Kelas';
    $('btn-batal-kelas').classList.toggle('hidden', !k);
  }
  window.batalEditKelas = function () { fillFormKelas(null); };

  function simpanKelas() {
    var nama = $('kelas-nama').value.trim();
    if (!nama) { A.showToast('Nama Kelas', 'Nama kelas wajib diisi.', 'warn'); return; }

    var data = {
      id: editingKelasId || A.newKelasId(),
      nama: nama,
      matkul: $('kelas-matkul').value.trim(),
      hari: $('kelas-hari').value,
      jamBuka: $('kelas-jam-buka').value || '08:00',
      jamTutup: $('kelas-jam-tutup').value || '10:00',
      pertemuan: parseInt($('kelas-pertemuan').value, 10) || 1,
      mode: $('kelas-mode').value,
      judul: $('kelas-judul').value.trim(),
      dokumenWajib: $('kelas-dokumen-wajib').checked
    };

    var list = (A.config.classes || []).filter(function (c) { return c.id !== data.id; });
    list.push(data);
    A.config.classes = list;
    A.saveConfig(A.config).then(function () {
      fillFormKelas(null);
      renderAllAdmin();
      A.showToast('Kelas Disimpan', '"' + data.nama + '" tersimpan di spreadsheet.', 'ok');
    });
  }

  function renderKelasList() {
    var list = A.classes;
    $('count-kelas').textContent = list.length + ' kelas';
    var el = $('list-kelas');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-school"></i><p>Belum ada kelas. Isi form di atas lalu klik Tambah Kelas.</p></div>';
      return;
    }
    el.innerHTML = list.map(function (k) {
      var info = A.getSessionInfo(k);
      var logs = A.getLogsFor(k.id, k.pertemuan).length;
      var mhs = A.getStudents(k.id).length;
      return '' +
        '<div class="kelas-card">' +
          '<div class="kc-head">' +
            '<div class="kc-title">' +
              '<div class="kc-avatar"><i class="fa-solid fa-graduation-cap"></i></div>' +
              '<div style="min-width:0">' +
                '<div class="kc-name">' + esc(k.nama) + '</div>' +
                '<div class="kc-matkul">' + esc(k.matkul || 'Tanpa mata kuliah') + (k.hari ? ' · ' + esc(k.hari) : '') + ' · Pertemuan ' + k.pertemuan + (k.judul ? ' — ' + esc(k.judul) : '') + '</div>' +
              '</div>' +
            '</div>' +
            '<span class="badge ' + (info.level === 'success' ? 'badge-hadir' : info.level === 'warn' ? 'badge-sakit' : 'badge-absent') + '">' +
              '<span class="pulse-dot" style="width:6px;height:6px;border-radius:50%;background:' + (info.level === 'success' ? '#059669' : info.level === 'warn' ? '#d97706' : '#dc2626') + '"></span> ' + esc(info.shortLabel) +
            '</span>' +
          '</div>' +
          '<div class="kc-body">' +
            '<div class="kc-meta">' +
              '<div class="km"><span>Sesi Aktif</span><strong>' + (info.code === 'FORCE_OPEN' ? 'Manual ON' : info.code === 'CLOSED' ? 'Ditutup' : (k.jamBuka + ' – ' + k.jamTutup)) + '</strong></div>' +
              '<div class="km"><span>Mahasiswa</span><strong>' + mhs + ' orang</strong></div>' +
              '<div class="km"><span>Absen Pertemuan Ini</span><strong>' + logs + ' catatan</strong></div>' +
              '<div class="km"><span>Bukti Wajib Semua</span><strong>' + (k.dokumenWajib ? 'Ya' : 'Tidak') + '</strong></div>' +
            '</div>' +
            '<div class="kc-actions">' +
              '<button class="btn btn-sm btn-soft-blue" onclick="editKelas(\'' + k.id + '\')"><i class="fa-solid fa-pen"></i> Ubah</button>' +
              '<button class="btn btn-sm btn-soft-green" onclick="pilihKelasMaster(\'' + k.id + '\')"><i class="fa-solid fa-users"></i> Kelola Mahasiswa</button>' +
              '<button class="btn btn-sm btn-soft-red" onclick="hapusKelas(\'' + k.id + '\')"><i class="fa-solid fa-trash-can"></i> Hapus</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  window.editKelas = function (id) {
    var k = A.getKelas(id);
    if (!k) return;
    fillFormKelas(k);
    document.getElementById('kelas').scrollIntoView({ behavior: 'smooth' });
  };

  window.pilihKelasMaster = function (id) {
    $('mhs-kelas').value = id;
    try { localStorage.setItem('absv2_admin_mhs_kelas', id); } catch (e) {}
    renderMaster();
    renderDashboard();
    document.getElementById('mahasiswa').scrollIntoView({ behavior: 'smooth' });
  };

  function hapusKelas(id) {
    var k = A.getKelas(id);
    if (!k) return;
    if (!confirm('Hapus kelas "' + k.nama + '" beserta semua data mahasiswa dan log absensinya?')) return;
    A.config.classes = A.config.classes.filter(function (c) { return c.id !== id; });
    A.state.master = A.state.master.filter(function (s) { return s.kelasId !== id; });
    A.state.logs = A.state.logs.filter(function (l) { return l.kelasId !== id; });
    A.saveCache();
    A.saveConfig(A.config).then(function () { renderAllAdmin(); A.showToast('Kelas Dihapus', 'Kelas "' + k.nama + '" dihapus.', 'ok'); });
  }

  /* ================= MAHASISWA ================= */
  function renderMhsKelasSelect() {
    var sel = $('mhs-kelas');
    var prev = sel.value || '';
    try { prev = localStorage.getItem('absv2_admin_mhs_kelas') || prev; } catch (e) {}
    sel.innerHTML = A.classes.length
      ? A.classes.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nama) + '</option>'; }).join('')
      : '<option value="">— Belum ada kelas —</option>';
    if (A.getKelas(prev)) sel.value = prev;
    else if (A.classes.length) sel.value = A.classes[0].id;
  }

  function getMhsKelasId() { return $('mhs-kelas').value || (A.classes[0] && A.classes[0].id) || ''; }

  function renderMaster() {
    var kid = getMhsKelasId();
    var q = ($('mhs-cari').value || '').toLowerCase().trim();
    var list = A.getStudents(kid).filter(function (s) {
      return !q || String(s.nim).toLowerCase().indexOf(q) !== -1 || String(s.nama).toLowerCase().indexOf(q) !== -1;
    });
    $('count-mahasiswa').textContent = list.length + ' mahasiswa';
    var tb = $('table-master');
    if (!kid) {
      tb.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fa-solid fa-school"></i><p>Buat kelas terlebih dahulu.</p></td></tr>';
      return;
    }
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="4" class="empty-state"><i class="fa-regular fa-folder-open"></i><p>' + (q ? 'Tidak ada hasil pencarian.' : 'Belum ada mahasiswa di kelas ini.') + '</p></td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (s, i) {
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="mono">' + esc(s.nim) + '</td>' +
        '<td>' + esc(s.nama) + '</td>' +
        '<td style="text-align:center;white-space:nowrap">' +
          '<button class="btn btn-sm btn-soft-blue" onclick="editMahasiswa(\'' + esc(s.kelasId) + '\',\'' + esc(String(s.nim)) + '\')" style="margin-right:4px"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="btn btn-sm btn-soft-red" onclick="hapusMahasiswa(\'' + esc(s.kelasId) + '\',\'' + esc(String(s.nim)) + '\')"><i class="fa-solid fa-trash-can"></i></button>' +
        '</td></tr>';
    }).join('');
  }

  function tambahMahasiswa() {
    var kid = getMhsKelasId();
    var nim = $('mhs-nim').value.trim();
    var nama = $('mhs-nama').value.trim();
    if (!kid) { A.showToast('Pilih Kelas', 'Buat/pilih kelas terlebih dahulu.', 'warn'); return; }
    if (!nim || !nama) { A.showToast('Input Kurang', 'NIM dan nama wajib diisi.', 'warn'); return; }
    if (A.getStudents(kid).some(function (s) { return String(s.nim) === nim; })) {
      A.showToast('NIM Sudah Ada', nim + ' sudah terdaftar di kelas ini.', 'warn'); return;
    }
    var students = A.getStudents(kid).concat([{ nim: nim, nama: nama }]);
    A.saveMasterForClass(kid, students, function () {
      $('mhs-nim').value = ''; $('mhs-nama').value = '';
      renderMaster(); renderDashboard();
      A.showToast('Data Ditambahkan', nama + ' (' + nim + ') masuk kelas ' + (A.getKelas(kid) ? A.getKelas(kid).nama : ''), 'ok');
    });
  }

  function tambahMassal() {
    var kid = getMhsKelasId();
    var raw = $('mhs-bulk').value.trim();
    if (!kid) { A.showToast('Pilih Kelas', 'Buat/pilih kelas terlebih dahulu.', 'warn'); return; }
    if (!raw) { A.showToast('Kosong', 'Tempel daftar NIM + Nama dulu.', 'warn'); return; }

    var exist = A.getStudents(kid);
    var ditambah = 0, lewat = 0;
    raw.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var parts = line.indexOf('|') !== -1 ? line.split('|') : line.split(/\s+(.+)/);
      var nim = (parts[0] || '').trim();
      var nama = ((parts[1] || '') + ' ' + (parts[2] || '')).replace(/\s{2,}/g, ' ').trim();
      if (nim && nama && !exist.some(function (s) { return String(s.nim) === nim; })) {
        exist.push({ nim: nim, nama: nama });
        ditambah++;
      } else { lewat++; }
    });
    if (!ditambah) { A.showToast('Tidak Ada yang Ditambah', lewat + ' baris dilewati (duplikat/tidak valid).', 'warn'); return; }
    A.saveMasterForClass(kid, exist, function () {
      $('mhs-bulk').value = '';
      renderMaster(); renderDashboard();
      A.showToast('Tambah Massal Selesai', ditambah + ' mahasiswa ditambahkan' + (lewat ? ', ' + lewat + ' dilewati.' : '.'), 'ok');
    });
  }

  window.editMahasiswa = function (kid, nim) {
    var s = A.getStudents(kid).find(function (x) { return String(x.nim) === nim; });
    if (!s) return;
    var namaBaru = prompt('Edit NIM: ' + nim + '\nNama mahasiswa:', s.nama);
    if (namaBaru === null) return;
    namaBaru = namaBaru.trim();
    if (!namaBaru) { A.showToast('Nama Kosong', 'Nama tidak boleh kosong.', 'warn'); return; }
    var students = A.getStudents(kid).map(function (x) {
      return String(x.nim) === nim ? { nim: x.nim, nama: namaBaru } : x;
    });
    A.saveMasterForClass(kid, students, function () { renderMaster(); A.showToast('Diperbarui', 'Nama mahasiswa diperbarui.', 'ok'); });
  };

  window.hapusMahasiswa = function (kid, nim) {
    var s = A.getStudents(kid).find(function (x) { return String(x.nim) === nim; });
    if (!s) return;
    if (!confirm('Hapus ' + s.nama + ' (' + nim + ') dari kelas?')) return;
    var students = A.getStudents(kid).filter(function (x) { return String(x.nim) !== nim; });
    A.saveMasterForClass(kid, students, function () { renderMaster(); renderDashboard(); A.showToast('Dihapus', s.nama + ' dikeluarkan dari kelas.', 'ok'); });
  };

  function kirimMaster() {
    var kid = getMhsKelasId();
    if (!kid) { A.showToast('Pilih Kelas', 'Pilih kelas dulu.', 'warn'); return; }
    A.saveMasterForClass(kid, A.getStudents(kid), function (r) {
      A.showToast('Master Dikirim', 'Data (' + A.getStudents(kid).length + ' mahasiswa) tersinkron ke spreadsheet.', 'ok');
    });
  }

  function tarikMaster() {
    if (!A.isSheetConfigured()) { A.showToast('Spreadsheet Belum Diatur', 'Tempel URL Apps Script di Pengaturan.', 'warn'); return; }
    A.showToast('Menarik Data...', 'Mengambil master data dari spreadsheet.', 'warn');
    A.syncAll(function (r) {
      renderAllAdmin();
      A.showToast('Selesai', r.ok ? 'Data berhasil ditarik dari spreadsheet.' : r.msg, r.ok ? 'ok' : 'err');
    });
  }

  /* ================= AKUN ADMIN ================= */
  function renderAdminTable() {
    var admins = A.config.admins || [];
    $('count-admin').textContent = admins.length + ' akun';
    var tb = $('table-admin');
    if (!admins.length) {
      tb.innerHTML = '<tr><td colspan="3" class="empty-state"><i class="fa-regular fa-user"></i><p>Belum ada akun admin.</p></td></tr>';
      return;
    }
    tb.innerHTML = admins.map(function (a) {
      return '<tr>' +
        '<td>' + esc(a.nama) + (currentAdmin && currentAdmin.id === a.id ? ' <span class="badge badge-slate" style="font-size:10px">Anda</span>' : '') + '</td>' +
        '<td class="mono muted-text">' + esc(a.username) + '</td>' +
        '<td style="text-align:center;white-space:nowrap">' +
          '<button class="btn btn-sm btn-soft-amber" onclick="gantiPassword(\'' + esc(a.id) + '\')" style="margin-right:4px"><i class="fa-solid fa-key"></i> Password</button>' +
          (admins.length > 1 ? '<button class="btn btn-sm btn-soft-red" onclick="hapusAdmin(\'' + esc(a.id) + '\')"><i class="fa-solid fa-trash-can"></i></button>' : '') +
        '</td></tr>';
    }).join('');
  }

  async function tambahAdmin() {
    var nama = $('adm-nama').value.trim();
    var username = $('adm-username').value.trim();
    var pass = $('adm-password').value;
    if (!nama || !username || !pass) { A.showToast('Input Kurang', 'Nama, username, dan password wajib diisi.', 'warn'); return; }
    if (pass.length < 6) { A.showToast('Password Lemah', 'Gunakan minimal 6 karakter.', 'warn'); return; }
    var admins = A.config.admins || [];
    if (admins.some(function (a) { return a.username === username; })) {
      A.showToast('Username Dipakai', 'Username "' + username + '" sudah ada.', 'warn'); return;
    }
    var hash = await A.sha256(pass);
    admins.push({ id: A.uid(), nama: nama, username: username, passwordHash: hash });
    A.config.admins = admins;
    A.saveConfig(A.config).then(function () {
      $('adm-nama').value = ''; $('adm-username').value = ''; $('adm-password').value = '';
      renderAdminTable();
      A.showToast('Akun Ditambahkan', username + ' kini bisa login sebagai admin.', 'ok');
    });
  }

  window.gantiPassword = async function (id) {
    var admins = A.config.admins || [];
    var a = admins.find(function (x) { return x.id === id; });
    if (!a) return;
    var pw = prompt('Ganti password untuk "' + a.username + '" (minimal 6 karakter):', '');
    if (pw === null) return;
    pw = pw.trim();
    if (pw.length < 6) { A.showToast('Terlalu Pendek', 'Password minimal 6 karakter.', 'warn'); return; }
    var hash = await A.sha256(pw);
    a.passwordHash = hash;
    A.saveConfig(A.config).then(function () {
      renderAdminTable();
      A.showToast('Password Diganti', 'Password "' + a.username + '" diperbarui di spreadsheet.', 'ok');
    });
  };

  window.hapusAdmin = function (id) {
    var admins = A.config.admins || [];
    var a = admins.find(function (x) { return x.id === id; });
    if (!a) return;
    if (currentAdmin && currentAdmin.id === id) { A.showToast('Tidak Bisa', 'Tidak bisa menghapus akun yang sedang dipakai.', 'warn'); return; }
    if (!confirm('Hapus akun admin "' + a.username + '"?')) return;
    A.config.admins = admins.filter(function (x) { return x.id !== id; });
    A.saveConfig(A.config).then(function () { renderAdminTable(); A.showToast('Akun Dihapus', 'Akun "' + a.username + '" dihapus.', 'ok'); });
  };

  /* ================= PENGATURAN ================= */
  function updateSheetStatus() {
    var box = $('sheet-status');
    var txt = $('sheet-status-text');
    if (A.isSheetConfigured()) {
      box.className = 'alert alert-success';
      box.innerHTML = '<i class="fa-solid fa-plug-circle-check"></i><div><strong>Terhubung ke Spreadsheet</strong><p>Data otomatis disinkronkan setiap 45 detik.</p></div>';
    } else {
      box.className = 'alert alert-amber';
      box.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i><div><strong>Belum terhubung</strong><p>Tempel URL Apps Script di bawah.</p></div>';
    }
    txt.textContent = '';
  }

  function simpanPengaturan() {
    A.config.appName = $('set-app-name').value.trim() || 'Absensi Mahasiswa';
    A.scriptURL = $('set-script-url').value.trim();
    A.saveConfig(A.config).then(function () {
      renderAllAdmin();
      A.showToast('Tersimpan', 'Pengaturan & URL spreadsheet tersimpan. Sinkron ulang...', 'ok');
    });
  }

  function sinkronSekarang() {
    if (!A.isSheetConfigured()) { A.showToast('URL Belum Diatur', 'Tempel URL Apps Script dulu.', 'warn'); return; }
    A.showToast('Sinkronisasi', 'Menarik data terbaru dari spreadsheet...', 'warn');
    A.syncAll(function (r) {
      renderAllAdmin();
      A.showToast('Selesai', r.ok ? 'Semua data tersinkron.' : r.msg, r.ok ? 'ok' : 'err');
    });
  }

  function hapusSemuaLog() {
    if (!A.isSheetConfigured()) { A.showToast('URL Belum Diatur', 'Tempel URL Apps Script dulu.', 'warn'); return; }
    if (!confirm('Hapus SEMUA log absensi di spreadsheet? Tindakan ini permanen.')) return;
    A.postToSheet({ action: 'clear_logs' }).then(function () {
      A.state.logs = [];
      A.saveCache();
      A.syncAll(function () { renderAllAdmin(); A.showToast('Log Dihapus', 'Semua catatan absensi dikosongkan.', 'ok'); });
    });
  }

  function tesKoneksi() {
    A.showToast('Tes Koneksi', 'Mengirim sinyal ke backend...', 'warn');
    A.fetchJSONP('get_config', null, function (r) {
      if (r && r.ok) {
        A.showToast('Koneksi OK', 'Backend merespons. ' + (A.classes.length) + ' kelas, ' + (A.config.admins || []).length + ' akun admin.', 'ok');
      } else {
        A.showToast('Koneksi Gagal', (r && r.msg) || 'Periksa URL Apps Script & deployment.', 'err');
      }
    }, 15000);
  }

  function resetLokal() {
    if (!confirm('Reset cache lokal? Data di spreadsheet tetap aman, cache akan diisi ulang saat sinkron.')) return;
    try {
      localStorage.removeItem(A.KEYS.cache);
      localStorage.removeItem(A.KEYS.kelas);
    } catch (e) {}
    A.loadCache();
    renderAllAdmin();
    A.showToast('Cache Direset', 'Cache lokal dikosongkan.', 'ok');
  }

  /* ================= EXPOSE ================= */
  window.attemptLogin = attemptLogin;
  window.lockPanel = lockPanel;
  window.simpanKelas = simpanKelas;
  window.tambahMahasiswa = tambahMahasiswa;
  window.tambahMassal = tambahMassal;
  window.kirimMaster = kirimMaster;
  window.tarikMaster = tarikMaster;
  window.tambahAdmin = tambahAdmin;
  window.simpanPengaturan = simpanPengaturan;
  window.sinkronSekarang = sinkronSekarang;
  window.hapusSemuaLog = hapusSemuaLog;
  window.tesKoneksi = tesKoneksi;
  window.resetLokal = resetLokal;
})();