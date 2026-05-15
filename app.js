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
  pendingFiles: [],
  modelProxyMap: {},
  isGenerating: false,
  abortController: null,
  generatingChatId: null,
  // === AI Memory System ===
  memory: {
    facts: [],        // Mảng các thông tin đã ghi nhớ về user [{fact, category, timestamp}]
    lastUpdated: 0
  }
};

// ===== AI Memory System =====
const MEMORY_CATEGORIES = {
  identity: '👤 Danh tính',
  preference: '⭐ Sở thích',
  skill: '💻 Kỹ năng',
  work: '💼 Công việc',
  context: '📌 Ngữ cảnh',
  style: '🎨 Phong cách'
};

async function loadMemory() {
  try {
    const mem = await idbGet('suna_memory');
    if (mem && mem.facts) State.memory = mem;
  } catch(e) { console.error('Load memory error:', e); }
}

async function saveMemory() {
  try {
    State.memory.lastUpdated = Date.now();
    await idbSet('suna_memory', State.memory);
  } catch(e) { console.error('Save memory error:', e); }
}

function addMemoryFact(fact, category = 'context') {
  // Tránh trùng lặp (so sánh nội dung tương tự)
  const isDuplicate = State.memory.facts.some(f => 
    f.fact.toLowerCase().trim() === fact.toLowerCase().trim()
  );
  if (isDuplicate) return false;
  
  // Giới hạn tối đa 50 fact để không phình prompt
  if (State.memory.facts.length >= 50) {
    State.memory.facts.shift(); // Xóa fact cũ nhất để nhường chỗ
  }
  State.memory.facts.push({
    fact: fact.trim(),
    category,
    timestamp: Date.now()
  });
  saveMemory();
  return true;
}

function removeMemoryFact(index) {
  if (index >= 0 && index < State.memory.facts.length) {
    State.memory.facts.splice(index, 1);
    saveMemory();
  }
}

function getMemoryPrompt() {
  if (!State.memory.facts.length) return '';
  let memText = '[TRÍ NHỚ VỀ NGƯỜI DÙNG - Thông tin đã ghi nhớ từ các cuộc hội thoại trước]:\n';
  const grouped = {};
  for (const f of State.memory.facts) {
    const cat = f.category || 'context';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f.fact);
  }
  for (const [cat, facts] of Object.entries(grouped)) {
    const label = MEMORY_CATEGORIES[cat] || cat;
    memText += `${label}: ${facts.join('; ')}\n`;
  }
  memText += '\nSử dụng thông tin trên để cá nhân hóa câu trả lời. Gọi người dùng bằng tên nếu biết. LƯU Ý: Nếu có mâu thuẫn giữa trí nhớ và cài đặt hiện tại (System Prompt, Mục đích), LUÔN ưu tiên cài đặt hiện tại.';
  return memText;
}

// Tự động trích xuất thông tin quan trọng từ tin nhắn user
function extractMemoryFromMessage(text) {
  if (!text || text.length < 5) return;
  const lower = text.toLowerCase();
  
  // Phát hiện tên
  const namePatterns = [
    /(?:tên|name)\s+(?:(?:của\s+)?(?:tôi|mình|tao|em|anh|chị)\s+)?(?:là|is)\s+["']?([A-ZÀ-Ỹa-zà-ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ][a-zà-ỹ]+)*)/i,
    /(?:tôi|mình|tao|em|anh|chị)\s+(?:tên\s+)?là\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*)/i,
    /(?:call me|gọi\s+(?:tôi|mình)\s+là)\s+([A-ZÀ-Ỹa-zà-ỹ]\w+)/i
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length >= 2 && m[1].length <= 30) {
      addMemoryFact(`Tên: ${m[1]}`, 'identity');
      // Tự động cập nhật tên hiển thị
      if (State.settings.userName === 'Bạn' || State.settings.userName === '') {
        State.settings.userName = m[1];
        saveState();
      }
      break;
    }
  }
  
  // Phát hiện nghề nghiệp/công việc
  const jobPatterns = [
    /(?:tôi|mình|em|anh|chị)\s+(?:là|đang làm|làm việc|work as)\s+(?:một\s+)?([a-zà-ỹA-ZÀ-Ỹ\s]{3,40}?)(?:\.|,|$|\n)/i,
    /(?:nghề|job|career|chức vụ|vị trí)\s+(?:của\s+)?(?:tôi|mình)\s+là\s+([a-zà-ỹA-ZÀ-Ỹ\s]{3,40})/i
  ];
  for (const p of jobPatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const job = m[1].trim();
      // Lọc bỏ các từ quá chung chung
      if (job.length >= 3 && !['một', 'người', 'cái', 'the', 'a'].includes(job.toLowerCase())) {
        addMemoryFact(`Nghề nghiệp: ${job}`, 'work');
        break;
      }
    }
  }
  
  // Phát hiện ngôn ngữ lập trình / công nghệ yêu thích  
  const techKeywords = ['python', 'javascript', 'typescript', 'java', 'c\\+\\+', 'c#', 'rust', 'go', 'ruby', 'php', 'swift', 'kotlin', 'react', 'vue', 'angular', 'node', 'django', 'flask', 'spring', 'flutter', 'unity', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'tensorflow', 'pytorch', 'linux', 'macos', 'windows'];
  const techPattern = new RegExp(`(?:tôi|mình|em)\\s+(?:dùng|sử dụng|viết|code|lập trình|thích|yêu thích|prefer|use|học)\\s+(?:bằng\\s+)?(?:ngôn ngữ\\s+)?(${techKeywords.join('|')})`, 'gi');
  const techMatches = text.match(techPattern);
  if (techMatches) {
    for (const tm of techMatches) {
      for (const kw of techKeywords) {
        if (tm.toLowerCase().includes(kw.replace(/\\\\/g, ''))) {
          addMemoryFact(`Sử dụng: ${kw.replace(/\\\\/g, '')}`, 'skill');
        }
      }
    }
  }
  
  // Phát hiện sở thích
  const hobbyPatterns = [
    /(?:tôi|mình|em)\s+(?:thích|yêu thích|đam mê|enjoy|love|like)\s+([a-zà-ỹA-ZÀ-Ỹ\s]{3,40}?)(?:\.|,|$|\n)/i
  ];
  for (const p of hobbyPatterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].trim().length >= 3) {
      addMemoryFact(`Thích: ${m[1].trim()}`, 'preference');
      break;
    }
  }
  
  // Phát hiện tuổi
  const ageMatch = text.match(/(?:tôi|mình|em)\s+(?:năm nay\s+)?(?:được\s+)?(\d{1,2})\s+tuổi/i);
  if (ageMatch && parseInt(ageMatch[1]) >= 5 && parseInt(ageMatch[1]) <= 100) {
    addMemoryFact(`Tuổi: ${ageMatch[1]}`, 'identity');
  }
}

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

