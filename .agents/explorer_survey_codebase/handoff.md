# Báo Cáo Khảo Sát & Kiểm Toán Toàn Diện Mã Nguồn Suna Chat
**Agent:** Codebase Architect Explorer  
**Thời gian:** 2026-08-27  
**Thư mục làm việc:** `d:\Suna Chat`

---

## 1. Observation (Quan Sát Trực Tiếp)

### 1.1. Kiến Trúc Mã Nguồn & Danh Mục Module (Module Inventory)
- **`app.js` (7,103 dòng, 284KB)**: File JS nguyên khối gồm 4 phân vùng module được gộp theo thứ tự:
  1. `auth.js` (Dòng 1 - 943): Quản lý Firebase Auth (v10.12.2), đăng nhập tức thì qua cache (`getCachedAuthUser`), chế độ khách (Guest mode), thuật toán đồng bộ đám mây Fetch-Merge-Save 3 chiều (`triggerCloudSync`) và xử lý xung đột (`mergeChatLists`, `mergeMemory`).
  2. `features.js` (Dòng 945 - 2260): Giọng đọc nữ tiếng Việt TTS (`initTTS`), Phiên dịch viên 2 chiều (`initTranslatorMode`), Tủ trí nhớ Suna (`initMemoryCabinet`), Live Workspace & Web Search (`initArtifactsAndSearch`, `window.fetchWithProxy`), Phân tích tài liệu (`analyzeDocument`), Xuất đoạn chat 4 định dạng MD/TXT/HTML/JSON (`initExportChat`), và Bộ phát nhạc Suna Lofi Player (`LofiPlayer`).
  3. `agent.js` (Dòng 2262 - 2598): Bộ phân tích luồng `StreamParser`, hệ điều phối công cụ `SunaAgent` với whitelist các công cụ (`change_lofi_mood`, `speak_message`, `save_note_to_firestore`, `get_system_state`, `update_user_profile`).
  4. `app.js` core (Dòng 2600 - 7102): Quản lý State toàn cục (`State`), lưu trữ bền vững IndexedDB (`idbSet`, `idbGet`), hệ thống nhận diện cảm xúc & dynamic theme (`classifySentiment`), giao diện chat, xử lý tệp/hình ảnh đa phương tiện, gọi API OpenAI-compatible streaming (`sendMessage`, `generateAIResponse`), KaTeX/Mermaid/Mindmap/Kanban parser, và điều phối sự kiện giao diện (`initEvents`, `openModal`, `closeModal`).
- **`index.html` (848 dòng, 54.9KB)**:
  - Cấu trúc Auth Screen (Đăng nhập, Đăng ký, Quên mật khẩu, Google OAuth, Chế độ khách).
  - Main App Layout: Sidebar điều hướng, Top Bar tích hợp Suna Lofi Player & Model Selector, Khung hội thoại chính với Drag & Drop File Overlay.
  - Modals: Cài đặt chung, Cấu hình API đa proxy, Tính cách AI, Tùy chỉnh Font chữ, Đổi tên chat, Xác nhận xóa, Tủ trí nhớ, Phiên dịch viên, Xuất đoạn chat.
  - Live Workspace Panel (`#artifacts-panel` dòng 784-839): Tích hợp `#workspace-left-handle`, nút `#btn-expand-workspace`, thanh công cụ `.workspace-editor-toolbar` (+ Bài mới, Template selector), `#artifact-resizer-1`, `#artifact-preview-container` (`#artifact-iframe`), `#artifact-resizer-2`, `#artifact-chat-container` (Suna Workspace AI Assistant).
- **`styles.css` (5,629 dòng, 123KB)**:
  - Bảng màu Thủy Mặc / Zen Dark (`--bg-primary: #0d0b14`, `--bg-secondary: #1a1824`, `--bg-tertiary: rgba(20, 18, 30, 0.65)`).
  - Lớp kính mờ Glassmorphism (`backdrop-filter: blur(20px)`).
  - Màu nhấn Zen gradient (`--accent-color: #e8a87c`, hover `#c0392b`).
  - Typography: Serif headers (`Cinzel Decorative`, `Playfair Display`), Sans-serif body (`Satoshi`, `Inter`).
  - Cấu trúc CSS cho 3-pane Live Workspace (`[data-view="split"]`, `[data-view="editor"]`, `[data-view="preview"]`), Resizers, và Mobile media queries.
- **`mindmap.html` (2,369 dòng, 87KB)**: Trình tạo và tương tác Sơ đồ tư duy độc lập (SVG Pan/Zoom, Editable node cards, Markdown parser, High-res SVG/PNG/JSON/MD export).
- **`tests/ui_redesign/`**: Bộ 6 bài test Mocha (3 visible tests: `test_color_palette.js`, `test_layout_elements.js`, `test_typography.js` và 3 hidden tests: `test_contrast_ratio.js`, `test_css_fallbacks.js`, `test_transition_perf.js`) hiện đang pass 100% (9/9 asserts).
- **`.specify/`**: Bộ tài liệu Spec-Kit SDD (`constitution.md`, `specify.md`, `plan.md`, `tasks.md`).

