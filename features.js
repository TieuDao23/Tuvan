// features.js - Contains implementation for premium Suna Chat features

// =============================================
// 1. BEST FEMALE VOICE & TTS
// =============================================
let selectedVoice = null;

function initTTS() {
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    
    // Priorities for a sweet, energetic Vietnamese female voice
    const viVoices = voices.filter(v => v.lang.includes('vi'));
    // MS HoaiMy is known for natural, sweet female voice on Windows
    let best = viVoices.find(v => v.name.includes('HoaiMy') || v.name.includes('Lien'));
    if (!best) best = viVoices.find(v => v.name.includes('Google'));
    if (!best && viVoices.length > 0) best = viVoices[0];
    
    selectedVoice = best || voices[0];
  };

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }
}

window.speakText = function(text, lang = 'vi-VN') {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  
  const msg = new SpeechSynthesisUtterance(text);
  if (lang.includes('vi') && selectedVoice) {
    msg.voice = selectedVoice;
  } else {
    const voices = window.speechSynthesis.getVoices();
    const langVoices = voices.filter(v => v.lang.includes(lang));
    const femaleLangVoice = langVoices.find(v => v.name.toLowerCase().includes('female') || v.name.includes('Zira') || v.name.includes('Google'));
    msg.voice = femaleLangVoice || langVoices[0] || voices[0];
  }
  
  // Năng động, diễn cảm: rate hơi nhanh một chút, pitch cao một chút để giống thiếu nữ
  msg.rate = 1.05;
  msg.pitch = 1.2; 
  msg.lang = lang;
  
  window.speechSynthesis.speak(msg);
};

// =============================================
// 2. TRANSLATOR MODE (Voice + Text, Bidirectional)
// =============================================
let translatorRecog = null;

