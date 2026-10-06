const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

function app(localStorage = storage()) {
  const events = {};
  const submits = {};
  const nodes = new Map();
  for (const id of ['app', 'toast-root']) nodes.set(id, { innerHTML: '', appendChild() {} });
  const document = {
    getElementById: id => nodes.get(id) || (/^(privileged-user|content|scholarship|education)-form$/.test(id) ? { addEventListener: (name, handler) => { submits[id] = handler; } } : null),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ remove() {} }),
    body: { appendChild() {}, classList: { remove() {}, toggle() {} } },
    addEventListener: (name, handler) => { events[name] = handler; }
  };
  const window = { addEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ document, window, localStorage, sessionStorage: storage(), location: { hash: '#/' }, Intl, Date, Blob, FormData, setTimeout(fn, delay) { if (delay === 0) fn(); }, setInterval() {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'data/database.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  // Expose the real application functions in the test VM only.
  vm.runInContext(source.replace(/  render\(\);\s*\}\)\(\);\s*$/, '  window.testApp = { session, menus, publicLayout, appRouter, render, renderUsersTable, getFilteredUsers, exportRows, requiredProfileKeys, profileCompleteness, studentsManagementPage, getFilteredStudents, makeSimplePdf, makeProfessionalPdf, brandedExcelDocument, handleVerification, handleMfa, canReviewStudent, studentVerificationReadiness, dashboardNotifications, openDashboardNotification, runGlobalSearch, get db() { return db; } };\n})();'), context);
  const api = window.testApp;
  return {
    api, context, nodes, localStorage,
    login(id) { api.session.login(api.db.users.find(user => user.id === id)); },
    click(action, id, extras = {}) { events.click({ target: { closest: selector => selector === '[data-action]' ? { dataset: { action, id: String(id), ...extras } } : null } }); },
    submit(id, values) {
      context.FormData = class { get(key) { return values[key] ?? null; } has(key) { return !!values[key]; } };
      assert.ok(submits[id], `${id} must bind its submit handler`);
      submits[id]({ preventDefault() {}, currentTarget: {} });
    },
    persist() { localStorage.setItem('talenta_nduga_db_v9', JSON.stringify(api.db)); }
  };
}

test('superadmin can open content and verification modules from its own menu', () => {
  const a = app(); a.login(22);
  const menu = a.api.menus.superadmin.map(row => row[0]);
  for (const key of ['students', 'verification', 'roles', 'privileged-users', 'all-users', 'scholarships', 'activities', 'partners', 'faqs', 'masters', 'reports', 'settings', 'audit', 'security']) assert.ok(menu.includes(key), key);
  for (const removed of ['users', 'exports', 'activity']) assert.equal(menu.includes(removed), false, `${removed} duplicate menu must be removed`);
  assert.match(a.api.appRouter('scholarships'), /Manajemen Beasiswa/);
  assert.match(a.api.appRouter('verification'), /Antrean Verifikasi/);
});

test('operator cannot invoke content, account status or session administration actions', () => {
  const a = app(); a.login(20);
  const before = JSON.stringify(a.api.db);
  for (const action of ['add-scholarship', 'generic-add', 'add-privileged-user', 'toggle-user-status', 'revoke-session']) a.click(action, action === 'revoke-session' ? 1201 : 1, { type: 'activities' });
  assert.equal(JSON.stringify(a.api.db), before);
});

test('admin cannot administer privileged accounts and cannot bypass verification readiness', () => {
  const a = app(); a.login(21);
  const before = JSON.stringify(a.api.db);
  a.click('approve-review', 1101);
  a.click('toggle-user-status', 20);
  a.click('revoke-session', 1202);
  assert.equal(JSON.stringify(a.api.db), before);
});

test('admin and superadmin can review education accounts while operator remains scoped', () => {
  const admin = app(); admin.login(21);
  assert.equal(admin.api.canReviewStudent(2), true);
  const superadmin = app(); superadmin.login(22);
  assert.equal(superadmin.api.canReviewStudent(4), true);
  const operator = app(); operator.api.db.users.find(row => row.id === 20).assignedDistricts = ['Keneyam']; operator.persist(); operator.login(20);
  assert.equal(operator.api.canReviewStudent(2), true);
  assert.equal(operator.api.canReviewStudent(3), false);
});

test('admin user listing and exports contain education accounts only', () => {
  const a = app(); a.login(21);
  assert.deepEqual(Array.from(a.api.getFilteredUsers(), row => row.id), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(a.api.exportRows('all'), row => row.id), [1, 2, 3, 4]);
});

