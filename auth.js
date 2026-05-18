// ===== SUNA CHAT - AUTH & CLOUD SYNC MODULE =====
// Firebase Auth + Firestore — cross-device sync

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYh37AUgYA9tXHmalrnl6Uwf95m7Mdq8Q",
  authDomain: "sunachat.firebaseapp.com",
  projectId: "sunachat",
  storageBucket: "sunachat.firebasestorage.app",
  messagingSenderId: "843636574732",
  appId: "1:843636574732:web:8f99c55a3a29989d47bc29",
  measurementId: "G-TCYKZK6SLB"
};

// ===== Auth State =====
const AuthState = {
  user: null,
  isLoggedIn: false,
  isSyncing: false,
  lastSyncTime: 0,
  syncDebounceTimer: null,
  initialized: false,
  isAdmin: false
};

// ===== Firebase SDK =====
let _fb = null;

async function loadFirebaseSDK() {
  if (_fb) return true;
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    _fb = {
      auth: authMod.getAuth(app),
      db: dbMod.getFirestore(app),
      googleProvider: new authMod.GoogleAuthProvider(),
      createUser: authMod.createUserWithEmailAndPassword,
      signIn: authMod.signInWithEmailAndPassword,
      signInWithPopup: authMod.signInWithPopup,
      signOutFn: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      updateProfile: authMod.updateProfile,
      sendPasswordResetEmail: authMod.sendPasswordResetEmail,
      doc: dbMod.doc, setDoc: dbMod.setDoc, getDoc: dbMod.getDoc,
      serverTimestamp: dbMod.serverTimestamp
    };
    return true;
  } catch (e) {
    console.warn('Firebase SDK load failed:', e);
    return false;
  }
}

// ===== Cloud Sync =====
function cloudSave(immediate = false) {
  if (!AuthState.isLoggedIn || !_fb) return;
  if (AuthState.syncDebounceTimer) clearTimeout(AuthState.syncDebounceTimer);

  const doSave = async () => {
    if (AuthState.isSyncing) return;
    AuthState.isSyncing = true;
    try {
      const uid = AuthState.user.uid;
      const chatsClean = State.chats.map(c => ({
        ...c,
        messages: c.messages.map(m => {
          const copy = { ...m };
          if (copy.images && copy.images.length) {
            copy.images = copy.images.map(img => (img && img.length > 70000) ? '__large_image__' : img);
          }
          return copy;
        })
      }));

      // Chạy song song các tiến trình lưu trữ để tiết kiệm thời gian
      await Promise.all([
        _fb.setDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'settings'), {
          ...State.settings, updatedAt: _fb.serverTimestamp()
        }),
        _fb.setDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'memory'), {
          ...State.memory, updatedAt: _fb.serverTimestamp()
        }),
        _fb.setDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'), {
          chats: JSON.stringify(chatsClean), updatedAt: _fb.serverTimestamp()
        })
      ]);

      AuthState.lastSyncTime = Date.now();
      updateSyncIndicator('synced');
    } catch (e) {
      console.error('Cloud save error:', e);
      updateSyncIndicator('error');
    } finally {
      AuthState.isSyncing = false;
    }
  };
  immediate ? doSave() : (AuthState.syncDebounceTimer = setTimeout(doSave, 2000));
}

async function cloudLoad() {
  if (!AuthState.isLoggedIn || !_fb) return false;
  try {
    const uid = AuthState.user.uid;
    
    // Tải dữ liệu song song từ Firestore
    const [sSnap, mSnap, cSnap] = await Promise.all([
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'settings')),
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'memory')),
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'))
    ]);

    if (sSnap.exists()) { const d = sSnap.data(); delete d.updatedAt; Object.assign(State.settings, d); }
    if (mSnap.exists()) { const d = mSnap.data(); delete d.updatedAt; if (d.facts) State.memory = d; }
    if (cSnap.exists() && cSnap.data().chats) {
      const cc = JSON.parse(cSnap.data().chats);
      if (cc && cc.length > 0) {
        State.chats = cc;
        if (!State.chats.find(c => c.id === State.activeChatId)) State.activeChatId = State.chats[0].id;
      }
    }
    return true;
  } catch (e) { console.error('Cloud load error:', e); return false; }
}

function triggerCloudSync() {
  if (AuthState.isLoggedIn) {
    cloudSave(false);
    updateSyncIndicator('syncing');
  }
}

// ===== Sync Indicator =====
function updateSyncIndicator(status) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.className = 'sync-indicator ' + status;
  const icons = { syncing: 'sync', synced: 'cloud_done', error: 'cloud_off', offline: 'cloud_off' };
  el.innerHTML = '<span class="material-icons-round">' + (icons[status] || 'cloud_off') + '</span>';
  const t = { syncing: 'Đang đồng bộ...', synced: 'Đã đồng bộ', error: 'Lỗi đồng bộ', offline: 'Chưa đồng bộ' };
  el.title = t[status] || '';
}

