/* data.js — Logika halaman Data (lihat, cari, filter, cetak) */
(function () {
  'use strict';
  var A = window.Absensi;

  function $(id) { return document.getElementById(id); }

  /* ================= INIT ================= */
  document.addEventListener('DOMContentLoaded', function () {
    A.loadCache();
    renderKelasSelect();
    A.startAutoSync(function (r) {
      renderKelasSelect();
      renderAll();
      if (r && !r.ok && A.isSheetConfigured()) A.showToast('Sinkron', r.msg, 'warn');
    }, 45000);
    A.setOnExternalChange(function () { renderKelasSelect(); renderAll(); });

    $('filter-kelas').addEventListener('change', function () {
      try { localStorage.setItem('absv2_data_kelas', this.value); } catch (e) {}
      renderPertemuanSelect();
      renderAll();
    });
    $('filter-pertemuan').addEventListener('change', renderAll);
    $('filter-status').addEventListener('change', renderAll);
    $('search-input').addEventListener('input', renderAll);
  });

  function getKelasId() { return $('filter-kelas').value || (A.classes[0] && A.classes[0].id) || ''; }
  function getPertemuan() { return parseInt($('filter-pertemuan').value, 10) || 0; }

  /* ================= SELECTOR ================= */
  function renderKelasSelect() {
    var sel = $('filter-kelas');
    var prev = '';
    try { prev = localStorage.getItem('absv2_data_kelas') || sel.value; } catch (e) {}
    sel.innerHTML = A.classes.length
      ? A.classes.map(function (c) { return '<option value="' + A.esc(c.id) + '">' + A.esc(c.nama) + '</option>'; }).join('')
      : '<option value="">Belum ada kelas</option>';
    var k = A.getKelas(prev);
    if (k) sel.value = k.id;
    else if (A.classes.length) sel.value = A.classes[0].id;
    renderPertemuanSelect();
  }

  function renderPertemuanSelect() {
    var kid = getKelasId();
    var sel = $('filter-pertemuan');
    var k = A.getKelas(kid);
    if (!k) { sel.innerHTML = '<option value="">—</option>'; return; }
    var meetings = A.getMeetingsOf(kid);
    if (meetings.indexOf(k.pertemuan) === -1) meetings.unshift(k.pertemuan);
    meetings.sort(function (a, b) { return a - b; });

    var prev = sel.value;
    sel.innerHTML = meetings.map(function (m) {
      return '<option value="' + m + '">Pertemuan Ke-' + m + (m === k.pertemuan ? ' (aktif)' : '') + '</option>';
    }).join('');
    if (prev && meetings.indexOf(parseInt(prev, 10)) !== -1) sel.value = prev;
    else sel.value = k.pertemuan;
  }

  /* ================= RENDER ================= */
  function renderAll() {
    renderHeader();
    renderTable();
  }

  function renderHeader() {
    var kid = getKelasId();
    var k = A.getKelas(kid);
    var p = getPertemuan();
    if (!k || !p) {
      $('tabel-judul').textContent = 'Rekap Absensi';
      $('tabel-sub').textContent = 'Belum ada data';
      $('count-row').textContent = '0 catatan';
      return;
    }
    var judul = k.judul ? ' — ' + k.judul : '';
    $('tabel-judul').textContent = k.nama + ' · Pertemuan Ke-' + p + judul;
    $('tabel-sub').textContent = (k.matkul || 'Tanpa mata kuliah') + (k.hari ? ' · ' + k.hari : '') + ' · ' + A.todayLabel();
    $('print-kelas-info').textContent = (A.config.appName || 'Absensi Mahasiswa') + ' — ' + k.nama + (k.matkul ? ' · ' + k.matkul : '') + (k.hari ? ' · ' + k.hari : '') + ' · Pertemuan Ke-' + p + judul;
    $('print-meta').innerHTML =
      '<span><strong>Kelas:</strong> ' + A.esc(k.nama) + '</span>' +
      '<span><strong>Mata Kuliah:</strong> ' + A.esc(k.matkul || '—') + '</span>' +
      '<span><strong>Hari:</strong> ' + A.esc(k.hari || '—') + '</span>' +
      '<span><strong>Pertemuan:</strong> Ke-' + p + judul + '</span>' +
      '<span><strong>Tanggal Cetak:</strong> ' + A.todayLabel() + '</span>' +
      '<span><strong>Jam Sesi:</strong> ' + A.esc(k.jamBuka || '--:--') + ' – ' + A.esc(k.jamTutup || '--:--') + '</span>';
  }

  function getFiltered() {
    var kid = getKelasId();
    var p = getPertemuan();
    var stat = $('filter-status').value;
    var q = ($('search-input').value || '').toLowerCase().trim();

    var logs = A.getLogsFor(kid, p);
    if (stat === 'TIDAK_HADIR') logs = logs.filter(function (l) { return A.ABSENT_GROUP.indexOf(l.status) !== -1; });
    else if (stat) logs = logs.filter(function (l) { return l.status === stat; });

    if (q) {
      logs = logs.filter(function (l) {
        return String(l.nim).toLowerCase().indexOf(q) !== -1 || String(l.nama).toLowerCase().indexOf(q) !== -1;
      });
    }
    return logs;
  }

  function renderTable() {
    var kid = getKelasId();
    var p = getPertemuan();
    var logs = getFiltered();
    var all = A.getLogsFor(kid, p);

    /* Statistik (dari seluruh data pertemuan, bukan hasil filter) */
    var c = { Hadir: 0, Sakit: 0, Izin: 0, Dispen: 0 };
    all.forEach(function (l) { if (c[l.status] !== undefined) c[l.status]++; });
    $('st-total').textContent = all.length;
    $('st-hadir').textContent = c.Hadir;
    $('st-absent').textContent = c.Sakit + c.Izin + c.Dispen;
    $('st-sakit').textContent = c.Sakit;
    $('st-izin').textContent = c.Izin;
    $('st-dispen').textContent = c.Dispen;

    var q = ($('search-input').value || '').toLowerCase().trim();
    $('info-catatan').textContent = 'Menampilkan ' + logs.length + ' dari ' + all.length + ' catatan' +
      ($('filter-status').value ? ' · filter status aktif' : '') + (q ? ' · pencarian: "' + q + '"' : '') +
      (all.length ? ' · kehadiran ' + Math.round(c.Hadir / all.length * 100) + '%' : '');
    $('count-row').textContent = logs.length + ' catatan';

    var tb = $('table-body');
    if (!kid || !p || !all.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-regular fa-folder-open"></i><p>Belum ada data absensi pada pertemuan ini.</p></td></tr>';
      return;
    }
    if (!logs.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><p>Tidak ada catatan yang cocok dengan filter.</p></td></tr>';
      return;
    }

    tb.innerHTML = logs.map(function (l, i) {
      var m = A.STATUS_META[l.status] || A.STATUS_META.Hadir;
      var docCell;
      if (l.docUrl) {
        docCell = '<button class="btn btn-sm btn-soft-blue" onclick="bukaBukti(\'' + l.id + '\')"><i class="fa-solid fa-eye"></i> Lihat</button>';
      } else if (l.docName) {
        docCell = '<span class="badge badge-slate" title="' + A.esc(l.docName) + '"><i class="fa-solid fa-paperclip"></i> Ada</span>';
      } else {
        docCell = '<span class="muted-text">—</span>';
      }
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td class="muted-text" style="font-size:11.5px;white-space:nowrap;font-family:var(--mono)">' + A.esc(l.ts || '') + '</td>' +
        '<td class="mono">' + A.esc(l.nim) + '</td>' +
        '<td style="font-weight:600">' + A.esc(l.nama) + '</td>' +
        '<td style="text-align:center"><span class="' + m.badge + '"><i class="' + m.icon + '"></i> ' + A.esc(l.status) + '</span></td>' +
        '<td style="font-size:12px;color:var(--muted);max-width:190px">' + (l.alasan ? A.esc(l.alasan) : '<span class="muted-text" style="opacity:.5">—</span>') + '</td>' +
        '<td style="text-align:center">' + docCell + '</td>' +
      '</tr>';
    }).join('');
  }

  /* ================= BUKTI ================= */
  window.bukaBukti = function (id) {
    var l = A.state.logs.find(function (x) { return x.id === id; });
    if (!l) return;
    var body = $('preview-body');
    $('preview-title').textContent = l.docName || 'Dokumentasi ' + l.nama;
    if (l.docUrl) {
      body.innerHTML = '<a href="' + A.esc(l.docUrl) + '" target="_blank" rel="noopener" class="btn btn-primary">Buka dokumen di tab baru <i class="fa-solid fa-arrow-up-right-from-square"></i></a>' +
        '<br><br><div style="font-size:12px;color:var(--muted)">' + A.esc(l.docName || 'Dokumen') + '<br>Disimpan di Google Drive · ' + A.esc(l.nama) + ' (' + A.esc(l.nim) + ')</div>';
    } else if (l.docName) {
      body.innerHTML = '<div style="font-size:12.5px;color:var(--muted-2)"><i class="fa-solid fa-paperclip"></i> ' + A.esc(l.docName) + '<br><br>URL dokumen belum tersinkron. Tunggu sinkron otomatis.</div>';
    } else {
      body.innerHTML = 'Tidak ada bukti dilampirkan.';
    }
    $('modal-preview').classList.add('show');
  };

  window.tutupModal = function () { $('modal-preview').classList.remove('show'); };

  /* ================= CETAK ================= */
  window.cetak = function () {
    var kid = getKelasId();
    var k = A.getKelas(kid);
    if (!k) { A.showToast('Belum Ada Data', 'Pilih kelas dan pertemuan dulu.', 'warn'); return; }
    window.print();
  };

  /* ================= CSV ================= */
  window.exportCSV = function () {
    var kid = getKelasId();
    var p = getPertemuan();
    var k = A.getKelas(kid);
    if (!k || !p) { A.showToast('Belum Ada Data', 'Pilih kelas dan pertemuan dulu.', 'warn'); return; }
    var logs = getFiltered();

    var rows = [['No', 'Waktu', 'NIM', 'Nama', 'Status', 'Alasan', 'Bukti', 'URL Bukti']];
    logs.forEach(function (l, i) {
      rows.push([i + 1, l.ts || '', l.nim, l.nama, l.status, l.alasan, l.docName || '', l.docUrl || '']);
    });

    var fname = (k.nama.replace(/[^\w]+/g, '_') + '_P' + p + '.csv');
    A.exportCSV(rows, fname);
    A.showToast('CSV Diunduh', fname + ' (' + logs.length + ' baris).', 'ok');
  };
})();