/* index.js — Logika halaman Absen */
(function () {
  'use strict';
  var A = window.Absensi;

  var selectedStatus = 'Hadir';
  var fileData = null;        // { dataUrl, isImage, nama }
  var verifiedStudent = null; // { nim, nama }
  var submitting = false;
  var currentKelasId = null;

  function $(id) { return document.getElementById(id); }
  function getKelas() { return currentKelasId ? A.getKelas(currentKelasId) : null; }

  /* ================= INIT ================= */
  document.addEventListener('DOMContentLoaded', function () {
    A.loadCache();
    renderKelasSelector();
    startLiveClock();
    A.startAutoSync(function (r) {
      renderKelasSelector();
      renderAll();
      if (r && !r.ok && A.isSheetConfigured()) A.showToast('Sinkron', r.msg, 'warn');
    }, 45000);
    A.setOnExternalChange(function () { renderKelasSelector(); renderAll(); });
    $('input-nim').addEventListener('input', cekNIM);
    $('input-file').addEventListener('change', function (e) { handleFile(e.target.files && e.target.files[0]); });
  });

  /* ================= SELEKTOR KELAS ================= */
  function renderKelasSelector() {
    var sel = $('select-kelas');
    var classes = A.classes;
    var prev = '';
    try { prev = localStorage.getItem(A.KEYS.kelas) || sel.value; } catch (e) {}
    var activeKelas = A.getKelas(prev);
    if (!activeKelas && classes.length) activeKelas = classes[0];

    sel.innerHTML = classes.length
      ? '<option value="">Pilih kelas...</option>' +
        classes.map(function (c) { return '<option value="' + A.esc(c.id) + '">' + A.esc(c.nama) + '</option>'; }).join('')
      : '<option value="">Belum ada kelas (atur di Admin)</option>';

    if (activeKelas) sel.value = activeKelas.id;
    $('app-name').textContent = A.config.appName || 'Absensi Mahasiswa';

    var newId = sel.value || null;
    if (currentKelasId !== newId) {
      currentKelasId = newId;
      try { currentKelasId ? localStorage.setItem(A.KEYS.kelas, currentKelasId) : localStorage.removeItem(A.KEYS.kelas); } catch (e) {}
      renderAll();
    }
  }

  $('select-kelas').addEventListener('change', function (e) {
    currentKelasId = e.target.value || null;
    try { currentKelasId ? localStorage.setItem(A.KEYS.kelas, currentKelasId) : localStorage.removeItem(A.KEYS.kelas); } catch (err) {}
    renderAll();
  });

  /* ================= RENDER ================= */
  function renderAll() {
    renderHero();
    renderLogs();
    cekNIM();
    pilihStatus(selectedStatus);
  }

  function renderHero() {
    var k = getKelas();
    var info = A.getSessionInfo(k);

    $('header-class').textContent = k
      ? (k.nama + (k.matkul ? ' · ' + k.matkul : ''))
      : 'Pilih kelas untuk mulai';

    if (!k) {
      $('meeting-title').textContent = 'Belum ada kelas';
      $('meeting-sub-text').textContent = 'Admin dapat membuat kelas di Panel Admin.';
      setBadge('slate', 'Belum Ada Kelas');
      $('hero-jam-buka').textContent = '--:--';
      $('hero-jam-tutup').textContent = '--:--';
      $('countdown').textContent = '--:--:--';
      $('session-note').textContent = 'Pilih kelas dari menu di atas.';
      return;
    }

    var judul = k.judul ? ' — ' + k.judul : '';
    $('meeting-title').textContent = 'Pertemuan Ke-' + k.pertemuan + judul;
    $('meeting-sub-text').textContent = k.nama + (k.matkul ? ' · ' + k.matkul : '') + (k.hari ? ' · ' + k.hari : '') + ' · ' + A.todayLabel();
    $('hero-jam-buka').textContent = k.jamBuka || '--:--';
    $('hero-jam-tutup').textContent = k.jamTutup || '--:--';
    $('countdown').textContent = info.countdown;
    $('session-note').textContent = info.label;

    var clsDot = info.level === 'success' ? '' : info.level === 'warn' ? ' amber' : info.level === 'danger' ? ' rose' : ' slate';
    $('session-badge').innerHTML = '<span class="dot pulse-dot' + clsDot + '"></span> ' + A.esc(info.shortLabel);
    setSubmitState(info);
  }

  function setBadge(dotCls, label) {
    var clsDot = dotCls === 'success' ? '' : ' ' + (dotCls === 'warn' ? 'amber' : dotCls === 'danger' ? 'rose' : 'slate');
    $('session-badge').innerHTML = '<span class="dot pulse-dot' + clsDot + '"></span> ' + A.esc(label);
  }

  function setSubmitState(info) {
    var btn = $('btn-submit');
    btn.disabled = !info.canSubmit;
    btn.querySelector('span').textContent = info.canSubmit ? 'Kirim Absen' : 'Sesi ' + info.shortLabel;
  }

  function startLiveClock() {
    function tick() {
      var k = getKelas();
      if (!k) return;
      var info = A.getSessionInfo(k);
      var el = $('countdown');
      if (el && info) el.textContent = info.countdown;
      var clsDot = info.level === 'success' ? '' : info.level === 'warn' ? ' amber' : info.level === 'danger' ? ' rose' : ' slate';
      $('session-badge').innerHTML = '<span class="dot pulse-dot' + clsDot + '"></span> ' + A.esc(info.shortLabel);
      $('session-note').textContent = info.label;
      $('hero-jam-buka').textContent = k.jamBuka || '--:--';
      $('hero-jam-tutup').textContent = k.jamTutup || '--:--';
      setSubmitState(info);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ================= VERIFIKASI NIM ================= */
  function cekNIM() {
    var k = getKelas();
    var nim = $('input-nim').value.trim();
    var boxV = $('box-verified');
    var boxN = $('box-notfound');

    if (!nim || !k) {
      verifiedStudent = null;
      boxV.classList.add('hidden');
      boxN.classList.add('hidden');
      return;
    }
    var st = null;
    var list = A.getStudents(k.id);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].nim).trim() === nim) { st = list[i]; break; }
    }
    if (st) {
      verifiedStudent = st;
      $('v-name').textContent = st.nama;
      $('v-nim').textContent = 'NIM ' + st.nim + ' · terdaftar di kelas ' + k.nama;
      boxV.classList.remove('hidden');
      boxN.classList.add('hidden');
    } else {
      verifiedStudent = null;
      boxV.classList.add('hidden');
      boxN.classList.remove('hidden');
    }
  }

  /* ================= STATUS ================= */
  function pilihStatus(status) {
    selectedStatus = status;
    document.querySelectorAll('.opt-pill').forEach(function (b) {
      var st = b.getAttribute('data-status');
      if (st === status) b.classList.add('active');
      else b.classList.remove('active');
    });

    var nonHadir = status !== 'Hadir';
    $('box-alasan').classList.toggle('hidden', !nonHadir);
    if (nonHadir) $('alasan-label').textContent = status.toLowerCase();

    updateDokumenLabel();
  }

  function updateDokumenLabel() {
    var k = getKelas();
    var wajib = !!(k && k.dokumenWajib);
    var label = selectedStatus === 'Hadir' ? 'Bukti Kehadiran'
      : selectedStatus === 'Sakit' ? 'Foto Surat Sakit / Bukti'
      : 'Surat / Bukti Pendukung';
    $('dok-label').textContent = label;
    $('dok-required').textContent = wajib ? '(Wajib)' : '(Opsional)';
    $('dok-required').style.color = wajib ? '' : 'var(--muted-2)';
    $('dok-hint').textContent = wajib
      ? 'Kelas mewajibkan bukti untuk semua status.'
      : 'Bukti opsional untuk semua status — lampirkan bila ada.';
  }

  /* ================= FILE ================= */
  function handleFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      A.showToast('File Terlalu Besar', 'Maksimal 8 MB per file.', 'err');
      $('input-file').value = '';
      return;
    }
    A.fileToDataURL(file, 1000, 0.62).then(function (res) {
      fileData = res;
      var pv = $('file-preview');
      pv.classList.remove('hidden');
      $('fp-name').textContent = file.name;
      $('fp-status').textContent = res.isImage ? 'Diperkecil otomatis · siap dikirim' : 'PDF · siap dikirim';
      var thumb = $('fp-thumb');
      if (res.isImage) { thumb.src = res.dataUrl; thumb.classList.remove('hidden'); }
      else { thumb.src = ''; thumb.classList.add('hidden'); }
      $('dropzone').classList.add('has-file');
      $('dropzone-inner').classList.add('hidden');
    }).catch(function () {
      A.showToast('Gagal Baca File', 'File tidak dapat dibaca. Coba file lain.', 'err');
      $('input-file').value = '';
    });
  }

  function hapusFile(e) {
    if (e) e.stopPropagation();
    fileData = null;
    $('input-file').value = '';
    $('file-preview').classList.add('hidden');
    $('dropzone').classList.remove('has-file');
    $('dropzone-inner').classList.remove('hidden');
  }

  /* ================= KIRIM ================= */
  function kirimAbsen(e) {
    if (e) e.preventDefault();
    if (submitting) return;
    var k = getKelas();
    if (!k) { A.showToast('Pilih Kelas', 'Silakan pilih kelas terlebih dahulu.', 'warn'); return; }

    var info = A.getSessionInfo(k);
    if (!info.canSubmit) { A.showToast('Sesi Tidak Aktif', info.label + '.', 'warn'); return; }

    var nim = $('input-nim').value.trim();
    if (!nim || !verifiedStudent) { A.showToast('NIM Tidak Terdaftar', 'Hubungi admin kelas untuk didaftarkan.', 'err'); return; }
    if (String(verifiedStudent.nim).trim() !== nim) { A.showToast('Cek Kembali', 'NIM tidak cocok dengan yang terverifikasi.', 'warn'); return; }

    var alasan = '';
    if (selectedStatus !== 'Hadir') {
      alasan = $('input-alasan').value.trim();
      if (alasan.length < 5) { A.showToast('Alasan Kurang', 'Tuliskan alasan minimal 5 karakter.', 'warn'); return; }
    }

    var wajibDok = !!k.dokumenWajib;
    if (wajibDok && !fileData) {
      A.showToast('Bukti Wajib', 'Kelas mewajibkan bukti dokumentasi untuk semua status.', 'warn');
      return;
    }

    if (A.isDuplicate(k.id, k.pertemuan, nim)) {
      A.showToast('Sudah Absen', 'NIM ' + nim + ' sudah tercatat pada Pertemuan Ke-' + k.pertemuan + '.', 'warn');
      return;
    }

    submitting = true;
    var btn = $('btn-submit');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Mengirim...';

    var now = new Date();
    var payload = {
      action: 'absen',
      kelasId: k.id,
      pertemuan: k.pertemuan,
      nim: nim,
      nama: verifiedStudent.nama,
      status: selectedStatus,
      alasan: alasan,
      tsISO: now.toISOString(),
      tsDisplay: A.fmtTime(now.toISOString()),
      docName: fileData ? fileData.nama : '',
      docData: fileData && fileData.dataUrl.length < 1200000 ? fileData.dataUrl : ''
    };

    A.doAbsen(payload).then(function () {
      var log = {
        id: A.uid(),
        kelasId: k.id,
        pertemuan: k.pertemuan,
        nim: nim,
        nama: verifiedStudent.nama,
        status: selectedStatus,
        alasan: alasan,
        ts: A.fmtTime(now.toISOString()),
        iso: now.toISOString(),
        docName: fileData ? fileData.nama : '',
        docUrl: ''
      };
      A.state.logs.unshift(log);
      A.saveCache();
      resetForm();
      renderLogs();
      A.showToast('Absensi Tercatat!', verifiedStudent.nama + ' — ' + selectedStatus + ' pada Pertemuan Ke-' + k.pertemuan + '.',
        selectedStatus === 'Hadir' ? 'ok' : 'warn');
    }).finally(function () {
      submitting = false;
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Kirim Absen';
    });
  }

  function resetForm() {
    $('input-nim').value = '';
    $('input-alasan').value = '';
    $('box-verified').classList.add('hidden');
    $('box-notfound').classList.add('hidden');
    verifiedStudent = null;
    hapusFile();
    pilihStatus('Hadir');
  }

  /* ================= LOG LIST ================= */
  function renderLogs() {
    var k = getKelas();
    var listEl = $('log-list');

    if (!k) {
      listEl.innerHTML = '<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>Pilih kelas untuk melihat aktivitas.</p></div>';
      $('total-badge').textContent = '0 mahasiswa';
      return;
    }
    var logs = A.getLogsFor(k.id, k.pertemuan);
    $('total-badge').textContent = logs.length + ' mahasiswa';

    if (!logs.length) {
      listEl.innerHTML = '<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>Belum ada absen pada Pertemuan Ke-' + k.pertemuan + '.</p></div>';
      return;
    }

    listEl.innerHTML = logs.map(function (l) {
      var m = A.STATUS_META[l.status] || A.STATUS_META.Hadir;
      var html =
        '<div class="log-item">' +
          '<div class="li-avatar"><i class="fa-solid fa-user-graduate"></i></div>' +
          '<div class="li-body">' +
            '<div class="li-top">' +
              '<div>' +
                '<div class="li-name">' + A.esc(l.nama) + '</div>' +
                '<div class="li-meta">' + A.esc(l.nim) + ' · ' + A.esc(l.ts || '') + '</div>' +
              '</div>' +
              '<span class="' + m.badge + '"><i class="' + m.icon + '"></i> ' + A.esc(l.status) + '</span>' +
            '</div>' +
            (l.alasan ? '<div class="li-alasan"><i class="fa-solid fa-quote-left"></i><span>' + A.esc(l.alasan) + '</span></div>' : '') +
            (l.docName ? '<div class="li-doc" onclick="lihatBukti(\'' + l.id + '\')"><i class="fa-solid fa-paperclip"></i> ' + A.esc(l.docName) + '</div>' : '') +
          '</div>' +
        '</div>';
      return html;
    }).join('');
  }

  /* Preview bukti dari log */
  window.lihatBukti = function (id) {
    var k = getKelas();
    if (!k) return;
    var l = A.state.logs.find(function (x) { return x.id === id; });
    if (!l) return;
    var body = $('preview-body');
    if (l.docUrl) {
      body.innerHTML = '<a href="' + A.esc(l.docUrl) + '" target="_blank" rel="noopener" class="btn btn-primary">Buka di tab baru <i class="fa-solid fa-arrow-up-right-from-square"></i></a><br><br>' +
        '<div style="font-size:12px;color:var(--muted)">' + A.esc(l.docName || 'Dokumentasi') + '<br>Gambar/PDF tersimpan di Google Drive.</div>';
    } else if (l.docName) {
      body.innerHTML = '<div style="font-size:12px;color:var(--muted)"><i class="fa-solid fa-paperclip"></i> ' + A.esc(l.docName) + '<br><br>URL dokumen belum tersinkron dari spreadsheet. Tunggu sinkron otomatis, atau buka Panel Admin.</div>';
    } else {
      body.innerHTML = 'Tidak ada bukti dilampirkan.';
    }
    $('preview-title').textContent = l.docName || 'Dokumentasi';
    $('modal-preview').classList.add('show');
  };

  window.pilihStatus = pilihStatus;
  window.hapusFile = hapusFile;
  window.kirimAbsen = kirimAbsen;
  window.tutupModal = function (id) { document.getElementById(id).classList.remove('show'); };
})();