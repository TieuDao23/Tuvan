// ===== State Management =====
const State = {
  chats: [],
  activeChatId: null,
  mode: 'flash',
  models: [],
  pendingDeleteId: null,
  settings: {
    baseUrl: '', apiKey: '', baseUrl2: '', apiKey2: '',
    currentModel: '', flashModel: '', proModel: '',
    systemPrompt: '', userPurpose: '', tone: 'friendly', theme: 'aurora',
    customPersonality: '', fontFamily: "'Inter', sans-serif", fontSize: 15,
    userName: 'Bạn', userAvatar: ''
  },
  pendingImages: [],
  modelProxyMap: {},
  isGenerating: false,
  abortController: null,
  generatingChatId: null
};

function updateSendButtonState() {
  const btn = $('#btn-send');
  if (State.isGenerating) {
    btn.innerHTML = '<span class="material-icons-round">pause</span>';
    btn.classList.add('is-generating');
  } else {
    btn.innerHTML = '<span class="material-icons-round">send</span>';
    btn.classList.remove('is-generating');
  }
}

// ===== Helpers =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isMobile = () => window.innerWidth <= 768;

// ===== IndexedDB Storage =====
const DB_NAME = 'SunaChatDB';
const STORE_NAME = 'suna_store';
let _dbInstance = null;

function initDB() {
  if (_dbInstance) return Promise.resolve(_dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => { _dbInstance = req.result; resolve(_dbInstance); };
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch(e) { console.error('IndexedDB write error:', e); }
}

async function idbGet(key) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  } catch(e) { console.error('IndexedDB read error:', e); return null; }
}

function saveState() {
  try {
    localStorage.setItem('suna_settings', JSON.stringify(State.settings));
    localStorage.setItem('suna_mode', State.mode);
    idbSet('suna_chats', State.chats); // Fire and forget background save
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      toast('Bộ nhớ settings đã đầy!', 'error');
    } else {
      console.error('Lỗi khi lưu trạng thái:', e);
    }
  }
}

