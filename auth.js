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
      onSnapshot: dbMod.onSnapshot,
      serverTimestamp: dbMod.serverTimestamp
    };
    return true;
  } catch (e) {
    console.warn('Firebase SDK load failed:', e);
    return false;
  }
}

// ===== Auth Cache (Instant Login) =====
function cacheAuthUser(user) {
  try {
    localStorage.setItem('suna_cached_user', JSON.stringify({
      uid: user.uid, email: user.email,
      displayName: user.displayName, photoURL: user.photoURL
    }));
  } catch(e) {}
}

function getCachedAuthUser() {
  try {
    const c = localStorage.getItem('suna_cached_user');
    return c ? JSON.parse(c) : null;
  } catch(e) { return null; }
}

function clearCachedAuth() {
  localStorage.removeItem('suna_cached_user');
}

// ==========================================
// ===== CONFLICT MERGE UTILITIES =====
// ==========================================

function upgradeStateLocal() {
  if (!State.chats) State.chats = [];
  if (!State.deletedChats) State.deletedChats = {};

  State.chats = State.chats.map((c, cIdx) => {
    const chat = { ...c };
    if (!chat.id) chat.id = 'chat-' + (chat.createdAt || (Date.now() - cIdx * 1000));
    if (!chat.createdAt) chat.createdAt = Date.now();
    if (!chat.updatedAt) chat.updatedAt = chat.createdAt;
    if (chat.deleted === undefined) chat.deleted = false;
    if (!chat.deletedMessageIds) chat.deletedMessageIds = {};
    
    chat.messages = (chat.messages || []).map((m, mIdx) => {
      const msg = { ...m };
      if (!msg.id) msg.id = 'msg-' + (msg.timestamp || Date.now()) + '-' + mIdx;
      if (!msg.updatedAt) msg.updatedAt = msg.timestamp || Date.now();
      return msg;
    });
    return chat;
  });
  
  if (State.settings && !State.settings.updatedAt) {
    State.settings.updatedAt = Date.now();
  }
  if (State.memory) {
    if (!State.memory.lastUpdated) State.memory.lastUpdated = Date.now();
    State.memory.facts = (State.memory.facts || []).map(f => {
      const fact = { ...f };
      if (!fact.timestamp) fact.timestamp = Date.now();
      return fact;
    });
  }
}