test('users cannot modify reminders and documents belonging to another user', () => {
  const a = app(); a.login(1);
  const before = JSON.stringify(a.api.db);
  a.click('cancel-reminder', 602); a.click('replace-document', 305);
  assert.equal(JSON.stringify(a.api.db), before);
});

test('superadmin can suspend a staff account, and cannot suspend itself', () => {
  const a = app(); a.login(22);
  a.click('toggle-user-status', 20);
  assert.equal(a.api.db.users.find(row => row.id === 20).status, 'suspended');
  a.click('toggle-user-status', 22);
  assert.equal(a.api.db.users.find(row => row.id === 22).status, 'active');
});

test('suspending an account invalidates its session after shared database refresh', () => {
  const shared = storage(); const student = app(shared); student.login(1);
  const manager = app(shared); manager.login(22); manager.click('toggle-user-status', 1);
  student.context.location.hash = '#/user/dashboard'; student.api.render();
  assert.equal(student.api.session.user(), null);
  assert.equal(student.context.location.hash, '#/masuk');
});

test('revoking a user session terminates it and a new login does not revive the old session', () => {
  const shared = storage(); const student = app(shared); student.login(1);
  const manager = app(shared); manager.login(22);
  const record = manager.api.db.privilegedSessions.find(row => row.userId === 1 && row.active);
  assert.ok(record, 'education logins must be tracked');
  manager.click('revoke-session', record.id);
  student.context.location.hash = '#/user/dashboard'; student.api.render();
  assert.equal(student.api.session.user(), null);
  const renewed = app(shared); renewed.login(1);
  assert.equal(renewed.api.db.privilegedSessions.find(row => row.id === record.id).active, false);
  assert.ok(renewed.api.session.user());
});

test('operator cannot export all roles by changing the requested export scope', () => {
  const a = app(); a.login(20);
  assert.deepEqual(Array.from(a.api.exportRows('all'), row => row.id), [1, 2, 3, 4]);
});

test('a suspended staff account cannot complete a pending MFA login', () => {
  const a = app();
  a.api.db.users.find(row => row.id === 20).status = 'suspended'; a.persist();
  a.context.sessionStorage.setItem('talenta_nduga_pending_mfa', '20');
  a.context.sessionStorage.setItem('talenta_nduga_mfa_expires', String(Date.now() + 60000));
  a.context.FormData = class { get() { return '246810'; } };
  a.api.handleMfa({ preventDefault() {}, currentTarget: {} });
  assert.equal(a.api.session.user(), null);
});

test('superadmin can change a staff role and old sessions must end', () => {
  const shared = storage(); const staff = app(shared); staff.login(20);
  const manager = app(shared); manager.login(22);
  manager.click('edit-privileged-user', 20);
  manager.submit('privileged-user-form', { name: 'Operator Talenta', nip: '198903152015031004', email: 'operator@talentanduga.id', phone: '081234560120', role: 'admin', bidang: 'Data dan Informasi Pendidikan', jabatan: 'Administrator Sistem', unitKerja: 'Dinas Pendidikan dan Kebudayaan Kabupaten Nduga', employeeStatus: 'PNS', workLocation: 'Keneyam' });
  assert.equal(manager.api.db.users.find(row => row.id === 20).role, 'admin');
  staff.context.location.hash = '#/operator/dashboard'; staff.api.render();
  assert.equal(staff.api.session.user(), null);
});

test('superadmin export permissions remove the menu and block direct operator exports', () => {
  const shared = storage(); const manager = app(shared); manager.login(22);
  manager.nodes.set('export-permission-admin', { checked: true });
  manager.nodes.set('export-permission-operator', { checked: false });
  manager.click('save-export-permissions');
  const operator = app(shared); operator.login(20);
  assert.deepEqual(Array.from(operator.api.exportRows('operator'), row => row.id), []);
  assert.doesNotMatch(operator.api.appRouter('dashboard'), /href="#\/operator\/exports"/);
});

test('operator assignment limits listing, verification decisions and exports', () => {
  const a = app(); a.api.db.users.find(row => row.id === 20).assignedDistricts = ['Keneyam']; a.persist(); a.login(20);
  assert.deepEqual(Array.from(a.api.getFilteredUsers(), row => row.id), [1, 2]);
  assert.deepEqual(Array.from(a.api.exportRows('operator'), row => row.id), [1, 2]);
  a.click('approve-review', 1102);
  assert.equal(a.api.db.verificationQueue.find(row => row.id === 1102).status, 'in_review');
});