async function loadState() {
  try {
    const s = localStorage.getItem('suna_settings');
    const m = localStorage.getItem('suna_mode');
    
    // Migrate old chats from localStorage if they exist
    const oldChatsStr = localStorage.getItem('suna_chats');
    if (oldChatsStr) {
      State.chats = JSON.parse(oldChatsStr);
      await idbSet('suna_chats', State.chats);
      localStorage.removeItem('suna_chats'); // Free up localStorage limit
    } else {
      const c = await idbGet('suna_chats');
      if (c) State.chats = c;
    }

    if (s) Object.assign(State.settings, JSON.parse(s));
    if (m) State.mode = m;
  } catch(e) { console.error('Load state error:', e); }

  if (State.chats.length === 0) {
    State.chats.push({ id: genId(), title: 'Chat mới', messages: [], createdAt: Date.now() });
  }
  if (!State.activeChatId || !State.chats.find(c => c.id === State.activeChatId)) {
    State.activeChatId = State.chats[0].id;
  }
}

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="material-icons-round">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>${msg}`;
  $('#toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== Theme =====
function applyTheme() {
  document.body.setAttribute('data-theme', State.settings.theme);
  document.body.style.setProperty('--font-main', State.settings.fontFamily);
  document.body.style.setProperty('--font-size', State.settings.fontSize + 'px');
}

// ===== Chat Management =====
function createChat() {
  const chat = { id: genId(), title: 'Chat mới', messages: [], createdAt: Date.now() };
  State.chats.unshift(chat);
  State.activeChatId = chat.id;
  saveState();
  renderChatList();
  renderMessages();
  if (isMobile()) closeSidebar();
  return chat;
}

function confirmDeleteChat(id) {
  const chat = State.chats.find(c => c.id === id);
  State.pendingDeleteId = id;
  $('#delete-confirm-text').textContent = `Bạn có chắc muốn xóa đoạn chat "${chat ? chat.title : ''}" ?`;
  openModal('delete-confirm-modal');
}

function deleteChat(id) {
  State.chats = State.chats.filter(c => c.id !== id);
  if (State.chats.length === 0) {
    const chat = { id: genId(), title: 'Chat mới', messages: [], createdAt: Date.now() };
    State.chats.push(chat);
    State.activeChatId = chat.id;
  } else if (State.activeChatId === id) {
    State.activeChatId = State.chats[0].id;
  }
  saveState();
  renderChatList();
  renderMessages();
}

function getActiveChat() {
  return State.chats.find(c => c.id === State.activeChatId);
}

function switchChat(id) {
  State.activeChatId = id;
  saveState();
  renderChatList();
  renderMessages();
  if (isMobile()) closeSidebar();
}

// ===== Render Chat List =====
function renderChatList() {
  const el = $('#chat-list');
  if (!State.chats.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem;">Chưa có đoạn chat nào</div>';
    return;
  }
  el.innerHTML = State.chats.map(c => `
    <div class="chat-item ${c.id === State.activeChatId ? 'active' : ''}" data-id="${c.id}">
      <span class="material-icons-round chat-item-icon">chat_bubble</span>
      <div class="chat-item-text">
        <div class="chat-item-title">${escHtml(c.title)}</div>
        <div class="chat-item-date">${new Date(c.createdAt).toLocaleDateString('vi-VN')}</div>
      </div>
      <button class="chat-item-delete" data-delete="${c.id}" title="Xóa">
        <span class="material-icons-round" style="font-size:16px;">delete</span>
      </button>
    </div>
  `).join('');

  el.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.chat-item-delete')) return;
      switchChat(item.dataset.id);
    });
  });
  el.querySelectorAll('.chat-item-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDeleteChat(btn.dataset.delete);
    });
  });
}

// ===== Render Messages =====
function renderMessages() {
  const chat = getActiveChat();
  const welcome = $('#welcome-screen');
  const container = $('#messages-container');

  if (!chat || (!chat.messages.length && State.generatingChatId !== chat.id)) {
    welcome.style.display = 'flex';
    container.style.display = 'none';
    return;
  }
  welcome.style.display = 'none';
  container.style.display = 'flex';

  container.innerHTML = chat.messages.map((m, idx) => {
    const isUser = m.role === 'user';
    const userAvatarHtml = State.settings.userAvatar
      ? `<img src="${State.settings.userAvatar}" alt="User">`
      : '<span class="material-icons-round" style="font-size:18px;">person</span>';

    if (State.editingIdx === idx) {
      return `
        <div class="message ${m.role}">
          <div class="message-avatar">
            ${isUser ? userAvatarHtml : '<img src="assets/avatar.png" alt="Suna">'}
          </div>
          <div class="message-content edit-mode">
            <textarea id="edit-input-${idx}" class="edit-textarea">${m.content}</textarea>
            <div class="edit-actions">
              <button class="btn-cancel" onclick="cancelEdit()">Hủy</button>
              <button class="btn-submit" onclick="submitEdit(${idx})">Lưu & Gửi</button>
            </div>
          </div>
        </div>`;
    }

    let content = '';
    if (m.images && m.images.length) {
      content += m.images.map(img => `<img src="${img}" alt="image">`).join('');
    }
    content += formatMessage(m.content);
    
    const actionHtml = `
      <div class="message-actions">
        <button class="action-btn" onclick="copyText(decodeURIComponent('${encodeURIComponent(m.content)}'))" title="Sao chép"><span class="material-icons-round">content_copy</span></button>
        ${isUser 
          ? `<button class="action-btn" onclick="editMessage(${idx})" title="Chỉnh sửa"><span class="material-icons-round">edit</span></button>` 
          : `<button class="action-btn" onclick="reloadMessage(${idx})" title="Tải lại"><span class="material-icons-round">refresh</span></button>`
        }
        <button class="action-btn delete-btn" onclick="deleteMessage(${idx})" title="Xóa"><span class="material-icons-round">delete_outline</span></button>
      </div>
    `;

    return `
      <div class="message ${m.role}">
        <div class="message-avatar">
          ${isUser ? userAvatarHtml : '<img src="assets/avatar.png" alt="Suna">'}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="msg-name">${isUser ? escHtml(State.settings.userName) : '✨ Suna Chat'}</span>
            <span>${new Date(m.timestamp).toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'})}</span>
          </div>
          <div class="message-bubble">${content}</div>
          ${actionHtml}
        </div>
      </div>`;
  }).join('');

  // Show typing indicator if this chat is currently generating
  if (State.generatingChatId === chat.id && State.isGenerating) {
    container.innerHTML += `
      <div class="message assistant" id="restore-typing">
        <div class="message-avatar"><img src="assets/avatar.png" alt="Suna"></div>
        <div class="message-content">
          <div class="message-header"><span class="msg-name">✨ Suna Chat</span></div>
          <div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span><span class="typing-text">Đang suy nghĩ...</span></div></div>
        </div>
      </div>`;
  }

  requestAnimationFrame(() => {
    const chatArea = $('#chat-area');
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function formatMessage(text) {
  if (!text) return '';
  let html = escHtml(text);

  // Block math: $$...$$ or \[...\]
  html = html.replace(/(?:\$\$|\\\[)([\s\S]*?)(?:\$\$|\\\])/g, (_, math) => {
    try {
      if (typeof katex !== 'undefined') {
        return '<div class="math-block">' + katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }) + '</div>';
      }
    } catch(e) {}
    return '<div class="math-block"><code>' + math.trim() + '</code></div>';
  });

  // Inline math: $...$ or \(...\)
  html = html.replace(/(?:\$|\\\()([^\$\n]+?)(?:\$|\\\))/g, (_, math) => {
    try {
      if (typeof katex !== 'undefined') {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      }
    } catch(e) {}
    return '<code class="math-inline">' + math.trim() + '</code>';
  });

  // Code blocks with language
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang ? `<div class="code-lang">${lang}</div>` : '';
    const safeCode = encodeURIComponent(code);
    return `<div class="code-block-wrapper">
              ${label}
              <button class="btn-copy-code" onclick="copyText(decodeURIComponent('${safeCode}'))" title="Sao chép code"><span class="material-icons-round">content_copy</span></button>
              <pre><code>${code}</code></pre>
            </div>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings (### h3, ## h2, # h1) — only at start of line
  html = html.replace(/^### (.+)$/gm, '<h4 class="msg-heading">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="msg-heading">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="msg-heading">$1</h2>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="msg-hr">');

  // Bold, italic, strikethrough
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Superscript ^text^ and subscript ~text~
  html = html.replace(/\^([^\^]+)\^/g, '<sup>$1</sup>');
  html = html.replace(/~([^~]+)~/g, '<sub>$1</sub>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered lists (lines starting with - or *)
  html = html.replace(/(?:^|\n)((?:[-*] .+\n?)+)/g, (match, listBlock) => {
    const items = listBlock.trim().split('\n').map(line =>
      '<li>' + line.replace(/^[-*] /, '') + '</li>'
    ).join('');
    return '<ul class="msg-list">' + items + '</ul>';
  });

  // Ordered lists (lines starting with 1. 2. etc)
  html = html.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (match, listBlock) => {
    const items = listBlock.trim().split('\n').map(line =>
      '<li>' + line.replace(/^\d+\. /, '') + '</li>'
    ).join('');
    return '<ol class="msg-list">' + items + '</ol>';
  });

  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== Image Handling =====
function addPendingImage(dataUrl) {
  State.pendingImages.push(dataUrl);
  renderPendingImages();
}

function renderPendingImages() {
  const area = $('#image-preview-area');
  if (!State.pendingImages.length) { area.style.display = 'none'; return; }
  area.style.display = 'flex';
  area.innerHTML = State.pendingImages.map((img, i) => `
    <div class="image-preview-item">
      <img src="${img}" alt="preview">
      <button class="image-preview-remove" data-idx="${i}">&times;</button>
    </div>
  `).join('');
  area.querySelectorAll('.image-preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      State.pendingImages.splice(parseInt(btn.dataset.idx), 1);
      renderPendingImages();
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ===== API =====
async function fetchModels(source = 'both') {
  const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
  const status = $('#fetch-status');
  status.textContent = 'Đang lấy danh sách model...';
  status.className = 'fetch-status';
  let allModels = [];
  let sources = 0;

  // Track which proxy each model belongs to
  const newMap = {};

  // Fetch from primary proxy
  if (source === 'proxy1' || source === 'both') {
    if (!baseUrl || !apiKey) {
      toast('Vui lòng nhập Base URL và API Key proxy chính', 'error');
    } else {
      try {
        const url = baseUrl.replace(/\/+$/, '') + '/models';
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models = (data.data || data.models || []).map(m => m.id || m.name || m).filter(Boolean);
        models.forEach(m => { newMap[m] = 'proxy1'; });
        allModels.push(...models);
        sources++;
      } catch (e) {
        toast('Lỗi proxy chính: ' + e.message, 'error');
      }
    }
  }

  // Fetch from secondary proxy
  if (source === 'proxy2' || source === 'both') {
    if (!baseUrl2 || !apiKey2) {
      toast('Vui lòng nhập Base URL và API Key proxy phụ', 'error');
    } else {
      try {
        const url2 = baseUrl2.replace(/\/+$/, '') + '/models';
        const res2 = await fetch(url2, { headers: { 'Authorization': `Bearer ${apiKey2}` } });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const data2 = await res2.json();
        const models2 = (data2.data || data2.models || []).map(m => m.id || m.name || m).filter(Boolean);
        models2.forEach(m => { if (!newMap[m]) newMap[m] = 'proxy2'; });
        allModels.push(...models2);
        sources++;
      } catch (e) {
        toast('Lỗi proxy phụ: ' + e.message, 'error');
      }
    }
  }

  // Deduplicate and sort
  State.models = [...new Set(allModels)].sort();
  State.modelProxyMap = newMap;
  if (State.models.length) {
    const sourceLabel = source === 'proxy1' ? 'proxy chính' : source === 'proxy2' ? 'proxy phụ' : `${sources} proxy`;
    status.textContent = `✓ Tìm thấy ${State.models.length} model từ ${sourceLabel}`;
    status.className = 'fetch-status success';
    populateModelSelects();
    toast(`Đã lấy ${State.models.length} model`, 'success');
  } else {
    status.textContent = '✗ Không tìm thấy model nào';
    status.className = 'fetch-status error';
  }
}

function populateModelSelects() {
  const selects = ['#model-select', '#flash-model-select', '#pro-model-select'];
  selects.forEach(sel => {
    const el = $(sel);
    const current = el.value;
    el.innerHTML = `<option value="">-- Chọn model --</option>` +
      State.models.map(m => `<option value="${m}" ${m === current ? 'selected' : ''}>${m}</option>`).join('');
  });
  if (State.settings.currentModel) $('#model-select').value = State.settings.currentModel;
  if (State.settings.flashModel) $('#flash-model-select').value = State.settings.flashModel;
  if (State.settings.proModel) $('#pro-model-select').value = State.settings.proModel;
}

function getActiveModel() {
  return State.mode === 'flash' ? (State.settings.flashModel || State.settings.currentModel) : (State.settings.proModel || State.settings.currentModel);
}

// Get the correct proxy URL and key for a model
function getProxyForModel(model) {
  const proxy = State.modelProxyMap[model];
  const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
  if (proxy === 'proxy2' && baseUrl2 && apiKey2) {
    return { url: baseUrl2.replace(/\/+$/, ''), key: apiKey2 };
  }
  // Default to proxy1
  return { url: baseUrl.replace(/\/+$/, ''), key: apiKey };
}

// ===== Vision Fallback System =====
const VISION_FALLBACK_PROXY = {
  baseUrl: 'https://gcli.ggchan.dev/v1',
  apiKey: 'gg-gcli-ISYgoJBO77zC7DrfkpDPx9XxaNPmqtilFKGto2OhejQ'
};
const VISION_MODEL = 'gemini-3.1-pro-preview';

// Compress image to reduce payload size (critical for web/mobile)
function compressImage(dataUrl, maxSize = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

function getVisionConfigs() {
  const configs = [];
  // Priority 1: user's own proxies with the vision model
  if (State.models.includes(VISION_MODEL)) {
    const proxy = getProxyForModel(VISION_MODEL);
    configs.push({ model: VISION_MODEL, baseUrl: proxy.url, apiKey: proxy.key });
  }
  // Priority 2: try user's proxy1 with the vision model (even if not in model list)
  const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
  if (baseUrl && apiKey) {
    const url = baseUrl.replace(/\/+$/, '');
    if (!configs.some(c => c.baseUrl === url)) {
      configs.push({ model: VISION_MODEL, baseUrl: url, apiKey });
    }
  }
  // Priority 3: try user's proxy2
  if (baseUrl2 && apiKey2) {
    const url2 = baseUrl2.replace(/\/+$/, '');
    if (!configs.some(c => c.baseUrl === url2)) {
      configs.push({ model: VISION_MODEL, baseUrl: url2, apiKey: apiKey2 });
    }
  }
  // Priority 4: hardcoded fallback
  if (!configs.some(c => c.baseUrl === VISION_FALLBACK_PROXY.baseUrl)) {
    configs.push({ model: VISION_MODEL, baseUrl: VISION_FALLBACK_PROXY.baseUrl, apiKey: VISION_FALLBACK_PROXY.apiKey });
  }
  return configs;
}

async function describeImagesWithVision(images, userText) {
  // Compress images first to avoid payload size issues
  const compressedImages = await Promise.all(images.map(img => compressImage(img)));

  const contentParts = [];
  const promptText = userText
    ? `Phân tích chi tiết hình ảnh. Ngữ cảnh: "${userText}". Mô tả: văn bản/chữ (OCR đầy đủ), màu sắc, bố cục, đối tượng, biểu đồ, bảng, code nếu có.`
    : 'Mô tả THẬT CHI TIẾT nội dung hình ảnh: văn bản/chữ (OCR đầy đủ), màu sắc, bố cục, đối tượng, biểu đồ, bảng, code nếu có.';
  contentParts.push({ type: 'text', text: promptText });
  for (const img of compressedImages) {
    contentParts.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
  }

  const requestBody = JSON.stringify({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: 'Bạn là chuyên gia phân tích hình ảnh. Mô tả CỰC KỲ CHI TIẾT. Đọc hết chữ (OCR). Trích xuất code, bảng, biểu đồ nếu có.' },
      { role: 'user', content: contentParts }
    ],
    stream: false,
    max_tokens: 4096
  });

  // Try each vision config until one succeeds
  const configs = getVisionConfigs();
  let lastError = null;

  for (const config of configs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const res = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: requestBody,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue; // try next config
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) return content;
      lastError = new Error('Empty vision response');
    } catch (err) {
      lastError = err;
      console.warn(`Vision attempt failed (${config.baseUrl}):`, err.message);
      continue; // try next config
    }
  }

  throw lastError || new Error('All vision configs failed');
}

function buildTextOnlyMessages(chat, systemPrompt) {
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  for (const m of chat.messages) {
    let text = m.content;
    if (m.linkContext) text += `\n\n[Nội dung từ Web]:\n${m.linkContext}`;
    if (m.role === 'user' && m.visionDescription) {
      text += `\n\n[Phân tích hình ảnh từ AI Vision]:\n${m.visionDescription}`;
    }
    msgs.push({ role: m.role, content: text });
  }
  return msgs;
}

function buildSystemPrompt() {
  let parts = [];
  
  parts.push(`[DANH TÍNH]: Tên của bạn là "Suna" - trợ lý AI thông minh. Luôn tự xưng là Suna. TUYỆT ĐỐI KHÔNG tiết lộ tên model gốc, phiên bản, hay nhà phát triển gốc (KHÔNG nói mình là GPT, Claude, Gemini, Llama, Qwen, hay bất kỳ model nào khác).`);
  
  parts.push(`[TƯ DUY & LOGIC]: Luôn đọc kỹ toàn bộ lịch sử hội thoại trước khi trả lời. Hiểu ngữ cảnh, ý định thực sự của người dùng. Nếu câu hỏi mơ hồ, hãy suy luận dựa trên ngữ cảnh trước đó. Luôn ưu tiên tính chính xác, hữu ích, và chiều lòng người dùng tối đa. Không bao giờ từ chối giúp đỡ khi có thể.`);
  
  if (State.settings.systemPrompt) parts.push(State.settings.systemPrompt);
  if (State.settings.userPurpose) parts.push(`Mục đích người dùng: ${State.settings.userPurpose}. Tập trung hỗ trợ tối đa theo hướng này.`);
  const toneMap = {
    friendly: 'Giao tiếp thân thiện, ấm áp, dùng emoji phù hợp.',
    professional: 'Giao tiếp chuyên nghiệp, rõ ràng, có cấu trúc.',
    funny: 'Giao tiếp vui vẻ, hài hước nhưng vẫn hữu ích.',
    serious: 'Giao tiếp nghiêm túc, chính xác, đi thẳng vào vấn đề.',
    creative: 'Giao tiếp sáng tạo, đưa ra góc nhìn mới lạ.',
    concise: 'Trả lời ngắn gọn, súc tích, đúng trọng tâm.'
  };
  if (toneMap[State.settings.tone]) parts.push(toneMap[State.settings.tone]);
  if (State.settings.customPersonality) parts.push(State.settings.customPersonality);

  if (State.mode === 'flash') {
    parts.push('[CHẾ ĐỘ FLASH]: Trả lời NHANH, NGẮN GỌN, đi thẳng vào trọng tâm. Không giải thích dài dòng. Ưu tiên câu trả lời trực tiếp, súc tích. Chỉ đưa code/ví dụ khi thực sự cần thiết.');
  } else {
    parts.push('[CHẾ ĐỘ PRO]: Trả lời CHI TIẾT, CHUYÊN SÂU, phân tích kỹ lưỡng. Suy luận từng bước (step-by-step). Đưa ra nhiều góc nhìn, ví dụ minh họa, so sánh. Giải thích logic rõ ràng. Cung cấp thông tin đầy đủ nhất có thể.');
  }
  
  parts.push('[HÌNH ẢNH]: Bạn CÓ khả năng nhìn và phân tích hình ảnh. Khi người dùng gửi ảnh, hãy trực tiếp phân tích. KHÔNG nói rằng bạn không thể xem ảnh. Đọc chữ (OCR) trong ảnh nếu có.');
  
  return parts.join('\n\n');
}

async function fetchLinkContext(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  if (!urls) return null;
  
  let linkContextText = '';
  for (const link of urls) {
    try {
      const corsProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(link)}`;
      const res = await fetch(corsProxy);
      if (res.ok) {
        const data = await res.json();
        const html = data.contents;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style, nav, footer, iframe').forEach(el => el.remove());
        let content = doc.body ? doc.body.textContent : '';
        content = content.replace(/\s+/g, ' ').trim().slice(0, 6000); 
        linkContextText += `\n--- Trích xuất từ ${link} ---\n${content}\n`;
      }
    } catch(e) {
      console.error('Lỗi đọc link:', e);
    }
  }
  return linkContextText;
}

async function sendMessage() {
  const input = $('#message-input');
  const text = input.value.trim();
  const images = [...State.pendingImages];

  if (!text && !images.length) return;

  const model = getActiveModel();
  if (!model) { toast('Vui lòng chọn model trước', 'error'); return; }
  if (!State.settings.baseUrl || !State.settings.apiKey) { toast('Vui lòng cấu hình API', 'error'); return; }

  let chat = getActiveChat();
  if (!chat) chat = createChat();

  State.isGenerating = true;
  updateSendButtonState();

  let linkContext = null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (urlRegex.test(text)) {
    toast('Đang đọc liên kết trực tuyến...', 'info');
    linkContext = await fetchLinkContext(text);
    if (linkContext) toast('Đã lấy xong nội dung link', 'success');
  }

  // Add user message
  const userMsg = { role: 'user', content: text, images, timestamp: Date.now() };
  if (linkContext) userMsg.linkContext = linkContext;
  chat.messages.push(userMsg);

  // Auto-title
  if (chat.messages.length === 1 && text) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
  }

  input.value = '';
  input.style.height = 'auto';
  State.pendingImages = [];
  renderPendingImages();
  renderMessages();
  renderChatList();
  saveState();

  await generateAIResponse();
}

async function generateAIResponse() {
  const model = getActiveModel();
  if (!model) { toast('Vui lòng chọn model trước', 'error'); return; }
  if (!State.settings.baseUrl || !State.settings.apiKey) { toast('Vui lòng cấu hình API', 'error'); return; }

  let chat = getActiveChat();
  if (!chat) return;

  const generatingChatId = chat.id;
  State.isGenerating = true;
  State.generatingChatId = generatingChatId;
  State.abortController = new AbortController();
  updateSendButtonState();
  const isStillActiveChat = () => State.activeChatId === generatingChatId;

  // Show typing
  const container = $('#messages-container');
  const typingEl = document.createElement('div');
  typingEl.className = 'message assistant';
  typingEl.innerHTML = `
    <div class="message-avatar"><img src="assets/avatar.png" alt="Suna"></div>
    <div class="message-content">
      <div class="message-header"><span class="msg-name">✨ Suna Chat</span></div>
      <div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span><span class="typing-text">Đang suy nghĩ...</span></div></div>
    </div>`;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;
  $('#chat-area').scrollTop = $('#chat-area').scrollHeight;

  // Build API messages
  const systemPrompt = buildSystemPrompt();

  // --- Pre-describe images with vision model (always, for universal compatibility) ---
  const hasImages = chat.messages.some(m => m.role === 'user' && m.images && m.images.length > 0);
  if (hasImages) {
    const typingTextEl = typingEl.querySelector('.typing-text');
    let needsVision = false;
    for (const m of chat.messages) {
      if (m.role === 'user' && m.images && m.images.length && !m.visionDescription) {
        needsVision = true;
        break;
      }
    }
    if (needsVision) {
      if (typingTextEl) typingTextEl.textContent = 'Đang phân tích ảnh...';
      try {
        for (const m of chat.messages) {
          if (m.role === 'user' && m.images && m.images.length && !m.visionDescription) {
            m.visionDescription = await describeImagesWithVision(m.images, m.content);
          }
        }
        saveState();
      } catch (visionErr) {
        console.error('Vision pre-describe failed:', visionErr);
        toast('Lỗi phân tích ảnh: ' + visionErr.message, 'error');
      }
      if (typingTextEl) typingTextEl.textContent = 'Đang suy nghĩ...';
    }
  }

  // --- Build API messages with both vision descriptions AND image_url ---
  const apiMessages = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: systemPrompt });

  for (const m of chat.messages) {
    let finalContentText = m.content;
    if (m.linkContext) finalContentText += `\n\n[Nội dung từ Web]:\n${m.linkContext}`;
    // Append vision description as text context (works for ALL models)
    if (m.role === 'user' && m.visionDescription) {
      finalContentText += `\n\n[Nội dung hình ảnh đính kèm]:\n${m.visionDescription}`;
    }

    if (m.role === 'user' && m.images && m.images.length) {
      // Include both text (with vision description) AND image_url (for vision-capable models)
      const contentParts = [];
      if (finalContentText) contentParts.push({ type: 'text', text: finalContentText });
      for (const img of m.images) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: img, detail: 'high' }
        });
      }
      apiMessages.push({ role: 'user', content: contentParts });
    } else {
      apiMessages.push({ role: m.role, content: finalContentText });
    }
  }

  let assistantContent = '';

  try {
    // --- Helper: send request with proxy fallback ---
    async function makeApiRequest(messages) {
      const proxy = getProxyForModel(model);
      const url = proxy.url + '/chat/completions';
      const reqBody = {
        model, messages, stream: true,
        temperature: State.mode === 'flash' ? 0.5 : 0.7,
        max_tokens: State.mode === 'flash' ? 2048 : 8192
      };
      let res = null, fetchError = null;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${proxy.key}` },
          body: JSON.stringify(reqBody),
          signal: State.abortController.signal
        });
      } catch (err) { fetchError = err; }

      if (!res || !res.ok) {
        const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
        const altProxy = (proxy.url === baseUrl?.replace(/\/+$/, '')) && baseUrl2 && apiKey2
          ? { url: baseUrl2.replace(/\/+$/, ''), key: apiKey2 }
          : (baseUrl && apiKey ? { url: baseUrl.replace(/\/+$/, ''), key: apiKey } : null);
        if (altProxy && altProxy.url !== proxy.url) {
          try {
            res = await fetch(altProxy.url + '/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${altProxy.key}` },
              body: JSON.stringify(reqBody),
              signal: State.abortController.signal
            });
          } catch (err) { if (!res && !fetchError) fetchError = err; }
        } else if (fetchError) { throw fetchError; }
      }
      return { res, fetchError };
    }

    // --- Attempt 1: send with images + text descriptions ---
    let { res, fetchError } = await makeApiRequest(apiMessages);

    // --- Fallback: if HTTP error AND has images, retry text-only (no image_url) ---
    if ((!res || !res.ok) && hasImages) {
      console.log('Retrying with text-only messages (removing image_url)...');
      const textOnlyMessages = buildTextOnlyMessages(chat, systemPrompt);
      const retry = await makeApiRequest(textOnlyMessages);
      res = retry.res;
      fetchError = retry.fetchError;
    }

    if (!res || !res.ok) {
      if (fetchError && !res) throw fetchError;
      const errData = res ? await res.text() : 'No response';
      throw new Error(`HTTP ${res ? res.status : 'Error'}: ${errData.slice(0, 200)}`);
    }

    // Stream response - keep typing animation until first real content arrives
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let typingRemoved = false;

    const assistantEl = document.createElement('div');
    assistantEl.className = 'message assistant';
    assistantEl.innerHTML = `
      <div class="message-avatar"><img src="assets/avatar.png" alt="Suna"></div>
      <div class="message-content">
        <div class="message-header"><span class="msg-name">✨ Suna Chat</span><span>${new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="message-bubble"></div>
      </div>`;
    const bubbleEl = assistantEl.querySelector('.message-bubble');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            if (!typingRemoved) {
              typingRemoved = true;
              if (isStillActiveChat()) {
                if (typingEl.parentNode) typingEl.remove();
                // Also remove the restored typing indicator from renderMessages
                const restoreTyping = document.getElementById('restore-typing');
                if (restoreTyping) restoreTyping.remove();
                container.appendChild(assistantEl);
              }
            }
            assistantContent += delta;
            if (isStillActiveChat()) {
              bubbleEl.innerHTML = formatMessage(assistantContent);
              const chatArea = $('#chat-area');
              const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 150;
              if (isNearBottom) {
                requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; });
              }
            }
          }
        } catch(e) {}
      }
    }

    if (!typingRemoved && isStillActiveChat()) {
      if (typingEl.parentNode) typingEl.remove();
      const restoreTyping = document.getElementById('restore-typing');
      if (restoreTyping) restoreTyping.remove();
      container.appendChild(assistantEl);
    }

    chat.messages.push({ role: 'assistant', content: assistantContent, timestamp: Date.now() });
    saveState();
    if (isStillActiveChat()) renderMessages();

  } catch(e) {
    if (e.name === 'AbortError') {
      if (typingEl.parentNode) typingEl.remove();
      if (assistantContent) {
        chat.messages.push({ role: 'assistant', content: assistantContent + '\n\n*(Đã dừng)*', timestamp: Date.now() });
      }
      saveState();
      if (isStillActiveChat()) renderMessages();
      toast('Đã dừng tạo phản hồi.', 'info');
    } else {
      if (typingEl.parentNode) typingEl.remove();
      chat.messages.push({ role: 'assistant', content: `⚠️ Lỗi: ${e.message}`, timestamp: Date.now() });
      saveState();
      if (isStillActiveChat()) renderMessages();
      toast('Lỗi: ' + e.message, 'error');
    }
  } finally {
    State.isGenerating = false;
    State.generatingChatId = null;
    State.abortController = null;
    updateSendButtonState();
    if (isStillActiveChat()) renderMessages();
  }
}