function mergeChats(localChats, remoteChats) {
  const mergedMap = new Map();
  const localDeleted = State.deletedChats || {};
  
  for (const c of localChats) {
    const chat = { ...c };
    if (!chat.id) continue;
    mergedMap.set(chat.id, chat);
  }

  for (const r of remoteChats) {
    const remoteChat = { ...r };
    if (!remoteChat.id) continue;

    const localChat = mergedMap.get(remoteChat.id);

    if (!localChat) {
      const localDelTime = localDeleted[remoteChat.id] || 0;
      if (localDelTime >= (remoteChat.updatedAt || 0)) {
        continue; 
      }
      mergedMap.set(remoteChat.id, remoteChat);
    } else {
      const mergedChat = { ...localChat };

      if ((remoteChat.updatedAt || 0) > (localChat.updatedAt || 0)) {
        mergedChat.title = remoteChat.title;
        mergedChat.updatedAt = remoteChat.updatedAt;
      }

      mergedChat.deletedMessageIds = {
        ...(localChat.deletedMessageIds || {}),
        ...(remoteChat.deletedMessageIds || {})
      };

      const msgMap = new Map();
      for (const m of (localChat.messages || [])) msgMap.set(m.id, m);
      
      for (const rm of (remoteChat.messages || [])) {
        const lm = msgMap.get(rm.id);
        if (!lm) {
          msgMap.set(rm.id, rm);
        } else {
          if ((rm.updatedAt || 0) > (lm.updatedAt || 0)) {
            msgMap.set(rm.id, rm);
          }
        }
      }

      const finalMessages = [];
      for (const [msgId, msg] of msgMap.entries()) {
        const delTime = mergedChat.deletedMessageIds[msgId];
        if (delTime !== undefined && delTime >= (msg.updatedAt || msg.timestamp || 0)) {
          continue; 
        }
        finalMessages.push(msg);
      }

      finalMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      mergedChat.messages = finalMessages;
      mergedChat.updatedAt = Math.max(localChat.updatedAt || 0, remoteChat.updatedAt || 0);
      mergedMap.set(mergedChat.id, mergedChat);
    }
  }

  return Array.from(mergedMap.values())
    .filter(c => {
      const isDelLocally = localDeleted[c.id] !== undefined && localDeleted[c.id] >= (c.updatedAt || 0);
      return !isDelLocally && !c.deleted;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function mergeSettings(localSettings, remoteSettings) {
  if (!localSettings) return remoteSettings || {};
  if (!remoteSettings) return localSettings || {};
  
  const localTime = localSettings.updatedAt || 0;
  const remoteTime = remoteSettings.updatedAt || 0;
  
  if (remoteTime > localTime) {
    const merged = { ...remoteSettings };
    if (!merged.apiKey && localSettings.apiKey) merged.apiKey = localSettings.apiKey;
    if (!merged.baseUrl && localSettings.baseUrl) merged.baseUrl = localSettings.baseUrl;
    if (!merged.apiKey2 && localSettings.apiKey2) merged.apiKey2 = localSettings.apiKey2;
    if (!merged.baseUrl2 && localSettings.baseUrl2) merged.baseUrl2 = localSettings.baseUrl2;
    return merged;
  }
  return localSettings;
}

function mergeMemory(localMemory, remoteMemory) {
  const mergedFacts = new Map();
  const factsL = (localMemory && localMemory.facts) || [];
  const factsR = (remoteMemory && remoteMemory.facts) || [];
  
  for (const f of factsL) {
    if (!f.fact) continue;
    mergedFacts.set(f.fact.trim().toLowerCase(), { ...f });
  }
  
  for (const f of factsR) {
    if (!f.fact) continue;
    const key = f.fact.trim().toLowerCase();
    const existing = mergedFacts.get(key);
    if (!existing || (f.timestamp || 0) > (existing.timestamp || 0)) {
      mergedFacts.set(key, { ...f });
    }
  }
  
  const sortedFacts = Array.from(mergedFacts.values())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
  while (sortedFacts.length > 50) {
    sortedFacts.shift();
  }
  
  return {
    facts: sortedFacts,
    lastUpdated: Math.max((localMemory && localMemory.lastUpdated) || 0, (remoteMemory && remoteMemory.lastUpdated) || 0, Date.now())
  };
}

// ===== Cloud Sync (Resilient Fetch-Merge-Save) =====
function cloudSave(immediate = false) {
  if (!AuthState.isLoggedIn || !_fb) return;
  if (AuthState.syncDebounceTimer) clearTimeout(AuthState.syncDebounceTimer);

  const doSave = async () => {
    if (AuthState.isSyncing) return;
    AuthState.isSyncing = true;
    try {
      const uid = AuthState.user.uid;
      upgradeStateLocal();

      // Retrieve current remote data to perform pre-merge before writing (prevents overwrites)
      let remoteChats = [];
      let remoteDeleted = {};
      let remoteSettings = {};
      let remoteMemory = { facts: [] };

      try {
        const [sSnap, mSnap, cSnap] = await Promise.all([
          _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'settings')),
          _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'memory')),
          _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'))
        ]);

        if (sSnap.exists()) remoteSettings = sSnap.data();
        if (mSnap.exists()) remoteMemory = mSnap.data();
        if (cSnap.exists()) {
          const rawChats = cSnap.data().chats;
          if (rawChats) remoteChats = JSON.parse(rawChats);
          const rawDel = cSnap.data().deletedChats;
          if (rawDel) remoteDeleted = JSON.parse(rawDel);
        }
      } catch (err) {
        console.warn("Failed to fetch remote data for pre-merge (offline-first). Pushing local state directly.", err);
      }

      // Merge remote deleted chats lists
      State.deletedChats = {
        ...(State.deletedChats || {}),
        ...remoteDeleted
      };

      // Perform three-way merges
      const mergedChats = mergeChats(State.chats, remoteChats);
      const mergedSettings = mergeSettings(State.settings, remoteSettings);
      const mergedMemory = mergeMemory(State.memory, remoteMemory);

      State.chats = mergedChats;
      Object.assign(State.settings, mergedSettings);
      State.memory = mergedMemory;

      if (State.chats.length > 0 && !State.chats.find(c => c.id === State.activeChatId)) {
        State.activeChatId = State.chats[0].id;
      }

      // Persist merged data locally first
      if (window.saveLocalStateOnly) window.saveLocalStateOnly();

      // Clean large images to satisfy 1MB Document quota
      const chatsClean = State.chats.map(c => ({
        ...c,
        messages: (c.messages || []).map(m => {
          const copy = { ...m };
          if (copy.images && copy.images.length) {
            copy.images = copy.images.map(img => (img && img.length > 70000) ? '__large_image__' : img);
          }
          return copy;
        })
      }));

      // Commit fully merged data to cloud in parallel
      await Promise.all([
        _fb.setDoc(_fb.doc(_fb.doc(_fb.db, 'users', uid, 'data', 'settings')), {
          ...State.settings, updatedAt: _fb.serverTimestamp()
        }),
        _fb.setDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'memory'), {
          ...State.memory, updatedAt: _fb.serverTimestamp()
        }),
        _fb.setDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'), {
          chats: JSON.stringify(chatsClean),
          deletedChats: JSON.stringify(State.deletedChats || {}),
          updatedAt: _fb.serverTimestamp()
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

  if (immediate) {
    return doSave();
  } else {
    AuthState.syncDebounceTimer = setTimeout(doSave, 2000);
    return Promise.resolve();
  }
}

async function cloudLoad() {
  if (!AuthState.isLoggedIn || !_fb) return false;
  try {
    const uid = AuthState.user.uid;
    
    const [sSnap, mSnap, cSnap] = await Promise.all([
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'settings')),
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'memory')),
      _fb.getDoc(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'))
    ]);

    const isNewAccount = !sSnap.exists() && !mSnap.exists() && !cSnap.exists();

    if (isNewAccount) {
      cloudSave(true);
    } else {
      upgradeStateLocal();

      if (sSnap.exists()) {
        const d = sSnap.data(); delete d.updatedAt;
        const mergedSettings = mergeSettings(State.settings, d);
        Object.assign(State.settings, mergedSettings);
      }
      
      if (mSnap.exists()) {
        const d = mSnap.data(); delete d.updatedAt;
        if (d.facts) {
          const mergedMemory = mergeMemory(State.memory, d);
          State.memory = mergedMemory;
        }
      }

      if (cSnap.exists()) {
        const rawChats = cSnap.data().chats;
        const rawDel = cSnap.data().deletedChats;
        
        if (rawDel) {
          State.deletedChats = {
            ...(State.deletedChats || {}),
            ...JSON.parse(rawDel)
          };
        }
        
        if (rawChats) {
          const cc = JSON.parse(rawChats);
          if (cc && cc.length > 0) {
            const mergedChats = mergeChats(State.chats, cc);
            State.chats = mergedChats;
            if (State.chats.length > 0 && !State.chats.find(c => c.id === State.activeChatId)) {
              State.activeChatId = State.chats[0].id;
            }
          }
        }
      }

      if (window.saveLocalStateOnly) window.saveLocalStateOnly();
    }
    return true;
  } catch (e) { console.error('Cloud load error:', e); return false; }
}

