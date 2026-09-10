# Suna Agent Harness (SunaHarness) — Milestone 1 Technical Strategy
## Sub-Harness Delegation, VFS Workspace Modes & Event Bus (R1)

**Document ID:** SUNA-M1-STRATEGY-01  
**Author:** Explorer M1 1 (`explorer_m1_1`)  
**Target File:** `d:\Suna Chat\suna_harness.js`  
**Reference Baselines:** `ORIGINAL_REQUEST.md`, `PROJECT.md`, `survey_report.md`, `spec_report.md`  
**Date:** 2026-09-07  

---

## 1. Executive Overview & Problem Definition

Milestone 1 implements **Requirement R1 (Multi-Agent Sub-harness Delegation & Hierarchical Coordination)** within `suna_harness.js`. Currently, `HarnessController` (lines 1552–1740) and `createHarness()` (lines 3118–3136) function exclusively as a flat, single-agent execution harness. 

To enable frontier multi-agent capabilities (analogous to OpenHands sub-agents, SWE-agent sub-delegation, and LangGraph hierarchical graphs), M1 establishes:
1. **`HarnessController.prototype.spawnSubHarness({ role, budget, vfsWorkspaceMode, ... })`**: Enables any harness (root or child) to spawn subordinate execution units with autonomous lifecycles, turn/token governance, and role assignments.
2. **Three VFS Workspace Isolation Modes**:
   - `'share'`: Shared memory reference to parent VFS for seamless collaborative updates.
   - `'clone'`: Deep snapshot copy providing total isolation for scratchpad and exploratory tasks.
   - `'branch'`: Deep snapshot copy with an active changeset ledger and origin bookmarking, enabling diff-based merging back into the parent workspace.
3. **`InterHarnessEventBus`**: A bidirectional, structured message broker enabling point-to-point and broadcast communication (`directive`, `progress`, `status_query`, `emergency_stop`, `result`).
4. **Branch Merging (`mergeSubHarness`)**: Conflict-aware synchronization of branched file changes back to the parent VFS with configurable conflict strategies (`overwrite`, `abort_on_conflict`).
5. **Hierarchical Trajectory Stitching**: Dynamic aggregation of child sub-harness reasoning traces into parent trajectory trees (`stitchChildTrajectory` and `getHierarchicalTree`).

---

## 2. Detailed Implementation Strategy: `spawnSubHarness`

### 2.1 Interface & Method Signature

`spawnSubHarness` is mounted directly on `HarnessController.prototype` and forwarded via `createHarness()` instance objects.

```typescript
interface SpawnSubHarnessOptions {
  role?: string;                                  // 'worker' | 'planner' | 'coder' | 'reviewer' | 'auditor' | 'explorer'
  subHarnessId?: string;                          // Unique harness identifier
  id?: string;                                    // Alias for subHarnessId
  budget?: {
    maxTurns?: number;                            // Child turn budget (default: 10)
    maxTokens?: number;                           // Child token ceiling (default: 25000)
    timeoutMs?: number;                           // Child execution timeout (default: 30000)
  };
  vfsWorkspaceMode?: 'share' | 'clone' | 'branch';// Default: 'share'
  readOnly?: boolean;                             // Default: false (or inherited from parent)
  metadata?: Record<string, any>;                 // Task context, initial directives, etc.
}

interface SubHarnessInstance {
  id: string;
  role: string;
  depth: number;
  parentId: string | null;
  vfs: VfsSandbox;
  controller: HarnessController;
  aci: AciInterface;
  trajectory: TrajectoryEngine;
  bus: InterHarnessEventBus;
  vfsWorkspaceMode: 'share' | 'clone' | 'branch';
  branchState?: VfsBranchState;
  status: 'initialized' | 'running' | 'paused' | 'completed' | 'failed' | 'halted';

  // Public Methods
  executeAction(toolName: string, args: Record<string, any>): Promise<any>;
  sendDirective(directive: string, payload?: any): void;
  requestStatus(): SubHarnessStatusReport;
  emergencyStop(reason?: string): void;
  pause(): void;
  resume(): void;
  mergeBranchToParent(options?: MergeBranchOptions): MergeResult;
  terminate(): void;
}
```

### 2.2 Execution Flow of `spawnSubHarness`