---

### 1.2. Các Lỗi Tiềm Ẩn, Điểm Rò Rỉ & Sai Lệch Trạng Thái (Bugs & DOM Leaks)

1. **Lỗi Kẹt Kéo Thả (Sticky Resizer Trap) trên `#workspace-left-handle`**:
   - *Vị trí:* `app.js`, dòng 1445-1468.
   - *Chi tiết:* Khi kéo giãn cạnh trái Workspace (`leftHandle.addEventListener('mousedown')`), không thiết lập `pointer-events: none` cho các thẻ iframe (`#artifact-iframe` và iframe mindmap trong chat). Khi chuột di chuyển nhanh vào vùng iframe, sự kiện `mouseup` bị iframe chặn lại, khiến cờ `isResizingWorkspace` không được reset về `false`. Người dùng bị kẹt trạng thái kéo panel.
2. **Không Đồng Bộ Khóa Lưu Trữ Settings (`localStorage` Suffix Mismatch)**:
   - *Vị trí:* `app.js`, dòng 6788, 6825, 6871, 6947, 6966 đối chiếu với dòng 2872, 2896.
   - *Chi tiết:* Trong các hàm lưu nhanh khi nhấn nút ("Lưu cấu hình API", "Lưu cài đặt", "Đổi avatar", "Lưu tính cách", "Áp dụng font"), code gọi trực tiếp `localStorage.setItem('suna_settings', ...)` (không có suffix `_guest` hoặc `_<uid>`). Trong khi đó, `saveState()` và `loadState()` lại đọc/ghi theo `suna_settings + suffix`. Điều này làm thất lạc cấu hình khi chuyển đổi giữa các tài khoản hoặc khi tải lại trang ngay sau khi lưu.
3. **Thiếu Khớp Định Dạng 3 Bảng Workspace Trên Màn Hình Nhỏ (Mobile Layout Collision)**:
   - *Vị trí:* `styles.css`, dòng 4531-4545 đối chiếu với dòng 5360-5374.
   - *Chi tiết:* Trong `@media (max-width: 768px)`, CSS định nghĩa `.artifacts-panel[data-view="split"] .artifact-editor-container` chiếm 50% chiều cao và `.artifact-preview-container` chiếm 50% chiều cao, nhưng bỏ quên `.artifact-chat-container` (Suna Workspace Assistant), dẫn đến tràn giao diện hoặc đè khuất khung chat AI trên thiết bị di động.
4. **Tích Tụ Sự Kiện `window.online` Nhiều Lần (Listener Accumulation)**:
   - *Vị trí:* `app.js`, dòng 839 (`initAuth`) và dòng 6382-6383 (`initEvents`).
   - *Chi tiết:* Mỗi khi `initAuth()` được kích hoạt lại khi có mạng, một listener `'online'` mới lại được gán vào `window` mà không có cơ chế hủy bỏ hoặc kiểm tra cờ gắn lặp.
5. **Không Tái Sử Dụng `fetchWithProxy` Trong `fetchLinkContext`**:
   - *Vị trí:* `app.js`, dòng 5392 đối chiếu với dòng 1297 (`window.fetchWithProxy`).
   - *Chi tiết:* `fetchLinkContext` chỉ thử duy nhất proxy `allorigins.win`. Nếu proxy này gặp lỗi CORS hoặc timeout, tính năng trích xuất link trong chat chính sẽ thất bại, trong khi `window.fetchWithProxy` đã có sẵn chuỗi fallback 3 proxy mạnh mẽ (corsproxy.io -> allorigins.win -> codetabs.com).
6. **Thiếu Xử Lý Timeout / Abort Trong Khung Chat Workspace AI Assistant**:
   - *Vị trí:* `app.js`, dòng 1782-1791 (`sendWorkspaceMessage`).
   - *Chi tiết:* Gọi fetch không kèm `AbortController` hay timeout. Nếu mạng chập chờn, trạng thái "Suna đang suy nghĩ..." trong Workspace Assistant có thể bị treo vĩnh viễn mà không phục hồi.

---

## 2. Logic Chain (Chuỗi Lập Luận)

