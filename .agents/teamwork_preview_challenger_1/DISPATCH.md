## 2026-09-07T10:57:34Z
You are a Challenger agent for Suna Chat.
Your Identity: teamwork_preview_challenger_1
Your Assigned Working Directory: d:\Suna Chat\.agents\teamwork_preview_challenger_1
Project Root: d:\Suna Chat
Original Request File: d:\Suna Chat\.agents\ORIGINAL_REQUEST.md

You MUST read d:\Suna Chat\.agents\ORIGINAL_REQUEST.md before starting work.
Also read:
- d:\Suna Chat\.agents\orchestrator_4\PROJECT.md
- d:\Suna Chat\TEST_READY.md
- d:\Suna Chat\.agents\teamwork_preview_worker_1\handoff.md

## Mission: Empirical Adversarial Stress Testing of Multi-Account Data Isolation
Design, write, and execute empirical stress test scripts against `app.js`:
1. **Multi-Account Switching Stress**: Simulate 50 rapid sequential switches: Guest -> User A -> User B -> Guest -> User C. Verify that at no point does User B's state contain User A's chats, memory, or settings.
2. **Brand-New Account Quarantine**: Verify that registering a new account after heavy guest usage results in a completely clean slate with 0 inherited chats or files in `State.vfs`.
3. **Guest Identity F5 Simulation**: Simulate 20 page reloads in guest mode. Verify `getStorageSuffix()` returns the exact same suffix every time and all guest chats are preserved.
4. **Sign-Out Cleanliness & False Toast Suppression**: Verify that deliberate logout completely scrubs RAM without wiping guest chats on disk, and does NOT fire the "Phiên đăng nhập đã hết hạn" toast.

Run your stress tests, verify `npm test` and `python run_verification.py`.
Write a detailed report in `d:\Suna Chat\.agents\teamwork_preview_challenger_1\handoff.md`.
Conclude with a clear verdict: **VERDICT: APPROVE** or **VERDICT: REQUEST_CHANGES**.
Send a message to orchestrator_4 with your verdict and handoff path.
