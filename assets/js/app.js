(() => {
  'use strict';

  const STORAGE_KEY = 'talenta_nduga_db_v9';
  const SESSION_KEY = 'talenta_nduga_session_v9';
  const LOGIN_GUARD_KEY = 'talenta_nduga_login_guard_v9';
  const SIDEBAR_STATE_KEY = 'talenta_nduga_sidebar_collapsed_v3';
  const THEME_KEY = 'talenta_nduga_theme_v5';
  const DEFAULT_SESSION_LIFETIME_MS = 60 * 60 * 1000;
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOGIN_BLOCK_MS = 60 * 1000;
  const app = document.getElementById('app');
  const toastRoot = document.getElementById('toast-root');
  let mobileNavOpen = false;
  let accountMenuOpen = false;
  let notificationMenuOpen = false;
  let sidebarCollapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === '1';

  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => Date.now() + Math.floor(Math.random() * 10000);
  const now = () => new Date().toISOString();
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const fmtDate = (value, withTime = false) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('id-ID', withTime ? {
      dateStyle: 'medium', timeStyle: 'short', timeZone: effectiveTimezone()
    } : { dateStyle: 'medium', timeZone: effectiveTimezone() }).format(date);
  };
  const daysUntil = value => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  const csvSafe = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

  const STATUS_LABELS = {
    active: 'Aktif', suspended: 'Dinonaktifkan', pending_verification: 'Menunggu Verifikasi',
    draft: 'Draf', submitted: 'Diajukan', in_review: 'Dalam Peninjauan', needs_revision: 'Perlu Perbaikan', verified: 'Terverifikasi',
    uploaded: 'Terunggah', pending_review: 'Menunggu Peninjauan', rejected: 'Ditolak', expired: 'Kedaluwarsa', superseded: 'Diganti',
    published: 'Terbit', scheduled: 'Terjadwal', closed: 'Ditutup', archived: 'Diarsipkan', private: 'Privat',
    sent: 'Terkirim', failed: 'Gagal', canceled: 'Dibatalkan', revoked: 'Dicabut', enabled: 'Aktif', disabled: 'Nonaktif', required: 'Wajib', aktif: 'Aktif', lulus: 'Lulus', calon: 'Calon', cuti: 'Cuti',
    operator: 'Operator', admin: 'Administrator', superadmin: 'Administrator Utama', user: 'Pelajar/Mahasiswa'
  };

  const ROLE_LABELS = {
    user: 'Pelajar/Mahasiswa', operator: 'Operator', admin: 'Administrator', superadmin: 'Administrator Utama'
  };

  const LEVELS = ['SMA/SMK', 'S1', 'S2', 'S3'];

  const FA_ICONS = {
    info:'fa-circle-info', scholarship:'fa-graduation-cap', calendar:'fa-calendar-days', users:'fa-users', help:'fa-circle-question', login:'fa-right-to-bracket',
    userPlus:'fa-user-plus', dashboard:'fa-chart-line', user:'fa-user', education:'fa-user-graduate', document:'fa-file-lines', bookmark:'fa-bookmark', bell:'fa-bell',
    resume:'fa-id-card', shield:'fa-shield-halved', verify:'fa-circle-check', download:'fa-download', activity:'fa-wave-square', partner:'fa-handshake', database:'fa-database',
    report:'fa-chart-column', roles:'fa-user-shield', settings:'fa-gear', audit:'fa-clock-rotate-left', security:'fa-lock', menu:'fa-bars', close:'fa-xmark', chevron:'fa-chevron-right',
    chevronDown:'fa-chevron-down', logout:'fa-right-from-bracket', eye:'fa-eye', edit:'fa-pen-to-square', plus:'fa-plus', filePdf:'fa-file-pdf', fileExcel:'fa-file-excel', key:'fa-key',
    lock:'fa-lock', scope:'fa-bullseye', check:'fa-check', warning:'fa-triangle-exclamation', history:'fa-clock-rotate-left', search:'fa-magnifying-glass', sun:'fa-sun', moon:'fa-moon',
    graduation:'fa-graduation-cap', filter:'fa-filter', refresh:'fa-rotate', trash:'fa-trash-can', send:'fa-paper-plane', file:'fa-file', traffic:'fa-chart-line', image:'fa-image',
    export:'fa-file-export', idBadge:'fa-id-badge', building:'fa-building', briefcase:'fa-briefcase', map:'fa-location-dot', chart:'fa-chart-simple', clock:'fa-clock', mobile:'fa-mobile-screen-button', arrowLeft:'fa-arrow-left', external:'fa-arrow-up-right-from-square'
  };

  function icon(name, cls = '') {
    return `<i class="fa-solid ${FA_ICONS[name] || FA_ICONS.info} ui-icon ${cls}" aria-hidden="true"></i>`;
  }

  function initials(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(part => part[0]).join('') || 'TN').toUpperCase();
  }

  function avatarMarkup(user, cls = '') {
    const photo = String(user?.profilePhoto || '');
    if (user?.profilePhotoBlobKey) return `<span class="account-avatar ${cls}"><img data-media-key="${esc(user.profilePhotoBlobKey)}" alt="Foto profil ${esc(user?.name || 'pengguna')}"></span>`;
    if (photo.startsWith('data:image/')) return `<span class="account-avatar ${cls}"><img src="${esc(photo)}" alt="Foto profil ${esc(user?.name || 'pengguna')}"></span>`;
    return `<span class="account-avatar ${cls}">${esc(initials(user?.name || 'Talenta Nduga'))}</span>`;
  }

  const FILE_DB_NAME = 'talenta_nduga_files_v1';
  const FILE_STORE_NAME = 'documents';
  const pendingReplacementFiles = new Map();
  const memoryFileFallback = new Map();
  const ACCEPTED_DOCUMENT_EXTENSIONS = new Set(['pdf','jpg','jpeg','png','webp','doc','docx','xls','xlsx','ppt','pptx','txt','csv','odt','ods']);

  function documentFileKey(documentId) { return `document:${documentId}`; }

  function openFileDatabase() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FILE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(FILE_STORE_NAME)) database.createObjectStore(FILE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Penyimpanan berkas tidak dapat dibuka.'));
    });
  }

  const fileStore = {
    async put(key, file) {
      if (typeof indexedDB === 'undefined') { memoryFileFallback.set(key, file); return; }
      const database = await openFileDatabase();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(FILE_STORE_NAME, 'readwrite');
        tx.objectStore(FILE_STORE_NAME).put(file, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Berkas tidak dapat disimpan.'));
      });
      database.close();
    },
    async get(key) {
      if (typeof indexedDB === 'undefined') return memoryFileFallback.get(key) || null;
      const database = await openFileDatabase();
      const result = await new Promise((resolve, reject) => {
        const tx = database.transaction(FILE_STORE_NAME, 'readonly');
        const request = tx.objectStore(FILE_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Berkas tidak dapat dibaca.'));
      });
      database.close();
      return result;
    },
    async delete(key) {
      memoryFileFallback.delete(key);
      if (typeof indexedDB === 'undefined') return;
      const database = await openFileDatabase();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(FILE_STORE_NAME, 'readwrite');
        tx.objectStore(FILE_STORE_NAME).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Berkas tidak dapat dihapus.'));
      });
      database.close();
    }
  };

  const mediaObjectUrlCache = new Map();
  function mediaFileKey(kind, id) { return `media:${kind}:${id}`; }
  async function hydrateStoredMedia(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const nodes = [...root.querySelectorAll('img[data-media-key]')];
    await Promise.all(nodes.map(async node => {
      const key = node.dataset.mediaKey;
      if (!key) return;
      try {
        const file = await fileStore.get(key);
        if (!file) { node.classList.add('media-missing'); return; }
        const previous = mediaObjectUrlCache.get(node);
        if (previous) URL.revokeObjectURL(previous);
        const url = URL.createObjectURL(file);
        mediaObjectUrlCache.set(node, url);
        node.src = url;
        node.classList.remove('media-missing');
      } catch (_) { node.classList.add('media-missing'); }
    }));
  }
  async function persistImageUpload(file, currentItem, kind, id) {
    if (!file || !file.size) return {
      image: currentItem?.image || '', imageBlobKey: currentItem?.imageBlobKey || '', imageName: currentItem?.imageName || '',
      imageMime: currentItem?.imageMime || '', imageSize: currentItem?.imageSize || 0
    };
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('Format gambar harus JPG, PNG, atau WebP.');
    const key = mediaFileKey(kind, id);
    await fileStore.put(key, file);
    if (currentItem?.imageBlobKey && currentItem.imageBlobKey !== key) await fileStore.delete(currentItem.imageBlobKey);
    return { image:'', imageBlobKey:key, imageName:file.name, imageMime:file.type, imageSize:file.size };
  }

  function documentExtension(file) { return String(file?.name || '').split('.').pop().toLowerCase(); }
  function validDocumentFile(file) { return !!file && ACCEPTED_DOCUMENT_EXTENSIONS.has(documentExtension(file)); }
  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let value = size, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }
  function reviewHistory(doc) {
    if (Array.isArray(doc.reviewHistory) && doc.reviewHistory.length) return doc.reviewHistory;
    if (doc.note && ['verified','rejected'].includes(doc.status)) return [{ status:doc.status, note:doc.note, reviewer:doc.reviewedBy || 'Petugas verifikasi', reviewedAt:doc.reviewedAt || doc.updatedAt }];
    return [];
  }
  function latestReview(doc) {
    const history = reviewHistory(doc);
    return history.length ? history[history.length - 1] : null;
  }



  function currentTheme() { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  function applyTheme(theme = currentTheme()) {
    localStorage.setItem(THEME_KEY, theme);
    document.body?.classList?.toggle('dark-theme', theme === 'dark');
    if (document.documentElement?.setAttribute) document.documentElement.setAttribute('data-theme', theme);
  }
  function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); render(); }


  const store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      const seed = clone(window.TN_SEED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    },
    save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },
    reset() {
      const seed = clone(window.TN_SEED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LOGIN_GUARD_KEY);
      db = seed;
      location.hash = '#/';
      toast('Data lokal berhasil dikembalikan ke kondisi awal.', 'success');
    }
  };

  let db = store.load();

  function migratePrototypeData() {
    let changed = false;
    const seed = window.TN_SEED || {};
    if (!db.systemSettings) { db.systemSettings = clone(seed.systemSettings || {}); changed = true; }
    if (!db.trafficAnalytics) { db.trafficAnalytics = clone(seed.trafficAnalytics || { hour:[], day:[], week:[], month:[], year:[], sources:[], devices:[], topPages:[], trafficEvents:[] }); changed = true; }
    if (!Array.isArray(db.trafficAnalytics.trafficEvents)) { db.trafficAnalytics.trafficEvents = []; changed = true; }
    for (const collection of ['scholarships','activities','partners']) for (const item of (db[collection] || [])) if (!('image' in item)) { item.image=''; changed = true; }
    const seedStaff = new Map((seed.users || []).filter(u => u.role !== 'user').map(u => [u.id,u]));
    for (const user of db.users || []) if (user.role !== 'user') {
      const source = seedStaff.get(user.id) || {};
      for (const key of ['nip','bidang','jabatan','unitKerja','employeeStatus','workLocation']) if (!(key in user)) { user[key]=source[key] || ''; changed = true; }
    }
    if (changed) store.save(db);
  }
  migratePrototypeData();

  const session = {
    get() {
      try {
        const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        if (!value) return null;
        const user = db.users.find(item => item.id === value.userId);
        const record = db.privilegedSessions.find(item => item.id === value.sessionId && item.userId === value.userId);
        if (!value.expiresAt || Date.now() >= value.expiresAt || !user || user.status !== 'active' || !user.verifiedContact || !ROLE_LABELS[user.role] || !record?.active || record.role !== user.role || !record.expiresAt || record.expiresAt <= Date.now()) {
          this.clear();
          return null;
        }
        return value;
      } catch (_) { return null; }
    },
    set(value) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); },
    clear() { sessionStorage.removeItem(SESSION_KEY); },
    user() {
      const current = this.get();
      return current ? db.users.find(user => user.id === current.userId) || null : null;
    },
    login(user) {
      if (user.status !== 'active' || !user.verifiedContact || !ROLE_LABELS[user.role]) return;
      const issuedAt = Date.now();
      const expiresAt = issuedAt + sessionLifetimeMs();
      const sessionId = `${uid()}-${Math.random().toString(36).slice(2)}`;
      const previous = this.get();
      if (previous) {
        const record = db.privilegedSessions.find(item => item.id === previous.sessionId);
        if (record) record.active = false;
      }
      db.privilegedSessions.unshift({ id: sessionId, userId: user.id, email: user.email, role: user.role, device: 'Peramban • Sesi login', active: true, lastSeen: now(), expiresAt });
      save();
      this.set({ sessionId, userId: user.id, issuedAt, expiresAt });
    }
  };

  function save() { store.save(db); }

  function audit(actor, action, entity, detail = '') {
    db.auditLogs.unshift({ id: uid(), actor, action, entity, timestamp: now(), detail });
    save();
  }

  function toast(message, type = '') {
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    toastRoot.appendChild(element);
    setTimeout(() => element.remove(), 3400);
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || String(status || '—').replaceAll('_', ' ');
  }

  function badge(status) {
    const key = String(status || '').toLowerCase();
    const tone = /verified|published|active|sent|approved|success|enabled/.test(key) ? 'success'
      : /rejected|suspended|failed|danger|revoked/.test(key) ? 'danger'
      : /pending|submitted|in_review|uploaded|scheduled|warning|draft|needs_revision/.test(key) ? 'warning'
      : 'neutral';
    return `<span class="badge badge-${tone}">${esc(statusLabel(key))}</span>`;
  }

  function roleLabel(user) {
    if (!user) return 'Pengguna';
    if (user.role === 'user') return user.educationLevel || 'Pelajar/Mahasiswa';
    return ROLE_LABELS[user.role] || user.role;
  }

  function educationTerms(level) {
    if (level === 'SMA/SMK') return {
      institution: 'Sekolah', program: 'Jurusan/Peminatan', number: 'NISN/Nomor Induk', entry: 'Tahun Masuk', title: 'Pelajar'
    };
    return {
      institution: 'Perguruan Tinggi', program: 'Program Studi', number: 'NIM', entry: 'Tahun Masuk', title: 'Mahasiswa'
    };
  }

  function currentProfile() {
    const user = session.user();
    return db.profiles.find(profile => profile.userId === user?.id) || null;
  }

  function currentDocuments() {
    const user = session.user();
    return db.documents.filter(doc => doc.userId === user?.id);
  }

  function logout(message = '') {
    db = store.load();
    const current = session.get();
    const user = session.user();
    if (user) {
      const record = db.privilegedSessions.find(item => item.id === current.sessionId);
      if (record) { record.active = false; record.lastSeen = now(); save(); }
      audit(user.name, 'KELUAR', `pengguna:${user.id}`, 'Sesi pengguna diakhiri.');
    }
    session.clear();
    closeModal();
    location.hash = '#/masuk';
    if (message) toast(message, 'success');
  }

  function ensureAuthenticated(roles = null) {
    const user = session.user();
    if (!user) return false;
    if (user.status !== 'active') {
      session.clear();
      return false;
    }
    if (roles && !roles.includes(user.role)) return false;
    return true;
  }

  // One policy for navigation, object access, actions, and modal submissions.
  function visibleUsers() {
    const actor = session.user();
    if (!actor) return [];
    if (actor.role === 'superadmin') return db.users;
    if (actor.role === 'user') return db.users.filter(user => user.id === actor.id);
    return db.users.filter(user => user.role === 'user' && (actor.role !== 'operator' || inOperatorScope(user.id)));
  }

  function inOperatorScope(userId) {
    const actor = session.user();
    if (actor?.role === 'superadmin') return true;
    if (actor?.role !== 'operator') return false;
    const hasUserScope = Array.isArray(actor.assignedUserIds) && actor.assignedUserIds.length > 0;
    const hasDistrictScope = Array.isArray(actor.assignedDistricts) && actor.assignedDistricts.length > 0;
    if (!hasUserScope && !hasDistrictScope) return false;
    if (hasUserScope && !actor.assignedUserIds.includes(userId)) return false;
    const profile = db.profiles.find(item => item.userId === userId);
    if (hasDistrictScope && !actor.assignedDistricts.includes(profile?.originDistrict)) return false;
    return db.users.some(user => user.id === userId && user.role === 'user');
  }

  function canReviewStudent(userId) {
    const actor = session.user();
    const target = db.users.find(user => user.id === Number(userId));
    if (!actor || !target || target.role !== 'user') return false;
    if (['admin', 'superadmin'].includes(actor.role)) return true;
    return actor.role === 'operator' && inOperatorScope(target.id);
  }

  function canManageUser(target) {
    const actor = session.user();
    if (!actor || !target || target.id === actor.id) return false;
    return actor.role === 'superadmin' || (actor.role === 'admin' && target.role === 'user');
  }

  function canExport() {
    const actor = session.user();
    return actor?.role === 'superadmin' || (['admin', 'operator'].includes(actor?.role) && db.exportPermissions?.[actor.role] === true);
  }

  function allowedAction(action, id, type) {
    if (['toggle-public-menu', 'close-modal', 'toggle-faq', 'scholarship-detail'].includes(action)) return true;
    const actor = session.user();
    if (!actor) return false;
    if (['open-staff-notification-center'].includes(action)) return actor.role !== 'user';
    if (['master-add','master-edit','master-toggle','inquiry-status','inquiry-note'].includes(action)) return ['admin','superadmin'].includes(actor.role);
    if (['claim-review'].includes(action)) { const queue=db.verificationQueue.find(item=>item.id===Number(id)); return !!queue && canReviewStudent(queue.userId); }
    if (['toggle-sidebar', 'toggle-account-menu', 'toggle-theme', 'toggle-dashboard-notifications', 'mark-dashboard-notifications-read',
      'open-dashboard-notification', 'account-security', 'account-profile-view', 'account-profile-edit',
      'account-photo', 'remove-profile-photo', 'logout', 'reset-student-filters','verify-contact-change','logout-all-sessions'].includes(action)) return true;
    if (['add-scholarship', 'edit-scholarship', 'delete-scholarship', 'export-scholarships-pdf'].includes(action)) return ['admin', 'superadmin'].includes(actor.role);
    if (['generic-add', 'generic-edit', 'generic-delete', 'export-content-pdf', 'toggle-content-publish'].includes(action)) return ['admin', 'superadmin'].includes(actor.role) && ['activities', 'partners', 'faqs'].includes(type);
    if (['add-privileged-user', 'edit-privileged-user', 'delete-privileged-user', 'export-privileged-users-pdf', 'revoke-session', 'save-export-permissions', 'save-system-settings', 'export-audit-pdf', 'export-summary-report-pdf', 'privacy-request-status'].includes(action)) return actor.role === 'superadmin';
    if (action === 'toggle-user-status') return canManageUser(db.users.find(item => item.id === Number(id)));
    if (action === 'view-user') return visibleUsers().some(user => user.id === Number(id));
    if (action === 'inspect-document') { const doc = db.documents.find(item => item.id === Number(id)); return !!doc && canReviewStudent(doc.userId); }
    if (action === 'open-document-file') { const doc = db.documents.find(item => item.id === Number(id)); return !!doc && ((actor.role === 'user' && doc.userId === actor.id) || canReviewStudent(doc.userId)); }
    if (['export-users-pdf', 'export-users-excel', 'export-students-pdf', 'export-students-excel'].includes(action)) return canExport();
    if (['review-user', 'approve-review', 'revision-review'].includes(action)) {
      const queue = db.verificationQueue.find(item => item.id === Number(id));
      if (!queue || !canReviewStudent(queue.userId)) return false;
      if (actor.role === 'operator' && queue.assignedTo && queue.assignedTo !== actor.id) return false;
      return true;
    }
    if (['verify-student-profile', 'request-student-revision'].includes(action)) return canReviewStudent(Number(id));
    if (action === 'set-document-status') {
      const doc = db.documents.find(item => item.id === Number(id));
      return !!doc && canReviewStudent(doc.userId);
    }
    if (actor.role !== 'user') return false;
    if (action === 'cancel-reminder') return db.reminders.some(item => item.id === Number(id) && item.userId === actor.id);
    if (['replace-document','select-replacement','send-replacement','delete-document','confirm-delete-document'].includes(action)) return db.documents.some(item => item.id === Number(id) && item.userId === actor.id);
    if (['delete-notification','open-user-notification'].includes(action)) return db.notifications.some(item => item.id === Number(id) && item.userId === actor.id);
    return ['toggle-bookmark', 'create-reminder', 'save-profile', 'submit-verification', 'add-education', 'upload-document', 'save-resume',
      'toggle-resume-publish', 'print-resume', 'save-privacy', 'mark-all-read', 'download-notifications','edit-education','delete-education','set-primary-education','privacy-request','change-password','logout-all-sessions'].includes(action);
  }

  function authorize(action, id, type) {
    db = store.load();
    if (allowedAction(action, id, type)) return true;
    toast('Anda tidak memiliki kewenangan untuk tindakan ini atau sesi telah berakhir.', 'error');
    if (!session.user()) { closeModal(); location.hash = '#/masuk'; }
    return false;
  }

  function visibleQueue() { return db.verificationQueue.filter(item => canReviewStudent(item.userId)); }

  function activeSessions() {
    return db.privilegedSessions.filter(item => item.active && item.expiresAt > Date.now() && db.users.some(user => user.id === item.userId && user.status === 'active' && user.role === item.role));
  }

  function loginGuard(email) {
    let guard = {};
    try { guard = JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY) || '{}'); } catch (_) {}
    const record = guard[email] || { attempts: 0, blockedUntil: 0 };
    if (record.blockedUntil && Date.now() >= record.blockedUntil) {
      record.attempts = 0;
      record.blockedUntil = 0;
      guard[email] = record;
      localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(guard));
    }
    return { guard, record };
  }

  function recordLoginFailure(email) {
    const { guard, record } = loginGuard(email);
    record.attempts += 1;
    if (record.attempts >= MAX_LOGIN_ATTEMPTS) record.blockedUntil = Date.now() + LOGIN_BLOCK_MS;
    guard[email] = record;
    localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(guard));
    return record;
  }

  function clearLoginGuard(email) {
    const { guard } = loginGuard(email);
    delete guard[email];
    localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(guard));
  }

  const publicNav = [
    { label: 'Beranda', href: '#/' },
    { label: 'Tentang', items: [
      ['#/tentang', 'Tentang Talenta', 'Kenali platform Talenta Nduga', 'info'],
      ['#/mitra', 'Mitra', 'Mitra pendukung pendidikan', 'partner']
    ] },
    { label: 'Informasi', items: [
      ['#/beasiswa', 'Beasiswa', 'Temukan peluang sesuai jenjang', 'scholarship'],
      ['#/kegiatan', 'Kegiatan', 'Agenda dan kegiatan pendidikan', 'calendar']
    ] },
    { label: 'Bantuan', items: [
      ['#/pertanyaan-umum', 'Pertanyaan Umum', 'Jawaban atas pertanyaan Anda', 'help'],
      ['#/kontak', 'Kontak', 'Hubungi tim Talenta Nduga', 'send'],
      ['#/privasi-data', 'Privasi Data', 'Informasi pengelolaan data Anda', 'shield']
    ] }
  ];

  function publicLayout(content) {
    const path = location.hash || '#/';
    return `
      <div class="public-shell">
        <div class="top-strip"><div class="container"><span>Talenta Pendidikan Nduga • Waktu Indonesia Timur</span><span>Privasi • Verifikasi • Aksesibilitas</span></div></div>
        <header class="site-header">
          <div class="container nav-wrap">
            <a class="brand" href="#/"><span class="brand-mark"></span><span>Talenta Nduga<small>Pelajar dan Mahasiswa Nduga</small></span></a>
            <button id="public-menu-toggle" type="button" class="mobile-menu-btn" data-action="toggle-public-menu" aria-label="${mobileNavOpen ? 'Tutup' : 'Buka'} navigasi" aria-expanded="${mobileNavOpen}" aria-controls="public-navigation">${icon('menu')}<span>Menu</span></button>
            <nav id="public-navigation" class="public-nav ${mobileNavOpen ? 'open' : ''}" aria-label="Navigasi utama">
              ${publicNav.map(({ href, label, items }) => href
                ? `<a class="nav-link ${path === href ? 'active' : ''}" href="${href}" ${path === href ? 'aria-current="page"' : ''}><span>${label}</span></a>`
                : `<details class="public-nav-group"><summary class="nav-link public-nav-trigger ${items.some(([url]) => path === url) ? 'active' : ''}"><span>${label}</span>${icon('chevronDown', 'public-nav-chevron')}</summary><div class="public-submenu">${items.map(([url, title, description, symbol]) => `<a class="public-submenu-link ${path === url ? 'active' : ''}" href="${url}" ${path === url ? 'aria-current="page"' : ''}><span class="public-submenu-icon">${icon(symbol)}</span><span class="public-submenu-copy"><strong>${title}</strong><small>${description}</small></span></a>`).join('')}</div></details>`).join('')}
              <div class="public-mobile-actions"><a class="btn btn-secondary btn-sm" href="#/masuk">${icon('login')}<span>Masuk</span></a><a class="btn btn-primary btn-sm" href="#/daftar">${icon('userPlus')}<span>Daftar</span></a></div>
            </nav>
            <div class="nav-actions"><a class="btn btn-secondary btn-sm" href="#/masuk">${icon('login')}<span>Masuk</span></a><a class="btn btn-primary btn-sm" href="#/daftar">${icon('userPlus')}<span>Daftar</span></a></div>
          </div>
        </header>
        <main id="main-content">${content}</main>
        ${footer()}
      </div>`;
  }

  function footer() {
    return `
      <footer class="footer"><div class="container"><div class="footer-grid">
        <div><a class="brand" href="#/"><span class="brand-mark"></span><span>Talenta Nduga<small>Talenta Pendidikan Nduga</small></span></a><p class="mt-2">Platform pendataan pelajar dan mahasiswa, informasi beasiswa, dokumen privat, pengingat, serta riwayat hidup digital.</p></div>
        <div><h4>Informasi</h4><div class="footer-links"><a href="#/tentang">Tentang</a><a href="#/beasiswa">Beasiswa</a><a href="#/kegiatan">Kegiatan</a><a href="#/mitra">Mitra</a></div></div>
        <div><h4>Bantuan</h4><div class="footer-links"><a href="#/pertanyaan-umum">Pertanyaan Umum</a><a href="#/kontak">Kontak</a><a href="#/masuk">Masuk</a><a href="#/daftar">Daftar Akun</a></div></div>
        <div><h4>Akun</h4><div class="footer-links"><a href="#/masuk">Masuk ke Sistem</a><a href="#/daftar">Buat Akun</a><a href="#/privasi-data">Privasi Data</a></div></div>
      </div><div class="footer-bottom">© 2026 Talenta Nduga. Seluruh akses data mengikuti peran dan kewenangan pengguna.</div></div></footer>`;
  }

  function pageHero(title, text) {
    return `<section class="page-hero"><div class="container"><span class="eyebrow">Talenta Nduga</span><h1>${title}</h1><p>${text}</p></div></section>`;
  }

  function homePage() {
    const published = db.scholarships.filter(item => item.status === 'published').slice(0, 3);
    const userCount = db.users.filter(user => user.role === 'user').length;
    return publicLayout(`
      <section class="hero"><div class="container hero-grid">
        <div><span class="eyebrow">Talenta Pendidikan Nduga</span><h1>Satu profil untuk perjalanan pendidikan yang lebih terarah.</h1>
          <p>Kelola profil pendidikan, simpan dokumen secara privat, temukan beasiswa, atur pengingat, dan susun riwayat hidup digital dalam satu sistem yang terstruktur.</p>
          <div class="hero-actions"><a class="btn btn-primary" href="#/daftar">Buat akun</a><a class="btn btn-secondary" href="#/beasiswa">Jelajahi beasiswa</a></div>
          <div class="hero-proof"><div class="mini-proof"><strong>Privasi terjaga</strong><span>Dokumen tidak ditampilkan untuk umum</span></div><div class="mini-proof"><strong>Status jelas</strong><span>Proses verifikasi dapat dipantau</span></div><div class="mini-proof"><strong>Responsif</strong><span>Nyaman digunakan di berbagai perangkat</span></div></div>
        </div>
        <aside class="trust-panel"><span class="eyebrow">Sistem Terpadu</span><h3>Untuk pelajar SMA/SMK hingga mahasiswa S3</h3><p>Setiap pengguna mendapatkan alur dan formulir yang menyesuaikan jenjang pendidikan yang dipilih.</p><div class="trust-list">
          ${['SMA/SMK dengan data sekolah dan NISN','S1 dengan data perguruan tinggi dan NIM','S2 dengan dukungan beasiswa pascasarjana','S3 dengan pengelolaan profil akademik lanjutan'].map(item => `<div class="trust-item"><span class="trust-dot">${icon('check')}</span><div><strong>${item}</strong></div></div>`).join('')}
        </div></aside>
      </div></section>
      <section class="stat-band"><div class="container"><div class="stat"><strong>${userCount}</strong><span>Pelajar dan mahasiswa terdaftar</span></div><div class="stat"><strong>4</strong><span>Jenjang pendidikan</span></div><div class="stat"><strong>${db.scholarships.filter(item => item.status === 'published').length}</strong><span>Beasiswa aktif</span></div><div class="stat"><strong>${db.activities.filter(item => item.status === 'published').length}</strong><span>Kegiatan tersedia</span></div></div></section>
      <section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">Layanan Utama</span><h2 class="section-title">Semua kebutuhan pendidikan dalam satu alur</h2><p class="section-subtitle">Menu dan informasi dirancang konsisten untuk pelajar, mahasiswa, operator, administrator, dan administrator utama.</p></div></div>
        <div class="grid grid-4">${[
          ['01', 'Profil Pendidikan', 'Kelola biodata, asal wilayah, sekolah atau perguruan tinggi, dan status verifikasi.'],
          ['02', 'Informasi Beasiswa', 'Cari berdasarkan jenjang, kategori, penyelenggara, dan batas waktu.'],
          ['03', 'Dokumen Privat', 'Kelola dokumen pendidikan dengan status peninjauan yang jelas.'],
          ['04', 'Riwayat Hidup Digital', 'Susun, pratinjau, terbitkan, atau cabut publikasi riwayat hidup.']
        ].map(([index, title, text]) => `<article class="feature-card"><div class="feature-icon">${index}</div><h3>${title}</h3><p>${text}</p></article>`).join('')}</div>
      </div></section>
      ${educationDataOverview()}
      <section class="section section-soft"><div class="container"><div class="section-head"><div><span class="eyebrow">Beasiswa</span><h2 class="section-title">Peluang pendidikan terbaru</h2><p class="section-subtitle">Gunakan filter jenjang agar peluang yang ditampilkan sesuai kebutuhan pendidikan Anda.</p></div><a class="btn btn-secondary" href="#/beasiswa">Lihat semua beasiswa</a></div>
        <div class="grid grid-3">${published.map(item => scholarshipCard(item, false)).join('')}</div>
      </div></section>`);
  }

  function aboutPage() {
    return publicLayout(`${pageHero('Tentang Talenta Nduga', 'Platform talenta pendidikan berbasis wilayah untuk pendataan, penguatan profil, informasi beasiswa, dokumen privat, pengingat, dan riwayat hidup digital.')}
      <section class="section"><div class="container"><div class="grid grid-2"><article class="content-card"><h3>Tujuan</h3><p>Menyediakan satu profil pendidikan yang dapat diperbarui, diverifikasi, digunakan untuk menemukan peluang, serta membantu pengelola melihat data agregat secara terstruktur.</p></article><article class="content-card"><h3>Batas Layanan</h3><p>Talenta Nduga membantu pengelolaan informasi dan profil pendidikan. Keputusan penerimaan beasiswa tetap berada pada penyelenggara masing-masing.</p></article></div>
      <div class="section-head mt-3"><div><h2 class="section-title">Prinsip Pengelolaan</h2></div></div><div class="grid grid-4">${[['Privasi', 'Dokumen privat dan publikasi riwayat hidup memerlukan persetujuan.'], ['Kewenangan', 'Akses mengikuti peran dan ruang lingkup tugas.'], ['Verifikasi', 'Status peninjauan dan alasan perubahan ditampilkan jelas.'], ['Aksesibilitas', 'Antarmuka responsif, konsisten, dan mudah digunakan.']].map(([title, text], index) => `<div class="feature-card"><div class="feature-icon">${index + 1}</div><h3>${title}</h3><p>${text}</p></div>`).join('')}</div></div></section>`);
  }

  function scholarshipCard(item, interactive = true) {
    const user = session.user();
    const saved = user?.role === 'user' && db.bookmarks.some(bookmark => bookmark.userId === user.id && bookmark.scholarshipId === item.id);
    const remaining = daysUntil(item.deadline);
    return `<article class="scholarship-card content-card-with-media">
      ${contentImageBlock(item, item.title, 'scholarship')}
      <div class="flex justify-between gap-2"><div>${badge(item.status)}</div><span class="small ${remaining <= 7 ? 'text-warning' : 'muted'}">${remaining >= 0 ? `${remaining} hari lagi` : 'Batas waktu lewat'}</span></div>
      <div><h3>${esc(item.title)}</h3><div class="meta-row"><span>${esc(item.provider)}</span><span>•</span><span>${esc(item.levels.join(', '))}</span><span>•</span><span>${esc(item.category)}</span></div></div>
      <p>${esc(item.eligibility)}</p><div class="small muted">Batas waktu: ${fmtDate(item.deadline, true)} WIT • Diperiksa: ${fmtDate(item.lastVerifiedAt)}</div>
      <div class="scholarship-actions"><button class="btn btn-secondary btn-sm" data-action="scholarship-detail" data-id="${item.id}">${icon('eye')}<span>Lihat rincian</span></button>${interactive && user?.role === 'user' ? `<button class="btn ${saved ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="toggle-bookmark" data-id="${item.id}">${icon('bookmark')}<span>${saved ? 'Tersimpan' : 'Simpan'}</span></button><button class="btn btn-secondary btn-sm" data-action="create-reminder" data-id="${item.id}">${icon('bell')}<span>Buat pengingat</span></button>` : ''}</div>
    </article>`;
  }

  function scholarshipsPage() {
    const published = db.scholarships.filter(item => item.status === 'published');
    return publicLayout(`${pageHero('Daftar Beasiswa', 'Cari peluang berdasarkan jenjang pendidikan, kategori, dan penyelenggara.')}
      <section class="section"><div class="container"><div class="filters"><input id="scholarship-search" class="input" style="max-width:360px" placeholder="Cari judul atau penyelenggara"><select id="scholarship-level" class="select" style="max-width:220px"><option value="">Semua jenjang</option>${LEVELS.map(level => `<option>${level}</option>`).join('')}</select><select id="scholarship-category" class="select" style="max-width:220px"><option value="">Semua kategori</option>${[...new Set(published.map(item => item.category))].map(category => `<option>${esc(category)}</option>`).join('')}</select></div><div id="scholarship-grid" class="grid grid-3 mt-3">${published.map(item => scholarshipCard(item, true)).join('')}</div></div></section>`);
  }

  function activitiesPage() {
    return publicLayout(`${pageHero('Kegiatan', 'Informasi kegiatan pendidikan dan pengembangan kapasitas yang tersedia.')}
      <section class="section"><div class="container"><div class="grid grid-3">${db.activities.filter(item => item.status === 'published').map(item => `<article class="activity-card content-card-with-media">${contentImageBlock(item,item.title,'calendar')}<div class="flex justify-between">${badge(item.status)}<span class="small muted">${fmtDate(item.date)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="meta-row"><span>${icon('map')} Lokasi: ${esc(item.location)}</span></div></article>`).join('')}</div></div></section>`);
  }

  function partnersPage() {
    return publicLayout(`${pageHero('Mitra', 'Kolaborasi yang mendukung penguatan talenta pendidikan Nduga.')}
      <section class="section"><div class="container"><div class="grid grid-3">${db.partners.filter(item => item.approved).map(item => `<article class="partner-card content-card-with-media">${contentImageBlock(item,item.name,'partner')}<h3>${esc(item.name)}</h3><p>${esc(item.summary)}</p><div class="meta-row"><span>${icon('building')} ${esc(item.type)}</span></div></article>`).join('')}</div></div></section>`);
  }

  function faqPage() {
    return publicLayout(`${pageHero('Pertanyaan Umum', 'Jawaban ringkas mengenai akun, dokumen, beasiswa, dan riwayat hidup digital.')}
      <section class="section"><div class="container"><div class="faq-list">${db.faqs.map(item => `<article class="faq-item"><button class="faq-q" data-action="toggle-faq">${esc(item.question)}<span>${icon('plus')}</span></button><div class="faq-a"><strong class="small text-info">${esc(item.category)}</strong><p>${esc(item.answer)}</p></div></article>`).join('')}</div></div></section>`);
  }

  function contactPage() {
    return publicLayout(`${pageHero('Kontak', 'Kirim pertanyaan atau kebutuhan informasi kepada pengelola Talenta Nduga.')}
      <section class="section"><div class="container"><div class="grid grid-2"><div><h2 class="section-title">Hubungi Pengelola</h2><p class="section-subtitle">Gunakan formulir ini untuk pertanyaan mengenai akun, profil pendidikan, dokumen, beasiswa, atau layanan sistem.</p><div class="content-card mt-3"><h3>Waktu Layanan</h3><p>Senin–Jumat • mengikuti Waktu Indonesia Timur</p></div></div><form id="contact-form" class="content-card stack"><div class="field"><label>Nama</label><input class="input" name="name" required></div><div class="field"><label>Email</label><input class="input" type="email" name="email" required></div><div class="field"><label>Subjek</label><input class="input" name="subject" required></div><div class="field"><label>Pesan</label><textarea class="textarea" name="message" required></textarea></div><button class="btn btn-primary" type="submit">Kirim pesan</button></form></div></div></section>`);
  }

  function authLayout(title, subtitle, form, asideTitle = 'Masuk ke ruang pendidikan Talenta Nduga') {
    return `<main class="auth-shell" id="main-content"><section class="auth-brand"><a class="brand brand-light" href="#/"><span class="brand-mark"></span><span>Talenta Nduga<small>Pelajar dan Mahasiswa Nduga</small></span></a><h1>${asideTitle}</h1><p>Akses profil, dokumen, beasiswa, pengingat, riwayat hidup digital, dan layanan sesuai kewenangan akun Anda.</p><div class="auth-levels"><span>SMA/SMK</span><span>S1</span><span>S2</span><span>S3</span></div></section><section class="auth-card-wrap"><div class="auth-card"><a class="back-link" href="#/">${icon('arrowLeft')}<span>Kembali ke beranda</span></a><h2>${title}</h2><p>${subtitle}</p>${form}</div></section></main>`;
  }

  function loginPage() {
    return authLayout('Masuk ke Talenta Nduga', 'Gunakan email dan kata sandi akun Anda.', `<form id="login-form" class="auth-form"><div class="field"><label>Email</label><input class="input" type="email" name="login" autocomplete="username" required></div><div class="field"><label>Kata sandi</label><input class="input" type="password" name="password" autocomplete="current-password" required></div><div class="flex justify-between wrap gap-2"><a class="small text-info" href="#/lupa-kata-sandi">Lupa kata sandi?</a><a class="small text-info" href="#/daftar">Belum punya akun?</a></div><button class="btn btn-primary btn-block" type="submit">Masuk</button></form>`);
  }

  function registerPage() {
    return authLayout('Daftar Akun Pendidikan', 'Pilih jenjang yang sesuai agar formulir dan menu menyesuaikan kebutuhan Anda.', `<form id="register-form" class="auth-form"><div class="field"><label>Nama lengkap</label><input class="input" name="name" required></div><div class="field"><label>Jenjang pendidikan</label><select class="select" name="educationLevel" required><option value="">Pilih jenjang</option>${LEVELS.map(level => `<option>${level}</option>`).join('')}</select></div><div class="field"><label>Email</label><input class="input" type="email" name="email" autocomplete="email" required></div><div class="field"><label>Nomor HP</label><input class="input" name="phone" inputmode="tel" required></div><div class="field"><label>Kata sandi</label><input class="input" type="password" name="password" minlength="8" autocomplete="new-password" required><span class="field-help">Minimal 8 karakter, mengandung huruf dan angka.</span></div><div class="field"><label>Ulangi kata sandi</label><input class="input" type="password" name="passwordConfirm" minlength="8" autocomplete="new-password" required></div><label class="consent-line"><input type="checkbox" name="consent" required><span>Saya menyetujui penggunaan data sesuai tujuan layanan dan pengaturan privasi Talenta Nduga.</span></label><button class="btn btn-primary" type="submit">Buat akun</button><a class="btn btn-secondary" href="#/masuk">Sudah punya akun</a></form>`, 'Bangun profil pendidikan dari SMA/SMK hingga S3');
  }

  function verifyPage() {
    const pending = sessionStorage.getItem('talenta_nduga_pending_verification');
    if (!pending) return authLayout('Verifikasi Kontak', 'Tidak ada pendaftaran yang menunggu verifikasi.', `<a class="btn btn-primary btn-block" href="#/daftar">Kembali ke pendaftaran</a>`);
    return authLayout('Verifikasi Kontak', 'Masukkan kode enam digit untuk mengaktifkan akun.', `<form id="verify-form" class="auth-form"><div class="field"><label>Kode verifikasi</label><input class="input code-input" name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></div><button class="btn btn-primary" type="submit">Verifikasi akun</button></form>`, 'Satu langkah lagi untuk mengaktifkan akun');
  }

  function forgotPage() {
    return authLayout('Lupa Kata Sandi', 'Masukkan email akun. Permintaan pemulihan akan dicatat dan dapat dilanjutkan sesuai alur pengelolaan akun.', `<form id="forgot-form" class="auth-form"><div class="field"><label>Email</label><input class="input" type="email" name="email" required></div><button class="btn btn-primary" type="submit">Kirim permintaan pemulihan</button><a class="btn btn-secondary" href="#/masuk">Kembali ke masuk</a></form>`, 'Pemulihan akun yang aman dan terkontrol');
  }

  function mfaPage() {
    const pendingId = Number(sessionStorage.getItem('talenta_nduga_pending_mfa') || 0);
    const pending = db.users.find(user => user.id === pendingId);
    if (!pending) return loginPage();
    return authLayout('Verifikasi Dua Langkah', `Konfirmasi identitas untuk melanjutkan sebagai ${esc(roleLabel(pending))}.`, `<form id="mfa-form" class="auth-form"><div class="field"><label>Kode verifikasi</label><input class="input code-input" name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></div><div class="info-callout">Verifikasi dua langkah wajib untuk akun dengan kewenangan khusus.</div><button class="btn btn-primary" type="submit">Verifikasi dan lanjutkan</button></form>`, 'Perlindungan tambahan untuk akun berkewenangan khusus');
  }

  const menuGroups = {
    user: [
      { label:'Utama', icon:'dashboard', items:[['dashboard','Dasbor','dashboard']] },
      { label:'Data Pendidikan', icon:'graduation', items:[['profile','Profil','user'],['education','Pendidikan','education'],['documents','Dokumen','document']] },
      { label:'Peluang & Portofolio', icon:'scholarship', items:[['saved','Beasiswa Tersimpan','bookmark'],['reminders','Pengingat','calendar'],['resume','Riwayat Hidup','resume']] },
      { label:'Akun & Privasi', icon:'shield', items:[['notifications','Notifikasi','bell'],['privacy','Privasi','shield']] }
    ],
    operator: [
      { label:'Pemantauan', icon:'chart', items:[['dashboard','Dasbor','dashboard'],['traffic','Trafik','traffic']] },
      { label:'Verifikasi Pendidikan', icon:'verify', items:[['students','Pelajar & Mahasiswa','graduation'],['verification','Antrean Verifikasi','verify']] },
      { label:'Operasional', icon:'activity', items:[['activity','Aktivitas','activity']] }
    ],
    admin: [
      { label:'Pemantauan', icon:'chart', items:[['dashboard','Dasbor','dashboard'],['traffic','Trafik','traffic'],['reports','Laporan','report']] },
      { label:'Data Pendidikan', icon:'graduation', items:[['students','Pelajar & Mahasiswa','graduation'],['verification','Antrean Verifikasi','verify'],['all-users','Akun Pengguna','users']] },
      { label:'Konten Publik', icon:'image', items:[['scholarships','Beasiswa','scholarship'],['activities','Kegiatan','calendar'],['partners','Mitra','partner'],['faqs','Pertanyaan Umum','help'],['inbox','Pesan Masuk','bell']] },
      { label:'Referensi', icon:'database', items:[['masters','Data Referensi','database']] }
    ],
    superadmin: [
      { label:'Pemantauan', icon:'chart', items:[['dashboard','Dashboard','dashboard'],['traffic','Trafik','traffic'],['reports','Laporan','report']] },
      { label:'Data Pendidikan', icon:'graduation', items:[['students','Pelajar & Mahasiswa','graduation'],['verification','Antrean Verifikasi','verify'],['all-users','Kontrol Akun','users']] },
      { label:'Pegawai & Hak Akses', icon:'roles', items:[['roles','Peran & Izin','roles'],['privileged-users','Administrator & Operator','idBadge']] },
      { label:'Konten Publik', icon:'image', items:[['scholarships','Beasiswa','scholarship'],['activities','Kegiatan','calendar'],['partners','Mitra','partner'],['faqs','Pertanyaan Umum','help'],['inbox','Pesan Masuk','bell']] },
      { label:'Tata Kelola Sistem', icon:'settings', items:[['masters','Data Referensi','database'],['settings','Pengaturan','settings'],['audit','Log Aktivitas','audit'],['security','Keamanan','security']] }
    ]
  };

  const menus = Object.fromEntries(Object.entries(menuGroups).map(([role, groups]) => [role, groups.flatMap(group => group.items)]));

  function availableMenus(user) { return menus[user.role] || []; }
  function availableMenuGroups(user) { return menuGroups[user.role] || []; }

  function metric(label, value, sub = '') {
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;
  }


  function dashboardBarChart(title, subtitle, rows) {
    const max = Math.max(1, ...rows.map(row => Number(row.value || 0)));
    return `<section class="dashboard-chart-card"><div class="dashboard-chart-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${icon('chart')}</div><div class="dashboard-hbar-list">${rows.map(row => `<div class="dashboard-hbar-row"><div class="dashboard-hbar-label"><span>${esc(row.label)}</span><strong>${Number(row.value || 0)}</strong></div><div class="dashboard-hbar-track"><span style="width:${Math.max(3, Math.round((Number(row.value || 0) / max) * 100))}%"></span></div></div>`).join('')}</div></section>`;
  }

  function dashboardDonutChart(title, subtitle, rows) {
    const colors = ['#2e7d5b','#1f5e9c','#e6a23c','#c94b4b','#667085'];
    const total = Math.max(1, rows.reduce((sum,row)=>sum+Number(row.value||0),0));
    let cursor=0; const stops=[];
    rows.forEach((row,index)=>{ const next=cursor+(Number(row.value||0)/total)*100; stops.push(`${colors[index%colors.length]} ${cursor}% ${next}%`); cursor=next; });
    if(cursor<100) stops.push(`#e4e9f0 ${cursor}% 100%`);
    return `<section class="dashboard-chart-card"><div class="dashboard-chart-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${icon('chart')}</div><div class="dashboard-donut-wrap"><div class="dashboard-donut" style="background:conic-gradient(${stops.join(',')})"><div><strong>${rows.reduce((sum,row)=>sum+Number(row.value||0),0)}</strong><span>Total</span></div></div><div class="dashboard-donut-legend">${rows.map((row,index)=>`<div><span class="legend-dot" style="background:${colors[index%colors.length]}"></span><span>${esc(row.label)}</span><strong>${Number(row.value||0)}</strong></div>`).join('')}</div></div></section>`;
  }

  function dashboardTrendChart(title, subtitle, rows) {
    const clean = (rows || []).slice(-7);
    const max = Math.max(1, ...clean.map(row=>Number(row.visitors||row.value||0)));
    return `<section class="dashboard-chart-card dashboard-trend-card"><div class="dashboard-chart-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${icon('traffic')}</div><div class="dashboard-trend-bars">${clean.map(row=>{const value=Number(row.visitors||row.value||0);return `<div class="dashboard-trend-item" title="${esc(row.label)}: ${value}"><strong>${value}</strong><span class="dashboard-trend-bar" style="height:${Math.max(8,Math.round((value/max)*150))}px"></span><small>${esc(row.label)}</small></div>`}).join('')}</div></section>`;
  }

  function fieldHTML(label, name, value, type = 'text', help = '') {
    return `<div class="field"><label>${label}</label><input class="input" name="${name}" type="${type}" value="${esc(value ?? '')}">${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
  }

  function optionLabel(option) { return STATUS_LABELS[option] || ROLE_LABELS[option] || option; }

  function selectHTML(label, name, options, value) {
    return `<div class="field"><label>${label}</label><select class="select" name="${name}">${options.map(option => `<option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(optionLabel(option))}</option>`).join('')}</select></div>`;
  }

  
  // userDashboard: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  
  // profilePage: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  function educationPageLegacy() {
    const user = session.user();
    const rows = db.educations.filter(item => item.userId === user.id);
    return appLayout(`<div class="dashboard-head"><div><h2>Riwayat Pendidikan</h2><p>Tambahkan riwayat pendidikan dan tandai satu data sebagai pendidikan utama.</p></div><button class="btn btn-primary" data-action="add-education">Tambah pendidikan</button></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Institusi</th><th>Program/Jurusan</th><th>Jenjang</th><th>Tahun Masuk</th><th>Status</th><th>Utama</th></tr></thead><tbody>${rows.map(item => `<tr><td><strong>${esc(item.institution)}</strong></td><td>${esc(item.program)}</td><td>${esc(item.level)}</td><td>${esc(item.entryYear)}</td><td>${badge(item.status.toLowerCase())}</td><td>${item.isPrimary ? '<span class="badge badge-success">Ya</span>' : '—'}</td></tr>`).join('')}</tbody></table></div>`, 'education');
  }

  
  // documentsPage: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  function savedPage() {
    const user = session.user();
    const ids = db.bookmarks.filter(item => item.userId === user.id).map(item => item.scholarshipId);
    const list = db.scholarships.filter(item => ids.includes(item.id));
    return appLayout(`<div class="dashboard-head"><div><h2>Beasiswa Tersimpan</h2><p>Pantau peluang yang Anda simpan dan buat pengingat sebelum batas waktu.</p></div><a class="btn btn-secondary" href="#/beasiswa">Cari beasiswa</a></div><div class="grid grid-3">${list.length ? list.map(item => scholarshipCard(item, true)).join('') : '<div class="empty">Belum ada beasiswa tersimpan.</div>'}</div>`, 'saved');
  }

  function remindersPageLegacy() {
    const rows = db.reminders.filter(item => item.userId === session.user().id);
    return appLayout(`<div class="dashboard-head"><div><h2>Pengingat</h2><p>Kelola jadwal pengingat untuk batas waktu beasiswa.</p></div></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Beasiswa</th><th>Jadwal</th><th>Saluran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(item => { const scholarship = db.scholarships.find(row => row.id === item.scholarshipId); return `<tr><td>${esc(scholarship?.title || '—')}</td><td>${fmtDate(item.runAt, true)} WIT</td><td>${esc(item.channel)}</td><td>${badge(item.status)}</td><td><button class="btn btn-secondary btn-sm" data-action="cancel-reminder" data-id="${item.id}" ${item.status !== 'scheduled' ? 'disabled' : ''}>Batalkan</button></td></tr>`; }).join('')}</tbody></table></div>`, 'reminders');
  }

  function resumePageLegacy() {
    const profile = currentProfile();
    const resume = profile.resume;
    return appLayout(`<div class="dashboard-head"><div><h2>Riwayat Hidup Digital</h2><p>Susun informasi yang ingin ditampilkan, pratinjau, lalu terbitkan dengan persetujuan eksplisit.</p></div>${badge(resume.published ? 'published' : 'private')}</div><div class="app-grid"><form id="resume-form" class="panel stack"><div class="panel-title">Konten Riwayat Hidup</div><div class="field"><label>Ringkasan</label><textarea class="textarea" name="summary">${esc(resume.summary)}</textarea></div><div class="field"><label>Keterampilan (pisahkan dengan koma)</label><input class="input" name="skills" value="${esc(resume.skills.join(', '))}"></div><label class="consent-line"><input type="checkbox" name="showOrigin" ${profile.privacy.showOriginDistrict ? 'checked' : ''}><span>Tampilkan distrik asal</span></label><label class="consent-line"><input type="checkbox" name="showInstitution" ${profile.privacy.showInstitution ? 'checked' : ''}><span>Tampilkan institusi pendidikan</span></label><div class="info-callout danger-callout">Dokumen verifikasi, nomor identitas, data sensitif, dan catatan operator tidak masuk ke profil publik.</div><button class="btn btn-secondary" type="button" data-action="save-resume">Simpan draf</button>${resume.published ? `<button class="btn btn-danger" type="button" data-action="toggle-resume-publish">Cabut publikasi</button>` : `<label class="consent-line"><input id="resume-consent" type="checkbox"><span>Saya menyetujui publikasi data yang dipilih pada riwayat hidup ini.</span></label><button class="btn btn-primary" type="button" data-action="toggle-resume-publish">Terbitkan riwayat hidup</button>`}<button class="btn btn-secondary" type="button" data-action="print-resume">Cetak / Simpan PDF</button></form><article class="cv-preview" id="resume-preview"><h2>${esc(profile.fullName)}</h2><p>${esc(profile.program)}${profile.privacy.showOriginDistrict ? ` • ${esc(profile.originDistrict)}, Papua` : ''}</p><h3>Ringkasan</h3><p>${esc(resume.summary)}</p>${profile.privacy.showInstitution ? `<h3>Pendidikan</h3><p>${esc(profile.level)} ${esc(profile.program)} • ${esc(profile.currentInstitution)} • ${esc(profile.studyStatus)}</p>` : ''}<h3>Keterampilan</h3><p>${resume.skills.map(esc).join(' • ')}</p><h3>Proyek</h3><ul>${resume.projects.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p class="small muted">Diperbarui: ${fmtDate(new Date())}</p></article></div>`, 'resume');
  }
function notificationsPage() {
    const user = session.user();
    const rows = db.notifications.filter(item => item.userId === user.id).slice().sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return appLayout(`<div class="dashboard-head student-premium-head"><div><span class="eyebrow">${icon('bell')} Pusat Pemberitahuan</span><h2>Notifikasi</h2><p>Riwayat pemberitahuan profil, dokumen, verifikasi, beasiswa, dan pengingat.</p></div><div class="notification-page-actions"><button class="btn btn-secondary" data-action="download-notifications">${icon('download')}<span>Unduh tabel</span></button><button class="btn btn-ghost" data-action="mark-all-read">${icon('check')}<span>Tandai semua dibaca</span></button></div></div>
      <div class="panel notification-history-panel"><div class="notification-table-wrap"><table class="table notification-table"><thead><tr><th>Pemberitahuan</th><th>Pesan</th><th>Waktu</th><th>Status</th><th class="table-action-col">Aksi</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr class="${item.read ? '' : 'notification-unread-row'}"><td><strong>${esc(item.title)}</strong></td><td>${esc(item.message)}</td><td>${fmtDate(item.createdAt,true)}</td><td>${item.read ? '<span class="badge badge-success">Dibaca</span>' : '<span class="badge badge-info">Baru</span>'}</td><td class="notification-row-actions">${item.targetSection || item.targetHref ? `<button class="icon-action-btn" data-action="open-user-notification" data-id="${item.id}" title="Buka pemberitahuan">${icon('eye')}</button>` : ''}<button class="icon-action-btn danger" data-action="delete-notification" data-id="${item.id}" title="Hapus pemberitahuan">${icon('trash')}</button></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty">Belum ada notifikasi.</div></td></tr>'}</tbody></table></div></div>`, 'notifications');
  }


  function privacyPageLegacy() {
    const profile = currentProfile();
    return appLayout(`<div class="dashboard-head"><div><h2>Privasi</h2><p>Atur informasi yang boleh digunakan pada riwayat hidup publik.</p></div></div><div class="grid grid-2"><div class="panel stack"><div class="panel-title">Preferensi Publikasi</div><label class="consent-line"><input type="checkbox" data-privacy="showOriginDistrict" ${profile.privacy.showOriginDistrict ? 'checked' : ''}><span>Tampilkan distrik asal pada riwayat hidup</span></label><label class="consent-line"><input type="checkbox" data-privacy="showInstitution" ${profile.privacy.showInstitution ? 'checked' : ''}><span>Tampilkan institusi pendidikan</span></label><label class="consent-line"><input type="checkbox" data-privacy="showProgram" ${profile.privacy.showProgram ? 'checked' : ''}><span>Tampilkan program/jurusan</span></label><button class="btn btn-primary" data-action="save-privacy">Simpan pengaturan</button></div><div class="panel"><div class="panel-title">Prinsip Privasi</div><div class="list mt-2"><div class="list-row"><div class="list-row-main"><strong>Dokumen tetap privat</strong><span>Dokumen pendidikan dan identitas tidak ditampilkan untuk umum.</span></div></div><div class="list-row"><div class="list-row-main"><strong>Publikasi dapat dicabut</strong><span>Riwayat hidup dapat dibuat privat kembali kapan saja.</span></div></div><div class="list-row"><div class="list-row-main"><strong>Hak koreksi</strong><span>Pengguna dapat memperbarui data dan mengajukan verifikasi ulang.</span></div></div></div></div></div>`, 'privacy');
  }

  function operatorDashboardLegacy() {
    const queue = visibleQueue();
    const scopedProfiles = db.profiles.filter(item => inOperatorScope(item.userId));
    const statusRows = [
      {label:'Diajukan',value:queue.filter(item=>item.status==='submitted').length},
      {label:'Dalam Peninjauan',value:queue.filter(item=>item.status==='in_review').length},
      {label:'Perlu Perbaikan',value:queue.filter(item=>item.status==='needs_revision').length},
      {label:'Terverifikasi',value:scopedProfiles.filter(item=>item.profileStatus==='verified').length}
    ];
    const levelRows = LEVELS.map(level=>({label:level,value:visibleUsers().filter(user=>user.role==='user'&&user.educationLevel===level).length}));
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('dashboard')} Pemantauan Verifikasi</span><h2>Dasbor Operator</h2><p>Ringkasan berbasis data cakupan penugasan: antrean, status verifikasi, jenjang pendidikan, dan pekerjaan terbaru.</p></div></div>
      <div class="metrics">${metric('Menunggu Peninjauan', statusRows[0].value, 'Perlu ditangani')}${metric('Dalam Peninjauan', statusRows[1].value, 'Sedang diproses')}${metric('Perlu Perbaikan', statusRows[2].value, 'Menunggu pengguna')}${metric('Terverifikasi', statusRows[3].value, 'Dalam cakupan operator')}</div>
      <div class="dashboard-chart-grid mt-3">${dashboardDonutChart('Status Verifikasi','Komposisi pekerjaan verifikasi sesuai cakupan operator.',statusRows)}${dashboardBarChart('Distribusi Jenjang','Pelajar dan mahasiswa yang masuk cakupan penugasan.',levelRows)}</div>
      <div class="panel mt-3"><div class="panel-head"><div class="panel-title">Antrean Terbaru</div><a class="btn btn-secondary btn-sm" href="#/operator/verification">${icon('verify')}<span>Buka semua</span></a></div>${queueTable(queue.slice(0, 6))}</div>`, 'dashboard');
  }

  function queueTableLegacy(rows) {
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Nama</th><th>Jenjang</th><th>Distrik</th><th>Institusi</th><th>Status</th><th>Waktu Penanganan</th><th>Aksi</th></tr></thead><tbody>${rows.map(item => `<tr><td><strong>${esc(item.userName)}</strong></td><td>${esc(item.educationLevel)}</td><td>${esc(item.district)}</td><td>${esc(item.institution)}</td><td>${badge(item.status)}</td><td>${item.slaHours == null ? '—' : `${item.slaHours} jam`}</td><td><button class="btn btn-secondary btn-sm" data-action="review-user" data-id="${item.id}">Tinjau</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function verificationPage() {
    return appLayout(`<div class="dashboard-head"><div><h2>Antrean Verifikasi</h2><p>Saring berdasarkan nama, jenjang, atau status peninjauan.</p></div></div><div class="filters"><input id="queue-search" class="input" style="max-width:320px" placeholder="Cari nama, distrik, atau institusi"><select id="queue-level" class="select" style="max-width:180px"><option value="">Semua jenjang</option>${LEVELS.map(level => `<option>${level}</option>`).join('')}</select><select id="queue-status" class="select" style="max-width:210px"><option value="">Semua status</option><option value="submitted">Diajukan</option><option value="in_review">Dalam Peninjauan</option><option value="needs_revision">Perlu Perbaikan</option><option value="verified">Terverifikasi</option></select></div><div class="panel" id="queue-table">${queueTable(visibleQueue())}</div>`, 'verification');
  }

  
  // operatorUsersPage dihapus pada audit v5 karena fungsinya sudah terpusat pada Pelajar & Mahasiswa/Akun Pengguna.


  
  // operatorExportsPage dihapus pada audit v5 karena fungsinya sudah terpusat pada Pelajar & Mahasiswa/Akun Pengguna.


  function activityPage() {
    return appLayout(`<div class="dashboard-head"><div><h2>Aktivitas Operator</h2><p>Riwayat tindakan yang dilakukan operator saat menangani data.</p></div></div>${auditTable(db.auditLogs.filter(item => session.user().role === 'superadmin' ? /Operator|VERIFIKASI|TINJAU|DOKUMEN/i.test(item.actor + item.action) : item.actor === session.user().name).slice(0, 30))}`, 'activity');
  }

  function adminDashboardLegacy() {
    const users = db.users.filter(user => user.role === 'user');
    const levelRows = LEVELS.map(level=>({label:level,value:users.filter(user=>user.educationLevel===level).length}));
    const verificationRows = [
      {label:'Terverifikasi',value:db.profiles.filter(p=>p.profileStatus==='verified').length},
      {label:'Diajukan / Ditinjau',value:db.profiles.filter(p=>['submitted','in_review'].includes(p.profileStatus)).length},
      {label:'Perlu Perbaikan',value:db.profiles.filter(p=>p.profileStatus==='needs_revision').length},
      {label:'Draf',value:db.profiles.filter(p=>!p.profileStatus||p.profileStatus==='draft').length}
    ];
    const contentRows=[
      {label:'Beasiswa Terbit',value:db.scholarships.filter(item=>item.status==='published').length},
      {label:'Kegiatan Terbit',value:db.activities.filter(item=>item.status==='published').length},
      {label:'Mitra Tampil',value:db.partners.filter(item=>item.approved).length}
    ];
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('dashboard')} Operasional Sistem</span><h2>Dasbor Administrator</h2><p>Ringkasan operasional pendidikan, verifikasi, publikasi konten, dan tren penggunaan berdasarkan data sistem saat ini.</p></div><a class="btn btn-secondary" href="#/admin/reports">${icon('report')}<span>Buka laporan</span></a></div>
      <div class="metrics">${metric('Pelajar/Mahasiswa', users.length, 'Semua jenjang')}${metric('Profil Terverifikasi',verificationRows[0].value,'Status final internal')}${metric('Konten Publik',contentRows.reduce((sum,row)=>sum+row.value,0),'Beasiswa, kegiatan, dan mitra')}${metric('Antrean Verifikasi', db.verificationQueue.filter(item => ['submitted', 'in_review'].includes(item.status)).length, 'Perlu dipantau')}</div>
      <div class="dashboard-chart-grid dashboard-chart-grid-3 mt-3">${dashboardBarChart('Distribusi Jenjang','Jumlah akun pendidikan menurut jenjang.',levelRows)}${dashboardDonutChart('Status Profil','Komposisi status verifikasi seluruh profil.',verificationRows)}${dashboardTrendChart('Trafik 7 Hari','Pengunjung yang tercatat pada tujuh hari terakhir.',db.trafficAnalytics?.day||[])}</div>
      <div class="panel mt-3"><div class="panel-title">Status Konten Publik</div><div class="dashboard-inline-bars">${contentRows.map(row=>`<div><span>${esc(row.label)}</span><strong>${row.value}</strong></div>`).join('')}</div></div>`, 'dashboard');
  }

  function adminScholarshipsPage() {
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('scholarship')} Konten Publik</span><h2>Manajemen Beasiswa</h2><p>Kelola gambar, sumber informasi, jenjang sasaran, status publikasi, dokumen persyaratan, dan batas waktu.</p></div><div class="management-toolbar"><button class="btn btn-secondary" data-action="export-scholarships-pdf">${icon('filePdf')}<span>Unduh PDF</span></button><button class="btn btn-primary" data-action="add-scholarship">${icon('plus')}<span>Tambah Beasiswa</span></button></div></div><div class="panel premium-data-panel table-wrap"><table class="table"><thead><tr><th>Media</th><th>Judul</th><th>Penyelenggara</th><th>Jenjang</th><th>Batas Waktu</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${db.scholarships.map(item => `<tr><td>${miniContentImage(item,'scholarship')}</td><td><strong>${esc(item.title)}</strong><span class="table-sub">${esc(item.category)}</span></td><td>${esc(item.provider)}</td><td>${esc(item.levels.join(', '))}</td><td>${fmtDate(item.deadline)}</td><td>${badge(item.status)}</td><td><div class="flex wrap gap-2"><button class="btn btn-secondary btn-sm" data-action="edit-scholarship" data-id="${item.id}">${icon('edit')}<span>Ubah</span></button><button class="btn btn-danger btn-sm" data-action="delete-scholarship" data-id="${item.id}">${icon('trash')}<span>Hapus</span></button></div></td></tr>`).join('')}</tbody></table></div>`, 'scholarships');
  }

  function genericContentPage(type, title, section, rows) {
    const descriptions={activities:'Kelola kegiatan publik, jadwal, lokasi, gambar, dan status publikasi.',partners:'Kelola profil mitra, kategori, gambar, dan status tampil pada website publik.',faqs:'Kelola pertanyaan dan jawaban umum agar informasi bantuan tetap konsisten.'};
    const itemCards = rows.map(item => {
      const media = type!=='faqs' ? contentImageBlock(item,item.title||item.name,type==='partners'?'partner':'calendar') : `<div class="content-image-placeholder content-faq-icon">${icon('help')}</div>`;
      const status = type==='activities' ? badge(item.status) : type==='partners' ? badge(item.approved?'published':'private') : `<span class="badge badge-neutral">${esc(item.category||'Umum')}</span>`;
      const meta = type==='activities' ? `${fmtDate(item.date)} • ${esc(item.location)}` : type==='partners' ? esc(item.type) : 'Pertanyaan & jawaban publik';
      const publishButton = type==='activities' ? `<button class="btn ${item.status==='published'?'btn-secondary':'btn-primary'} btn-sm" data-action="toggle-content-publish" data-type="activities" data-id="${item.id}">${icon(item.status==='published'?'eye':'check')}<span>${item.status==='published'?'Tarik dari publik':'Terbitkan'}</span></button>` : type==='partners' ? `<button class="btn ${item.approved?'btn-secondary':'btn-primary'} btn-sm" data-action="toggle-content-publish" data-type="partners" data-id="${item.id}">${icon(item.approved?'eye':'check')}<span>${item.approved?'Sembunyikan':'Tampilkan'}</span></button>` : '';
      return `<article class="content-management-card">${media}<div class="content-management-body"><div class="content-management-status">${status}<span>${meta}</span></div><h3>${esc(item.title || item.name || item.question)}</h3><p>${esc(item.summary || item.answer || item.type || '')}</p><div class="content-management-actions">${publishButton}<button class="btn btn-secondary btn-sm" data-action="generic-edit" data-type="${type}" data-id="${item.id}">${icon('edit')}<span>Ubah</span></button><button class="btn btn-danger btn-sm" data-action="generic-delete" data-type="${type}" data-id="${item.id}">${icon('trash')}<span>Hapus</span></button></div></div></article>`;
    }).join('');
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon(type==='activities'?'calendar':type==='partners'?'partner':'help')} Konten Publik</span><h2>${title}</h2><p>${descriptions[type]||'Kelola informasi yang tampil pada layanan Talenta Nduga.'}</p></div><div class="management-toolbar"><button class="btn btn-secondary" data-action="export-content-pdf" data-type="${type}">${icon('filePdf')}<span>Unduh PDF</span></button><button class="btn btn-primary" data-action="generic-add" data-type="${type}">${icon('plus')}<span>Tambah Data</span></button></div></div><div class="content-management-grid">${itemCards || '<div class="empty">Belum ada data.</div>'}</div>`, section);
  }

  function adminMastersPageLegacy() {
    const profiles=db.profiles||[];
    const districts=[...new Set(profiles.map(p=>p.originDistrict).filter(Boolean))].sort();
    const institutions=[...new Set(profiles.map(p=>p.currentInstitution).filter(Boolean))].sort();
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('database')} Referensi Sistem</span><h2>Data Referensi</h2><p>Referensi inti yang dipakai konsisten pada registrasi, profil pendidikan, verifikasi, filter, dan laporan.</p></div></div><div class="reference-grid">
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('graduation')}</span><h3>Jenjang Pendidikan</h3></div><p>Empat kategori pendidikan yang dipakai sistem.</p><div class="list">${LEVELS.map(x=>`<div class="list-row"><strong>${x}</strong>${badge('active')}</div>`).join('')}</div></div>
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('activity')}</span><h3>Status Pendidikan</h3></div><p>Status studi yang digunakan untuk seluruh jenjang.</p><div class="list">${['Calon','Aktif','Cuti','Lulus','Nonaktif/Keluar'].map(x=>`<div class="list-row"><strong>${x}</strong></div>`).join('')}</div></div>
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('map')}</span><h3>Distrik Asal</h3></div><p>${districts.length} distrik tercatat pada profil saat ini.</p><div class="list">${districts.map(x=>`<div class="list-row"><strong>${esc(x)}</strong><span>${profiles.filter(p=>p.originDistrict===x).length} profil</span></div>`).join('')}</div></div>
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('building')}</span><h3>Institusi Pendidikan</h3></div><p>Nama sekolah dan perguruan tinggi yang sudah digunakan.</p><div class="list">${institutions.map(x=>`<div class="list-row"><strong>${esc(x)}</strong></div>`).join('')}</div></div>
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('document')}</span><h3>Dokumen Minimum</h3></div><p>Persyaratan dokumen berbeda menurut jenjang.</p><div class="list">${LEVELS.map(x=>`<div class="list-row"><div class="list-row-main"><strong>${x}</strong><span>${esc(requiredDocumentsForLevel(x).join(', '))}</span></div></div>`).join('')}</div></div>
      <div class="reference-card"><div class="reference-card-head"><span class="ref-icon">${icon('shield')}</span><h3>Prinsip Referensi</h3></div><p>Perubahan referensi harus menjaga histori data, audit, dan konsistensi laporan.</p><div class="info-callout">Gunakan sumber resmi/terverifikasi sebelum memigrasikan data operasional nyata.</div></div>
    </div>`, 'masters');
  }

  function reportsPage() {
    const users=db.users.filter(u=>u.role==='user');
    const verified=db.profiles.filter(p=>p.profileStatus==='verified').length;
    const pending=db.verificationQueue.filter(q=>['submitted','in_review'].includes(q.status)).length;
    const docsPending=db.documents.filter(d=>['uploaded','pending_review','rejected'].includes(d.status)).length;
    const traffic=(db.trafficAnalytics?.day||[]).slice(-7).reduce((sum,row)=>sum+(row.visitors||0),0);
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('report')} Pelaporan Operasional</span><h2>Laporan</h2><p>Ringkasan pendidikan, verifikasi, dokumen, konten, dan penggunaan layanan untuk pengambilan keputusan internal.</p></div>${session.user().role==='superadmin'?`<button class="btn btn-primary" data-action="export-summary-report-pdf">${icon('filePdf')}<span>Unduh Ringkasan PDF</span></button>`:''}</div>
      <div class="metrics">${metric('Akun Pendidikan',users.length,'Seluruh jenjang')}${metric('Profil Terverifikasi',verified,'Status final internal')}${metric('Antrean Verifikasi',pending,'Butuh tindakan')}${metric('Pengunjung 7 Hari',traffic,'Trafik agregat')}</div>
      <div class="report-grid mt-3"><div class="report-card"><h3>Distribusi Jenjang</h3>${LEVELS.map(level=>`<div class="list-row"><span>${level}</span><strong>${users.filter(u=>u.educationLevel===level).length}</strong></div>`).join('')}</div><div class="report-card"><h3>Kualitas Data</h3><div class="report-number">${docsPending}</div><p class="small muted">Dokumen berstatus terunggah, menunggu peninjauan, atau ditolak.</p><div class="list-row"><span>Profil perlu perbaikan</span><strong>${db.profiles.filter(p=>p.profileStatus==='needs_revision').length}</strong></div></div><div class="report-card"><h3>Konten Publik</h3><div class="list-row"><span>Beasiswa aktif</span><strong>${db.scholarships.filter(x=>x.status==='published').length}</strong></div><div class="list-row"><span>Kegiatan terbit</span><strong>${db.activities.filter(x=>x.status==='published').length}</strong></div><div class="list-row"><span>Mitra tampil</span><strong>${db.partners.filter(x=>x.approved).length}</strong></div></div></div>
      <div class="panel mt-3"><div class="panel-title">Akses Laporan Rinci</div><div class="quick-grid mt-2"><a class="quick-card" href="#/${session.user().role}/students"><strong>Pelajar & Mahasiswa</strong><span>Unduh data pendidikan lengkap beserta dokumen.</span></a><a class="quick-card" href="#/${session.user().role}/traffic"><strong>Trafik</strong><span>Analisis per jam, hari, minggu, bulan, dan tahun.</span></a>${session.user().role==='superadmin'?`<a class="quick-card" href="#/superadmin/audit"><strong>Log Aktivitas</strong><span>Filter dan unduh histori aktivitas sistem.</span></a>`:''}</div></div>`, 'reports');
  }

  function superDashboardLegacy() {
    const educationUsers = db.users.filter(user => user.role === 'user');
    const staff = db.users.filter(user => ['operator','admin'].includes(user.role));
    const verified = db.profiles.filter(profile => profile.profileStatus === 'verified').length;
    const pendingProfiles = db.verificationQueue.filter(item => ['submitted','in_review'].includes(item.status)).length;
    const pendingDocuments = db.documents.filter(item => ['uploaded','pending_review','rejected'].includes(item.status)).length;
    const publishedScholarships = db.scholarships.filter(item => item.status === 'published').length;
    const publishedActivities = db.activities.filter(item => item.status === 'published').length;
    const approvedPartners = db.partners.filter(item => item.approved).length;
    const live30 = liveTrafficEvents(30).length;
    const levelRows=LEVELS.map(level=>({label:level,value:educationUsers.filter(user=>user.educationLevel===level).length}));
    const verificationRows=[
      {label:'Terverifikasi',value:verified},
      {label:'Diajukan / Ditinjau',value:db.profiles.filter(p=>['submitted','in_review'].includes(p.profileStatus)).length},
      {label:'Perlu Perbaikan',value:db.profiles.filter(p=>p.profileStatus==='needs_revision').length},
      {label:'Draf',value:db.profiles.filter(p=>!p.profileStatus||p.profileStatus==='draft').length}
    ];
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('dashboard')} Tata Kelola Sistem</span><h2>Dashboard Administrator Utama</h2><p>Ringkasan faktual penggunaan publik, data pendidikan, verifikasi, konten, pegawai berkewenangan, dan aktivitas layanan Talenta Nduga.</p></div><a class="btn btn-secondary" href="#/superadmin/traffic">${icon('traffic')}<span>Lihat Trafik</span></a></div>
      <div class="metrics">${metric('Pelajar & Mahasiswa',educationUsers.length,'SMA/SMK sampai S3')}${metric('Profil Terverifikasi',verified,`${Math.round((verified/Math.max(1,educationUsers.length))*100)}% dari akun pendidikan`)}${metric('Antrean Verifikasi',pendingProfiles,'Profil perlu tindakan')}${metric('Dokumen Perlu Tindakan',pendingDocuments,'Terunggah, menunggu, atau ditolak')}</div>
      <div class="dashboard-chart-grid dashboard-chart-grid-3 mt-3">${dashboardBarChart('Distribusi Jenjang Pendidikan','Jumlah pelajar/mahasiswa berdasarkan jenjang aktif.',levelRows)}${dashboardDonutChart('Status Verifikasi Profil','Komposisi status profil pada basis data pendidikan.',verificationRows)}${dashboardTrendChart('Trafik 7 Hari','Pergerakan pengunjung publik yang tercatat pada tujuh hari terakhir.',db.trafficAnalytics?.day||[])}</div>
      <div class="health-strip mt-3"><div class="health-item"><b>${publishedScholarships}</b><span>Beasiswa publik aktif</span></div><div class="health-item"><b>${publishedActivities}</b><span>Kegiatan publik terbit</span></div><div class="health-item"><b>${approvedPartners}</b><span>Mitra tampil di publik</span></div><div class="health-item"><b>${live30}</b><span>Aktivitas tercatat 30 menit terakhir</span></div></div>
      <div class="dashboard-command-grid mt-3"><a class="dashboard-command-card" href="#/superadmin/students"><span class="command-icon">${icon('graduation')}</span><strong>Pelajar & Mahasiswa</strong><span>Periksa identitas, pendidikan, dokumen, dan status verifikasi seluruh jenjang.</span></a><a class="dashboard-command-card" href="#/superadmin/privileged-users"><span class="command-icon">${icon('idBadge')}</span><strong>Administrator & Operator</strong><span>${staff.length} akun pegawai berkewenangan dengan MFA dan cakupan kerja.</span></a><a class="dashboard-command-card" href="#/superadmin/audit"><span class="command-icon">${icon('audit')}</span><strong>Log Aktivitas</strong><span>${db.auditLogs.length} catatan tindakan untuk penelusuran dan akuntabilitas.</span></a><a class="dashboard-command-card" href="#/superadmin/security"><span class="command-icon">${icon('security')}</span><strong>Keamanan</strong><span>${activeSessions().length} sesi aktif dapat dipantau dan dicabut sesuai kebutuhan.</span></a></div>`, 'dashboard');
  }

  const ROLE_ACCESS_DETAILS = {
    user: {
      icon: 'user',
      title: 'Pelajar / Mahasiswa',
      purpose: 'Mengelola perjalanan pendidikan dan data milik sendiri dari jenjang SMA/SMK, S1, S2, atau S3.',
      scope: 'Hanya data akun sendiri. Tidak dapat melihat profil atau dokumen pengguna lain.',
      permissions: [
        ['Profil pribadi', 'Membuat dan memperbarui biodata, asal distrik/kampung, kontak, domisili, serta preferensi privasi milik sendiri.'],
        ['Riwayat pendidikan', 'Menambah lebih dari satu riwayat pendidikan dan menetapkan satu pendidikan sebagai data utama.'],
        ['Dokumen pribadi', 'Mengunggah, melihat status peninjauan, dan mengganti dokumen milik sendiri. Tidak dapat memverifikasi dokumennya sendiri.'],
        ['Verifikasi profil', 'Mengajukan profil untuk ditinjau setelah persyaratan minimum terpenuhi dan melihat catatan perbaikan dari petugas verifikasi.'],
        ['Beasiswa & pengingat', 'Menyimpan beasiswa, membatalkan simpanan, membuat pengingat, dan membatalkan pengingat milik sendiri.'],
        ['Riwayat hidup digital', 'Mengelola isi, melakukan pratinjau, mencetak, menerbitkan dengan persetujuan, dan mencabut publikasi kapan saja.'],
        ['Privasi & notifikasi', 'Mengatur data profil yang boleh digunakan pada riwayat hidup publik dan mengelola notifikasi milik sendiri.']
      ],
      restrictions: ['Tidak dapat memverifikasi profil sendiri.', 'Tidak dapat melihat dokumen atau data pribadi pengguna lain.', 'Tidak dapat mengakses menu Operator, Administrator, atau Administrator Utama.'],
      audit: 'Tindakan penting seperti pengajuan verifikasi, perubahan privasi, unggah dokumen, dan publikasi riwayat hidup dicatat sebagai aktivitas akun.'
    },
    operator: {
      icon: 'verify',
      title: 'Operator',
      purpose: 'Menjaga kualitas dan konsistensi data melalui proses peninjauan profil serta dokumen sesuai penugasan.',
      scope: 'Akses dapat dibatasi berdasarkan wilayah, penugasan, atau cakupan kerja yang diberikan Administrator.',
      permissions: [
        ['Antrean verifikasi', 'Melihat daftar pengajuan yang masuk, status peninjauan, indikator waktu layanan, jenjang, distrik, dan institusi sesuai cakupan.'],
        ['Peninjauan profil', 'Membuka rincian pengguna yang ditugaskan, membandingkan data profil, kemudian menyetujui atau meminta perbaikan.'],
        ['Peninjauan dokumen', 'Melihat metadata dan status dokumen yang berada dalam cakupan penugasan. Akses isi dokumen hanya jika kewenangan tersebut diberikan.'],
        ['Keputusan verifikasi', 'Memberikan keputusan verifikasi atau permintaan perbaikan disertai catatan yang dapat dibaca pengguna.'],
        ['Data pengguna', 'Melihat pengguna sesuai cakupan operasional tanpa memperoleh kewenangan otomatis untuk mengelola peran atau keamanan.'],
        ['Unduh data', 'Mengunduh data hanya bila izin ekspor diberikan dan hanya untuk data yang termasuk dalam cakupan penugasan.'],
        ['Riwayat aktivitas', 'Melihat aktivitas operasional yang berkaitan dengan pekerjaan dan cakupan yang diberikan.']
      ],
      restrictions: ['Tidak dapat mengubah peran dan izin sistem.', 'Tidak dapat mengelola Administrator Utama atau konfigurasi keamanan inti.', 'Tidak boleh mengakses data di luar cakupan penugasan.', 'Setiap keputusan verifikasi harus memiliki alasan/catatan yang dapat diaudit.'],
      audit: 'Persetujuan, permintaan perbaikan, akses dokumen, dan unduhan data harus tercatat bersama pelaku, waktu, objek, serta rincian tindakan.'
    },
    admin: {
      icon: 'settings',
      title: 'Administrator',
      purpose: 'Mengelola konten, data referensi, status akun pendidikan, dan laporan operasional.',
      scope: 'Akses operasional lintas data pendidikan dan konten. Dokumen pelajar/mahasiswa dapat ditinjau untuk kebutuhan verifikasi, dengan seluruh keputusan dicatat pada audit.',
      permissions: [
        ['Konten beasiswa', 'Membuat, memperbarui, menjadwalkan, menerbitkan, menutup, dan mengarsipkan informasi beasiswa.'],
        ['Konten kegiatan, mitra & pertanyaan umum', 'Mengelola informasi publik yang ditampilkan di website sesuai status publikasi.'],
        ['Data referensi', 'Mengelola referensi yang digunakan sistem seperti wilayah, institusi, dan kebutuhan master data operasional.'],
        ['Pelajar & mahasiswa', 'Melihat seluruh data wajib SMA/SMK, S1, S2, S3; membuka rincian identitas dan pendidikan; menyaring data; serta memeriksa kelengkapan profil.'],
        ['Verifikasi profil & dokumen', 'Meninjau dokumen wajib, memberikan status terverifikasi/ditolak dengan catatan, menyetujui profil yang sudah siap, atau meminta perbaikan.'],
        ['Akun pengguna', 'Mengaktifkan/nonaktifkan akun pendidikan sesuai kebutuhan operasional. Akun berkewenangan dikelola Administrator Utama.'],
        ['Laporan & statistik', 'Melihat data agregat dan laporan operasional tanpa menampilkan isi dokumen sensitif pada ringkasan umum.'],
        ['Unduh data', 'Mengunduh data sesuai izin dengan tujuan penggunaan yang wajib dicatat. Filter, jumlah data, pelaku, dan waktu unduhan harus dapat diaudit.']
      ],
      restrictions: ['Tidak dapat mengubah kebijakan RBAC inti tanpa otorisasi Administrator Utama.', 'Akses dokumen hanya digunakan untuk peninjauan/verifikasi sesuai kebutuhan operasional dan tidak boleh disebarkan.', 'Tidak boleh menggunakan unduhan data di luar tujuan yang dicatat.'],
      audit: 'Perubahan konten, pengelolaan akun, unduhan data, dan tindakan operasional penting harus menghasilkan catatan audit.'
    },
    superadmin: {
      icon: 'security',
      title: 'Administrator Utama',
      purpose: 'Mengelola tata kelola sistem, peran dan izin, keamanan, akun berkewenangan, audit, serta tindakan insiden.',
      scope: 'Memiliki kewenangan tata kelola tertinggi, namun penggunaan akses istimewa tetap mengikuti prinsip kebutuhan minimum dan wajib dapat diaudit.',
      permissions: [
        ['Peran & izin', 'Mengubah peran dan cakupan akun berkewenangan serta mengatur izin unduh Administrator/Operator.'],
        ['Seluruh modul operasional', 'Mengelola konten publik dan laporan, meninjau verifikasi, melihat seluruh pengguna, serta mengaktifkan/nonaktifkan akun.'],
        ['Provisioning akun berkewenangan', 'Membuat dan mengelola akun Operator dan Administrator dari pegawai Dinas Pendidikan dan Kebudayaan melalui proses terkontrol; identitas kepegawaian dan verifikasi dua langkah wajib.'],
        ['Pengaturan sistem', 'Mengelola keputusan konfigurasi dan tata kelola yang memengaruhi sistem sesuai persetujuan organisasi/pengelola.'],
        ['Log aktivitas', 'Melihat, memfilter, mengunduh, dan mengelola log tindakan sistem untuk investigasi dan penelusuran perubahan. Penghapusan log menghasilkan catatan audit penghapusan baru.'],
        ['Keamanan & sesi', 'Memantau dan mencabut sesi semua pengguna, termasuk pelajar/mahasiswa, Operator, dan Administrator.'],
        ['Kontrol unduh data', 'Menentukan atau menerapkan kontrol izin unduhan data. Setiap unduhan tetap membutuhkan tujuan dan meninggalkan jejak audit.'],
        ['Tindakan insiden', 'Melakukan tindakan administratif yang diperlukan untuk penanganan insiden sesuai prosedur, dengan pencatatan tindakan yang lengkap.']
      ],
      restrictions: ['Akses istimewa tidak boleh digunakan tanpa kebutuhan yang sah.', 'Penghapusan log hanya melalui fungsi Administrator Utama dan tindakan penghapusan wajib dicatat kembali.', 'Tindakan keamanan, perubahan peran, dan pencabutan sesi harus meninggalkan jejak audit.'],
      audit: 'Login akun berkewenangan, perubahan peran/izin, pencabutan sesi, unduhan data, dan tindakan keamanan harus tercatat secara eksplisit.'
    }
  };


  function rolesPage() {
    const matrix = [
      ['Kelola profil sendiri', 'own', '—', '—', '—'],
      ['Unggah/kelola dokumen sendiri', 'own', '—', '—', '—'],
      ['Tinjau profil & dokumen', '—', 'scoped', 'penuh operasional', 'penuh'],
      ['Kelola konten publik', '—', '—', 'penuh', 'penuh'],
      ['Lihat data agregat', 'milik sendiri', 'scoped', 'penuh', 'penuh'],
      ['Unduh data pengguna', 'riwayat hidup sendiri', 'scoped + izin', 'izin', 'izin + kontrol'],
      ['Kelola Operator/Administrator', '—', '—', '—', 'penuh'],
      ['Kelola peran & izin', '—', '—', '—', 'penuh'],
      ['Lihat audit', '—', 'aktivitas sendiri', '—', 'penuh'],
      ['Cabut sesi seluruh pengguna', '—', '—', '—', 'penuh']
    ];
    const cards = Object.entries(ROLE_ACCESS_DETAILS).map(([role, detail]) => `<article class="role-detail-card role-${role}">
      <div class="role-detail-head"><span class="role-detail-icon">${icon(detail.icon)}</span><div><span class="role-kicker">${esc(ROLE_LABELS[role] || role)}</span><h3>${esc(detail.title)}</h3><p>${esc(detail.purpose)}</p></div></div>
      <div class="role-scope"><strong>${icon('scope')} Cakupan akses</strong><p>${esc(detail.scope)}</p></div>
      <div class="role-permission-list"><h4>${icon('key')} Kewenangan yang diperbolehkan</h4>${detail.permissions.map(([name, description]) => `<div class="role-permission-item"><span class="permission-check">${icon('check')}</span><div><strong>${esc(name)}</strong><p>${esc(description)}</p></div></div>`).join('')}</div>
      <div class="role-restrictions"><h4>${icon('warning')} Batasan yang wajib dipatuhi</h4><ul>${detail.restrictions.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>
      <div class="role-audit-note">${icon('history')}<div><strong>Audit & keamanan</strong><p>${esc(detail.audit)}</p></div></div>
    </article>`).join('');
    return appLayout(`<div class="dashboard-head"><div><h2>${icon('roles','heading-icon')} Peran & Izin</h2><p>Dokumentasi lengkap mengenai tujuan peran, cakupan akses, kewenangan, batasan, dan kontrol audit pada Talenta Nduga.</p></div></div>
      <div class="info-callout role-help"><strong>${icon('info')} Cara membaca halaman ini</strong><span><b>Own</b> berarti hanya data milik sendiri; <b>scoped</b> berarti dibatasi penugasan/wilayah; <b>jika diberikan</b> berarti izin tidak otomatis aktif; <b>penuh</b> tetap tunduk pada audit dan aturan keamanan.</span></div>
      <div class="panel mt-3 stack"><div class="panel-title">Kontrol Izin Unduh</div><p class="small muted">Super admin dapat mengaktifkan atau menonaktifkan unduhan PDF/Excel untuk setiap peran. Cakupan data tetap mengikuti hak akses akun.</p><label class="consent-line"><input type="checkbox" id="export-permission-admin" ${db.exportPermissions?.admin !== false ? 'checked' : ''}><span>Izinkan Administrator mengunduh data pendidikan</span></label><label class="consent-line"><input type="checkbox" id="export-permission-operator" ${db.exportPermissions?.operator !== false ? 'checked' : ''}><span>Izinkan Operator mengunduh data sesuai cakupan</span></label><button class="btn btn-primary" data-action="save-export-permissions">Simpan izin unduh</button></div><div class="role-detail-grid mt-3">${cards}</div>
      <div class="panel mt-3"><div class="panel-head"><div><div class="panel-title">${icon('roles')} Matriks akses lintas peran</div><p class="small muted">Matriks ini merangkum akses utama. Penjelasan rinci dan pembatasannya terdapat pada kartu peran di atas.</p></div></div><div class="role-matrix-wrap"><table class="table role-matrix"><thead><tr><th>Kemampuan</th><th>Pelajar/Mahasiswa</th><th>Operator</th><th>Administrator</th><th>Administrator Utama</th></tr></thead><tbody>${matrix.map(row => `<tr>${row.map((cell, index) => `<td>${index === 0 ? `<strong>${esc(cell)}</strong>` : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="panel mt-3"><div class="panel-title">${icon('shield')} Prinsip pengendalian akses</div><div class="access-principles"><div><strong>Prinsip kebutuhan minimum</strong><span>Setiap peran hanya memperoleh akses yang diperlukan untuk menjalankan tugasnya.</span></div><div><strong>Otorisasi sesuai objek</strong><span>Akses ke pengguna atau dokumen harus mempertimbangkan kepemilikan, cakupan, dan izin yang diberikan.</span></div><div><strong>Verifikasi dua langkah</strong><span>Wajib untuk Operator, Administrator, dan Administrator Utama sebelum membuka area berkewenangan khusus.</span></div><div><strong>Jejak audit</strong><span>Tindakan sensitif harus dapat ditelusuri melalui pelaku, waktu, objek, dan rincian tindakan.</span></div></div></div>`, 'roles');
  }

  function privilegedUsersPage() {
    const rows=db.users.filter(user=>['operator','admin'].includes(user.role));
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('idBadge')} Pegawai Berkewenangan</span><h2>Administrator & Operator</h2><p>Akun ini hanya diperuntukkan bagi pegawai Dinas Pendidikan dan Kebudayaan yang telah diverifikasi identitas kepegawaiannya. Verifikasi dua langkah wajib.</p></div><div class="management-toolbar"><button class="btn btn-secondary" data-action="export-privileged-users-pdf">${icon('filePdf')}<span>Unduh PDF</span></button><button class="btn btn-primary" data-action="add-privileged-user">${icon('userPlus')}<span>Tambah Akun</span></button></div></div><div class="staff-grid">${rows.map(user=>`<article class="staff-card"><div class="staff-card-head"><div><span class="eyebrow">${icon('idBadge')} ${esc(roleLabel(user))}</span><h3>${esc(user.name)}</h3><p class="small muted">${esc(user.email)}</p></div>${badge(user.status)}</div><div class="staff-meta"><div><span>NIP</span><strong>${esc(user.nip||'—')}</strong></div><div><span>Status Pegawai</span><strong>${esc(user.employeeStatus||'—')}</strong></div><div><span>Bidang</span><strong>${esc(user.bidang||'—')}</strong></div><div><span>Jabatan</span><strong>${esc(user.jabatan||'—')}</strong></div><div><span>Unit Kerja</span><strong>${esc(user.unitKerja||'—')}</strong></div><div><span>Lokasi Tugas</span><strong>${esc(user.workLocation||'—')}</strong></div><div><span>Cakupan</span><strong>${esc(user.scope||'Sesuai peran')}</strong></div><div><span>MFA</span><strong>${user.mfaEnabled?'Aktif':'Nonaktif'}</strong></div></div><div class="staff-actions"><button class="btn btn-secondary btn-sm" data-action="edit-privileged-user" data-id="${user.id}">${icon('edit')}<span>Ubah</span></button><button class="btn btn-danger btn-sm" data-action="delete-privileged-user" data-id="${user.id}">${icon('trash')}<span>Hapus</span></button></div></article>`).join('')}</div>`, 'privileged-users');
  }

  function settingsPageLegacy() {
    const cfg=db.systemSettings||{};
    const decisions=['Pengelola data resmi','Definisi pengguna asal Nduga','Daftar dokumen minimum','Referensi distrik/kampung/institusi','Kebijakan retensi final','Penyedia hosting dan pencadangan','Metode MFA dan pemulihan akun'];
    const score=Math.round(((decisions.length-3)/decisions.length)*100);
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('settings')} Tata Kelola</span><h2>Pengaturan</h2><p>Konfigurasi operasional dan keputusan governance yang berdampak pada keamanan, privasi, pelaporan, serta kesiapan produksi.</p></div></div><div class="settings-grid"><form id="system-settings-form" class="panel stack"><div class="panel-title">Konfigurasi Operasional</div><div class="form-grid">${fieldHTML('Pengelola data', 'dataController', cfg.dataController||'')}${fieldHTML('Zona waktu', 'timezone', cfg.timezone||'Asia/Jayapura')}${selectHTML('Saluran pengingat', 'reminderChannel', ['Email','SMS','WhatsApp'], cfg.reminderChannel||'Email')}${fieldHTML('Durasi sesi (menit)', 'sessionMinutes', cfg.sessionMinutes||60,'number')}${fieldHTML('Watermark unduhan', 'exportWatermark', cfg.exportWatermark||'TALENTA NDUGA • DOKUMEN TERKENDALI')}</div><div class="field"><label>Kebijakan retensi dokumen</label><textarea class="textarea" name="documentRetention">${esc(cfg.documentRetention||'')}</textarea></div><button class="btn btn-primary" type="button" data-action="save-system-settings">${icon('check')}<span>Simpan Pengaturan</span></button></form><div class="panel"><div class="panel-title">Kesiapan Tata Kelola</div><div class="governance-score"><div><b>${score}%</b><span>indikator kesiapan konfigurasi internal</span></div></div><div class="settings-list">${decisions.map((item,index)=>`<div class="settings-row"><strong>${esc(item)}</strong><span>${index<4?'Baseline tersedia; tetap perlu penetapan/validasi stakeholder sebelum produksi.':'Memerlukan keputusan final sebelum development freeze.'}</span></div>`).join('')}</div></div></div>`, 'settings');
  }

  function humanizeAction(value) { return String(value || '').toLowerCase().split('_').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' '); }

  function auditTable(logs, wrapper = true, withActions = false) {
    const html = `<div class="table-wrap"><table class="table"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Tindakan</th><th>Objek</th><th>Rincian</th>${withActions?'<th>Aksi</th>':''}</tr></thead><tbody>${logs.map(item => `<tr><td>${fmtDate(item.timestamp, true)}</td><td><strong>${esc(item.actor)}</strong></td><td>${esc(humanizeAction(item.action))}</td><td><span class="audit-entity">${esc(item.entity)}</span></td><td>${esc(item.detail)}</td>${withActions?`<td><button class="btn btn-danger btn-sm" data-action="delete-audit-log" data-id="${item.id}">${icon('trash')}<span>Hapus</span></button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
    return wrapper ? `<div class="panel premium-data-panel">${html}</div>` : html;
  }

  function auditPageLegacy() {
    const actors=[...new Set(db.auditLogs.map(x=>x.actor).filter(Boolean))].sort();
    const actions=[...new Set(db.auditLogs.map(x=>x.action).filter(Boolean))].sort();
    const rows=getFilteredAuditLogs();
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('audit')} Audit & Akuntabilitas</span><h2>Log Aktivitas</h2><p>Telusuri aktivitas penting berdasarkan periode, pelaku, jenis tindakan, objek, dan kata kunci.</p></div><div class="management-toolbar"><button class="btn btn-secondary" data-action="export-audit-pdf">${icon('filePdf')}<span>Unduh PDF</span></button><button class="btn btn-danger" data-action="delete-all-audit-logs">${icon('trash')}<span>Hapus Semua Log</span></button></div></div><div class="panel filter-panel"><div class="audit-filters"><div class="search-field">${icon('search')}<input id="audit-search" class="input" placeholder="Cari tindakan, objek, atau rincian"></div><input id="audit-month" class="input" type="month"><select id="audit-actor" class="select"><option value="">Semua pelaku</option>${actors.map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="audit-action" class="select"><option value="">Semua tindakan</option>${actions.map(x=>`<option value="${esc(x)}">${esc(humanizeAction(x))}</option>`).join('')}</select></div></div><div id="audit-results" class="mt-3">${auditTable(rows,true,true)}</div>`, 'audit');
  }

  function securityPage() {
    return appLayout(`<div class="dashboard-head"><div><h2>Keamanan</h2><p>Pantau dan cabut sesi login seluruh akun, termasuk pelajar dan mahasiswa.</p></div></div><div class="grid grid-2"><div class="panel"><div class="panel-title">Sesi Seluruh Pengguna</div><div class="list mt-2">${db.privilegedSessions.map(item => `<div class="list-row"><div class="list-row-main"><strong>${esc(item.email)}</strong><span>${esc(ROLE_LABELS[item.role] || item.role)} • ${esc(item.device)} • ${fmtDate(item.lastSeen, true)}</span></div>${badge(activeSessions().some(record => record.id === item.id) ? 'active' : item.active && item.expiresAt <= Date.now() ? 'expired' : 'revoked')}<button class="btn btn-danger btn-sm" data-action="revoke-session" data-id="${item.id}" ${!activeSessions().some(record => record.id === item.id) ? 'disabled' : ''}>Cabut sesi</button></div>`).join('')}</div></div><div class="panel"><div class="panel-title">Kontrol Wajib</div><div class="list mt-2">${['Verifikasi dua langkah untuk akun berkewenangan', 'Kewenangan berbasis peran', 'Penyimpanan dokumen privat', 'Koneksi HTTPS dan sesi aman', 'Validasi unggahan', 'Pencatatan tindakan penting', 'Pencadangan dan pemulihan', 'Pengujian keamanan sebelum peluncuran'].map(item => `<div class="list-row"><div class="list-row-main"><strong>${item}</strong><span>Kontrol keamanan sistem.</span></div>${badge('required')}</div>`).join('')}</div></div></div>`, 'security');
  }

  function renderUsersTable(rows, allowStatusAction = true) {
    return `<div class="panel user-management-panel"><div class="user-table table-wrap"><table class="table"><thead><tr><th>Nama</th><th>Jenjang</th><th>Email</th><th>Nomor HP</th><th>Peran</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr></thead><tbody>${rows.map(user => `<tr><td><strong>${esc(user.name)}</strong></td><td>${esc(user.educationLevel || '—')}</td><td>${esc(user.email)}</td><td>${esc(user.phone || '—')}</td><td>${esc(roleLabel(user))}</td><td>${badge(user.status)}</td><td>${fmtDate(user.createdAt)}</td><td><button class="btn btn-secondary btn-sm" data-action="view-user" data-id="${user.id}">${icon('eye')}<span>Lihat</span></button>${allowStatusAction && canManageUser(user) ? `<button class="btn ${user.status === 'suspended' ? 'btn-secondary' : 'btn-danger'} btn-sm" data-action="toggle-user-status" data-id="${user.id}">${user.status === 'suspended' ? 'Aktifkan' : 'Nonaktifkan'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div><div class="user-card-list">${rows.map(user => `<article class="user-card"><div class="user-card-head"><div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div>${badge(user.status)}</div><div class="user-card-grid"><span><b>Jenjang</b>${esc(user.educationLevel || '—')}</span><span><b>Peran</b>${esc(roleLabel(user))}</span><span><b>Telepon</b>${esc(user.phone || '—')}</span><span><b>Terdaftar</b>${fmtDate(user.createdAt)}</span></div><div class="user-card-actions"><button class="btn btn-secondary btn-sm" data-action="view-user" data-id="${user.id}">${icon('eye')}<span>Lihat rincian</span></button>${allowStatusAction && canManageUser(user) ? `<button class="btn ${user.status === 'suspended' ? 'btn-secondary' : 'btn-danger'} btn-sm" data-action="toggle-user-status" data-id="${user.id}">${user.status === 'suspended' ? 'Aktifkan' : 'Nonaktifkan'}</button>` : ''}</div></article>`).join('')}</div></div>`;
  }

  function allUsersPage(role) {
    const canManage=['admin','superadmin'].includes(role);
    const rows=getFilteredUsers();
    const superMode=role==='superadmin';
    const title=superMode?'Kontrol Akun':'Akun Pengguna';
    const description=superMode?'Kontrol status akses hanya untuk akun Pelajar dan Mahasiswa. Pengelolaan pegawai Administrator/Operator dipisahkan pada menu Administrator & Operator.':'Kelola status akun pelajar dan mahasiswa. Data pendidikan dan verifikasi rinci tersedia pada menu Pelajar & Mahasiswa.';
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('users')} Akses Akun</span><h2>${title}</h2><p>${description}</p></div><div class="count-pill"><strong id="users-count">${rows.length}</strong><span>akun pendidikan</span></div></div><div class="panel filter-panel"><div class="filters users-filters"><input id="users-search" class="input" placeholder="Cari nama, email, atau nomor HP">${superMode?'':`<select id="users-role" class="select"><option value="user">Pelajar/Mahasiswa</option></select>`}<select id="users-level" class="select"><option value="">Semua jenjang</option>${LEVELS.map(level=>`<option>${level}</option>`).join('')}</select><select id="users-status" class="select"><option value="">Semua status</option><option value="active">Aktif</option><option value="suspended">Dinonaktifkan</option><option value="pending_verification">Menunggu Verifikasi</option></select></div>${canExport()?`<div class="export-bar"><div class="field export-purpose"><label>Tujuan unduhan</label><input id="users-export-purpose" class="input" placeholder="Contoh: laporan akun bulanan"></div><div class="export-actions"><button class="btn btn-primary" data-action="export-users-pdf" data-scope="all">${icon('filePdf')}<span>Unduh PDF</span></button><button class="btn btn-secondary" data-action="export-users-excel" data-scope="all">${icon('fileExcel')}<span>Unduh Excel</span></button></div></div>`:''}</div><div id="all-users-results" class="mt-3">${renderUsersTable(rows,canManage)}</div>`, 'all-users');
  }


  function operatorDashboard(){
    const html=operatorDashboardLegacy(), queue=visibleQueue(); const buckets=[['<24 jam',queue.filter(q=>queueSla(q).hours<24).length],['24–48 jam',queue.filter(q=>queueSla(q).hours>=24&&queueSla(q).hours<48).length],['48–72 jam',queue.filter(q=>queueSla(q).hours>=48&&queueSla(q).hours<=72).length],['>72 jam',queue.filter(q=>queueSla(q).hours>72).length]]; const panel=`<section class="panel mt-3"><div class="panel-title">Aging SLA Antrean</div><div class="health-strip mt-2">${buckets.map(([l,v])=>`<div class="health-item"><b>${v}</b><span>${l}</span></div>`).join('')}</div></section>`; return html.replace('</main>',panel+'</main>');
  }
  function adminDashboard(){ const html=adminDashboardLegacy(), flags=computeDataQualityFlags(); const panel=`<section class="panel mt-3"><div class="panel-title">Indikator Kualitas Data</div><div class="health-strip mt-2"><div class="health-item"><b>${flags.filter(f=>f.severity==='high').length}</b><span>Prioritas tinggi</span></div><div class="health-item"><b>${flags.filter(f=>f.type==='duplicate').length}</b><span>Potensi duplikat</span></div><div class="health-item"><b>${flags.filter(f=>f.type==='incomplete').length}</b><span>Profil belum lengkap</span></div><div class="health-item"><b>${flags.filter(f=>f.type==='reference').length}</b><span>Referensi belum master</span></div></div></section>`;return html.replace('</main>',panel+'</main>'); }
  function superDashboard(){ const html=superDashboardLegacy(); const health=[['Penyimpanan lokal',typeof indexedDB!=='undefined'?'Siap':'Fallback'],['Scheduler prototype','Aktif'],['Master data',db.masterData?'Siap':'Belum'],['Audit append-only UI','Aktif']]; const panel=`<section class="panel mt-3"><div class="panel-title">Kesehatan Sistem Prototype</div><div class="health-strip mt-2">${health.map(([k,v])=>`<div class="health-item"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div><p class="small muted mt-2">Status production seperti queue, storage server, backup, dan uptime harus berasal dari backend saat migrasi Laravel.</p></section>`; return html.replace('</main>',panel+'</main>'); }

  function appRouter(section) {
    const user=session.user(); if(!user) return null; if(!availableMenus(user).some(([key])=>key===section)) section='dashboard';
    if(user.role==='user'){const routes={dashboard:userDashboard,profile:profilePage,education:educationPage,documents:documentsPage,saved:savedPage,reminders:remindersPage,resume:resumePage,notifications:notificationsPage,privacy:privacyPage};return (routes[section]||userDashboard)();}
    if(user.role==='operator'){const routes={dashboard:operatorDashboard,traffic:trafficPage,students:()=>studentsManagementPage('operator'),verification:verificationPage,activity:activityPage};return (routes[section]||operatorDashboard)();}
    if(user.role==='admin'){const routes={dashboard:adminDashboard,traffic:trafficPage,students:()=>studentsManagementPage('admin'),verification:verificationPage,scholarships:adminScholarshipsPage,activities:()=>genericContentPage('activities','Kegiatan','activities',db.activities),partners:()=>genericContentPage('partners','Mitra','partners',db.partners),faqs:()=>genericContentPage('faqs','Pertanyaan Umum','faqs',db.faqs),inbox:inboxPage,masters:adminMastersPage,'all-users':()=>allUsersPage('admin'),reports:reportsPage};return (routes[section]||adminDashboard)();}
    if(user.role==='superadmin'){const routes={dashboard:superDashboard,traffic:trafficPage,students:()=>studentsManagementPage('superadmin'),verification:verificationPage,roles:rolesPage,'privileged-users':privilegedUsersPage,'all-users':()=>allUsersPage('superadmin'),scholarships:adminScholarshipsPage,activities:()=>genericContentPage('activities','Kegiatan','activities',db.activities),partners:()=>genericContentPage('partners','Mitra','partners',db.partners),faqs:()=>genericContentPage('faqs','Pertanyaan Umum','faqs',db.faqs),inbox:inboxPage,masters:adminMastersPage,reports:reportsPage,settings:settingsPage,audit:auditPage,security:securityPage};return (routes[section]||superDashboard)();}
    return null;
  }

  function render() {
    applyTheme();
    db = store.load(); normalizeDataIntegrity(); runPrototypeScheduler();
    const hash = location.hash || '#/';
    const path = hash.replace(/^#\//, '').split('/').filter(Boolean);
    const publicPage = path[0] || '';
    const current = session.user();
    recordTrafficView(hash, current);

    if (['user', 'operator', 'admin', 'superadmin'].includes(publicPage)) {
      if (!current) { app.innerHTML = ''; closeModal(); location.hash = '#/masuk'; return; }
      if (current.role !== publicPage) { location.hash = `#/${current.role}/dashboard`; return; }
      app.innerHTML = appRouter(path[1] || 'dashboard') || '';
      bindDynamicInputs();
      setTimeout(() => hydrateStoredMedia(app), 0);
      if (path[1] === 'students' && path[2] && canReviewStudent(Number(path[2]))) {
        setTimeout(() => viewUserModal(Number(path[2])), 0);
      }
      return;
    }

    if (publicPage === 'cv' && path[1]) { app.innerHTML = publicCvPage(path[1]); setTimeout(() => hydrateStoredMedia(app),0); return; }
    const pages = {
      '': homePage, tentang: aboutPage, beasiswa: scholarshipsPage, kegiatan: activitiesPage, mitra: partnersPage,
      'pertanyaan-umum': faqPage, kontak: contactPage, masuk: loginPage, daftar: registerPage,
      verifikasi: verifyPage, 'lupa-kata-sandi': forgotPage, 'reset-kata-sandi': resetPasswordPage, 'verifikasi-dua-langkah': mfaPage, 'privasi-data': publicPrivacyPage
    };
    app.innerHTML = (pages[publicPage] || homePage)();
    bindForms();
    bindDynamicInputs();
    setTimeout(() => hydrateStoredMedia(app), 0);
  }

  function bindForms() {
    const login = document.getElementById('login-form');
    if (login) login.addEventListener('submit', handleLogin);
    const register = document.getElementById('register-form');
    if (register) register.addEventListener('submit', handleRegister);
    const verify = document.getElementById('verify-form');
    if (verify) verify.addEventListener('submit', handleVerification);
    const mfa = document.getElementById('mfa-form');
    if (mfa) mfa.addEventListener('submit', handleMfa);
    const forgot = document.getElementById('forgot-form');
    if (forgot) forgot.addEventListener('submit', event => {
      event.preventDefault();
      const email = String(new FormData(event.currentTarget).get('email') || '').trim().toLowerCase();
      const user = db.users.find(item => item.email.toLowerCase() === email);
      if (user) { const token=Math.random().toString(36).slice(2,8).toUpperCase(); db.passwordResetTokens = db.passwordResetTokens || []; db.passwordResetTokens.unshift({id:uid(),userId:user.id,token,expiresAt:Date.now()+15*60*1000,used:false,createdAt:now()}); save(); audit('Sistem','PERMINTAAN_PEMULIHAN',`pengguna:${user.id}`,'Token pemulihan dibuat dengan masa berlaku 15 menit.'); sessionStorage.setItem('talenta_nduga_reset_hint',JSON.stringify({email:user.email,token})); location.hash='#/reset-kata-sandi'; }
      else { toast('Jika email terdaftar, alur pemulihan akan tersedia.', 'success'); event.currentTarget.reset(); }
    });
    const resetForm=document.getElementById('reset-password-form'); if(resetForm) resetForm.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(event.currentTarget),email=String(fd.get('email')||'').trim().toLowerCase(),token=String(fd.get('token')||'').trim(),password=String(fd.get('password')||'');const user=db.users.find(u=>u.email.toLowerCase()===email),rec=db.passwordResetTokens?.find(t=>t.userId===user?.id&&t.token===token&&!t.used&&t.expiresAt>Date.now());if(!rec)return toast('Token tidak valid atau sudah kedaluwarsa.','error');if(password.length<8||!/[A-Za-z]/.test(password)||!/\d/.test(password))return toast('Kata sandi minimal 8 karakter serta mengandung huruf dan angka.','error');user.password=password;rec.used=true;db.privilegedSessions.filter(s=>s.userId===user.id).forEach(s=>s.active=false);save();audit(user.name,'RESET_KATA_SANDI',`pengguna:${user.id}`,'Pemulihan kata sandi berhasil.');sessionStorage.removeItem('talenta_nduga_reset_hint');toast('Kata sandi berhasil diperbarui. Silakan masuk kembali.','success');location.hash='#/masuk';});
    const contact = document.getElementById('contact-form');
    if (contact) contact.addEventListener('submit', event => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const inquiry={ id: uid(), name: String(fd.get('name')).trim(), email: String(fd.get('email')).trim(), subject: String(fd.get('subject')).trim(), message: String(fd.get('message')).trim(), status:'new', createdAt: now(), updatedAt:now(), handledBy:'', responseNote:'' }; db.inquiries.unshift(inquiry); notifyStaff(['admin','superadmin'],'Pesan kontak baru',`${inquiry.name}: ${inquiry.subject}`,'info','inbox',inquiry.id); save();
      event.currentTarget.reset();
      toast('Pesan berhasil dikirim.', 'success');
    });
  }

  function bindDynamicInputs() {
    const scholarshipSearch=document.getElementById('scholarship-search'); if(scholarshipSearch){scholarshipSearch.addEventListener('input',filterScholarships);document.getElementById('scholarship-level')?.addEventListener('change',filterScholarships);document.getElementById('scholarship-category')?.addEventListener('change',filterScholarships);}
    const queueSearch=document.getElementById('queue-search'); if(queueSearch){queueSearch.addEventListener('input',filterQueue);document.getElementById('queue-level')?.addEventListener('change',filterQueue);document.getElementById('queue-status')?.addEventListener('change',filterQueue);}
    const usersSearch=document.getElementById('users-search'); if(usersSearch){usersSearch.addEventListener('input',filterAllUsers);document.getElementById('users-role')?.addEventListener('change',filterAllUsers);document.getElementById('users-level')?.addEventListener('change',filterAllUsers);document.getElementById('users-status')?.addEventListener('change',filterAllUsers);}
    const studentSearch=document.getElementById('students-search'); if(studentSearch){studentSearch.addEventListener('input',filterStudentsManagement);['students-level','students-profile-status','students-study-status','students-district','students-city'].forEach(id=>document.getElementById(id)?.addEventListener('change',filterStudentsManagement));}
    document.querySelectorAll('[data-inquiry-status]').forEach(select=>select.addEventListener('change',()=>{if(!['admin','superadmin'].includes(session.user()?.role))return;const item=db.inquiries.find(x=>x.id===Number(select.dataset.inquiryStatus));if(item){item.status=select.value;item.handledBy=session.user().name;item.updatedAt=now();save();audit(session.user().name,'UBAH_STATUS_INQUIRY',`inquiry:${item.id}`,select.value);}}));
    const auditSearch=document.getElementById('audit-search'); if(auditSearch){auditSearch.addEventListener('input',filterAuditPage);['audit-month','audit-actor','audit-action'].forEach(id=>document.getElementById(id)?.addEventListener('change',filterAuditPage));}
    document.querySelectorAll('[data-traffic-period]').forEach(button=>button.addEventListener('click',()=>renderTrafficBody(button.dataset.trafficPeriod||'day')));
    const topbarSearch=document.getElementById('topbar-search-form'); if(topbarSearch) topbarSearch.addEventListener('submit',event=>{event.preventDefault();const query=String(new FormData(event.currentTarget).get('q')||'').trim();if(query)runGlobalSearch(query);});
  }

  function handleLogin(event) {
    event.preventDefault();
    db = store.load();
    const fd = new FormData(event.currentTarget);
    const email = String(fd.get('login') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    const { record } = loginGuard(email);
    if (record.blockedUntil && Date.now() < record.blockedUntil) {
      const seconds = Math.ceil((record.blockedUntil - Date.now()) / 1000);
      return toast(`Terlalu banyak percobaan. Coba kembali dalam ${seconds} detik.`, 'error');
    }
    const user = db.users.find(item => item.email.toLowerCase() === email);
    if (!user || user.password !== password) {
      const latest = recordLoginFailure(email);
      const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - latest.attempts);
      return toast(remaining ? `Email atau kata sandi salah. Sisa percobaan: ${remaining}.` : 'Akses sementara dibatasi selama 60 detik.', 'error');
    }
    if (user.status !== 'active' && user.status !== 'pending_verification') return toast('Akun sedang dinonaktifkan. Hubungi pengelola.', 'error');
    if (!user.verifiedContact) {
      sessionStorage.setItem('talenta_nduga_pending_verification', String(user.id));
      location.hash = '#/verifikasi';
      return;
    }
    clearLoginGuard(email);
    audit(user.name, 'MASUK_BERHASIL', `pengguna:${user.id}`, `Peran: ${roleLabel(user)}`);
    if (user.role !== 'user') {
      sessionStorage.setItem('talenta_nduga_pending_mfa', String(user.id));
      sessionStorage.setItem('talenta_nduga_mfa_attempts', '0');
      sessionStorage.setItem('talenta_nduga_mfa_expires', String(Date.now() + 5 * 60 * 1000));
      location.hash = '#/verifikasi-dua-langkah';
      return;
    }
    session.login(user);
    location.hash = `#/${user.role}/dashboard`;
  }

  function handleRegister(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const name = String(fd.get('name') || '').trim();
    const educationLevel = String(fd.get('educationLevel') || '').trim();
    const email = String(fd.get('email') || '').trim().toLowerCase();
    const phone = String(fd.get('phone') || '').replace(/\s+/g, '');
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('passwordConfirm') || '');
    if (!LEVELS.includes(educationLevel)) return toast('Pilih jenjang pendidikan yang sesuai.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Format email belum valid.', 'error');
    if (db.users.some(user => user.email.toLowerCase() === email)) return toast('Email sudah digunakan.', 'error');
    if (db.users.some(user => user.phone === phone)) return toast('Nomor HP sudah digunakan.', 'error');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return toast('Kata sandi minimal 8 karakter dan harus mengandung huruf serta angka.', 'error');
    if (password !== confirm) return toast('Ulangi kata sandi harus sama.', 'error');
    const userId = uid();
    const profileId = uid();
    db.users.push({ id: userId, role: 'user', educationLevel, name, email, phone, password, status: 'pending_verification', verifiedContact: false, consentAcceptedAt: now(), consentVersion: db.systemSettings?.privacyNoticeVersion || '1.0', consentPurpose: 'pendataan-pendidikan-layanan-talenta', createdAt: now() });
    db.profiles.push({ id: profileId, userId, fullName: name, gender: 'Laki-laki', birthPlace: '', birthDate: '', originProvince: 'Papua Pegunungan', originRegency: 'Nduga', originDistrict: '', originVillage: '', domicileCity: '', domicileProvince: '', email, phone, currentInstitution: '', program: '', level: educationLevel, studentNumber: '', entryYear: '', studyStatus: 'Aktif', institutionCity: '', institutionProvince: '', npsn: '', classLevel: '', expectedGraduationYear: '', faculty: '', activeSemester: '', targetGraduationYear: '', priorS1Institution: '', priorS1Program: '', priorS1EntryYear: '', priorS1GraduationYear: '', priorS1Degree: '', priorS1Gpa: '', priorS2Institution: '', priorS2Program: '', priorS2GraduationYear: '', priorS2Degree: '', priorS2ThesisTitle: '', concentration: '', thesisTitle: '', thesisStatus: '', advisor: '', fundingSource: '', scholarshipStatus: '', researchTopic: '', dissertationTitle: '', researchField: '', promoter: '', coPromoter: '', proposalStatus: '', researchStatus: '', dissertationStatus: '', publications: '', conferences: '', orcid: '', googleScholar: '', profileStatus: 'draft', completeness: 0, lastReviewNote: '', privacy: { showOriginDistrict: false, showInstitution: false, showProgram: false, publicResume: false }, resume: { slug: slugify(name), published: false, summary: '', skills: [], experiences: [], organizations: [], projects: [], achievements: [] } });
    notifyStaff(['admin','superadmin'], 'Pendaftaran akun pendidikan baru', `${name} mendaftar pada jenjang ${educationLevel}.`, 'info', 'students', userId);
    save();
    audit(name, 'PENDAFTARAN_AKUN', `pengguna:${userId}`, `Jenjang: ${educationLevel}`);
    sessionStorage.setItem('talenta_nduga_pending_verification', String(userId));
    location.hash = '#/verifikasi';
    toast('Akun berhasil dibuat. Lanjutkan verifikasi kontak.', 'success');
  }

  function handleVerification(event) {
    event.preventDefault();
    db = store.load();
    const pendingId = Number(sessionStorage.getItem('talenta_nduga_pending_verification') || 0);
    const user = db.users.find(item => item.id === pendingId);
    if (!user) return toast('Pendaftaran tidak ditemukan.', 'error');
    if (user.role !== 'user' || user.status !== 'pending_verification') return toast('Akun tidak dapat diverifikasi. Hubungi pengelola.', 'error');
    const code = String(new FormData(event.currentTarget).get('code') || '');
    if (code !== '135790') return toast('Kode verifikasi belum sesuai.', 'error');
    user.verifiedContact = true;
    user.status = 'active';
    save();
    audit(user.name, 'VERIFIKASI_KONTAK', `pengguna:${user.id}`, 'Kontak berhasil diverifikasi.');
    sessionStorage.removeItem('talenta_nduga_pending_verification');
    session.login(user);
    location.hash = '#/user/dashboard';
    toast('Akun berhasil diverifikasi.', 'success');
  }

  function handleMfa(event) {
    event.preventDefault();
    db = store.load();
    const pendingId = Number(sessionStorage.getItem('talenta_nduga_pending_mfa') || 0);
    const user = db.users.find(item => item.id === pendingId);
    if (!user || user.status !== 'active' || !user.verifiedContact || !['operator', 'admin', 'superadmin'].includes(user.role)) {
      sessionStorage.removeItem('talenta_nduga_pending_mfa');
      location.hash = '#/masuk';
      return toast('Akun tidak dapat melanjutkan verifikasi. Silakan masuk kembali.', 'error');
    }
    const expires = Number(sessionStorage.getItem('talenta_nduga_mfa_expires') || 0);
    if (!expires || Date.now() > expires) {
      sessionStorage.removeItem('talenta_nduga_pending_mfa');
      return toast('Waktu verifikasi telah berakhir. Silakan masuk kembali.', 'error');
    }
    const attempts = Number(sessionStorage.getItem('talenta_nduga_mfa_attempts') || 0);
    const code = String(new FormData(event.currentTarget).get('code') || '');
    if (code !== '246810') {
      sessionStorage.setItem('talenta_nduga_mfa_attempts', String(attempts + 1));
      if (attempts + 1 >= 3) {
        sessionStorage.removeItem('talenta_nduga_pending_mfa');
        sessionStorage.removeItem('talenta_nduga_mfa_attempts');
        sessionStorage.removeItem('talenta_nduga_mfa_expires');
        location.hash = '#/masuk';
        return toast('Verifikasi gagal tiga kali. Silakan masuk kembali.', 'error');
      }
      return toast(`Kode belum sesuai. Sisa percobaan: ${2 - attempts}.`, 'error');
    }
    sessionStorage.removeItem('talenta_nduga_pending_mfa');
    sessionStorage.removeItem('talenta_nduga_mfa_attempts');
    sessionStorage.removeItem('talenta_nduga_mfa_expires');
    session.login(user);
    audit(user.name, 'VERIFIKASI_DUA_LANGKAH_BERHASIL', `pengguna:${user.id}`, roleLabel(user));
    location.hash = `#/${user.role}/dashboard`;
  }

  
  // saveProfile: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  function filterScholarships() {
    const q = (document.getElementById('scholarship-search')?.value || '').toLowerCase();
    const level = document.getElementById('scholarship-level')?.value || '';
    const category = document.getElementById('scholarship-category')?.value || '';
    const list = db.scholarships.filter(item => item.status === 'published' && (!q || `${item.title} ${item.provider}`.toLowerCase().includes(q)) && (!level || item.levels.includes(level)) && (!category || item.category === category));
    const target = document.getElementById('scholarship-grid');
    if (target) target.innerHTML = list.length ? list.map(item => scholarshipCard(item, true)).join('') : '<div class="empty">Tidak ada beasiswa yang sesuai dengan penyaringan saat ini.</div>';
  }

  function filterQueue() {
    const q = (document.getElementById('queue-search')?.value || '').toLowerCase();
    const level = document.getElementById('queue-level')?.value || '';
    const status = document.getElementById('queue-status')?.value || '';
    const list = visibleQueue().filter(item => (!q || `${item.userName} ${item.district} ${item.institution}`.toLowerCase().includes(q)) && (!level || item.educationLevel === level) && (!status || item.status === status));
    const target = document.getElementById('queue-table');
    if (target) target.innerHTML = queueTable(list);
  }

  function getFilteredUsers() {
    const actor = session.user();
    const q = (document.getElementById('users-search')?.value || '').toLowerCase();
    const role = document.getElementById('users-role')?.value || '';
    const level = document.getElementById('users-level')?.value || '';
    const status = document.getElementById('users-status')?.value || '';
    const base = visibleUsers().filter(user => actor?.role === 'superadmin' ? user.role === 'user' : true);
    return base.filter(user => (!q || `${user.name} ${user.email} ${user.phone}`.toLowerCase().includes(q)) && (!role || user.role === role) && (!level || user.educationLevel === level) && (!status || user.status === status));
  }

  function filterAllUsers() {
    const rows = getFilteredUsers();
    const current = session.user();
    const target = document.getElementById('all-users-results');
    if (target) target.innerHTML = renderUsersTable(rows, ['admin', 'superadmin'].includes(current?.role));
    const count = document.getElementById('users-count');
    if (count) count.textContent = rows.length;
  }
function reviewModal(id) {
    const queue = db.verificationQueue.find(item => item.id === Number(id));
    if (!queue) return;
    const user = db.users.find(item => item.id === queue.userId);
    if (!user || !canReviewStudent(user.id)) return;
    const profile = db.profiles.find(item => item.userId === queue.userId);
    const docs = db.documents.filter(item => item.userId === queue.userId);
    openModal(`<div class="modal-head"><div><h3>Peninjauan Profil</h3><p class="small muted">${esc(queue.userName)} • ${esc(queue.educationLevel)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><div class="review-grid"><div class="panel"><div class="panel-title">Data Pendidikan</div><div class="detail-list"><div><span>Nama</span><strong>${esc(profile?.fullName || user?.name || '—')}</strong></div><div><span>Jenjang</span><strong>${esc(queue.educationLevel)}</strong></div><div><span>Institusi</span><strong>${esc(profile?.currentInstitution || '—')}</strong></div><div><span>Program/Jurusan</span><strong>${esc(profile?.program || '—')}</strong></div><div><span>Nomor Induk</span><strong>${esc(profile?.studentNumber || '—')}</strong></div></div><div class="panel-title mt-3">Dokumen</div><div class="document-status-grid mt-2">${docs.map(doc => { const review=latestReview(doc); return `<article class="document-review-card"><div><strong>${esc(doc.type)}</strong><span>${esc(doc.filename)}</span><small>${esc(review?.note || doc.reviewNote || doc.note || 'Belum ada catatan.')}</small></div><div class="document-review-status">${badge(doc.status)}<button class="btn btn-ghost btn-sm" data-action="open-document-file" data-id="${doc.id}">${icon('eye')}<span>Lihat</span></button><button class="btn btn-secondary btn-sm" data-action="inspect-document" data-id="${doc.id}">${icon('verify')}<span>Periksa</span></button></div></article>`; }).join('') || '<div class="empty">Belum ada dokumen.</div>'}</div></div><div class="panel stack"><div class="panel-title">Keputusan</div><div class="field"><label>Catatan peninjauan</label><textarea id="review-note" class="textarea" placeholder="Tulis catatan yang dapat dipahami pengguna">${esc(queue.note || '')}</textarea></div><button class="btn btn-primary" data-action="approve-review" data-id="${queue.id}">Setujui dan Verifikasi</button><button class="btn btn-secondary" data-action="revision-review" data-id="${queue.id}">Minta Perbaikan</button></div></div>`);
  }


  
  // viewUserModal: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.



  function contentImageBlock(item, alt, iconName='image') {
    if (item?.imageBlobKey) return `<img class="content-image" data-media-key="${esc(item.imageBlobKey)}" alt="${esc(alt||'Gambar konten')}">`;
    return item?.image ? `<img class="content-image" src="${esc(item.image)}" alt="${esc(alt||'Gambar konten')}">` : `<div class="content-image-placeholder">${icon(iconName)}</div>`;
  }
  function miniContentImage(item, iconName='image') {
    if (item?.imageBlobKey) return `<img data-media-key="${esc(item.imageBlobKey)}" alt="" style="width:64px;height:48px;border-radius:9px;object-fit:cover">`;
    return item?.image ? `<img src="${esc(item.image)}" alt="" style="width:64px;height:48px;border-radius:9px;object-fit:cover">` : `<span class="feature-icon" style="margin:0">${icon(iconName)}</span>`;
  }
  function imageUploadField(item=null) {
    const hasCurrent=!!(item?.imageBlobKey || item?.image);
    const preview=item?.imageBlobKey ? `<img data-media-key="${esc(item.imageBlobKey)}" alt="Pratinjau gambar saat ini">` : item?.image ? `<img src="${esc(item.image)}" alt="Pratinjau gambar saat ini">` : '';
    return `<div class="field"><label>Gambar</label><input class="input" type="file" name="image" accept="image/jpeg,image/png,image/webp"><span class="field-help">JPG, PNG, atau WebP. Tidak ada batas ukuran buatan aplikasi; penyimpanan mengikuti kapasitas browser/perangkat.</span>${hasCurrent?`<div class="content-media-preview">${preview}<span>Gambar saat ini akan dipertahankan jika tidak memilih berkas baru.</span></div>`:''}</div>`;
  }
  function confirmAction(message) { return typeof window.confirm === 'function' ? window.confirm(message) : true; }
  function exportCollectionPdf(type) {
    if(!authorize('export-content-pdf',null,type)) return;
    const actor=session.user(); const title=type==='activities'?'Data Kegiatan':type==='partners'?'Data Mitra':'Pertanyaan Umum';
    const subtitle=type==='activities'?'Agenda dan publikasi kegiatan Talenta Nduga':type==='partners'?'Direktori mitra publik Talenta Nduga':'Basis bantuan dan informasi publik';
    let columns,rows;
    if(type==='activities'){columns=[{label:'No',width:.5},{label:'Judul',width:2.1},{label:'Tanggal',width:1},{label:'Lokasi',width:1.3},{label:'Status',width:1},{label:'Ringkasan',width:3},{label:'Gambar',width:1.2}];rows=(db[type]||[]).map((x,i)=>[i+1,x.title,fmtDate(x.date),x.location,statusLabel(x.status),x.summary||'-',(x.imageBlobKey||x.image)?'Tersedia':'Belum ada']);}
    else if(type==='partners'){columns=[{label:'No',width:.5},{label:'Nama Mitra',width:2.2},{label:'Jenis',width:1.4},{label:'Tampil Publik',width:1.1},{label:'Ringkasan',width:3.2},{label:'Gambar',width:1.2}];rows=(db[type]||[]).map((x,i)=>[i+1,x.name,x.type,x.approved?'Ya':'Tidak',x.summary||'-',(x.imageBlobKey||x.image)?'Tersedia':'Belum ada']);}
    else {columns=[{label:'No',width:.5},{label:'Kategori',width:1.2},{label:'Pertanyaan',width:3},{label:'Jawaban',width:4.5}];rows=(db[type]||[]).map((x,i)=>[i+1,x.category,x.question,x.answer]);}
    const pdf=makeProfessionalPdf({title:`TALENTA NDUGA — ${title.toUpperCase()}`,subtitle,description:'Dokumen ini disusun dari data yang tersimpan pada sistem dan digunakan untuk kebutuhan administrasi internal/operasional.',meta:[['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah data',rows.length]],sections:[{title,columns,rows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'});
    downloadBlob(`talenta-nduga-${type}.pdf`,pdf); audit(actor.name,'UNDUH_KONTEN_PDF',type,`${rows.length} data`); toast('File PDF berhasil disiapkan.','success');
  }

  async function deleteGenericContent(type,id) {
    if(!authorize('generic-delete',id,type)) return; const list=db[type]||[]; const item=list.find(x=>x.id===Number(id)); if(!item) return; if(!confirmAction(`Hapus ${item.title||item.name||item.question}?`)) return; if(item.imageBlobKey) await fileStore.delete(item.imageBlobKey); db[type]=list.filter(x=>x.id!==Number(id)); save(); audit(session.user().name,'HAPUS_KONTEN',`${type}:${id}`,item.title||item.name||item.question); render(); toast('Data berhasil dihapus.','success');
  }
  function toggleContentPublish(type,id) {
    if(!authorize('toggle-content-publish',id,type)) return;
    const item=(db[type]||[]).find(row=>row.id===Number(id)); if(!item) return;
    if(type==='activities') {
      const publishing=item.status!=='published';
      item.status=publishing?'published':'draft';
      save(); audit(session.user().name,publishing?'TERBITKAN_KEGIATAN':'TARIK_KEGIATAN',`activities:${item.id}`,item.title); render(); toast(publishing?'Kegiatan berhasil diterbitkan ke halaman publik.':'Kegiatan ditarik dari halaman publik.','success'); return;
    }
    if(type==='partners') {
      item.approved=!item.approved;
      save(); audit(session.user().name,item.approved?'TAMPILKAN_MITRA':'SEMBUNYIKAN_MITRA',`partners:${item.id}`,item.name); render(); toast(item.approved?'Mitra berhasil ditampilkan pada halaman publik.':'Mitra disembunyikan dari halaman publik.','success');
    }
  }

  function contentFormModal(type, item = null) {
    const configs={
      activities:{title:item?'Ubah Kegiatan':'Tambah Kegiatan',fields:()=>`${imageUploadField(item)}${fieldHTML('Judul','title',item?.title||'')}${fieldHTML('Tanggal','date',item?.date||'','date')}${fieldHTML('Lokasi','location',item?.location||'')}${selectHTML('Status','status',['draft','scheduled','published','archived'],item?.status||'draft')}${fieldHTML('Jadwal terbit','publishAt',item?.publishAt?item.publishAt.slice(0,16):'','datetime-local')}<div class="field"><label>Ringkasan</label><textarea class="textarea" name="summary">${esc(item?.summary||'')}</textarea></div>`},
      partners:{title:item?'Ubah Mitra':'Tambah Mitra',fields:()=>`${imageUploadField(item)}${fieldHTML('Nama Mitra','name',item?.name||'')}${fieldHTML('Jenis Mitra','type',item?.type||'')}<div class="field"><label>Ringkasan</label><textarea class="textarea" name="summary">${esc(item?.summary||'')}</textarea></div><label class="consent-line"><input type="checkbox" name="approved" ${item?.approved!==false?'checked':''}><span>Tampilkan pada halaman publik</span></label>`},
      faqs:{title:item?'Ubah Pertanyaan Umum':'Tambah Pertanyaan Umum',fields:()=>`${fieldHTML('Kategori','category',item?.category||'')}${fieldHTML('Pertanyaan','question',item?.question||'')}<div class="field"><label>Jawaban</label><textarea class="textarea" name="answer">${esc(item?.answer||'')}</textarea></div>`}
    };
    const config=configs[type]; if(!config) return;
    openModal(`<div class="modal-head"><div><h3>${config.title}</h3><p class="small muted">Lengkapi informasi lalu simpan perubahan.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><form id="content-form" class="stack"><input type="hidden" name="id" value="${item?.id||''}">${config.fields()}<button class="btn btn-primary" type="submit">${icon('check')}<span>Simpan</span></button></form>`);
    setTimeout(()=>document.getElementById('content-form')?.addEventListener('submit',async event=>{
      event.preventDefault(); if(!authorize(item?'generic-edit':'generic-add',item?.id,type)) return; const fd=new FormData(event.currentTarget); const id=Number(fd.get('id')||0); const recordId=id||uid(); let payload;
      try {
        if(type==='activities'){ const media=await persistImageUpload(fd.get('image'),item,'activity',recordId); payload={title:String(fd.get('title')||'').trim(),date:String(fd.get('date')||''),location:String(fd.get('location')||'').trim(),status:String(fd.get('status')||'draft'),publishAt:String(fd.get('publishAt')||''),summary:String(fd.get('summary')||'').trim(),...media}; if(!payload.title||!payload.date||!payload.location) return toast('Judul, tanggal, dan lokasi wajib diisi.','error'); }
        else if(type==='partners'){ const media=await persistImageUpload(fd.get('image'),item,'partner',recordId); payload={name:String(fd.get('name')||'').trim(),type:String(fd.get('type')||'').trim(),summary:String(fd.get('summary')||'').trim(),approved:fd.has('approved'),...media}; if(!payload.name||!payload.type) return toast('Nama dan jenis mitra wajib diisi.','error'); }
        else { payload={category:String(fd.get('category')||'').trim(),question:String(fd.get('question')||'').trim(),answer:String(fd.get('answer')||'').trim()}; if(!payload.category||!payload.question||!payload.answer) return toast('Kategori, pertanyaan, dan jawaban wajib diisi.','error'); }
      } catch(error){ return toast(error.message||'Gambar tidak dapat diproses.','error'); }
      const collection=db[type]; if(id) Object.assign(collection.find(row=>row.id===id),payload); else collection.unshift({id:recordId,...payload}); save(); audit(session.user().name,id?'UBAH_KONTEN':'TAMBAH_KONTEN',`${type}:${recordId}`,payload.title||payload.name||payload.question); closeModal(); render(); toast('Konten berhasil disimpan.','success');
    }),0);
  }

  function privilegedUserModal(id = null) {
    if(!authorize(id?'edit-privileged-user':'add-privileged-user',id)) return;
    const target=id?db.users.find(item=>item.id===Number(id)):null;
    if(id&&(!target||!['operator','admin'].includes(target.role)||!canManageUser(target))) return;
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('idBadge')} Pegawai Dinas Pendidikan</span><h3>${target?'Ubah Akun Berkewenangan':'Tambah Akun Berkewenangan'}</h3><p class="small muted">Administrator dan Operator harus merupakan pegawai Dinas Pendidikan dan Kebudayaan. Verifikasi dua langkah wajib.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><form id="privileged-user-form" class="stack"><div class="employee-note">${icon('shield')} Data kepegawaian digunakan untuk memastikan akuntabilitas akun berkewenangan.</div><div class="form-section-premium"><div class="panel-title">Identitas Pegawai</div><div class="form-grid mt-2">${fieldHTML('Nama lengkap','name',target?.name||'')}${fieldHTML('NIP','nip',target?.nip||'')}${fieldHTML('Email dinas / kerja','email',target?.email||'','email')}${fieldHTML('Nomor HP','phone',target?.phone||'')}${selectHTML('Status Kepegawaian','employeeStatus',['PNS','PPPK','Pegawai Kontrak'],target?.employeeStatus||'PNS')}${fieldHTML('Lokasi tugas','workLocation',target?.workLocation||'Keneyam')}</div></div><div class="form-section-premium"><div class="panel-title">Penugasan & Kewenangan</div><div class="form-grid mt-2">${selectHTML('Peran',['role'][0],['operator','admin'],target?.role||'operator')}${fieldHTML('Bidang','bidang',target?.bidang||'')}${fieldHTML('Jabatan','jabatan',target?.jabatan||'')}${fieldHTML('Unit kerja','unitKerja',target?.unitKerja||'Dinas Pendidikan dan Kebudayaan Kabupaten Nduga')}${fieldHTML('Cakupan distrik operator','districts',target?.assignedDistricts?.join(', ')||'','text','Pisahkan dengan koma. Kosong berarti cakupan Nduga; hanya berlaku untuk Operator.')}${target?'':fieldHTML('Kata sandi awal','password','','password','Minimal 8 karakter, mengandung huruf dan angka.')}</div></div><button class="btn btn-primary" type="submit">${icon('check')}<span>${target?'Simpan Perubahan':'Buat Akun'}</span></button></form>`);
    setTimeout(()=>document.getElementById('privileged-user-form')?.addEventListener('submit',event=>{
      event.preventDefault(); if(!authorize(id?'edit-privileged-user':'add-privileged-user',id)) return; const existing=id?db.users.find(item=>item.id===Number(id)):null; const fd=new FormData(event.currentTarget); const role=String(fd.get('role')||''); if(!['operator','admin'].includes(role)) return toast('Peran hanya boleh Operator atau Administrator.','error');
      const name=String(fd.get('name')||'').trim(), nip=String(fd.get('nip')||'').trim(), email=String(fd.get('email')||'').trim().toLowerCase(), phone=String(fd.get('phone')||'').trim(), bidang=String(fd.get('bidang')||'').trim(), jabatan=String(fd.get('jabatan')||'').trim(), unitKerja=String(fd.get('unitKerja')||'').trim(), employeeStatus=String(fd.get('employeeStatus')||'').trim(), workLocation=String(fd.get('workLocation')||'').trim(), password=String(fd.get('password')||'');
      if(!name||!nip||!email||!phone||!bidang||!jabatan||!unitKerja||!employeeStatus||!workLocation) return toast('Seluruh identitas kepegawaian wajib diisi.','error');
      if(db.users.some(u=>u.id!==Number(id)&&String(u.nip||'')===nip)) return toast('NIP sudah digunakan.','error');
      if(db.users.some(u=>u.id!==Number(id)&&u.email.toLowerCase()===email)) return toast('Email sudah digunakan.','error');
      if(db.users.some(u=>u.id!==Number(id)&&u.phone===phone)) return toast('Nomor HP sudah digunakan.','error');
      if(!existing&&!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return toast('Kata sandi awal minimal 8 karakter serta mengandung huruf dan angka.','error');
      const districts=String(fd.get('districts')||'').split(',').map(v=>v.trim()).filter(Boolean); const assignedDistricts=role==='operator'&&districts.length?districts:undefined; const actor=session.user(); const user=existing||{id:uid(),educationLevel:'-',createdAt:now(),verifiedContact:true,status:'active'}; const beforeRole=user.role;
      Object.assign(user,{role,name,nip,email,phone,bidang,jabatan,unitKerja,employeeStatus,workLocation,mfaEnabled:true,assignedDistricts,scope:role==='operator'?(districts.join(', ')||'Penugasan Nduga'):'Seluruh operasi administrasi'}); if(!existing) user.password=password; if(!existing) db.users.push(user); if(existing&&beforeRole!==role) db.privilegedSessions.filter(x=>x.userId===user.id).forEach(x=>x.active=false); save(); audit(actor.name,existing?'UBAH_AKUN_BERKEWENANGAN':'TAMBAH_AKUN_BERKEWENANGAN',`pengguna:${user.id}`,`${roleLabel(user)} • NIP ${nip} • ${jabatan}`); closeModal(); render(); toast(existing?'Akun berhasil diperbarui.':'Akun berhasil dibuat.','success');
    }),0);
  }

  function scholarshipDetail(id) {
    const item = db.scholarships.find(row => row.id === Number(id));
    if (!item) return;
    openModal(`<div class="modal-head"><div><h3>${esc(item.title)}</h3><div class="meta-row"><span>${esc(item.provider)}</span><span>•</span><span>${esc(item.levels.join(', '))}</span><span>•</span><span>${esc(item.category)}</span></div></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><div class="grid grid-2"><div class="panel"><div class="panel-title">Persyaratan Umum</div><p class="small muted">${esc(item.eligibility)}</p><div class="panel-title mt-3">Manfaat</div><p class="small muted">${esc(item.benefit)}</p></div><div class="panel"><div class="panel-title">Dokumen</div><ul class="small muted">${item.requiredDocs.map(doc => `<li>${esc(doc)}</li>`).join('')}</ul><p class="small"><strong>Batas waktu:</strong> ${fmtDate(item.deadline, true)} WIT</p><p class="small"><strong>Terakhir diperiksa:</strong> ${fmtDate(item.lastVerifiedAt)}</p></div></div><div class="info-callout mt-3">Periksa selalu persyaratan akhir dari penyelenggara sebelum mengajukan beasiswa.</div>${item.sourceUrl && /^https:\/\//i.test(item.sourceUrl) ? `<a class="btn btn-primary mt-3" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('external')}<span>Buka Sumber Resmi</span></a>` : ''}`);
  }

  function scholarshipFormModal(item = null) {
    const value=item||{id:'',title:'',provider:'',levels:['S1'],category:'Pendidikan',deadline:'',status:'draft',eligibility:'',benefit:'',sourceUrl:'#',lastVerifiedAt:new Date().toISOString().slice(0,10),requiredDocs:[],image:''};
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('scholarship')} Konten Beasiswa</span><h3>${item?'Ubah':'Tambah'} Beasiswa</h3><p class="small muted">Lengkapi gambar, informasi sumber, jenjang sasaran, persyaratan, dan batas waktu.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><form id="scholarship-form" class="stack"><input type="hidden" name="id" value="${value.id}">${imageUploadField(item)}<div class="form-grid">${fieldHTML('Judul','title',value.title)}${fieldHTML('Penyelenggara','provider',value.provider)}${fieldHTML('Jenjang Sasaran','levels',value.levels.join(', '),'text','Pisahkan dengan koma, contoh: S2, S3')}${fieldHTML('Kategori','category',value.category)}${fieldHTML('Batas Waktu','deadline',value.deadline?value.deadline.slice(0,16):'','datetime-local')}${selectHTML('Status','status',['draft','scheduled','published','closed','archived'],value.status)}${fieldHTML('Jadwal Terbit','publishAt',value.publishAt?value.publishAt.slice(0,16):'','datetime-local')}${fieldHTML('Tanggal Pemeriksaan','lastVerifiedAt',value.lastVerifiedAt,'date')}${fieldHTML('URL Sumber','sourceUrl',value.sourceUrl||'#','url')}</div><div class="field"><label>Persyaratan Umum</label><textarea class="textarea" name="eligibility">${esc(value.eligibility)}</textarea></div><div class="field"><label>Manfaat</label><textarea class="textarea" name="benefit">${esc(value.benefit)}</textarea></div><div class="field"><label>Dokumen yang Dibutuhkan</label><input class="input" name="requiredDocs" value="${esc(value.requiredDocs.join(', '))}"></div><button class="btn btn-primary" type="submit">${icon('check')}<span>Simpan Beasiswa</span></button></form>`);
    setTimeout(()=>document.getElementById('scholarship-form')?.addEventListener('submit',async event=>{ event.preventDefault(); if(!authorize(item?'edit-scholarship':'add-scholarship',item?.id)) return; const fd=new FormData(event.currentTarget); const id=Number(fd.get('id')||0); const recordId=id||uid(); const levels=String(fd.get('levels')||'').split(',').map(x=>x.trim()).filter(x=>LEVELS.includes(x)); if(!levels.length) return toast('Masukkan minimal satu jenjang yang valid.','error'); let media; try{media=await persistImageUpload(fd.get('image'),item,'scholarship',recordId);}catch(error){return toast(error.message,'error');} const payload={title:String(fd.get('title')||'').trim(),provider:String(fd.get('provider')||'').trim(),levels,category:String(fd.get('category')||'').trim(),deadline:String(fd.get('deadline')||''),status:String(fd.get('status')||'draft'),publishAt:String(fd.get('publishAt')||''),eligibility:String(fd.get('eligibility')||'').trim(),benefit:String(fd.get('benefit')||'').trim(),sourceUrl:String(fd.get('sourceUrl')||'#').trim()||'#',lastVerifiedAt:String(fd.get('lastVerifiedAt')||''),requiredDocs:String(fd.get('requiredDocs')||'').split(',').map(x=>x.trim()).filter(Boolean),bookmarks:item?.bookmarks||0,...media}; if(!payload.title||!payload.provider||!payload.deadline) return toast('Judul, penyelenggara, dan batas waktu wajib diisi.','error'); if(payload.sourceUrl && payload.sourceUrl!=='#' && !/^https:\/\//i.test(payload.sourceUrl)) return toast('URL sumber resmi harus menggunakan HTTPS.','error'); if(id) Object.assign(db.scholarships.find(x=>x.id===id),payload); else db.scholarships.unshift({id:recordId,...payload}); save(); audit(session.user().name,id?'UBAH_BEASISWA':'TAMBAH_BEASISWA',`beasiswa:${recordId}`,payload.title); closeModal(); render(); toast('Data beasiswa berhasil disimpan.','success'); }),0);
  }

  function exportPurpose(scope) {
    const id = scope === 'operator' ? 'export-purpose-operator' : 'users-export-purpose';
    const purpose = String(document.getElementById(id)?.value || '').trim();
    if (!purpose) { toast('Isi tujuan penggunaan sebelum mengunduh data.', 'error'); return null; }
    return purpose;
  }

  function exportRows(scope) {
    if (!canExport()) return [];
    if (scope === 'operator' || session.user().role === 'operator') return visibleUsers().filter(user => user.role === 'user');
    return document.getElementById('users-search') ? getFilteredUsers() : visibleUsers();
  }

  
  // exportUsersExcel: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  function exportUsersPdf(scope) {
    if (!authorize('export-users-pdf')) return;
    const purpose=exportPurpose(scope); if(!purpose) return; const rows=exportRows(scope),actor=session.user();
    const tableRows=rows.map((user,index)=>[index+1,user.name,user.educationLevel||'-',roleLabel(user),statusLabel(user.status),user.email,user.phone||'-',user.verifiedContact?'Ya':'Belum',fmtDate(user.createdAt)]);
    const blob=makeProfessionalPdf({title:'TALENTA NDUGA — DATA PENGGUNA',subtitle:'Kontrol akun Pelajar & Mahasiswa',description:'Rekap akun pendidikan untuk pemantauan status akses dan administrasi pengguna.',meta:[['Tujuan',purpose],['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah data',rows.length]],sections:[{title:'Daftar Pengguna',columns:[{label:'No',width:.4},{label:'Nama',width:1.6},{label:'Jenjang',width:.7},{label:'Peran',width:1.1},{label:'Status',width:1},{label:'Email',width:1.8},{label:'Nomor HP',width:1.1},{label:'Kontak',width:.8},{label:'Terdaftar',width:1}],rows:tableRows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'});
    downloadBlob('talenta-nduga-data-pengguna.pdf',blob); audit(actor.name,'UNDUH_DATA_PDF','pengguna',`Tujuan: ${purpose}; jumlah: ${rows.length}`); toast('File PDF berhasil disiapkan.','success');
  }

  function padText(value, width) {
    const normalized = plainAscii(String(value ?? ''));
    return (normalized.length > width - 1 ? `${normalized.slice(0, width - 2)}…` : normalized).padEnd(width, ' ');
  }

  function plainAscii(value) {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '?');
  }

  function pdfEscape(value) {
    return plainAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  
  // makeSimplePdf: implementasi lama dihapus pada audit v5 agar hanya ada satu sumber logika.


  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function slugify(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }


  function requiredDocumentsForLevel(level) {
    if (level === 'SMA/SMK') return ['Kartu Pelajar', 'Surat Keterangan Aktif Sekolah', 'Rapor'];
    if (level === 'S1') return ['Kartu Mahasiswa', 'Surat Aktif Kuliah', 'Transkrip', 'Ijazah SMA/SMK'];
    if (level === 'S2') return ['Kartu Mahasiswa', 'Surat Aktif Kuliah', 'Transkrip', 'Ijazah S1', 'Transkrip S1'];
    return ['Kartu Mahasiswa', 'Surat Aktif Kuliah', 'Transkrip', 'Ijazah S2', 'Transkrip S2', 'Ijazah S1'];
  }

  function documentMatchesRequirement(doc, required) {
    const aliases = {
      'Surat Keterangan Aktif Sekolah': ['Surat Keterangan Aktif Sekolah','Surat Aktif Sekolah'],
      'Surat Aktif Kuliah': ['Surat Aktif Kuliah','Surat Keterangan Aktif Kuliah'],
      'Ijazah SMA/SMK': ['Ijazah SMA/SMK','Ijazah','Ijazah/SKL']
    };
    return (aliases[required] || [required]).includes(doc?.type);
  }

  function missingRequiredDocuments(level, docs) {
    return requiredDocumentsForLevel(level).filter(required => !docs.some(doc => documentMatchesRequirement(doc, required) && !['rejected','superseded','expired'].includes(doc.status)));
  }

  function unverifiedRequiredDocuments(level, docs) {
    return requiredDocumentsForLevel(level).filter(required => !docs.some(doc => documentMatchesRequirement(doc, required) && doc.status === 'verified'));
  }

  function studentVerificationReadiness(user, profile, docs) {
    const completeness = profileCompleteness(profile, user.educationLevel);
    const missing = missingRequiredDocuments(user.educationLevel, docs);
    const unverified = unverifiedRequiredDocuments(user.educationLevel, docs);
    return { completeness, missing, unverified, ready: completeness === 100 && missing.length === 0 && unverified.length === 0 };
  }

  function requiredProfileKeys(level) {
    const common = ['fullName','originProvince','originRegency','originDistrict','originVillage','domicileCity','domicileProvince','email','phone','currentInstitution','program','studentNumber','entryYear','studyStatus','institutionCity','institutionProvince'];
    if (level === 'SMA/SMK') return [...common,'npsn','classLevel','expectedGraduationYear'];
    if (level === 'S1') return [...common,'faculty','activeSemester','targetGraduationYear'];
    if (level === 'S2') return [...common,'faculty','activeSemester','priorS1Institution','priorS1Program','priorS1GraduationYear','priorS1Degree','concentration','targetGraduationYear'];
    return [...common,'faculty','activeSemester','priorS1Institution','priorS1Program','priorS1GraduationYear','priorS1Degree','priorS2Institution','priorS2Program','priorS2GraduationYear','priorS2Degree','researchTopic','researchField','targetGraduationYear'];
  }

  function profileCompleteness(profile, level) {
    const keys = requiredProfileKeys(level);
    const filled = keys.filter(key => String(profile?.[key] ?? '').trim()).length;
    return Math.round((filled / keys.length) * 100);
  }

  function educationDataOverview() {
    const items = [
      ['SMA/SMK','Sekolah, NPSN, NISN, jurusan/peminatan, kelas, tahun masuk, target lulus, status pendidikan, lokasi sekolah.'],
      ['S1','Perguruan tinggi, fakultas, program studi, NIM, semester, tahun masuk, target lulus, status studi, lokasi kampus.'],
      ['S2','Data S2 lengkap, riwayat S1, konsentrasi, tesis, pembimbing, target lulus, pembiayaan dan status beasiswa.'],
      ['S3','Data doktoral, riwayat S1–S2, bidang riset, disertasi, promotor, tahapan penelitian, publikasi dan profil akademik.']
    ];
    return `<section class="section education-scope-section"><div class="container"><div class="section-head"><div><span class="eyebrow">Data Pendidikan Terstruktur</span><h2 class="section-title">Formulir mengikuti kebutuhan setiap jenjang</h2><p class="section-subtitle">Data yang dikumpulkan dibedakan agar pelajar dan mahasiswa hanya mengisi informasi yang relevan dengan tahap pendidikannya.</p></div></div><div class="grid grid-4">${items.map(([level,text]) => `<article class="feature-card education-level-card"><div class="feature-icon">${icon('graduation')}</div><span class="level-pill">${level}</span><h3>Data wajib ${level}</h3><p>${text}</p></article>`).join('')}</div></div></section>`;
  }

  function levelSpecificProfileFields(profile, level) {
    const commonLocation = `${fieldHTML('Kota/Kabupaten institusi', 'institutionCity', profile.institutionCity)}${fieldHTML('Provinsi institusi', 'institutionProvince', profile.institutionProvince)}`;
    if (level === 'SMA/SMK') return `<div class="form-section"><div class="form-section-head"><div>${icon('education')}<span><strong>Data Sekolah SMA/SMK</strong><small>Informasi sekolah dan status pendidikan aktif.</small></span></div></div><div class="form-grid">${fieldHTML('Nama sekolah', 'currentInstitution', profile.currentInstitution)}${fieldHTML('NPSN', 'npsn', profile.npsn)}${fieldHTML('Jurusan/Peminatan', 'program', profile.program)}${fieldHTML('NISN/Nomor Induk', 'studentNumber', profile.studentNumber)}${fieldHTML('Kelas saat ini', 'classLevel', profile.classLevel)}${fieldHTML('Tahun masuk', 'entryYear', profile.entryYear, 'number')}${fieldHTML('Perkiraan tahun lulus', 'expectedGraduationYear', profile.expectedGraduationYear, 'number')}${selectHTML('Status pendidikan', 'studyStatus', ['Calon','Aktif','Cuti','Lulus','Nonaktif/Keluar'], profile.studyStatus)}${commonLocation}</div></div>`;
    const current = `<div class="form-section"><div class="form-section-head"><div>${icon('education')}<span><strong>Data Pendidikan ${level}</strong><small>Data pendidikan utama yang sedang ditempuh.</small></span></div></div><div class="form-grid">${fieldHTML('Perguruan tinggi', 'currentInstitution', profile.currentInstitution)}${fieldHTML('Fakultas/Sekolah Pascasarjana', 'faculty', profile.faculty)}${fieldHTML('Program studi', 'program', profile.program)}${fieldHTML('NIM', 'studentNumber', profile.studentNumber)}${fieldHTML('Tahun masuk', 'entryYear', profile.entryYear, 'number')}${fieldHTML('Semester aktif', 'activeSemester', profile.activeSemester, 'number')}${fieldHTML('Target tahun lulus', 'targetGraduationYear', profile.targetGraduationYear, 'number')}${selectHTML('Status studi', 'studyStatus', ['Calon','Aktif','Cuti','Lulus','Nonaktif/Keluar'], profile.studyStatus)}${commonLocation}</div></div>`;
    const funding = `<div class="form-section compact-section"><div class="form-section-head"><div>${icon('scholarship')}<span><strong>Pembiayaan Studi</strong><small>Informasi pendukung untuk pemetaan kebutuhan pendidikan.</small></span></div></div><div class="form-grid">${fieldHTML('Sumber pembiayaan', 'fundingSource', profile.fundingSource)}${fieldHTML('Status beasiswa', 'scholarshipStatus', profile.scholarshipStatus)}</div></div>`;
    if (level === 'S1') return current + funding;
    const s1 = `<div class="form-section"><div class="form-section-head"><div>${icon('history')}<span><strong>Riwayat Pendidikan S1</strong><small>Wajib untuk jenjang ${level}.</small></span></div></div><div class="form-grid">${fieldHTML('Perguruan tinggi S1', 'priorS1Institution', profile.priorS1Institution)}${fieldHTML('Program studi S1', 'priorS1Program', profile.priorS1Program)}${fieldHTML('Tahun masuk S1', 'priorS1EntryYear', profile.priorS1EntryYear, 'number')}${fieldHTML('Tahun lulus S1', 'priorS1GraduationYear', profile.priorS1GraduationYear, 'number')}${fieldHTML('Gelar S1', 'priorS1Degree', profile.priorS1Degree)}${fieldHTML('IPK S1', 'priorS1Gpa', profile.priorS1Gpa)}</div></div>`;
    if (level === 'S2') return current + s1 + `<div class="form-section"><div class="form-section-head"><div>${icon('document')}<span><strong>Informasi Studi S2</strong><small>Informasi akademik pascasarjana.</small></span></div></div><div class="form-grid">${fieldHTML('Konsentrasi/minat studi', 'concentration', profile.concentration)}${fieldHTML('Judul/topik tesis', 'thesisTitle', profile.thesisTitle)}${fieldHTML('Status tesis', 'thesisStatus', profile.thesisStatus)}${fieldHTML('Dosen pembimbing', 'advisor', profile.advisor)}</div></div>` + funding;
    const s2 = `<div class="form-section"><div class="form-section-head"><div>${icon('history')}<span><strong>Riwayat Pendidikan S2</strong><small>Riwayat magister sebelum studi doktoral.</small></span></div></div><div class="form-grid">${fieldHTML('Perguruan tinggi S2', 'priorS2Institution', profile.priorS2Institution)}${fieldHTML('Program studi S2', 'priorS2Program', profile.priorS2Program)}${fieldHTML('Tahun lulus S2', 'priorS2GraduationYear', profile.priorS2GraduationYear, 'number')}${fieldHTML('Gelar S2', 'priorS2Degree', profile.priorS2Degree)}${fieldHTML('Judul tesis S2', 'priorS2ThesisTitle', profile.priorS2ThesisTitle)}</div></div>`;
    const research = `<div class="form-section"><div class="form-section-head"><div>${icon('scope')}<span><strong>Akademik & Riset S3</strong><small>Data penelitian doktoral dan progres akademik.</small></span></div></div><div class="form-grid">${fieldHTML('Konsentrasi', 'concentration', profile.concentration)}${fieldHTML('Bidang penelitian', 'researchField', profile.researchField)}${fieldHTML('Topik penelitian doktoral', 'researchTopic', profile.researchTopic)}${fieldHTML('Judul disertasi', 'dissertationTitle', profile.dissertationTitle)}${fieldHTML('Promotor', 'promoter', profile.promoter)}${fieldHTML('Ko-promotor', 'coPromoter', profile.coPromoter)}${fieldHTML('Status proposal', 'proposalStatus', profile.proposalStatus)}${fieldHTML('Status penelitian', 'researchStatus', profile.researchStatus)}${fieldHTML('Status disertasi', 'dissertationStatus', profile.dissertationStatus)}${fieldHTML('Publikasi ilmiah', 'publications', profile.publications)}${fieldHTML('Seminar/konferensi', 'conferences', profile.conferences)}${fieldHTML('ORCID', 'orcid', profile.orcid)}${fieldHTML('Google Scholar', 'googleScholar', profile.googleScholar)}</div></div>`;
    return current + s1 + s2 + research + funding;
  }

  function profilePageLegacy() {
    const user = session.user(); const profile = currentProfile();
    if (!profile) return appLayout('<div class="empty">Profil belum tersedia.</div>', 'profile');
    profile.completeness = profileCompleteness(profile, user.educationLevel);
    const missingFields = requiredProfileKeys(user.educationLevel).filter(key => !String(profile[key] ?? '').trim()).length;
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('graduation')} ${esc(user.educationLevel)}</span><h2>Profil Pendidikan</h2><p>Lengkapi data wajib sesuai jenjang. Perubahan data akademik utama pada profil terverifikasi akan memicu verifikasi ulang.</p></div>${badge(profile.profileStatus)}</div>
      <div class="profile-completeness-panel"><div><strong>${profile.completeness}%</strong><span>Kelengkapan data wajib</span></div><div class="progress"><span style="width:${profile.completeness}%"></span></div><small>${missingFields ? `${missingFields} data wajib masih perlu dilengkapi.` : 'Seluruh data wajib profil telah lengkap.'}</small></div>
      ${profile.profileStatus === 'needs_revision' ? `<div class="info-callout warn-callout mb-3"><strong>Perlu perbaikan:</strong> ${esc(profile.lastReviewNote || 'Periksa kembali data Anda.')}</div>` : ''}
      <form id="profile-form" class="panel stack profile-form"><div class="form-section"><div class="form-section-head"><div>${icon('user')}<span><strong>Identitas & Asal Wilayah</strong><small>Data inti pelajar/mahasiswa dan domisili saat ini.</small></span></div></div><div class="form-grid">${fieldHTML('Nama lengkap', 'fullName', profile.fullName)}${selectHTML('Jenis kelamin', 'gender', ['Laki-laki','Perempuan'], profile.gender)}${fieldHTML('Tempat lahir', 'birthPlace', profile.birthPlace)}${fieldHTML('Tanggal lahir', 'birthDate', profile.birthDate, 'date')}${fieldHTML('Provinsi asal', 'originProvince', profile.originProvince)}${fieldHTML('Kabupaten asal', 'originRegency', profile.originRegency)}${fieldHTML('Distrik asal', 'originDistrict', profile.originDistrict)}${fieldHTML('Kampung asal', 'originVillage', profile.originVillage)}${fieldHTML('Kota/Kabupaten domisili', 'domicileCity', profile.domicileCity)}${fieldHTML('Provinsi domisili', 'domicileProvince', profile.domicileProvince)}${fieldHTML('Nomor HP aktif', 'phone', profile.phone)}${fieldHTML('Email aktif', 'email', profile.email, 'email')}</div></div>
      ${levelSpecificProfileFields(profile, user.educationLevel)}
      <div class="sticky-actions"><button class="btn btn-secondary" type="button" data-action="save-profile">${icon('check')}<span>Simpan perubahan</span></button><button class="btn btn-primary" type="button" data-action="submit-verification" ${profile.completeness < 100 ? 'disabled' : ''}>${icon('verify')}<span>Ajukan verifikasi</span></button></div></form>`, 'profile');
  }

  function saveProfileLegacy(showToast = true) {
    const form = document.getElementById('profile-form'); const profile = currentProfile(); const user = session.user();
    if (!form || !profile || !user || !ensureAuthenticated(['user'])) return;
    const fd = new FormData(form);
    const materialKeys = ['currentInstitution','program','faculty','studentNumber','entryYear','activeSemester','studyStatus','institutionCity','institutionProvince'];
    const beforeMaterial = materialKeys.map(key => profile[key] ?? '').join('|');
    const fields = ['fullName','gender','birthPlace','birthDate','originProvince','originRegency','originDistrict','originVillage','domicileCity','domicileProvince','email','phone','currentInstitution','program','studentNumber','entryYear','studyStatus','institutionCity','institutionProvince','npsn','classLevel','expectedGraduationYear','faculty','activeSemester','targetGraduationYear','priorS1Institution','priorS1Program','priorS1EntryYear','priorS1GraduationYear','priorS1Degree','priorS1Gpa','priorS2Institution','priorS2Program','priorS2GraduationYear','priorS2Degree','priorS2ThesisTitle','concentration','thesisTitle','thesisStatus','advisor','fundingSource','scholarshipStatus','researchTopic','dissertationTitle','researchField','promoter','coPromoter','proposalStatus','researchStatus','dissertationStatus','publications','conferences','orcid','googleScholar'];
    fields.forEach(key => { const value = fd.get(key); if (value !== null) profile[key] = String(value).trim(); });
    profile.level = user.educationLevel;
    user.name = profile.fullName || user.name; user.phone = profile.phone || user.phone; user.email = profile.email || user.email;
    profile.completeness = profileCompleteness(profile, user.educationLevel);
    const afterMaterial = materialKeys.map(key => profile[key] ?? '').join('|');
    if (profile.profileStatus === 'verified' && beforeMaterial !== afterMaterial) { profile.profileStatus = 'draft'; profile.lastReviewNote = 'Data pendidikan utama berubah. Verifikasi ulang diperlukan.'; audit(user.name,'PERUBAHAN_DATA_TERVERIFIKASI',`profil:${profile.id}`,'Data material berubah dan status dikembalikan menjadi draf.'); }
    save(); if (showToast) toast(`Profil tersimpan. Kelengkapan data wajib ${profile.completeness}%.`, 'success');
  }

  async function uploadDocumentAction() {
    const type = document.getElementById('doc-type')?.value;
    const file = document.getElementById('doc-file')?.files?.[0];
    if (!file) return toast('Pilih berkas terlebih dahulu.', 'error');
    if (!validDocumentFile(file)) return toast('Jenis berkas tidak didukung. Gunakan dokumen, gambar, spreadsheet, presentasi, teks, CSV, ODT, atau ODS.', 'error');
    const user = session.user();
    const id = uid();
    try { await fileStore.put(documentFileKey(id), file); }
    catch (_) { return toast('Berkas tidak dapat disimpan. Periksa kapasitas penyimpanan browser/perangkat.', 'error'); }
    db = store.load();
    db.documents.unshift({ id, userId:user.id, type, filename:file.name, mimeType:file.type || 'application/octet-stream', fileSize:file.size, status:'pending_review', updatedAt:now(), submittedAt:now(), note:'Dokumen dikirim dan menunggu pemeriksaan.', reviewNote:'', reviewHistory:[] });
    notifyStaff(['operator','admin','superadmin'], 'Dokumen pendidikan baru', `${user.name} mengirim ${type} untuk diperiksa.`, 'info', 'students', user.id);
    save(); audit(user.name, 'UNGGAH_DOKUMEN', `dokumen:${id}`, `${type}; ${file.name}; ${formatBytes(file.size)}`); render();
    toast('Dokumen berhasil dikirim untuk pemeriksaan.', 'success');
  }

  function selectReplacementFile(id) {
    const doc = db.documents.find(item => item.id === Number(id));
    const user = session.user();
    if (!doc || doc.userId !== user?.id || doc.status !== 'rejected') return;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods';
    picker.style.display = 'none';
    picker.addEventListener('change', () => {
      const file = picker.files?.[0]; picker.remove();
      if (!file) return;
      if (!validDocumentFile(file)) return toast('Jenis berkas tidak didukung.', 'error');
      pendingReplacementFiles.set(doc.id, file); render();
      toast('File pengganti dipilih. Klik “Kirim dokumen pengganti” untuk mengirim.', 'success');
    }, { once:true });
    document.body.appendChild(picker); picker.click();
  }

  async function sendReplacementDocument(id) {
    const doc = db.documents.find(item => item.id === Number(id));
    const user = session.user();
    const file = pendingReplacementFiles.get(Number(id));
    if (!doc || doc.userId !== user?.id || doc.status !== 'rejected') return;
    if (!file) return toast('Pilih file pengganti terlebih dahulu.', 'error');
    try { await fileStore.put(documentFileKey(doc.id), file); }
    catch (_) { return toast('File pengganti tidak dapat disimpan. Periksa kapasitas penyimpanan browser/perangkat.', 'error'); }
    db = store.load();
    const live = db.documents.find(item => item.id === Number(id)); if (!live) return;
    live.reviewHistory = reviewHistory(live);
    live.previousReviewNote = latestReview(live)?.note || live.reviewNote || live.note || '';
    live.filename = file.name; live.mimeType = file.type || 'application/octet-stream'; live.fileSize = file.size;
    live.status = 'pending_review'; live.updatedAt = now(); live.submittedAt = now();
    live.note = 'Dokumen pengganti telah dikirim dan menunggu pemeriksaan ulang.';
    live.replacementVersion = Number(live.replacementVersion || 0) + 1;
    pendingReplacementFiles.delete(Number(id));
    notifyStaff(['operator','admin','superadmin'], 'Dokumen pengganti masuk', `${user.name} mengirim ulang ${live.type}.`, 'warning', 'students', user.id);
    save(); audit(user.name, 'KIRIM_ULANG_DOKUMEN', `dokumen:${live.id}`, `${live.type}; ${file.name}; versi ${live.replacementVersion}`); render();
    toast('Dokumen pengganti berhasil dikirim untuk pemeriksaan ulang.', 'success');
  }

  function deleteDocumentPrompt(id) {
    const doc = db.documents.find(item => item.id === Number(id)); const user = session.user();
    if (!doc || doc.userId !== user?.id) return;
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('trash')} Hapus Dokumen</span><h3>Hapus ${esc(doc.type)}?</h3><p class="small muted">${esc(doc.filename)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><div class="info-callout warn-callout"><strong>Dokumen akan dihapus dari daftar Anda.</strong><span>Jika dokumen ini termasuk persyaratan wajib, status kelengkapan akan berubah dan Anda perlu mengunggah kembali sebelum verifikasi.</span></div><div class="modal-actions mt-3"><button class="btn btn-secondary" data-action="close-modal">Batal</button><button class="btn btn-danger" data-action="confirm-delete-document" data-id="${doc.id}">${icon('trash')}<span>Hapus dokumen</span></button></div>`);
  }

  async function deleteDocumentConfirmed(id) {
    const user = session.user(); const doc = db.documents.find(item => item.id === Number(id));
    if (!doc || doc.userId !== user?.id) return;
    await fileStore.delete(documentFileKey(doc.id)).catch(() => {});
    db = store.load();
    const index = db.documents.findIndex(item => item.id === Number(id) && item.userId === user.id); if (index < 0) return;
    const [removed] = db.documents.splice(index, 1);
    pendingReplacementFiles.delete(Number(id));
    const profile = db.profiles.find(item => item.userId === user.id);
    const required = requiredDocumentsForLevel(user.educationLevel);
    if (profile && required.includes(removed.type) && profile.profileStatus === 'verified') {
      profile.profileStatus = 'needs_revision';
      profile.lastReviewNote = `Dokumen wajib ${removed.type} dihapus dan perlu dikirim ulang untuk verifikasi.`;
    }
    notifyStaff(['operator','admin','superadmin'], 'Dokumen pengguna dihapus', `${user.name} menghapus ${removed.type}.`, 'warning', 'students', user.id);
    save();
    audit(user.name, 'HAPUS_DOKUMEN', `dokumen:${removed.id}`, `${removed.type}; ${removed.filename}`);
    closeModal(); render();
    toast('Dokumen berhasil dihapus.', 'success');
  }

  async function openDocumentFile(id) {
    const doc = db.documents.find(item => item.id === Number(id)); const actor = session.user();
    const own = actor?.role === 'user' && doc?.userId === actor.id;
    if (!doc || (!own && !canReviewStudent(doc.userId))) return toast('Anda tidak memiliki akses ke dokumen ini.', 'error');
    const previewWindow = typeof window.open === 'function' ? window.open('about:blank', '_blank') : null;
    let file = null; try { file = await fileStore.get(documentFileKey(doc.id)); } catch (_) {}
    if (!file) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      return toast('Berkas fisik belum tersedia pada penyimpanan browser ini. Unggah atau kirim ulang berkas untuk mengaktifkan pratinjau.', 'error');
    }
    const url = URL.createObjectURL(file);
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = url;
    } else {
      const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.download = doc.filename || 'dokumen'; document.body.appendChild(link); link.click(); link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    audit(actor.name, 'BUKA_DOKUMEN', `dokumen:${doc.id}`, `${doc.type}; ${doc.filename}`);
  }

  function openUserNotification(id) {
    const user = session.user();
    const item = db.notifications.find(row => row.id === Number(id) && row.userId === user?.id); if (!item) return;
    item.read = true; save();
    if (item.targetHref) { location.hash = item.targetHref; return; }
    location.hash = `#/user/${item.targetSection || 'notifications'}`;
  }

  function deleteNotification(id) {
    const user = session.user();
    const index = db.notifications.findIndex(item => item.id === Number(id) && item.userId === user?.id); if (index < 0) return;
    const [removed] = db.notifications.splice(index,1); save();
    audit(user.name, 'HAPUS_NOTIFIKASI', `notifikasi:${removed.id}`, removed.title); render(); toast('Notifikasi berhasil dihapus.', 'success');
  }

  function downloadNotifications() {
    const user=session.user(); const rows=db.notifications.filter(item=>item.userId===user?.id).slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    const body=htmlTable(['No','Judul','Pesan','Waktu','Status'],rows.map((item,index)=>[index+1,item.title,item.message,`${fmtDate(item.createdAt,true)} WIT`,item.read?'Dibaca':'Baru']));
    const html=brandedExcelDocument({title:'Riwayat Notifikasi',subtitle:'Pemberitahuan akun Pelajar/Mahasiswa',description:'Riwayat pesan sistem terkait profil, dokumen, verifikasi, beasiswa, dan pengingat.',meta:[['Pengguna',user.name],['Jenjang',user.educationLevel||'-'],['Waktu unduh',`${fmtDate(now(),true)} WIT`],['Jumlah notifikasi',rows.length]],body});
    downloadBlob('talenta-nduga-notifikasi.xls',new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'})); audit(user.name,'UNDUH_NOTIFIKASI',`pengguna:${user.id}`,`${rows.length} notifikasi`); toast('Tabel notifikasi berhasil diunduh.','success');
  }

function documentsPage() {
    const user = session.user();
    const docs = currentDocuments().slice().sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    const required = requiredDocumentsForLevel(user.educationLevel);
    const missing = missingRequiredDocuments(user.educationLevel, docs);
    const base = user.educationLevel === 'SMA/SMK'
      ? ['Kartu Pelajar','Surat Keterangan Aktif Sekolah','Rapor','KTP','KK','Ijazah/SKL','Surat Lain']
      : user.educationLevel === 'S1'
        ? ['Kartu Mahasiswa','Surat Aktif Kuliah','Transkrip','Ijazah SMA/SMK','KTP','KK','Surat Lain']
        : user.educationLevel === 'S2'
          ? ['Kartu Mahasiswa','Surat Aktif Kuliah','Transkrip','Ijazah S1','Transkrip S1','KTP','KK','LoA','Bukti Beasiswa','Surat Lain']
          : ['Kartu Mahasiswa','Surat Aktif Kuliah','Transkrip','Ijazah S2','Transkrip S2','Ijazah S1','Proposal Penelitian','KTP','KK','LoA','Bukti Beasiswa','Surat Lain'];

    const rows = docs.length ? docs.map(doc => {
      const review = latestReview(doc);
      const pending = pendingReplacementFiles.get(doc.id);
      const note = review?.note || doc.reviewNote || (doc.status === 'pending_review' ? 'Dokumen sedang menunggu pemeriksaan petugas.' : doc.note || 'Belum ada catatan pemeriksaan.');
      const reviewer = review?.reviewer || doc.reviewedBy || '';
      const canReplace = doc.status === 'rejected';
      return `<article class="student-document-card ${doc.status === 'rejected' ? 'document-needs-action' : ''}">
        <div class="student-document-main">
          <div class="student-document-icon">${icon('file')}</div>
          <div class="student-document-copy"><strong>${esc(doc.type)}</strong><span>${esc(doc.filename)}</span><small>${fmtDate(doc.updatedAt,true)}${doc.fileSize ? ` • ${formatBytes(doc.fileSize)}` : ''}</small></div>
        </div>
        <div class="student-document-status">${badge(doc.status)}</div>
        <div class="student-document-note">
          <span>Catatan pemeriksaan</span>
          <strong>${esc(note)}</strong>
          ${reviewer ? `<small>Oleh ${esc(reviewer)}${review?.reviewedAt ? ` • ${fmtDate(review.reviewedAt,true)}` : ''}</small>` : '<small>Belum ada catatan dari petugas.</small>'}
        </div>
        <div class="student-document-actions">
          <button class="icon-action-btn" data-action="open-document-file" data-id="${doc.id}" title="Buka / lihat dokumen" aria-label="Buka dokumen">${icon('eye')}</button>
          ${canReplace ? `<button class="btn btn-secondary btn-sm" data-action="select-replacement" data-id="${doc.id}">${icon('refresh')}<span>Ganti file</span></button>` : ''}
          <button class="icon-action-btn danger" data-action="delete-document" data-id="${doc.id}" title="Hapus dokumen" aria-label="Hapus dokumen">${icon('trash')}</button>
        </div>
        ${canReplace ? `<div class="replacement-box ${pending ? 'active' : ''}" id="replacement-box-${doc.id}">
          <div>${icon('file')}<span>${pending ? `<strong>${esc(pending.name)}</strong><small>${formatBytes(pending.size)} • siap dikirim</small>` : '<strong>Pilih file pengganti</strong><small>Klik “Ganti file”, pilih berkas dari perangkat, lalu kirim.</small>'}</span></div>
          <button class="btn btn-primary btn-sm" data-action="send-replacement" data-id="${doc.id}" ${pending ? '' : 'disabled'}>${icon('send')}<span>Kirim dokumen pengganti</span></button>
        </div>` : ''}
      </article>`;
    }).join('') : '<div class="empty">Belum ada dokumen.</div>';

    return appLayout(`<div class="dashboard-head student-premium-head"><div><span class="eyebrow">${icon('document')} Berkas Pendidikan</span><h2>Dokumen Pendidikan</h2><p>Kelola dokumen ${esc(user.educationLevel)}, lihat hasil pemeriksaan, dan kirim ulang berkas yang perlu diperbaiki.</p></div><div class="student-head-status">${missing.length ? `<span class="badge badge-warning">${missing.length} dokumen wajib belum lengkap</span>` : '<span class="badge badge-success">Dokumen wajib lengkap</span>'}</div></div>
      <div class="required-docs-bar premium-required-docs"><div><strong>Dokumen wajib ${esc(user.educationLevel)}</strong><span>${required.join(' • ')}</span></div>${missing.length ? `<span class="badge badge-warning">${missing.length} belum tersedia</span>` : '<span class="badge badge-success">Lengkap</span>'}</div>
      <div class="panel mt-3 premium-upload-panel"><div class="panel-head"><div><div class="panel-title">${icon('plus')} Unggah Dokumen</div><p class="small muted">Mendukung PDF, gambar, Word, Excel, PowerPoint, teks, CSV, ODT, dan ODS. Tidak ada batas ukuran dari aplikasi; kapasitas mengikuti penyimpanan browser/perangkat.</p></div></div><div class="doc-drop premium-doc-drop"><div class="form-grid"><div class="field"><label>Jenis dokumen</label><select id="doc-type" class="select">${base.map(type => `<option>${type}</option>`).join('')}</select></div><div class="field"><label>Pilih berkas</label><input id="doc-file" type="file" class="input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods"></div></div><button class="btn btn-primary mt-2" data-action="upload-document">${icon('send')}<span>Kirim dokumen</span></button></div></div>
      <div class="panel mt-3 student-documents-panel"><div class="panel-head"><div><div class="panel-title">${icon('document')} Dokumen Saya</div><p class="small muted">Catatan dari Operator, Administrator, atau Administrator Utama tampil langsung pada setiap dokumen.</p></div><span class="count-pill"><strong>${docs.length}</strong><span>dokumen</span></span></div><div class="student-document-list mt-2">${rows}</div></div>`, 'documents');
  }


  function userDashboard() {
    const user = session.user(), profile = currentProfile(), docs = currentDocuments();
    if (profile) profile.completeness = profileCompleteness(profile,user.educationLevel);
    const missingDocs = missingRequiredDocuments(user.educationLevel, docs);
    const savedCount = db.bookmarks.filter(item => item.userId === user.id).length; const reminderCount = db.reminders.filter(item => item.userId === user.id && item.status === 'scheduled').length;
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('graduation')} ${esc(user.educationLevel)}</span><h2>Selamat datang, ${esc(user.name.split(' ')[0])}</h2><p>Pantau kelengkapan data wajib, dokumen, beasiswa, dan progres verifikasi dari satu dasbor.</p></div>${badge(profile?.profileStatus || 'draft')}</div><div class="metrics">${metric('Kelengkapan Profil',`${profile?.completeness || 0}%`, profile?.completeness === 100 ? 'Data wajib lengkap' : 'Lengkapi data wajib')}${metric('Dokumen Wajib',`${requiredDocumentsForLevel(user.educationLevel).length - missingDocs.length}/${requiredDocumentsForLevel(user.educationLevel).length}`, missingDocs.length ? `${missingDocs.length} perlu dilengkapi` : 'Dokumen minimum lengkap')}${metric('Beasiswa Tersimpan',savedCount,'Peluang yang disimpan')}${metric('Pengingat Aktif',reminderCount,'Batas waktu terjadwal')}</div><div class="app-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">Ringkasan Pendidikan</div><p class="small muted">Jenjang aktif: ${esc(user.educationLevel)}</p></div><a class="btn btn-secondary btn-sm" href="#/user/profile">${icon('edit')}<span>Perbarui profil</span></a></div><div class="profile-summary mt-3"><div><span class="small muted">Institusi</span><strong>${esc(profile?.currentInstitution || 'Belum diisi')}</strong></div><div><span class="small muted">Program/Jurusan</span><strong>${esc(profile?.program || 'Belum diisi')}</strong></div><div><span class="small muted">Status Studi</span><strong>${esc(profile?.studyStatus || 'Belum diisi')}</strong></div></div></section><aside class="panel"><div class="panel-title">Prioritas Berikutnya</div><div class="list mt-2">${profile?.completeness < 100 ? `<div class="list-row attention"><div class="list-row-main"><strong>Lengkapi profil</strong><span>Seluruh data wajib harus lengkap sebelum verifikasi.</span></div><a class="btn btn-secondary btn-sm" href="#/user/profile">Buka</a></div>` : ''}${missingDocs.length ? `<div class="list-row attention"><div class="list-row-main"><strong>Lengkapi dokumen</strong><span>${esc(missingDocs.join(', '))}</span></div><a class="btn btn-secondary btn-sm" href="#/user/documents">Buka</a></div>` : ''}<div class="list-row"><div class="list-row-main"><strong>Beasiswa sesuai jenjang</strong><span>Temukan peluang untuk ${esc(user.educationLevel)}.</span></div><a class="btn btn-secondary btn-sm" href="#/beasiswa">Cari</a></div></div></aside></div>`, 'dashboard');
  }

  function studentRecords() {
    return visibleUsers().filter(user => user.role === 'user').map(user => ({ user, profile: db.profiles.find(p => p.userId === user.id) || {}, docs: db.documents.filter(d => d.userId === user.id) }));
  }
  function getFilteredStudents() {
    const q=(document.getElementById('students-search')?.value||'').toLowerCase(), level=document.getElementById('students-level')?.value||'', ps=document.getElementById('students-profile-status')?.value||'', ss=document.getElementById('students-study-status')?.value||'', district=document.getElementById('students-district')?.value||'', city=document.getElementById('students-city')?.value||'';
    return studentRecords().filter(({user,profile}) => (!q || `${user.name} ${user.email} ${user.phone} ${profile.currentInstitution||''} ${profile.program||''} ${profile.studentNumber||''}`.toLowerCase().includes(q)) && (!level || user.educationLevel===level) && (!ps || profile.profileStatus===ps) && (!ss || profile.studyStatus===ss) && (!district || profile.originDistrict===district) && (!city || profile.domicileCity===city));
  }
  function studentTable(rows) {
    return `<div class="panel student-table-panel"><div class="table-wrap"><table class="table student-table"><thead><tr><th>Nama</th><th>Jenjang</th><th>Asal</th><th>Institusi</th><th>Kelas/Semester</th><th>NISN/NIM</th><th>Status Studi</th><th>Status Profil</th><th>Lengkap</th><th>Aksi</th></tr></thead><tbody>${rows.map(({user,profile}) => `<tr><td><strong>${esc(user.name)}</strong><span class="table-sub">${esc(user.email)}</span></td><td><span class="level-pill">${esc(user.educationLevel)}</span></td><td>${esc(profile.originDistrict||'—')}<span class="table-sub">${esc(profile.originVillage||'—')}</span></td><td>${esc(profile.currentInstitution||'—')}<span class="table-sub">${esc(profile.program||'—')}</span></td><td>${esc(user.educationLevel==='SMA/SMK' ? profile.classLevel||'—' : profile.activeSemester ? `Semester ${profile.activeSemester}` : '—')}</td><td>${esc(profile.studentNumber||'—')}</td><td>${esc(profile.studyStatus||'—')}</td><td>${badge(profile.profileStatus||'draft')}</td><td><strong>${profileCompleteness(profile,user.educationLevel)}%</strong></td><td><button class="btn btn-secondary btn-sm" data-action="view-user" data-id="${user.id}">${icon('eye')}<span>Rincian</span></button></td></tr>`).join('')}</tbody></table></div><div class="student-card-list">${rows.map(({user,profile}) => `<article class="student-card"><div class="student-card-head"><div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div><span class="level-pill">${esc(user.educationLevel)}</span></div><div class="student-card-grid"><span><b>Asal</b>${esc(profile.originDistrict||'—')}, ${esc(profile.originVillage||'—')}</span><span><b>Institusi</b>${esc(profile.currentInstitution||'—')}</span><span><b>Nomor</b>${esc(profile.studentNumber||'—')}</span><span><b>Status</b>${esc(profile.studyStatus||'—')}</span></div><button class="btn btn-secondary btn-sm btn-block" data-action="view-user" data-id="${user.id}">${icon('eye')}<span>Lihat data lengkap</span></button></article>`).join('')}</div></div>`;
  }
  function studentsManagementPageLegacy(role) {
    const rows=getFilteredStudents(); const all=studentRecords(); const districts=[...new Set(all.map(x=>x.profile.originDistrict).filter(Boolean))].sort(); const cities=[...new Set(all.map(x=>x.profile.domicileCity).filter(Boolean))].sort();
    return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('graduation')} Data Pendidikan</span><h2>Pelajar & Mahasiswa</h2><p>Data terstruktur SMA/SMK, S1, S2, dan S3 sesuai ruang lingkup akses ${esc(roleLabel(session.user()))}. Operator hanya melihat cakupan penugasan; Administrator dan Administrator Utama melihat data pendidikan yang diizinkan.</p></div><div class="count-pill"><strong id="students-count">${rows.length}</strong><span>data</span></div></div><div class="metrics compact-metrics">${LEVELS.map(l=>metric(l,all.filter(x=>x.user.educationLevel===l).length,'terdaftar')).join('')}</div><div class="panel filter-panel students-filter-panel"><div class="filter-heading"><div>${icon('filter')}<span><strong>Penyaringan Data</strong><small>Gunakan kombinasi filter untuk menemukan data yang dibutuhkan.</small></span></div><button class="btn btn-ghost btn-sm" data-action="reset-student-filters">${icon('refresh')}<span>Atur ulang</span></button></div><div class="filters students-filters"><div class="search-field">${icon('search')}<input id="students-search" class="input" placeholder="Cari nama, email, institusi, program, NISN/NIM"></div><select id="students-level" class="select"><option value="">Semua jenjang</option>${LEVELS.map(l=>`<option>${l}</option>`).join('')}</select><select id="students-profile-status" class="select"><option value="">Semua status profil</option><option value="draft">Draf</option><option value="submitted">Diajukan</option><option value="in_review">Dalam Peninjauan</option><option value="needs_revision">Perlu Perbaikan</option><option value="verified">Terverifikasi</option></select><select id="students-study-status" class="select"><option value="">Semua status studi</option>${['Calon','Aktif','Cuti','Lulus','Nonaktif/Keluar'].map(v=>`<option>${v}</option>`).join('')}</select><select id="students-district" class="select"><option value="">Semua distrik</option>${districts.map(v=>`<option>${esc(v)}</option>`).join('')}</select><select id="students-city" class="select"><option value="">Semua domisili</option>${cities.map(v=>`<option>${esc(v)}</option>`).join('')}</select></div>${canExport()?`<div class="export-bar premium-export"><div class="field export-purpose"><label>Tujuan unduhan</label><input id="students-export-purpose" class="input" placeholder="Contoh: rekap pelajar dan mahasiswa Oktober 2026"></div><div class="export-actions"><button class="btn btn-primary" data-action="export-students-pdf">${icon('filePdf')}<span>PDF ber-watermark</span></button><button class="btn btn-secondary" data-action="export-students-excel">${icon('fileExcel')}<span>Excel ber-watermark</span></button></div></div>`:''}</div><div id="students-results" class="mt-3">${studentTable(rows)}</div>`, 'students');
  }
  function filterStudentsManagement() { const rows=getFilteredStudents(); const target=document.getElementById('students-results'); if(target) target.innerHTML=studentTable(rows); const count=document.getElementById('students-count'); if(count) count.textContent=rows.length; }
  function resetStudentFilters() { ['students-search','students-level','students-profile-status','students-study-status','students-district','students-city'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';}); filterStudentsManagement(); }

  function studentDetailGroups(profile, level) {
    const groups=[['Identitas & Wilayah',[['Nama lengkap',profile.fullName],['Jenis kelamin',profile.gender],['Tempat/Tanggal lahir',`${profile.birthPlace||'—'} / ${profile.birthDate||'—'}`],['Asal',`${profile.originProvince||'—'} • ${profile.originRegency||'—'} • ${profile.originDistrict||'—'} • ${profile.originVillage||'—'}`],['Domisili',`${profile.domicileCity||'—'} • ${profile.domicileProvince||'—'}`],['Kontak',`${profile.phone||'—'} • ${profile.email||'—'}`]]]];
    const academic=[['Institusi',profile.currentInstitution],['Program/Jurusan',profile.program],['NISN/NIM',profile.studentNumber],['Tahun masuk',profile.entryYear],['Status studi',profile.studyStatus],['Lokasi institusi',`${profile.institutionCity||'—'} • ${profile.institutionProvince||'—'}`]];
    if(level==='SMA/SMK') academic.splice(1,0,['NPSN',profile.npsn],['Kelas',profile.classLevel],['Target lulus',profile.expectedGraduationYear]); else academic.splice(1,0,['Fakultas',profile.faculty],['Semester aktif',profile.activeSemester],['Target lulus',profile.targetGraduationYear]); groups.push([`Pendidikan ${level}`,academic]);
    if(['S2','S3'].includes(level)) groups.push(['Riwayat S1',[['Perguruan tinggi',profile.priorS1Institution],['Program studi',profile.priorS1Program],['Tahun masuk/lulus',`${profile.priorS1EntryYear||'—'} / ${profile.priorS1GraduationYear||'—'}`],['Gelar/IPK',`${profile.priorS1Degree||'—'} / ${profile.priorS1Gpa||'—'}`]]]);
    if(level==='S3') groups.push(['Riwayat S2',[['Perguruan tinggi',profile.priorS2Institution],['Program studi',profile.priorS2Program],['Tahun lulus',profile.priorS2GraduationYear],['Gelar',profile.priorS2Degree],['Judul tesis',profile.priorS2ThesisTitle]]]);
    if(level==='S2') groups.push(['Studi Pascasarjana',[['Konsentrasi',profile.concentration],['Judul tesis',profile.thesisTitle],['Status tesis',profile.thesisStatus],['Pembimbing',profile.advisor],['Sumber pembiayaan',profile.fundingSource],['Status beasiswa',profile.scholarshipStatus]]]);
    if(level==='S3') groups.push(['Riset Doktoral',[['Konsentrasi',profile.concentration],['Bidang riset',profile.researchField],['Topik penelitian',profile.researchTopic],['Judul disertasi',profile.dissertationTitle],['Promotor',profile.promoter],['Ko-promotor',profile.coPromoter],['Status proposal',profile.proposalStatus],['Status penelitian',profile.researchStatus],['Status disertasi',profile.dissertationStatus],['Publikasi',profile.publications],['Konferensi',profile.conferences],['ORCID',profile.orcid],['Google Scholar',profile.googleScholar],['Pembiayaan',`${profile.fundingSource||'—'} • ${profile.scholarshipStatus||'—'}`]]]);
    return groups;
  }
function viewUserModal(id) {
    const user = visibleUsers().find(u => u.id === Number(id));
    if (!user || user.role !== 'user') return;
    const profile = db.profiles.find(p => p.userId === user.id) || {};
    const docs = db.documents.filter(d => d.userId === user.id);
    const groups = studentDetailGroups(profile, user.educationLevel);
    const readiness = studentVerificationReadiness(user, profile, docs);
    const reviewer = canReviewStudent(user.id);
    const queue = db.verificationQueue.find(item => item.userId === user.id);
    const documentCards = docs.length ? docs.map(d => {
      const review = latestReview(d);
      return `<article class="document-review-card premium-review-card">
        <div class="document-review-main"><div class="document-review-fileicon">${icon('file')}</div><div><strong>${esc(d.type)}</strong><span>${esc(d.filename)}</span><small>${fmtDate(d.updatedAt,true)}${d.fileSize ? ` • ${formatBytes(d.fileSize)}` : ''}</small></div></div>
        <div class="document-review-note"><span>Catatan pemeriksaan</span><strong>${esc(review?.note || d.reviewNote || d.note || 'Belum ada catatan pemeriksaan.')}</strong>${review?.reviewer ? `<small>${esc(review.reviewer)} • ${fmtDate(review.reviewedAt,true)}</small>` : ''}</div>
        <div class="document-review-status">${badge(d.status)}<button class="btn btn-ghost btn-sm" data-action="open-document-file" data-id="${d.id}">${icon('eye')}<span>Lihat berkas</span></button><button class="btn btn-secondary btn-sm" data-action="inspect-document" data-id="${d.id}">${icon('verify')}<span>Periksa</span></button></div>
      </article>`;
    }).join('') : '<div class="empty">Belum ada dokumen.</div>';
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('graduation')} ${esc(user.educationLevel)}</span><h3>${esc(user.name)}</h3><p class="small muted">Pemeriksaan menyeluruh identitas, pendidikan, dokumen, dan riwayat catatan verifikasi.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <div class="student-detail-summary">
        <div><span>Kelengkapan data</span><strong>${readiness.completeness}%</strong></div>
        <div><span>Status profil</span>${badge(profile.profileStatus || 'draft')}</div>
        <div><span>Dokumen wajib</span><strong>${requiredDocumentsForLevel(user.educationLevel).length - readiness.missing.length}/${requiredDocumentsForLevel(user.educationLevel).length}</strong></div>
        <div><span>Siap diverifikasi</span><strong class="${readiness.ready ? 'text-success' : 'text-warning'}">${readiness.ready ? 'Ya' : 'Belum'}</strong></div>
      </div>
      ${!readiness.ready ? `<div class="info-callout warn-callout mt-3"><strong>${icon('warning')} Pemeriksaan belum selesai</strong><span>${readiness.completeness < 100 ? `Data wajib baru ${readiness.completeness}%. ` : ''}${readiness.missing.length ? `Dokumen belum tersedia: ${esc(readiness.missing.join(', '))}. ` : ''}${readiness.unverified.length ? `Dokumen belum terverifikasi: ${esc(readiness.unverified.join(', '))}.` : ''}</span></div>` : `<div class="info-callout success-callout mt-3"><strong>${icon('check')} Siap keputusan profil</strong><span>Seluruh data wajib lengkap dan seluruh dokumen minimum telah berstatus terverifikasi.</span></div>`}
      <div class="student-detail-groups mt-3">
        ${groups.map(([title,rows]) => `<section class="detail-section"><h4>${title}</h4><div class="detail-list">${rows.map(([k,v]) => `<div><span>${esc(k)}</span><strong>${esc(v || '—')}</strong></div>`).join('')}</div></section>`).join('')}
        <section class="detail-section document-review-section"><h4>Dokumen Wajib & Verifikasi</h4><p class="small muted">Buka berkas, periksa isi, lalu berikan keputusan dan catatan yang akan terlihat oleh pelajar/mahasiswa.</p><div class="document-status-grid">${documentCards}</div></section>
      </div>
      ${(()=>{const history=(db.verificationReviews||[]).filter(r=>r.studentId===user.id).slice(0,8);return history.length?`<section class="panel mt-3"><div class="panel-title">${icon('history')} Riwayat Keputusan Verifikasi</div><div class="review-history">${history.map(r=>`<div class="review-history-item"><div>${badge(r.decision)}</div><div><strong>${esc(r.reason||'Tanpa catatan')}</strong><span>${esc(ROLE_LABELS[r.reviewerRole]||r.reviewerRole||'Petugas')} • ${fmtDate(r.reviewedAt,true)} • snapshot ${esc(r.snapshotHash||'—')}</span></div></div>`).join('')}</div></section>`:''})()}
      ${reviewer ? `<section class="panel review-decision-panel mt-3"><div class="panel-title">${icon('verify')} Keputusan Verifikasi Profil</div><p class="small muted">Keputusan profil hanya dapat disetujui jika seluruh data wajib lengkap dan semua dokumen minimum telah diverifikasi.</p><div class="field"><label>Catatan verifikasi</label><textarea id="student-review-note-${user.id}" class="textarea" placeholder="Tulis catatan pemeriksaan">${esc(queue?.note || profile.lastReviewNote || '')}</textarea></div><div class="modal-actions"><button class="btn btn-secondary" data-action="request-student-revision" data-id="${user.id}">${icon('warning')}<span>Minta perbaikan</span></button><button class="btn btn-primary" data-action="verify-student-profile" data-id="${user.id}" ${readiness.ready ? '' : 'disabled'}>${icon('verify')}<span>Verifikasi profil</span></button></div></section>` : ''}
    `);
  }

function inspectDocumentModal(id) {
    const doc = db.documents.find(item => item.id === Number(id));
    if (!doc || !canReviewStudent(doc.userId)) return;
    const owner = db.users.find(item => item.id === doc.userId);
    const history = reviewHistory(doc);
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('document')} Pemeriksaan Dokumen</span><h3>${esc(doc.type)}</h3><p class="small muted">${esc(owner?.name || 'Pengguna')} • ${esc(owner?.educationLevel || '')}</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <div class="document-preview-box premium-document-preview"><div class="document-preview-icon">${icon('file')}</div><div><strong>${esc(doc.filename)}</strong><span>${doc.fileSize ? formatBytes(doc.fileSize) : 'Ukuran berkas belum tercatat'} • diperbarui ${fmtDate(doc.updatedAt,true)}</span><small>Gunakan tombol lihat berkas untuk membuka file yang tersimpan pada perangkat/browser ini.</small></div><button class="btn btn-secondary btn-sm" data-action="open-document-file" data-id="${doc.id}">${icon('eye')}<span>Lihat berkas</span></button></div>
      <div class="detail-list mt-3"><div><span>Jenis dokumen</span><strong>${esc(doc.type)}</strong></div><div><span>Status</span><strong>${esc(statusLabel(doc.status))}</strong></div><div><span>Catatan terakhir</span><strong>${esc(latestReview(doc)?.note || doc.reviewNote || doc.note || '—')}</strong></div></div>
      ${history.length ? `<div class="review-history mt-3"><div class="panel-title">${icon('history')} Riwayat pemeriksaan</div>${history.slice().reverse().map(item => `<div class="review-history-item"><div>${badge(item.status)}</div><div><strong>${esc(item.note || 'Tanpa catatan')}</strong><span>${esc(item.reviewer || 'Petugas verifikasi')} • ${fmtDate(item.reviewedAt,true)}</span></div></div>`).join('')}</div>` : ''}
      <div class="field mt-3"><label>Catatan pemeriksaan</label><textarea id="document-review-note-${doc.id}" class="textarea" placeholder="Tulis alasan jika dokumen ditolak atau perlu diperbaiki">${esc(latestReview(doc)?.note || doc.reviewNote || '')}</textarea></div>
      <div class="modal-actions"><button class="btn btn-secondary" data-action="set-document-status" data-status="rejected" data-id="${doc.id}">${icon('warning')}<span>Tolak / Perlu perbaikan</span></button><button class="btn btn-primary" data-action="set-document-status" data-status="verified" data-id="${doc.id}">${icon('verify')}<span>Verifikasi dokumen</span></button></div>`);
  }
function setDocumentReviewStatus(id, status) {
    const doc = db.documents.find(item => item.id === Number(id));
    if (!doc || !canReviewStudent(doc.userId) || !['verified','rejected'].includes(status)) return;
    const note = String(document.getElementById(`document-review-note-${doc.id}`)?.value || '').trim();
    if (status === 'rejected' && !note) return toast('Alasan penolakan/perbaikan wajib diisi.', 'error');
    const actor = session.user();
    const reviewedAt = now();
    const finalNote = note || 'Dokumen telah diperiksa dan diverifikasi.';
    doc.reviewHistory = reviewHistory(doc);
    doc.reviewHistory.push({ status, note:finalNote, reviewer:actor.name, reviewerRole:roleLabel(actor), reviewedAt });
    doc.status = status;
    doc.note = finalNote;
    doc.reviewNote = finalNote;
    doc.reviewedBy = actor.name;
    doc.reviewedAt = reviewedAt;
    doc.updatedAt = reviewedAt;
    if (status === 'rejected') {
      const profile = db.profiles.find(item => item.userId === doc.userId);
      if (profile) {
        profile.profileStatus = 'needs_revision';
        profile.lastReviewNote = finalNote;
      }
    }
    notifyUser(doc.userId, status === 'verified' ? 'Dokumen terverifikasi' : 'Dokumen perlu diperbaiki',
      `${doc.type}: ${finalNote}`, status === 'verified' ? 'success' : 'warning', 'documents', doc.id);
    save();
    audit(actor.name, status === 'verified' ? 'VERIFIKASI_DOKUMEN' : 'TOLAK_DOKUMEN', `dokumen:${doc.id}`, finalNote);
    closeModal();
    viewUserModal(doc.userId);
    toast(status === 'verified' ? 'Dokumen berhasil diverifikasi.' : 'Dokumen dikembalikan untuk perbaikan.', 'success');
  }


  function verifyStudentProfile(userId) {
    const user = db.users.find(item => item.id === Number(userId));
    const profile = db.profiles.find(item => item.userId === Number(userId));
    const docs = db.documents.filter(item => item.userId === Number(userId));
    if (!user || !profile || !canReviewStudent(user.id)) return;
    const readiness = studentVerificationReadiness(user, profile, docs);
    if (!readiness.ready) return toast('Profil belum dapat diverifikasi. Pastikan seluruh data wajib dan dokumen minimum sudah terverifikasi.', 'error');
    const note = String(document.getElementById(`student-review-note-${user.id}`)?.value || 'Data identitas, pendidikan, dan dokumen wajib telah diperiksa.').trim();
    createVerificationSnapshot(user.id,'verified',note);
    profile.profileStatus = 'verified';
    profile.lastReviewNote = note;
    let queue = db.verificationQueue.find(item => item.userId === user.id);
    if (!queue) {
      queue = { id: uid(), userId:user.id, userName:user.name, educationLevel:user.educationLevel, district:profile.originDistrict, institution:profile.currentInstitution, submittedAt:now(), slaHours:0 };
      db.verificationQueue.unshift(queue);
    }
    queue.status = 'verified';
    queue.note = note;
    notifyUser(user.id, 'Profil telah diverifikasi', note, 'success', 'profile');
    save();
    audit(session.user().name, 'VERIFIKASI_PROFIL', `pengguna:${user.id}`, note);
    closeModal();
    render();
    toast('Profil pelajar/mahasiswa berhasil diverifikasi.', 'success');
  }

  function requestStudentRevision(userId) {
    const user = db.users.find(item => item.id === Number(userId));
    const profile = db.profiles.find(item => item.userId === Number(userId));
    if (!user || !profile || !canReviewStudent(user.id)) return;
    const note = String(document.getElementById(`student-review-note-${user.id}`)?.value || '').trim();
    if (!note) return toast('Catatan perbaikan wajib diisi.', 'error');
    createVerificationSnapshot(user.id,'needs_revision',note);
    profile.profileStatus = 'needs_revision';
    profile.lastReviewNote = note;
    let queue = db.verificationQueue.find(item => item.userId === user.id);
    if (!queue) {
      queue = { id: uid(), userId:user.id, userName:user.name, educationLevel:user.educationLevel, district:profile.originDistrict, institution:profile.currentInstitution, submittedAt:now(), slaHours:0 };
      db.verificationQueue.unshift(queue);
    }
    queue.status = 'needs_revision';
    queue.note = note;
    notifyUser(user.id, 'Profil perlu diperbaiki', note, 'warning', 'profile');
    save();
    audit(session.user().name, 'MINTA_PERBAIKAN_PROFIL', `pengguna:${user.id}`, note);
    closeModal();
    render();
    toast('Permintaan perbaikan berhasil dikirim.', 'success');
  }


  function dashboardNotifications(user) {
    if (!user) return [];
    if (user.role === 'user') return db.notifications.filter(n => n.userId === user.id).map(n => ({ ...n, readBy: n.read ? [user.id] : [] }));
    return (db.staffNotifications || []).filter(n => n.roles?.includes(user.role));
  }
  function unreadDashboardCount(user) {
    return dashboardNotifications(user).filter(n => !(n.readBy || []).includes(user.id)).length;
  }
  function notifyUser(userId, title, message, type='info', targetSection='dashboard', targetId=null, targetHref='') {
    db.notifications.unshift({ id:uid(), userId, type, title, message, read:false, targetSection, targetId, targetHref, createdAt:now() });
  }
  function notifyStaff(roles, title, message, type='info', targetSection='students', targetId=null) {
    db.staffNotifications = db.staffNotifications || [];
    db.staffNotifications.unshift({ id:uid(), roles, title, message, type, targetSection, targetId, readBy:[], createdAt:now() });
  }

  function markDashboardNotificationsRead() {
    const user = session.user();
    if (!user) return;
    if (user.role === 'user') db.notifications.filter(n => n.userId === user.id).forEach(n => n.read = true);
    else (db.staffNotifications || []).filter(n => n.roles?.includes(user.role)).forEach(n => {
      n.readBy = n.readBy || [];
      if (!n.readBy.includes(user.id)) n.readBy.push(user.id);
    });
    save();
    notificationMenuOpen = false;
    render();
  }

  function openDashboardNotification(id) {
    const user = session.user();
    if (!user) return;
    let notification = null;
    if (user.role === 'user') {
      notification = db.notifications.find(n => n.id === Number(id) && n.userId === user.id);
      if (!notification) return;
      notification.read = true;
    } else {
      notification = (db.staffNotifications || []).find(n => n.id === Number(id) && n.roles?.includes(user.role));
      if (!notification) return;
      notification.readBy = notification.readBy || [];
      if (!notification.readBy.includes(user.id)) notification.readBy.push(user.id);
    }
    save();
    notificationMenuOpen = false;
    const targetHref = notification.targetHref || '';
    const targetSection = notification.targetSection || 'dashboard';
    const targetId = notification.targetId ? `/${notification.targetId}` : '';
    audit(user.name, 'BUKA_NOTIFIKASI', `notifikasi:${notification.id}`, notification.title);
    const nextHash = targetHref || `#/${user.role}/${targetSection}${targetId}`;
    if (location.hash === nextHash) render();
    else location.hash = nextHash;
  }



  const TRAFFIC_VISITOR_KEY='talenta_nduga_visitor_v1';
  function recordTrafficView(hash,user) {
    if(!db.trafficAnalytics) return; let visitor=localStorage.getItem(TRAFFIC_VISITOR_KEY); const isNewVisitor=!visitor; if(!visitor){visitor=`v-${uid()}`;localStorage.setItem(TRAFFIC_VISITOR_KEY,visitor);} const stamp=Date.now(); const last=Number(sessionStorage.getItem('talenta_nduga_last_traffic_time')||0); const lastPath=sessionStorage.getItem('talenta_nduga_last_traffic_path')||''; if(lastPath===hash&&stamp-last<12000)return; sessionStorage.setItem('talenta_nduga_last_traffic_time',String(stamp));sessionStorage.setItem('talenta_nduga_last_traffic_path',hash); db.trafficAnalytics.trafficEvents=db.trafficAnalytics.trafficEvents||[]; const sid=sessionStorage.getItem('talenta_nduga_traffic_session')||`s-${uid()}`;sessionStorage.setItem('talenta_nduga_traffic_session',sid);let source='Langsung';try{const ref=document.referrer||'';if(ref&& !ref.includes(location.host))source=new URL(ref).hostname;}catch(_){} db.trafficAnalytics.trafficEvents.push({id:uid(),visitorId:visitor,visitor,sessionId:sid,timestamp:new Date(stamp).toISOString(),path:hash||'#/',area:user?'internal':'public',role:user?.role||'visitor',device:window.innerWidth&&window.innerWidth<768?'Seluler':'Desktop',source,isNewVisitor}); const retention=Math.max(7,Number(db.systemSettings?.trafficRetentionDays||365)); db.trafficAnalytics.trafficEvents=db.trafficAnalytics.trafficEvents.filter(x=>stamp-new Date(x.timestamp).getTime()<retention*86400000).slice(-4000); save();
  }
  function liveTrafficEvents(minutes=30){const cutoff=Date.now()-minutes*60000;return (db.trafficAnalytics?.trafficEvents||[]).filter(x=>new Date(x.timestamp).getTime()>=cutoff);}
  function trafficSeriesLegacy(period='day'){return db.trafficAnalytics?.[period]||[];}
  function trafficPeriodLabel(period){return {hour:'Per Jam',day:'Per Hari',week:'Per Minggu',month:'Per Bulan',year:'Per Tahun'}[period]||'Per Hari';}
  function trafficSummary(period='day'){const rows=trafficSeries(period);return rows.reduce((acc,row)=>{acc.visitors+=Number(row.visitors||0);acc.sessions+=Number(row.sessions||0);acc.views+=Number(row.views||0);acc.newVisitors+=Number(row.newVisitors||0);return acc;},{visitors:0,sessions:0,views:0,newVisitors:0});}
  function trafficBars(period='day'){const rows=trafficSeries(period);const max=Math.max(1,...rows.map(x=>Number(x.visitors||0)));return `<div class="traffic-bars">${rows.map(row=>`<div class="traffic-bar-wrap" title="${esc(row.label)}: ${row.visitors} pengunjung"><div class="traffic-bar" style="height:${Math.max(4,Math.round((row.visitors/max)*100))}%"></div><small>${esc(row.label)}</small></div>`).join('')}</div>`;}
  function trafficBodyLegacy(period='day'){const summary=trafficSummary(period),live=liveTrafficEvents(30),sources=db.trafficAnalytics?.sources||[],devices=db.trafficAnalytics?.devices||[],pages=db.trafficAnalytics?.topPages||[];return `<div class="metrics">${metric('Pengunjung',summary.visitors,trafficPeriodLabel(period))}${metric('Sesi',summary.sessions,'Interaksi kunjungan')}${metric('Tampilan Halaman',summary.views,'Tampilan pada periode')}${metric('Pengunjung Baru',summary.newVisitors,'Kunjungan pertama pada periode')}</div><div class="traffic-layout mt-3"><div class="panel traffic-chart-card"><div class="toolbar"><div><div class="panel-title">Tren Pengunjung ${trafficPeriodLabel(period)}</div><p class="small muted">Granularitas dapat diubah tanpa memuat ulang halaman.</p></div><div class="realtime-pulse"><strong>${live.length}</strong><span class="small muted">aktivitas 30 menit terakhir</span></div></div>${trafficBars(period)}<div class="traffic-legend"><span>Pengunjung: ${summary.visitors}</span><span>Sesi: ${summary.sessions}</span><span>Tampilan: ${summary.views}</span></div></div><div class="panel"><div class="panel-title">Sumber Trafik</div><div class="traffic-source-list mt-2">${sources.map(x=>`<div class="traffic-source-row"><strong>${esc(x.name)}</strong><span>${x.value}%</span><div class="traffic-progress"><span style="width:${Math.min(100,x.value)}%"></span></div></div>`).join('')}</div><div class="panel-title mt-3">Perangkat</div><div class="traffic-source-list mt-2">${devices.map(x=>`<div class="traffic-source-row"><strong>${esc(x.name)}</strong><span>${x.value}%</span><div class="traffic-progress"><span style="width:${Math.min(100,x.value)}%"></span></div></div>`).join('')}</div></div></div><div class="panel mt-3"><div class="panel-title">Halaman Publik Teratas</div><div class="table-wrap"><table class="table"><thead><tr><th>Halaman</th><th>Alamat</th><th>Tampilan</th></tr></thead><tbody>${pages.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${esc(x.path)}</td><td>${x.views}</td></tr>`).join('')}</tbody></table></div></div>`;}
  function trafficPage(){return appLayout(`<div class="dashboard-head"><div><span class="eyebrow">${icon('traffic')} Analitik Trafik</span><h2>Trafik</h2><p>Pantau pola kunjungan berdasarkan pengunjung, sesi, tampilan halaman, sumber trafik, perangkat, dan aktivitas terbaru.</p></div><div class="traffic-period-tabs">${['hour','day','week','month','year'].map((p,i)=>`<button type="button" class="${p==='day'?'active':''}" data-traffic-period="${p}">${trafficPeriodLabel(p)}</button>`).join('')}</div></div><div id="traffic-body">${trafficBody('day')}</div>`, 'traffic');}
  function renderTrafficBody(period){document.querySelectorAll('[data-traffic-period]').forEach(b=>b.classList.toggle('active',b.dataset.trafficPeriod===period));const target=document.getElementById('traffic-body');if(target)target.innerHTML=trafficBody(period);}
  function getFilteredAuditLogs(){const q=String(document.getElementById('audit-search')?.value||'').trim().toLowerCase(),month=document.getElementById('audit-month')?.value||'',actor=document.getElementById('audit-actor')?.value||'',action=document.getElementById('audit-action')?.value||'';return db.auditLogs.filter(x=>(!q||`${x.actor} ${x.action} ${x.entity} ${x.detail}`.toLowerCase().includes(q))&&(!month||String(x.timestamp||'').slice(0,7)===month)&&(!actor||x.actor===actor)&&(!action||x.action===action));}
  function filterAuditPageLegacy(){const target=document.getElementById('audit-results');if(target)target.innerHTML=auditTable(getFilteredAuditLogs(),true,true);}
  function exportAuditPdf(){if(!authorize('export-audit-pdf'))return;const rows=getFilteredAuditLogs(),actor=session.user();const tableRows=rows.map((x,i)=>[i+1,`${fmtDate(x.timestamp,true)} WIT`,x.actor,humanizeAction(x.action),x.entity,x.detail]);downloadBlob('talenta-nduga-log-aktivitas.pdf',makeProfessionalPdf({title:'TALENTA NDUGA — LOG AKTIVITAS',subtitle:'Audit aktivitas sistem',description:'Rekap tindakan yang tercatat pada sistem untuk kebutuhan penelusuran dan akuntabilitas internal.',meta:[['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah log',rows.length]],sections:[{title:'Daftar Log Aktivitas',columns:[{label:'No',width:.4},{label:'Waktu',width:1.4},{label:'Pelaku',width:1.5},{label:'Tindakan',width:1.7},{label:'Objek',width:1.4},{label:'Rincian',width:3.6}],rows:tableRows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'}));audit(actor.name,'UNDUH_LOG_AKTIVITAS','audit',`${rows.length} log`);toast('Log Aktivitas PDF berhasil disiapkan.','success');}
  function deleteAuditLogLegacy(){ return toast('Log aktivitas bersifat append-only dan tidak dapat dihapus.','error'); }
  function deleteAllAuditLogsLegacy(){ return toast('Log aktivitas bersifat append-only dan tidak dapat dihapus.','error'); }
  function exportPrivilegedUsersPdf(){if(!authorize('export-privileged-users-pdf'))return;const actor=session.user(),rows=db.users.filter(u=>['operator','admin'].includes(u.role));const tableRows=rows.map((u,i)=>[i+1,u.name,roleLabel(u),u.nip||'-',u.employeeStatus||'-',u.bidang||'-',u.jabatan||'-',u.unitKerja||'-',u.workLocation||'-',u.email,u.phone||'-',u.scope||'-',u.mfaEnabled?'Aktif':'Nonaktif']);downloadBlob('talenta-nduga-administrator-operator.pdf',makeProfessionalPdf({title:'TALENTA NDUGA — ADMINISTRATOR & OPERATOR',subtitle:'Daftar pegawai berkewenangan',description:'Rekap akun pegawai Dinas Pendidikan yang memiliki akses operasional ke Talenta Nduga.',meta:[['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah akun',rows.length]],sections:[{title:'Data Pegawai Berkewenangan',columns:[{label:'No',width:.35},{label:'Nama',width:1.2},{label:'Peran',width:.8},{label:'NIP',width:1.1},{label:'Status',width:.8},{label:'Bidang',width:1.2},{label:'Jabatan',width:1.1},{label:'Unit Kerja',width:1.5},{label:'Lokasi',width:.8},{label:'Email',width:1.4},{label:'HP',width:.9},{label:'Cakupan',width:1.1},{label:'MFA',width:.6}],rows:tableRows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'}));audit(actor.name,'UNDUH_AKUN_BERKEWENANGAN','pegawai',`${rows.length} akun`);toast('PDF Administrator & Operator berhasil disiapkan.','success');}
  function deletePrivilegedUser(id){if(!authorize('delete-privileged-user',id))return;const target=db.users.find(u=>u.id===Number(id));if(!target||!['operator','admin'].includes(target.role)||!canManageUser(target))return;if(!confirmAction(`Hapus akun ${target.name}?`))return;db.privilegedSessions.filter(x=>x.userId===target.id).forEach(x=>x.active=false);db.users=db.users.filter(u=>u.id!==target.id);save();audit(session.user().name,'HAPUS_AKUN_BERKEWENANGAN',`pengguna:${target.id}`,`${target.name} • ${target.nip||'-'}`);render();toast('Akun berkewenangan berhasil dihapus.','success');}
  function exportScholarshipsPdf(){if(!authorize('export-scholarships-pdf'))return;const actor=session.user(),rows=db.scholarships;const tableRows=rows.map((x,i)=>[i+1,x.title,x.provider,(x.levels||[]).join(', '),x.category,`${fmtDate(x.deadline,true)} WIT`,statusLabel(x.status),(x.requiredDocs||[]).join(', ')||'-',x.eligibility||'-',x.benefit||'-',x.sourceUrl||'-']);downloadBlob('talenta-nduga-beasiswa.pdf',makeProfessionalPdf({title:'TALENTA NDUGA — DATA BEASISWA',subtitle:'Katalog peluang pendidikan',description:'Rekap informasi beasiswa yang dikelola Administrator berdasarkan sumber dan status publikasi.',meta:[['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah beasiswa',rows.length]],sections:[{title:'Daftar Beasiswa',columns:[{label:'No',width:.3},{label:'Judul',width:1.5},{label:'Penyelenggara',width:1.2},{label:'Jenjang',width:.7},{label:'Kategori',width:.8},{label:'Batas Waktu',width:1},{label:'Status',width:.7},{label:'Dokumen',width:1.5},{label:'Persyaratan',width:2},{label:'Manfaat',width:1.5},{label:'Sumber',width:1.2}],rows:tableRows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'}));audit(actor.name,'UNDUH_BEASISWA_PDF','beasiswa',`${rows.length} data`);toast('PDF Beasiswa berhasil disiapkan.','success');}
  async function deleteScholarship(id){if(!authorize('delete-scholarship',id))return;const item=db.scholarships.find(x=>x.id===Number(id));if(!item||!confirmAction(`Hapus beasiswa ${item.title}?`))return;if(item.imageBlobKey)await fileStore.delete(item.imageBlobKey);db.scholarships=db.scholarships.filter(x=>x.id!==Number(id));db.bookmarks=db.bookmarks.filter(x=>x.scholarshipId!==Number(id));db.reminders=db.reminders.filter(x=>x.scholarshipId!==Number(id));save();audit(session.user().name,'HAPUS_BEASISWA',`beasiswa:${id}`,item.title);render();toast('Beasiswa berhasil dihapus.','success');}
  function saveSystemSettingsLegacy(){if(!authorize('save-system-settings'))return;const form=document.getElementById('system-settings-form');if(!form)return;const fd=new FormData(form);db.systemSettings={...db.systemSettings,dataController:String(fd.get('dataController')||'').trim(),timezone:String(fd.get('timezone')||'Asia/Jayapura').trim(),reminderChannel:String(fd.get('reminderChannel')||'Email'),sessionMinutes:Math.max(15,Number(fd.get('sessionMinutes')||60)),exportWatermark:String(fd.get('exportWatermark')||'TALENTA NDUGA • DOKUMEN TERKENDALI').trim(),documentRetention:String(fd.get('documentRetention')||'').trim()};save();audit(session.user().name,'UBAH_PENGATURAN','pengaturan','Konfigurasi operasional diperbarui.');render();toast('Pengaturan berhasil disimpan.','success');}
  function exportSummaryReportPdf(){if(!authorize('export-summary-report-pdf'))return;const actor=session.user(),users=db.users.filter(u=>u.role==='user');const summaryRows=[['Akun pendidikan',users.length,'Seluruh jenjang'],['Profil terverifikasi',db.profiles.filter(p=>p.profileStatus==='verified').length,'Status final internal'],['Antrean verifikasi',db.verificationQueue.filter(q=>['submitted','in_review'].includes(q.status)).length,'Perlu tindakan'],['Dokumen perlu tindakan',db.documents.filter(d=>['uploaded','pending_review','rejected'].includes(d.status)).length,'Terunggah/ditinjau/ditolak'],['Beasiswa aktif',db.scholarships.filter(x=>x.status==='published').length,'Konten publik'],['Kegiatan terbit',db.activities.filter(x=>x.status==='published').length,'Konten publik'],['Mitra tampil',db.partners.filter(x=>x.approved).length,'Konten publik']];const levelRows=LEVELS.map(level=>[level,users.filter(u=>u.educationLevel===level).length]);downloadBlob('talenta-nduga-laporan-operasional.pdf',makeProfessionalPdf({title:'TALENTA NDUGA — LAPORAN OPERASIONAL',subtitle:'Ringkasan kinerja dan kondisi data sistem',description:'Ringkasan ini memuat indikator pendidikan, verifikasi, dokumen, dan konten publik berdasarkan data internal yang tersimpan.',meta:[['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`]],sections:[{title:'Ringkasan Operasional',columns:[{label:'Indikator',width:2.5},{label:'Nilai',width:1},{label:'Keterangan',width:4}],rows:summaryRows},{title:'Distribusi Jenjang',columns:[{label:'Jenjang',width:2},{label:'Jumlah Pengguna',width:2}],rows:levelRows}],watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'}));audit(actor.name,'UNDUH_LAPORAN_OPERASIONAL','laporan','Ringkasan laporan operasional');toast('Ringkasan laporan PDF berhasil disiapkan.','success');}
  function appLayout(content, section='dashboard') {
    const user = session.user();
    if (!user) return '';
    const entries = availableMenus(user);
    const collapsed = sidebarCollapsed ? ' sidebar-collapsed' : '';
    const accountOpen = accountMenuOpen ? ' open' : '';
    const notificationOpen = notificationMenuOpen ? ' open' : '';
    const allNotices = dashboardNotifications(user);
    const notices = allNotices.filter(n => !(n.readBy || []).includes(user.id)).slice(0, 8);
    const unread = unreadDashboardCount(user);
    const theme = currentTheme();
    return `<div class="app-shell role-${esc(user.role)}${collapsed}">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand-row">
          <a class="brand brand-light" href="#/${user.role}/dashboard"><span class="brand-mark"></span><span class="brand-copy">Talenta Nduga<small>${esc(roleLabel(user))}</small></span></a>
          <button class="sidebar-toggle-desktop" data-action="toggle-sidebar" aria-label="${sidebarCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}">${icon(sidebarCollapsed ? 'menu' : 'close')}</button>
        </div>
        <div class="role-label"><span class="role-label-icon">${icon('shield')}</span><span class="role-label-text">${esc(roleLabel(user))}</span></div>
        <nav class="side-nav grouped-side-nav" aria-label="Navigasi ${esc(roleLabel(user))}">
          ${availableMenuGroups(user).map((group,index) => { const activeGroup=group.items.some(([key])=>key===section); return `<details class="sidebar-group" ${sidebarCollapsed || activeGroup || index===0 ? 'open' : ''}><summary><span class="sidebar-group-icon">${icon(group.icon||'menu')}</span><span class="sidebar-group-label">${esc(group.label)}</span>${icon('chevronDown','sidebar-group-chevron')}</summary><div class="sidebar-group-links">${group.items.map(([key,label,iconName]) => `<a class="side-link ${key===section?'active':''}" href="#/${user.role}/${key}" title="${esc(label)}"><span class="side-icon">${icon(iconName)}</span><span class="side-label">${esc(label)}</span></a>`).join('')}</div></details>`; }).join('')}
        </nav>
        <div class="sidebar-footer"><button class="btn btn-sidebar btn-block sidebar-logout" data-action="logout" title="Keluar">${icon('logout')}<span class="sidebar-logout-label">Keluar</span></button></div>
      </aside>
      <div class="sidebar-overlay" data-action="toggle-sidebar"></div>
      <div class="app-main">
        <header class="app-topbar">
          <button class="icon-btn only-mobile" data-action="toggle-sidebar" aria-label="Buka menu">${icon('menu')}</button>
          <div class="topbar-brand"><h1>Talenta Nduga</h1><span class="topbar-subtitle">${esc(roleLabel(user))}</span></div>
          <form id="topbar-search-form" class="topbar-search" role="search">
            <span>${icon('search')}</span><input name="q" autocomplete="off" placeholder="Cari menu, fitur, teks, data pendidikan..." aria-label="Pencarian seluruh dashboard"><button type="submit" aria-label="Cari">${icon('search')}</button>
          </form>
          <div class="top-spacer"></div>
          <button class="topbar-icon-btn" data-action="toggle-theme" title="${theme==='dark'?'Gunakan mode terang':'Gunakan mode gelap'}" aria-label="Ubah tema">${icon(theme==='dark'?'sun':'moon')}</button>
          <div class="notification-menu-wrap${notificationOpen}">
            <button class="topbar-icon-btn notification-trigger" data-action="toggle-dashboard-notifications" aria-expanded="${notificationMenuOpen?'true':'false'}" aria-label="Notifikasi">${icon('bell')}${unread?`<span class="notification-badge">${unread>9?'9+':unread}</span>`:''}</button>
            <div class="notification-dropdown">
              <div class="notification-dropdown-head"><div><strong>Notifikasi masuk</strong><span>${unread} belum dibuka</span></div>${unread?'<button data-action="mark-dashboard-notifications-read">Tandai semua dibaca</button>':''}</div>
              <div class="notification-dropdown-list">${notices.length?notices.map(n=>`<button class="notification-item unread" data-action="open-dashboard-notification" data-id="${n.id}"><span class="notification-dot"></span><div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${fmtDate(n.createdAt,true)}</small></div><span class="notification-open-icon">${icon('chevron')}</span></button>`).join(''):'<div class="empty compact-empty">Tidak ada notifikasi baru.</div>'}</div>
              ${user.role==='user'?`<a class="notification-footer-link" href="#/user/notifications">Lihat riwayat notifikasi</a>`:`<button class="notification-footer-link" data-action="open-staff-notification-center">Buka pusat notifikasi</button>`}
            </div>
          </div>
          <div class="account-menu-wrap${accountOpen}">
            <button class="account-trigger" data-action="toggle-account-menu" aria-haspopup="menu" aria-expanded="${accountMenuOpen?'true':'false'}">
              ${avatarMarkup(user)}
              <span class="account-trigger-copy"><strong>${esc(user.name)}</strong><small>${esc(roleLabel(user))}</small></span>${icon('chevronDown','account-chevron')}
            </button>
            <div class="account-dropdown" role="menu">
              <div class="account-dropdown-head">${avatarMarkup(user,'account-avatar-lg')}<div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span><small>${esc(user.role==='user'?user.educationLevel:'Akun berkewenangan')}</small></div></div>
              <div class="account-dropdown-meta"><span>${icon('verify')} ${user.verifiedContact?'Kontak terverifikasi':'Kontak belum terverifikasi'}</span>${user.role!=='user'?`<span>${icon('shield')} Verifikasi dua langkah ${user.mfaEnabled?'aktif':'nonaktif'}</span>`:''}</div>
              <div class="account-dropdown-actions">
                <button data-action="account-profile-view" role="menuitem">${icon('eye')}<span>Lihat profil</span>${icon('chevron','menu-chevron')}</button>
                <button data-action="account-profile-edit" role="menuitem">${icon('edit')}<span>Edit profil</span>${icon('chevron','menu-chevron')}</button>
                <button data-action="account-photo" role="menuitem">${icon('user')}<span>Ganti foto profil</span>${icon('chevron','menu-chevron')}</button>
                <button data-action="account-security" role="menuitem">${icon('security')}<span>Keamanan akun</span>${icon('chevron','menu-chevron')}</button>
                <button class="account-logout" data-action="logout" role="menuitem">${icon('logout')}<span>Keluar dari sistem</span></button>
              </div>
            </div>
          </div>
        </header>
        <main class="app-content" id="main-content">${content}</main>
      </div>
    </div>`;
  }

  function runGlobalSearchLegacy(query) {
    const user = session.user();
    if (!user) return;
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return toast('Masukkan minimal 2 karakter untuk pencarian.', 'error');
    const results = [];
    const menuDescriptions = {
      dashboard:'ringkasan statistik aktivitas progres status dan akses cepat',
      profile:'profil identitas biodata asal distrik kampung domisili kontak data wajib',
      education:'pendidikan sekolah kampus riwayat pendidikan NISN NIM fakultas program studi',
      documents:'dokumen kartu pelajar kartu mahasiswa rapor transkrip ijazah verifikasi file privat',
      saved:'beasiswa tersimpan bookmark peluang pendidikan',
      reminders:'pengingat deadline jadwal beasiswa',
      resume:'riwayat hidup CV digital skill pengalaman organisasi proyek prestasi publikasi',
      notifications:'notifikasi pesan pemberitahuan riwayat',
      privacy:'privasi persetujuan publikasi data',
      students:'pelajar mahasiswa SMA SMK S1 S2 S3 identitas pendidikan dokumen verifikasi filter',
      verification:'antrean verifikasi peninjauan perbaikan persetujuan profil dokumen',
      activity:'aktivitas operator riwayat tindakan',
      scholarships:'beasiswa sumber deadline persyaratan dokumen manfaat',
      activities:'kegiatan acara agenda',
      partners:'mitra organisasi partner',
      faqs:'pertanyaan umum bantuan FAQ',
      inbox:'pesan masuk kontak inquiry tindak lanjut',
      masters:'data referensi distrik kampung institusi master',
      'all-users':'akun pengguna status akses aktivasi nonaktif',
      reports:'laporan statistik rekap',
      roles:'peran izin kewenangan hak akses RBAC',
      'privileged-users':'administrator operator akun berkewenangan',
      settings:'pengaturan tata kelola retensi saluran reminder hosting',
      audit:'audit log riwayat keamanan tindakan',
      security:'keamanan sesi verifikasi dua langkah revoke'
    };
    availableMenus(user).forEach(([key,label]) => {
      const hay = `${label} ${menuDescriptions[key] || ''}`.toLowerCase();
      if (hay.includes(q)) results.push({type:'Menu & fitur',title:label,subtitle:menuDescriptions[key] || '',html:`<a class="btn btn-secondary btn-sm" href="#/${user.role}/${key}" data-action="close-modal">Buka</a>`});
    });
    if (user.role !== 'user') {
      studentRecords().filter(({user:u,profile,docs}) => `${u.name} ${u.email} ${u.phone} ${u.educationLevel} ${profile.currentInstitution||''} ${profile.program||''} ${profile.studentNumber||''} ${profile.originDistrict||''} ${profile.originVillage||''} ${profile.domicileCity||''} ${docs.map(d=>`${d.type} ${d.status}`).join(' ')}`.toLowerCase().includes(q)).slice(0,8).forEach(({user:u,profile}) => results.push({type:'Pelajar/Mahasiswa',title:`${u.name} • ${u.educationLevel}`,subtitle:`${profile.currentInstitution||'—'} • ${profile.studentNumber||'—'}`,html:`<button class="btn btn-secondary btn-sm" data-action="view-user" data-id="${u.id}">Lihat data</button>`}));
    }
    if (user.role === 'user') {
      const profile = currentProfile();
      const docs = currentDocuments();
      const personal = [
        ['Profil saya', `${profile?.fullName||''} ${profile?.originDistrict||''} ${profile?.currentInstitution||''} ${profile?.program||''} ${profile?.studentNumber||''}`, '#/user/profile'],
        ['Dokumen saya', docs.map(d=>`${d.type} ${d.filename} ${statusLabel(d.status)}`).join(' '), '#/user/documents'],
        ['Riwayat pendidikan', db.educations.filter(e=>e.userId===user.id).map(e=>`${e.institution} ${e.program} ${e.level}`).join(' '), '#/user/education']
      ];
      personal.filter(([,hay]) => hay.toLowerCase().includes(q)).forEach(([title,,href]) => results.push({type:'Data saya',title,html:`<a class="btn btn-secondary btn-sm" href="${href}" data-action="close-modal">Buka</a>`}));
    }
    db.scholarships.filter(x => `${x.title} ${x.provider} ${x.category} ${x.eligibility} ${x.requiredDocs?.join(' ')||''}`.toLowerCase().includes(q)).slice(0,6).forEach(x=>results.push({type:'Beasiswa',title:x.title,subtitle:x.provider,html:`<button class="btn btn-secondary btn-sm" data-action="scholarship-detail" data-id="${x.id}">Lihat</button>`}));
    if (['admin','superadmin'].includes(user.role)) {
      db.activities.filter(x=>`${x.title} ${x.location} ${x.summary}`.toLowerCase().includes(q)).slice(0,4).forEach(x=>results.push({type:'Kegiatan',title:x.title,subtitle:x.location,html:`<a class="btn btn-secondary btn-sm" href="#/${user.role}/activities" data-action="close-modal">Buka</a>`}));
      db.partners.filter(x=>`${x.name} ${x.type} ${x.summary}`.toLowerCase().includes(q)).slice(0,4).forEach(x=>results.push({type:'Mitra',title:x.name,subtitle:x.type,html:`<a class="btn btn-secondary btn-sm" href="#/${user.role}/partners" data-action="close-modal">Buka</a>`}));
      db.faqs.filter(x=>`${x.category} ${x.question} ${x.answer}`.toLowerCase().includes(q)).slice(0,4).forEach(x=>results.push({type:'Pertanyaan Umum',title:x.question,subtitle:x.category,html:`<a class="btn btn-secondary btn-sm" href="#/${user.role}/faqs" data-action="close-modal">Buka</a>`}));
    }
    if (user.role === 'superadmin') {
      db.auditLogs.filter(x=>`${x.actor} ${x.action} ${x.entity} ${x.detail}`.toLowerCase().includes(q)).slice(0,5).forEach(x=>results.push({type:'Audit',title:humanizeAction(x.action),subtitle:`${x.actor} • ${x.detail||x.entity}`,html:`<a class="btn btn-secondary btn-sm" href="#/superadmin/audit" data-action="close-modal">Buka audit</a>`}));
      Object.entries(db.rolePermissions||{}).forEach(([role,items])=>items.filter(item=>item.toLowerCase().includes(q)).slice(0,2).forEach(item=>results.push({type:'Peran & Izin',title:ROLE_LABELS[role]||role,subtitle:item,html:`<a class="btn btn-secondary btn-sm" href="#/superadmin/roles" data-action="close-modal">Buka izin</a>`})));
    }
    dashboardNotifications(user).filter(n=>`${n.title} ${n.message}`.toLowerCase().includes(q)).slice(0,5).forEach(n=>results.push({type:'Notifikasi',title:n.title,subtitle:n.message,html:`<button class="btn btn-secondary btn-sm" data-action="open-dashboard-notification" data-id="${n.id}">Buka</button>`}));
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('search')} Pencarian Dashboard</span><h3>Hasil untuk “${esc(query)}”</h3><p class="small muted">Mencakup menu, fitur, teks, dan data yang boleh diakses oleh akun ini.</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><div class="search-results">${results.length?results.slice(0,18).map(r=>`<div class="search-result-item"><div><span>${esc(r.type)}</span><strong>${esc(r.title)}</strong>${r.subtitle?`<small>${esc(r.subtitle)}</small>`:''}</div>${r.html}</div>`).join(''):'<div class="empty">Tidak ada menu, fitur, teks, atau data yang cocok.</div>'}</div>`);
  }

  function studentExportPurpose() { const purpose=String(document.getElementById('students-export-purpose')?.value||'').trim(); if(!purpose){toast('Isi tujuan penggunaan sebelum mengunduh data.','error'); return null;} return purpose; }
  function exportCell(profile,key) { return String(profile?.[key] ?? '').trim() || '—'; }
  function studentRowsByLevel(rows, level) { return rows.filter(r=>r.user.educationLevel===level); }
  function excelTableForLevel(rows, level) {
    if(!rows.length) return `<h3>${level}</h3><p>Tidak ada data pada hasil filter.</p>`;
    return `<h3>${level}</h3>${rows.map(({user,profile},index)=>{const docs=db.documents.filter(d=>d.userId===user.id);const groups=studentDetailGroups(profile,level);return `<div class="student-export-block"><h4>${index+1}. ${esc(user.name)} — ${esc(level)}</h4><table><tbody><tr><th colspan="2">Akun & Status</th></tr><tr><td>Email</td><td>${esc(user.email)}</td></tr><tr><td>Nomor HP</td><td>${esc(user.phone||'—')}</td></tr><tr><td>Status akun</td><td>${esc(statusLabel(user.status))}</td></tr><tr><td>Kontak terverifikasi</td><td>${user.verifiedContact?'Ya':'Belum'}</td></tr><tr><td>Status profil</td><td>${esc(statusLabel(profile.profileStatus||'draft'))}</td></tr><tr><td>Kelengkapan</td><td>${profileCompleteness(profile,level)}%</td></tr>${groups.map(([title,pairs])=>`<tr><th colspan="2">${esc(title)}</th></tr>${pairs.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v??'—')}</td></tr>`).join('')}`).join('')}</tbody></table><h4>Dokumen Terunggah</h4>${htmlTable(['No','Jenis Dokumen','Nama File','Format/MIME','Ukuran','Status','Catatan Pemeriksaan','Pemeriksa','Waktu'],docs.map((d,i)=>{const r=latestReview(d);return [i+1,d.type,d.filename,d.mimeType||documentExtension({name:d.filename}),d.fileSize?formatBytes(d.fileSize):'—',statusLabel(d.status),r?.note||d.reviewNote||d.note||'—',r?.reviewer||d.reviewedBy||'—',`${fmtDate(d.updatedAt,true)} WIT`]}))}</div>`}).join('')}`;
  }

  function exportStudentsExcel() {
    if(!authorize('export-students-excel')) return; const purpose=studentExportPurpose(); if(!purpose) return; const rows=getFilteredStudents(); const actor=session.user(); const watermark=db.systemSettings?.exportWatermark||'TALENTA NDUGA • DOKUMEN TERKENDALI';
    const body=LEVELS.map(level=>excelTableForLevel(studentRowsByLevel(rows,level),level)).join('');
    const html=brandedExcelDocument({title:'Data Lengkap Pelajar & Mahasiswa',subtitle:'Identitas, pendidikan, verifikasi, dan dokumen seluruh jenjang',description:'Mencakup data wajib SMA/SMK, S1, S2, S3 serta metadata lengkap dokumen yang diunggah dan catatan pemeriksaan.',meta:[['Tujuan',purpose],['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah data',rows.length]],body,watermark});
    downloadBlob('talenta-nduga-data-lengkap-pelajar-mahasiswa.xls',new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'})); audit(actor.name,'UNDUH_PELAJAR_MAHASISWA_EXCEL','pelajar-mahasiswa',`Tujuan: ${purpose}; jumlah: ${rows.length}; data lengkap + dokumen`); toast('File Excel lengkap berhasil disiapkan.','success');
  }

  function exportStudentsPdf() {
    if(!authorize('export-students-pdf')) return; const purpose=studentExportPurpose(); if(!purpose) return; const rows=getFilteredStudents(); const actor=session.user(); const sections=[];
    LEVELS.forEach(level=>{const group=studentRowsByLevel(rows,level);group.forEach(({user,profile},index)=>{const infoRows=[['Nama',user.name],['Jenjang',level],['Email',user.email],['Nomor HP',user.phone||'-'],['Status akun',statusLabel(user.status)],['Kontak terverifikasi',user.verifiedContact?'Ya':'Belum'],['Status profil',statusLabel(profile.profileStatus||'draft')],['Kelengkapan',`${profileCompleteness(profile,level)}%`]];studentDetailGroups(profile,level).forEach(([groupTitle,pairs])=>pairs.forEach(([k,v])=>infoRows.push([`${groupTitle} — ${k}`,v??'-'])));sections.push({title:`${level} • ${index+1}. ${user.name}`,note:'Identitas dan data pendidikan wajib sesuai jenjang.',columns:[{label:'Field',width:2.2},{label:'Nilai',width:5.8}],rows:infoRows});const docs=db.documents.filter(d=>d.userId===user.id);sections.push({title:`Dokumen • ${user.name}`,note:'Metadata seluruh berkas terunggah. Berkas asli tetap tersimpan privat pada penyimpanan browser/sistem dan dibuka melalui kontrol akses aplikasi.',columns:[{label:'No',width:.4},{label:'Jenis',width:1.2},{label:'Nama File',width:1.8},{label:'Format',width:1},{label:'Ukuran',width:.8},{label:'Status',width:1},{label:'Catatan',width:2.4},{label:'Pemeriksa',width:1.2},{label:'Waktu',width:1.2}],rows:docs.map((d,i)=>{const r=latestReview(d);return[i+1,d.type,d.filename,d.mimeType||documentExtension({name:d.filename}),d.fileSize?formatBytes(d.fileSize):'-',statusLabel(d.status),r?.note||d.reviewNote||d.note||'-',r?.reviewer||d.reviewedBy||'-',`${fmtDate(d.updatedAt,true)} WIT`]})});});});
    const pdf=makeProfessionalPdf({title:'TALENTA NDUGA — DATA LENGKAP PELAJAR & MAHASISWA',subtitle:'Identitas, pendidikan, verifikasi, dan dokumen SMA/SMK–S3',description:'Laporan lengkap berdasarkan hasil filter pada menu Pelajar & Mahasiswa. Metadata berkas, status, ukuran, pemeriksa, dan catatan verifikasi disertakan.',meta:[['Tujuan',purpose],['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah data',rows.length]],sections,watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA'});
    downloadBlob('talenta-nduga-data-lengkap-pelajar-mahasiswa.pdf',pdf); audit(actor.name,'UNDUH_PELAJAR_MAHASISWA_PDF','pelajar-mahasiswa',`Tujuan: ${purpose}; jumlah: ${rows.length}; data lengkap + dokumen`); toast('File PDF lengkap berhasil disiapkan.','success');
  }

  function exportUsersExcel(scope) {
    if(!authorize('export-users-excel')) return; const purpose=exportPurpose(scope); if(!purpose) return; const rows=exportRows(scope),actor=session.user();
    const body=htmlTable(['No','Nama','Email','Nomor HP','Jenjang','Peran','Status','Kontak Terverifikasi','Tanggal Daftar'],rows.map((user,index)=>[index+1,user.name,user.email,user.phone||'',user.educationLevel||'-',roleLabel(user),statusLabel(user.status),user.verifiedContact?'Ya':'Belum',fmtDate(user.createdAt)]));
    const html=brandedExcelDocument({title:'Data Pengguna',subtitle:'Kontrol akun Pelajar & Mahasiswa',description:'Rekap akun pendidikan untuk kebutuhan administrasi dan pemantauan status akses.',meta:[['Tujuan',purpose],['Diunduh oleh',`${actor.name} (${roleLabel(actor)})`],['Waktu',`${fmtDate(now(),true)} WIT`],['Jumlah data',rows.length]],body,watermark:db.systemSettings?.exportWatermark||'TALENTA NDUGA • DOKUMEN TERKENDALI'});
    downloadBlob('talenta-nduga-data-pengguna.xls',new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'})); audit(actor.name,'UNDUH_DATA_EXCEL','pengguna',`Tujuan: ${purpose}; jumlah: ${rows.length}`); toast('File Excel berhasil disiapkan.','success');
  }

  function excelLogoBlock() {
    return `<table class="brand-head" role="presentation"><tr><td class="brand-logo">TN</td><td><div class="brand-name">TALENTA NDUGA</div><div class="brand-tagline">Sistem Data Pendidikan & Talenta Nduga</div></td></tr></table>`;
  }
  function brandedExcelDocument({title,subtitle='',description='',meta=[],body='',watermark='TALENTA NDUGA • DOKUMEN TERKENDALI'}) {
    return `\ufeff<html><head><meta charset="UTF-8"><style>body{font-family:Poppins,Arial,sans-serif;color:#172033;padding:20px}.brand-head{border-collapse:collapse;margin-bottom:14px}.brand-head td{border:0!important;padding:0 10px 0 0}.brand-logo{width:38px;height:38px;text-align:center;vertical-align:middle;background:#0B2748!important;color:#fff!important;font-size:14pt;font-weight:bold}.brand-name{font-size:15pt;font-weight:bold;color:#0B2748}.brand-tagline{font-size:8pt;color:#667085}.report-title{font-size:18pt;color:#0B2748;font-weight:bold;margin:8px 0 2px}.report-subtitle{font-size:11pt;color:#344054;font-weight:bold;margin-bottom:4px}.report-description{font-size:9pt;color:#667085;margin:0 0 12px}.report-meta{border-collapse:collapse;margin-bottom:16px;width:auto}.report-meta td{border:0!important;padding:2px 12px 2px 0;font-size:8.5pt}.report-meta td:first-child{font-weight:bold;color:#344054}.watermark{text-align:center;font-size:20pt;font-weight:bold;color:#d6dde7;letter-spacing:3px;margin:10px 0;opacity:.55}h3{color:#0B2748;margin:22px 0 8px;font-size:12pt}h4{color:#123a63;margin:15px 0 6px;font-size:10pt}.student-export-block{page-break-inside:avoid;margin-bottom:22px}table{border-collapse:collapse;width:100%;font-size:8.5pt;margin-bottom:12px}th{background:#0B2748!important;color:#fff!important;font-weight:bold;text-align:left}th,td{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top}tr:nth-child(even) td{background:#f8fafc}.footer{margin-top:18px;border-top:1px solid #cbd5e1;padding-top:8px;font-size:8pt;color:#667085}</style></head><body>${excelLogoBlock()}<div class="report-title">${esc(title)}</div>${subtitle?`<div class="report-subtitle">${esc(subtitle)}</div>`:''}${description?`<div class="report-description">${esc(description)}</div>`:''}<table class="report-meta">${meta.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><div class="watermark">${esc(watermark)}</div>${body}<div class="footer">Talenta Nduga • Dokumen terkendali • ${esc(fmtDate(now(),true))} WIT</div></body></html>`;
  }
  function htmlTable(headers, rows) {
    return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell ?? '—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">Tidak ada data.</td></tr>`}</tbody></table>`;
  }
  function wrapPdfCell(value, maxChars) {
    const text=plainAscii(String(value??'—')).replace(/\s+/g,' ').trim()||'-';
    const words=text.split(' '), lines=[]; let line='';
    for(const word of words){ if(!line){line=word;continue;} if((line+' '+word).length<=maxChars) line+=' '+word; else {lines.push(line); line=word;} }
    if(line) lines.push(line); return lines.length?lines:['-'];
  }
  function makeProfessionalPdf({title,subtitle='',description='',meta=[],sections=[],watermark='TALENTA NDUGA'}) {
    const W=842,H=595,margin=30,contentW=W-margin*2,headerH=74,bottom=30;
    const pages=[]; let commands=[], y=H-headerH-18, pageNo=1;
    const rgb=(hex)=>{hex=hex.replace('#','');return [parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255]};
    const fill=(hex)=>{const [r,g,b]=rgb(hex);return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`};
    const stroke=(hex)=>{const [r,g,b]=rgb(hex);return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`};
    const text=(x,yy,str,size=8,bold=false,color='#344054')=>{const [r,g,b]=rgb(color);commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x} ${yy} Td (${pdfEscape(str)}) Tj ET`);};
    const rect=(x,yy,w,h,fillHex='',strokeHex='')=>{let s='q '; if(fillHex)s+=fill(fillHex)+' '; if(strokeHex)s+=stroke(strokeHex)+' 0.6 w '; s+=`${x} ${yy} ${w} ${h} re ${fillHex&&strokeHex?'B':fillHex?'f':'S'} Q`;commands.push(s);};
    function pageHeader(){rect(0,H-headerH,W,headerH,'#0B2748');rect(margin,H-55,34,34,'#E6A23C');text(margin+8,H-44,'TN',12,true,'#0B2748');text(margin+46,H-34,title,16,true,'#FFFFFF');if(subtitle)text(margin+46,H-50,subtitle,8.5,false,'#D7E3EF');commands.push(`q 0.93 g BT /F2 38 Tf 0.94 0.34 -0.34 0.94 250 220 Tm (${pdfEscape(watermark)}) Tj ET Q`); y=H-headerH-18;}
    function pageFooter(){text(margin,15,`Talenta Nduga - Dokumen Terkendali - ${fmtDate(now(),true)} WIT`,6.5,false,'#667085');text(W-90,15,`Halaman ${pageNo}`,6.5,true,'#667085');}
    function newPage(){ if(commands.length){pageFooter();pages.push(commands);pageNo+=1;} commands=[];pageHeader(); }
    function need(h){if(y-h<bottom)newPage();}
    newPage();
    if(description){const lines=wrapPdfCell(description,145);need(lines.length*10+4);lines.forEach(line=>{text(margin,y,line,7.5,false,'#475467');y-=10;});y-=3;}
    if(meta.length){const colW=contentW/2;for(let i=0;i<meta.length;i+=2){need(15);for(let j=0;j<2;j++){const entry=meta[i+j];if(!entry)continue;const x=margin+j*colW;text(x,y,`${entry[0]}:`,7,true,'#344054');text(x+82,y,String(entry[1]),7,false,'#475467');}y-=14;}y-=4;}
    for(const section of sections){need(30);text(margin,y,section.title||'Data',10,true,'#0B2748');y-=16;if(section.note){const lines=wrapPdfCell(section.note,145);lines.forEach(line=>{need(10);text(margin,y,line,6.8,false,'#667085');y-=9;});y-=2;}
      const columns=section.columns||[];const rows=section.rows||[];const weights=columns.map(c=>Number(c.width||1));const totalWeight=weights.reduce((a,b)=>a+b,0)||1;const widths=weights.map(w=>contentW*w/totalWeight);const headerHeight=22;
      const drawHeader=()=>{need(headerHeight);let x=margin;columns.forEach((c,idx)=>{rect(x,y-headerHeight+5,widths[idx],headerHeight,'#123A63','#D0D5DD');text(x+4,y-9,c.label||String(c),6.5,true,'#FFFFFF');x+=widths[idx];});y-=headerHeight;};
      drawHeader();
      if(!rows.length){need(22);rect(margin,y-17,contentW,20,'#F8FAFC','#D0D5DD');text(margin+6,y-10,'Tidak ada data.',7,false,'#667085');y-=22;continue;}
      rows.forEach((row,rowIndex)=>{const values=Array.isArray(row)?row:columns.map(c=>row[c.key]);const wrapped=values.map((v,idx)=>wrapPdfCell(v,Math.max(8,Math.floor(widths[idx]/4.6))));const lines=Math.max(...wrapped.map(x=>x.length),1);const rh=Math.max(20,Math.min(76,lines*8+8));if(y-rh<bottom){newPage();text(margin,y,section.title||'Data',9,true,'#0B2748');y-=14;drawHeader();}let x=margin;wrapped.forEach((cell,idx)=>{rect(x,y-rh+4,widths[idx],rh,rowIndex%2?'#F8FAFC':'#FFFFFF','#D0D5DD');cell.slice(0,8).forEach((line,k)=>text(x+4,y-9-k*8,line,6.4,false,'#344054'));x+=widths[idx];});y-=rh;});y-=12;
    }
    pageFooter();pages.push(commands);
    const objects={},pageIds=[];let nextId=5;pages.forEach(page=>{const pageId=nextId++,contentId=nextId++;pageIds.push(pageId);const stream=page.join('\n');objects[contentId]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;});objects[1]='<< /Type /Catalog /Pages 2 0 R >>';objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';const maxId=nextId-1;let pdf='%PDF-1.4\n%TalentaNduga\n',offsets=[0];for(let id=1;id<=maxId;id++){offsets[id]=pdf.length;pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;for(let id=1;id<=maxId;id++)pdf+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([pdf],{type:'application/pdf'});
  }

  function makeSimplePdf(lines, watermark='TALENTA NDUGA') {
    const maxLines=30,pages=[]; for(let i=0;i<lines.length;i+=maxLines) pages.push(lines.slice(i,i+maxLines)); if(!pages.length) pages.push(['TALENTA NDUGA']); const objects={},pageIds=[],fontBoldId=3,fontMonoId=4,fontWatermarkId=5; let nextId=6;
    pages.forEach((pageLines,pageIndex)=>{const pageId=nextId++,contentId=nextId++; pageIds.push(pageId); const commands=[`q 0.92 g BT /F3 44 Tf 0.866 0.5 -0.5 0.866 235 210 Tm (${pdfEscape(watermark)}) Tj ET Q`,`BT /F1 7 Tf 690 575 Td (Halaman ${pageIndex+1}/${pages.length}) Tj ET`]; pageLines.forEach((line,index)=>{const y=548-index*16,isTitle=index===0; commands.push(`BT /${isTitle?'F1':'F2'} ${isTitle?15:7.5} Tf 32 ${y} Td (${pdfEscape(line)}) Tj ET`);}); commands.push(`BT /F1 6 Tf 32 20 Td (Talenta Nduga - Dokumen Terkendali - ${pdfEscape(fmtDate(now(),true))} WIT) Tj ET`); const stream=commands.join('\n'); objects[contentId]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontBoldId} 0 R /F2 ${fontMonoId} 0 R /F3 ${fontWatermarkId} 0 R >> >> /Contents ${contentId} 0 R >>`;}); objects[1]='<< /Type /Catalog /Pages 2 0 R >>'; objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`; objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'; objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'; objects[5]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'; const maxId=nextId-1; let pdf='%PDF-1.4\n%TalentaNduga\n',offsets=[0]; for(let id=1;id<=maxId;id++){offsets[id]=pdf.length;pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;} const xrefOffset=pdf.length; pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`; for(let id=1;id<=maxId;id++) pdf+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`; pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`; return new Blob([pdf],{type:'application/pdf'});
  }
  function accountProfileViewModal() {
    const user = session.user();
    if (!user) return;
    accountMenuOpen = false;
    const profile = db.profiles.find(item => item.userId === user.id);
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('user')} Profil Akun</span><h3>${esc(user.name)}</h3><p class="small muted">Informasi profil dan status akun Talenta Nduga.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <div class="account-modal-hero">${avatarMarkup(user,'account-avatar-xl')}<div><h4>${esc(user.name)}</h4><p>${esc(user.email)}</p><div class="flex wrap gap-2">${badge(user.status)}<span class="badge badge-neutral">${esc(roleLabel(user))}</span></div></div></div>
      <div class="detail-list account-detail-list">
        <div><span>Peran</span><strong>${esc(roleLabel(user))}</strong></div>
        <div><span>Nomor HP</span><strong>${esc(user.phone || '—')}</strong></div>
        <div><span>Kontak</span><strong>${user.verifiedContact ? 'Terverifikasi' : 'Belum terverifikasi'}</strong></div>
        <div><span>Terdaftar</span><strong>${fmtDate(user.createdAt)}</strong></div>
        ${profile ? `<div><span>Jenjang</span><strong>${esc(user.educationLevel || '—')}</strong></div><div><span>Institusi</span><strong>${esc(profile.currentInstitution || '—')}</strong></div><div><span>Program/Jurusan</span><strong>${esc(profile.program || '—')}</strong></div><div><span>Status profil</span><strong>${esc(statusLabel(profile.profileStatus))}</strong></div>` : ''}
      </div>
      <div class="modal-actions mt-3"><button class="btn btn-primary" data-action="account-profile-edit">${icon('edit')}<span>Edit profil</span></button><button class="btn btn-secondary" data-action="account-photo">${icon('user')}<span>Ganti foto</span></button></div>`);
  }

  function accountProfileEditModal() {
    const user = session.user();
    if (!user) return;
    accountMenuOpen = false;
    if (user.role === 'user') {
      closeModal();
      location.hash = '#/user/profile';
      return;
    }
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('edit')} Edit Profil</span><h3>Profil ${esc(roleLabel(user))}</h3><p class="small muted">Perbarui identitas akun berkewenangan tanpa mengubah peran atau kebijakan keamanan.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <form id="account-profile-form" class="stack">
        ${fieldHTML('Nama lengkap','name',user.name)}
        ${fieldHTML('Nomor HP','phone',user.phone || '')}
        <div class="field"><label>Email login</label><input class="input" value="${esc(user.email)}" disabled><span class="field-help">Email login tidak diubah dari profil untuk menjaga konsistensi autentikasi.</span></div>
        <button class="btn btn-primary" type="submit">${icon('check')}<span>Simpan profil</span></button>
      </form>`);
    setTimeout(() => document.getElementById('account-profile-form')?.addEventListener('submit', event => {
      event.preventDefault();
      db = store.load();
      const current = session.user();
      if (!current) return;
      const live = db.users.find(item => item.id === current.id);
      const fd = new FormData(event.currentTarget);
      const name = String(fd.get('name') || '').trim();
      const phone = String(fd.get('phone') || '').trim();
      if (name.length < 3) return toast('Nama lengkap minimal 3 karakter.', 'error');
      if (phone && db.users.some(item => item.id !== live.id && item.phone === phone)) return toast('Nomor HP sudah digunakan akun lain.', 'error');
      live.name = name;
      live.phone = phone;
      save();
      audit(live.name, 'UBAH_PROFIL_AKUN', `pengguna:${live.id}`, 'Nama/nomor HP diperbarui.');
      closeModal();
      render();
      toast('Profil akun berhasil diperbarui.', 'success');
    }), 0);
  }

  function accountPhotoModal() {
    const user = session.user();
    if (!user) return;
    accountMenuOpen = false;
    openModal(`<div class="modal-head"><div><span class="eyebrow">${icon('user')} Foto Profil</span><h3>Ganti Foto Profil</h3><p class="small muted">Gunakan JPG, PNG, atau WebP. Tidak ada batas ukuran buatan aplikasi; kapasitas mengikuti browser/perangkat.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <div class="profile-photo-editor"><div class="profile-photo-preview">${avatarMarkup(user,'account-avatar-photo')}</div><form id="profile-photo-form" class="stack"><input class="input" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required><button class="btn btn-primary" type="submit">${icon('check')}<span>Simpan foto</span></button>${(user.profilePhotoBlobKey||user.profilePhoto) ? `<button class="btn btn-secondary" type="button" data-action="remove-profile-photo">${icon('close')}<span>Hapus foto</span></button>` : ''}</form></div>`);
    setTimeout(() => document.getElementById('profile-photo-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const file = event.currentTarget.elements.photo.files?.[0];
      if (!file) return toast('Pilih foto terlebih dahulu.', 'error');
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return toast('Format foto harus JPG, PNG, atau WebP.', 'error');
      const live = db.users.find(item => item.id === session.user()?.id);
      if (!live) return;
      const key = mediaFileKey('profile', live.id);
      try { await fileStore.put(key, file); } catch (_) { return toast('Foto tidak dapat disimpan pada penyimpanan browser.', 'error'); }
      if (live.profilePhotoBlobKey && live.profilePhotoBlobKey !== key) await fileStore.delete(live.profilePhotoBlobKey);
      live.profilePhotoBlobKey = key; live.profilePhotoName = file.name; live.profilePhotoMime = file.type; live.profilePhotoSize = file.size; delete live.profilePhoto;
      save();
      audit(live.name, 'UBAH_FOTO_PROFIL', `pengguna:${live.id}`, `${file.name} • ${formatBytes(file.size)}`);
      closeModal(); render(); toast('Foto profil berhasil diperbarui.', 'success');
    }), 0);
  }

  function accountSecurityModalLegacy() {
    const user = session.user();
    if (!user) return;
    accountMenuOpen = false;
    const activeSession = activeSessions().find(item => item.id === session.get()?.sessionId);
    openModal(`<div class="modal-head"><div><span class="eyebrow">Keamanan Akun</span><h3>Keamanan & Sesi</h3></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div>
      <div class="security-summary-grid"><div class="security-summary-item">${icon('verify')}<div><span>Kontak</span><strong>${user.verifiedContact ? 'Terverifikasi' : 'Belum terverifikasi'}</strong></div></div><div class="security-summary-item">${icon('shield')}<div><span>Verifikasi dua langkah</span><strong>${user.role === 'user' ? 'Tidak diwajibkan untuk peran ini' : user.mfaEnabled ? 'Aktif' : 'Nonaktif'}</strong></div></div><div class="security-summary-item">${icon('history')}<div><span>Sesi</span><strong>${activeSession ? 'Sesi login aktif' : 'Sesi browser aktif'}</strong></div></div></div>
      <div class="info-callout mt-3"><strong>${icon('lock')} Praktik keamanan akun</strong><span>Gunakan kata sandi yang kuat, jangan membagikan kode verifikasi, dan selalu keluar dari sistem pada perangkat bersama.</span></div>
      ${user.role === 'superadmin' ? `<a class="btn btn-primary mt-3" href="#/superadmin/security" data-action="close-modal">${icon('security')}<span>Buka pusat keamanan</span></a>` : ''}`);
  }


  // ===== AUDIT REMEDIATION v9 =====
  function effectiveTimezone(){ return db?.systemSettings?.timezone || 'Asia/Jayapura'; }
  function sessionLifetimeMs(){ return Math.max(15, Number(db?.systemSettings?.sessionMinutes || 60)) * 60 * 1000 || DEFAULT_SESSION_LIFETIME_MS; }
  function normalizeMasterData(){
    db.masterData = db.masterData || clone(window.TN_SEED.masterData || {}); if(Array.isArray(db.masterData.documentTypes)) db.masterData.documentTypes=db.masterData.documentTypes.map((x,i)=>typeof x==='string'?{id:`doc-${slugify(x)||i}`,name:x,active:true}:x);
    db.verificationReviews = db.verificationReviews || [];
    db.privacyRequests = db.privacyRequests || [];
    db.passwordResetTokens = db.passwordResetTokens || [];
    db.reminderRuns = db.reminderRuns || [];
    db.dataQualityFlags = db.dataQualityFlags || [];
    db.exportPermissions = db.exportPermissions || {admin:false,operator:false};
  }
  function primaryEducation(userId){ return db.educations.find(e=>e.userId===Number(userId)&&e.isPrimary) || db.educations.find(e=>e.userId===Number(userId)) || null; }
  function syncProfileFromPrimaryEducation(userId){
    const profile=db.profiles.find(p=>p.userId===Number(userId)), edu=primaryEducation(userId); if(!profile||!edu) return;
    profile.primaryEducationId=edu.id; profile.currentInstitution=edu.institution||''; profile.program=edu.program||''; profile.level=edu.level||profile.level; profile.studentNumber=edu.studentNumber||''; profile.entryYear=edu.entryYear||''; profile.studyStatus=edu.status||''; profile.faculty=edu.faculty||profile.faculty||''; profile.activeSemester=edu.semester||profile.activeSemester||''; profile.institutionCity=edu.institutionCity||profile.institutionCity||''; profile.institutionProvince=edu.institutionProvince||profile.institutionProvince||''; profile.targetGraduationYear=edu.graduationYear||profile.targetGraduationYear||'';
  }
  function syncPrimaryEducationFromProfile(profile){
    if(!profile) return; let edu=primaryEducation(profile.userId);
    if(!edu){ edu={id:uid(),userId:profile.userId,isPrimary:true}; db.educations.push(edu); }
    Object.assign(edu,{institution:profile.currentInstitution||'',program:profile.program||'',level:profile.level||db.users.find(u=>u.id===profile.userId)?.educationLevel||'',studentNumber:profile.studentNumber||'',entryYear:Number(profile.entryYear||0)||'',status:profile.studyStatus||'',faculty:profile.faculty||'',semester:Number(profile.activeSemester||0)||'',institutionCity:profile.institutionCity||'',institutionProvince:profile.institutionProvince||'',graduationYear:Number(profile.targetGraduationYear||profile.expectedGraduationYear||0)||''});
    profile.primaryEducationId=edu.id;
  }
  function normalizeDataIntegrity(){
    normalizeMasterData();
    db.profiles.forEach(p=>{ const u=db.users.find(x=>x.id===p.userId); if(!u)return; const readiness=studentVerificationReadiness(u,p,db.documents.filter(d=>d.userId===u.id)); if(p.profileStatus==='verified'&&!readiness.ready){p.profileStatus='needs_revision';p.lastReviewNote='Pemeriksaan integritas menemukan persyaratan verifikasi belum lengkap.';} syncProfileFromPrimaryEducation(u.id); p.completeness=profileCompleteness(p,u.educationLevel); });
  }
  normalizeDataIntegrity(); save();

  function fieldClassification(level){
    const requiredNow=requiredProfileKeys(level);
    const conditional=level==='S2'?['thesisTitle','thesisStatus','advisor']:level==='S3'?['dissertationTitle','promoter','coPromoter','proposalStatus','researchStatus','dissertationStatus']:[];
    const optional=level==='S2'?['fundingSource','scholarshipStatus','priorS1Gpa']:level==='S3'?['publications','conferences','orcid','googleScholar','fundingSource','scholarshipStatus']:['fundingSource','scholarshipStatus'];
    return {requiredNow,conditional,optional};
  }

  function saveProfile(showToast=true){
    const form=document.getElementById('profile-form'), profile=currentProfile(), user=session.user(); if(!form||!profile||!user||!ensureAuthenticated(['user']))return;
    const fd=new FormData(form), oldEmail=user.email, oldPhone=user.phone;
    const newEmail=String(fd.get('email')||'').trim().toLowerCase(), newPhone=String(fd.get('phone')||'').trim();
    if(db.users.some(x=>x.id!==user.id&&x.email.toLowerCase()===newEmail)) return toast('Email sudah digunakan akun lain.','error');
    if(newPhone&&db.users.some(x=>x.id!==user.id&&x.phone===newPhone)) return toast('Nomor HP sudah digunakan akun lain.','error');
    const materialKeys=['currentInstitution','program','faculty','studentNumber','entryYear','activeSemester','studyStatus','institutionCity','institutionProvince']; const before=materialKeys.map(k=>profile[k]??'').join('|');
    const fields=['fullName','gender','birthPlace','birthDate','originProvince','originRegency','originDistrict','originVillage','domicileCity','domicileProvince','currentInstitution','program','studentNumber','entryYear','studyStatus','institutionCity','institutionProvince','npsn','classLevel','expectedGraduationYear','faculty','activeSemester','targetGraduationYear','priorS1Institution','priorS1Program','priorS1EntryYear','priorS1GraduationYear','priorS1Degree','priorS1Gpa','priorS2Institution','priorS2Program','priorS2GraduationYear','priorS2Degree','priorS2ThesisTitle','concentration','thesisTitle','thesisStatus','advisor','fundingSource','scholarshipStatus','researchTopic','dissertationTitle','researchField','promoter','coPromoter','proposalStatus','researchStatus','dissertationStatus','publications','conferences','orcid','googleScholar'];
    fields.forEach(k=>{const v=fd.get(k);if(v!==null)profile[k]=String(v).trim();}); profile.level=user.educationLevel;
    if(newEmail!==oldEmail||newPhone!==oldPhone){ user.pendingEmail=newEmail!==oldEmail?newEmail:''; user.pendingPhone=newPhone!==oldPhone?newPhone:''; const token=String(Math.floor(100000+Math.random()*900000)); user.contactVerificationToken=token; user.contactVerificationExpiresAt=Date.now()+15*60*1000; sessionStorage.setItem('talenta_nduga_pending_contact_change',String(user.id)); notifyUser(user.id,'Verifikasi kontak baru',`Kode verifikasi kontak Anda: ${token}. Berlaku 15 menit.`,'warning','profile'); }
    else { profile.email=oldEmail; profile.phone=oldPhone; }
    user.name=profile.fullName||user.name; profile.completeness=profileCompleteness(profile,user.educationLevel); syncPrimaryEducationFromProfile(profile);
    const after=materialKeys.map(k=>profile[k]??'').join('|'); if(profile.profileStatus==='verified'&&before!==after){profile.profileStatus='draft';profile.lastReviewNote='Data pendidikan utama berubah. Verifikasi ulang diperlukan.';audit(user.name,'PERUBAHAN_DATA_TERVERIFIKASI',`profil:${profile.id}`,'Data material berubah dan status dikembalikan menjadi draf.');}
    save(); if(showToast)toast(newEmail!==oldEmail||newPhone!==oldPhone?'Profil tersimpan. Kontak baru menunggu verifikasi.':`Profil tersimpan. Kelengkapan data wajib ${profile.completeness}%.`,'success');
  }

  function educationPage(){
    const user=session.user(), rows=db.educations.filter(x=>x.userId===user.id).sort((a,b)=>Number(b.isPrimary)-Number(a.isPrimary));
    return appLayout(`<div class="dashboard-head"><div><h2>Riwayat Pendidikan</h2><p>Riwayat Pendidikan adalah sumber data akademik utama. Satu data ditandai sebagai pendidikan utama dan otomatis disinkronkan ke ringkasan profil.</p></div><button class="btn btn-primary" data-action="add-education">${icon('plus')}<span>Tambah pendidikan</span></button></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Institusi</th><th>Program/Jurusan</th><th>Jenjang</th><th>Tahun Masuk</th><th>Status</th><th>Utama</th><th>Aksi</th></tr></thead><tbody>${rows.map(e=>`<tr><td><strong>${esc(e.institution)}</strong></td><td>${esc(e.program)}</td><td>${esc(e.level)}</td><td>${esc(e.entryYear)}</td><td>${badge(String(e.status||'').toLowerCase())}</td><td>${e.isPrimary?'<span class="badge badge-success">Ya</span>':'—'}</td><td><div class="table-actions"><button class="icon-action" data-action="edit-education" data-id="${e.id}" title="Ubah">${icon('edit')}</button>${!e.isPrimary?`<button class="icon-action" data-action="set-primary-education" data-id="${e.id}" title="Jadikan utama">${icon('check')}</button><button class="icon-action danger" data-action="delete-education" data-id="${e.id}" title="Hapus">${icon('trash')}</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`, 'education');
  }
  function educationModal(id=0){
    const user=session.user(), item=db.educations.find(e=>e.id===Number(id)&&e.userId===user.id)||null, v=item||{institution:'',program:'',level:user.educationLevel,studentNumber:'',entryYear:new Date().getFullYear(),status:'Aktif',faculty:'',semester:'',institutionCity:'',institutionProvince:'',graduationYear:''};
    openModal(`<div class="modal-head"><div><h3>${item?'Ubah':'Tambah'} Riwayat Pendidikan</h3><p class="small muted">Data utama akan menjadi sumber resmi ringkasan pendidikan pada Profil.</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><form id="education-editor-form" class="stack"><input type="hidden" name="id" value="${item?.id||''}"><div class="form-grid">${fieldHTML('Institusi','institution',v.institution)}${fieldHTML('Program/Jurusan','program',v.program)}${selectHTML('Jenjang','level',LEVELS,v.level)}${fieldHTML('NISN/NIM','studentNumber',v.studentNumber)}${fieldHTML('Fakultas','faculty',v.faculty||'')}${fieldHTML('Semester','semester',v.semester||'','number')}${fieldHTML('Tahun masuk','entryYear',v.entryYear,'number')}${fieldHTML('Tahun lulus/target','graduationYear',v.graduationYear||'','number')}${fieldHTML('Kota institusi','institutionCity',v.institutionCity||'')}${fieldHTML('Provinsi institusi','institutionProvince',v.institutionProvince||'')}${selectHTML('Status','status',(db.masterData?.studyStatuses||['Aktif','Cuti','Lulus']),v.status)}</div><label class="consent-line"><input type="checkbox" name="isPrimary" ${v.isPrimary?'checked':''}><span>Jadikan pendidikan utama</span></label><button class="btn btn-primary" type="submit">${icon('check')} Simpan</button></form>`);
    setTimeout(()=>document.getElementById('education-editor-form')?.addEventListener('submit',event=>{event.preventDefault();const fd=new FormData(event.currentTarget), eid=Number(fd.get('id')||0), isPrimary=fd.has('isPrimary'); const payload={institution:String(fd.get('institution')||'').trim(),program:String(fd.get('program')||'').trim(),level:String(fd.get('level')||''),studentNumber:String(fd.get('studentNumber')||'').trim(),faculty:String(fd.get('faculty')||'').trim(),semester:Number(fd.get('semester')||0)||'',entryYear:Number(fd.get('entryYear')||0)||'',graduationYear:Number(fd.get('graduationYear')||0)||'',institutionCity:String(fd.get('institutionCity')||'').trim(),institutionProvince:String(fd.get('institutionProvince')||'').trim(),status:String(fd.get('status')||'Aktif'),isPrimary}; if(!payload.institution||!payload.program||!payload.level)return toast('Institusi, program/jurusan, dan jenjang wajib diisi.','error'); if(db.educations.some(e=>e.userId===user.id&&e.id!==eid&&e.institution.toLowerCase()===payload.institution.toLowerCase()&&e.program.toLowerCase()===payload.program.toLowerCase()&&String(e.level)===payload.level&&String(e.entryYear)===String(payload.entryYear)))return toast('Riwayat pendidikan yang sama sudah tersedia.','error'); if(payload.graduationYear&&payload.entryYear&&payload.graduationYear<payload.entryYear)return toast('Tahun lulus tidak boleh lebih kecil dari tahun masuk.','error'); if(isPrimary)db.educations.filter(e=>e.userId===user.id).forEach(e=>e.isPrimary=false); let live=db.educations.find(e=>e.id===eid); if(live)Object.assign(live,payload); else {live={id:uid(),userId:user.id,...payload};db.educations.push(live);} if(!db.educations.some(e=>e.userId===user.id&&e.isPrimary))live.isPrimary=true; syncProfileFromPrimaryEducation(user.id); save();audit(user.name,eid?'UBAH_PENDIDIKAN':'TAMBAH_PENDIDIKAN',`pendidikan:${live.id}`,live.institution);closeModal();render();toast('Riwayat pendidikan berhasil disimpan.','success');}),0);
  }
  function deleteEducation(id){ const user=session.user(), item=db.educations.find(e=>e.id===Number(id)&&e.userId===user.id); if(!item||item.isPrimary)return toast('Pendidikan utama tidak dapat dihapus sebelum memilih data utama lain.','error'); if(!confirmAction(`Hapus riwayat ${item.institution}?`))return; db.educations=db.educations.filter(e=>e.id!==item.id); save();audit(user.name,'HAPUS_PENDIDIKAN',`pendidikan:${item.id}`,item.institution);render(); }
  function setPrimaryEducation(id){ const user=session.user(), item=db.educations.find(e=>e.id===Number(id)&&e.userId===user.id); if(!item)return; db.educations.filter(e=>e.userId===user.id).forEach(e=>e.isPrimary=e.id===item.id); syncProfileFromPrimaryEducation(user.id); const p=currentProfile(); if(p?.profileStatus==='verified'){p.profileStatus='draft';p.lastReviewNote='Pendidikan utama berubah. Verifikasi ulang diperlukan.';} save();audit(user.name,'UBAH_PENDIDIKAN_UTAMA',`pendidikan:${item.id}`,item.institution);render();toast('Pendidikan utama diperbarui.','success'); }

  function remindersPage(){
    const rows=db.reminders.filter(r=>r.userId===session.user().id); return appLayout(`<div class="dashboard-head"><div><h2>Pengingat</h2><p>Kelola pengingat beasiswa dengan jadwal WIT dan saluran yang diperbolehkan oleh pengaturan sistem.</p></div></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Beasiswa</th><th>Jadwal</th><th>Saluran</th><th>Status</th><th>Riwayat</th><th>Aksi</th></tr></thead><tbody>${rows.map(r=>{const s=db.scholarships.find(x=>x.id===r.scholarshipId),runs=(db.reminderRuns||[]).filter(x=>x.reminderId===r.id);return `<tr><td>${esc(s?.title||'—')}</td><td>${fmtDate(r.runAt,true)} WIT</td><td>${esc(r.channel)}</td><td>${badge(r.status)}</td><td>${runs.length?esc(statusLabel(runs[0].status)):'Belum diproses'}</td><td><button class="btn btn-secondary btn-sm" data-action="cancel-reminder" data-id="${r.id}" ${r.status!=='scheduled'?'disabled':''}>Batalkan</button></td></tr>`}).join('')}</tbody></table></div>`, 'reminders');
  }
  function reminderModal(scholarshipId){ const user=session.user(), s=db.scholarships.find(x=>x.id===Number(scholarshipId)); if(!user||!s)return; const allowed=[db.systemSettings?.reminderChannel||'Email']; openModal(`<div class="modal-head"><div><h3>Atur Pengingat</h3><p class="small muted">${esc(s.title)} • deadline ${fmtDate(s.deadline,true)} WIT</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><form id="reminder-form" class="stack"><input type="hidden" name="scholarshipId" value="${s.id}"><div class="field"><label>Waktu pengingat</label><select class="select" name="preset"><option value="30">H-30</option><option value="14">H-14</option><option value="7">H-7</option><option value="3" selected>H-3</option><option value="1">H-1</option><option value="custom">Tanggal khusus</option></select></div><div class="field"><label>Tanggal/waktu khusus (opsional)</label><input class="input" type="datetime-local" name="custom"></div><div class="field"><label>Saluran</label><select class="select" name="channel">${allowed.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><button class="btn btn-primary" type="submit">Simpan pengingat</button></form>`); setTimeout(()=>document.getElementById('reminder-form')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),preset=String(fd.get('preset')),deadline=new Date(s.deadline),custom=String(fd.get('custom')||''),runAt=preset==='custom'&&custom?new Date(custom):new Date(deadline.getTime()-Number(preset)*86400000); if(runAt>=deadline||runAt<=new Date())return toast('Jadwal pengingat harus sebelum deadline dan masih di masa depan.','error'); const exists=db.reminders.some(r=>r.userId===user.id&&r.scholarshipId===s.id&&r.status==='scheduled');if(exists)return toast('Pengingat aktif untuk beasiswa ini sudah ada.','error'); const item={id:uid(),userId:user.id,scholarshipId:s.id,runAt:runAt.toISOString(),channel:String(fd.get('channel')||allowed[0]),status:'scheduled',createdAt:now()};db.reminders.push(item);save();audit(user.name,'BUAT_PENGINGAT',`beasiswa:${s.id}`,`${fmtDate(runAt,true)} WIT • ${item.channel}`);closeModal();render();toast('Pengingat berhasil dibuat.','success');}),0); }

  function resumePage(){
    const p=currentProfile(); if(!p)return appLayout('<div class="empty">Profil belum tersedia.</div>','resume'); const r=p.resume||(p.resume={slug:slugify(p.fullName),published:false,summary:'',skills:[],experiences:[],organizations:[],projects:[],achievements:[]});
    const arr=(x)=>Array.isArray(x)?x.join('\n'):'';
    return appLayout(`<div class="dashboard-head"><div><h2>Riwayat Hidup Digital</h2><p>Kelola seluruh bagian CV, pratinjau, dan terbitkan halaman publik yang dapat dibagikan.</p></div>${badge(r.published?'published':'private')}</div><div class="app-grid"><form id="resume-form" class="panel stack"><div class="field"><label>Ringkasan</label><textarea class="textarea" name="summary">${esc(r.summary||'')}</textarea></div><div class="field"><label>Keterampilan (pisahkan koma)</label><input class="input" name="skills" value="${esc((r.skills||[]).join(', '))}"></div>${[['experiences','Pengalaman'],['organizations','Organisasi'],['projects','Proyek'],['achievements','Prestasi']].map(([k,l])=>`<div class="field"><label>${l} (satu item per baris)</label><textarea class="textarea" name="${k}">${esc(arr(r[k]))}</textarea></div>`).join('')}<label class="consent-line"><input type="checkbox" name="showOrigin" ${p.privacy.showOriginDistrict?'checked':''}><span>Tampilkan distrik asal</span></label><label class="consent-line"><input type="checkbox" name="showInstitution" ${p.privacy.showInstitution?'checked':''}><span>Tampilkan institusi pendidikan</span></label><button class="btn btn-secondary" type="button" data-action="save-resume">Simpan draf</button>${r.published?`<a class="btn btn-secondary" href="#/cv/${esc(r.slug)}" target="_blank">${icon('eye')} Lihat CV publik</a><button class="btn btn-danger" type="button" data-action="toggle-resume-publish">Cabut publikasi</button>`:`<label class="consent-line"><input id="resume-consent" type="checkbox"><span>Saya menyetujui publikasi data yang dipilih.</span></label><button class="btn btn-primary" type="button" data-action="toggle-resume-publish">Terbitkan CV</button>`}</form><article class="cv-preview"><h2>${esc(p.fullName)}</h2><p>${esc(p.program||'')}</p><h3>Ringkasan</h3><p>${esc(r.summary||'')}</p><h3>Keterampilan</h3><p>${(r.skills||[]).map(esc).join(' • ')}</p>${[['experiences','Pengalaman'],['organizations','Organisasi'],['projects','Proyek'],['achievements','Prestasi']].map(([k,l])=>`<h3>${l}</h3><ul>${(r[k]||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`).join('')}<p class="small muted">Diperbarui: ${fmtDate(now())}</p></article></div>`, 'resume');
  }
  function publicCvPage(slug){ const p=db.profiles.find(x=>x.resume?.slug===slug&&x.resume?.published); if(!p)return publicLayout(`${pageHero('Riwayat Hidup Tidak Tersedia','Profil ini tidak dipublikasikan atau publikasinya telah dicabut.')}<section class="section"><div class="container"><div class="empty">CV publik tidak tersedia.</div></div></section>`); const r=p.resume, u=db.users.find(x=>x.id===p.userId); return publicLayout(`${pageHero(p.fullName,`${u?.educationLevel||p.level} • ${p.program||''}`)}<section class="section"><div class="container"><article class="public-cv-card"><h2>Ringkasan</h2><p>${esc(r.summary||'')}</p>${p.privacy.showInstitution?`<h2>Pendidikan</h2><p>${esc(p.level)} ${esc(p.program)} • ${esc(p.currentInstitution)}</p>`:''}${p.privacy.showOriginDistrict?`<p><strong>Asal:</strong> ${esc(p.originDistrict)}</p>`:''}<h2>Keterampilan</h2><div class="cv-tags">${(r.skills||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${[['experiences','Pengalaman'],['organizations','Organisasi'],['projects','Proyek'],['achievements','Prestasi']].map(([k,l])=>`<h2>${l}</h2><ul>${(r[k]||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`).join('')}<p class="small muted">Terakhir diperbarui ${fmtDate(now())}</p></article></div></section>`); }

  function publicPrivacyPage(){ const cfg=db.systemSettings||{}; return publicLayout(`${pageHero('Privasi & Tata Kelola Data','Penjelasan ringkas mengenai tujuan penggunaan data, hak pengguna, retensi, dan pengelola data Talenta Nduga.')}<section class="section"><div class="container grid grid-2"><article class="content-card"><h3>Pengelola Data</h3><p>${esc(cfg.dataController||'Pengelola Talenta Nduga')}</p><p>Data digunakan untuk pendataan pendidikan, verifikasi, informasi peluang, reminder, pelaporan agregat, dan layanan pengguna.</p></article><article class="content-card"><h3>Hak Pengguna</h3><p>Pengguna dapat meminta akses, koreksi, penghapusan sesuai kebijakan, serta mencabut publikasi CV kapan saja.</p></article><article class="content-card"><h3>Dokumen Privat</h3><p>Dokumen pendidikan tidak ditampilkan di halaman publik. Akses internal mengikuti peran dan cakupan tugas.</p></article><article class="content-card"><h3>Retensi</h3><p>${esc(cfg.documentRetention||'Kebijakan retensi final menunggu penetapan pengelola data.')}</p><p>Versi pemberitahuan privasi: ${esc(cfg.privacyNoticeVersion||'1.0')}</p></article></div></section>`); }

  function privacyPage(){
    const profile=currentProfile(), req=(db.privacyRequests||[]).filter(x=>x.userId===session.user().id);
    return appLayout(`<div class="dashboard-head"><div><h2>Privasi</h2><p>Atur data yang boleh dipublikasikan dan kelola permintaan hak atas data.</p></div></div><div class="grid grid-2"><div class="panel stack"><div class="panel-title">Preferensi Publikasi</div><label class="consent-line"><input type="checkbox" data-privacy="showOriginDistrict" ${profile.privacy.showOriginDistrict?'checked':''}><span>Tampilkan distrik asal pada CV publik</span></label><label class="consent-line"><input type="checkbox" data-privacy="showInstitution" ${profile.privacy.showInstitution?'checked':''}><span>Tampilkan institusi pendidikan</span></label><label class="consent-line"><input type="checkbox" data-privacy="showProgram" ${profile.privacy.showProgram?'checked':''}><span>Tampilkan program/jurusan</span></label><button class="btn btn-primary" data-action="save-privacy">Simpan pengaturan</button></div><div class="panel"><div class="panel-title">Prinsip Privasi</div><div class="list mt-2"><div class="list-row"><div><strong>Dokumen tetap privat</strong><span>Dokumen pendidikan tidak pernah masuk ke CV publik.</span></div></div><div class="list-row"><div><strong>Publikasi dapat dicabut</strong><span>CV dapat dibuat privat kembali kapan saja.</span></div></div><div class="list-row"><div><strong>Versi pemberitahuan</strong><span>${esc(db.systemSettings?.privacyNoticeVersion||'1.0')}</span></div></div></div></div></div><div class="panel mt-3"><div class="panel-title">Permintaan Privasi</div><div class="flex wrap gap-2"><button class="btn btn-secondary" data-action="privacy-request" data-type="access">Minta salinan data</button><button class="btn btn-secondary" data-action="privacy-request" data-type="correction">Minta koreksi data</button><button class="btn btn-danger" data-action="privacy-request" data-type="deletion">Ajukan penghapusan akun</button></div><div class="list mt-2">${req.length?req.map(x=>`<div class="list-row"><div><strong>${esc(x.type)}</strong><span>${fmtDate(x.createdAt,true)} • ${esc(statusLabel(x.status))}</span></div></div>`).join(''):'<div class="empty compact-empty">Belum ada permintaan.</div>'}</div></div>`, 'privacy');
  }

  function inboxPage(){ const role=session.user().role, rows=(db.inquiries||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); return appLayout(`<div class="dashboard-head"><div><h2>Pesan Masuk</h2><p>Tindak lanjuti pesan dari formulir Kontak publik dengan status yang jelas.</p></div></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Pengirim</th><th>Subjek</th><th>Pesan</th><th>Status</th><th>Waktu</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><span class="small muted">${esc(x.email)}</span></td><td>${esc(x.subject)}</td><td>${esc(x.message)}</td><td>${badge(x.status||'new')}</td><td>${fmtDate(x.createdAt,true)}</td><td><div class="table-actions"><select class="select compact-select" data-inquiry-status="${x.id}">${['new','read','processing','done','spam'].map(s=>`<option value="${s}" ${s===(x.status||'new')?'selected':''}>${s==='new'?'Baru':s==='read'?'Dibaca':s==='processing'?'Diproses':s==='done'?'Selesai':'Spam'}</option>`).join('')}</select><button class="icon-action" data-action="inquiry-note" data-id="${x.id}" title="Catatan tindak lanjut">${icon('edit')}</button></div></td></tr>`).join('')}</tbody></table></div>`, 'inbox'); }

  function adminMastersPage(){ normalizeMasterData(); const md=db.masterData; const cards=[['districts','Distrik',md.districts],['villages','Kampung',md.villages],['institutions','Institusi',md.institutions],['documentTypes','Tipe Dokumen',md.documentTypes||[]]]; return appLayout(`<div class="dashboard-head"><div><h2>Data Referensi</h2><p>Master data menjadi sumber referensi untuk formulir, filter, verifikasi, dan laporan. Gunakan nonaktifkan untuk menjaga histori.</p></div></div><div class="master-grid">${cards.map(([key,title,items])=>`<section class="panel"><div class="panel-head"><div class="panel-title">${title}</div><button class="btn btn-primary btn-sm" data-action="master-add" data-type="${key}">${icon('plus')} Tambah</button></div><div class="list">${items.map(item=>`<div class="list-row"><div><strong>${esc(item.name||item)}</strong><span>${item.active===false?'Nonaktif':'Aktif'}</span></div><div class="table-actions"><button class="icon-action" data-action="master-edit" data-type="${key}" data-id="${esc(item.id)}">${icon('edit')}</button><button class="icon-action" data-action="master-toggle" data-type="${key}" data-id="${esc(item.id)}">${item.active===false?icon('check'):icon('close')}</button></div></div>`).join('')}</div></section>`).join('')}</div>`, 'masters'); }
  function masterModal(type,id=''){ const list=db.masterData?.[type]; if(!Array.isArray(list))return; const item=list.find(x=>String(x.id)===String(id))||null; openModal(`<div class="modal-head"><div><h3>${item?'Ubah':'Tambah'} ${esc(type)}</h3></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><form id="master-form" class="stack"><input type="hidden" name="type" value="${esc(type)}"><input type="hidden" name="id" value="${esc(item?.id||'')}">${fieldHTML('Nama','name',item?.name||'')}<button class="btn btn-primary" type="submit">Simpan</button></form>`); setTimeout(()=>document.getElementById('master-form')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),name=String(fd.get('name')||'').trim();if(!name)return toast('Nama wajib diisi.','error'); if(list.some(x=>String(x.id)!==String(item?.id||'')&&String(x.name).toLowerCase()===name.toLowerCase()))return toast('Data referensi sudah tersedia.','error'); if(item)item.name=name;else list.push({id:slugify(name)+'-'+Math.floor(Math.random()*1000),name,active:true});save();audit(session.user().name,item?'UBAH_MASTER':'TAMBAH_MASTER',`master:${type}`,name);closeModal();render();}),0); }

  function computeDataQualityFlags(){ const flags=[]; const seenEmail=new Map(), seenPhone=new Map(), seenNum=new Map(); db.users.filter(u=>u.role==='user').forEach(u=>{const p=db.profiles.find(x=>x.userId===u.id); if(!p)return; const add=(type,sev,msg)=>flags.push({userId:u.id,type,severity:sev,message:msg}); const email=u.email.toLowerCase(); if(seenEmail.has(email))add('duplicate','high','Email terindikasi duplikat');else seenEmail.set(email,u.id); if(u.phone){if(seenPhone.has(u.phone))add('duplicate','high','Nomor HP terindikasi duplikat');else seenPhone.set(u.phone,u.id);} const key=`${p.currentInstitution}|${p.studentNumber}`.toLowerCase(); if(p.studentNumber&&p.studentNumber!=='-'){if(seenNum.has(key))add('duplicate','high','NISN/NIM pada institusi terindikasi duplikat');else seenNum.set(key,u.id);} if(profileCompleteness(p,u.educationLevel)<100)add('incomplete','medium','Data wajib profil belum lengkap'); const readiness=studentVerificationReadiness(u,p,db.documents.filter(d=>d.userId===u.id)); if(p.profileStatus==='verified'&&!readiness.ready)add('invariant','high','Profil terverifikasi tidak memenuhi persyaratan dokumen'); const masterInst=(db.masterData?.institutions||[]).some(i=>i.active!==false&&i.name.toLowerCase()===String(p.currentInstitution||'').toLowerCase()); if(p.currentInstitution&&!masterInst)add('reference','low','Institusi belum ada pada master data'); }); db.dataQualityFlags=flags; return flags; }
  function studentsManagementPage(role){ const html=studentsManagementPageLegacy(role), flags=computeDataQualityFlags(), visible=flags.filter(f=>canReviewStudent(f.userId)); const panel=`<section class="panel mt-3 data-quality-panel"><div class="panel-head"><div><div class="panel-title">Kualitas Data</div><p class="small muted">Deteksi duplikasi, kelengkapan, referensi master, dan pelanggaran invariant.</p></div><span class="count-pill"><strong>${visible.length}</strong><span>flag</span></span></div><div class="list">${visible.slice(0,12).map(f=>{const u=db.users.find(x=>x.id===f.userId);return `<div class="list-row"><div><strong>${esc(u?.name||'Pengguna')}</strong><span>${esc(f.message)}</span></div><button class="btn btn-secondary btn-sm" data-action="view-user" data-id="${f.userId}">Tinjau</button></div>`}).join('')||'<div class="empty compact-empty">Tidak ada masalah kualitas data pada cakupan ini.</div>'}</div></section>`; return html.replace('</main>',panel+'</main>'); }

  function createVerificationSnapshot(userId,decision,reason){ const u=db.users.find(x=>x.id===Number(userId)), p=db.profiles.find(x=>x.userId===u?.id); if(!u||!p)return; const snapshot={user:clone({id:u.id,name:u.name,email:u.email,phone:u.phone,educationLevel:u.educationLevel}),profile:clone(p),educations:clone(db.educations.filter(x=>x.userId===u.id)),documents:clone(db.documents.filter(x=>x.userId===u.id).map(({id,type,filename,status,updatedAt,reviewNote})=>({id,type,filename,status,updatedAt,reviewNote})))}; const encoded=JSON.stringify(snapshot); let hash=0; for(let i=0;i<encoded.length;i++)hash=((hash<<5)-hash+encoded.charCodeAt(i))|0; db.verificationReviews.unshift({id:uid(),studentId:u.id,snapshotVersion:`v${Date.now()}`,snapshotHash:String(hash>>>0),snapshot,submittedAt:db.verificationQueue.find(q=>q.userId===u.id)?.submittedAt||'',reviewerId:session.user()?.id,reviewerRole:session.user()?.role,decision,reason,reviewedAt:now(),changedFields:[]}); }
  function queueSla(item){ const hours=Math.max(0,(Date.now()-new Date(item.submittedAt).getTime())/3600000); const tone=hours>72?'danger':hours>48?'warning':hours>24?'info':'success'; return {hours:Math.round(hours),tone,label:hours>72?'Melewati SLA':hours>48?'Mendekati SLA':hours>24?'Perlu perhatian':'Normal'}; }
  function queueTable(rows){ return `<div class="table-wrap"><table class="table"><thead><tr><th>Nama</th><th>Jenjang</th><th>Distrik</th><th>Institusi</th><th>Status</th><th>SLA realtime</th><th>Penanggung Jawab</th><th>Aksi</th></tr></thead><tbody>${rows.map(item=>{const sla=queueSla(item);return `<tr><td><strong>${esc(item.userName)}</strong></td><td>${esc(item.educationLevel)}</td><td>${esc(item.district)}</td><td>${esc(item.institution)}</td><td>${badge(item.status)}</td><td><span class="badge badge-${sla.tone}">${sla.hours} jam • ${sla.label}</span></td><td>${esc(item.assignedToName||'Belum diklaim')}</td><td><div class="table-actions">${!item.assignedTo?`<button class="btn btn-secondary btn-sm" data-action="claim-review" data-id="${item.id}">Klaim</button>`:''}<button class="btn btn-secondary btn-sm" data-action="review-user" data-id="${item.id}">Tinjau</button></div></td></tr>`}).join('')}</tbody></table></div>`; }

  function aggregateTraffic(period='day'){ const events=(db.trafficAnalytics?.trafficEvents||[]), tz=effectiveTimezone(); const nowDate=new Date(), buckets=new Map(); const fmt=(d)=>{if(period==='hour')return new Intl.DateTimeFormat('id-ID',{hour:'2-digit',hour12:false,timeZone:tz}).format(d)+':00'; if(period==='day')return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',timeZone:tz}).format(d); if(period==='month')return new Intl.DateTimeFormat('id-ID',{month:'short',year:'numeric',timeZone:tz}).format(d); if(period==='year')return String(d.getFullYear()); if(period==='week'){const day=Math.floor(d.getTime()/86400000);return 'Minggu '+Math.floor(day/7);} return d.toISOString().slice(0,10)}; events.forEach(e=>{const d=new Date(e.timestamp);const k=fmt(d);const b=buckets.get(k)||{label:k,visitors:0,sessions:0,views:0,newVisitors:0,_vis:new Set(),_ses:new Set(),_new:new Set()};b.views++;b._vis.add(e.visitorId||e.sessionId||e.id);b._ses.add(e.sessionId||e.visitorId||e.id);if(e.isNewVisitor)b._new.add(e.visitorId||e.id);buckets.set(k,b)}); return [...buckets.values()].map(b=>({label:b.label,visitors:b._vis.size,sessions:b._ses.size,views:b.views,newVisitors:b._new.size})).slice(-30); }
  function trafficSeries(period='day'){ const live=aggregateTraffic(period); return live.length?live:(db.trafficAnalytics?.[period]||[]); }
  function runPrototypeScheduler(){ let changed=false; const nowMs=Date.now(); if(db.systemSettings?.autoPublishContent!==false){db.scholarships.forEach(s=>{if(s.status==='scheduled'&&new Date(s.deadline).getTime()>nowMs&&s.publishAt&&new Date(s.publishAt).getTime()<=nowMs){s.status='published';changed=true;}});db.activities.forEach(a=>{if(a.status==='scheduled'&&a.publishAt&&new Date(a.publishAt).getTime()<=nowMs){a.status='published';changed=true;}});} if(db.systemSettings?.autoCloseScholarships!==false)db.scholarships.forEach(s=>{if(s.status==='published'&&new Date(s.deadline).getTime()<nowMs){s.status='closed';db.reminders.filter(r=>r.scholarshipId===s.id&&r.status==='scheduled').forEach(r=>r.status='canceled');changed=true;}}); db.reminders.filter(r=>r.status==='scheduled'&&new Date(r.runAt).getTime()<=nowMs).forEach(r=>{r.status='sent';db.reminderRuns.unshift({id:uid(),reminderId:r.id,status:'sent',processedAt:now(),channel:r.channel,providerResponseId:`LOCAL-${uid()}`});notifyUser(r.userId,'Pengingat beasiswa',`Pengingat untuk ${db.scholarships.find(s=>s.id===r.scholarshipId)?.title||'beasiswa'} telah diproses.`,'info','reminders');changed=true;}); const retention=Math.max(7,Number(db.systemSettings?.trafficRetentionDays||365)); if(db.trafficAnalytics?.trafficEvents){const cutoff=Date.now()-retention*86400000;const before=db.trafficAnalytics.trafficEvents.length;db.trafficAnalytics.trafficEvents=db.trafficAnalytics.trafficEvents.filter(e=>new Date(e.timestamp).getTime()>=cutoff);changed=changed||before!==db.trafficAnalytics.trafficEvents.length;} if(changed)save(); }

  function settingsPage(){ const cfg=db.systemSettings||{}; return appLayout(`<div class="dashboard-head"><div><h2>Pengaturan</h2><p>Setiap pengaturan di bawah terhubung langsung ke perilaku runtime prototype.</p></div></div><form id="system-settings-form" class="panel stack"><div class="form-grid">${fieldHTML('Pengelola data','dataController',cfg.dataController||'')}${fieldHTML('Zona waktu','timezone',cfg.timezone||'Asia/Jayapura')}${selectHTML('Saluran pengingat','reminderChannel',['Email','SMS','WhatsApp'],cfg.reminderChannel||'Email')}${fieldHTML('Durasi sesi (menit)','sessionMinutes',cfg.sessionMinutes||60,'number')}${fieldHTML('Retensi trafik (hari)','trafficRetentionDays',cfg.trafficRetentionDays||365,'number')}${fieldHTML('Versi pemberitahuan privasi','privacyNoticeVersion',cfg.privacyNoticeVersion||'1.0')}${fieldHTML('Watermark unduhan','exportWatermark',cfg.exportWatermark||'TALENTA NDUGA • DOKUMEN TERKENDALI')}</div><div class="field"><label>Kebijakan retensi dokumen</label><textarea class="textarea" name="documentRetention">${esc(cfg.documentRetention||'')}</textarea></div><label class="consent-line"><input type="checkbox" name="autoCloseScholarships" ${cfg.autoCloseScholarships!==false?'checked':''}><span>Tutup beasiswa otomatis ketika deadline lewat</span></label><label class="consent-line"><input type="checkbox" name="autoPublishContent" ${cfg.autoPublishContent!==false?'checked':''}><span>Aktifkan transisi konten terjadwal</span></label><button class="btn btn-primary" type="button" data-action="save-system-settings">Simpan Pengaturan</button></form><section class="panel mt-3"><div class="panel-title">Permintaan Privasi Pengguna</div><p class="small muted">Kelola permintaan akses, koreksi, dan penghapusan. Penyelesaian wajib memiliki jejak audit.</p><div class="table-wrap mt-2"><table class="table"><thead><tr><th>Pengguna</th><th>Jenis</th><th>Diajukan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${(db.privacyRequests||[]).map(r=>{const u=db.users.find(x=>x.id===r.userId);return `<tr><td><strong>${esc(u?.name||'—')}</strong></td><td>${esc(r.type)}</td><td>${fmtDate(r.createdAt,true)}</td><td>${badge(r.status||'submitted')}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-action="privacy-request-status" data-id="${r.id}" data-status="processing">Proses</button><button class="btn btn-primary btn-sm" data-action="privacy-request-status" data-id="${r.id}" data-status="done">Selesai</button></div></td></tr>`}).join('')||'<tr><td colspan="5" class="muted">Belum ada permintaan privasi.</td></tr>'}</tbody></table></div></section>`, 'settings'); }
  function saveSystemSettings(){ if(!authorize('save-system-settings'))return; const f=document.getElementById('system-settings-form');if(!f)return;const fd=new FormData(f);db.systemSettings={...db.systemSettings,dataController:String(fd.get('dataController')||'').trim(),timezone:String(fd.get('timezone')||'Asia/Jayapura').trim(),reminderChannel:String(fd.get('reminderChannel')||'Email'),sessionMinutes:Math.max(15,Number(fd.get('sessionMinutes')||60)),trafficRetentionDays:Math.max(7,Number(fd.get('trafficRetentionDays')||365)),privacyNoticeVersion:String(fd.get('privacyNoticeVersion')||'1.0'),exportWatermark:String(fd.get('exportWatermark')||'TALENTA NDUGA • DOKUMEN TERKENDALI').trim(),documentRetention:String(fd.get('documentRetention')||'').trim(),autoCloseScholarships:fd.has('autoCloseScholarships'),autoPublishContent:fd.has('autoPublishContent')};save();audit(session.user().name,'UBAH_PENGATURAN','pengaturan','Konfigurasi runtime diperbarui.');render();toast('Pengaturan runtime berhasil disimpan.','success'); }

  function auditPage(){ const rows=getFilteredAuditLogs(); return appLayout(`<div class="dashboard-head"><div><h2>Log Aktivitas</h2><p>Log keamanan dan akuntabilitas bersifat append-only pada UI. Penghapusan manual dinonaktifkan.</p></div><button class="btn btn-secondary" data-action="export-audit-pdf">${icon('filePdf')} Unduh PDF</button></div><div class="panel filter-panel"><div class="filters audit-filters"><input id="audit-search" class="input" placeholder="Cari pelaku, tindakan, objek, atau keterangan"><input id="audit-month" class="input" type="month"><select id="audit-actor" class="select"><option value="">Semua pelaku</option>${[...new Set(db.auditLogs.map(x=>x.actor))].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="audit-action" class="select"><option value="">Semua tindakan</option>${[...new Set(db.auditLogs.map(x=>x.action))].sort().map(x=>`<option value="${esc(x)}">${esc(humanizeAction(x))}</option>`).join('')}</select></div></div><div class="panel mt-3" id="audit-results">${auditTable(rows,false)}</div>`, 'audit'); }


  function filterAuditPage(){ const target=document.getElementById('audit-results'); if(target)target.innerHTML=auditTable(getFilteredAuditLogs(),false,false); }

  function trafficBreakdown(){
    const events=db.trafficAnalytics?.trafficEvents||[];
    const countBy=(key)=>{const m=new Map();events.forEach(e=>{const k=String(e[key]||'Tidak diketahui');m.set(k,(m.get(k)||0)+1)});const total=Math.max(1,events.length);return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,value:Math.round(count/total*100),count}));};
    const pagesMap=new Map();events.filter(e=>e.area==='public').forEach(e=>pagesMap.set(e.path,(pagesMap.get(e.path)||0)+1));
    const pages=[...pagesMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([path,views])=>({label:path.replace('#/','/')||'/',path,views}));
    return {sources:countBy('source'),devices:countBy('device'),pages};
  }
  function trafficBody(period='day'){
    const summary=trafficSummary(period),live=liveTrafficEvents(30),bd=trafficBreakdown(),sources=bd.sources.length?bd.sources:(db.trafficAnalytics?.sources||[]),devices=bd.devices.length?bd.devices:(db.trafficAnalytics?.devices||[]),pages=bd.pages.length?bd.pages:(db.trafficAnalytics?.topPages||[]);
    return `<div class="metrics">${metric('Pengunjung',summary.visitors,trafficPeriodLabel(period))}${metric('Sesi',summary.sessions,'Interaksi kunjungan')}${metric('Tampilan Halaman',summary.views,'Tampilan pada periode')}${metric('Pengunjung Baru',summary.newVisitors,'Estimasi visitor unik')}</div><div class="traffic-layout mt-3"><div class="panel traffic-chart-card"><div class="toolbar"><div><div class="panel-title">Tren Pengunjung ${trafficPeriodLabel(period)}</div><p class="small muted">Statistik utama dihitung dari event trafik aktual prototype.</p></div><div class="realtime-pulse"><strong>${live.length}</strong><span class="small muted">aktivitas 30 menit terakhir</span></div></div>${trafficBars(period)}<div class="traffic-legend"><span>Pengunjung: ${summary.visitors}</span><span>Sesi: ${summary.sessions}</span><span>Tampilan: ${summary.views}</span></div></div><div class="panel"><div class="panel-title">Sumber Trafik</div><div class="traffic-source-list mt-2">${sources.map(x=>`<div class="traffic-source-row"><strong>${esc(x.name)}</strong><span>${x.value}%</span><div class="traffic-progress"><span style="width:${Math.min(100,x.value)}%"></span></div></div>`).join('')}</div><div class="panel-title mt-3">Perangkat</div><div class="traffic-source-list mt-2">${devices.map(x=>`<div class="traffic-source-row"><strong>${esc(x.name)}</strong><span>${x.value}%</span><div class="traffic-progress"><span style="width:${Math.min(100,x.value)}%"></span></div></div>`).join('')}</div></div></div><div class="panel mt-3"><div class="panel-title">Halaman Publik Teratas</div><div class="table-wrap"><table class="table"><thead><tr><th>Halaman</th><th>Alamat</th><th>Tampilan</th></tr></thead><tbody>${pages.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${esc(x.path)}</td><td>${x.views}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function profilePage(){
    let html=profilePageLegacy(); const u=session.user();
    if(u?.pendingEmail||u?.pendingPhone){const callout=`<div class="info-callout warn-callout mb-3"><strong>Verifikasi kontak baru diperlukan</strong><span>${u.pendingEmail?`Email baru: ${esc(u.pendingEmail)}. `:''}${u.pendingPhone?`Nomor HP baru: ${esc(u.pendingPhone)}. `:''}Kode verifikasi telah dikirim ke pusat notifikasi akun.</span><button class="btn btn-primary btn-sm mt-2" data-action="verify-contact-change">Verifikasi kontak baru</button></div>`;html=html.replace('<form id="profile-form"',callout+'<form id="profile-form"');}
    const datalists=`<datalist id="master-districts">${(db.masterData?.districts||[]).filter(x=>x.active!==false).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist><datalist id="master-villages">${(db.masterData?.villages||[]).filter(x=>x.active!==false).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist><datalist id="master-institutions">${(db.masterData?.institutions||[]).filter(x=>x.active!==false).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>`; html=html.replace('name="originDistrict"','name="originDistrict" list="master-districts"').replace('name="originVillage"','name="originVillage" list="master-villages"').replace(/name="currentInstitution"/g,'name="currentInstitution" list="master-institutions"').replace('</form>',datalists+'</form>');
    const cls=fieldClassification(u.educationLevel); const note=`<div class="panel mt-3"><div class="panel-title">Klasifikasi Data ${esc(u.educationLevel)}</div><p class="small muted"><strong>Wajib sekarang:</strong> ${cls.requiredNow.length} field • <strong>Wajib ketika tersedia:</strong> ${cls.conditional.length} field • <strong>Opsional:</strong> ${cls.optional.length} field.</p></div>`; return html.replace('</main>',note+'</main>');
  }
  function verifyContactChange(){ const u=db.users.find(x=>x.id===session.user()?.id);if(!u||(!u.pendingEmail&&!u.pendingPhone))return toast('Tidak ada perubahan kontak yang menunggu verifikasi.','error'); const code=prompt('Masukkan kode verifikasi kontak baru:');if(code===null)return;if(String(code).trim()!==String(u.contactVerificationToken||'')||Date.now()>Number(u.contactVerificationExpiresAt||0))return toast('Kode tidak valid atau sudah kedaluwarsa.','error'); if(u.pendingEmail){u.email=u.pendingEmail; const p=db.profiles.find(x=>x.userId===u.id);if(p)p.email=u.email;}if(u.pendingPhone){u.phone=u.pendingPhone;const p=db.profiles.find(x=>x.userId===u.id);if(p)p.phone=u.phone;} delete u.pendingEmail;delete u.pendingPhone;delete u.contactVerificationToken;delete u.contactVerificationExpiresAt;u.verifiedContact=true;save();audit(u.name,'VERIFIKASI_PERUBAHAN_KONTAK',`pengguna:${u.id}`,'Kontak baru berhasil diverifikasi.');render();toast('Kontak baru berhasil diverifikasi.','success'); }

  function accountSecurityModal(){ const user=session.user(), sessions=db.privilegedSessions.filter(s=>s.userId===user.id&&s.active&&s.expiresAt>Date.now()); openModal(`<div class="modal-head"><div><h3>Keamanan & Sesi</h3><p class="small muted">Kelola kata sandi dan sesi akun.</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><form id="change-password-form" class="stack"><div class="form-grid">${fieldHTML('Kata sandi saat ini','currentPassword','','password')}${fieldHTML('Kata sandi baru','newPassword','','password')}${fieldHTML('Ulangi kata sandi baru','confirmPassword','','password')}</div><button class="btn btn-primary" type="submit">Ubah kata sandi</button></form><div class="panel mt-3"><div class="panel-title">Sesi Aktif</div><div class="list">${sessions.map(s=>`<div class="list-row"><div><strong>${esc(s.device||'Peramban')}</strong><span>${fmtDate(s.lastSeen,true)} • berakhir ${fmtDate(s.expiresAt,true)}</span></div></div>`).join('')||'<div class="empty compact-empty">Tidak ada sesi aktif lain.</div>'}</div><button class="btn btn-danger mt-2" data-action="logout-all-sessions">Keluar dari semua perangkat</button></div>`); setTimeout(()=>document.getElementById('change-password-form')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),live=db.users.find(x=>x.id===user.id),old=String(fd.get('currentPassword')||''),nw=String(fd.get('newPassword')||''),cf=String(fd.get('confirmPassword')||'');if(old!==live.password)return toast('Kata sandi saat ini tidak sesuai.','error');if(nw.length<8||!/[A-Za-z]/.test(nw)||!/\d/.test(nw))return toast('Kata sandi baru minimal 8 karakter serta mengandung huruf dan angka.','error');if(nw!==cf)return toast('Konfirmasi kata sandi tidak sama.','error');live.password=nw;save();audit(live.name,'UBAH_KATA_SANDI',`pengguna:${live.id}`,'Kata sandi diperbarui dari pusat keamanan akun.');toast('Kata sandi berhasil diubah.','success');e.currentTarget.reset();}),0); }

  function resetPasswordPage(){ let hint={};try{hint=JSON.parse(sessionStorage.getItem('talenta_nduga_reset_hint')||'{}')}catch(_){} return authLayout('Atur Ulang Kata Sandi','Masukkan token pemulihan dan kata sandi baru. Token demo berlaku 15 menit dan hanya sekali pakai.',`<form id="reset-password-form" class="auth-form"><div class="field"><label>Email</label><input class="input" type="email" name="email" value="${esc(hint.email||'')}" required></div><div class="field"><label>Token pemulihan</label><input class="input" name="token" value="${esc(hint.token||'')}" required></div><div class="field"><label>Kata sandi baru</label><input class="input" type="password" name="password" minlength="8" required></div><button class="btn btn-primary" type="submit">Simpan kata sandi baru</button></form>`); }

  function openStaffNotificationCenter(){ const u=session.user(), rows=dashboardNotifications(u); openModal(`<div class="modal-head"><div><h3>Pusat Notifikasi</h3><p class="small muted">Riwayat notifikasi staf sesuai peran dan cakupan akses.</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><div class="notification-history-list">${rows.map(n=>`<button class="notification-item ${(n.readBy||[]).includes(u.id)?'':'unread'}" data-action="open-dashboard-notification" data-id="${n.id}"><div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${fmtDate(n.createdAt,true)}</small></div></button>`).join('')||'<div class="empty">Belum ada notifikasi.</div>'}</div>`); }

  function runGlobalSearch(query){ const user=session.user(), q=String(query||'').trim().toLowerCase();if(q.length<2)return toast('Masukkan minimal 2 karakter.','error');const results=[];const add=(type,title,subtitle,href)=>results.push({type,title,subtitle,href}); availableMenus(user).forEach(([key,label])=>{if(`${label} ${key}`.toLowerCase().includes(q))add('Menu',label,'Navigasi dashboard',`#/${user.role}/${key}`)}); if(user.role!=='user'){studentRecords().filter(({user:u,profile,docs})=>JSON.stringify({u,profile,docs,educations:db.educations.filter(e=>e.userId===u.id)}).toLowerCase().includes(q)&&canReviewStudent(u.id)).slice(0,10).forEach(({user:u,profile})=>add('Pelajar/Mahasiswa',u.name,`${u.educationLevel} • ${profile.currentInstitution||'—'}`,`#/${user.role}/students/${u.id}`)); db.users.filter(u=>u.role!=='user'&&JSON.stringify(u).toLowerCase().includes(q)).slice(0,6).forEach(u=>add('Pegawai',u.name,`${u.nip||'—'} • ${u.bidang||'—'} • ${u.jabatan||'—'}`,user.role==='superadmin'?'#/superadmin/privileged-users':`#/${user.role}/dashboard`)); if(['admin','superadmin'].includes(user.role))db.inquiries.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).slice(0,5).forEach(x=>add('Pesan Masuk',x.subject,`${x.name} • ${x.email}`,`#/${user.role}/inbox`)); }
    else { const p=currentProfile(); if(JSON.stringify({profile:p,education:db.educations.filter(e=>e.userId===user.id),documents:currentDocuments(),notifications:db.notifications.filter(n=>n.userId===user.id)}).toLowerCase().includes(q))add('Data Saya','Profil, pendidikan, dokumen & notifikasi','Data akun sendiri','#/user/dashboard'); }
    db.scholarships.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).slice(0,6).forEach(x=>add('Beasiswa',x.title,x.provider,'#/beasiswa')); if(user.role==='superadmin'){if(JSON.stringify(db.systemSettings).toLowerCase().includes(q))add('Pengaturan','Konfigurasi Sistem','Nilai konfigurasi runtime','#/superadmin/settings'); db.auditLogs.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).slice(0,5).forEach(x=>add('Log Aktivitas',humanizeAction(x.action),`${x.actor} • ${x.detail||x.entity}`,'#/superadmin/audit'));} openModal(`<div class="modal-head"><div><h3>Hasil Pencarian</h3><p class="small muted">Index dibangun dari data yang boleh diakses oleh peran aktif.</p></div><button class="modal-close" data-action="close-modal">${icon('close')}</button></div><div class="search-results">${results.length?results.slice(0,24).map(r=>`<div class="search-result-item"><div><span>${esc(r.type)}</span><strong>${esc(r.title)}</strong><small>${esc(r.subtitle||'')}</small></div><a class="btn btn-secondary btn-sm" href="${r.href}" data-action="close-modal">Buka</a></div>`).join(''):'<div class="empty">Tidak ditemukan.</div>'}</div>`); }

  function openModal(html) {
    closeModal();
    const element = document.createElement('div');
    element.className = 'modal-backdrop';
    element.id = 'modal-root';
    element.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(element);
    setTimeout(() => hydrateStoredMedia(element), 0);
  }

  function closeModal() { document.getElementById('modal-root')?.remove(); }

  function closePublicDropdowns(except = null) {
    document.querySelectorAll('.public-nav-group[open]').forEach(group => {
      if (group !== except) group.open = false;
    });
  }

  function setPublicMenuOpen(open) {
    mobileNavOpen = open;
    document.getElementById('public-navigation')?.classList.toggle('open', open);
    const toggle = document.getElementById('public-menu-toggle');
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', `${open ? 'Tutup' : 'Buka'} navigasi`);
    if (!open) closePublicDropdowns();
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !document.getElementById('public-navigation')) return;
    const group = document.querySelector('.public-nav-group[open]');
    if (group) {
      closePublicDropdowns();
      group.querySelector('summary')?.focus();
      event.preventDefault();
    } else if (mobileNavOpen) {
      setPublicMenuOpen(false);
      document.getElementById('public-menu-toggle')?.focus();
      event.preventDefault();
    }
  });

  document.addEventListener('focusin', event => {
    if (!document.getElementById('public-navigation')) return;
    closePublicDropdowns(event.target.closest('.public-nav-group'));
    if (mobileNavOpen && !event.target.closest('.site-header')) setPublicMenuOpen(false);
  });

  document.addEventListener('click', async event => {
    if (document.getElementById('public-navigation')) {
      closePublicDropdowns(event.target.closest('.public-nav-group'));
      if (event.target.closest('.public-nav a') || (mobileNavOpen && !event.target.closest('.site-header'))) setPublicMenuOpen(false);
    }
    if (notificationMenuOpen && !event.target.closest('.notification-menu-wrap')) { notificationMenuOpen = false; document.querySelector('.notification-menu-wrap')?.classList.remove('open'); }
    if (accountMenuOpen && !event.target.closest('.account-menu-wrap')) {
      accountMenuOpen = false;
      document.querySelector('.account-menu-wrap')?.classList.remove('open');
      document.querySelector('.account-trigger')?.setAttribute('aria-expanded', 'false');
    }
    const element = event.target.closest('[data-action]');
    if (!element) return;
    const action = element.dataset.action;
    const id = element.dataset.id;
    if (!authorize(action, id, element.dataset.type)) return;

    if (action === 'toggle-public-menu') {
      setPublicMenuOpen(!mobileNavOpen);
      return;
    }
    if (action === 'toggle-sidebar') {
      if (window.matchMedia('(max-width: 980px)').matches) {
        document.getElementById('sidebar')?.classList.toggle('open');
        document.body.classList.toggle('sidebar-open');
      } else {
        sidebarCollapsed = !sidebarCollapsed;
        localStorage.setItem(SIDEBAR_STATE_KEY, sidebarCollapsed ? '1' : '0');
        accountMenuOpen = false;
        render();
      }
      return;
    }
    if (action === 'toggle-account-menu') {
      accountMenuOpen = !accountMenuOpen;
      document.querySelector('.account-menu-wrap')?.classList.toggle('open', accountMenuOpen);
      element.setAttribute('aria-expanded', accountMenuOpen ? 'true' : 'false');
      return;
    }
    if (action === 'toggle-theme') return toggleTheme();
    if (action === 'toggle-dashboard-notifications') {
      notificationMenuOpen = !notificationMenuOpen;
      document.querySelector('.notification-menu-wrap')?.classList.toggle('open', notificationMenuOpen);
      element.setAttribute('aria-expanded', notificationMenuOpen ? 'true' : 'false');
      return;
    }
    if (action === 'mark-dashboard-notifications-read') return markDashboardNotificationsRead();
    if (action === 'open-dashboard-notification') return openDashboardNotification(id);
    if (action === 'reset-student-filters') return resetStudentFilters();
    if (action === 'account-profile-view') return accountProfileViewModal();
    if (action === 'account-profile-edit') return accountProfileEditModal();
    if (action === 'account-photo') return accountPhotoModal();
    if (action === 'remove-profile-photo') {
      const user = session.user();
      const live = db.users.find(item => item.id === user?.id);
      if (live) {
        if (live.profilePhotoBlobKey) await fileStore.delete(live.profilePhotoBlobKey);
        delete live.profilePhoto; delete live.profilePhotoBlobKey; delete live.profilePhotoName; delete live.profilePhotoMime; delete live.profilePhotoSize;
        save(); audit(live.name, 'HAPUS_FOTO_PROFIL', `pengguna:${live.id}`, 'Foto profil dihapus.'); closeModal(); render(); toast('Foto profil berhasil dihapus.', 'success');
      }
      return;
    }
    if (action === 'account-security') return accountSecurityModal();
    if (action === 'verify-contact-change') return verifyContactChange();
    if (action === 'logout') return logout('Anda telah keluar dari sistem.');
    if (action === 'close-modal') return closeModal();
    if (action === 'toggle-faq') return element.closest('.faq-item')?.classList.toggle('open');
    if (action === 'scholarship-detail') return scholarshipDetail(id);
    if (action === 'review-user') return reviewModal(id);
    if (action === 'view-user') return viewUserModal(id);
    if (action === 'inspect-document') return inspectDocumentModal(id);
    if (action === 'open-document-file') return openDocumentFile(id);
    if (action === 'delete-document') return deleteDocumentPrompt(id);
    if (action === 'confirm-delete-document') return deleteDocumentConfirmed(id);
    if (action === 'select-replacement') return selectReplacementFile(id);
    if (action === 'send-replacement') return sendReplacementDocument(id);
    if (action === 'delete-notification') return deleteNotification(id);
    if (action === 'open-user-notification') return openUserNotification(id);
    if (action === 'download-notifications') return downloadNotifications();
    if (action === 'set-document-status') return setDocumentReviewStatus(id, element.dataset.status);
    if (action === 'verify-student-profile') return verifyStudentProfile(id);
    if (action === 'request-student-revision') return requestStudentRevision(id);
    if (action === 'add-scholarship') return scholarshipFormModal();
    if (action === 'edit-scholarship') return scholarshipFormModal(db.scholarships.find(item => item.id === Number(id)));
    if (action === 'delete-scholarship') return deleteScholarship(id);
    if (action === 'export-scholarships-pdf') return exportScholarshipsPdf();
    if (action === 'generic-delete') return deleteGenericContent(element.dataset.type, id);
    if (action === 'toggle-content-publish') return toggleContentPublish(element.dataset.type, id);
    if (action === 'export-content-pdf') return exportCollectionPdf(element.dataset.type);
    if (action === 'export-privileged-users-pdf') return exportPrivilegedUsersPdf();
    if (action === 'delete-privileged-user') return deletePrivilegedUser(id);
    if (action === 'export-audit-pdf') return exportAuditPdf();
    if (action === 'delete-audit-log' || action === 'delete-all-audit-logs') return toast('Log aktivitas bersifat append-only dan tidak dapat dihapus dari UI.', 'error');
    if (action === 'save-system-settings') return saveSystemSettings();
    if (action === 'export-summary-report-pdf') return exportSummaryReportPdf();
    if (action === 'export-users-pdf') return exportUsersPdf(element.dataset.scope || 'all');
    if (action === 'export-users-excel') return exportUsersExcel(element.dataset.scope || 'all');
    if (action === 'export-students-pdf') return exportStudentsPdf();
    if (action === 'export-students-excel') return exportStudentsExcel();

    if (action === 'edit-education') return educationModal(id);
    if (action === 'delete-education') return deleteEducation(id);
    if (action === 'set-primary-education') return setPrimaryEducation(id);
    if (action === 'privacy-request-status') { if(!authorize(action,id))return; const req=(db.privacyRequests||[]).find(x=>x.id===Number(id)); if(!req)return; req.status=element.dataset.status||'processing'; req.handledBy=session.user().name; req.updatedAt=now(); save(); audit(session.user().name,'UBAH_STATUS_PRIVASI',`permintaan:${req.id}`,req.status); render(); toast('Status permintaan privasi diperbarui.','success'); return; }
    if (action === 'privacy-request') { const type=element.dataset.type; db.privacyRequests.unshift({id:uid(),userId:session.user().id,type,status:'submitted',createdAt:now()}); save(); audit(session.user().name,'PERMINTAAN_PRIVASI',`pengguna:${session.user().id}`,type); render(); toast('Permintaan privasi berhasil diajukan.','success'); return; }
    if (action === 'open-staff-notification-center') return openStaffNotificationCenter();
    if (action === 'master-add') return masterModal(element.dataset.type);
    if (action === 'master-edit') return masterModal(element.dataset.type,id);
    if (action === 'master-toggle') { const list=db.masterData?.[element.dataset.type]; const item=list?.find(x=>String(x.id)===String(id)); if(item){item.active=item.active===false?true:false;save();audit(session.user().name,'UBAH_STATUS_MASTER',`master:${element.dataset.type}:${id}`,`${item.name}: ${item.active?'aktif':'nonaktif'}`);render();} return; }
    if (action === 'inquiry-note') { const item=db.inquiries.find(x=>x.id===Number(id)); if(!item)return; const note=prompt('Catatan tindak lanjut:',item.responseNote||''); if(note===null)return; item.responseNote=note.trim();item.handledBy=session.user().name;item.updatedAt=now();save();audit(session.user().name,'CATAT_INQUIRY',`inquiry:${item.id}`,item.subject);render();return; }
    if (action === 'claim-review') { const item=db.verificationQueue.find(x=>x.id===Number(id)); if(item){item.assignedTo=session.user().id;item.assignedToName=session.user().name;item.claimedAt=now(); if(item.status==='submitted')item.status='in_review';save();audit(session.user().name,'KLAIM_VERIFIKASI',`queue:${item.id}`,item.userName);render();} return; }
    if (action === 'logout-all-sessions') { db.privilegedSessions.filter(s=>s.userId===session.user().id).forEach(s=>s.active=false); save(); audit(session.user().name,'KELUAR_SEMUA_SESI',`pengguna:${session.user().id}`,'Semua sesi dicabut.'); session.clear(); closeModal(); location.hash='#/masuk'; return; }

    if (action === 'toggle-bookmark') {
      const user = session.user(); if (!user || user.role !== 'user') return toast('Masuk sebagai pelajar atau mahasiswa untuk menyimpan beasiswa.', 'error');
      const scholarshipId = Number(id);
      const index = db.bookmarks.findIndex(item => item.userId === user.id && item.scholarshipId === scholarshipId);
      if (index >= 0) { db.bookmarks.splice(index, 1); toast('Beasiswa dihapus dari daftar tersimpan.', 'success'); }
      else { db.bookmarks.push({ id: uid(), userId: user.id, scholarshipId }); toast('Beasiswa berhasil disimpan.', 'success'); }
      save(); render(); return;
    }

    if (action === 'create-reminder') { return reminderModal(id); }

    if (action === 'cancel-reminder') {
      const reminder = db.reminders.find(item => item.id === Number(id));
      if (reminder && reminder.status === 'scheduled') { reminder.status = 'canceled'; save(); audit(session.user().name, 'BATAL_PENGINGAT', `pengingat:${reminder.id}`); render(); toast('Pengingat dibatalkan.', 'success'); }
      return;
    }

    if (action === 'save-profile') return saveProfile(true);

    if (action === 'submit-verification') {
      saveProfile(false);
      const profile = currentProfile();
      const user = session.user();
      const docs = currentDocuments();
      if (profile.completeness < 100) return toast('Lengkapi seluruh data wajib sesuai jenjang sebelum mengajukan verifikasi.', 'error');
      const missingDocs = missingRequiredDocuments(user.educationLevel, docs);
      if (missingDocs.length) return toast(`Lengkapi dokumen wajib: ${missingDocs.join(', ')}.`, 'error');
      if (['submitted', 'in_review'].includes(profile.profileStatus)) return toast('Profil sudah berada dalam proses verifikasi.', 'error');
      profile.profileStatus = 'submitted';
      let queue = db.verificationQueue.find(item => item.userId === user.id);
      const payload = { userName: profile.fullName, educationLevel: user.educationLevel, district: profile.originDistrict, institution: profile.currentInstitution, status: 'submitted', submittedAt: now(), slaHours: 0, note: '' };
      if (queue) Object.assign(queue, payload); else db.verificationQueue.unshift({ id: uid(), userId: user.id, ...payload });
      notifyStaff(['operator','admin','superadmin'], 'Pengajuan verifikasi baru', `${profile.fullName} (${user.educationLevel}) mengajukan verifikasi profil.`, 'info', 'students', user.id);
      save(); audit(user.name, 'AJUKAN_VERIFIKASI', `profil:${profile.id}`, `Jenjang ${user.educationLevel}`); render(); toast('Profil berhasil diajukan untuk verifikasi.', 'success'); return;
    }

    if (action === 'add-education') return educationModal();

    if (false && action === 'add-education') {
      const user = session.user();
      openModal(`<div class="modal-head"><h3>Tambah Riwayat Pendidikan</h3><button class="modal-close" data-action="close-modal" aria-label="Tutup">${icon('close')}</button></div><form id="education-form" class="stack">${fieldHTML('Institusi', 'institution', '')}${fieldHTML('Program/Jurusan', 'program', '')}${selectHTML('Jenjang', 'level', LEVELS, user.educationLevel)}${fieldHTML('Nomor Induk/NIM', 'studentNumber', '')}${fieldHTML('Tahun Masuk', 'entryYear', new Date().getFullYear(), 'number')}<label class="consent-line"><input type="checkbox" name="isPrimary"><span>Jadikan sebagai pendidikan utama</span></label><button class="btn btn-primary" type="submit">Simpan</button></form>`);
      setTimeout(() => document.getElementById('education-form')?.addEventListener('submit', event => {
        event.preventDefault();
        if (!authorize('add-education') || session.user().id !== user.id) return;
        const fd = new FormData(event.currentTarget);
        const isPrimary = fd.has('isPrimary');
        if (isPrimary) db.educations.filter(item => item.userId === user.id).forEach(item => item.isPrimary = false);
        db.educations.push({ id: uid(), userId: user.id, institution: String(fd.get('institution') || '').trim(), program: String(fd.get('program') || '').trim(), level: String(fd.get('level') || ''), studentNumber: String(fd.get('studentNumber') || '').trim(), entryYear: Number(fd.get('entryYear') || new Date().getFullYear()), status: 'Aktif', isPrimary });
        save(); audit(user.name, 'TAMBAH_PENDIDIKAN', `pengguna:${user.id}`, String(fd.get('institution'))); closeModal(); render(); toast('Riwayat pendidikan berhasil ditambahkan.', 'success');
      }), 0);
      return;
    }

    if (action === 'upload-document') return uploadDocumentAction();

    if (action === 'save-resume') {
      const form = document.getElementById('resume-form'); const profile = currentProfile(); if (!form || !profile) return;
      const fd = new FormData(form);
      profile.resume.summary = String(fd.get('summary') || '').trim();
      profile.resume.skills = String(fd.get('skills') || '').split(',').map(item => item.trim()).filter(Boolean); ['experiences','organizations','projects','achievements'].forEach(key=>profile.resume[key]=String(fd.get(key)||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
      profile.privacy.showOriginDistrict = fd.has('showOrigin'); profile.privacy.showInstitution = fd.has('showInstitution');
      save(); audit(session.user().name, 'SIMPAN_RIWAYAT_HIDUP', `profil:${profile.id}`); render(); toast('Riwayat hidup berhasil disimpan.', 'success'); return;
    }

    if (action === 'toggle-resume-publish') {
      const profile = currentProfile();
      if (!profile.resume.published && !document.getElementById('resume-consent')?.checked) return toast('Persetujuan publikasi wajib dicentang.', 'error');
      profile.resume.slug = profile.resume.slug || slugify(profile.fullName); profile.resume.published = !profile.resume.published; profile.privacy.publicResume = profile.resume.published; save();
      audit(session.user().name, profile.resume.published ? 'TERBITKAN_RIWAYAT_HIDUP' : 'CABUT_RIWAYAT_HIDUP', `profil:${profile.id}`);
      render(); toast(profile.resume.published ? 'Riwayat hidup berhasil diterbitkan.' : 'Publikasi riwayat hidup telah dicabut.', 'success'); return;
    }

    if (action === 'print-resume') return window.print();

    if (action === 'save-privacy') {
      const profile = currentProfile(); if (!profile) return;
      document.querySelectorAll('[data-privacy]').forEach(input => { profile.privacy[input.dataset.privacy] = input.checked; });
      save(); audit(session.user().name, 'UBAH_PRIVASI', `profil:${profile.id}`); toast('Pengaturan privasi berhasil disimpan.', 'success'); return;
    }

    if (action === 'mark-all-read') {
      db.notifications.filter(item => item.userId === session.user().id).forEach(item => item.read = true); save(); render(); return;
    }

    if (action === 'approve-review') {
      const queue = db.verificationQueue.find(item => item.id === Number(id));
      if (!queue) return;
      const targetUser = db.users.find(item => item.id === queue.userId);
      const profile = db.profiles.find(item => item.userId === queue.userId);
      const docs = db.documents.filter(item => item.userId === queue.userId);
      const readiness = targetUser && profile ? studentVerificationReadiness(targetUser, profile, docs) : null;
      if (!readiness?.ready) return toast('Profil belum siap diverifikasi. Periksa data wajib dan verifikasi seluruh dokumen minimum terlebih dahulu.', 'error');
      const note = String(document.getElementById('review-note')?.value || 'Data identitas, pendidikan, dan dokumen wajib telah diperiksa.').trim();
      createVerificationSnapshot(queue.userId,'verified',note); queue.status = 'verified'; queue.note = note;
      profile.profileStatus = 'verified'; profile.lastReviewNote = note;
      notifyUser(queue.userId, 'Profil telah diverifikasi', note, 'success', 'profile');
      save(); audit(session.user().name, 'VERIFIKASI_DISETUJUI', `pengguna:${queue.userId}`, note); closeModal(); render(); toast('Profil berhasil diverifikasi.', 'success'); return;
    }

    if (action === 'revision-review') {
      const note = String(document.getElementById('review-note')?.value || '').trim();
      if (!note) return toast('Catatan perbaikan wajib diisi.', 'error');
      const queue = db.verificationQueue.find(item => item.id === Number(id)); if (!queue) return;
      createVerificationSnapshot(queue.userId,'needs_revision',note); queue.status = 'needs_revision'; queue.note = note;
      const profile = db.profiles.find(item => item.userId === queue.userId); if (profile) { profile.profileStatus = 'needs_revision'; profile.lastReviewNote = note; }
      notifyUser(queue.userId, 'Profil perlu diperbaiki', note, 'warning', 'profile');
      save(); audit(session.user().name, 'MINTA_PERBAIKAN', `pengguna:${queue.userId}`, note); closeModal(); render(); toast('Permintaan perbaikan berhasil dikirim.', 'success'); return;
    }

    if (action === 'toggle-user-status') {
      const current = session.user();
      if (!['admin', 'superadmin'].includes(current?.role)) return toast('Anda tidak memiliki kewenangan untuk tindakan ini.', 'error');
      const target = db.users.find(item => item.id === Number(id)); if (!canManageUser(target)) return;
      target.status = target.status === 'suspended' ? (target.verifiedContact ? 'active' : 'pending_verification') : 'suspended';
      if (target.status === 'suspended') db.privilegedSessions.filter(item => item.userId === target.id).forEach(item => item.active = false);
      save(); audit(current.name, target.status === 'suspended' ? 'NONAKTIFKAN_PENGGUNA' : 'AKTIFKAN_PENGGUNA', `pengguna:${target.id}`, target.email); render(); toast(`Akun ${target.name} ${target.status === 'suspended' ? 'dinonaktifkan' : 'diaktifkan'}.`, 'success'); return;
    }

    if (action === 'revoke-session') {
      const actor = session.user();
      const target = db.privilegedSessions.find(item => String(item.id) === String(id));
      if (target?.active) { target.active = false; save(); audit(actor.name, 'CABUT_SESI', `sesi:${target.id}`, target.email); closeModal(); render(); toast('Sesi berhasil dicabut.', 'success'); }
      return;
    }

    if (action === 'save-export-permissions') {
      db.exportPermissions = {
        admin: !!document.getElementById('export-permission-admin')?.checked,
        operator: !!document.getElementById('export-permission-operator')?.checked
      };
      save(); audit(session.user().name, 'UBAH_IZIN_UNDUH', 'peran', `Administrator: ${db.exportPermissions.admin}; Operator: ${db.exportPermissions.operator}`);
      render(); toast('Izin unduh berhasil disimpan.', 'success'); return;
    }

    if (action === 'generic-add') return contentFormModal(element.dataset.type);
    if (action === 'generic-edit') { const type = element.dataset.type; const item = db[type]?.find(row => row.id === Number(id)); return contentFormModal(type, item); }
    if (action === 'add-privileged-user') return privilegedUserModal();
    if (action === 'edit-privileged-user') return privilegedUserModal(id);
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) { closeModal(); render(); }
  });
  function checkSession() {
    if (!sessionStorage.getItem(SESSION_KEY)) return;
    db = store.load();
    if (!session.user()) { closeModal(); render(); }
  }
  window.addEventListener('focus', checkSession);
  setInterval(checkSession, 15000);

  window.addEventListener('hashchange', () => {
    mobileNavOpen = false;
    accountMenuOpen = false;
    notificationMenuOpen = false;
    document.body.classList.remove('sidebar-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
    render();
  });

  render();
})();