1. *Từ Quan sát 1.2.1:* `leftHandle` lắng nghe `mousemove`/`mouseup` trên `document`, nhưng các iframe bên dưới có ngữ cảnh cửa sổ riêng (browsing context). Khi con trỏ chuột vượt qua ranh giới iframe, `document` chính không nhận được sự kiện `mousemove` và `mouseup`. → **Kết luận:** Cần bổ sung cơ chế khóa `pointer-events: none` cho tất cả iframes trên trang trong suốt thời gian kéo và khôi phục khi nhả chuột.
2. *Từ Quan sát 1.2.2:* `getStorageSuffix()` trả về `_<uid>` khi đã đăng nhập hoặc `_guest` khi ở chế độ khách. Các nút lưu trực tiếp lại ghi vào key `'suna_settings'`. Khi người dùng reload trang, `loadState()` đọc từ `'suna_settings' + suffix`. → **Kết luận:** Mọi điểm ghi settings trực tiếp phải sử dụng `suna_settings + getStorageSuffix()` hoặc gọi trực tiếp helper `saveLocalStateOnly()`.
3. *Từ Quan sát 1.2.3:* Cấu trúc Workspace đã được nâng cấp từ 2 bảng lên 3 bảng (Editor, Preview, Assistant Chat). CSS desktop (dòng 5360-5374) đã chia tỉ lệ 35% - 35% - 30%, nhưng block media query mobile (dòng 4531-4545) chưa được cập nhật theo cấu trúc mới. → **Kết luận:** Cần cập nhật media query để hỗ trợ bố cục dọc 3 bảng linh hoạt (hoặc tab chuyển đổi) trên mobile và ẩn/tắt resizer ngang.
4. *Từ Quan sát 1.2.4:* Sự kiện `window.addEventListener('online')` được gọi trong `initAuth()` mà `initAuth()` lại được gọi lại trong callback online. → **Kết luận:** Cần di chuyển việc đăng ký sự kiện mạng ra ngoài hoặc bọc qua một cờ khởi tạo một lần (`_networkEventsInited`).
5. *Từ Quan sát 1.2.5:* Tái sử dụng helper theo đúng chuẩn Ponytail (Bậc 2: Tái sử dụng hàm có sẵn trong codebase). → **Kết luận:** Thay thế logic fetch thủ công trong `fetchLinkContext` bằng `window.fetchWithProxy`.

---

## 3. Caveats (Phạm Vi Chưa Khảo Sát & Giả Định)

- **Firebase Backend Live Environment:** Không thực hiện gửi request trực tiếp đến Firestore máy chủ thật của người dùng để bảo toàn dữ liệu sản xuất; toàn bộ khảo sát dựa trên kiểm toán mã nguồn tĩnh, mock data và test suite tự động.
- **Microphone / Web Speech API:** Hoạt động của SpeechSynthesis và SpeechRecognition phụ thuộc vào quyền truy cập phần cứng và hỗ trợ của trình duyệt tại thời điểm chạy (đã có cơ chế kiểm tra `in window` an toàn).

---

## 4. Conclusion & Kế Hoạch Sửa Lỗi (Fix Strategy & Boundaries)

### Phân Định Ranh Giới Sửa Đổi (File Boundaries):
1. **`app.js`**:
   - Thêm `pointer-events: none` cho iframe khi kéo `#workspace-left-handle` và `#artifact-resizer-1/2`.
   - Chuẩn hóa toàn bộ các điểm ghi `localStorage` dùng `getStorageSuffix()`.
   - Chuyển `fetchLinkContext` sang sử dụng `window.fetchWithProxy`.
   - Bổ sung `AbortController` và an toàn ngoại lệ cho `sendWorkspaceMessage`.
   - Khắc phục đăng ký lặp sự kiện `online`/`offline`.
   - Tối ưu hóa conversational trigger cho bài học mới trong `buildSystemPrompt`.
2. **`styles.css`**:
   - Cập nhật media query mobile cho `.artifacts-panel` đảm bảo hiển thị hoàn chỉnh cả 3 bảng (Editor, Preview, Assistant Chat).
   - Tinh chỉnh hiệu ứng chuyển động của các resizers và Left Handle đạt chuẩn 60fps, không gây giật khung hình.
3. **`.specify/`**:
   - Đồng bộ trạng thái kiểm thử và hoàn thành trong `tasks.md`, `specify.md`, `plan.md`.

---

## 5. Verification Method (Phương Pháp Xác Minh Độc Lập)

1. **Kiểm tra Cú pháp Tĩnh:**
   ```bash
   node -c app.js
   node -c redesign.js
   ```
2. **Chạy Trọn Bộ Unit / UI Tests (Mocha):**
   ```bash
   npx mocha tests/ui_redesign/visible_tests/*.js tests/ui_redesign/hidden_tests/*.js
   ```
3. **Kiểm tra DOM & Tương tác Thực tế:**
   - Mở Live Workspace, kéo thử `#workspace-left-handle` qua lại giữa màn hình chat và iframe xem có bị kẹt trỏ chuột không.
   - Nhấn "+ Bài mới", chọn Template (HTML5, SVG, Tailwind) và kiểm tra Editor + Iframe cập nhật ngay lập tức.
   - Nhắn tin trong khung Suna Workspace AI, nhấn nút "Áp dụng vào Editor" và kiểm tra code được nạp thẳng vào Editor.
   - Lưu cấu hình API / Cài đặt, reload trang và xác minh cấu hình vẫn được bảo lưu chính xác.
