# Live Workspace Ecosystem Specification

Tài liệu đặc tả các tính năng nâng cấp cho hệ sinh thái Live Workspace trong Suna Chat.

## 1. Yêu cầu Nghiệp vụ (What & Why)

### R1. Bố cục 3 bảng (Three-pane Workspace Layout)
- **Mục tiêu:** Mở rộng bảng Live Workspace thành một không gian làm việc lập trình khép kín, trực quan.
- **Cơ cấu:**
  - Bảng 1: Trình soạn thảo mã nguồn (Code Editor).
  - Bảng 2: Thanh chia tỷ lệ (Resizer) kéo thả.
  - Bảng 3: Trình xem trước giao diện trực quan (Live Preview Iframe).
  - Bảng 4: Thanh chia tỷ lệ thứ hai (Resizer) kéo thả.
  - Bảng 5: Khung chat hỗ trợ Suna AI Workspace Assistant (chuyên trách giải thích và hướng dẫn code).

### R2. Trợ lý Suna AI Workspace Assistant tích hợp
- **Mục tiêu:** Cho phép người dùng trao đổi trực tiếp với AI về đoạn code đang mở ngay trong Workspace.
- **Hoạt động:**
  - Có khung chat độc lập bên phải trong Workspace.
  - Tự động đính kèm mã nguồn hiện tại của Editor vào tin nhắn làm ngữ cảnh (Context Support) mà người dùng không cần copy-paste.
  - Khi Suna phản hồi kèm mã nguồn mới, các khối mã nguồn HTML/CSS/JS sẽ hiển thị kèm nút **"Áp dụng vào Editor" (Apply to Editor)**. Khi nhấp vào nút này, toàn bộ code đó sẽ ghi đè thẳng vào Editor.

### R3. Quản lý Phiên Học & Tạo Bài Mới (Session Management)
- **Mục tiêu:** Tạo mới bài học nhanh chóng bằng nút bấm hoặc qua câu lệnh chat.
- **Hoạt động:**
  - **Conversational trigger:** Người dùng có thể chat trực tiếp với Suna "Tạo bài mới về [chủ đề]" hoặc "Suna sang bài mới". Suna sẽ tự động cập nhật mã nguồn khởi tạo (HTML Boilerplate, SVG Editor...) vào Editor.
  - **UI Trigger:** Thêm nút "+ Bài mới" trên thanh công cụ Editor. Khi bấm vào sẽ hiện hộp thoại nhanh cho phép người dùng chọn Template mẫu (Ví dụ: Trang trống, Khung HTML5 cơ bản, Sơ đồ SVG mẫu, Tailwind Play).

### R4. Kéo giãn cạnh trái & Mở rộng 100% (Left Resize Handle & Fullscreen Toggle)
- **Mục tiêu:** Cho phép người dùng mở rộng Live Workspace lên chiếm toàn bộ chiều rộng trình duyệt.
- **Hoạt động:**
  - Cạnh trái của bảng Workspace có một thanh kéo tỷ lệ (Left Resize Handle). Khi người dùng nhấn giữ và kéo về bên trái, toàn bộ Workspace Panel sẽ rộng ra, nén khung chat chính lại (hỗ trợ kéo rộng từ 40% đến 100% màn hình).
  - Có nút "Mở rộng/Thu nhỏ" (Expand/Collapse) ở góc trái thanh tiêu đề Workspace để chuyển đổi nhanh giữa kích thước mặc định (60%) và toàn màn hình (100%).
