# Live Workspace & Core Subsystems Specification

Tài liệu đặc tả yêu cầu nghiệp vụ ("What & Why"), hành vi tương tác, dữ liệu đầu vào/đầu ra và xử lý trường hợp biên cho hệ sinh thái Live Workspace và các hệ thống cốt lõi trong Suna Chat.

---

## 1. Yêu Cầu Nghiệp Vụ (Functional Requirements)

### R1. Bố Cục 3 Bảng Linh Hoạt (3-Pane Workspace Layout)
- **Mục tiêu:** Mở rộng không gian làm việc Live Workspace thành một môi trường IDE thu nhỏ khép kín, trực quan và hỗ trợ đa nhiệm lập trình.
- **Cơ cấu hiển thị:**
  1. **Bảng 1 (Code Editor - `#artifact-editor-container`):** Trình soạn thảo mã nguồn HTML/CSS/JS (chiếm 35% chiều rộng ở chế độ `split`).
  2. **Thanh chia tỷ lệ 1 (`#artifact-resizer-1`):** Thanh kéo chia tỷ lệ giữa Code Editor và Preview Iframe.
  3. **Bảng 2 (Live Preview - `#artifact-preview-container`):** Iframe sandbox hiển thị thời gian thực kết quả biên dịch mã nguồn (chiếm 35% chiều rộng ở chế độ `split`).
  4. **Thanh chia tỷ lệ 2 (`#artifact-resizer-2`):** Thanh kéo chia tỷ lệ giữa Preview Iframe và Suna AI Assistant.
  5. **Bảng 3 (Suna AI Assistant - `#artifact-chat-container`):** Khung chat chuyên trách hỗ trợ lập trình (chiếm 30% chiều rộng ở chế độ `split`).
- **Chế độ xem (`data-view`):**
  - `data-view="split"`: Hiển thị đồng thời cả 3 bảng (35% / 35% / 30%) và 2 thanh chia tỷ lệ.
  - `data-view="editor"`: Phóng to Code Editor lên 100%, ẩn Preview, Assistant và các thanh chia tỷ lệ.
  - `data-view="preview"`: Phóng to Live Preview lên 100%, ẩn Code Editor, Assistant và các thanh chia tỷ lệ.

---

### R2. Trợ Lý Suna AI Workspace Assistant & Thao Tác "Áp Dụng Vào Editor"
- **Mục tiêu:** Trợ lý ảo AI đàm thoại trực tiếp về đoạn code đang xử lý, tự động gắn ngữ cảnh mã nguồn và hỗ trợ nạp code vào Editor với 1 cú nhấp chuột.
- **Hành vi tương tác:**
  - **Tự động gắn ngữ cảnh (Code Context Injection):** Khi gửi tin nhắn từ `#workspace-chat-input`, hệ thống tự động đọc giá trị hiện tại của `#artifact-editor-textarea` và tiêm vào System Instruction: `[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]: \n\n\`\`\`html\n${currentCode}\n\`\`\``.
  - **Trực quan hóa trạng thái (Thinking Indicator):** Hiển thị bong bóng suy nghĩ dạng animated indicator trong khi chờ API phản hồi, dọn dẹp sạch sẽ qua khối `finally`.
  - **Hành động "Áp dụng vào Editor" (`.btn-workspace-apply`):** Mọi khối mã nguồn do AI tạo ra trong khung chat Workspace được đính kèm nút "Áp dụng vào Editor".
    - Khi người dùng bấm nút: Giải mã `decodeURIComponent`, gán trực tiếp vào `#artifact-editor-textarea.value`, kích hoạt sự kiện `input` (`dispatchEvent(new Event('input'))`) để cập nhật Live Preview Iframe ngay lập tức, đồng thời hiển thị thông báo Toast thành công.

---

### R3. Quản Lý Phiên Làm Việc & Mẫu Khởi Tạo Nhanh (Session Management & Templates)
- **Mục tiêu:** Cho phép người dùng tạo nhanh các dự án web/giao diện mới với các template chuẩn hóa mà không cần nhập code từ đầu.
- **Hành vi tương tác:**
  - **Nút "+ Bài mới" (`#btn-new-session`):** Nằm trên thanh công cụ `.workspace-editor-toolbar`. Khi kích hoạt:
    - Nạp mã nguồn của template đang được chọn trong dropdown `#select-session-template`.
    - Cập nhật Editor và phát sự kiện `input` để đồng bộ Preview Iframe.
    - Đặt lại lịch sử hội thoại Workspace (`State.workspaceMessages = []`) và khởi tạo lại lời chào của Suna AI Assistant để làm sạch ngữ cảnh.
  - **Danh mục Template khởi tạo:**
    - `blank`: Tài liệu HTML5 trống tinh gọn.
    - `html5`: Trang đích HTML5 hiện đại với typography và container responsive.
    - `svg`: Không gian vẽ hình vector SVG tương tác với animation.
    - `tailwind`: Giao diện ứng dụng hiện đại sử dụng CDN Tailwind CSS.

