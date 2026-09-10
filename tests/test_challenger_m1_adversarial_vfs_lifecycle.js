'use strict';

/**
 * tests/test_challenger_m1_adversarial_vfs_lifecycle.js
 * 
 * EMPIRICAL ADVERSARIAL STRESS HARNESS — Milestone 1 (R1)
 * Challenger Agent: challenger_m1_1
 * 
 * Verifies and stress-tests:
 * 1. Sub-harness VFS workspace isolation modes: 'share', 'clone', 'branch'
 * 2. 3-way merge engine (mergeSubHarness):
 *    - Clean merges (disjoint edits, identical additions, unilateral edits/deletes)
 *    - All 4 conflict classes:
 *      * modify/modify conflict
 *      * modify/delete conflict
 *      * delete/modify conflict
 *      * add/add conflict
 *    - Strategy behavior: safe (aborts with unpolluted parent VFS) vs force (overwrites)
 *    - Double merge prevention (ALREADY_MERGED)
 * 3. Recursion guard (depth >= 5 -> MAX_RECURSION_DEPTH_EXCEEDED) & custom maxDepth
 * 4. Delegation cycle guard (DELEGATION_CYCLE_DETECTED for self and all lineage ancestors)
 * 5. Hostile boundary conditions (budget exhaustion, tampered snapshots, halted cascades)
 */

const assert = require('assert');
const path = require('path');
const SunaHarness = require(path.resolve(__dirname, '../suna_harness.js'));