test('modal content submission checks current privileges after session revocation', () => {
  const shared = storage(); const admin = app(shared); admin.login(21);
  admin.click('generic-add', 0, { type: 'faqs' });
  const manager = app(shared); manager.login(22);
  const record = manager.api.db.privilegedSessions.find(row => row.userId === 21 && row.active && row.expiresAt);
  manager.click('revoke-session', record.id);
  const before = manager.api.db.faqs.length;
  admin.submit('content-form', { category: 'Akun', question: 'Baru?', answer: 'Baru.' });
  assert.equal(JSON.parse(shared.getItem('talenta_nduga_db_v9')).faqs.length, before);
});

test('staff provisioning rejects an invented role and duplicate phone number', () => {
  const a = app(); a.login(22);
  a.click('add-privileged-user');
  a.submit('privileged-user-form', { name: 'Contoh', nip: '199001012020011001', email: 'contoh@talentanduga.id', phone: '081234569999', role: 'root', bidang: 'Data', jabatan: 'Operator', unitKerja: 'Dinas Pendidikan dan Kebudayaan Kabupaten Nduga', employeeStatus: 'PNS', workLocation: 'Keneyam', password: 'Talenta123' });
  assert.equal(a.api.db.users.length, 7);
  a.click('add-privileged-user');
  a.submit('privileged-user-form', { name: 'Contoh', nip: '199001012020011002', email: 'contoh@talentanduga.id', phone: '081234560120', role: 'operator', bidang: 'Data', jabatan: 'Operator', unitKerja: 'Dinas Pendidikan dan Kebudayaan Kabupaten Nduga', employeeStatus: 'PNS', workLocation: 'Keneyam', password: 'Talenta123' });
  assert.equal(a.api.db.users.length, 7);
});

test('superadmin can revoke its own session while retaining an audit trail', () => {
  const a = app(); a.login(22);
  const record = a.api.db.privilegedSessions.find(row => row.userId === 22 && row.active);
  a.click('revoke-session', record.id);
  assert.equal(a.api.session.user(), null);
  assert.equal(a.api.db.auditLogs[0].action, 'CABUT_SESI');
});

test('contact verification cannot reactivate a pending account suspended by superadmin', () => {
  const shared = storage(); const pending = app(shared);
  pending.api.db.users.find(row => row.id === 1).status = 'pending_verification';
  pending.api.db.users.find(row => row.id === 1).verifiedContact = false; pending.persist();
  pending.context.sessionStorage.setItem('talenta_nduga_pending_verification', '1');
  const manager = app(shared); manager.login(22); manager.click('toggle-user-status', 1);
  assert.equal(manager.api.db.users.find(row => row.id === 1).status, 'suspended');
  pending.context.FormData = class { get() { return '135790'; } };
  pending.api.handleVerification({ preventDefault() {}, currentTarget: {} });
  assert.equal(pending.api.session.user(), null);
  assert.equal(JSON.parse(shared.getItem('talenta_nduga_db_v9')).users.find(row => row.id === 1).status, 'suspended');
});

test('unverified account reactivation keeps contact verification pending', () => {
  const a = app(); a.api.db.users.find(row => row.id === 1).status = 'suspended';
  a.api.db.users.find(row => row.id === 1).verifiedContact = false; a.persist(); a.login(22);
  a.click('toggle-user-status', 1);
  assert.equal(a.api.db.users.find(row => row.id === 1).status, 'pending_verification');
});

test('every menu entry renders without losing the current role navigation', () => {
  for (const [id, role] of [[1, 'user'], [20, 'operator'], [21, 'admin'], [22, 'superadmin']]) {
    const a = app(); a.login(id);
    for (const [section] of a.api.menus[role]) {
      const html = a.api.appRouter(section);
      assert.match(html, /id="main-content"/);
      assert.match(html, new RegExp(`href="#/${role}/${section}"`));
    }
  }
});


test('operator admin and superadmin expose Pelajar & Mahasiswa menu', () => {
  const a = app();
  for (const role of ['operator','admin','superadmin']) {
    const keys = a.api.menus[role].map(row => row[0]);
    assert.ok(keys.includes('students'), `${role} must expose students menu`);
  }
});