```
+-----------------------------------------------------------------------------------+
| 1. Parameter Validation & Guardrails                                              |
|    - Check if parent is halted -> reject with PARENT_HALTED                       |
|    - Check depth: childDepth = parent.depth + 1. If > 10 -> MAX_RECURSION_EXCEEDED|
|    - Validate vfsWorkspaceMode in ['share', 'clone', 'branch']                    |
|    - Normalize budget (maxTurns >= 1, maxTokens >= 100, timeoutMs >= 100)         |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. VFS Partitioning Initialization                                                |
|    - 'share'  -> childVfs = this.vfs                                              |
|    - 'clone'  -> childVfs = new VfsSandbox(); restoreSnapshot(this.vfs.snapshot())|
|    - 'branch' -> childVfs = this.vfs.branch() [cloned + origin bookmark + ledger] |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. Subsystem Instantiation & Event Bus Binding                                    |
|    - Bus: ensure this.bus exists; child inherits identical this.bus reference     |
|    - Child Trajectory: new TrajectoryEngine({ depth: childDepth, role, agent_id })|
|    - Child Controller: new HarnessController({ depth, role, vfs: childVfs, ... }) |
|    - Child ACI: new AciInterface(childVfs, { controller: childController })       |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. Two-Way Event Bus & Telemetry Wiring                                           |
|    - Child listens on bus for messages targeted to child.id or '*'                |
|    - Child reports token usage up to parent (consumeTokens)                       |
|    - Child reports progress and completion to parent bus                          |
|    - Parent registers child in this.children map                                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 5. Trajectory Recording & Instance Return                                         |
|    - Record 'spawn' step in parent trajectory (with child metadata)               |
|    - Emit 'spawn' event on InterHarnessEventBus                                   |
|    - Return SubHarnessInstance wrapper/controller                                 |
+-----------------------------------------------------------------------------------+
```

---

## 3. VFS Workspace Modes & Interaction with `VfsSandbox`

### 3.1 Mode Comparison Matrix

| Property | `'share'` Mode | `'clone'` Mode | `'branch'` Mode |
| :--- | :--- | :--- | :--- |
| **VFS Instance** | Same instance (`childVfs = parent.vfs`) | Fresh `VfsSandbox` instance | Fresh `VfsSandbox` instance |
| **Data Initialization** | Direct pointer; zero copy overhead | `restoreSnapshot(parent.vfs.createSnapshot())` | `restoreSnapshot(parent.vfs.createSnapshot())` |
| **Origin Snapshot** | None | None | Bookmarked as `_branchOriginSnapshot` |
| **Changeset Tracking** | None (live shared state) | None (isolated scratchpad) | Active `_branchLedger` (added, modified, deleted Sets) |
| **Write Impact on Parent** | Immediate mutation in parent VFS | Zero mutation; completely isolated | Zero mutation until explicit merge |
| **Event Propagation** | Fires on parent VFS listeners | Fires only on child private listeners | Fires only on child private listeners |
| **Merge Capability** | No merge required (already synced) | Cannot merge (scratchpad only) | Full merge via `mergeSubHarness()` |
| **Memory Footprint** | $O(1)$ additional memory | $O(N)$ full file snapshot copy | $O(N)$ copy + delta ledger |
| **Intended Role** | Primary coder / paired developer | Read-only reviewer, syntax checker, tester | Feature branch worker, surgical patcher |

### 3.2 Deep Dive: `'branch'` Mode Implementation on `VfsSandbox`

To provide first-class support for branch isolation, `VfsSandbox` is extended with a native `.branch()` method:

```javascript
VfsSandbox.prototype.branch = function () {
  const branchVfs = new VfsSandbox(this.options);
  const originSnapshot = this.createSnapshot();
  branchVfs.restoreSnapshot(originSnapshot);

  // Origin bookmarking
  branchVfs._branchOriginSnapshot = originSnapshot;
  branchVfs._branchCreatedAt = Date.now();
  branchVfs._branchParentVfs = this;

  // Active changeset ledger
  branchVfs._branchLedger = {
    added: new Set(),
    modified: new Set(),
    deleted: new Set()
  };

  // Attach internal listener to track mutations relative to origin
  branchVfs.on('all', (eventType, path, data) => {
    const norm = branchVfs.normalizePath(path);
    if (!norm) return;

    if (eventType === 'write' || eventType === 'change') {
      if (!originSnapshot.files[norm]) {
        branchVfs._branchLedger.added.add(norm);
        branchVfs._branchLedger.deleted.delete(norm);
      } else {
        branchVfs._branchLedger.modified.add(norm);
      }
    } else if (eventType === 'delete') {
      if (branchVfs._branchLedger.added.has(norm)) {
        branchVfs._branchLedger.added.delete(norm);
      } else if (originSnapshot.files[norm]) {
        branchVfs._branchLedger.deleted.add(norm);
        branchVfs._branchLedger.modified.delete(norm);
      }
    }
  });

  return branchVfs;
};
```