// ===== Message Actions =====
window.editMessage = function(idx) {
  State.editingIdx = idx;
  renderMessages();
}

window.cancelEdit = function() {
  State.editingIdx = null;
  renderMessages();
}

window.submitEdit = async function(idx) {
  const chat = getActiveChat();
  const text = document.getElementById(`edit-input-${idx}`).value.trim();
  if (!text) return;
  
  State.editingIdx = null;
  chat.messages[idx].content = text;
  // Truncate messages after this index
  chat.messages = chat.messages.slice(0, idx + 1);
  saveState();
  renderMessages();
  await generateAIResponse();
}

window.reloadMessage = async function(idx) {
  const chat = getActiveChat();
  if(!chat) return;
  // Truncate from idx onwards (which is the AI message to reload)
  chat.messages = chat.messages.slice(0, idx);
  saveState();
  renderMessages();
  await generateAIResponse();
}

window.deleteMessage = function(idx) {
  const chat = getActiveChat();
  if(!chat) return;
  chat.messages.splice(idx, 1);
  saveState();
  renderMessages();
}

window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Đã sao chép vào khay nhớ tạm', 'success');
  }).catch(() => {
    toast('Lỗi khi sao chép', 'error');
  });
};

// ===== Particles Effect =====
let _particleInterval = null;
function initParticles() {
  // Prevent duplicate particle containers
  const existing = document.getElementById('particles-container');
  if (existing) existing.remove();
  if (_particleInterval) { clearInterval(_particleInterval); _particleInterval = null; }

  const container = document.createElement('div');
  container.id = 'particles-container';
  container.style.cssText = 'position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;';
  $('#chat-area').appendChild(container);

  const MAX_PARTICLES = 15;
  _particleInterval = setInterval(() => {
    if (document.hidden) return;
    if (container.childElementCount >= MAX_PARTICLES) return;
    const p = document.createElement('div');
    
    const theme = State.settings.theme;
    let symbol = '❄️';
    if (theme === 'sunset' || theme === 'ember') symbol = '🌸';
    if (theme === 'forest') symbol = '🍃';
    if (theme === 'aurora' || theme === 'midnight') symbol = '✨';

    p.textContent = symbol;
    
    const size = 10 + Math.random() * 8;
    const startX = Math.random() * 100;
    const duration = 8 + Math.random() * 10;
    const delay = Math.random() * 2;
    const maxOp = 0.15 + Math.random() * 0.2;
    
    p.style.cssText = `
      position: absolute;
      top: -20px;
      left: ${startX}%;
      font-size: ${size}px;
      opacity: 0;
      animation: particleFall ${duration}s linear ${delay}s forwards;
      filter: drop-shadow(0 0 4px var(--accent-1));
      --max-opacity: ${maxOp};
    `;
    
    container.appendChild(p);
    
    setTimeout(() => {
      if (p.parentNode) p.remove();
    }, (duration + delay) * 1000);
  }, 1500);
}