function initTranslatorMode() {
  const modal = document.getElementById('translator-modal');
  const btnOpen = document.getElementById('btn-translator-mode');
  const btnMicVi = document.getElementById('btn-mic-vi');
  const btnMicTarget = document.getElementById('btn-mic-target');
  const targetLangSelect = document.getElementById('translator-target-lang');
  const txtSource = document.getElementById('translator-source-text');
  const txtTarget = document.getElementById('translator-target-text');
  const inputSource = document.getElementById('translator-source-input');
  const inputTarget = document.getElementById('translator-target-input');
  const btnTranslate = document.getElementById('btn-translator-translate');
  const btnCopy = document.getElementById('btn-translator-copy');
  const btnToChat = document.getElementById('btn-translator-to-chat');
  const btnSwap = document.getElementById('btn-translator-swap');

  if (!btnOpen) return;
  btnOpen.addEventListener('click', () => { if (modal) modal.style.display = 'flex'; });

  let currentSource = 'vi';
  let isTranslating = false;

  // --- Core translate function ---
  async function doTranslate(text, fromSide) {
    if (!text || isTranslating) return;
    isTranslating = true;
    const targetEl = fromSide === 'vi' ? txtTarget : txtSource;
    targetEl.innerText = 'Đang dịch...';
    targetEl.classList.remove('active');
    try {
      const fromLang = fromSide === 'vi' ? 'Tiếng Việt' : targetLangSelect.options[targetLangSelect.selectedIndex].text.replace(/^[\u{1F1E6}-\u{1F1FF}]+\s*/u, '');
      const toLang = fromSide === 'vi' ? targetLangSelect.options[targetLangSelect.selectedIndex].text.replace(/^[\u{1F1E6}-\u{1F1FF}]+\s*/u, '') : 'Tiếng Việt';
      const prompt = `Dịch câu sau từ ${fromLang} sang ${toLang}. CHỈ trả về bản dịch, KHÔNG giải thích, KHÔNG thêm dấu ngoặc kép.\nCâu: ${text}`;
      if (window.directApiCall) {
        let result = await window.directApiCall(prompt);
        result = result.trim().replace(/^["'"'\u201C\u201D]+|["'"'\u201C\u201D]+$/g, '');
        targetEl.innerText = result;
        targetEl.classList.add('active');
        const speakLang = fromSide === 'vi' ? targetLangSelect.value : 'vi-VN';
        window.speakText(result, speakLang);
      } else {
        targetEl.innerText = 'Lỗi: Chưa cấu hình API.';
      }
    } catch (e) {
      targetEl.innerText = 'Lỗi: ' + e.message;
    }
    isTranslating = false;
  }

  // --- Text input translate button ---
  if (btnTranslate) {
    btnTranslate.addEventListener('click', () => {
      const viText = inputSource?.value.trim();
      const targetText = inputTarget?.value.trim();
      if (viText) {
        txtSource.innerText = viText;
        txtSource.classList.add('active');
        doTranslate(viText, 'vi');
      } else if (targetText) {
        txtTarget.innerText = targetText;
        txtTarget.classList.add('active');
        doTranslate(targetText, 'target');
      } else if (window.toast) {
        window.toast('Nhập văn bản hoặc nói vào mic trước khi dịch', 'info');
      }
    });
  }

  // --- Copy & Send to chat ---
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = txtTarget.innerText;
      if (!text || text.includes('hiển thị ở đây')) return;
      navigator.clipboard.writeText(text).then(() => {
        if (window.toast) window.toast('Đã copy bản dịch!', 'success');
      });
    });
  }
  if (btnToChat) {
    btnToChat.addEventListener('click', () => {
      const text = txtTarget.innerText;
      if (!text || text.includes('hiển thị ở đây')) return;
      const chatInput = document.getElementById('message-input');
      if (chatInput) {
        chatInput.value += (chatInput.value ? '\n' : '') + text;
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
      }
      if (modal) modal.style.display = 'none';
      if (window.toast) window.toast('Đã điền bản dịch vào ô chat', 'success');
    });
  }

  // --- Swap languages ---
  if (btnSwap) {
    btnSwap.addEventListener('click', () => {
      const srcText = txtSource.innerText;
      const tgtText = txtTarget.innerText;
      txtSource.innerText = tgtText;
      txtTarget.innerText = srcText;
      if (inputSource) { const tmp = inputSource.value; inputSource.value = inputTarget?.value || ''; if (inputTarget) inputTarget.value = tmp; }
    });
  }

  // --- Speech Recognition ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (btnMicVi) btnMicVi.style.display = 'none';
    if (btnMicTarget) btnMicTarget.style.display = 'none';
    return;
  }

  translatorRecog = new SpeechRecognition();
  translatorRecog.interimResults = true;

  const startRecog = (langCode) => {
    if (isTranslating) return;
    const langMap = { 'en': 'en-US', 'ja': 'ja-JP', 'zh': 'zh-CN', 'ko': 'ko-KR', 'es': 'es-ES', 'fr': 'fr-FR' };
    translatorRecog.lang = langCode === 'vi' ? 'vi-VN' : (langMap[targetLangSelect.value] || targetLangSelect.value);
    currentSource = langCode;
    if (langCode === 'vi') { txtSource.innerText = 'Đang nghe...'; btnMicVi.classList.add('recording'); }
    else { txtTarget.innerText = 'Đang nghe...'; btnMicTarget.classList.add('recording'); }
    try { translatorRecog.start(); } catch(e){}
  };
  const stopRecog = () => {
    btnMicVi?.classList.remove('recording');
    btnMicTarget?.classList.remove('recording');
    try { translatorRecog.stop(); } catch(e){}
  };

  btnMicVi?.addEventListener('click', () => { btnMicVi.classList.contains('recording') ? stopRecog() : startRecog('vi'); });
  btnMicTarget?.addEventListener('click', () => { btnMicTarget.classList.contains('recording') ? stopRecog() : startRecog('target'); });

  translatorRecog.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    if (currentSource === 'vi') { txtSource.innerText = transcript; txtSource.classList.add('active'); }
    else { txtTarget.innerText = transcript; txtTarget.classList.add('active'); }
  };

  translatorRecog.onend = () => {
    stopRecog();
    const text = currentSource === 'vi' ? txtSource.innerText : txtTarget.innerText;
    if (text && text !== 'Đang nghe...') doTranslate(text, currentSource);
  };
}