### 3.3 Branch Merging Strategy (`HarnessController.prototype.mergeSubHarness`)

When merging a sub-harness back into the parent VFS:

1. **Locate Target**: Accepts `childHarness` instance or `childId` string from `this.children`.
2. **Mode Validation**:
   - If `'share'`: returns `{ success: true, message: 'VFS shared; already synchronized.', mergedFiles: [] }`.
   - If `'clone'`: throws `HarnessError('INVALID_MERGE_TARGET', 'Cannot merge a clone-mode sub-harness.')`.
3. **Snapshot Difference Computation**:
   - `originSnapshot = child.vfs._branchOriginSnapshot || child._branchOriginSnapshot;`
   - `childSnapshot = child.vfs.createSnapshot();`
   - `parentSnapshot = this.vfs.createSnapshot();`
4. **Conflict Detection**:
   A file is in conflict if:
   - Modified in branch (`childSnapshot.files[path].content !== originSnapshot.files[path].content`) **AND** modified in parent (`parentSnapshot.files[path] && parentSnapshot.files[path].content !== originSnapshot.files[path].content`).
   - Deleted in branch **AND** modified in parent.
   - Modified in branch **AND** deleted in parent.
5. **Conflict Resolution Strategies**:
   - `strategy: 'overwrite'` (default): Child branch content wins (`theirs`). Parent VFS writes child's content.
   - `strategy: 'abort_on_conflict'`: Aborts immediately without modifying parent VFS. Returns `{ success: false, error: 'Merge conflict detected', conflicts: [...] }`.
6. **Apply Changes to Parent VFS**:
   - Added files: `this.vfs.writeFile(path, childSnapshot.files[path].content);`
   - Modified files: `this.vfs.writeFile(path, childSnapshot.files[path].content);`
   - Deleted files: `if (this.vfs.exists(path)) this.vfs.removeFile(path);`
7. **Telemetry & Event Bus Notification**:
   - Dispatches `'result'` message with merge details on `InterHarnessEventBus`.
   - Logs `'merge'` event in parent trajectory.
   - Returns `{ success: true, mergedFiles: [...], conflicts: [] }`.

---

## 4. `InterHarnessEventBus` Architecture & Protocol

### 4.1 Class Structure & Methods

```javascript
class InterHarnessEventBus {
  constructor() {
    this.subscribers = new Map(); // harnessId -> Set<Function>
    this.history = [];            // Array<BusMessage>
    this.maxHistory = 1000;
  }

  subscribe(harnessId, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!this.subscribers.has(harnessId)) {
      this.subscribers.set(harnessId, new Set());
    }
    this.subscribers.get(harnessId).add(callback);
    return () => this.unsubscribe(harnessId, callback);
  }

  unsubscribe(harnessId, callback) {
    const set = this.subscribers.get(harnessId);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(harnessId);
    }
  }

  send(message = {}) {
    const envelope = {
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from: message.from || 'anonymous',
      to: message.to || '*',
      type: message.type || 'message',
      payload: message.payload || {},
      timestamp: new Date().toISOString(),
      epoch_ms: Date.now()
    };

    this.history.push(envelope);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Deliver to targeted subscribers
    if (envelope.to === '*') {
      this.subscribers.forEach((callbacks, recipientId) => {
        if (recipientId !== envelope.from) {
          callbacks.forEach(cb => {
            try { cb(envelope); } catch (err) { console.error(`[EventBus] Delivery error to ${recipientId}:`, err); }
          });
        }
      });
    } else {
      const directSubs = this.subscribers.get(envelope.to);
      if (directSubs) {
        directSubs.forEach(cb => {
          try { cb(envelope); } catch (err) { console.error(`[EventBus] Direct delivery error to ${envelope.to}:`, err); }
        });
      }
      // Also notify any global wildcard listeners registered on '*'
      const wildcardSubs = this.subscribers.get('*');
      if (wildcardSubs) {
        wildcardSubs.forEach(cb => {
          try { cb(envelope); } catch (err) { console.error('[EventBus] Wildcard delivery error:', err); }
        });
      }
    }

    return envelope;
  }

  broadcast(from, type, payload) {
    return this.send({ from, to: '*', type, payload });
  }

  getHistory(filter = {}) {
    return this.history.filter(msg => {
      if (filter.from && msg.from !== filter.from) return false;
      if (filter.to && msg.to !== filter.to && msg.to !== '*') return false;
      if (filter.type && msg.type !== filter.type) return false;
      return true;
    });
  }

  clear() {
    this.subscribers.clear();
    this.history = [];
  }
}
```