---

### R4. Thanh Kéo Cạnh Trái (25%–100%) & Phím Tắt Toàn Màn Hình
- **Mục tiêu:** Cho phép người dùng tùy biến linh hoạt độ rộng của toàn bộ panel Workspace từ cửa sổ phụ sang không gian làm việc toàn màn hình.
- **Hành vi tương tác:**
  - **Thanh kéo cạnh trái (`#workspace-left-handle`):** Nằm ở rìa trái của `#artifacts-panel` với con trỏ `ew-resize`.
    - Khi kéo rê chuột (`mousedown` -> `mousemove` -> `mouseup`), tính toán tỷ lệ phần trăm chiều rộng dựa trên `(window.innerWidth - e.clientX) / window.innerWidth * 100`.
    - Giới hạn kẹp an toàn (Clamping Guard): **25% đến 100%** (`Math.max(25, Math.min(percentage, 100))`).
  - **Nút phóng to/thu nhỏ nhanh (`#btn-expand-workspace`):**
    - Chuyển đổi qua lại giữa kích thước mặc định (60%) và toàn màn hình (100%).
    - Cập nhật biểu tượng Material Icon giữa `open_in_full` và `close_fullscreen`.

---

### R5. Đồng Bộ Suffix LocalStorage & Cơ Chế Proxy Dự Phòng 3 Tầng
- **Mục tiêu:** Đảm bảo toàn vẹn dữ liệu cá nhân hóa giữa các tài khoản và ổn định kết nối tải tài nguyên từ web.
- **Hành vi tương tác:**
  - **Đồng bộ Suffix LocalStorage:** Mọi điểm lưu trữ cấu hình người dùng (`#btn-save-api`, `#btn-save-settings`, `#user-avatar-input`, `#btn-save-personality`, `#btn-save-font`) đều phải ghi vào khóa `'suna_settings' + getStorageSuffix()`, ngăn chặn hiện tượng ghi đè chéo cấu hình giữa tài khoản Guest (`_guest`) và tài khoản đăng nhập (`_${currentUser.uid}`).
  - **Cơ chế Proxy 3 Tầng (`window.fetchWithProxy`):** Hàm `fetchLinkContext` tái sử dụng bộ điều phối proxy có sẵn với 3 tầng fallback:
    1. Tầng 1: `https://corsproxy.io/?url=${encodeURIComponent(url)}`
    2. Tầng 2: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    3. Tầng 3: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`

---

## 2. Xử Lý Trường Hợp Biên (Edge Cases & Safety Guards)

| Tình huống biên | Đầu vào | Hành vi xử lý của hệ thống |
|-----------------|---------|----------------------------|
| **Kéo chuột qua Iframe** | Chuột di chuyển nhanh qua diện tích iframe trong khi kéo resizer | Gọi `lockAllIframes()` lúc `mousedown` gán `pointer-events: none` cho mọi iframe; gọi `unlockAllIframes()` khôi phục `pointer-events: auto` khi `mouseup` hoặc `window.blur`. |
| **Kéo resizer nội bộ chạm biên** | Kéo Resizer 1 hoặc Resizer 2 quá sát biên trái hoặc phải | Kẹp giới hạn tối thiểu 10% chiều rộng cho mỗi bảng đang hiển thị để tránh sập layout. |
| **API AI treo / Chậm phản hồi** | Yêu cầu tới endpoint `/chat/completions` vượt quá 45 giây | `_workspaceAbortController` kích hoạt hủy request, xóa typing indicator trong khối `finally`, và hiển thị Toast thông báo timeout. |
| **Đổi mạng / Network flap** | Người dùng ngắt kết nối mạng rồi kết nối lại nhiều lần | Cờ `_authOnlineListenerAttached` ngăn chặn tích tụ nhiều hàm callback trùng lặp trên sự kiện `window.ononline`. |
| **Code chứa ký tự đặc biệt** | Khối code do AI sinh ra chứa ký tự Unicode, ngoặc kép, thẻ HTML | Mã hóa an toàn qua `encodeURIComponent` khi render HTML; giải mã chính xác qua `decodeURIComponent` khi người dùng nhấn "Áp dụng vào Editor". |
| **Chuyển đổi giao diện di động** | Màn hình có chiều rộng `<= 768px` | Tự động chuyển 3 bảng thành bố cục xếp chồng dọc (Vertical Stack), ẩn thanh kéo resizer, kích hoạt cuộn mượt mà độc lập. |