// =============================================
// 3. MEMORY CABINET
// =============================================
function initMemoryCabinet() {
  const btn = document.getElementById('btn-memory');
  const modal = document.getElementById('memory-modal');
  const list = document.getElementById('memory-list');
  const input = document.getElementById('new-memory-input');
  const addBtn = document.getElementById('btn-add-memory');

  if (!btn || !modal) return;
  
  btn.addEventListener('click', () => {
    renderMemoryList();
    modal.style.display = 'flex';
  });

  const renderMemoryList = () => {
    if (!list) return;
    list.innerHTML = '';
    const mems = window.State?.memory?.facts || [];
    if (mems.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding: 20px;">Suna chưa ghi nhớ thông tin nào.</p>';
      return;
    }

    mems.forEach((m, idx) => {
      const el = document.createElement('div');
      el.className = 'memory-chip';
      let catHtml = '';
      if (m.toLowerCase().includes('tên') || m.toLowerCase().includes('tuổi')) catHtml = '<span class="mem-cat">👤 Cá nhân</span>';
      else if (m.toLowerCase().includes('thích') || m.toLowerCase().includes('ghét')) catHtml = '<span class="mem-cat">⭐ Sở thích</span>';
      else if (m.toLowerCase().includes('việc') || m.toLowerCase().includes('làm')) catHtml = '<span class="mem-cat">💼 Công việc</span>';
      else catHtml = '<span class="mem-cat">📌 Chung</span>';

      el.innerHTML = `
        <div class="mem-content">${m}</div>
        ${catHtml}
        <button class="btn-delete-mem" data-idx="${idx}"><span class="material-icons-round">delete</span></button>
      `;
      list.appendChild(el);
    });

    list.querySelectorAll('.btn-delete-mem').forEach(b => {
      b.addEventListener('click', (e) => {
        const idx = e.currentTarget.dataset.idx;
        window.State.memory.facts.splice(idx, 1);
        if (window.saveMemory) window.saveMemory();
        renderMemoryList();
      });
    });
  };

  addBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;
    if (!window.State.memory) window.State.memory = { facts: [] };
    if (!window.State.memory.facts) window.State.memory.facts = [];
    window.State.memory.facts.push(val);
    if (window.saveMemory) window.saveMemory();
    input.value = '';
    renderMemoryList();
  });
}

// =============================================
// 4. LIVE ARTIFACTS WORKSPACE & WEB SEARCH
// =============================================
function initArtifactsAndSearch() {
  const btnSearch = document.getElementById('btn-web-search');
  
  window.updateWebSearchUI = function() {
    if (!btnSearch) return;
    const icon = btnSearch.querySelector('#web-search-icon');
    const text = btnSearch.querySelector('#web-search-text');
    if (window.State && window.State.webSearchEnabled) {
      btnSearch.classList.add('active');
      if (icon) icon.textContent = 'check_circle';
      if (text) text.textContent = 'Web Search: ON';
    } else {
      btnSearch.classList.remove('active');
      if (icon) icon.textContent = 'public';
      if (text) text.textContent = 'Web Search';
    }
  };

  if (btnSearch) {
    btnSearch.addEventListener('click', () => {
      if (!window.State) return;
      window.State.webSearchEnabled = !window.State.webSearchEnabled;
      window.updateWebSearchUI();
      if (window.State.webSearchEnabled) {
        if(window.toast) window.toast('Đã BẬT tính năng Web Search (Suna sẽ trích xuất thông tin mới nhất)', 'info');
      } else {
        if(window.toast) window.toast('Đã TẮT tính năng Web Search', 'info');
      }
    });
  }

  const artifactsPanel = document.getElementById('artifacts-panel');
  const btnCloseArt = document.getElementById('btn-close-artifact');
  const btnRefreshArt = document.getElementById('btn-refresh-artifact');
  const iframe = document.getElementById('artifact-iframe');
  
  if (btnCloseArt) {
    btnCloseArt.addEventListener('click', () => artifactsPanel.classList.remove('active'));
  }
  
  window.openArtifact = function(b64) {
    if (!artifactsPanel || !iframe) return;
    try {
      // Decode base64 unicode safely
      const binString = atob(b64);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      const htmlContent = new TextDecoder('utf-8').decode(bytes);
      
      iframe.srcdoc = htmlContent;
      artifactsPanel.classList.add('active');
    } catch(e) {
      console.error("Artifact decode error:", e);
    }
  };

  if (btnRefreshArt && iframe) {
    btnRefreshArt.addEventListener('click', () => {
      const src = iframe.srcdoc;
      iframe.srcdoc = '';
      setTimeout(() => iframe.srcdoc = src, 50);
    });
  }
}

// Global Web Search Function
window.performWebSearch = async function(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    
    const data = await response.json();
    const doc = new DOMParser().parseFromString(data.contents, 'text/html');
    
    const results = [];
    doc.querySelectorAll('.result').forEach(el => {
      const titleEl = el.querySelector('.result__title');
      const snippetEl = el.querySelector('.result__snippet');
      const urlEl = el.querySelector('.result__url');
      if (titleEl && snippetEl) {
        results.push(`Tiêu đề: ${titleEl.textContent.trim()}\nURL: ${urlEl ? urlEl.textContent.trim() : ''}\nTrích dẫn: ${snippetEl.textContent.trim()}`);
      }
    });
    
    if (results.length === 0) return null;
    return results.slice(0, 4).join('\n\n'); // Lấy top 4 kết quả
  } catch (err) {
    console.error('Web search error:', err);
    return null;
  }
};