// ===== Auth UI =====
function showAuthScreen() {
  const el = document.getElementById('auth-screen');
  if (el) { el.style.display = 'flex'; el.style.opacity = '1'; el.style.transform = 'none'; }
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  const loading = document.getElementById('auth-loading');
  if (loading) loading.style.display = 'none';
  switchAuthTab('login');
}

function hideAuthScreen(immediate = false) {
  const el = document.getElementById('auth-screen');
  if (!el) return;
  
  // Show app immediately underneath the auth screen to prevent any white flash or layout gaps
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.style.display = 'flex';
    void appEl.offsetWidth; // force reflow
  }
  
  if (immediate) {
    el.style.display = 'none';
    return;
  }
  
  // Fade out auth screen
  el.style.opacity = '0';
  
  setTimeout(() => {
    el.style.display = 'none';
  }, 300);
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const lf = document.getElementById('login-form');
  const rf = document.getElementById('register-form');
  if (lf) lf.style.display = tab === 'login' ? 'flex' : 'none';
  if (rf) rf.style.display = tab === 'register' ? 'flex' : 'none';
  const slider = document.querySelector('.auth-tab-slider');
  if (slider) slider.style.transform = tab === 'register' ? 'translateX(100%)' : 'translateX(0)';
  clearAuthErrors();
}

