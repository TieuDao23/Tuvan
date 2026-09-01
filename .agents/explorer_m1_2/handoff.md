# Handoff Report — M1 R1: System Prompt Anti-Placeholder Directives Investigation

## 1. Observation
- **Target File 1: `buildSystemPrompt()` in `app.js` (lines 5813–5917)**
  - Current prompt structure constructs identity (`[DANH TÍNH]`), persona (`[Phòng Trà Của Tâm]`), user priority (`[QUYỀN HẠN TỐI CAO - NGƯỜI DÙNG]`), memory prompt, tone, mode instructions (`[CHẾ ĐỘ FLASH]`, `[CHẾ ĐỘ PRO]`), thinking (`[TƯ DUY]`), images (`[HÌNH ẢNH]`), web search (`[WEB SEARCH]`), and special formatting (`[ĐỊNH DẠNG ĐẶC BIỆT]`).
  - In `[CHẾ ĐỘ PRO]` (line 5881): `- Với code: viết đầy đủ, có comment giải thích, có error handling, có ví dụ sử dụng.`
  - In `[ĐỊNH DẠNG ĐẶC BIỆT]` item 2 (lines 5912–5913): "2. [Giao diện/Live Workspace]: Nếu yêu cầu thiết kế giao diện web, vẽ SVG, hoặc lập trình Front-end (HTML/CSS/JS), hãy trả về MỘT khối ```html ... ``` HOẶC ```svg ... ``` duy nhất, bao gồm đầy đủ CSS/JS bên trong để có thể chạy được (Live Preview)."
  - **Absence**: There are no explicit, non-negotiable negative constraints forbidding placeholder comments, code elisions, or omitted implementations (e.g. `// ... rest of code here ...`, `/* TODO */`, `/* unchanged */`, `<!-- ... rest of code ... -->`).

- **Target File 2: Workspace Assistant System Prompt in `sendWorkspaceMessage()` (`app.js`, lines 1920–1926)**
  - Current prompt:
    ```javascript
    const systemPrompt = `[DANH TÍNH]: Bạn là Suna AI Workspace Assistant, trợ lý ảo chuyên trách hỗ trợ học tập và phát triển mã nguồn trực quan.
