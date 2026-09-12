/* ============================================================
   Absensi Mahasiswa — shared.js
   Dipakai oleh: index.html · admin.html · data.html
   ------------------------------------------------------------
   Arsitektur:
   - Google Spreadsheet (via Apps Script) = sumber kebenaran
   - localStorage = cache ringan untuk tampilan cepat
   - Baca data  = JSONP via GET (?action=...)
   - Tulis data = POST mode no-cors (fire & forget, lalu auto-sync)
   ============================================================ */
(function () {
  'use strict';

  var KEYS = {
    cache:  'absv2_cache',
    script: 'absv2_script_url',
    kelas:  'absv2_selected_kelas'
  };

  /* ---------------- Status kehadiran ---------------- */
  var STATUS_META = {
    Hadir:  { badge: 'badge badge-hadir',  icon: 'fa-solid fa-circle-check',       grad: 'pill-hadir',  color: '#059669', rank: 0 },
    Sakit:  { badge: 'badge badge-sakit',  icon: 'fa-solid fa-heart-pulse',        grad: 'pill-sakit',  color: '#d97706', rank: 1 },
    Izin:   { badge: 'badge badge-izin',   icon: 'fa-solid fa-envelope-open-text', grad: 'pill-izin',   color: '#0284c7', rank: 2 },
    Dispen: { badge: 'badge badge-dispen', icon: 'fa-solid fa-file-shield',        grad: 'pill-dispen', color: '#6d28d9', rank: 3 }
  };
  var ABSENT_GROUP = ['Sakit', 'Izin', 'Dispen'];

  /* ---------------- State ---------------- */
  var state = {
    config: { appName: 'Sistem Absensi Mahasiswa', admins: [], classes: [] },
    master: [],   // { kelasId, nim, nama }
    logs: []      // { id, kelasId, pertemuan, nim, nama, status, alasan, ts, iso, docUrl, docName }
  };
  /* URL Apps Script default: dipakai otomatis di semua perangkat/browser baru
     (saat localStorage kosong). Karena URL disimpan per-browser, tanpa ini
     setiap device baru harus memasukkan URL manual. Bisa diubah via
     Panel Admin > Pengaturan (nilainya disimpan di localStorage & menang). */
  var DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0cxlnhcJX-0ahN_NRZAazh7bO2kaQ8qofrrcmmlGJqwEG7tMlGTWTvvQvwzGYS55D/exec';
  var scriptURL = (function () {
    try { return localStorage.getItem(KEYS.script) || DEFAULT_SCRIPT_URL; } catch (e) { return DEFAULT_SCRIPT_URL; }
  })();
  var onExternalChange = null;
  var _syncBusy = false;
  var _configLoaded = false; // true setelah konfigurasi asli dari backend (atau cache) termuat

  /* ================= CACHE ================= */
  function loadCache() {
    try {
      var raw = localStorage.getItem(KEYS.cache);
      if (!raw) return;
      var c = JSON.parse(raw);
      if (c && c.config) {
        state.config = Object.assign({ appName: 'Sistem Absensi Mahasiswa', admins: [], classes: [] }, c.config);
        state.master = c.master || [];
        state.logs = c.logs || [];
        _configLoaded = true;
      }
    } catch (e) { /* abaikan */ }
  }
  function saveCache() {
    try {
      localStorage.setItem(KEYS.cache, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }
  function saveScriptURL() {
    try { localStorage.setItem(KEYS.script, scriptURL); } catch (e) {}
  }
  function isSheetConfigured() {
    return !!scriptURL && scriptURL.indexOf('script.google.com') !== -1;
  }

  /* ================= HELPER ================= */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function getKelas(id) {
    var list = state.config.classes || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function getStudents(kelasId) {
    return state.master.filter(function (s) { return s.kelasId === kelasId; })
      .sort(function (a, b) { return String(a.nim).localeCompare(String(b.nim), 'en', { numeric: true }); });
  }
  function getLogsFor(kelasId, pertemuan) {
    return state.logs.filter(function (l) {
      return l.kelasId === kelasId && parseInt(l.pertemuan, 10) === parseInt(pertemuan, 10);
    });
  }
  function getMeetingsOf(kelasId) {
    var arr = [];
    state.logs.forEach(function (l) {
      if (l.kelasId !== kelasId) return;
      var n = parseInt(l.pertemuan, 10);
      if (!isNaN(n) && arr.indexOf(n) === -1) arr.push(n);
    });
    arr.sort(function (a, b) { return a - b; });
    return arr;
  }
  function isDuplicate(kelasId, pertemuan, nim) {
    return state.logs.some(function (l) {
      return l.kelasId === kelasId && parseInt(l.pertemuan, 10) === parseInt(pertemuan, 10) && String(l.nim) === String(nim);
    });
  }

  /* ================= SESI PER KELAS ================= */
  function fmtDur(ms) {
    ms = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }
  /* code: ACTIVE | NOT_STARTED | ENDED | FORCE_OPEN | CLOSED | NO_CLASS */
  function getSessionInfo(kelas) {
    if (!kelas) return { code: 'NO_CLASS', label: 'Pilih kelas terlebih dahulu', shortLabel: 'Pilih Kelas', canSubmit: false, countdown: '--:--:--', level: 'warn' };
    var now = new Date();
    var mode = kelas.mode || 'OPEN';

    if (mode === 'CLOSED') return { code: 'CLOSED', label: 'Sesi ditutup oleh admin', shortLabel: 'Ditutup', canSubmit: false, countdown: 'TERUTUP', level: 'danger' };
    if (mode === 'FORCE_OPEN') return { code: 'FORCE_OPEN', label: 'Sesi dibuka manual oleh admin', shortLabel: 'Sesi Aktif', canSubmit: true, countdown: 'BUKA', level: 'success' };

    var b = (kelas.jamBuka || '08:00').split(':');
    var t = (kelas.jamTutup || '10:00').split(':');
    var openAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +b[0], +b[1] || 0, 0);
    var closeAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +t[0], +t[1] || 0, 0);

    if (now < openAt) return { code: 'NOT_STARTED', label: 'Sesi belum dibuka — menunggu jam ' + kelas.jamBuka, shortLabel: 'Belum Buka', canSubmit: false, countdown: fmtDur(openAt - now), level: 'warn' };
    if (now <= closeAt) return { code: 'ACTIVE', label: 'Sisa waktu presensi', shortLabel: 'Sesi Aktif', canSubmit: true, countdown: fmtDur(closeAt - now), level: 'success' };
    return { code: 'ENDED', label: 'Waktu absen telah habis', shortLabel: 'Waktu Habis', canSubmit: false, countdown: 'HABIS', level: 'danger' };
  }

  /* ================= HTTP: JSONP (baca dari spreadsheet) ================= */
  function fetchJSONP(action, params, cb, timeoutMs) {
    var url = scriptURL.trim();
    if (!isSheetConfigured()) {
      cb({ ok: false, msg: 'URL Apps Script belum diatur. Buka Panel Admin > Pengaturan.' });
      return;
    }
    var qs = '?action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function (k) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }
      });
    }
    var prefix = '_cb' + Math.random().toString(36).slice(2, 10);
    var s = document.createElement('script');
    var done = false;
    function cleanup() {
      done = true;
      try { delete window[prefix]; } catch (e) { window[prefix] = undefined; }
      try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
    }
    window[prefix] = function (data) { cleanup(); cb(data); };
    s.onerror = function () {
      if (done) return;
      cleanup();
      cb({ ok: false, msg: 'Gagal terhubung ke spreadsheet. Cek URL & deployment Apps Script.' });
    };
    s.src = url + qs + '&prefix=' + prefix;
    setTimeout(function () { if (!done) { cleanup(); cb({ ok: false, msg: 'Waktu tunggu habis. Periksa URL Apps Script & koneksi.' }); } }, timeoutMs || 25000);
    document.head.appendChild(s);
  }

  /* ================= HTTP: POST (tulis ke spreadsheet) ================= */
  /* Retry otomatis khusus operasi idempoten (save_config/save_master/delete_log):
     kalau koneksi putus atau server nggantung, coba ulang dgn jeda makin lama.
     Untuk 'absen' (append baris) retry MATI: kalau gagal, user mengulang manual —
     mencegah data absen ganda saat submit pertama sebenarnya tersimpan. */
  function postToSheet(payload, retries) {
    if (!isSheetConfigured()) return Promise.resolve({ ok: false, msg: 'URL belum diatur' });
    retries = (retries == null) ? 2 : Math.max(0, retries);
    var attempt = 0;
    var TIMEOUT_MS = 18000;

    function tryOnce() {
      attempt++;
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
      return fetch(scriptURL.trim(), {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function () {
        if (timer) clearTimeout(timer);
        return { ok: true };
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        if (attempt <= retries) {
          var wait = 600 * Math.pow(2, attempt - 1);
          console.warn('POST gagal (percobaan ' + attempt + '), coba lagi dalam ' + wait + 'ms:', err && err.name || err);
          return new Promise(function (resolve) { setTimeout(function () { resolve(tryOnce()); }, wait); });
        }
        console.error('Gagal POST:', err);
        return { ok: false, msg: 'Koneksi gagal — periksa jaringan & coba lagi.' };
      });
    }
    return tryOnce();
  }

  /* ================= SYNC (tarik semua dari spreadsheet) ================= */
  /* Tiga fetch dijalankan PARALEL (bukan berurutan) agar tiap aksi selesai ~3x lebih cepat. */
  function syncAll(onDone) {
    if (!isSheetConfigured()) { if (onDone) onDone({ ok: false, msg: 'URL belum diatur' }); return; }
    if (_syncBusy) return;
    _syncBusy = true;

    function wrap(action) {
      return new Promise(function (resolve) { fetchJSONP(action, null, resolve); });
    }

    Promise.all([wrap('get_config'), wrap('get_master'), wrap('get_logs')]).then(function (rs) {
      var cfg = rs[0], m = rs[1], l = rs[2];
      _syncBusy = false;
      if (cfg && cfg.ok && cfg.config) { state.config = cfg.config; _configLoaded = true; }
      if (m && m.ok && m.students) state.master = m.students;
      if (l && l.ok && l.logs) state.logs = l.logs;
      saveCache();
      if (onDone) {
        onDone({
          ok: cfg && cfg.ok && m && m.ok && l && l.ok,
          msg: (!cfg || !cfg.ok) ? (cfg && cfg.msg || 'Gagal ambil konfigurasi') : (!m || !m.ok) ? (m && m.msg || 'Gagal ambil master') : (l && l.msg || 'Gagal ambil log')
        });
      }
    });
  }

  function startAutoSync(onDone, ms) {
    syncAll(onDone);
    setInterval(function () { syncAll(onDone); }, ms || 45000);
  }

  /* ================= ABSEN ================= */
  /* payload: { action:'absen', kelasId, pertemuan, nim, nama, status, alasan, tsISO, tsDisplay, docName, docData } */
  function doAbsen(payload) {
    return postToSheet(payload, 0); /* tanpa retry otomatis — cegah absen ganda */
  }

  /* ================= KONFIGURASI (admin) ================= */
  function saveConfig(config, cb) {
    /* PENGAMAN: jangan pernah menulis ke spreadsheet sebelum konfigurasi asli
       termuat. Tanpa ini, perangkat baru (localStorage kosong) bisa menimpa
       semua kelas/akun dengan data kosong. */
    if (!_configLoaded) {
      if (cb) cb({ ok: false, msg: 'Tunggu sinkron pertama selesai, lalu coba lagi.' });
      return Promise.resolve({ ok: false, msg: 'Belum sinkron' });
    }
    state.config = config;
    saveCache();
    return postToSheet({ action: 'save_config', appName: config.appName, admins: config.admins, classes: config.classes })
      .then(function (r) {
        /* Beri jeda singkat agar POST selesai diproses backend, lalu sinkron ulang (paralel) */
        setTimeout(function () {
          syncAll(function () { if (cb) cb(r); });
        }, 400);
        return r;
      });
  }

  function saveMasterForClass(kelasId, students, cb) {
    // hapus cache lama kelas tsb lalu isi ulang
    state.master = state.master.filter(function (s) { return s.kelasId !== kelasId; })
      .concat(students.map(function (s) { return { kelasId: kelasId, nim: String(s.nim).trim(), nama: String(s.nama).trim() }; }));
    saveCache();
    return postToSheet({ action: 'save_master', kelasId: kelasId, students: students })
      .then(function (r) {
        setTimeout(function () {
          syncAll(function () { if (cb) cb(r); });
        }, 400);
        return r;
      });
  }

  function deleteLogEntry(kelasId, pertemuan, nim, cb) {
    state.logs = state.logs.filter(function (l) {
      return !(l.kelasId === kelasId && parseInt(l.pertemuan, 10) === parseInt(pertemuan, 10) && String(l.nim) === String(nim));
    });
    saveCache();
    return postToSheet({ action: 'delete_log', kelasId: kelasId, pertemuan: pertemuan, nim: nim })
      .then(function (r) {
        if (cb) cb(r);
        return r;
      });
  }

  /* ================= KONVERSI FILE ================= */
  /* Resolve { dataUrl, isImage, nama } — gambar dikompres otomatis */
  function fileToDataURL(file, maxDim, quality) {
    maxDim = maxDim || 1000;
    quality = quality || 0.62;
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('Tidak ada file'));
      if (file.type === 'application/pdf') {
        var fr = new FileReader();
        fr.onload = function () { resolve({ dataUrl: fr.result, isImage: false, nama: file.name }); };
        fr.onerror = reject;
        fr.readAsDataURL(file);
        return;
      }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', quality), isImage: true, nama: file.name });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Gambar tidak terbaca')); };
      img.src = url;
    });
  }

  /* ================= SHA-256 (login admin) ================= */
  function sha256(text) {
    if (window.crypto && crypto.subtle && TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        });
    }
    return Promise.resolve(null);
  }

  /* ================= TOAST ================= */
  var _toastTimer = null;
  function showToast(title, message, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    type = type || 'ok';
    var icons = { ok: 'fa-solid fa-circle-check', warn: 'fa-solid fa-triangle-exclamation', err: 'fa-solid fa-circle-xmark' };
    t.querySelector('.t-icon').className = 't-icon ' + (type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : 'err');
    t.querySelector('.t-icon').innerHTML = '<i class="' + icons[type] + '"></i>';
    t.querySelector('.t-title').textContent = title;
    t.querySelector('.t-msg').textContent = message;
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4200);
  }
  function hideToast() {
    var t = document.getElementById('toast');
    if (t) t.classList.remove('show');
  }

  /* ================= EXPORT & PRINT ================= */
  function exportCSV(rows, filename) {
    /* rows: array of array */
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        c = String(c == null ? '' : c);
        return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'data.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ================= RUPI: format tanggal ================= */
  function fmtTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d)) return '';
      var dd = pad2(d.getDate()), mm = pad2(d.getMonth() + 1), yyyy = d.getFullYear();
      var hh = pad2(d.getHours()), mi = pad2(d.getMinutes());
      return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
    } catch (e) { return ''; }
  }
  function todayLabel() {
    return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ================= KELAS BARU ================= */
  function newKelasId() { return 'k' + Date.now().toString(36); }

  /* ================= PUBLIC API ================= */
  var api = {
    KEYS: KEYS,
    STATUS_META: STATUS_META,
    ABSENT_GROUP: ABSENT_GROUP,

    get state() { return state; },
    get scriptURL() { return scriptURL; },
    set scriptURL(v) { scriptURL = String(v || '').trim(); saveScriptURL(); },
    get config() { return state.config; },
    get classes() { return state.config.classes || []; },

    loadCache: loadCache,
    saveCache: saveCache,
    isSheetConfigured: isSheetConfigured,
    esc: esc,
    uid: uid,
    pad2: pad2,
    getKelas: getKelas,
    getStudents: getStudents,
    getLogsFor: getLogsFor,
    getMeetingsOf: getMeetingsOf,
    isDuplicate: isDuplicate,
    getSessionInfo: getSessionInfo,
    fmtDur: fmtDur,
    fmtTime: fmtTime,
    todayLabel: todayLabel,

    fetchJSONP: fetchJSONP,
    postToSheet: postToSheet,
    syncAll: syncAll,
    startAutoSync: startAutoSync,
    doAbsen: doAbsen,
    saveConfig: saveConfig,
    saveMasterForClass: saveMasterForClass,
    deleteLogEntry: deleteLogEntry,
    fileToDataURL: fileToDataURL,
    sha256: sha256,

    showToast: showToast,
    hideToast: hideToast,
    exportCSV: exportCSV,
    newKelasId: newKelasId,

    setOnExternalChange: function (fn) { onExternalChange = fn; }
  };

  /* Sinkron antar-tab */
  window.addEventListener('storage', function (e) {
    if (e.key === KEYS.cache || e.key === KEYS.script) {
      loadCache();
      if (typeof onExternalChange === 'function') onExternalChange();
    }
  });

  window.Absensi = api;
  loadCache();
})();