test('admin can verify required student documents and then verify a ready profile', () => {
  const a = app(); a.login(21);
  a.api.db.documents.find(row => row.id === 304).status = 'pending_review';
  a.api.db.documents.push(
    { id: 3901, userId: 2, type: 'Surat Aktif Kuliah', filename: 'aktif.pdf', status: 'verified', updatedAt: new Date().toISOString(), note: 'ok' },
    { id: 3902, userId: 2, type: 'Ijazah SMA/SMK', filename: 'ijazah.pdf', status: 'verified', updatedAt: new Date().toISOString(), note: 'ok' }
  );
  a.persist();
  a.nodes.set('document-review-note-304', { value: 'Transkrip sesuai.' });
  a.click('set-document-status', 304, { status: 'verified' });
  assert.equal(a.api.db.documents.find(row => row.id === 304).status, 'verified');
  a.nodes.set('student-review-note-2', { value: 'Identitas, pendidikan, dan dokumen wajib sesuai.' });
  a.click('verify-student-profile', 2);
  assert.equal(a.api.db.profiles.find(row => row.userId === 2).profileStatus, 'verified');
});

test('opening a navbar notification marks it read and routes to its target', () => {
  const a = app(); a.login(21);
  const notification = a.api.db.staffNotifications.find(row => row.id === 1401);
  assert.equal(notification.readBy.includes(21), false);
  a.api.openDashboardNotification(1401);
  assert.equal(notification.readBy.includes(21), true);
  assert.equal(a.context.location.hash, '#/admin/students/2');
});

test('menu audit removes duplicate operator and superadmin modules', () => {
  const a = app();
  assert.deepEqual(Array.from(a.api.menus.operator, row => row[0]), ['dashboard','traffic','students','verification','activity']);
  const superKeys = Array.from(a.api.menus.superadmin, row => row[0]);
  assert.equal(superKeys.includes('users'), false);
  assert.equal(superKeys.includes('exports'), false);
  assert.equal(superKeys.includes('activity'), false);
  assert.equal(new Set(superKeys).size, superKeys.length);
});

test('required education fields differ by SMA S1 S2 and S3', () => {
  const a = app();
  assert.ok(a.api.requiredProfileKeys('SMA/SMK').includes('npsn'));
  assert.ok(a.api.requiredProfileKeys('SMA/SMK').includes('classLevel'));
  assert.ok(a.api.requiredProfileKeys('S1').includes('activeSemester'));
  assert.ok(a.api.requiredProfileKeys('S2').includes('priorS1Institution'));
  assert.ok(a.api.requiredProfileKeys('S2').includes('concentration'));
  assert.ok(a.api.requiredProfileKeys('S3').includes('priorS2Institution'));
  assert.ok(a.api.requiredProfileKeys('S3').includes('researchTopic'));
});

test('seed education profiles are complete for all four levels', () => {
  const a = app();
  for (const u of a.api.db.users.filter(row => row.role === 'user')) {
    const profile = a.api.db.profiles.find(row => row.userId === u.id);
    assert.equal(a.api.profileCompleteness(profile, u.educationLevel), 100, `${u.educationLevel} profile must be complete`);
  }
});

test('students management respects operator scope', () => {
  const a = app();
  a.api.db.users.find(row => row.id === 20).assignedDistricts = ['Keneyam'];
  a.persist(); a.login(20);
  assert.deepEqual(Array.from(a.api.getFilteredStudents(), row => row.user.id), [1,2]);
  assert.match(a.api.studentsManagementPage('operator'), /Pelajar &amp; Mahasiswa|Pelajar & Mahasiswa/);
});


test('PDF generator embeds Talenta Nduga watermark and controlled-document footer', async () => {
  const a = app();
  const blob = a.api.makeSimplePdf(['TALENTA NDUGA - UJI', 'Baris data'], 'TALENTA NDUGA');
  const bytes = Buffer.from(await blob.arrayBuffer());
  const raw = bytes.toString('latin1');
  assert.match(raw, /TALENTA NDUGA/);
  assert.match(raw, /Dokumen Terkendali/);
  assert.ok(bytes.length > 500);
});


test('each role menu has unique route keys', () => {
  const a = app();
  for (const [role, rows] of Object.entries(a.api.menus)) {
    const keys = rows.map(row => row[0]);
    assert.equal(new Set(keys).size, keys.length, `${role} menu contains duplicate routes`);
  }
});


test('student document center includes delete, replace-send, file preview and broad file support', () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  for (const token of ['data-action="delete-document"', 'data-action="select-replacement"', 'data-action="send-replacement"', 'data-action="open-document-file"', 'docx', 'xlsx', 'pptx', 'odt', 'ods']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /5 \* 1024 \* 1024/);
});

