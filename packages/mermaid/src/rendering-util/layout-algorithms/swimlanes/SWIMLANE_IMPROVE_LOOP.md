# Swimlane Improve Loop

Durable notes for swimlane layout improvement rounds. Each research round must record:

- empirical producer: what the fixture, browser-equivalent DDLT, and code probes showed;
- paper-backed theory: current-turn Algorithm Reference / NotebookLM findings;
- implementation implication: whether the Mermaid change follows the literature directly, approximates it, or is a product heuristic.

## Round 2026-05-06: `mermaid-work` shared rendered lane at G3

### Target

- Fixture: `layout-tests/swimlanes/mermaid-work.mmd`
- Visible browser issue: `L_G3_C2_0` and `L_R2_G3_0` shared the same rendered vertical lane on G3's node face.
- DDLT gap: the general `validateLayout()` baseline stayed valid even though the browser-rendered edge paths were visually ambiguous.

### Empirical Producer

- Added a browser-equivalent DDLT assertion that materializes the same endpoint clipping used by the renderer and measures same-axis overlap between the two rendered paths.
- The regression detected the original overlap: `57.890625`.
- The fix separates the rendered terminal lane for `L_R2_G3_0` from `x=968.2206852799754` to `x=961.2206852799754` while keeping the terminal on G3's same node face.
- `validateLayout()` remains valid and improves from score `951` to `954`; crossings drop from `3` to `2`.
- DDLT/browser pipeline equivalence was tightened by extracting a shared pure swimlane layout core used by both browser rendering and the DDLT backend.

### Paper-Backed Theory

Algorithm Reference query:

```bash
notebooklm ask "For orthogonal edge routing and post-routing cleanup, what do the sources say about keeping ports on node sides, avoiding obstacle interiors, separating coincident/shared tracks or lanes, and trading extra bends against readability? Please return concise paper-backed points with citations." \
  --notebook 32eb3656-c4e5-4fd3-8ace-d49ac157ce38 \
  -s e8804c93-74b7-4e06-94d0-7e5cf95fe7e3 \
  -s 32fe421c-0d4c-4bd3-ac9c-1692747f0640 \
  -s 42cabfd0-d44e-45b8-ba8a-7c100a559611 \
  --json
```

NotebookLM summary from the `Papers` notebook:

- Orthogonal connectors should remain valid right-angle polylines, be short, and have few bends, while never passing through object interiors. Source: `Orthogonal-Connector-Routing.pdf` (`e8804c93-74b7-4e06-94d0-7e5cf95fe7e3`).
- Orthogonal visibility graph routing only admits candidate segments that do not intersect non-endpoint node bounding boxes. Source: `edge-routing.pdf` (`32fe421c-0d4c-4bd3-ac9c-1692747f0640`).
- Shared-edge cleanup is a recognized post-routing phase: Wybrow-style routing orders overlapping connector subroutes, then applies separation constraints so shared segments become visually separate without introducing extra connector crossings. Source: `Orthogonal-Connector-Routing.pdf`.
- Faster/local overlap resolution can use safety gaps and bounded offsets to move overlapping edges apart. Source: `edge-routing.pdf`.
- Bus/channel routing treats non-overlap on tracks and obstacle avoidance as hard constraints, and too many bends as a quality risk. Source: `Topology-Aware Bus Routing.pdf` (`42cabfd0-d44e-45b8-ba8a-7c100a559611`).

### Implementation Implication

- The first-pass `nudgeSharedInteriorSubpaths` is paper-aligned: it approximates Wybrow-style shared-track separation for interior H/V segments, with safety checks against obstacles and new crossings.
- The new terminal-lane split is an implementation-driven adaptation of the same principle. The literature supports separating coincident routed tracks and keeping terminal ports on node sides; Mermaid needs a local pass because the shared renderer re-clips endpoints during SVG path materialization.
- The change is deliberately scoped to visible rendered terminal rails. It does not claim to be a full global shared-edge ordering algorithm.
- The DDLT regression is the correct guard because the defect exists after renderer-equivalent endpoint clipping, not in the raw `validateLayout()` geometry alone.

### Verification

- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/mermaid-work.ddlt.spec.ts`
  - 1 file passed, 3 tests passed.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureFreshness.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureMetadata.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/*.ddlt.spec.ts`
  - 9 files passed, 39 tests passed.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/__tests__/direction.lr.transform.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.router.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.repro_crossing.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.detour.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.issues.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.wide_node.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.crossing.spec.ts`
  - 7 files passed, 32 tests passed, 2 skipped.

### Follow-Up Rules

- Every swimlane research round must query the Algorithm Reference before final interpretation when it involves routing behavior, port constraints, lane/channel separation, bend tradeoffs, obstacle avoidance, or endpoint repairs.
- Every round conclusion must be saved here before final reporting.
- Separate literature claims from Mermaid adaptations. Do not present a local heuristic as a direct paper requirement.

## Round 2026-05-06: `mermaid-work` G3 terminal spike and hairpin cleanup

### Target

- Fixture: `layout-tests/swimlanes/mermaid-work.mmd`
- Visible browser issue: after splitting the shared G3 terminal lane, `L_R2_G3_0` formed a short rendered spike and `L_G3_C2_0` kept a rectangular hairpin.
- DDLT gap: the previous browser-equivalent parity spec checked overlap, but not rendered backtracking or hairpin shapes.

### Empirical Producer

- Added a regression assertion over browser-equivalent rendered points for:
  - same-axis backtracking on `L_R2_G3_0`;
  - rectangular hairpins on `L_G3_C2_0`.
- The red test first measured a 7 unit `L_R2_G3_0` backtrack.
- After fixing terminal replacement, the red test measured a 27.103747351694892 unit `L_G3_C2_0` hairpin.
- Final browser-equivalent points:
  - `L_G3_C2_0`: `(968.2207,279.1875) -> (968.2207,750.0742) -> (1388.0043,750.0742)`
  - `L_R2_G3_0`: `(536.1383,1346.2305) -> (536.1383,357.0781) -> (961.2207,357.0781) -> (961.2207,279.1875)`
- `validateLayout()` improved from score `954` to `990`; crossings from `2` to `0`; total points from `35` to `32`; total bend penalty from `40` to `10`; crossing penalty from `6` to `0`.

### Paper-Backed Theory

Algorithm Reference query:

```bash
notebooklm ask "For orthogonal connector routing post-processing, what do the sources say about eliminating collinear backtracking, spikes, or tiny doglegs after separating overlapping connector lanes? Focus on path simplification after shared-edge ordering or nudging, while preserving ports on node sides and obstacle avoidance. Return concise points with citations." \
  --notebook 32eb3656-c4e5-4fd3-8ace-d49ac157ce38 \
  -s e8804c93-74b7-4e06-94d0-7e5cf95fe7e3 \
  -s 32fe421c-0d4c-4bd3-ac9c-1692747f0640 \
  --json
