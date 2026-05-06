// cspell:ignore Wybrow Hegemann Gladisch
import { log } from '../../../../logger.js';

const SWIMLANE_DIR_LOG_PREFIX = 'SWIMLANE_DIR';

/**
 * Iter 17 — Wybrow-style post-route nudge for interior vertical segments
 * that run too close to a large obstacle's side face. See call-site comment
 * in `applySwimlaneDirectionTransform` for paper backing (Wybrow `e8804c93`,
 * Hegemann & Wolff `b65b3d45`, Gladisch `32fe421c`).
 *
 * For each edge and each interior vertical segment (indices 1..len-3,
 * where `len` is the deduped point count and the adjacent segments are
 * both axis-aligned horizontals), we:
 *
 *   1. Identify the "alley" — the nearest real-node face to the LEFT and
 *      to the RIGHT of the segment, restricted to nodes whose y-span
 *      overlaps the segment's y-span. (Src/dst of the edge are excluded
 *      because their faces are the edge's own endpoints.) A node that
 *      straddles the segment's x bails the nudge for safety.
 *   2. Compute `gapLeft` and `gapRight`. If the nearer gap is
 *      `>= MIN_CLEARANCE`, the segment is already well-placed — skip.
 *   3. Pick a `targetX` toward the alley centre, clamped so both sides
 *      have `>= MIN_CLEARANCE` when possible (for narrow alleys, settle
 *      for the centre; we will still improve over the baseline in that
 *      case).
 *   4. Safety-gate the move against real-node rects, other-edge
 *      crossings, and edge-label rects (mirroring collapseShortTerminalStub).
 *   5. If gated out, leave the segment untouched — no regression possible.
 *
 * The pass preserves stubs (first/last segment) and never changes the
 * orientation of any segment (only shifts the x of a vertical). It is
 * idempotent on routes that already respect MIN_CLEARANCE.
 *
 * Scope note: only operates on vertical segments in this iteration —
 * horizontal nudging is symmetric but out of scope (the user-reported
 * symptom is a vertical hug). Adding horizontal nudging later is a
 * mechanical mirror of this function.
 */