let _syncUnsubscribes = [];
function initRealtimeSync() {
  if (!AuthState.isLoggedIn || !_fb || AuthState.useLocalOnly) return;
  const uid = AuthState.user.uid;
  
  _syncUnsubscribes.forEach(u => u());
  _syncUnsubscribes = [];

  // 1. Listen to chats
  _syncUnsubscribes.push(_fb.onSnapshot(_fb.doc(_fb.db, 'users', uid, 'data', 'chats'), (doc) => {
    if (!doc.exists() || doc.metadata.hasPendingWrites) return; 
    try {
      const rawChats = doc.data().chats;
      const rawDel = doc.data().deletedChats;
      
      let cc = [];
      let dc = {};
      if (rawChats) cc = JSON.parse(rawChats);
      if (rawDel) dc = JSON.parse(rawDel);

      upgradeStateLocal();
      
      State.deletedChats = {
        ...(State.deletedChats || {}),
        ...dc
      };

      const mergedChats = mergeChats(State.chats, cc);
      const isStreamingActiveChat = typeof State !== 'undefined' && State.isGenerating && State.activeChatId === State.generatingChatId;

      State.chats = mergedChats;
      if (State.chats.length > 0 && !State.chats.find(c => c.id === State.activeChatId)) {
        State.activeChatId = State.chats[0].id;
      }

      if (typeof window.renderChatList === 'function') window.renderChatList();
      
      // Defer active chat re-rendering if AI is actively streaming to prevent DOM glitches
      if (typeof window.renderMessages === 'function' && !isStreamingActiveChat) {
        window.renderMessages();
      }
      if (window.saveLocalStateOnly) window.saveLocalStateOnly();
    } catch (e) { console.error('Realtime chat sync error', e); }
  }));

  // 2. Listen to memory
  _syncUnsubscribes.push(_fb.onSnapshot(_fb.doc(_fb.db, 'users', uid, 'data', 'memory'), (doc) => {
    if (!doc.exists() || doc.metadata.hasPendingWrites) return;
    try {
      const d = doc.data(); delete d.updatedAt;
      if (d.facts) {
        upgradeStateLocal();
        const mergedMemory = mergeMemory(State.memory, d);
        State.memory = mergedMemory;
        if (typeof window.renderMemoryList === 'function') window.renderMemoryList();
        if (window.saveLocalStateOnly) window.saveLocalStateOnly();
      }
    } catch (e) {}
  }));
  
  // 3. Listen to settings
  _syncUnsubscribes.push(_fb.onSnapshot(_fb.doc(_fb.db, 'users', uid, 'data', 'settings'), (doc) => {
    if (!doc.exists() || doc.metadata.hasPendingWrites) return;
    try {
      const d = doc.data(); delete d.updatedAt;
      upgradeStateLocal();
      const mergedSettings = mergeSettings(State.settings, d);
      Object.assign(State.settings, mergedSettings);
      if (typeof window.updateUserDisplay === 'function') window.updateUserDisplay();
      if (typeof window.applyTheme === 'function') window.applyTheme();
      if (window.saveLocalStateOnly) window.saveLocalStateOnly();
    } catch (e) {}
  }));
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
  
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.style.display = 'flex';
    void appEl.offsetWidth; 
  }
  
  if (immediate) {
    el.style.display = 'none';
    return;
  }
  
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
  const btnGoogle = document.querySelector('.btn-auth-google');
  if (btnGoogle) btnGoogle.style.opacity = '0.5';
  try {
    await _fb.signInWithPopup(_fb.auth, _fb.googleProvider);
    hideAuthScreen();
  } catch (e) {
    console.error('Google login error:', e);
    const form = document.getElementById('login-form').style.display !== 'none' ? 'login' : 'register';
    showAuthError(form, translateFirebaseError(e.code || e.message));
  } finally {
    if (btnGoogle) btnGoogle.style.opacity = '1';
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
  clearCachedAuth();
  if (AuthState.useLocalOnly) {
    AuthState.user = null;
    AuthState.isLoggedIn = false;
    AuthState.useLocalOnly = false;
    localStorage.removeItem('suna_guest_mode');
    if (typeof State !== 'undefined') {
      State.settings = {
        baseUrl: '', apiKey: '', baseUrl2: '', apiKey2: '',
        currentModel: '', flashModel: '', proModel: '',
        systemPrompt: '', userPurpose: '', tone: 'friendly', theme: 'aurora',
        customPersonality: '', fontFamily: "'Inter', sans-serif", fontSize: 15,
        userName: 'Bạn', userAvatar: ''
      };
      State.memory = {
        facts: [],
        lastUpdated: 0
      };
      State.chats = [{ id: 'chat-' + Date.now(), title: 'Chat mới', messages: [], createdAt: Date.now(), updatedAt: Date.now() }];
      State.deletedChats = {};
      State.activeChatId = State.chats[0].id;
      if (typeof window.saveLocalStateOnly === 'function') window.saveLocalStateOnly();
      if (typeof window.saveMemory === 'function') window.saveMemory();
    }
    showAuthScreen();
    if (window.toast) window.toast('Đã đăng xuất', 'info');
    return;
  }
  
  if (!_fb) return;
  try {
    _syncUnsubscribes.forEach(u => u());
    _syncUnsubscribes = [];
    
    await cloudSave(true);
    await _fb.signOutFn(_fb.auth);
    AuthState.isLoggedIn = false;
    AuthState.user = null;
    localStorage.removeItem('suna_guest_mode');

    if (typeof State !== 'undefined') {
      State.settings = {
        baseUrl: '', apiKey: '', baseUrl2: '', apiKey2: '',
        currentModel: '', flashModel: '', proModel: '',
        systemPrompt: '', userPurpose: '', tone: 'friendly', theme: 'aurora',
        customPersonality: '', fontFamily: "'Inter', sans-serif", fontSize: 15,
        userName: 'Bạn', userAvatar: ''
      };
      State.memory = {
        facts: [],
        lastUpdated: 0
      };
      State.chats = [{ id: 'chat-' + Date.now(), title: 'Chat mới', messages: [], createdAt: Date.now(), updatedAt: Date.now() }];
      State.deletedChats = {};
      State.activeChatId = State.chats[0].id;
      if (typeof window.saveLocalStateOnly === 'function') window.saveLocalStateOnly();
      if (typeof window.saveMemory === 'function') window.saveMemory();
      if (typeof window.onUserSignedIn === 'function') window.onUserSignedIn();
    }

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
    if (typeof window.onUserSignedIn === 'function') window.onUserSignedIn();
    return;
  }
  _appInited = true;
  if (typeof init === 'function') init();
}