### 4.2 Standard Event Types & Payloads

1. **`directive`** (Parent $\to$ Child): Next instructions or tasks.
   `payload: { instruction: string, priority?: string, context?: any }`
2. **`status_query`** (Parent $\to$ Child): Request turn, token, and health report.
   `payload: { requestTimestamp: number }`
3. **`emergency_stop`** (Parent $\to$ Child): Halt execution immediately.
   `payload: { reason: string, immediate: true }`
4. **`progress`** (Child $\to$ Parent): Heartbeat, active tool, turn metrics.
   `payload: { currentTurn: number, maxTurns: number, tokensConsumed: number, activeTool: string, percentEstimate?: number }`
5. **`assistance_request`** (Child $\to$ Parent): Escalation when facing repeated failures or unknown errors.
   `payload: { errorCategory: string, message: string, attempts: number }`
6. **`result` / `completed`** (Child $\to$ Parent): Final output and modified files.
   `payload: { success: boolean, summary: string, turnsUsed: number, tokensUsed: number, modifiedFiles: string[] }`
7. **`failed`** (Child $\to$ Parent): Unrecoverable failure report.
   `payload: { error: string, code: string, turnsUsed: number }`

---

## 5. Concrete Code Structure for `HarnessController` in `suna_harness.js`

### 5.1 Constructor Additions (Lines 1552–1567)

```javascript
class HarnessController {
  constructor(options = {}) {
    // Identity & Hierarchy
    this.id = options.id || options.subHarnessId || 'harness_root';
    this.role = options.role || 'root';
    this.depth = typeof options.depth === 'number' ? options.depth : 0;
    this.parentId = options.parentId || null;
    this.parentController = options.parentController || null;
    this.children = new Map(); // childId -> SubHarnessInstance / HarnessController

    // Infrastructure & Sandboxing
    this.vfs = options.vfs || new VfsSandbox();
    this.aci = options.aci || new AciInterface(this.vfs, { controller: this });
    this.bus = options.bus || (this.parentController ? this.parentController.bus : new InterHarnessEventBus());
    this.trajectory = options.trajectory || (this.parentController ? this.parentController.trajectory : null);
    this.vfsWorkspaceMode = options.vfsWorkspaceMode || 'share';

    // Budgets & Limits
    this.maxTurns = options.maxTurns || 15;
    this.maxTokens = options.maxTokens || 50000;
    this.timeoutMs = options.timeoutMs || 60000;
    this.readOnly = Boolean(options.readOnly);
    this.metadata = options.metadata || {};

    // Execution State
    this.turnsCompleted = 0;
    this.tokensConsumed = 0;
    this.startTime = Date.now();
    this.isHalted = false;
    this.isPaused = false;
    this.haltReason = null;
    this.haltDetails = null;
    this.status = 'initialized'; // 'initialized' | 'running' | 'paused' | 'completed' | 'failed' | 'halted'
    this.listeners = new Map();

    // Wire up event bus listener for this harness
    this._busUnsubscribe = this.bus.subscribe(this.id, (msg) => this._handleBusMessage(msg));
  }
```

### 5.2 Bus Message Handler & Dispatch

```javascript
  _handleBusMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'emergency_stop':
        this.halt('EMERGENCY_STOP_BY_PARENT', msg.payload || {});
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'status_query':
        this.bus.send({
          from: this.id,
          to: msg.from,
          type: 'progress',
          payload: this.requestStatus()
        });
        break;
      default:
        this.emit('message', msg);
        break;
    }
  }
```

### 5.3 `spawnSubHarness` Method Implementation