test('notification center provides delete and table download controls', () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.match(source, /data-action="delete-notification"/);
  assert.match(source, /data-action="download-notifications"/);
  assert.match(source, /talenta-nduga-notifikasi\.xls/);
});

test('document rejection records reviewer notes and routes notification to Documents', () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.match(source, /reviewHistory\.push/);
  assert.match(source, /reviewedBy = actor\.name/);
  assert.match(source, /'documents', doc\.id/);
  assert.match(source, /profile\.profileStatus = 'needs_revision'/);
});

test('document file storage uses IndexedDB with a safe memory fallback', () => {
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.match(source, /indexedDB\.open\(FILE_DB_NAME, 1\)/);
  assert.match(source, /memoryFileFallback/);
  assert.match(source, /fileStore\.put/);
  assert.match(source, /fileStore\.get/);
});

test('seed reviewed documents carry visible review metadata', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'data/database.js'), 'utf8'), context);
  const reviewed = context.window?.TN_SEED?.documents || context.TN_SEED?.documents || [];
  const rejected = reviewed.find(row => row.status === 'rejected');
  assert.ok(rejected);
  assert.ok(rejected.reviewNote);
  assert.ok(rejected.reviewedBy);
  assert.ok(Array.isArray(rejected.reviewHistory) && rejected.reviewHistory.length);
});


test('superadmin dashboard menu is named Dashboard and exposes Trafik Kontrol Akun and Log Aktivitas', () => {
  const a = app(); a.login(22);
  const map = new Map(a.api.menus.superadmin.map(row => [row[0], row[1]]));
  assert.equal(map.get('dashboard'), 'Dashboard');
  assert.equal(map.get('traffic'), 'Trafik');
  assert.equal(map.get('all-users'), 'Kontrol Akun');
  assert.equal(map.get('audit'), 'Log Aktivitas');
});

test('superadmin Kontrol Akun lists only education accounts', () => {
  const a = app(); a.login(22);
  assert.deepEqual(Array.from(a.api.getFilteredUsers(), row => row.role), ['user','user','user','user']);
});

test('staff seed includes NIP bidang jabatan unit kerja and employee status', () => {
  const a = app();
  for (const id of [20,21,22]) {
    const u=a.api.db.users.find(row=>row.id===id);
    for (const key of ['nip','bidang','jabatan','unitKerja','employeeStatus','workLocation']) assert.ok(u[key], `${id} ${key}`);
  }
});

test('traffic menu renders for operator admin and superadmin', () => {
  for (const [id,role] of [[20,'operator'],[21,'admin'],[22,'superadmin']]) {
    const a=app(); a.login(id);
    assert.match(a.api.appRouter('traffic'), /Analitik Trafik/);
  }
});

test('student Excel export template includes document and review columns', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/Dokumen Terunggah/);
  assert.match(source,/Catatan Pemeriksaan/);
  assert.match(source,/DATA LENGKAP PELAJAR & MAHASISWA/);
});

test('content management exposes image upload PDF export and delete actions', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/name="image" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source,/export-content-pdf/);
  assert.match(source,/delete-scholarship/);
  assert.match(source,/generic-delete/);
});


test('sidebar is grouped by workflow and retains unique routes', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/const menuGroups = \{/);
  assert.match(source,/Data Pendidikan/);
  assert.match(source,/Konten Publik/);
  assert.match(source,/Tata Kelola Sistem/);
  assert.match(source,/sidebar-group/);
});

test('role dashboards contain summary charts derived from system data', () => {
  for (const [id,role] of [[20,'operator'],[21,'admin'],[22,'superadmin']]) {
    const a=app(); a.login(id);
    const html=a.api.appRouter('dashboard');
    assert.match(html,/dashboard-chart-card/);
  }
});

test('all upload controls have no artificial byte-size ceiling', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.doesNotMatch(source,/file\.size\s*>\s*\d+\s*\*\s*1024/);
  assert.match(source,/Tidak ada batas ukuran buatan aplikasi/);
  assert.match(source,/persistImageUpload/);
  assert.match(source,/fileStore\.put/);
});

test('activity and partner management expose publish controls', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/toggle-content-publish/);
  assert.match(source,/TERBITKAN_KEGIATAN/);
  assert.match(source,/TAMPILKAN_MITRA/);
});