let _saveTimeout = null;
function saveState() {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem('suna_settings', JSON.stringify(State.settings));
      localStorage.setItem('suna_mode', State.mode);
      idbSet('suna_chats', State.chats).catch(e => console.error('IndexedDB save error:', e));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        toast('Bộ nhớ settings đã đầy!', 'error');
      } else {
        console.error('Lỗi khi lưu trạng thái:', e);
      }
    }
  }, 500); // Debounce 500ms để tránh lag UI khi lưu liên tục
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
  
  // Light/Dark mode
  if (State.settings.lightMode) {
    document.body.classList.add('light-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = 'dark_mode';
    // Cập nhật meta theme-color cho trình duyệt mobile
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#f5f5f7');
  } else {
    document.body.classList.remove('light-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = 'light_mode';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#0d0b14');
  }
}

// ===== Chat Management =====
function createChat() {
  // Anti-spam: Không tạo chat mới nếu chat hiện tại đang trống
  const currentChat = getActiveChat();
  if (currentChat && currentChat.messages.length === 0 && currentChat.title === 'Chat mới') {
    if (isMobile()) closeSidebar();
    $('#message-input').focus();
    return currentChat;
  }

  const chat = { id: genId(), title: 'Chat mới', messages: [], createdAt: Date.now() };
  State.chats.unshift(chat);
  State.activeChatId = chat.id;
  saveState();
  renderChatList();
  renderMessages();
  if (isMobile()) closeSidebar();
  $('#message-input').focus();
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
            if (m.files && m.files.length) {
      content += '<div class="msg-files-container">' + m.files.map(f => {
        const icon = getFileIcon(f.ext);
        const sizeStr = f.size < 1024 ? f.size + 'B' : f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + 'KB' : (f.size / (1024*1024)).toFixed(1) + 'MB';
        return `<div class="msg-file-card"><div class="msg-file-icon">${icon}</div><div class="msg-file-info"><div class="msg-file-name">${escHtml(f.name)}</div><div class="msg-file-meta">${sizeStr} • ${f.lang || f.ext.toUpperCase() || 'FILE'}</div></div></div>`;
      }).join('') + '</div>';
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

function renderKatex(math, displayMode) {
  try {
    if (typeof katex !== 'undefined') {
      // Decode HTML entities trước khi render (vì đã qua escHtml)
      const decoded = math.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return katex.renderToString(decoded.trim(), {
        displayMode: displayMode,
        throwOnError: false,
        strict: false,
        trust: true,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
          '\\Z': '\\mathbb{Z}',
          '\\Q': '\\mathbb{Q}',
          '\\C': '\\mathbb{C}'
        }
      });
    }
  } catch(e) {
    console.warn('KaTeX render error:', e.message);
  }
  return null;
}

function formatMessage(text) {
  if (!text) return '';
  let html = escHtml(text);

  // === PLACEHOLDER SYSTEM ===
  // KaTeX output chứa các ký tự đặc biệt (*, ^, ~, _, etc.) mà Markdown regex sẽ phá hỏng.
  // Giải pháp: thay KaTeX output bằng placeholder tạm, xử lý Markdown xong mới khôi phục.
  const mathPlaceholders = [];
  function saveMath(html) {
    const id = mathPlaceholders.length;
    mathPlaceholders.push(html);
    return '%%MATH_' + id + '%%';
  }

  // Block math: $$...$$ or \[...\]
  html = html.replace(/(?:\$\$|\\\[)([\s\S]*?)(?:\$\$|\\\])/g, (_, math) => {
    const rendered = renderKatex(math, true);
    if (rendered) return saveMath('<div class="math-block">' + rendered + '</div>');
    return '<div class="math-block"><code>' + math.trim() + '</code></div>';
  });

  // Inline math: $...$ — nhưng không bắt $$ (đã xử lý ở trên)
  html = html.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, math) => {
    const rendered = renderKatex(math, false);
    if (rendered) return saveMath('<span class="math-inline-rendered">' + rendered + '</span>');
    return '<code class="math-inline">' + math.trim() + '</code>';
  });

  // \(...\) inline math
  html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    const rendered = renderKatex(math, false);
    if (rendered) return saveMath('<span class="math-inline-rendered">' + rendered + '</span>');
    return '<code class="math-inline">' + math.trim() + '</code>';
  });

    // Code blocks with language (Hỗ trợ các ngôn ngữ đặc biệt như c++, c#, html)
  html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const cleanLang = lang.trim();
    const label = cleanLang ? `<div class="code-lang">${cleanLang}</div>` : '';
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
  // Links [text](url) - Added basic protection against javascript: links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const safeUrl = url.trim().toLowerCase().startsWith('javascript:') ? '#' : url;
    return `<a href="${safeUrl}" target="_blank" rel="noopener">${text}</a>`;
  });

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

    // Tables
  html = html.replace(/(?:^|\n)(\|.*\|\n\|[-:| ]+\|\n(?:\|.*\|(?:\n|$))+)/g, (match, table) => {
    const rows = table.trim().split('\n');
    let tableHtml = '<table>';
    rows.forEach((row, i) => {
      if (i === 1) return; // Skip separator row
      const cells = row.split('|').filter((_, index, arr) => index > 0 && index < arr.length - 1);
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += i === 0 ? `<th>${cell.trim()}</th>` : `<td>${cell.trim()}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table>';
    return tableHtml;
  });

  // Blockquotes
  html = html.replace(/(?:^|\n)> (.+)(?:\n> .+)*(?:\n|$)/g, (match) => {
    const quoteContent = match.replace(/(^|\n)> /g, '$1').trim();
    return `<blockquote>${quoteContent}</blockquote>`;
  });

  // Line breaks (bỏ qua những cái đã nằm trong HTML tags như bảng)
  html = html.replace(/\n/g, '<br>');
    // Dọn dẹp lỗi thẻ BR dư thừa bên trong table do line-break
  html = html.replace(/<br>\s*<\/td>/g, '</td>').replace(/<br>\s*<\/th>/g, '</th>').replace(/<br>\s*<tr>/g, '<tr>').replace(/<\/tr>\s*<br>/g, '</tr>').replace(/<br>\s*<table>/g, '<table>').replace(/<\/table>\s*<br>/g, '</table>');

  // === KHÔI PHỤC MATH PLACEHOLDERS ===
  // Đặt lại toàn bộ KaTeX HTML đã render vào đúng vị trí (sau khi Markdown xử lý xong)
  html = html.replace(/%%MATH_(\d+)%%/g, (_, id) => mathPlaceholders[parseInt(id)] || '');

  return html;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== Image Handling =====
function addPendingImage(dataUrl) {
  if (State.pendingImages.length >= MAX_PENDING_IMAGES) {
    toast('Tối đa ' + MAX_PENDING_IMAGES + ' ảnh cùng lúc', 'error');
    return;
  }
  State.pendingImages.push(dataUrl);
  renderPendingImages();
}

const MAX_PENDING_FILES = 5;

// Universal file icon mapper
function getFileIcon(ext) {
  const iconMap = {
    'py': '🐍', 'js': '📜', 'ts': '📘', 'jsx': '⚛️', 'tsx': '⚛️',
    'html': '🌐', 'htm': '🌐', 'css': '🎨', 'json': '📋', 'xml': '📄', 'md': '📝',
    'java': '☕', 'cpp': '⚙️', 'c': '⚙️', 'cs': '🔷', 'rb': '💎',
    'php': '🐘', 'go': '🐹', 'rs': '🦀', 'swift': '🍎', 'kt': '🟣',
    'sql': '🗄️', 'sh': '🖥️', 'bat': '🖥️', 'yaml': '📐', 'yml': '📐',
    'csv': '📊', 'xls': '📊', 'xlsx': '📊',
    'txt': '📄', 'log': '📋', 'ini': '⚙️', 'cfg': '⚙️', 'env': '🔒', 'toml': '📐',
    'pdf': '📕', 'doc': '📘', 'docx': '📘', 'rtf': '📘',
    'ppt': '📙', 'pptx': '📙', 'odt': '📘', 'ods': '📊', 'odp': '📙',
    'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
    'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
    'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬',
    'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
    'epub': '📚', 'mobi': '📚'
  };
  return iconMap[ext] || '📄';
}

function addPendingFile(fileData) {
  if (State.pendingFiles.length >= MAX_PENDING_FILES) {
    toast('Tối đa ' + MAX_PENDING_FILES + ' file cùng lúc', 'error');
    return;
  }
  State.pendingFiles.push(fileData);
  renderPendingFiles();
}

function renderPendingFiles() {
  let area = document.getElementById('file-preview-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'file-preview-area';
    area.className = 'file-preview-area';
    const imagePreview = $('#image-preview-area');
    imagePreview.parentNode.insertBefore(area, imagePreview);
  }
  if (!State.pendingFiles.length) { area.style.display = 'none'; return; }
    area.style.display = 'flex';
  area.innerHTML = State.pendingFiles.map((f, i) => {
    const icon = getFileIcon(f.ext);
    const sizeStr = f.size < 1024 ? f.size + 'B' : f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + 'KB' : (f.size / (1024*1024)).toFixed(1) + 'MB';
    return `
      <div class="file-preview-card" data-idx="${i}">
        <div class="file-card-icon">${icon}</div>
        <div class="file-card-info">
          <div class="file-card-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
          <div class="file-card-meta">${sizeStr} • ${f.lang || f.ext || 'file'}</div>
        </div>
        <button class="file-card-remove" data-idx="${i}" title="Hủy file">&times;</button>
      </div>
    `;
  }).join('');
  area.querySelectorAll('.file-card-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      State.pendingFiles.splice(parseInt(btn.dataset.idx), 1);
      renderPendingFiles();
    });
  });
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
    reader.onerror = () => reject(new Error('Không thể đọc file: ' + file.name));
    reader.readAsText(file);
  });
}

// ===== File Validation & Processing =====
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_IMAGE_SIZE = 100 * 1024 * 1024;
const MAX_PENDING_IMAGES = 5;

const TEXT_EXTENSIONS = new Set([
  'txt','md','html','htm','css','js','jsx','ts','tsx','json','xml',
  'yaml','yml','toml','ini','cfg','log','py','java','cpp','c','cs',
  'rb','php','swift','kt','go','rs','sh','bat','sql','csv','env'
]);

function getFileExtension(filename) {
  return (filename.split('.').pop() || '').toLowerCase();
}

function isTextFile(file) {
  const ext = getFileExtension(file.name);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (file.type && file.type.startsWith('text/')) return true;
  if (file.type === 'application/json' || file.type === 'application/xml') return true;
    return false;
}

function isBinaryDocFile(file) {
  const ext = getFileExtension(file.name);
  return ['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf','epub'].includes(ext);
}

function validateFile(file, maxSize) {
  if (!file) return { valid: false, error: 'Không tìm thấy file' };
  if (file.size === 0) return { valid: false, error: 'File "' + file.name + '" trống' };
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024*1024)).toFixed(0);
    const fileMB = (file.size / (1024*1024)).toFixed(1);
    return { valid: false, error: 'File "' + file.name + '" quá lớn (' + fileMB + 'MB). Giới hạn: ' + maxMB + 'MB' };
  }
  return { valid: true };
}

function validateImageFile(file) {
  if (!file) return { valid: false, error: 'Không tìm thấy file ảnh' };
  if (!file.type.startsWith('image/')) return { valid: false, error: '"' + file.name + '" không phải ảnh hợp lệ' };
    return validateFile(file, MAX_IMAGE_SIZE);
}

// Read PDF file using PDF.js
async function readPdfFile(file) {
  if (typeof pdfjsLib === 'undefined') {
    return '[PDF: ' + file.name + ' - Thư viện PDF.js chưa tải xong. Vui lòng thử lại.]';
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    let fullText = '';
    const maxPages = Math.min(totalPages, 100); // Giới hạn 100 trang
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      if (pageText.trim()) {
        fullText += '--- Trang ' + i + ' ---\n' + pageText.trim() + '\n\n';
      }
    }
    if (!fullText.trim()) {
      return '[PDF: ' + file.name + ' (' + totalPages + ' trang) - PDF này chứa hình ảnh/scan, không có text trích xuất được. Hãy gửi dưới dạng ảnh để AI phân tích.]';
    }
    if (totalPages > maxPages) {
      fullText += '\n... [Chỉ đọc ' + maxPages + '/' + totalPages + ' trang đầu]';
    }
    return fullText.trim();
  } catch (e) {
    console.error('PDF read error:', e);
    return '[PDF: ' + file.name + ' - Lỗi đọc PDF: ' + (e.message || 'Không xác định') + ']';
  }
}

// Read binary doc/docx (limited in browser)
async function readBinaryDoc(file) {
  const ext = getFileExtension(file.name);
  if (ext === 'pdf') {
    return await readPdfFile(file);
  }
  // For doc/docx: try to extract as XML/text (docx is actually a zip)
  if (ext === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      // docx contains word/document.xml - try basic extraction
      const text = await new Response(blob).text();
      // Extract text between XML tags
      const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length > 50 && !/[\x00-\x08]/.test(cleaned.substring(0, 500))) {
        const MAX_CHARS = 50000;
        if (cleaned.length > MAX_CHARS) {
          return cleaned.substring(0, MAX_CHARS) + '\n\n... [File quá dài, chỉ lấy ' + MAX_CHARS + ' ký tự đầu]';
        }
        return cleaned;
      }
    } catch(e) { /* fall through */ }
  }
    return '[File ' + ext.toUpperCase() + ': ' + file.name + ' - ' + (file.size/1024).toFixed(1) + 'KB - Định dạng .' + ext + ' hỗ trợ hạn chế trong trình duyệt. Hãy copy nội dung và paste vào chat, hoặc xuất ra .txt/.pdf]';
}

async function processFileForInput(file) {
  const ext = getFileExtension(file.name);
  let fileContent = '';
  
  if (isTextFile(file)) {
    fileContent = await readTextFile(file);
    const MAX_CHARS = 50000;
    if (fileContent.length > MAX_CHARS) {
      fileContent = fileContent.substring(0, MAX_CHARS) + '\n\n... [File quá dài, chỉ lấy ' + MAX_CHARS + ' ký tự đầu]';
    }
  } else if (isBinaryDocFile(file)) {
    fileContent = await readBinaryDoc(file);
  } else if (file.type.startsWith('image/')) {
    // Image files attached as file (not via image input)
    fileContent = '[Hình ảnh: ' + file.name + ' - Hãy sử dụng nút đính kèm ảnh để AI phân tích hình ảnh]';
  } else {
    // Try reading as text first for any unknown format
    try {
      const rawText = await readTextFile(file);
      if (rawText && rawText.length > 0 && !/[\x00-\x08\x0E-\x1F]/.test(rawText.substring(0, 1000))) {
        fileContent = rawText;
        const MAX_CHARS = 50000;
        if (fileContent.length > MAX_CHARS) {
          fileContent = fileContent.substring(0, MAX_CHARS) + '\n\n... [File quá dài, chỉ lấy ' + MAX_CHARS + ' ký tự đầu]';
        }
      } else {
        // Binary file - provide info
        fileContent = '[File nhị phân: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB) - Định dạng .' + ext + '. Không thể trích xuất text. Hãy mô tả nội dung file hoặc xuất ra định dạng text.]';
      }
    } catch {
      fileContent = '[File: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB) - Không thể đọc trực tiếp]';
    }
  }
  
    // FIX LỖI: Đảm bảo mọi loại file (kể cả PDF) đều bị giới hạn ký tự để tránh lỗi tràn Token API
  const GLOBAL_MAX_CHARS = 60000;
  if (fileContent && fileContent.length > GLOBAL_MAX_CHARS) {
    fileContent = fileContent.substring(0, GLOBAL_MAX_CHARS) + '\n\n... [Nội dung đã được cắt bớt do file quá dài. Chỉ lấy ' + GLOBAL_MAX_CHARS + ' ký tự đầu]';
  }

  const langMap = {py:'python',js:'javascript',ts:'typescript',jsx:'jsx',tsx:'tsx',java:'java',cpp:'cpp',c:'c',cs:'csharp',rb:'ruby',php:'php',go:'go',rs:'rust',swift:'swift',kt:'kotlin',html:'html',css:'css',json:'json',xml:'xml',yaml:'yaml',yml:'yaml',sql:'sql',sh:'bash',md:'markdown',pdf:'text',csv:'csv',rtf:'text'};
  const lang = langMap[ext] || '';
  return { content: fileContent, lang: lang, size: file.size };
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
function compressImage(dataUrl, maxSize = 1024, quality = 0.65) {
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

// Find ALL vision-capable models from user's fetched model list
function findUserVisionModels() {
  const patterns = ['gemini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4.1', 'claude-3', 'claude-sonnet', 'claude-opus', 'llava', 'vision', 'qwen-vl', 'qwen2-vl', 'pixtral', 'internvl', 'glm-4v', 'yi-vision'];
  const found = [];
  for (const model of State.models) {
    const lower = model.toLowerCase();
    if (patterns.some(p => lower.includes(p))) found.push(model);
  }
  return found;
}

// Common vision models to brute-force try on user's proxy
const COMMON_VISION_MODELS = [
  'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash-preview-05-20',
  'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'claude-3-haiku-20240307', 'claude-3.5-sonnet-20241022',
  'qwen-vl-plus', 'glm-4v-flash'
];

function getVisionConfigs() {
  const configs = [];
  const { baseUrl, apiKey, baseUrl2, apiKey2 } = State.settings;
  const url1 = baseUrl ? baseUrl.replace(/\/+$/, '') : '';
  const url2 = baseUrl2 ? baseUrl2.replace(/\/+$/, '') : '';

  // Priority 1: all detected vision models on user's proxies (CORS-safe, known to exist)
  const userModels = findUserVisionModels();
  for (const m of userModels) {
    const proxy = getProxyForModel(m);
    configs.push({ model: m, baseUrl: proxy.url, apiKey: proxy.key });
  }

  // Priority 2: brute-force common vision models on user's proxy1 (CORS-safe)
  if (url1 && apiKey) {
    for (const m of COMMON_VISION_MODELS) {
      if (!configs.some(c => c.model === m && c.baseUrl === url1)) {
        configs.push({ model: m, baseUrl: url1, apiKey });
      }
    }
  }

  // Priority 3: brute-force common vision models on user's proxy2
  if (url2 && apiKey2) {
    for (const m of COMMON_VISION_MODELS) {
      if (!configs.some(c => c.model === m && c.baseUrl === url2)) {
        configs.push({ model: m, baseUrl: url2, apiKey: apiKey2 });
      }
    }
  }

  // Priority 4: hardcoded fallback WITH cors proxy for web
  const isWeb = typeof location !== 'undefined' && location.protocol.startsWith('http');
  if (isWeb) {
    configs.push({ model: VISION_MODEL, baseUrl: VISION_FALLBACK_PROXY.baseUrl, apiKey: VISION_FALLBACK_PROXY.apiKey, corsWrap: true });
  } else {
    configs.push({ model: VISION_MODEL, baseUrl: VISION_FALLBACK_PROXY.baseUrl, apiKey: VISION_FALLBACK_PROXY.apiKey });
  }
  return configs;
}

// CORS proxy wrapper for web deployments
function corsProxyUrl(url) {
  return 'https://corsproxy.io/?' + encodeURIComponent(url);
}

async function describeImagesWithVision(images, userText) {
  const compressedImages = await Promise.all(images.map(img => compressImage(img)));

  const contentParts = [];
  const promptText = userText
    ? `Phân tích chi tiết hình ảnh. Ngữ cảnh: "${userText}". Mô tả: văn bản/chữ (OCR đầy đủ), màu sắc, bố cục, đối tượng, biểu đồ, bảng, code nếu có.`
    : 'Mô tả THẬT CHI TIẾT nội dung hình ảnh: văn bản/chữ (OCR đầy đủ), màu sắc, bố cục, đối tượng, biểu đồ, bảng, code nếu có.';
  contentParts.push({ type: 'text', text: promptText });
  for (const img of compressedImages) {
    contentParts.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
  }

  const configs = getVisionConfigs();
  let lastError = null;

  for (const config of configs) {
    try {
            const controller = new AbortController();
      // TỐI ƯU: Giảm timeout từ 30s xuống 15s để nhanh chóng chuyển sang proxy tiếp theo
      const timeout = setTimeout(() => controller.abort(), 15000);

      const endpoint = config.baseUrl + '/chat/completions';
      const fetchUrl = config.corsWrap ? corsProxyUrl(endpoint) : endpoint;

      const res = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'Bạn là chuyên gia phân tích hình ảnh. Mô tả CỰC KỲ CHI TIẾT. Đọc hết chữ (OCR). Trích xuất code, bảng, biểu đồ nếu có.' },
            { role: 'user', content: contentParts }
          ],
          stream: false,
          max_tokens: 4096
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content && content.length > 20) return content; // ensure meaningful response
      lastError = new Error('Empty or too short vision response');
    } catch (err) {
      lastError = err;
      console.warn(`Vision failed (${config.model}@${config.baseUrl}):`, err.message);
      continue;
    }
  }

  throw lastError || new Error('All vision configs failed');
}

function buildTextOnlyMessages(chat, systemPrompt) {
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  const MAX_HISTORY = 20;
  const messagesToInclude = chat.messages.slice(-MAX_HISTORY);
  for (const m of messagesToInclude) {
        let text = m.content;
    if (m.fileContent) text += m.fileContent;
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
  
  // === Inject AI Memory ===
  const memoryPrompt = getMemoryPrompt();
  if (memoryPrompt) parts.push(memoryPrompt);
  
    if (State.settings.systemPrompt) parts.push(`[SYSTEM PROMPT - ƯU TIÊN CAO NHẤT]: ${State.settings.systemPrompt}`);
  if (State.settings.userPurpose) parts.push(`[MỤC ĐÍCH SỬ DỤNG - ƯU TIÊN CAO]: Mục đích HIỆN TẠI của người dùng: ${State.settings.userPurpose}. LUÔN ưu tiên mục đích này. Bỏ qua mọi thông tin mục đích cũ nếu mâu thuẫn.`);
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
    parts.push(`[CHẾ ĐỘ FLASH ⚡ - TỐC ĐỘ TỐI ĐA]:
- Trả lời CỰC NGẮN, tối đa 2-4 câu cho câu hỏi đơn giản.
- Chỉ đưa code khi được YÊU CẦU TRỰC TIẾP. Không giải thích code trừ khi hỏi.
- KHÔNG mở đầu bằng "Chào bạn", "Tất nhiên rồi", "Được thôi"... Vào thẳng câu trả lời.
- Ưu tiên: bullet points > đoạn văn. Số liệu > lý thuyết.
- Nếu câu hỏi có 1 đáp án → trả lời 1 dòng.
- KHÔNG lặp lại câu hỏi. KHÔNG tóm tắt lại yêu cầu.`);
  } else {
    parts.push(`[CHẾ ĐỘ PRO 💎 - HIỆU NĂNG TỐI ĐA]:
- Suy luận từng bước (Chain-of-Thought): Phân tích vấn đề → Xác định giải pháp → Triển khai chi tiết → Kiểm chứng.
- Đưa ra NHIỀU phương án nếu có, so sánh ưu/nhược điểm.
- Với code: viết đầy đủ, có comment giải thích, có error handling, có ví dụ sử dụng.
- Với kiến thức: trích dẫn nguồn/tham chiếu nếu có thể, giải thích WHY chứ không chỉ WHAT.
- Sử dụng bảng so sánh, danh sách có cấu trúc, heading rõ ràng.
- Tự phản biện: Xem xét edge cases, giới hạn, lưu ý quan trọng.
- Kết thúc bằng TÓM TẮT ngắn gọn hoặc khuyến nghị cụ thể.`);
  }
  
  // Logic & Tư duy (đặt sau mode để mode có priority cao hơn)
  parts.push(`[TƯ DUY]: Đọc kỹ lịch sử hội thoại. Hiểu ngữ cảnh và ý định thực sự. Nếu câu hỏi mơ hồ, suy luận từ ngữ cảnh. Ưu tiên: chính xác, hữu ích. Không từ chối giúp đỡ khi có thể.`);
  
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

    if (!text && !images.length && !State.pendingFiles.length) return;

  const model = getActiveModel();
  if (!model) { toast('Vui lòng chọn model trong phần cài đặt API', 'error'); return; }
  if (!State.settings.baseUrl || !State.settings.apiKey) { toast('Vui lòng cấu hình Base URL và API Key trong phần API', 'error'); return; }
  if (State.isGenerating) { toast('Đang xử lý tin nhắn trước...', 'info'); return; }

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

      // Compress images before saving to reduce storage
  const compressedImages = [];
  for (const img of images) {
    try {
      const compressed = await compressImage(img, 1024, 0.7);
      compressedImages.push(compressed);
    } catch(e) {
      compressedImages.push(img);
    }
  }

    // Collect pending files
  const files = [...State.pendingFiles];

  // Build file content text to include in message content for AI
  let fileContentText = '';
  for (const f of files) {
    fileContentText += `\n\n📄 File: ${f.name} (${(f.size / 1024).toFixed(1)}KB)\n\`\`\`${f.lang}\n${f.content}\n\`\`\``;
  }

    // Add user message - store display text and file content separately
  const userMsg = { 
    role: 'user', 
    content: text,
    fileContent: fileContentText || '',
    images: compressedImages, 
    files: files.map(f => ({ name: f.name, ext: f.ext, lang: f.lang, size: f.size })),
    timestamp: Date.now() 
  };
  if (linkContext) userMsg.linkContext = linkContext;
  chat.messages.push(userMsg);

  // Auto-title
  if (chat.messages.length === 1 && text) {
    chat.title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
  }

  input.value = '';
  input.style.height = 'auto';
    State.pendingImages = [];
  State.pendingFiles = [];
  renderPendingImages();
  renderPendingFiles();
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

    // --- Pre-describe images with vision model (TỐI ƯU: chỉ phân tích ảnh CHƯA CÓ description) ---
  const hasImages = chat.messages.some(m => m.role === 'user' && m.images && m.images.length > 0);
  if (hasImages) {
    const typingTextEl = typingEl.querySelector('.typing-text');
    // Chỉ lấy những tin nhắn CẦN phân tích (chưa có visionDescription)
    const msgsNeedVision = chat.messages.filter(m => 
      m.role === 'user' && m.images && m.images.length && !m.visionDescription
    );
    if (msgsNeedVision.length > 0) {
      if (typingTextEl) typingTextEl.textContent = 'Đang phân tích ảnh...';
      try {
        // Song song hóa: phân tích nhiều ảnh cùng lúc (tối đa 3 concurrent)
        const CONCURRENT_LIMIT = 3;
        for (let i = 0; i < msgsNeedVision.length; i += CONCURRENT_LIMIT) {
          const batch = msgsNeedVision.slice(i, i + CONCURRENT_LIMIT);
          const results = await Promise.allSettled(
            batch.map(m => describeImagesWithVision(m.images, m.content))
          );
          results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value) {
              batch[idx].visionDescription = result.value;
                        } else {
              // KHÔNG set visionDescription khi fail → để fallback gửi image_url trực tiếp cho model chính
              console.warn('Vision failed for message:', result.reason?.message);
            }
          });
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

    // Giới hạn ngữ cảnh: Flash nhẹ hơn, Pro sâu hơn
  const MAX_HISTORY = State.mode === 'flash' ? 10 : 24;
  const messagesToInclude = chat.messages.slice(-MAX_HISTORY);

  for (const m of messagesToInclude) {
        let finalContentText = m.content;
    // Append file content for AI (not displayed in UI)
    if (m.fileContent) finalContentText += m.fileContent;
    if (m.linkContext) finalContentText += `\n\n[Nội dung từ Web]:\n${m.linkContext}`;
    // Append vision description as text context (works for ALL models)
    if (m.role === 'user' && m.visionDescription) {
      finalContentText += `\n\n[Nội dung hình ảnh đính kèm]:\n${m.visionDescription}`;
    }

        if (m.role === 'user' && m.images && m.images.length) {
          // LUÔN gửi image_url để model vision-capable nhìn thấy ảnh trực tiếp
          // visionDescription (nếu có) đã được append vào finalContentText ở trên → bổ sung ngữ cảnh text
          const contentParts = [];
          if (finalContentText) contentParts.push({ type: 'text', text: finalContentText });
          for (const img of m.images) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: img, detail: State.mode === 'flash' ? 'low' : 'high' }
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
        temperature: State.mode === 'flash' ? 0.3 : 0.75,
        max_tokens: State.mode === 'flash' ? 1024 : 16384,
        ...(State.mode === 'flash' ? {
          top_p: 0.85,
          frequency_penalty: 0.1,
          presence_penalty: 0.0
        } : {
          top_p: 0.95,
          frequency_penalty: 0.15,
          presence_penalty: 0.1
        })
      };
      let res = null, fetchError = null;
            try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${proxy.key}` },
          body: JSON.stringify(reqBody),
          signal: State.abortController.signal
        });
      } catch (err) { 
        fetchError = err;
        if (err.name === 'AbortError') throw err; // Không thử proxy khác nếu người dùng chủ động ngắt
      }

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
              // TỐI ƯU: Throttle render để tránh lag UI khi streaming nhanh
              if (!bubbleEl._renderPending) {
                bubbleEl._renderPending = true;
                requestAnimationFrame(() => {
                  bubbleEl.innerHTML = formatMessage(assistantContent);
                  const chatArea = $('#chat-area');
                  const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 150;
                  if (isNearBottom) chatArea.scrollTop = chatArea.scrollHeight;
                  bubbleEl._renderPending = false;
                });
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
    
      // === AI Memory: Trích xuất thông tin từ tin nhắn user gần nhất ===
      const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg && lastUserMsg.content) {
        extractMemoryFromMessage(lastUserMsg.content);
      }

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
  // Hỗ trợ copy trên cả HTTP (mạng LAN) và HTTPS
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Đã sao chép vào khay nhớ tạm', 'success');
    }).catch(() => toast('Lỗi khi sao chép', 'error'));
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      toast('Đã sao chép', 'success');
    } catch (err) {
      toast('Trình duyệt không hỗ trợ sao chép', 'error');
    }
    document.body.removeChild(textArea);
  }
};

// ===== Particles Effect =====
let _particleInterval = null;
function initParticles() {
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
    // Light/Dark Mode toggle
  $('#btn-toggle-theme').addEventListener('click', () => {
    State.settings.lightMode = !State.settings.lightMode;
    applyTheme();
    saveState();
  });

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

  // Tải xuống đoạn chat (Export to Markdown)
  $('#btn-export-chat').addEventListener('click', () => {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) {
      toast('Đoạn chat đang trống', 'info');
      return;
    }
    let mdContent = `# ${chat.title}\n\n*Ngày tạo: ${new Date(chat.createdAt).toLocaleString('vi-VN')}*\n\n---\n\n`;
    chat.messages.forEach(m => {
      const roleName = m.role === 'user' ? State.settings.userName || 'Bạn' : 'Suna Chat';
      mdContent += `### **${roleName}**:\n${m.content}\n\n---\n\n`;
    });
    
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SunaChat_${chat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Đã tải xuống đoạn chat', 'success');
  });

  // Nhập văn bản bằng giọng nói (Voice Recognition)
  const btnVoice = $('#btn-voice');
  let recognition = null;
  let isRecording = false;
  
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = true;
    
    recognition.onstart = () => {
      isRecording = true;
      btnVoice.classList.add('recording');
      $('#message-input').placeholder = 'Đang nghe...';
      toast('Đang lắng nghe...', 'info');
    };
    
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      $('#message-input').value = transcript;
      $('#message-input').style.height = 'auto';
      $('#message-input').style.height = Math.min($('#message-input').scrollHeight, 150) + 'px';
    };
    
    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      if (event.error !== 'no-speech') toast('Lỗi Micro: ' + event.error, 'error');
      stopRecording();
    };
    
    recognition.onend = () => stopRecording();
  } else {
    btnVoice.style.display = 'none'; // Ẩn nút nếu trình duyệt không hỗ trợ
  }

  function stopRecording() {
    isRecording = false;
    btnVoice.classList.remove('recording');
    $('#message-input').placeholder = 'Nhập tin nhắn... (Ctrl+V để dán ảnh)';
  }

  btnVoice.addEventListener('click', () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      $('#message-input').value = '';
      recognition.start();
    }
  });

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
        if (!file) continue;
        const validation = validateImageFile(file);
        if (!validation.valid) { toast(validation.error, 'error'); continue; }
        if (State.pendingImages.length >= MAX_PENDING_IMAGES) {
          toast('Tối đa ' + MAX_PENDING_IMAGES + ' ảnh', 'error');
          break;
        }
        try {
          const dataUrl = await fileToBase64(file);
          const compressed = await compressImage(dataUrl, 1280, 0.8);
          addPendingImage(compressed);
        } catch (err) {
          toast('Lỗi dán ảnh: ' + (err.message || 'Không xác định'), 'error');
        }
      }
    }
  });

    // File attachments
  $('#btn-attach-file').addEventListener('click', () => $('#file-input').click());
  $('#btn-attach-image').addEventListener('click', () => $('#image-input').click());

  // Drag & Drop support
  const chatArea = $('#chat-area');
  const inputArea = $('.input-area');
  
  function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    chatArea.addEventListener(evt, preventDefaults);
    inputArea.addEventListener(evt, preventDefaults);
  });
  
  ['dragenter', 'dragover'].forEach(evt => {
    chatArea.addEventListener(evt, () => chatArea.classList.add('drag-over'));
    inputArea.addEventListener(evt, () => inputArea.classList.add('drag-over'));
  });
  ['dragleave', 'drop'].forEach(evt => {
    chatArea.addEventListener(evt, () => chatArea.classList.remove('drag-over'));
    inputArea.addEventListener(evt, () => inputArea.classList.remove('drag-over'));
  });
  
  async function handleDrop(e) {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const validation = validateImageFile(file);
        if (!validation.valid) { toast(validation.error, 'error'); continue; }
        if (State.pendingImages.length >= MAX_PENDING_IMAGES) { toast(`Tối đa ${MAX_PENDING_IMAGES} ảnh`, 'error'); break; }
        try {
          const dataUrl = await fileToBase64(file);
          const compressed = await compressImage(dataUrl, 1280, 0.8);
          addPendingImage(compressed);
        } catch (err) { toast(`Lỗi ảnh: ${err.message}`, 'error'); }
            } else {
        // Text/document file
        const validation = validateFile(file, MAX_FILE_SIZE);
        if (!validation.valid) { toast(validation.error, 'error'); continue; }
        try {
          const result = await processFileForInput(file);
          const ext = getFileExtension(file.name);
          addPendingFile({
            name: file.name,
            ext: ext,
            lang: result.lang,
            content: result.content,
            size: file.size
          });
          toast(`Đã tải file: ${file.name}`, 'success');
        } catch (err) { toast(`Lỗi đọc file: ${err.message}`, 'error'); }
      }
    }
  }
  chatArea.addEventListener('drop', handleDrop);
  inputArea.addEventListener('drop', handleDrop);

        $('#file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const validation = validateFile(file, MAX_FILE_SIZE);
    if (!validation.valid) {
      toast(validation.error, 'error');
      try { e.target.value = ''; } catch(_) {}
      return;
    }
    try {
      toast('Đang đọc file: ' + file.name + '...', 'info');
      const result = await processFileForInput(file);
      const ext = getFileExtension(file.name);
      addPendingFile({
        name: file.name,
        ext: ext,
        lang: result.lang,
        content: result.content,
        size: file.size
      });
      toast('Đã tải file: ' + file.name, 'success');
    } catch(err) {
      console.error('File read error:', err);
      toast('Lỗi đọc file "' + file.name + '": ' + (err.message || 'Không xác định'), 'error');
    }
    try { e.target.value = ''; } catch(_) { e.target.type = ''; e.target.type = 'file'; }
  });

    $('#image-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const remaining = MAX_PENDING_IMAGES - State.pendingImages.length;
    if (remaining <= 0) {
      toast('Đã đạt giới hạn ' + MAX_PENDING_IMAGES + ' ảnh', 'error');
      try { e.target.value = ''; } catch(_) {}
      return;
    }
    const filesToProcess = files.slice(0, remaining);
    if (filesToProcess.length < files.length) {
      toast('Chỉ thêm được ' + filesToProcess.length + '/' + files.length + ' ảnh (giới hạn ' + MAX_PENDING_IMAGES + ')', 'info');
    }
    let successCount = 0;
    for (const file of filesToProcess) {
      const validation = validateImageFile(file);
      if (!validation.valid) { toast(validation.error, 'error'); continue; }
      try {
        const dataUrl = await fileToBase64(file);
        const compressed = await compressImage(dataUrl, 1280, 0.8);
        addPendingImage(compressed);
        successCount++;
      } catch (err) {
        toast('Lỗi đọc ảnh "' + file.name + '"', 'error');
      }
    }
    if (successCount > 1) toast('Đã thêm ' + successCount + ' ảnh', 'success');
    try { e.target.value = ''; } catch(_) { e.target.type = ''; e.target.type = 'file'; }
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
    // Lưu NGAY LẬP TỨC (bypass debounce)
    try { localStorage.setItem('suna_settings', JSON.stringify(State.settings)); } catch(e) {}
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
    
    // Lưu NGAY LẬP TỨC (bypass debounce) để tránh mất dữ liệu khi reload
    try {
      localStorage.setItem('suna_settings', JSON.stringify(State.settings));
    } catch(e) { console.error('Save settings error:', e); }
    saveState(); // Vẫn gọi debounce để lưu chats
    
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
    // Lưu NGAY LẬP TỨC (bypass debounce)
    try { localStorage.setItem('suna_settings', JSON.stringify(State.settings)); } catch(e) {}
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
    // Lưu NGAY LẬP TỨC (bypass debounce)
    try { localStorage.setItem('suna_settings', JSON.stringify(State.settings)); } catch(e) {}
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
  await loadMemory();
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