```javascript
  spawnSubHarness(options = {}) {
    if (this.isHalted) {
      throw new HarnessError('PARENT_HALTED', `Cannot spawn sub-harness: Parent harness is halted (${this.haltReason}).`);
    }

    const childDepth = this.depth + 1;
    if (childDepth > 10) {
      throw new HarnessError('MAX_RECURSION_DEPTH_EXCEEDED', `Cannot spawn sub-harness: Maximum recursion depth of 10 exceeded.`);
    }

    const role = options.role || 'worker';
    const subHarnessId = options.id || options.subHarnessId || `sub_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const vfsMode = options.vfsWorkspaceMode || 'share';

    if (!['share', 'clone', 'branch'].includes(vfsMode)) {
      throw new HarnessError('INVALID_WORKSPACE_MODE', `Unknown vfsWorkspaceMode "${vfsMode}". Must be 'share', 'clone', or 'branch'.`);
    }

    const rawBudget = options.budget || {};
    if (rawBudget.maxTurns !== undefined && rawBudget.maxTurns <= 0) {
      throw new HarnessError('INVALID_BUDGET', 'maxTurns must be greater than 0.');
    }
    if (rawBudget.maxTokens !== undefined && rawBudget.maxTokens <= 0) {
      throw new HarnessError('INVALID_BUDGET', 'maxTokens must be greater than 0.');
    }

    const childBudget = {
      maxTurns: rawBudget.maxTurns || 10,
      maxTokens: rawBudget.maxTokens || 25000,
      timeoutMs: rawBudget.timeoutMs || 30000
    };

    // 1. Setup VFS per mode
    let childVfs;
    if (vfsMode === 'share') {
      childVfs = this.vfs;
    } else if (vfsMode === 'clone') {
      childVfs = new VfsSandbox(this.vfs.options);
      childVfs.restoreSnapshot(this.vfs.createSnapshot());
    } else if (vfsMode === 'branch') {
      if (typeof this.vfs.branch === 'function') {
        childVfs = this.vfs.branch();
      } else {
        childVfs = new VfsSandbox(this.vfs.options);
        const originSnapshot = this.vfs.createSnapshot();
        childVfs.restoreSnapshot(originSnapshot);
        childVfs._branchOriginSnapshot = originSnapshot;
        childVfs._branchParentVfs = this.vfs;
      }
    }

    // 2. Setup Trajectory for child
    const childTrajectory = new TrajectoryEngine();

    // 3. Instantiate Child Controller
    const childController = new HarnessController({
      id: subHarnessId,
      role: role,
      depth: childDepth,
      parentId: this.id,
      parentController: this,
      vfs: childVfs,
      bus: this.bus,
      trajectory: childTrajectory,
      maxTurns: childBudget.maxTurns,
      maxTokens: childBudget.maxTokens,
      timeoutMs: childBudget.timeoutMs,
      readOnly: this.readOnly || Boolean(options.readOnly),
      vfsWorkspaceMode: vfsMode,
      metadata: options.metadata || {}
    });

    const childAci = new AciInterface(childVfs, { controller: childController });
    childController.aci = childAci;

    // 4. Token telemetry coupling: report consumed tokens to parent
    childController.on('tokens', (tokens) => {
      this.consumeTokens(tokens);
    });

    // 5. Construct SubHarnessInstance facade
    const subHarness = {
      id: subHarnessId,
      role,
      depth: childDepth,
      parentId: this.id,
      vfs: childVfs,
      controller: childController,
      aci: childAci,
      trajectory: childTrajectory,
      bus: this.bus,
      vfsWorkspaceMode: vfsMode,
      metadata: options.metadata || {},
      get status() { return childController.status; },

      executeAction: (toolName, args) => childController.executeAction(toolName, args),
      sendDirective: (directive, payload) => {
        this.bus.send({
          from: this.id,
          to: subHarnessId,
          type: 'directive',
          payload: { directive, ...(payload || {}) }
        });
      },
      requestStatus: () => childController.requestStatus(),
      emergencyStop: (reason) => this.emergencyStopSubHarness(subHarnessId, reason),
      pause: () => childController.pause(),
      resume: () => childController.resume(),
      mergeBranchToParent: (mergeOpts) => this.mergeSubHarness(subHarnessId, mergeOpts),
      terminate: () => childController.terminate()
    };

    // Store in parent's children registry
    this.children.set(subHarnessId, subHarness);

    // Record spawn event in parent trajectory
    if (this.trajectory && typeof this.trajectory.recordStep === 'function') {
      this.trajectory.recordStep({
        thought: `[Multi-Agent Delegation] Spawned sub-harness "${subHarnessId}" (Role: ${role}, Mode: ${vfsMode}, Depth: ${childDepth})`,
        action: {
          tool: 'spawnSubHarness',
          params: { role, budget: childBudget, vfsWorkspaceMode: vfsMode, subHarnessId }
        },
        observation: { status: 'success', result: { subHarnessId, role, vfsMode } },
        agent_id: this.id,
        role: this.role,
        depth: this.depth
      });
    }

    this.emit('spawn', subHarness);
    return subHarness;
  }