function showAuthError(formId, msg) {
  const el = document.getElementById(formId + '-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearAuthErrors() {
  document.querySelectorAll('.auth-error').forEach(e => e.style.display = 'none');
}

function setAuthLoading(formId, loading) {
  const btn = document.getElementById(formId + '-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = '<div class="auth-spinner"></div><span>Đang xử lý...</span>';
  } else {
    btn.innerHTML = formId === 'login'
      ? '<span class="material-icons-round">login</span><span>Đăng nhập</span>'
      : '<span class="material-icons-round">person_add</span><span>Tạo tài khoản</span>';
  }
}

function translateFirebaseError(code) {
  const map = {
    'auth/email-already-in-use': 'Email đã được sử dụng.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
    'auth/user-not-found': 'Không tìm thấy tài khoản.',
    'auth/wrong-password': 'Mật khẩu không đúng.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/too-many-requests': 'Quá nhiều lần thử. Đợi vài phút.',
    'auth/network-request-failed': 'Lỗi kết nối mạng.',
    'auth/popup-blocked': 'Popup bị chặn. Hãy cho phép popup.',
    'auth/popup-closed-by-user': 'Đã đóng cửa sổ đăng nhập.',
    'auth/cancelled-popup-request': 'Đăng nhập bị hủy.',
    'auth/account-exists-with-different-credential': 'Email đã liên kết với phương thức khác.',
    'auth/configuration-not-found': 'Bạn chưa bật phương thức đăng nhập này. Hãy vào Firebase Console > Authentication > Sign-in method và BẬT Email/Password hoặc Google.',
    'auth/operation-not-allowed': 'Bạn chưa bật phương thức đăng nhập này. Hãy vào Firebase Console > Authentication > Sign-in method và BẬT Email/Password hoặc Google.',
    'auth/api-key-not-valid. please pass a valid api key.': 'CHÚ Ý: Bạn chưa điền Firebase API Key! Vui lòng mở file auth.js (dòng 6) và thay API Key thật của bạn vào.',
    'auth/invalid-api-key': 'CHÚ Ý: Firebase API Key không hợp lệ! Vui lòng mở file auth.js và kiểm tra lại API Key.',
    'auth/unauthorized-domain': 'Tên miền này chưa được cấp phép. Vui lòng vào Firebase Console > Authentication > Settings > Authorized domains và thêm tên miền của bạn (ví dụ: sunachat.vercel.app).'
  };

  // Xử lý các lỗi có chứa chuỗi api-key-not-valid
  if (code && code.includes('api-key-not-valid')) {
    return 'CHÚ Ý: Bạn chưa điền Firebase API Key! Vui lòng mở file auth.js và thay "placeholder" bằng Key thật của bạn.';
  }

  return map[code] || `Lỗi: ${code || 'Không xác định'}`;
}

// ===== Auth Actions =====
async function handleRegister() {
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const pass = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;
  clearAuthErrors();
  if (!name) { showAuthError('register', 'Vui lòng nhập tên hiển thị'); return; }
  if (!email) { showAuthError('register', 'Vui lòng nhập email'); return; }
  if (pass.length < 6) { showAuthError('register', 'Mật khẩu cần ít nhất 6 ký tự'); return; }
  if (pass !== confirm) { showAuthError('register', 'Mật khẩu xác nhận không khớp'); return; }
  if (!_fb) { showAuthError('register', 'Firebase chưa sẵn sàng. Kiểm tra kết nối mạng.'); return; }

  setAuthLoading('register', true);
  try {
    const cred = await _fb.createUser(_fb.auth, email, pass);
    await _fb.updateProfile(cred.user, { displayName: name });
    if (typeof State !== 'undefined') State.settings.userName = name;
    // onAuthStateChanged sẽ tự động handle login flow
  } catch (e) {
    console.error('Register error:', e);
    showAuthError('register', translateFirebaseError(e.code || e.message));
    setAuthLoading('register', false);
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  clearAuthErrors();
  if (!email) { showAuthError('login', 'Vui lòng nhập email'); return; }
  if (!pass) { showAuthError('login', 'Vui lòng nhập mật khẩu'); return; }

  if (!_fb) { showAuthError('login', 'Firebase chưa sẵn sàng. Kiểm tra kết nối mạng.'); return; }

  setAuthLoading('login', true);
  try {
    await _fb.signIn(_fb.auth, email, pass);
  } catch (e) {
    console.error('Login error:', e);
    showAuthError('login', translateFirebaseError(e.code || e.message));
    setAuthLoading('login', false);
  }
}

async function handleGoogleLogin() {
  clearAuthErrors();
  if (!_fb) {
    showAuthError('login', 'Firebase chưa sẵn sàng.');
    return;
  }
  try {
    await _fb.signInWithPopup(_fb.auth, _fb.googleProvider);
  } catch (e) {
    console.error('Google login error:', e);
    const form = document.getElementById('login-form').style.display !== 'none' ? 'login' : 'register';
    showAuthError(form, translateFirebaseError(e.code || e.message));
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showAuthError('login', 'Nhập email vào ô trên để reset mật khẩu'); return; }
  if (!_fb) { showAuthError('login', 'Firebase chưa sẵn sàng.'); return; }
  try {
    await _fb.sendPasswordResetEmail(_fb.auth, email);
    if (window.toast) window.toast('Đã gửi link reset mật khẩu tới ' + email, 'success');
  } catch (e) {
    showAuthError('login', translateFirebaseError(e.code));
  }
}

window.handleLogout = async function handleLogout() {
  if (AuthState.useLocalOnly) {
    AuthState.user = null;
    AuthState.isLoggedIn = false;
    AuthState.useLocalOnly = false;
    localStorage.removeItem('suna_guest_mode');
    showAuthScreen();
    if (window.toast) window.toast('Đã đăng xuất', 'info');
    return;
  }
  
  if (!_fb) return;
  try {
    cloudSave(true);
    await _fb.signOutFn(_fb.auth);
    AuthState.isLoggedIn = false;
    AuthState.user = null;
    localStorage.removeItem('suna_guest_mode');
    updateUserDisplay();
    updateSyncIndicator('offline');
    if (window.toast) window.toast('Đã đăng xuất', 'info');
    showAuthScreen();
  } catch (e) {
    if (window.toast) window.toast('Lỗi: ' + e.message, 'error');
  }
}

// ===== Guest Login =====
function handleGuestLogin() {
  setAuthLoading('login', true);
  setTimeout(() => {
    AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };
    AuthState.isLoggedIn = true;
    AuthState.isAdmin = false;
    AuthState.useLocalOnly = true;
    
    // Lưu trạng thái guest vào localStorage để không phải đăng nhập lại khi F5
    localStorage.setItem('suna_guest_mode', 'true');
    
    hideAuthScreen();
    doAppInit();
    updateUserDisplay();
    updateSyncIndicator('offline');
    
    if (window.toast) {
      window.toast('Đang dùng chế độ Khách (Không đồng bộ)', 'info');
    }
    setAuthLoading('login', false);
  }, 600);
}


// ===== Sidebar User Display =====
function updateUserDisplay() {
  const el = document.getElementById('sidebar-user-info');
  if (!el) return;
  if (AuthState.isLoggedIn && AuthState.user) {
    const u = AuthState.user;
    const name = u.displayName || (typeof State !== 'undefined' ? State.settings.userName : '') || 'Người dùng';
    const avatar = u.photoURL || '';

    // Check Admin
    const isAdmin = AuthState.isAdmin;

    el.innerHTML = `
      <div class="sidebar-user-row">
        <div class="sidebar-user-avatar">
          ${avatar ? `<img src="${avatar}" alt="">` : '<span class="material-icons-round">account_circle</span>'}
        </div>
        <div class="sidebar-user-text">
          <div class="sidebar-user-name" style="display:flex; align-items:center; gap:6px;">
            ${name} 
            ${isAdmin ? '<span style="background: linear-gradient(135deg, #e8a87c, #c0392b); color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 6px; font-weight: bold; letter-spacing: 0.5px;">ADMIN</span>' : ''}
          </div>
          <div class="sidebar-user-email">${u.email || ''}</div>
        </div>
        <button id="btn-logout" class="btn-logout" title="Đăng xuất" onclick="handleLogout()">
          <span class="material-icons-round">logout</span>
        </button>
      </div>`;
    // document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  } else {
    el.innerHTML = `
      <button class="btn-sign-in-sidebar" onclick="showAuthScreen()">
        <span class="material-icons-round">login</span>
        <span>Đăng nhập / Đăng ký</span>
      </button>`;
  }
}

// ===== App Init Guard =====
let _appInited = false;

function doAppInit() {
  if (_appInited) {
    // Đã init rồi — chỉ refresh UI
    if (typeof onUserSignedIn === 'function') onUserSignedIn();
    return;
  }
  _appInited = true;
  if (typeof init === 'function') init();
}

// ===== Main Auth Init =====
async function initAuth() {
  // Bỏ qua load auth block nếu đang dùng chế độ Khách (để vào thẳng app)
  if (localStorage.getItem('suna_guest_mode') === 'true') {
    AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };
    AuthState.isLoggedIn = true;
    AuthState.isAdmin = false;
    AuthState.useLocalOnly = true;
    
    hideAuthScreen(true);
    doAppInit();
    updateUserDisplay();
    updateSyncIndicator('offline');
  }

  const sdkLoaded = await loadFirebaseSDK();

  if (!sdkLoaded) {
    if (!AuthState.isLoggedIn) {
      console.warn('Firebase unavailable — showing auth screen');
      const errEl = document.getElementById('login-error');
      if (errEl) {
        errEl.textContent = 'Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra mạng hoặc thử lại sau.';
        errEl.style.display = 'block';
      }
    }
    return;
  }

  // Lắng nghe trạng thái auth
  return new Promise((resolve) => {
    let resolved = false;

    _fb.onAuthStateChanged(_fb.auth, async (user) => {
      if (user) {
        AuthState.user = user;
        AuthState.isLoggedIn = true;
        AuthState.isAdmin = (user.email === 'duyanhblt1@gmail.com' || user.email === 'admin@suna.local');
        AuthState.useLocalOnly = false;
        localStorage.removeItem('suna_guest_mode');

        // Loading overlay
        const loadEl = document.getElementById('auth-loading');
        if (loadEl) loadEl.style.display = 'flex';

        await cloudLoad();

        if (loadEl) loadEl.style.display = 'none';

        hideAuthScreen();
        doAppInit();
        updateUserDisplay();
        updateSyncIndicator('synced');
      } else {
        // Nếu user = null nhưng đang ở Guest Mode, giữ nguyên không làm gì cả
        if (localStorage.getItem('suna_guest_mode') === 'true') {
          // Do nothing, let them stay as guest
        } else {
          AuthState.user = null;
          AuthState.isLoggedIn = false;
          AuthState.useLocalOnly = false;
          showAuthScreen();
          updateUserDisplay();
          updateSyncIndicator('offline');
        }
      }

      AuthState.initialized = true;
      if (!resolved) { resolved = true; resolve(); }
    });
  });
}

