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
// 2. TRANSLATOR MODE (Speech-to-Speech)
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

  if (!btnOpen) return;

  btnOpen.addEventListener('click', () => {
    if (modal) modal.style.display = 'flex';
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btnMicVi.style.display = 'none';
    btnMicTarget.style.display = 'none';
    txtSource.innerText = "Trình duyệt không hỗ trợ nhận diện giọng nói.";
    return;
  }

  translatorRecog = new SpeechRecognition();
  translatorRecog.interimResults = true;

  let currentSource = 'vi';
  let isTranslating = false;

  const startRecog = (langCode) => {
    if (isTranslating) return;
    const langMap = { 'en': 'en-US', 'ja': 'ja-JP', 'zh': 'zh-CN', 'ko': 'ko-KR', 'es': 'es-ES', 'fr': 'fr-FR' };
    translatorRecog.lang = langCode === 'vi' ? 'vi-VN' : (langMap[targetLangSelect.value] || targetLangSelect.value);
    currentSource = langCode;
    
    txtSource.innerText = "Đang nghe...";
    txtTarget.innerText = "Bản dịch sẽ hiển thị ở đây...";
    txtSource.classList.remove('active');
    txtTarget.classList.remove('active');
    
    if (langCode === 'vi') btnMicVi.classList.add('recording');
    else btnMicTarget.classList.add('recording');

    try { translatorRecog.start(); } catch(e){}
  };

  const stopRecog = () => {
    btnMicVi.classList.remove('recording');
    btnMicTarget.classList.remove('recording');
    try { translatorRecog.stop(); } catch(e){}
  };

  btnMicVi.addEventListener('click', () => {
    if (btnMicVi.classList.contains('recording')) stopRecog();
    else startRecog('vi');
  });

  btnMicTarget.addEventListener('click', () => {
    if (btnMicTarget.classList.contains('recording')) stopRecog();
    else startRecog('target');
  });

  translatorRecog.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    if (currentSource === 'vi') txtSource.innerText = transcript;
    else txtTarget.innerText = transcript;
    
    if (currentSource === 'vi') txtSource.classList.add('active');
    else txtTarget.classList.add('active');
  };

  translatorRecog.onend = async () => {
    stopRecog();
    let textToTranslate = currentSource === 'vi' ? txtSource.innerText : txtTarget.innerText;
    if (!textToTranslate || textToTranslate === "Đang nghe...") return;

    isTranslating = true;
    let targetEl = currentSource === 'vi' ? txtTarget : txtSource;
    targetEl.innerText = "Đang dịch...";

    try {
      const fromLang = currentSource === 'vi' ? 'Tiếng Việt' : 'ngôn ngữ ' + targetLangSelect.options[targetLangSelect.selectedIndex].text;
      const toLang = currentSource === 'vi' ? 'ngôn ngữ ' + targetLangSelect.options[targetLangSelect.selectedIndex].text : 'Tiếng Việt';
      const prompt = `Dịch câu sau từ ${fromLang} sang ${toLang}. Chỉ trả về văn bản đã dịch, không thêm bất kỳ lời giải thích nào.\nCâu cần dịch: "${textToTranslate}"`;
      
      // We will call Suna Chat's backend (which is handled by app.js direct API call)
      if (window.directApiCall) {
        const result = await window.directApiCall(prompt);
        targetEl.innerText = result.trim();
        targetEl.classList.add('active');
        
        // Speak result
        const speakLang = currentSource === 'vi' ? targetLangSelect.value : 'vi-VN';
        window.speakText(result.trim(), speakLang);
      } else {
        targetEl.innerText = "Lỗi: Không thể kết nối AI.";
      }
    } catch (e) {
      targetEl.innerText = "Lỗi dịch thuật: " + e.message;
    }
    isTranslating = false;
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
    
    // Automatically trigger send if State exists
    if (window.State && !window.State.isGenerating) {
      setTimeout(() => {
        const btnSend = document.getElementById('btn-send');
        if (btnSend) btnSend.click();
      }, 300);
    }
  }
};

// Khởi chạy tất cả khi tải xong
document.addEventListener('DOMContentLoaded', () => {
  initTTS();
  initTranslatorMode();
  initMemoryCabinet();
  initArtifactsAndSearch();
});
