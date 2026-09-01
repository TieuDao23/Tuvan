# Suna Chat Project Constitution

Quy định, nguyên tắc kỹ thuật và các bất biến kiến trúc (Architectural Invariants) bắt buộc tuân thủ khi phát triển và bảo trì dự án Suna Chat.

---

## 1. Nguyên Tắc Lõi (Core Architectural Invariants)

- **Không phá vỡ chức năng cũ (Zero Regressions):** Mọi nâng cấp tính năng mới không được làm ảnh hưởng đến các tính năng đang chạy ổn định của hệ sinh thái chat, Suna Lofi Player, xác thực Firebase/Guest, sơ đồ tư duy (Mindmap), bảng Kanban và lưu trữ State.
- **Tính năng độc lập & Đóng gói vòng đời sự kiện (Modular Event Cleanup):**
  - Mọi module giao diện (Live Workspace, Mindmap, Kanban, Lofi Player) phải tự quản lý vòng đời (Lifecycle) hoàn chỉnh.
  - Phải loại bỏ hoặc hủy bỏ (cleanup/unbind) các lắng nghe sự kiện (`removeEventListener`, `AbortController.abort()`, dọn dẹp cờ trạng thái) khi đóng hoặc chuyển đổi view để triệt tiêu hoàn toàn rò rỉ bộ nhớ (Memory Leaks) và tích tụ sự kiện trùng lặp.
  - Ngăn ngừa gắn trùng lặp các sự kiện toàn cục trên `window` (ví dụ: cờ `_authOnlineListenerAttached` cho sự kiện `online`).
- **An toàn tương tác kéo thả Iframe (Iframe Pointer-Events Invariant):**
  - Trong quá trình kéo thả bất kỳ thanh chia tỷ lệ nào (`#workspace-left-handle`, `#artifact-resizer-1`, `#artifact-resizer-2`), tất cả `<iframe>` trên trang phải được vô hiệu hóa sự kiện chuột thông qua `lockAllIframes()` (`pointer-events: none`).
  - Phục hồi `unlockAllIframes()` (`pointer-events: auto`) ngay khi kết thúc thao tác (`mouseup` trên `document` và `window.blur` khi trỏ chuột rời cửa sổ trình duyệt).

---

## 2. Tiêu Chuẩn Thiết Kế Giao Diện (Anti-Slop UI/UX & Design Tokens)

Hệ thống thiết kế tuân thủ nghiêm ngặt bảng màu Zen Dark / Ink-Wash kết hợp Glassmorphism cao cấp:

### Bảng Mã Màu (Color Palette Tokens)
- **Background chính (`--bg-primary`):** `#0d0b14` (Màu đen than mực Zen tối sâu).
- **Background phụ (`--bg-secondary`):** `#14121e` / `#1a1824` (Nền panel & card phụ).
- **Màu nhấn 1 (`--accent-1`):** `#e8a87c` (Cam đào ấm áp / Peach Gold).
- **Màu nhấn 2 (`--accent-2`):** `#c0392b` (Đỏ son / Vermilion Red).
- **Màu chữ chính (`--text-primary`):** `#e0e0e0` / `#ffffff`.
- **Màu chữ phụ (`--text-secondary`):** `#a0a0b0` / `#888899`.
- **Màu viền (`--border-color`):** `rgba(232, 168, 124, 0.15)`.

### Quy Chuẩn Glassmorphism (Frosted Glass Surface)
- **Panel Surface:** `rgba(20, 18, 30, 0.65)` kết hợp `backdrop-filter: blur(20px)` và `-webkit-backdrop-filter: blur(20px)`.
- **Viền sáng tinh tế (1px Border Highlight):** `1px solid rgba(255, 255, 255, 0.08)` hoặc viền nhấn màu hổ phách mờ.

### Tiêu Chuẩn Trợ Năng & Tương Phản (WCAG AA Accessibility)
- Tỷ lệ tương phản chữ và nền (Contrast Ratio) cho toàn bộ nội dung văn bản đạt tối thiểu **4.5:1** (WCAG AA).
- Typography sử dụng font có chân sang trọng cho tiêu đề (`Cinzel Decorative`, `Playfair Display`) kèm letter-spacing thông thoáng (1px), cùng font không chân sắc nét cho thân bài (`Satoshi`, `Inter`, `system-ui`). Mọi font đều có safe generic fallbacks (`serif`, `sans-serif`).

### Tiêu Chuẩn Chuyển Động & Hiệu Năng 60fps (Animation Invariants)
- Mọi chuyển động micro-interaction trên các phần tử tương tác (`.btn`, `.nav-btn`, `.resizer`) chỉ được animate thông qua **`transform`**, **`opacity`** và **`background-color`** (GPU-accelerated).
- Cấm animate trực tiếp trên các thuộc tính gây Layout Reflow / Thrashing như `width`, `height`, `top`, `left`.

---

## 3. Tiêu Chuẩn Kỹ Thuật Ponytail (Native Vanilla JS Standard)

- **Zero NPM Runtime Dependencies:** Sử dụng Web APIs nguyên bản của trình duyệt (`fetch`, `Audio`, `Blob`, `URL`, `TextDecoder`, `AbortController`, `localStorage`, `IndexedDB`). Không đưa thêm bundler, framework, hoặc thư viện phụ thuộc ngoài các CDN đã chỉ định trong `index.html` (KaTeX, PDF.js, Mermaid).
- **Quản lý Trạng thái Tập trung (Single Source of Truth):**
  - Đối tượng `State` toàn cục trong `app.js` là nguồn chân lý duy nhất cho dữ liệu phiên làm việc, cấu hình cài đặt và lịch sử chat.
  - Đồng bộ lưu trữ cài đặt phải luôn sử dụng tiền tố/hậu tố tài khoản chuẩn: `'suna_settings' + getStorageSuffix()`.
- **Xử lý Bất đồng bộ & Fallback An Toàn:**
  - Mọi yêu cầu mạng kéo dài (gọi AI Assistant) phải có `AbortController` và cơ chế Timeout an toàn (45s).
  - Tác vụ thu thập ngữ cảnh liên kết ngoài (`fetchLinkContext`) phải sử dụng cơ chế Proxy 3 tầng (`window.fetchWithProxy`) chống lỗi CORS (`corsproxy.io` -> `api.allorigins.win` -> `api.codetabs.com`).
- **An Toàn DOM & Ngăn Chặn Xung Đột Sự Kiện:**
  - Luôn sử dụng `e.preventDefault()` và `e.stopPropagation()` phù hợp trong các thao tác kéo thả và phím tắt để tránh kích hoạt ngoài ý muốn sự kiện cuộn/kéo của màn hình chat chính.