```

### 5.4 `mergeSubHarness` Method Implementation

```javascript
  mergeSubHarness(childHarnessOrId, options = {}) {
    const child = typeof childHarnessOrId === 'string'
      ? this.children.get(childHarnessOrId)
      : childHarnessOrId;

    if (!child) {
      throw new HarnessError('SUB_HARNESS_NOT_FOUND', `Sub-harness not found: ${childHarnessOrId}`);
    }

    if (child.vfsWorkspaceMode === 'share') {
      return {
        success: true,
        strategy: options.strategy || 'overwrite',
        mergedFiles: [],
        conflicts: [],
        message: 'VFS workspace was shared; modifications are already reflected in parent.'
      };
    }

    if (child.vfsWorkspaceMode === 'clone') {
      throw new HarnessError('INVALID_MERGE_TARGET', `Cannot merge clone-mode sub-harness "${child.id}". Clone mode is isolated scratchpad.`);
    }

    const strategy = options.strategy || 'overwrite';
    const originSnap = child.vfs._branchOriginSnapshot || (child.branchState && child.branchState.originSnapshot);
    const childSnap = child.vfs.createSnapshot();
    const parentSnap = this.vfs.createSnapshot();

    const originFiles = (originSnap && originSnap.files) || {};
    const childFiles = childSnap.files || {};
    const parentFiles = parentSnap.files || {};

    // 1. Identify child changeset
    const childChanges = { added: [], modified: [], deleted: [] };
    for (const [p, node] of Object.entries(childFiles)) {
      if (!originFiles[p]) {
        childChanges.added.push(p);
      } else if (originFiles[p].content !== node.content) {
        childChanges.modified.push(p);
      }
    }
    for (const p of Object.keys(originFiles)) {
      if (!childFiles[p]) {
        childChanges.deleted.push(p);
      }
    }

    // 2. Identify parent modifications since branch
    const conflicts = [];
    for (const p of [...childChanges.modified, ...childChanges.deleted]) {
      if (parentFiles[p] && originFiles[p] && parentFiles[p].content !== originFiles[p].content) {
        conflicts.push({
          path: p,
          type: 'content_conflict',
          parentContent: parentFiles[p].content,
          childContent: childFiles[p] ? childFiles[p].content : null,
          baseContent: originFiles[p].content
        });
      }
    }

    if (conflicts.length > 0 && strategy === 'abort_on_conflict') {
      return {
        success: false,
        error: `Merge aborted due to ${conflicts.length} conflict(s).`,
        conflicts,
        mergedFiles: []
      };
    }

    // 3. Apply changes to Parent VFS
    const mergedFiles = [];
    for (const p of childChanges.added) {
      this.vfs.writeFile(p, childFiles[p].content);
      mergedFiles.push(p);
    }
    for (const p of childChanges.modified) {
      this.vfs.writeFile(p, childFiles[p].content);
      mergedFiles.push(p);
    }
    for (const p of childChanges.deleted) {
      if (this.vfs.exists(p)) {
        this.vfs.removeFile(p);
      }
      mergedFiles.push(p);
    }

    // 4. Stitch child trajectory into parent
    if (this.trajectory && child.trajectory && typeof this.trajectory.stitchChildTrajectory === 'function') {
      this.trajectory.stitchChildTrajectory(child.id, child.trajectory);
    }

    // 5. Notify event bus
    this.bus.send({
      from: this.id,
      to: child.id,
      type: 'result',
      payload: { merged: true, mergedFiles, conflicts }
    });

    return {
      success: true,
      strategy,
      mergedFiles,
      conflicts
    };
  }