// =============================================
// 5. DOCUMENT ANALYZER
// =============================================
window.analyzeDocument = function(fileName) {
  const inputEl = document.getElementById('message-input');
  if (inputEl) {
    inputEl.value = `Xin hãy phân tích và tóm tắt chi tiết tài liệu "${fileName}". Hãy trích xuất các ý chính, lập bảng thống kê nếu có, và giải thích các thuật ngữ quan trọng.`;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    inputEl.focus();
    if (window.State && !window.State.isGenerating) {
      setTimeout(() => {
        const btnSend = document.getElementById('btn-send');
        if (btnSend) btnSend.click();
      }, 300);
    }
  }
};

// =============================================
// 6. EXPORT CHAT
// =============================================
function initExportChat() {
  const modal = document.getElementById('export-modal');
  if (!modal) return;

  // Open export modal from top-bar button
  const btnExport = document.getElementById('btn-export-chat');
  if (btnExport) btnExport.addEventListener('click', () => { modal.style.display = 'flex'; });

  function getChat() {
    if (!window.State) return null;
    return window.State.chats.find(c => c.id === window.State.activeChatId);
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    modal.style.display = 'none';
    if (window.toast) window.toast('Đã xuất: ' + filename, 'success');
  }

  function sanitizeTitle(t) { return (t || 'chat').replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF _-]/g, '').slice(0, 50); }

  // Markdown
  document.getElementById('btn-export-md')?.addEventListener('click', () => {
    const chat = getChat(); if (!chat) return;
    let md = `# ${chat.title}\n_Xuất lúc: ${new Date().toLocaleString('vi-VN')}_\n\n---\n\n`;
    chat.messages.forEach(m => {
      const role = m.role === 'user' ? '**🧑 Bạn**' : '**🤖 Suna**';
      md += `${role}:\n\n${m.content || ''}\n\n---\n\n`;
    });
    download(md, sanitizeTitle(chat.title) + '.md', 'text/markdown');
  });

  // Plain Text
  document.getElementById('btn-export-txt')?.addEventListener('click', () => {
    const chat = getChat(); if (!chat) return;
    let txt = `${chat.title}\nXuất lúc: ${new Date().toLocaleString('vi-VN')}\n${'='.repeat(40)}\n\n`;
    chat.messages.forEach(m => {
      txt += `[${m.role === 'user' ? 'Bạn' : 'Suna'}]:\n${m.content || ''}\n\n`;
    });
    download(txt, sanitizeTitle(chat.title) + '.txt', 'text/plain');
  });

  // HTML
  document.getElementById('btn-export-html')?.addEventListener('click', () => {
    const chat = getChat(); if (!chat) return;
    let body = '';
    chat.messages.forEach(m => {
      const cls = m.role === 'user' ? 'user' : 'ai';
      const label = m.role === 'user' ? 'Bạn' : 'Suna';
      const content = (m.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
      body += `<div class="msg ${cls}"><b>${label}:</b><p>${content}</p></div>`;
    });
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${chat.title}</title>
<style>body{font-family:'Inter',sans-serif;max-width:720px;margin:40px auto;padding:20px;background:#0d0b14;color:#ede8e3}
h1{color:#e8a87c}.msg{margin:16px 0;padding:16px;border-radius:12px;line-height:1.7}
.user{background:rgba(232,168,124,0.15);border-left:3px solid #e8a87c}
.ai{background:rgba(255,255,255,0.05);border-left:3px solid #555}
b{display:block;margin-bottom:6px;font-size:0.85em;opacity:0.7}p{margin:0;white-space:pre-wrap}</style></head>
<body><h1>${chat.title}</h1><small>Xuất lúc: ${new Date().toLocaleString('vi-VN')}</small><hr>${body}</body></html>`;
    download(html, sanitizeTitle(chat.title) + '.html', 'text/html');
  });

  // JSON
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    const chat = getChat(); if (!chat) return;
    const data = { title: chat.title, exportedAt: new Date().toISOString(), messages: chat.messages.map(m => ({ role: m.role, content: m.content })) };
    download(JSON.stringify(data, null, 2), sanitizeTitle(chat.title) + '.json', 'application/json');
  });
}

// Khởi chạy tất cả khi tải xong
document.addEventListener('DOMContentLoaded', () => {
  initTTS();
  initTranslatorMode();
  initMemoryCabinet();
  initArtifactsAndSearch();
  initExportChat();
});