```

NotebookLM summary from the `Papers` notebook:

- The cited sources do not describe a special post-nudge "spike cleanup" phase by that name.
- They do support the underlying rule: orthogonal routes should be simplified into maximal horizontal/vertical runs, avoid unnecessary bends, remain short, keep ports on node sides, and avoid obstacles.
- Shared-edge ordering/separation should not introduce unnecessary bends or crossings.
- Sources: `Orthogonal-Connector-Routing.pdf` (`e8804c93-74b7-4e06-94d0-7e5cf95fe7e3`) and `edge-routing.pdf` (`32fe421c-0d4c-4bd3-ac9c-1692747f0640`).

### Implementation Implication

- The terminal-lane shift must replace an adjacent raw point when the rendered rail endpoint is that adjacent point. Appending a shifted point can create a tiny reversed segment, which becomes the visible spike.
- A post terminal-split dogleg cleanup is a Mermaid adaptation, not a direct paper algorithm. It is justified only with strict safety gates: preserve orthogonality, preserve endpoint ports, avoid non-endpoint node and label rectangles, avoid new same-track overlaps, and avoid strict new crossings.

### Verification

- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/mermaid-work.ddlt.spec.ts`
  - 1 file passed, 4 tests passed.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureFreshness.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureMetadata.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/*.ddlt.spec.ts`
  - 9 files passed, 40 tests passed.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/__tests__/direction.lr.transform.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.router.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.repro_crossing.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.detour.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.issues.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.wide_node.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.crossing.spec.ts`
  - 7 files passed, 32 tests passed, 2 skipped.

### Follow-Up

- Browser/dev-page screenshot comparison for `mermaid-work` is the next useful confirmation.
- Future route-shape DDLT should check rendered points, not just raw layout points, whenever endpoint clipping can change visible geometry.

## Round 2026-05-06: `4-car-fun-sales-tb` I->K own-border source stub

### Target

- Fixture: `layout-tests/swimlanes/4-car-fun-sales-tb.mmd`
- DDLT issue: this fixture had no permanent swimlane DDLT spec, but a baseline probe showed `validateLayout()` already marked it invalid.
- Visible geometry issue: edge `L_I_K_0` started at node `I`'s bottom-left corner, ran along `I`'s bottom border, then left downward.

### Empirical Producer

- Added a baseline probe in `.tmp/swimlane-improve/20260506-174147/probe.spec.ts`.
- Baseline `validateLayout()` result:
  - `ok`: `false`
  - `score`: `0`
  - issues: `edge-intersects-obstacle`, `edge-corner-connection`, and `edge-border-hugging` for edge `L_I_K_0` at node `I`
- Baseline browser-equivalent `L_I_K_0` points:
  - `(318.6796875,520) -> (335.796875,520) -> (335.796875,540) -> (292.125,540) -> (292.125,641)`
- Added permanent DDLT coverage in `4-car-fun-sales-tb.ddlt.spec.ts`:
  - full `validateLayout()` validity assertion;
  - targeted assertion that `L_I_K_0` does not intersect, corner-connect to, or border-hug node `I`.
- After the fix:
  - `ok`: `true`
  - `score`: `956`
  - issues: `[]`
  - `totalPoints`: `45`
  - `totalBendPenalty`: `32`
- Repaired browser-equivalent `L_I_K_0` points:
  - `(335.796875,520) -> (335.796875,540) -> (292.125,540) -> (292.125,641)`

### Paper-Backed Theory

Algorithm Reference query:

```bash
notebooklm ask "For orthogonal connector routing with fixed node-side ports, what do the sources say about avoiding corner ports, self-node border-hugging stubs, and connector segments that run along or inside the source/target node boundary? Focus on port assignment/side constraints and the first segment leaving the node. Return concise points with citations." \
  --notebook 32eb3656-c4e5-4fd3-8ace-d49ac157ce38 \
  -s e8804c93-74b7-4e06-94d0-7e5cf95fe7e3 \
  -s 32fe421c-0d4c-4bd3-ac9c-1692747f0640 \
  -s 0fb2d84f-23d1-4cc1-b647-532e5cd76ee7 \
  --json
```

NotebookLM summary from the `Papers` notebook:

- Port assignment frameworks restrict connections to node faces, not corners. Source: `0fb2d84f-23d1-4cc1-b647-532e5cd76ee7`.
- Pins lie at intersections of fine grid lines with node borders; edges must not overlap or intersect vertices. Source: `0fb2d84f-23d1-4cc1-b647-532e5cd76ee7`.
- Orthogonal connector routes should be valid right-angle polylines that do not pass through objects. Source: `Orthogonal-Connector-Routing.pdf` (`e8804c93-74b7-4e06-94d0-7e5cf95fe7e3`).
- When multiple edges use the same side, valid side constraints require separated ports/tracks; the first segment should leave the node outward instead of running along the boundary. Source: `0fb2d84f-23d1-4cc1-b647-532e5cd76ee7`.

### Implementation Implication

- The own-border-stub cleanup is a Mermaid adaptation of paper-backed port/side validity constraints.
- The change runs in the final rendering-handoff pass, where endpoint snapping is already enforcing the node boundary contract.
- The cleanup removes a start or end stub only when:
  - the stub lies on the source or target node's own border;
  - the adjacent segment leaves outward from that same side;
  - the resulting endpoint remains on the node face.
- This avoids presenting a local fixture heuristic as a global routing algorithm while still enforcing a valid side port.

### Verification

- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/4-car-fun-sales-tb.ddlt.spec.ts`
  - 1 file passed, 2 tests passed.
- `pnpm exec vitest run .tmp/swimlane-improve/20260506-174147/probe.spec.ts`
  - probe reports `ok: true`, `score: 956`, `issues: []`.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureFreshness.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/ddlt/fixtureMetadata.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/*.ddlt.spec.ts`
  - 10 files passed, 42 tests passed.
- `pnpm exec vitest run packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/__tests__/direction.lr.transform.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.router.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.repro_crossing.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.detour.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.issues.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.wide_node.spec.ts packages/mermaid/src/rendering-util/layout-algorithms/swimlanes/raykovGemini/__tests__/raykov.crossing.spec.ts`
  - 7 files passed, 32 tests passed, 2 skipped.

### Follow-Up

- Add more permanent fixture-specific DDLT specs for swimlane examples that currently only have `.mmd` and `.sizes.json` files.
- Keep checking rendered endpoint materialization when a defect is visible in the browser path, because endpoint clipping can introduce or hide the artifact after the raw route is produced.
