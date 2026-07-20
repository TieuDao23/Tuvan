# Suna Chat Project Constitution

Quy định và nguyên tắc bắt buộc tuân thủ khi phát triển và bảo trì dự án Suna Chat.

## 1. Nguyên Tắc Lõi (Core Principles)
- **Không phá vỡ chức năng cũ:** Mọi nâng cấp tính năng mới không được làm ảnh hưởng đến các tính năng đang chạy ổn định của hệ thống chat, lofi, xác thực, sơ đồ tư duy (mindmap) và Kanban.
- **Tính năng độc lập & đóng gói:** Các bảng giao diện hoặc mô-đun mới phải được viết gọn gàng, có cơ chế reset trạng thái và hủy bỏ các lắng nghe sự kiện (event listeners) khi đóng/tắt để tránh rò rỉ bộ nhớ.

## 2. Tiêu Chuẩn Giao Diện (UI/UX Standards - taste-skill)
- **Ngôn ngữ thiết kế:** Glassmorphism kết hợp màu sắc tối chuyển màu (dark gradients).
  - Background chính: `#0d0b14` hoặc tương đương.
  - Panel background: `rgba(20, 18, 30, 0.65)` kèm `backdrop-filter: blur(20px)`.
  - Accent Color: Gradient từ cam đào (`#e8a87c`) sang đỏ đậm (`#c0392b`).
- **Phản hồi tương tác (Micro-interactions):** Mọi nút bấm, thanh trượt kéo thả phải có hiệu ứng transition (hover, active) mượt mà (tối ưu chuyển động `ease` hoặc `cubic-bezier`).
- **Mở rộng/Thu hẹp:** Thiết kế trượt mở rộng mượt mà bằng CSS transitions, không giật lag.

## 3. Tiêu Chuẩn Kỹ Thuật (Technical Standards)
- **Mã nguồn thuần Javascript (Vanilla JS):** Không sử dụng thêm các thư viện đóng gói NPM ngoài những thư viện CDN đã tải sẵn trong `index.html` (KaTeX, PDF.js, Mermaid).
- **Hệ thống biến toàn cục (State):** Mọi thay đổi trạng thái phải được phản ánh vào đối tượng `State` toàn cục trong `app.js` và được đồng bộ lưu trữ (`saveState()`).
- **Quản lý an toàn sự kiện DOM:** Sử dụng `e.preventDefault()` và ngăn chặn nổi bọt (`e.stopPropagation()`) thích hợp khi kéo thả, nhấn phím để tránh xung đột sự kiện cuộn/kéo thả của màn hình chat chính.
