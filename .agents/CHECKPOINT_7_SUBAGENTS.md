# Checkpoint Mốc Dữ Liệu 7 Subagents — Dự Án Suna Agent Harness

> Thời điểm ghi nhận: 2026-09-07T13:05:30Z (20:05:30+07:00)  
> Dự án: Suna Agent Harness (`suna_harness.js`) & SunaChat Integration  
> Trạng thái: Lưu trữ mốc dữ liệu hoàn tất, tiếp tục tiến trình nghiệm thu  

---

## 1. Danh Sách 7 Subagents & Nhiệm Vụ Đã Hoàn Thành

| # | Định danh Subagent | Vai trò (Role) | Thư mục làm việc | Trạng thái mốc dữ liệu | Đóng góp chính |
|---|---|---|---|---|---|
| 1 | `sentinel_4` | Giám sát tiến độ & Liveness | `.agents/sentinel_4` | Đã thiết lập | Thiết lập Briefing, theo dõi heartbeat định kỳ (task-28, task-30), ghi nhận yêu cầu gốc vào `ORIGINAL_REQUEST.md`. |
| 2 | `orchestrator_5` | Điều phối tổng thể dự án | `.agents/orchestrator_5` | Đã thiết lập | Lập kế hoạch phân rã 5 pha (`plan.md`), tổng hợp kiến trúc vào `PROJECT.md` & `TEST_INFRA.md`, quản lý cổng nghiệm thu `GATE_STATUS.md`. |
| 3 | `explorer_survey_1` | Khảo sát SunaAgent & Codebase | `.agents/explorer_survey_1` | Đã hoàn thành | Khảo sát cấu trúc tệp, vòng lặp ReAct loop của SunaAgent, marker delimiter, và đường cơ sở 828 bài test hiện có. |
| 4 | `explorer_survey_2` | Khảo sát VFS & ACI SWE-agent | `.agents/explorer_survey_2` | Đã hoàn thành | Khảo sát mô hình SWE-agent ACI (view_file trượt, replace_file_content), VFS Sandbox, LangGraph Checkpointing & OpenHands Trajectory. |
| 5 | `explorer_survey_3` | Khảo sát Chaos, Guardrails & Eval | `.agents/explorer_survey_3` | Đã hoàn thành | Khảo sát cơ chế Grounded Self-Correction, bộ bơm lỗi Chaos Fault Injection (rớt mạng, 429, khóa file), và thang điểm AgentBench. |
| 6 | `test_writer_1` | Lập trình bộ kiểm thử E2E | `.agents/test_writer_1` | Đã hoàn thành | Xây dựng 154 bài test toàn diện trong `tests/test_suna_harness.js` (Tiers 1-4: VFS, ACI, Trajectory, Checkpointing, Self-Correction, Chaos, Benchmarks), công bố `TEST_READY.md`. |
| 7 | `worker_1` | Lập trình module lõi SunaHarness | `.agents/worker_1` | Đã hoàn thành | Xây dựng toàn bộ `suna_harness.js` (3.133 dòng mã), cơ chế phòng thủ ReDoS, cấu trúc chia sẻ CoW, liên kết với `app.js` và nhúng vào `index.html`. |

---

## 2. Các Tệp Mã Nguồn & Tài Liệu Cốt Lõi Đã Tạo

1. **`suna_harness.js`** (3.133 dòng):
   - `VfsSandbox`: Hệ thống tệp ảo cách ly trong RAM, hỗ trợ CRUD, chuẩn hóa đường dẫn, globToRegex, sync Live Workspace.
   - `AciInterface`: SWE-agent style ACI (`view_file`, `replace_file_content`, `grep_search`, `find_by_name`, `list_dir`, `run_sandboxed_command`).
   - `HarnessController`: Quản lý ngân sách bước, tính toán token (~4 ký tự/token), chế độ read-only, timeout an toàn.
   - `TrajectoryEngine`: Ghi vết sự kiện bất biến (`Object.freeze`), đo lường độ trễ và xuất JSONL / Markdown.
   - `CheckpointManager`: LangGraph-style state checkpointing, CoW structural sharing, hỗ trợ tua lại (rewind) và tua xuôi (replay).
   - `SelfCorrectionLoop`: Phân loại 9 nhóm lỗi chẩn đoán với con trỏ trực quan `^` và hướng dẫn khắc phục cụ thể.
   - `ChaosFaultInjector`: Giả lập sự cố rớt mạng, mã lỗi 429 kèm Retry-After, tệp tin bị khóa (EBUSY), trôi đồng hồ và phân mảnh micro-chunks.
   - `RunawayGuardrails`: Ngăn chặn vòng lặp vô tận (lặp lỗi >=3 lần, dao động ping-pong chu kỳ 2/3, VFS không thay đổi).
   - `BenchmarkSuite & EvaluationRunner`: 20 bài toán mẫu với oracle chấm điểm tự động (Success Rate, Step Efficiency, Fault Recovery Rate).

2. **`tests/test_suna_harness.js`** (2.124 dòng):
   - 154 bài kiểm thử phân theo 4 tầng (Tier 1: Feature Isolation, Tier 2: Boundary & Corner Cases, Tier 3: Cross-Feature Interactions, Tier 4: Real-World Workloads).
   - Tỷ lệ vượt qua: **154 / 154 tests PASS 100%**.

3. **Toàn bộ hệ thống kiểm thử SunaChat**:
   - `npm test`: **982 / 982 tests PASS 100%** (828 tests cũ + 154 tests SunaHarness mới).
   - `npm run check`: **0 syntax errors** (`node -c app.js && node -c redesign.js && node -c suna_harness.js`).
   - `python run_verification.py`: **100% GREEN**.

---

## 3. Các Nhiệm Vụ Tiếp Nối Cần Triển Khai Ngay

- **Challenger 1**: Chạy bộ kiểm thử đối kháng VFS, ReDoS regex, Path Traversal & tính bất biến của Trajectory -> xuất `handoff.md`.
- **Challenger 2**: Chạy bộ kiểm thử đối kháng Cascading Chaos Faults, Loop Traps & Semantic Zero-Progress -> xuất `handoff.md`.
- **Reviewer 1**: Thẩm định mã nguồn R1/R2 (Sandbox VFS, ACI, Trajectory, Checkpointing) -> xuất `handoff.md`.
- **Reviewer 2**: Thẩm định mã nguồn R3/R4 (Self-Correction, Chaos Injector, Guardrails, Benchmark Suite) -> xuất `handoff.md`.
- **Auditor 1**: Kiểm toán toàn vẹn mã nguồn (Forensic Anti-Cheat, Non-facade verification, 982 tests) -> xuất `handoff.md`.
- **Orchestrator**: Cập nhật `GATE_STATUS.md` thành **VICTORY CONFIRMED**.