```

### 5.5 `emergencyStopSubHarness` Method Implementation

```javascript
  emergencyStopSubHarness(childHarnessOrId, reason = 'Emergency stop by parent') {
    const child = typeof childHarnessOrId === 'string'
      ? this.children.get(childHarnessOrId)
      : childHarnessOrId;

    if (!child) {
      throw new HarnessError('SUB_HARNESS_NOT_FOUND', `Sub-harness not found: ${childHarnessOrId}`);
    }

    // 1. Broadcast emergency stop message on bus
    this.bus.send({
      from: this.id,
      to: child.id,
      type: 'emergency_stop',
      payload: { reason, timestamp: Date.now() }
    });

    // 2. Halt child controller
    if (child.controller && typeof child.controller.halt === 'function') {
      child.controller.halt('EMERGENCY_STOP_BY_PARENT', { reason });
    }

    // 3. Halt all grandchildren recursively
    if (child.controller && child.controller.children) {
      child.controller.children.forEach(grandchild => {
        child.controller.emergencyStopSubHarness(grandchild.id, reason);
      });
    }

    this.emit('emergency_stop', { childId: child.id, reason });
    return true;
  }
```

### 5.6 Lifecycle Cleanup & Termination

```javascript
  pause() {
    this.isPaused = true;
    this.status = 'paused';
    this.emit('pause');
  }

  resume() {
    this.isPaused = false;
    this.status = 'running';
    this.emit('resume');
  }

  requestStatus() {
    return {
      id: this.id,
      role: this.role,
      depth: this.depth,
      status: this.status,
      turnsCompleted: this.turnsCompleted,
      maxTurns: this.maxTurns,
      tokensConsumed: this.tokensConsumed,
      maxTokens: this.maxTokens,
      isHalted: this.isHalted,
      haltReason: this.haltReason,
      childCount: this.children.size,
      vfsWorkspaceMode: this.vfsWorkspaceMode
    };
  }

  terminate() {
    this.status = 'completed';
    if (typeof this._busUnsubscribe === 'function') {
      this._busUnsubscribe();
    }
    // Terminate all child sub-harnesses recursively
    this.children.forEach(child => {
      if (child.terminate) child.terminate();
    });
    this.children.clear();
    this.listeners.clear();
  }
```

---

## 6. Hierarchical Trajectory Stitching (`TrajectoryEngine`)

In `TrajectoryEngine` (lines 1745–1873):

### 6.1 Extended `recordStep` Fields

Update `recordStep(stepData)` to preserve hierarchy and depth metadata:

```javascript
  recordStep(stepData) {
    const now = Date.now();
    const stepIdx = stepData.step !== undefined ? stepData.step : (stepData.step_index || this.events.length + 1);

    const rawEvent = {
      id: stepData.id || `evt_step_${stepIdx}_${now}`,
      step_index: stepIdx,
      step: stepIdx,
      timestamp: new Date(now).toISOString(),
      epoch_ms: now,
      agent_id: stepData.agent_id || stepData.agentId || 'root',
      role: stepData.role || 'parent',
      depth: typeof stepData.depth === 'number' ? stepData.depth : 0,
      parent_step_id: stepData.parent_step_id || null,
      thought: stepData.thought || '',
      action: stepData.action || { tool: 'unknown', params: {} },
      observation: stepData.observation || { status: 'success', result: null },
      metrics: Object.assign({
        duration_ms: (stepData.metrics && (stepData.metrics.duration_ms || stepData.metrics.durationMs)) || 0,
        durationMs: (stepData.metrics && (stepData.metrics.durationMs || stepData.metrics.duration_ms)) || 0,
        tokensConsumed: (stepData.metrics && stepData.metrics.tokensConsumed) || 0,
        tokenUsage: { total: (stepData.metrics && stepData.metrics.tokensConsumed) || 0 }
      }, stepData.metrics || {}),
      status: stepData.status || 'success',
      children: Array.isArray(stepData.children) ? stepData.children : []
    };

    const event = makeImmutableEvent(rawEvent);
    this.events.push(event);
    this.listeners.forEach(fn => { try { fn(event); } catch (e) {} });
    return event;
  }