[MỤC TIÊU]: Phân tích, hướng dẫn hoặc chỉnh sửa trực tiếp mã nguồn HTML/CSS/JS hiện tại của người dùng. Trả lời tập trung, rõ ràng và ngắn gọn.
[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:
```html
${currentCode}
```
Nếu người dùng yêu cầu chỉnh sửa hoặc viết lại code, hãy trả về toàn bộ hoặc đoạn mã nguồn mới nằm trong khối code fenced ```html ... ``` để họ có thể nhấn nút "Áp dụng vào Editor" một cách dễ dàng.`;
    ```
  - **Defect**: Line 1926 explicitly permits returning a partial fragment ("hãy trả về toàn bộ hoặc đoạn mã nguồn mới"). In Live Workspace, returning a partial code snippet breaks automated editor/iframe injection (Milestone 5) and overwrites the entire codebase with an unrunnable fragment.

- **Other Prompt Sites in `app.js`**:
  - Main Chat Turn 0 API messages assembly (`buildApiMessages()`, line 6188): Injects `systemPrompt` from `buildSystemPrompt()`.
  - Main Chat Fallback text-only messages (`buildTextOnlyMessages()`, line 5795): Injects `systemPrompt`.
  - Main Chat Continuation Turn prompt (line 6351): `{ role: 'user', content: 'Tiếp tục chính xác từ chỗ vừa dừng mà không lặp lại bất kỳ nội dung nào trước đó:' }`.
  - Workspace Continuation Turn prompt (line 1982): `{ role: 'user', content: 'Tiếp tục chính xác phần mã nguồn đang dang dở từ chỗ bị ngắt, không lặp lại đoạn mã đã tạo.' }`.

---

## 2. Logic Chain

1. **Root Cause Analysis of Code Truncation**:
   - Modern LLMs (GPT-4o, Claude 3.5, Gemini, DeepSeek, Qwen) are trained with RLHF to conserve output tokens and avoid long repetitive code generation by default.
   - Without an explicit, high-priority negative directive (banning placeholders) and an explicit positive mandate (100% unabridged code), LLMs frequently emit shortcuts like `// ... rest of code unchanged ...` or `/* TODO: implement methods */`.
2. **Impact on Live Workspace Live Sync (Milestone 5)**:
   - When Live Workspace Auto-Sync is enabled, `autoApplyWorkspaceCode()` takes the extracted code block from the assistant's reply and injects it directly into `#artifact-editor-textarea` and `#artifact-iframe.srcdoc`.
   - If the LLM generates a partial snippet or placeholder comments, the user's workspace is corrupted with incomplete code.
3. **Synergy with Multi-Turn Continuation Chaining (Milestones 2 & 3)**:
   - The system prompt must reassure the model that token length is not a constraint (since the multi-turn engine will automatically chain across turns), thereby encouraging full, comprehensive implementations.
4. **Concrete Prompt Design Principles**:
   - **Explicit Blacklist**: Enumerate banned placeholder tokens (`// ...`, `/* TODO */`, `/* unchanged */`, `<!-- ... rest of code ... -->`, `// keep existing`, etc.).
   - **Unabridged Mandate**: Require 100% self-contained runnable code from `<!DOCTYPE html>` to `</html>`.
   - **Dual Coverage**: Apply to both Main Chat (`buildSystemPrompt`) and Live Workspace Assistant (`sendWorkspaceMessage`).

---

## 3. Caveats
- System prompts guide LLM behavior with high probability (~98-99%), but deterministic safety requires the downstream Multi-Tier Truncation Detector (Milestone 2) and Boundary Stitcher (Milestone 3) to handle any token ceiling cutoffs gracefully.
- Flash mode is intended for fast/concise answers for general queries, but when code generation is explicitly requested in Flash mode, the anti-placeholder rule must still ensure that returned code blocks are complete and runnable.

---

## 4. Conclusion & Proposed Implementation Strategy

### A. Modifications in `buildSystemPrompt()` (`app.js`)
Add a dedicated, authoritative Anti-Placeholder directive block in `buildSystemPrompt()` and refine the Live Workspace section:

```javascript
// Add into buildSystemPrompt() parts array:
parts.push(`[QUY TẮC MÃ NGUỒN & NỘI DUNG TOÀN DIỆN - 100% UNABRIDGED & ANTI-PLACEHOLDER]:
1. [TUYỆT ĐỐI CẤM PLACEHOLDER & RÚT GỌN]: Nghiêm cấm hoàn toàn việc sử dụng bất kỳ dạng chú thích rút gọn, placeholder hoặc cắt bớt mã nguồn/nội dung. Các mẫu sau đây là VI PHẠM NGHIÊM TRỌNG:
   - Trong code: "// ...", "// ... rest of code here ...", "// ... existing code ...", "/* TODO */", "/* unchanged */", "<!-- ... rest of code ... -->", "/* keep existing styles */", "// implement here", "// tương tự như trên", "// phần còn lại giữ nguyên", "// continue pattern", bare "..."
   - Trong văn bản: "để cho ngắn gọn", "phần còn lại tương tự", "bạn có thể tự làm tiếp", "và cứ thế tiếp tục"...
2. [100% HOÀN CHỈNH & SẴN SÀNG THỰC THI]: Mọi đoạn code, hàm, component, biến, thuật toán hoặc file được yêu cầu phải được viết ĐẦY ĐỦ 100%, chi tiết từ đầu đến cuối mà không được lược bỏ bất kỳ dòng nào.
3. [TỰ DO TỐI ĐA VỀ ĐỘ DÀI TOKEN]: Hệ thống hỗ trợ Động cơ Ghép chuỗi Đa tầng Tự động (Multi-Turn Continuation Chaining). Không bao giờ nén hay cắt bớt mã nguồn; luôn xuất ra toàn bộ mã nguồn trọn vẹn ở chất lượng cao nhất.`);
```

Update item 2 in `[ĐỊNH DẠNG ĐẶC BIỆT]`:
```javascript
// In [ĐỊNH DẠNG ĐẶC BIỆT]:
`2. [Giao diện/Live Workspace]: Nếu yêu cầu thiết kế giao diện web, vẽ SVG, hoặc lập trình Front-end (HTML/CSS/JS), hãy trả về MỘT khối ```html ... ``` HOẶC ```svg ... ``` duy nhất, bao gồm ĐẦY ĐỦ 100% mã HTML, CSS và JS bên trong (không dùng thư viện ngoài bị chặn, không lược bỏ code bằng placeholder) để có thể chạy được trực tiếp trên Live Preview.`
```

### B. Modifications in `sendWorkspaceMessage()` (`app.js`, lines 1920–1926)
Replace the system prompt definition with:

```javascript
const systemPrompt = `[DANH TÍNH]: Bạn là Suna AI Workspace Assistant, trợ lý ảo chuyên trách hỗ trợ học tập và phát triển mã nguồn trực quan.
[MỤC TIÊU]: Phân tích, hướng dẫn hoặc chỉnh sửa trực tiếp mã nguồn HTML/CSS/JS hiện tại của người dùng.
[QUY TẮC BẮT BUỘC VỀ MÃ NGUỒN - 100% TOÀN VẸN & KHÔNG PLACEHOLDER]:
1. Khi người dùng yêu cầu tạo mới, chỉnh sửa, bổ sung hoặc sửa lỗi code, bạn BẮT BUỘC phải trả về TOÀN BỘ file HTML/CSS/JS hoàn chỉnh 100% (bao gồm <!DOCTYPE html>, <html>, <head>, <style>, <body>, <script>) nằm trong MỘT khối code fenced duy nhất ```html ... ```.
2. TUYỆT ĐỐI CẤM sử dụng bất kỳ chú thích rút gọn, placeholder hoặc cắt bớt code nào (như "// ... rest of code here ...", "/* TODO */", "/* unchanged */", "<!-- ... existing code ... -->", "// giữ nguyên phần cũ"). Mọi dòng mã nguồn cũ và mới đều phải được viết ra đầy đủ, vì mã nguồn này sẽ được tự động đồng bộ trực tiếp vào Live Editor và Live Preview Iframe.
[MÃ NGUỒN HIỆN TẠI TRONG EDITOR]:
```html
${currentCode}
````;
```

---

## 5. Verification Method

1. **Syntax Verification**:
   - `node -c app.js && node -c redesign.js` (Must exit code 0).
2. **Prompt Inspection Unit Test**:
   - Execute a Node.js harness evaluating `buildSystemPrompt()` output to confirm presence of anti-placeholder directives and absence of permissive fragment clauses.
3. **Workspace Prompt Integrity Test**:
   - Verify that the generated workspace `systemPrompt` string contains strict 100% full file mandates and explicitly forbids placeholder tokens (`// ...`, `/* TODO */`, `/* unchanged */`).
4. **Authoritative Project Verification**:
   - `python run_verification.py`