export function nudgeInteriorVerticalsFromObstacles(
  edges: any[],
  nodeByIdMap: Map<string, any>
): void {
  const MIN_CLEARANCE = 20; // Gladisch δ — safety gap
  const EPS_LOCAL = 1e-3;
  const BUFFER = 2;

  interface RectLite {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }

  const realNodeRects: { id: string; rect: RectLite }[] = [];
  const labelRects: { id: string; rect: RectLite }[] = [];
  for (const n of nodeByIdMap.values()) {
    if ((n as { isGroup?: boolean }).isGroup) {
      continue;
    }
    const cx = (n as { x?: number }).x ?? 0;
    const cy = (n as { y?: number }).y ?? 0;
    const w = (n as { width?: number }).width ?? 0;
    const h = (n as { height?: number }).height ?? 0;
    if (w <= 0 || h <= 0) {
      continue;
    }
    const rect: RectLite = {
      left: cx - w / 2,
      right: cx + w / 2,
      top: cy - h / 2,
      bottom: cy + h / 2,
    };
    const id = String((n as { id?: string }).id ?? '');
    if ((n as { isEdgeLabel?: boolean }).isEdgeLabel) {
      labelRects.push({ id, rect });
    } else {
      realNodeRects.push({ id, rect });
    }
  }

  const segHitsRect = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    r: RectLite,
    buffer: number
  ): boolean => {
    const segMinX = Math.min(a.x, b.x);
    const segMaxX = Math.max(a.x, b.x);
    const segMinY = Math.min(a.y, b.y);
    const segMaxY = Math.max(a.y, b.y);
    return (
      segMaxX > r.left - buffer &&
      segMinX < r.right + buffer &&
      segMaxY > r.top - buffer &&
      segMinY < r.bottom + buffer
    );
  };

  // Orthogonal segment crossing test (strict interior crossing of one
  // horizontal with one vertical; shared endpoints and collinear
  // overlaps are not considered crossings).
  const segmentsCross = (
    a1: { x: number; y: number },
    a2: { x: number; y: number },
    b1: { x: number; y: number },
    b2: { x: number; y: number }
  ): boolean => {
    const aHoriz = Math.abs(a1.y - a2.y) < EPS_LOCAL;
    const aVert = Math.abs(a1.x - a2.x) < EPS_LOCAL;
    const bHoriz = Math.abs(b1.y - b2.y) < EPS_LOCAL;
    const bVert = Math.abs(b1.x - b2.x) < EPS_LOCAL;
    if ((aHoriz && bVert) || (aVert && bHoriz)) {
      const hA = aHoriz ? { a: a1, b: a2 } : { a: b1, b: b2 };
      const vA = aHoriz ? { a: b1, b: b2 } : { a: a1, b: a2 };
      const hY = hA.a.y;
      const hXmin = Math.min(hA.a.x, hA.b.x);
      const hXmax = Math.max(hA.a.x, hA.b.x);
      const vX = vA.a.x;
      const vYmin = Math.min(vA.a.y, vA.b.y);
      const vYmax = Math.max(vA.a.y, vA.b.y);
      return (
        vX > hXmin + EPS_LOCAL &&
        vX < hXmax - EPS_LOCAL &&
        hY > vYmin + EPS_LOCAL &&
        hY < vYmax - EPS_LOCAL
      );
    }
    return false;
  };

  for (const edge of edges) {
    if ((edge as { isLayoutOnly?: boolean }).isLayoutOnly) {
      continue;
    }
    const rawPts = (edge as { points?: { x: number; y: number }[] }).points;
    if (!rawPts || rawPts.length < 4) {
      continue;
    }

    // Dedupe consecutive equal points so interior indices are accurate.
    const pts: { x: number; y: number }[] = [];
    for (const p of rawPts) {
      const last = pts.length > 0 ? pts[pts.length - 1] : undefined;
      if (!last || Math.abs(p.x - last.x) > EPS_LOCAL || Math.abs(p.y - last.y) > EPS_LOCAL) {
        pts.push(p);
      }
    }
    if (pts.length < 4) {
      continue;
    }

    const srcId = (edge as { start?: string }).start;
    const dstId = (edge as { end?: string }).end;
    const edgeId = String((edge as { id?: string }).id ?? '');

    let changed = false;
    let working = [...pts];
    // Iterate interior vertical segments (indices 1 .. len-3).
    for (let i = 1; i <= working.length - 3; i++) {
      const a = working[i];
      const b = working[i + 1];
      const isVertical = Math.abs(a.x - b.x) < EPS_LOCAL && Math.abs(a.y - b.y) > EPS_LOCAL;
      if (!isVertical) {
        continue;
      }
      const before = working[i - 1];
      const after = working[i + 2];
      const beforeHoriz =
        Math.abs(before.y - a.y) < EPS_LOCAL && Math.abs(before.x - a.x) > EPS_LOCAL;
      const afterHoriz = Math.abs(after.y - b.y) < EPS_LOCAL && Math.abs(after.x - b.x) > EPS_LOCAL;
      if (!beforeHoriz || !afterHoriz) {
        continue;
      }

      const segX = a.x;
      const segYmin = Math.min(a.y, b.y);
      const segYmax = Math.max(a.y, b.y);

      // Compute the alley bounds: nearest obstacle face on each side
      // restricted to obstacles whose y-range overlaps the segment.
      let alleyLeft = -Infinity;
      let alleyRight = Infinity;
      let straddle = false;
      for (const rn of realNodeRects) {
        if (rn.id === srcId || rn.id === dstId) {
          continue;
        }
        const r = rn.rect;
        // y-overlap of obstacle with the segment (strict)
        if (r.bottom <= segYmin + EPS_LOCAL || r.top >= segYmax - EPS_LOCAL) {
          continue;
        }
        if (r.right < segX - EPS_LOCAL) {
          if (r.right > alleyLeft) {
            alleyLeft = r.right;
          }
        } else if (r.left > segX + EPS_LOCAL) {
          if (r.left < alleyRight) {
            alleyRight = r.left;
          }
        } else {
          // Obstacle overlaps the segment's x — the router has already
          // decided to pass through this x. Bail the nudge for safety.
          straddle = true;
          break;
        }
      }
      if (straddle) {
        continue;
      }

      const gapLeft = alleyLeft === -Infinity ? Infinity : segX - alleyLeft;
      const gapRight = alleyRight === Infinity ? Infinity : alleyRight - segX;
      const nearerGap = Math.min(gapLeft, gapRight);
      if (nearerGap >= MIN_CLEARANCE) {
        continue; // already well-placed
      }

      // Pick targetX toward alley centre, clamped to >= MIN_CLEARANCE
      // on each side when possible.
      let targetX: number;
      if (alleyLeft !== -Infinity && alleyRight !== Infinity) {
        if (alleyRight - alleyLeft < 2 * MIN_CLEARANCE) {
          // Alley too narrow to guarantee MIN_CLEARANCE on both sides —
          // settle for centre.
          targetX = (alleyLeft + alleyRight) / 2;
        } else {
          const centre = (alleyLeft + alleyRight) / 2;
          targetX = Math.max(
            alleyLeft + MIN_CLEARANCE,
            Math.min(alleyRight - MIN_CLEARANCE, centre)
          );
        }
      } else if (alleyLeft !== -Infinity) {
        targetX = alleyLeft + MIN_CLEARANCE;
      } else if (alleyRight !== Infinity) {
        targetX = alleyRight - MIN_CLEARANCE;
      } else {
        continue; // no obstacles within y-span, don't move
      }

      // No-op guard
      if (Math.abs(targetX - segX) < EPS_LOCAL) {
        continue;
      }

      const newA = { x: targetX, y: a.y };
      const newB = { x: targetX, y: b.y };
      const newBeforeHorizA = before;
      const newBeforeHorizB = newA;
      const newAfterHorizA = newB;
      const newAfterHorizB = after;

      // Gate (c): real-node rect collision for all three affected segments.
      let blocked = false;
      for (const rn of realNodeRects) {
        if (rn.id === srcId || rn.id === dstId) {
          continue;
        }
        if (
          segHitsRect(newA, newB, rn.rect, BUFFER) ||
          segHitsRect(newBeforeHorizA, newBeforeHorizB, rn.rect, BUFFER) ||
          segHitsRect(newAfterHorizA, newAfterHorizB, rn.rect, BUFFER)
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        continue;
      }

      // Gate (d): other-edge crossings. Skip own segments.
      const ownSegmentKey = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        `${p.x.toFixed(3)},${p.y.toFixed(3)}|${q.x.toFixed(3)},${q.y.toFixed(3)}`;
      const selfSegments = new Set<string>();
      for (let k = 0; k < working.length - 1; k++) {
        selfSegments.add(ownSegmentKey(working[k], working[k + 1]));
        selfSegments.add(ownSegmentKey(working[k + 1], working[k]));
      }
      for (const other of edges) {
        if (other === edge) {
          continue;
        }
        if ((other as { isLayoutOnly?: boolean }).isLayoutOnly) {
          continue;
        }
        const oPts = (other as { points?: { x: number; y: number }[] }).points;
        if (!oPts || oPts.length < 2) {
          continue;
        }
        for (let j = 0; j < oPts.length - 1; j++) {
          const p1 = oPts[j];
          const p2 = oPts[j + 1];
          if (selfSegments.has(ownSegmentKey(p1, p2))) {
            continue;
          }
          if (
            segmentsCross(newA, newB, p1, p2) ||
            segmentsCross(newBeforeHorizA, newBeforeHorizB, p1, p2) ||
            segmentsCross(newAfterHorizA, newAfterHorizB, p1, p2)
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          break;
        }
      }
      if (blocked) {
        continue;
      }

      // Gate (e): edge-label rect collision.
      for (const lr of labelRects) {
        if (
          segHitsRect(newA, newB, lr.rect, BUFFER) ||
          segHitsRect(newBeforeHorizA, newBeforeHorizB, lr.rect, BUFFER) ||
          segHitsRect(newAfterHorizA, newAfterHorizB, lr.rect, BUFFER)
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        continue;
      }

      // Apply the shift.
      working = working.map((p, idx) => (idx === i ? newA : idx === i + 1 ? newB : p));
      changed = true;
      log.debug(
        SWIMLANE_DIR_LOG_PREFIX,
        `nudgeInteriorVerticalsFromObstacles: ${edgeId} seg ${i}-${i + 1} x ${segX.toFixed(2)} → ${targetX.toFixed(2)} (alley [${alleyLeft === -Infinity ? '-∞' : alleyLeft.toFixed(2)}, ${alleyRight === Infinity ? '∞' : alleyRight.toFixed(2)}])`
      );
    }

    if (changed) {
      // Re-anchor the edge label if it now sits off the shifted polyline.
      // The shift may have moved a vertical segment out from under a label
      // that was previously centered on it; validateLayout enforces that
      // the polyline passes through the label node. Only re-anchor if
      // necessary (idempotent otherwise).
      (edge as { points: { x: number; y: number }[] }).points = working;
      const labelId = (edge as { labelNodeId?: string }).labelNodeId;
      if (labelId) {
        const labelNode = nodeByIdMap.get(labelId);
        if (labelNode) {
          const lw = (labelNode as { width?: number }).width ?? 0;
          const lh = (labelNode as { height?: number }).height ?? 0;
          const lx = (labelNode as { x?: number }).x ?? 0;
          const ly = (labelNode as { y?: number }).y ?? 0;
          if (lw > 0 && lh > 0) {
            // Check whether the current label centre still lies on some
            // segment of the new polyline (axis-aligned containment).
            let onPolyline = false;
            for (let k = 0; k < working.length - 1; k++) {
              const p = working[k];
              const q = working[k + 1];
              const isHoriz = Math.abs(p.y - q.y) < EPS_LOCAL;
              const isVert = Math.abs(p.x - q.x) < EPS_LOCAL;
              if (isHoriz && Math.abs(ly - p.y) < EPS_LOCAL) {
                const xMin = Math.min(p.x, q.x);
                const xMax = Math.max(p.x, q.x);
                if (lx >= xMin - EPS_LOCAL && lx <= xMax + EPS_LOCAL) {
                  onPolyline = true;
                  break;
                }
              } else if (isVert && Math.abs(lx - p.x) < EPS_LOCAL) {
                const yMin = Math.min(p.y, q.y);
                const yMax = Math.max(p.y, q.y);
                if (ly >= yMin - EPS_LOCAL && ly <= yMax + EPS_LOCAL) {
                  onPolyline = true;
                  break;
                }
              }
            }
            if (!onPolyline) {
              // Re-anchor to the longest axis-aligned segment that fits.
              let bestMidX: number | undefined;
              let bestMidY: number | undefined;
              let bestLen = -1;
              for (let k = 0; k < working.length - 1; k++) {
                const p = working[k];
                const q = working[k + 1];
                const segLen = Math.hypot(q.x - p.x, q.y - p.y);
                const isHoriz = Math.abs(p.y - q.y) < EPS_LOCAL;
                const isVert = Math.abs(p.x - q.x) < EPS_LOCAL;
                const fits = (isHoriz && segLen >= lw + 2) || (isVert && segLen >= lh + 2);
                if (!fits) {
                  continue;
                }
                if (segLen > bestLen) {
                  bestLen = segLen;
                  bestMidX = (p.x + q.x) / 2;
                  bestMidY = (p.y + q.y) / 2;
                }
              }
              if (bestMidX !== undefined && bestMidY !== undefined) {
                (labelNode as { x: number }).x = bestMidX;
                (labelNode as { y: number }).y = bestMidY;
              }
            }
          }
        }
      }
    }
  }
}