// ===== Init Auth Event Listeners =====
function initAuthEvents() {
  // Đóng dropdown khi click ra ngoài
  document.addEventListener('click', (e) => {
    const btn = document.getElementById('btn-user-menu');
    const drop = document.getElementById('user-dropdown');
    if (btn && drop && !btn.contains(e.target) && !drop.contains(e.target)) {
      drop.classList.remove('active');
    }
  });

  // Tab switching
  document.querySelectorAll('.auth-tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab))
  );
  // Login
  document.getElementById('login-submit-btn')?.addEventListener('click', handleLogin);
  document.getElementById('login-form')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  // Register
  document.getElementById('register-submit-btn')?.addEventListener('click', handleRegister);
  document.getElementById('register-form')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
  // Google — cả 2 form đều có nút Google
  document.querySelectorAll('.btn-auth-google').forEach(btn =>
    btn.addEventListener('click', handleGoogleLogin)
  );
  // Guest login
  document.querySelectorAll('.btn-auth-guest').forEach(btn =>
    btn.addEventListener('click', handleGuestLogin)
  );
  // Forgot password
  document.getElementById('btn-forgot-password')?.addEventListener('click', handleForgotPassword);
  // Password visibility
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.querySelector('.material-icons-round').textContent =
        input.type === 'password' ? 'visibility' : 'visibility_off';
    });
  });
}