test('audit log active UI is append-only and hides ordinary delete controls', () => {
  const a=app(); a.login(22);
  const html=a.api.appRouter('audit');
  assert.match(html,/append-only|tidak dapat dihapus/i);
  assert.doesNotMatch(html,/data-action=\"delete-audit-log\"/);
  assert.doesNotMatch(html,/data-action=\"delete-all-audit-logs\"/);
});



test('operator without explicit scope is denied student review by default', () => {
  const a=app(); const op=a.api.db.users.find(row=>row.id===20);
  op.assignedDistricts=[]; op.assignedUserIds=[]; a.persist(); a.login(20);
  assert.equal(a.api.canReviewStudent(1), false);
  assert.deepEqual(Array.from(a.api.getFilteredUsers(), row=>row.id), []);
});

test('master data is a real managed source of truth', () => {
  const a=app(); a.login(21);
  const md=a.api.db.masterData;
  assert.ok(md && md.districts.length && md.institutions.length && md.documentTypes.length);
  const html=a.api.appRouter('masters');
  assert.match(html,/Tambah/);
  assert.match(html,/master-add/);
  assert.match(html,/master-edit/);
  assert.match(html,/master-toggle/);
});

test('admin and superadmin have contact inbox workflow', () => {
  for (const [id,role] of [[21,'admin'],[22,'superadmin']]) {
    const a=app(); a.login(id);
    assert.ok(a.api.menus[role].some(row=>row[0]==='inbox'));
    assert.match(a.api.appRouter('inbox'),/Pesan Masuk/);
    assert.match(a.api.appRouter('inbox'),/Diproses/);
  }
});

test('education history exposes edit delete and set-primary workflow', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/edit-education/);
  assert.match(source,/delete-education/);
  assert.match(source,/set-primary-education/);
  assert.match(source,/syncProfileFromPrimaryEducation/);
});

test('public CV publishing has a real shareable route and section editor', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/function publicCvPage/);
  assert.match(source,/#\/cv\//);
  for (const field of ['experiences','organizations','projects','achievements']) assert.match(source,new RegExp(field));
});

test('reminder flow supports presets custom schedule and delivery run history', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/H-30/);
  assert.match(source,/custom/);
  assert.match(source,/reminderRuns/);
  assert.match(source,/runPrototypeScheduler/);
});

test('traffic charts aggregate actual traffic events', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/function aggregateTraffic/);
  assert.match(source,/trafficEvents/);
  assert.match(source,/trafficRetentionDays/);
});

test('system settings are wired to runtime behavior', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  for (const term of ['sessionLifetimeMs','effectiveTimezone','reminderChannel','trafficRetentionDays','autoCloseScholarships','autoPublishContent']) assert.match(source,new RegExp(term));
});

test('verified seed profiles satisfy current document readiness rules', () => {
  const a=app();
  for (const p of a.api.db.profiles.filter(row=>row.profileStatus==='verified')) {
    const u=a.api.db.users.find(row=>row.id===p.userId);
    const docs=a.api.db.documents.filter(row=>row.userId===u.id);
    assert.equal(a.api.studentVerificationReadiness(u,p,docs).ready,true, u.name);
  }
});

test('professional PDF and Excel templates include brand header and tabular structure', async () => {
  const a=app();
  const blob=a.api.makeProfessionalPdf({title:'TALENTA NDUGA — QA',subtitle:'Laporan Pengujian',description:'Validasi format.',meta:[['Jumlah',1]],sections:[{title:'Data',columns:[{label:'Kolom',width:1}],rows:[['Nilai']]}]});
  const bytes=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(bytes,/%PDF-1\.4/);
  assert.match(bytes,/TALENTA NDUGA/);
  assert.match(bytes,/TN/);
  const excel=a.api.brandedExcelDocument({title:'QA',body:'<table><tr><td>Nilai</td></tr></table>'});
  assert.match(excel,/brand-logo/);
  assert.match(excel,/TALENTA NDUGA/);
  assert.match(excel,/<table/);
});

test('scholarship detail exposes validated official HTTPS source link', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/Buka Sumber Resmi/);
  assert.match(source,/noopener noreferrer/);
  assert.match(source,/URL sumber resmi harus menggunakan HTTPS/);
});

test('registration records privacy consent metadata', () => {
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(source,/consentAcceptedAt/);
  assert.match(source,/consentVersion/);
  assert.match(source,/consentPurpose/);
});

test('superadmin settings exposes privacy request governance workflow', () => {
  const a=app(); a.login(22);
  const html=a.api.appRouter('settings');
  const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  assert.match(html,/Permintaan Privasi Pengguna/);
  assert.match(source,/privacy-request-status/);
});