describe('Challenger M1: Adversarial VFS Workspace Isolation & Sub-harness Lifecycle', function() {
  this.timeout(20000);

  const { VfsSandbox, HarnessController, InterHarnessEventBus, TrajectoryEngine, HarnessError } = SunaHarness;

  // =========================================================================
  // SECTION 1: VFS WORKSPACE MODES ('share', 'clone', 'branch')
  // =========================================================================
  describe('1. VFS Workspace Isolation Modes', () => {

    it('1.1 SHARE mode: mutations reflect bidirectionally in real-time and merge is rejected', () => {
      const bus = new InterHarnessEventBus();
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('initial.txt', 'parent-initial');

      const parent = new HarnessController({
        id: 'parent_share_test',
        role: 'orchestrator',
        vfs: parentVfs,
        bus
      });

      const childDescriptor = parent.spawnSubHarness({
        id: 'child_share_worker',
        role: 'worker',
        vfsWorkspaceMode: 'share'
      });

      // Assert instance reference equality
      assert.strictEqual(childDescriptor.vfs, parentVfs, 'Share mode must use identical VFS instance');
      assert.strictEqual(childDescriptor.vfsWorkspaceMode, 'share');

      // 1. Child writes file -> immediately visible in parent
      childDescriptor.vfs.writeFile('child_file.txt', 'child-content');
      assert.strictEqual(parentVfs.readFile('child_file.txt'), 'child-content', 'Parent must immediately observe child writes in share mode');

      // 2. Child modifies file -> immediately visible in parent
      childDescriptor.vfs.writeFile('initial.txt', 'mutated-by-child');
      assert.strictEqual(parentVfs.readFile('initial.txt'), 'mutated-by-child', 'Parent must immediately observe child modifications');

      // 3. Parent writes file -> immediately visible in child
      parentVfs.writeFile('parent_file.txt', 'parent-content');
      assert.strictEqual(childDescriptor.vfs.readFile('parent_file.txt'), 'parent-content', 'Child must immediately observe parent writes');

      // 4. Child deletes file -> immediately gone in parent
      childDescriptor.vfs.removeFile('initial.txt');
      assert.strictEqual(parentVfs.exists('initial.txt'), false, 'Deletion in child must immediately reflect in parent');

      // 5. Attempting to merge a 'share' mode sub-harness must throw INVALID_VFS_MODE
      assert.throws(() => {
        parent.mergeSubHarness('child_share_worker');
      }, (err) => {
        assert(err instanceof HarnessError, 'Should be HarnessError');
        assert.strictEqual(err.code, 'INVALID_VFS_MODE');
        assert(err.message.includes('share'));
        return true;
      }, 'Merging share mode harness must be rejected');
    });

    it('1.2 CLONE mode: strictly isolated sandbox with zero mutation leakage and merge is rejected', () => {
      const bus = new InterHarnessEventBus();
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('config.json', '{"env":"prod"}');
      parentVfs.writeFile('seed.txt', 'seed-v1');

      const parent = new HarnessController({
        id: 'parent_clone_test',
        role: 'orchestrator',
        vfs: parentVfs,
        bus
      });

      const childDescriptor = parent.spawnSubHarness({
        id: 'child_clone_worker',
        role: 'worker',
        vfsWorkspaceMode: 'clone'
      });

      // Assert distinct instances
      assert.notStrictEqual(childDescriptor.vfs, parentVfs, 'Clone mode must instantiate isolated VFS');
      assert.strictEqual(childDescriptor.vfsWorkspaceMode, 'clone');

      // Child has snapshot copy initially
      assert.strictEqual(childDescriptor.vfs.readFile('config.json'), '{"env":"prod"}');
      assert.strictEqual(childDescriptor.vfs.readFile('seed.txt'), 'seed-v1');

      // 1. Child mutates files
      childDescriptor.vfs.writeFile('config.json', '{"env":"child_altered"}');
      childDescriptor.vfs.writeFile('child_only.tmp', 'temporary-data');
      childDescriptor.vfs.removeFile('seed.txt');

      // 2. Verify parent VFS is 100% untouched
      assert.strictEqual(parentVfs.readFile('config.json'), '{"env":"prod"}', 'Parent config must NOT leak child changes');
      assert.strictEqual(parentVfs.readFile('seed.txt'), 'seed-v1', 'Parent seed.txt must still exist');
      assert.strictEqual(parentVfs.exists('child_only.tmp'), false, 'Child temporary file must NOT exist in parent');

      // 3. Parent mutates files
      parentVfs.writeFile('parent_new.txt', 'parent-exclusive');
      parentVfs.writeFile('config.json', '{"env":"parent_modified"}');

      // 4. Verify child VFS is 100% unaffected by post-clone parent changes
      assert.strictEqual(childDescriptor.vfs.readFile('config.json'), '{"env":"child_altered"}');
      assert.strictEqual(childDescriptor.vfs.exists('parent_new.txt'), false);

      // 5. Attempting to merge a 'clone' mode sub-harness must throw INVALID_VFS_MODE
      assert.throws(() => {
        parent.mergeSubHarness('child_clone_worker');
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'INVALID_VFS_MODE');
        assert(err.message.includes('clone'));
        return true;
      }, 'Merging clone mode harness must be rejected');
    });

    it('1.3 BRANCH mode: isolated during execution, tracks changes, and cleanly merges to parent', () => {
      const bus = new InterHarnessEventBus();
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('src/app.js', 'const x = 1;');
      parentVfs.writeFile('src/remove_me.js', 'console.log("bye");');

      const parent = new HarnessController({
        id: 'parent_branch_test',
        role: 'orchestrator',
        vfs: parentVfs,
        bus
      });

      const childDescriptor = parent.spawnSubHarness({
        id: 'child_branch_worker',
        role: 'worker',
        vfsWorkspaceMode: 'branch'
      });

      assert.notStrictEqual(childDescriptor.vfs, parentVfs, 'Branch mode must have its own branch VFS instance');
      assert.strictEqual(childDescriptor.vfs._isBranch, true, 'Branch VFS should be marked as branch');
      assert(childDescriptor.vfs._branchOriginSnapshot, 'Must capture branch origin snapshot');

      // Child makes 3 types of changes: modified, added, deleted
      childDescriptor.vfs.writeFile('src/app.js', 'const x = 2; // modified by branch');
      childDescriptor.vfs.writeFile('src/new_feature.js', 'export const feat = true;');
      childDescriptor.vfs.removeFile('src/remove_me.js');

      // Parent must be completely unaffected prior to merge
      assert.strictEqual(parentVfs.readFile('src/app.js'), 'const x = 1;');
      assert.strictEqual(parentVfs.exists('src/remove_me.js'), true);
      assert.strictEqual(parentVfs.exists('src/new_feature.js'), false);

      // Check branch changes
      const changes = childDescriptor.vfs.getBranchChanges();
      assert(changes.added.includes('src/new_feature.js'));
      assert(changes.modified.includes('src/app.js'));
      assert(changes.deleted.includes('src/remove_me.js'));
      assert.strictEqual(changes.totalChanges, 3);

      // Now perform clean merge
      const mergeResult = parent.mergeSubHarness('child_branch_worker');
      assert.strictEqual(mergeResult.success, true);
      assert.strictEqual(mergeResult.conflicts.length, 0);

      // Parent VFS must now reflect all changes
      assert.strictEqual(parentVfs.readFile('src/app.js'), 'const x = 2; // modified by branch');
      assert.strictEqual(parentVfs.readFile('src/new_feature.js'), 'export const feat = true;');
      assert.strictEqual(parentVfs.exists('src/remove_me.js'), false);
      assert.strictEqual(childDescriptor.isMerged, true);
    });

  });

  // =========================================================================
  // SECTION 2: 3-WAY MERGE & ALL 4 CONFLICT CLASSES (SAFE VS FORCE)
  // =========================================================================
  describe('2. mergeSubHarness 3-Way Reconciliation & Conflict Matrix', () => {

    it('2.1 Clean merge with disjoint edits and identical additions', () => {
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('base_parent.txt', 'parent-orig');
      parentVfs.writeFile('base_child.txt', 'child-orig');

      const parent = new HarnessController({ id: 'p_clean', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_clean', role: 'coder', vfsWorkspaceMode: 'branch' });

      // Parent edits base_parent.txt and creates identical_new.txt
      parentVfs.writeFile('base_parent.txt', 'parent-modified-disjoint');
      parentVfs.writeFile('identical_new.txt', 'identical-content');

      // Child edits base_child.txt and creates identical_new.txt with EXACT SAME content
      child.vfs.writeFile('base_child.txt', 'child-modified-disjoint');
      child.vfs.writeFile('identical_new.txt', 'identical-content');
      child.vfs.writeFile('child_only_new.txt', 'child-new');

      const res = parent.mergeSubHarness('c_clean');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.conflicts.length, 0);

      // Verify parent preserves its own edits and acquires child edits
      assert.strictEqual(parentVfs.readFile('base_parent.txt'), 'parent-modified-disjoint');
      assert.strictEqual(parentVfs.readFile('base_child.txt'), 'child-modified-disjoint');
      assert.strictEqual(parentVfs.readFile('identical_new.txt'), 'identical-content');
      assert.strictEqual(parentVfs.readFile('child_only_new.txt'), 'child-new');
    });

    it('2.2 Conflict Class 1: MODIFY / MODIFY conflict (Safe vs Force)', () => {
      // Setup base
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('conflict1.txt', 'base-v1');

      const parent = new HarnessController({ id: 'p_c1', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_c1', role: 'coder', vfsWorkspaceMode: 'branch' });

      // Both modify the file differently
      parentVfs.writeFile('conflict1.txt', 'parent-v2-divergent');
      child.vfs.writeFile('conflict1.txt', 'child-v2-divergent');

      // 1. Safe strategy with throwOnConflict: true (default) -> throws BRANCH_CONFLICT
      assert.throws(() => {
        parent.mergeSubHarness('c_c1', { strategy: 'safe', throwOnConflict: true });
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'modify_modify_conflict');
        return true;
      });

      // Verify parent VFS unpolluted
      assert.strictEqual(parentVfs.readFile('conflict1.txt'), 'parent-v2-divergent');

      // 2. Safe strategy with throwOnConflict: false -> returns failure without throwing
      const safeRes = parent.mergeSubHarness('c_c1', { strategy: 'safe', throwOnConflict: false });
      assert.strictEqual(safeRes.success, false);
      assert.strictEqual(safeRes.conflicts.length, 1);
      assert.strictEqual(safeRes.conflicts[0].type, 'modify_modify_conflict');
      assert.strictEqual(parentVfs.readFile('conflict1.txt'), 'parent-v2-divergent');

      // 3. Force strategy -> overwrites parent with child's version
      const forceRes = parent.mergeSubHarness('c_c1', { strategy: 'force' });
      assert.strictEqual(forceRes.success, true);
      assert.strictEqual(parentVfs.readFile('conflict1.txt'), 'child-v2-divergent');
      assert.strictEqual(child.isMerged, true);
    });

    it('2.3 Conflict Class 2: MODIFY / DELETE conflict (Safe vs Force)', () => {
      // Base file exists, deleted in parent, modified in child
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('service.js', 'original-service-code');

      const parent = new HarnessController({ id: 'p_c2', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_c2', role: 'coder', vfsWorkspaceMode: 'branch' });

      // Parent deletes, child modifies
      parentVfs.removeFile('service.js');
      child.vfs.writeFile('service.js', 'modified-by-child-service-code');

      // 1. Safe strategy
      assert.throws(() => {
        parent.mergeSubHarness('c_c2', { strategy: 'safe' });
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'modify_delete_conflict');
        return true;
      });
      // Parent still has service.js deleted
      assert.strictEqual(parentVfs.exists('service.js'), false);

      // 2. Force strategy -> child modifications override parent deletion
      const forceRes = parent.mergeSubHarness('c_c2', { strategy: 'force' });
      assert.strictEqual(forceRes.success, true);
      assert.strictEqual(parentVfs.exists('service.js'), true);
      assert.strictEqual(parentVfs.readFile('service.js'), 'modified-by-child-service-code');
    });

    it('2.4 Conflict Class 3: DELETE / MODIFY conflict (Safe vs Force)', () => {
      // Base file exists, modified in parent, deleted in child
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('database.js', 'original-database-code');

      const parent = new HarnessController({ id: 'p_c3', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_c3', role: 'coder', vfsWorkspaceMode: 'branch' });

      // Parent modifies, child deletes
      parentVfs.writeFile('database.js', 'parent-upgraded-database');
      child.vfs.removeFile('database.js');

      // 1. Safe strategy
      assert.throws(() => {
        parent.mergeSubHarness('c_c3', { strategy: 'safe' });
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'delete_modify_conflict');
        return true;
      });
      // Parent retains upgraded database
      assert.strictEqual(parentVfs.readFile('database.js'), 'parent-upgraded-database');

      // 2. Force strategy -> child deletion overrides parent modification
      const forceRes = parent.mergeSubHarness('c_c3', { strategy: 'force' });
      assert.strictEqual(forceRes.success, true);
      assert.strictEqual(parentVfs.exists('database.js'), false, 'Force merge must delete file in parent');
    });

    it('2.5 Conflict Class 4: ADD / ADD conflict (Safe vs Force)', () => {
      // Base file does NOT exist, both parent and child create it with conflicting content
      const parentVfs = new VfsSandbox();
      const parent = new HarnessController({ id: 'p_c4', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_c4', role: 'coder', vfsWorkspaceMode: 'branch' });

      parentVfs.writeFile('new_module.js', 'export const mode = "production";');
      child.vfs.writeFile('new_module.js', 'export const mode = "development";');

      // 1. Safe strategy
      assert.throws(() => {
        parent.mergeSubHarness('c_c4', { strategy: 'safe' });
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        assert.strictEqual(err.details.conflicts[0].type, 'add_add_conflict');
        return true;
      });
      // Parent retains production
      assert.strictEqual(parentVfs.readFile('new_module.js'), 'export const mode = "production";');

      // 2. Force strategy -> child version overwrites
      const forceRes = parent.mergeSubHarness('c_c4', { strategy: 'force' });
      assert.strictEqual(forceRes.success, true);
      assert.strictEqual(parentVfs.readFile('new_module.js'), 'export const mode = "development";');
    });

    it('2.6 Atomic Rollback: Multiple mixed files with 1 conflict must abort cleanly under safe strategy', () => {
      const parentVfs = new VfsSandbox();
      parentVfs.writeFile('clean_mod.txt', 'clean-base');
      parentVfs.writeFile('conflict_file.txt', 'conflict-base');

      const parent = new HarnessController({ id: 'p_atomic', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_atomic', role: 'coder', vfsWorkspaceMode: 'branch' });

      // Non-conflicting edits
      child.vfs.writeFile('clean_mod.txt', 'child-clean-mod');
      child.vfs.writeFile('child_clean_add.txt', 'brand-new-file');

      // Conflicting edits
      parentVfs.writeFile('conflict_file.txt', 'parent-diverged');
      child.vfs.writeFile('conflict_file.txt', 'child-diverged');

      // Attempt safe merge -> fails
      assert.throws(() => {
        parent.mergeSubHarness('c_atomic', { strategy: 'safe' });
      }, (err) => {
        assert.strictEqual(err.code, 'BRANCH_CONFLICT');
        return true;
      });

      // NONE of the clean changes should have been applied to parent!
      assert.strictEqual(parentVfs.readFile('clean_mod.txt'), 'clean-base', 'clean_mod.txt must not be modified after aborted merge');
      assert.strictEqual(parentVfs.exists('child_clean_add.txt'), false, 'child_clean_add.txt must not exist after aborted merge');
      assert.strictEqual(parentVfs.readFile('conflict_file.txt'), 'parent-diverged');
      assert.strictEqual(child.isMerged, false);
    });

    it('2.7 Double Merge Prevention: Attempting to re-merge throws ALREADY_MERGED unless force: true', () => {
      const parentVfs = new VfsSandbox();
      const parent = new HarnessController({ id: 'p_double', role: 'lead', vfs: parentVfs, bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_double', role: 'coder', vfsWorkspaceMode: 'branch' });

      child.vfs.writeFile('feature.txt', 'v1');
      const firstRes = parent.mergeSubHarness('c_double');
      assert.strictEqual(firstRes.success, true);
      assert.strictEqual(child.isMerged, true);

      // Second merge without force: true throws ALREADY_MERGED
      assert.throws(() => {
        parent.mergeSubHarness('c_double');
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'ALREADY_MERGED');
        return true;
      });

      // Second merge with force: true succeeds
      const secondRes = parent.mergeSubHarness('c_double', { force: true });
      assert.strictEqual(secondRes.success, true);
    });

  });

  // =========================================================================
  // SECTION 3: RECURSION GUARD & DELEGATION CYCLE GUARD
  // =========================================================================
  describe('3. Recursion Guard & Delegation Cycle Guard', () => {

    it('3.1 Recursion limit: Spawning succeeds depth 0 -> 1 -> 2 -> 3 -> 4 -> 5, then depth 5 throws MAX_RECURSION_DEPTH_EXCEEDED', () => {
      const bus = new InterHarnessEventBus();
      const vfs = new VfsSandbox();

      const root = new HarnessController({
        id: 'agent_depth_0',
        role: 'root',
        depth: 0,
        maxTurns: 100,
        maxTokens: 500000,
        vfs,
        bus
      });
      assert.strictEqual(root.depth, 0);

      // Depth 0 -> Depth 1
      const d1 = root.spawnSubHarness({ id: 'agent_depth_1', role: 'tier1' });
      assert.strictEqual(d1.depth, 1);
      assert.strictEqual(d1.controller.depth, 1);

      // Depth 1 -> Depth 2
      const d2 = d1.spawnSubHarness({ id: 'agent_depth_2', role: 'tier2' });
      assert.strictEqual(d2.depth, 2);

      // Depth 2 -> Depth 3
      const d3 = d2.spawnSubHarness({ id: 'agent_depth_3', role: 'tier3' });
      assert.strictEqual(d3.depth, 3);

      // Depth 3 -> Depth 4
      const d4 = d3.spawnSubHarness({ id: 'agent_depth_4', role: 'tier4' });
      assert.strictEqual(d4.depth, 4);

      // Depth 4 -> Depth 5 (currentDepth = 4 < 5, so this succeeds and creates child at depth 5)
      const d5 = d4.spawnSubHarness({ id: 'agent_depth_5', role: 'tier5' });
      assert.strictEqual(d5.depth, 5);
      assert.strictEqual(d5.controller.depth, 5);

      // Depth 5 controller attempts to spawn -> currentDepth is 5, which satisfies currentDepth >= 5!
      assert.throws(() => {
        d5.spawnSubHarness({ id: 'agent_depth_6', role: 'tier6' });
      }, (err) => {
        assert(err instanceof HarnessError, 'Must be HarnessError');
        assert.strictEqual(err.code, 'MAX_RECURSION_DEPTH_EXCEEDED');
        assert.strictEqual(err.details.currentDepth, 5);
        assert.strictEqual(err.details.maxDepth, 5);
        assert(err.message.includes('recursion depth limit (5) reached'));
        return true;
      }, 'Depth 5 spawning must be rejected by MAX_RECURSION_DEPTH_EXCEEDED');
    });

    it('3.2 Custom maxDepth option is strictly enforced at lower thresholds', () => {
      const bus = new InterHarnessEventBus();
      const root = new HarnessController({ id: 'agent_custom_root', depth: 0, vfs: new VfsSandbox(), bus });

      const d1 = root.spawnSubHarness({ id: 'agent_d1', depth: 1, maxDepth: 2 });
      const d2 = d1.spawnSubHarness({ id: 'agent_d2', depth: 2, maxDepth: 2 });

      // d2 is at currentDepth = 2, with maxDepth: 2 -> currentDepth >= maxDepth triggers guard
      assert.throws(() => {
        d2.spawnSubHarness({ id: 'agent_d3', maxDepth: 2 });
      }, (err) => {
        assert.strictEqual(err.code, 'MAX_RECURSION_DEPTH_EXCEEDED');
        assert.strictEqual(err.details.currentDepth, 2);
        assert.strictEqual(err.details.maxDepth, 2);
        return true;
      });
    });

    it('3.3 Self-delegation cycle guard: harness cannot delegate to itself', () => {
      const bus = new InterHarnessEventBus();
      const root = new HarnessController({ id: 'agent_self_test', vfs: new VfsSandbox(), bus });

      assert.throws(() => {
        root.spawnSubHarness({ id: 'agent_self_test' });
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'DELEGATION_CYCLE_DETECTED');
        assert(err.message.includes('Self-delegation detected'));
        assert.strictEqual(err.details.sourceId, 'agent_self_test');
        assert.strictEqual(err.details.targetId, 'agent_self_test');
        return true;
      }, 'Direct self-delegation must be blocked');
    });

    it('3.4 Ancestor circular delegation guard: detecting cycles across multi-hop delegation chains', () => {
      const bus = new InterHarnessEventBus();
      const agentA = new HarnessController({ id: 'agent_A', vfs: new VfsSandbox(), bus });

      // A -> B
      const agentB = agentA.spawnSubHarness({ id: 'agent_B' });
      // B -> C
      const agentC = agentB.spawnSubHarness({ id: 'agent_C' });
      // C -> D
      const agentD = agentC.spawnSubHarness({ id: 'agent_D' });

      // Lineage at agentD is ['agent_A', 'agent_B', 'agent_C']
      assert.deepStrictEqual(agentD.lineage, ['agent_A', 'agent_B', 'agent_C']);

      // Attempting to spawn with any ancestor ID in lineage must throw DELEGATION_CYCLE_DETECTED
      const ancestorTargets = ['agent_A', 'agent_B', 'agent_C'];
      for (const targetId of ancestorTargets) {
        assert.throws(() => {
          agentD.spawnSubHarness({ id: targetId });
        }, (err) => {
          assert(err instanceof HarnessError);
          assert.strictEqual(err.code, 'DELEGATION_CYCLE_DETECTED');
          assert(err.message.includes('Circular delegation detected'));
          assert.strictEqual(err.details.sourceId, 'agent_D');
          assert.strictEqual(err.details.targetId, targetId);
          return true;
        }, `Delegating from D back to ancestor ${targetId} must throw DELEGATION_CYCLE_DETECTED`);
      }

      // Self delegation on D
      assert.throws(() => {
        agentD.spawnSubHarness({ id: 'agent_D' });
      }, (err) => {
        assert.strictEqual(err.code, 'DELEGATION_CYCLE_DETECTED');
        assert(err.message.includes('Self-delegation detected'));
        return true;
      });

      // Spawning with a completely new non-ancestor ID succeeds
      const agentE = agentD.spawnSubHarness({ id: 'agent_E' });
      assert.strictEqual(agentE.id, 'agent_E');
      assert.deepStrictEqual(agentE.lineage, ['agent_A', 'agent_B', 'agent_C', 'agent_D']);
    });

  });

  // =========================================================================
  // SECTION 4: HOSTILE BOUNDARY & FAULT INJECTION SCENARIOS
  // =========================================================================
  describe('4. Hostile Boundary & Fault Injection Scenarios', () => {

    it('4.1 Tampered baseline: Missing originSnapshot throws MISSING_ORIGIN_SNAPSHOT', () => {
      const parent = new HarnessController({ id: 'p_tamper', vfs: new VfsSandbox(), bus: new InterHarnessEventBus() });
      const child = parent.spawnSubHarness({ id: 'c_tamper', vfsWorkspaceMode: 'branch' });

      // Tamper: clear origin snapshot
      child.originSnapshot = null;
      child.vfs._branchOriginSnapshot = null;

      assert.throws(() => {
        parent.mergeSubHarness('c_tamper');
      }, (err) => {
        assert(err instanceof HarnessError);
        assert.strictEqual(err.code, 'MISSING_ORIGIN_SNAPSHOT');
        return true;
      });
    });

    it('4.2 Budget exhaustion: Spawning is blocked when turn or token budget is depleted', () => {
      const bus = new InterHarnessEventBus();
      const parentTurnsDepleted = new HarnessController({
        id: 'p_turns_depleted',
        vfs: new VfsSandbox(),
        bus,
        maxTurns: 3
      });
      parentTurnsDepleted.turnsCompleted = 3; // Depleted

      assert.throws(() => {
        parentTurnsDepleted.spawnSubHarness({ id: 'c_no_turns' });
      }, (err) => {
        assert.strictEqual(err.code, 'BUDGET_EXHAUSTED');
        assert(err.message.includes('turn budget'));
        return true;
      });

      const parentTokensDepleted = new HarnessController({
        id: 'p_tokens_depleted',
        vfs: new VfsSandbox(),
        bus,
        maxTokens: 5000
      });
      parentTokensDepleted.tokensConsumed = 5000; // Depleted

      assert.throws(() => {
        parentTokensDepleted.spawnSubHarness({ id: 'c_no_tokens' });
      }, (err) => {
        assert.strictEqual(err.code, 'BUDGET_EXHAUSTED');
        assert(err.message.includes('token ceiling'));
        return true;
      });
    });

    it('4.3 Invalid workspace mode throws INVALID_WORKSPACE_MODE', () => {
      const parent = new HarnessController({ id: 'p_inv_mode', vfs: new VfsSandbox(), bus: new InterHarnessEventBus() });
      assert.throws(() => {
        parent.spawnSubHarness({ id: 'c_bad', vfsWorkspaceMode: 'unsupported_mode' });
      }, (err) => {
        assert.strictEqual(err.code, 'INVALID_WORKSPACE_MODE');
        return true;
      });
    });

    it('4.4 Cascading emergency stop halts descendants and blocks subsequent spawning', () => {
      const bus = new InterHarnessEventBus();
      const root = new HarnessController({ id: 'root_halt_test', vfs: new VfsSandbox(), bus });
      const child = root.spawnSubHarness({ id: 'child_halt_test' });
      const grandchild = child.spawnSubHarness({ id: 'grandchild_halt_test' });

      assert.strictEqual(child.controller.isHalted, false);
      assert.strictEqual(grandchild.controller.isHalted, false);

      // Root halts child
      root.emergencyStopSubHarness('child_halt_test', 'adversarial_test_trigger');

      // Both child and grandchild must be halted
      assert.strictEqual(child.controller.isHalted, true);
      assert.strictEqual(child.controller.status, 'halted');
      assert.strictEqual(grandchild.controller.isHalted, true);
      assert.strictEqual(grandchild.controller.status, 'halted');

      // Spawning from a halted controller throws PARENT_HALTED
      assert.throws(() => {
        child.spawnSubHarness({ id: 'spawn_after_halt' });
      }, (err) => {
        assert.strictEqual(err.code, 'PARENT_HALTED');
        return true;
      });
    });

    it('4.5 Trajectory stitching: Merging branch automatically stitches child trajectory events into parent tree', () => {
      const bus = new InterHarnessEventBus();
      const parentTrajectory = new TrajectoryEngine({ harnessId: 'p_traj' });
      const parent = new HarnessController({
        id: 'p_traj',
        vfs: new VfsSandbox(),
        bus,
        trajectory: parentTrajectory
      });

      const child = parent.spawnSubHarness({
        id: 'c_traj',
        role: 'researcher',
        vfsWorkspaceMode: 'branch'
      });

      // Child records step
      child.trajectory.recordStep({
        thought: 'Child investigated problem',
        action: { tool: 'view_file', params: { path: 'a.js' } },
        observation: { status: 'success', output: 'content' }
      });

      child.vfs.writeFile('a.js', 'researched');

      // Merge child into parent
      parent.mergeSubHarness('c_traj');

      // Check parent trajectory tree has child node
      const tree = parentTrajectory.getHierarchicalTree();
      assert(Array.isArray(tree), 'Hierarchical tree should be an Array');
      assert.strictEqual(tree[0].harnessId, 'p_traj');
      assert(tree[0].children.length >= 1, 'Parent spawn node should have stitched child tree node');
      assert.strictEqual(tree[0].children[0].harnessId, 'c_traj');
      assert.strictEqual(tree[0].children[0].depth, 1);
      assert.strictEqual(tree[0].children[0].thought, 'Child investigated problem');
      assert.strictEqual(tree[0].sub_trajectory.childHarnessId, 'c_traj');
    });

  });

});