```

### 6.2 `stitchChildTrajectory` and `getHierarchicalTree`

```javascript
  stitchChildTrajectory(subHarnessId, childTrajectoryOrEvents, options = {}) {
    const childEvents = Array.isArray(childTrajectoryOrEvents)
      ? childTrajectoryOrEvents
      : (childTrajectoryOrEvents && typeof childTrajectoryOrEvents.getEvents === 'function'
          ? childTrajectoryOrEvents.getEvents()
          : []);

    if (childEvents.length === 0) return;

    // Find parent spawn step for this subHarnessId
    const spawnStep = this.events.slice().reverse().find(e =>
      e.action && e.action.tool === 'spawnSubHarness' &&
      e.action.params && (e.action.params.subHarnessId === subHarnessId || e.action.params.id === subHarnessId)
    );

    if (spawnStep && !spawnStep.children) {
      spawnStep.children = [];
    }

    childEvents.forEach(evt => {
      const clonedEvt = Object.assign({}, evt, {
        parent_step_id: spawnStep ? spawnStep.id : null
      });
      if (spawnStep) {
        spawnStep.children.push(clonedEvt);
      }
    });

    return this.events;
  }

  getHierarchicalTree() {
    return this.events.map(event => {
      const node = Object.assign({}, event);
      if (node.children && node.children.length > 0) {
        node.children = node.children.map(child => Object.assign({}, child));
      }
      return node;
    });
  }
```

---

## 7. Integration with `createHarness()` Facade

In `suna_harness.js` around line 3118:

```javascript
  createHarness(options = {}) {
    const vfs = options.vfs || new VfsSandbox(options.vfsOptions);
    const bus = options.bus || new InterHarnessEventBus();
    const trajectory = options.trajectory || new TrajectoryEngine();
    const controller = options.controller || new HarnessController(Object.assign({
      vfs,
      bus,
      trajectory
    }, options.controllerOptions));
    const aci = options.aci || new AciInterface(vfs, Object.assign({ controller }, options.aciOptions));
    const checkpoint = options.checkpoint || new CheckpointManager(vfs, options.memoryStore);
    const chaos = options.chaos || new ChaosFaultInjector();
    const guardrails = options.guardrails || new RunawayGuardrails(options.guardrailOptions);

    return {
      vfs,
      controller,
      aci,
      trajectory,
      bus,
      checkpoint,
      chaos,
      guardrails,

      // Delegated Sub-Harness Operations
      spawnSubHarness: (opts) => controller.spawnSubHarness(opts),
      mergeSubHarness: (child, opts) => controller.mergeSubHarness(child, opts),
      emergencyStopSubHarness: (childId, reason) => controller.emergencyStopSubHarness(childId, reason),
      getChild: (childId) => controller.getChild(childId),
      getChildren: () => controller.getChildren()
    };
  }
```

And expose `InterHarnessEventBus` in root export (line 3095):
```javascript
  const SunaHarness = {
    VfsSandbox,
    AciInterface,
    HarnessController,
    InterHarnessEventBus,
    EventBus: InterHarnessEventBus,
    // ... other exports
  };
```

---

## 8. Verification Strategy & Test Matrix for M1

| Test ID | Test Category | Target Assertion |
| :--- | :--- | :--- |
| **M1-TEST-01** | `spawnSubHarness` default | Spawns child sub-harness with role `'worker'`, depth 1, parentId `'harness_root'`, status `'initialized'`. |
| **M1-TEST-02** | VFS `'share'` mode | Child writing to `shared.txt` immediately updates `parent.vfs.readFile('shared.txt')`. |
| **M1-TEST-03** | VFS `'clone'` mode | Child writing to `clone.txt` is completely isolated; `parent.vfs.exists('clone.txt')` returns `false`. |
| **M1-TEST-04** | VFS `'branch'` mode | Child operates on branch; modifications staged until `parent.mergeSubHarness(child)` is called. |
| **M1-TEST-05** | Branch conflict abort | Both parent and child modify `config.json`; `mergeSubHarness({ strategy: 'abort_on_conflict' })` aborts with `conflicts`. |
| **M1-TEST-06** | Branch overwrite merge | `mergeSubHarness({ strategy: 'overwrite' })` applies child's modifications over parent's. |
| **M1-TEST-07** | Event Bus direct messaging | Parent sends directive to child; child receives message via its registered subscriber callback. |
| **M1-TEST-08** | Emergency Stop | Parent calls `emergencyStopSubHarness(childId)`; child halts immediately, preventing subsequent actions. |
| **M1-TEST-09** | Deep Nesting ($\ge 5$) | Spawns chain Child 1 $\to$ Child 2 $\to$ Child 3 $\to$ Child 4 $\to$ Child 5; verifies depths 1..5 and recursion guard at >10. |
| **M1-TEST-10** | Trajectory Tree Stitching | Child steps are stitched into parent's `getHierarchicalTree()` under the parent spawn step. |

---

*Certified by `explorer_m1_1` for handoff to M1 Implementer / Test Writer.*