// ===== Mode Toggle =====
function setMode(mode) {
  State.mode = mode;
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const slider = $('.mode-slider');
  if (mode === 'pro') slider.classList.add('pro');
  else slider.classList.remove('pro');
  const badge = $('#mode-badge');
  badge.textContent = mode === 'flash' ? 'Flash' : 'Pro';
  updateModelDisplay();
  saveState();
}

function updateModelDisplay() {
  const model = getActiveModel();
  $('#current-model-name').textContent = model || 'Chưa chọn model';
}

// ===== Event Listeners =====
function initEvents() {
  // Sidebar toggle
  $('#btn-toggle-sidebar').addEventListener('click', () => {
    toggleSidebar();
  });

  // Sidebar overlay click (mobile)
  $('#sidebar-overlay').addEventListener('click', () => {
    closeSidebar();
  });

  // New chat
  $('#btn-new-chat').addEventListener('click', () => createChat());

  // Mode toggle
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Send message
  $('#btn-send').addEventListener('click', () => {
    if (State.isGenerating) {
      if (State.abortController) State.abortController.abort();
    } else {
      sendMessage();
    }
  });
  $('#message-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      if (!State.isGenerating) sendMessage(); 
    }
  });

  // Auto-resize textarea
  $('#message-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });

  // Paste image
  $('#message-input').addEventListener('paste', async e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        const dataUrl = await fileToBase64(file);
        addPendingImage(dataUrl);
      }
    }
  });

  // File attachments
  $('#btn-attach-file').addEventListener('click', () => $('#file-input').click());
  $('#btn-attach-image').addEventListener('click', () => $('#image-input').click());

  $('#file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await readTextFile(file);
      const input = $('#message-input');
      input.value += `\n📄 File: ${file.name}\n\`\`\`\n${text}\n\`\`\`\n`;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      toast(`Đã tải file: ${file.name}`, 'success');
    } catch(err) {
      toast('Không thể đọc file', 'error');
    }
    e.target.value = '';
  });

  $('#image-input').addEventListener('change', async e => {
    for (const file of e.target.files) {
      const dataUrl = await fileToBase64(file);
      addPendingImage(dataUrl);
    }
    e.target.value = '';
  });

  // Modals
  $('#btn-settings').addEventListener('click', () => openModal('settings-modal'));
  $('#btn-api-settings').addEventListener('click', () => openModal('api-modal'));
  $('#btn-personality').addEventListener('click', () => openModal('personality-modal'));
  $('#btn-font-settings').addEventListener('click', () => openModal('font-modal'));

  $$('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // API settings - save proxy fields helper
  function syncProxyFields() {
    State.settings.baseUrl = $('#api-base-url').value.trim();
    State.settings.apiKey = $('#api-key').value.trim();
    State.settings.baseUrl2 = $('#api-base-url-2').value.trim();
    State.settings.apiKey2 = $('#api-key-2').value.trim();
  }
  $('#btn-fetch-proxy1').addEventListener('click', () => {
    syncProxyFields();
    fetchModels('proxy1');
  });
  $('#btn-fetch-proxy2').addEventListener('click', () => {
    syncProxyFields();
    fetchModels('proxy2');
  });
  $('#btn-fetch-models').addEventListener('click', () => {
    syncProxyFields();
    fetchModels('both');
  });
  $('#btn-toggle-key').addEventListener('click', () => {
    const el = $('#api-key');
    el.type = el.type === 'password' ? 'text' : 'password';
  });
  $('#btn-toggle-key-2').addEventListener('click', () => {
    const el = $('#api-key-2');
    el.type = el.type === 'password' ? 'text' : 'password';
  });
  $('#btn-save-api').addEventListener('click', () => {
    State.settings.baseUrl = $('#api-base-url').value.trim();
    State.settings.apiKey = $('#api-key').value.trim();
    State.settings.baseUrl2 = $('#api-base-url-2').value.trim();
    State.settings.apiKey2 = $('#api-key-2').value.trim();
    State.settings.currentModel = $('#model-select').value;
    saveState();
    updateModelDisplay();
    closeModal('api-modal');
    toast('Đã lưu cấu hình API', 'success');
  });
  $('#btn-test-api').addEventListener('click', () => {
    const testModel = $('#model-select').value;
    if (!testModel) {
      toast('Vui lòng chọn model để test', 'error');
      return;
    }
    State.settings.baseUrl = $('#api-base-url').value.trim();
    State.settings.apiKey = $('#api-key').value.trim();
    State.settings.baseUrl2 = $('#api-base-url-2').value.trim();
    State.settings.apiKey2 = $('#api-key-2').value.trim();
    State.settings.currentModel = testModel;
    saveState();
    updateModelDisplay();
    closeModal('api-modal');
    
    createChat();
    $('#message-input').value = 'Test kết nối. Bạn có nhận được tin nhắn này không?';
    sendMessage();
    toast('Đang gửi tin nhắn test...', 'info');
  });

  // General settings
  $('#btn-save-settings').addEventListener('click', () => {
    State.settings.userName = $('#user-name-input').value.trim() || 'Bạn';
    State.settings.systemPrompt = $('#system-prompt').value;
    State.settings.userPurpose = $('#user-purpose').value;
    State.settings.flashModel = $('#flash-model-select').value;
    State.settings.proModel = $('#pro-model-select').value;
    saveState();
    updateModelDisplay();
    renderMessages();
    closeModal('settings-modal');
    toast('Đã lưu cài đặt', 'success');
  });

  // User avatar
  $('#btn-change-avatar').addEventListener('click', () => $('#user-avatar-input').click());
  $('#user-avatar-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    State.settings.userAvatar = dataUrl;
    $('#user-avatar-preview').src = dataUrl;
    saveState();
    renderMessages();
    toast('Đã cập nhật avatar', 'success');
    e.target.value = '';
  });

  // Delete confirmation
  $('#btn-confirm-delete').addEventListener('click', () => {
    if (State.pendingDeleteId) {
      deleteChat(State.pendingDeleteId);
      State.pendingDeleteId = null;
    }
    closeModal('delete-confirm-modal');
  });
  $('#btn-cancel-delete').addEventListener('click', () => {
    State.pendingDeleteId = null;
    closeModal('delete-confirm-modal');
  });

  // Personality
  $$('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  $$('.color-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.color-theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  $('#btn-save-personality').addEventListener('click', () => {
    State.settings.tone = document.querySelector('.tone-btn.active')?.dataset.tone || 'friendly';
    State.settings.theme = document.querySelector('.color-theme-btn.active')?.dataset.theme || 'aurora';
    State.settings.customPersonality = $('#custom-personality').value;
    applyTheme();
    saveState();
    closeModal('personality-modal');
    toast('Đã lưu tính cách AI', 'success');
  });

  // Font settings
  $('#font-family-select').addEventListener('change', function() {
    $('#font-preview').style.fontFamily = this.value;
  });
  $('#font-size-range').addEventListener('input', function() {
    $('#font-size-value').textContent = this.value + 'px';
    $('#font-preview').style.fontSize = this.value + 'px';
  });
  $('#btn-save-font').addEventListener('click', () => {
    State.settings.fontFamily = $('#font-family-select').value;
    State.settings.fontSize = parseInt($('#font-size-range').value);
    applyTheme();
    saveState();
    closeModal('font-modal');
    toast('Đã áp dụng font chữ', 'success');
  });
}