// ===== Main Auth Init (Optimized: Zero-Friction / Offline First) =====
async function initAuth() {
  const cachedUser = getCachedAuthUser();
  const isGuestMode = localStorage.getItem('suna_guest_mode') === 'true';

  if (cachedUser) {
    AuthState.user = cachedUser;
    AuthState.isLoggedIn = true;
    AuthState.isAdmin = (cachedUser.email === 'duyanhblt1@gmail.com' || cachedUser.email === 'admin@suna.local');
    AuthState.useLocalOnly = false;
    updateSyncIndicator('syncing'); 
  } else {
    AuthState.user = { uid: 'guest-' + Date.now(), email: 'khach@suna.local', displayName: 'Khách' };
    AuthState.isLoggedIn = true;
    AuthState.isAdmin = false;
    AuthState.useLocalOnly = true;
    localStorage.setItem('suna_guest_mode', 'true'); 
    updateSyncIndicator('offline');
  }

  hideAuthScreen(true);
  doAppInit();
  updateUserDisplay();

  const sdkLoaded = await loadFirebaseSDK();

  if (!sdkLoaded) {
    if (!cachedUser && !isGuestMode && window.toast) {
      window.toast('Suna Chat đang chạy ở chế độ ngoại tuyến (Dữ liệu lưu cục bộ).', 'info');
    }
    return;
  }

  return new Promise((resolve) => {
    let resolved = false;

    _fb.onAuthStateChanged(_fb.auth, async (user) => {
      if (user) {
        AuthState.user = user;
        AuthState.isLoggedIn = true;
        AuthState.isAdmin = (user.email === 'duyanhblt1@gmail.com' || user.email === 'admin@suna.local');
        AuthState.useLocalOnly = false;
        localStorage.removeItem('suna_guest_mode');
        cacheAuthUser(user);

        const loading = document.getElementById('auth-loading');
        if (loading) loading.style.display = 'flex';

        try { 
          await cloudLoad(); 
          initRealtimeSync();
        } catch(e) { 
          console.error(e); 
        } finally { 
          if (loading) loading.style.display = 'none';
          hideAuthScreen();
          if (typeof window.onUserSignedIn === 'function') window.onUserSignedIn(); 
          updateUserDisplay(); 
          updateSyncIndicator('synced'); 
        }
      } else {
        if (cachedUser) {
          _syncUnsubscribes.forEach(u => u());
          _syncUnsubscribes = [];
          
          clearCachedAuth();
          AuthState.user = null;
          AuthState.isLoggedIn = false;
          AuthState.useLocalOnly = false;
          showAuthScreen();
          updateUserDisplay();
          updateSyncIndicator('offline');
          if (window.toast) window.toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'info');
        }
      }

      AuthState.initialized = true;
      if (!resolved) { resolved = true; resolve(); }
    });
  });
}

// ===== Init Auth Event Listeners =====
function initAuthEvents() {
  document.addEventListener('click', (e) => {
    const btn = document.getElementById('btn-user-menu');
    const drop = document.getElementById('user-dropdown');
    if (btn && drop && !btn.contains(e.target) && !drop.contains(e.target)) {
      drop.classList.remove('active');
    }
  });

  document.querySelectorAll('.auth-tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab))
  );
  document.getElementById('login-submit-btn')?.addEventListener('click', handleLogin);
  document.getElementById('login-form')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('register-submit-btn')?.addEventListener('click', handleRegister);
  document.getElementById('register-form')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
  document.querySelectorAll('.btn-auth-google').forEach(btn =>
    btn.addEventListener('click', handleGoogleLogin)
  );
  document.querySelectorAll('.btn-auth-guest').forEach(btn =>
    btn.addEventListener('click', handleGuestLogin)
  );
  document.getElementById('btn-forgot-password')?.addEventListener('click', handleForgotPassword);
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