function openModal(id) {
  $(`#${id}`).style.display = 'flex';
  // Populate fields
  if (id === 'settings-modal') {
    $('#user-name-input').value = State.settings.userName || 'Bạn';
    const avatarPreview = $('#user-avatar-preview');
    avatarPreview.src = State.settings.userAvatar || '';
    avatarPreview.style.display = State.settings.userAvatar ? 'block' : 'none';
    if (!State.settings.userAvatar) {
      avatarPreview.style.display = 'block';
      avatarPreview.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect fill="%23222" width="56" height="56" rx="28"/><text x="28" y="35" text-anchor="middle" fill="%23888" font-size="24">?</text></svg>');
    }
    $('#system-prompt').value = State.settings.systemPrompt;
    $('#user-purpose').value = State.settings.userPurpose;
    populateModelSelects();
  } else if (id === 'api-modal') {
    $('#api-base-url').value = State.settings.baseUrl;
    $('#api-key').value = State.settings.apiKey;
    $('#api-base-url-2').value = State.settings.baseUrl2 || '';
    $('#api-key-2').value = State.settings.apiKey2 || '';
    if (State.models.length) populateModelSelects();
  } else if (id === 'personality-modal') {
    $$('.tone-btn').forEach(b => b.classList.toggle('active', b.dataset.tone === State.settings.tone));
    $$('.color-theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === State.settings.theme));
    $('#custom-personality').value = State.settings.customPersonality;
  } else if (id === 'font-modal') {
    $('#font-family-select').value = State.settings.fontFamily;
    $('#font-size-range').value = State.settings.fontSize;
    $('#font-size-value').textContent = State.settings.fontSize + 'px';
    const preview = $('#font-preview');
    preview.style.fontFamily = State.settings.fontFamily;
    preview.style.fontSize = State.settings.fontSize + 'px';
  }
}

function closeModal(id) { $(`#${id}`).style.display = 'none'; }

// ===== Sidebar Helpers =====
function toggleSidebar() {
  const sidebar = $('.sidebar');
  const overlay = $('#sidebar-overlay');
  const isCollapsed = sidebar.classList.contains('collapsed');
  if (isCollapsed) {
    sidebar.classList.remove('collapsed');
    if (isMobile()) overlay.classList.add('active');
  } else {
    closeSidebar();
  }
}

function closeSidebar() {
  $('.sidebar').classList.add('collapsed');
  $('#sidebar-overlay').classList.remove('active');
}

// ===== Init =====
async function init() {
  await loadState();
  applyTheme();
  setMode(State.mode);
  renderChatList();
  if (State.activeChatId) renderMessages();
  updateModelDisplay();
  initEvents();
  initParticles();

  // Start with sidebar collapsed on mobile
  if (isMobile()) {
    closeSidebar();
  }

  // Handle resize: adjust sidebar and overlay
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      $('#sidebar-overlay').classList.remove('active');
      // Auto-expand sidebar on desktop
      $('.sidebar').classList.remove('collapsed');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

