// cspell:ignore Hegemann Wybrow

import type { NodeBoundsInfo } from './geometry.js';
import {
  collectRealNodeBounds,
  orthogonalSegmentsCross,
  overlapLength,
  portForRectSide,
  segmentHitsAnyRect,
} from './geometry.js';
import type { RectSide } from './geometry.js';

const EPS = 1e-3;
const MIN_SHARED = 8;

export function simplifyDetouredEdges(edges: any[], nodes: any[]): void {
  const { nodeInfoById, realNodeRects } = collectRealNodeBounds(nodes);

  const countBends = (pts: { x: number; y: number }[]): number => {
    let bends = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const abH = Math.abs(a.y - b.y) < EPS;
      const bcH = Math.abs(b.y - c.y) < EPS;
      if (abH !== bcH) {
        bends++;
      }
    }
    return bends;
  };

  const sides: RectSide[] = ['top', 'bottom', 'left', 'right'];

  // Anchor offset for port exit. Each port's first/last segment must
  // extend in the port's perpendicular direction by at least this many
  // units before turning, so (a) the port-direction check in
  // validateLayout is satisfied and (b) the segment does not hug the
  // node's boundary. Matches raykov's ANCHOR_OFFSET.
  const ANCHOR = 20;

  // Minimal 1- or 2-bend orthogonal path between two cardinal-side
  // ports. Returns undefined if the two sides are incompatible for a
  // clean path (e.g. port directions contradict the required bend
  // direction) — in which case the caller should try another pair.
  const buildOrthogonalPath = (
    src: { x: number; y: number },
    srcSide: RectSide,
    dst: { x: number; y: number },
    dstSide: RectSide
  ): { x: number; y: number }[] | undefined => {
    const srcH = srcSide === 'left' || srcSide === 'right';
    const dstH = dstSide === 'left' || dstSide === 'right';

    // Case A: src horizontal, dst horizontal.
    if (srcH && dstH) {
      // Opposite sides (src right ↔ dst left or vice versa) going
      // toward each other — a valid 1-bend or 0-bend path.
      const opposingDir =
        (srcSide === 'right' && dstSide === 'left' && src.x < dst.x) ||
        (srcSide === 'left' && dstSide === 'right' && src.x > dst.x);
      if (opposingDir) {
        if (Math.abs(src.y - dst.y) < EPS) {
          return [src, dst];
        }
        const midX = (src.x + dst.x) / 2;
        return [src, { x: midX, y: src.y }, { x: midX, y: dst.y }, dst];
      }
      // Same-side pairing (left-left or right-right): route via an
      // intermediate x that lies OUTSIDE both nodes by at least ANCHOR.
      if (srcSide === dstSide) {
        if (Math.abs(src.y - dst.y) < EPS) {
          return undefined;
        }
        const intX =
          srcSide === 'left' ? Math.min(src.x, dst.x) - ANCHOR : Math.max(src.x, dst.x) + ANCHOR;
        return [src, { x: intX, y: src.y }, { x: intX, y: dst.y }, dst];
      }
      return undefined;
    }

    // Case B: src vertical, dst vertical.
    if (!srcH && !dstH) {
      // Same-side pairing (top-top or bottom-bottom): route via an
      // intermediate y that lies OUTSIDE both nodes by at least ANCHOR
      // so port-direction and border-hug checks are satisfied. The
      // intermediate y is min(src.y, dst.y) - ANCHOR for top-top, or
      // max(src.y, dst.y) + ANCHOR for bottom-bottom. Always produces a
      // 2-bend path, never 1.
      if (srcSide === dstSide) {
        if (Math.abs(src.x - dst.x) < EPS) {
          // Same x: a straight vertical line doesn't produce a valid
          // two-same-side exit/entry, reject.
          return undefined;
        }
        const intY =
          srcSide === 'top' ? Math.min(src.y, dst.y) - ANCHOR : Math.max(src.y, dst.y) + ANCHOR;
        return [src, { x: src.x, y: intY }, { x: dst.x, y: intY }, dst];
      }
      // Opposite-side pairing (src top ↔ dst bottom or vice versa).
      // Valid only if the two nodes' port directions point toward each
      // other: src bottom going down while dst top is at a larger y, or
      // src top going up while dst bottom is at a smaller y.
      const sameDir =
        (srcSide === 'bottom' && dstSide === 'top' && src.y < dst.y) ||
        (srcSide === 'top' && dstSide === 'bottom' && src.y > dst.y);
      if (!sameDir) {
        return undefined;
      }
      if (Math.abs(src.x - dst.x) < EPS) {
        return [src, dst];
      }
      const midY = (src.y + dst.y) / 2;
      return [src, { x: src.x, y: midY }, { x: dst.x, y: midY }, dst];
    }

    // Case C: src horizontal, dst vertical — 1 bend L-shape.
    if (srcH && !dstH) {
      const sameDirSrc =
        (srcSide === 'right' && dst.x > src.x) || (srcSide === 'left' && dst.x < src.x);
      const sameDirDst =
        (dstSide === 'top' && src.y < dst.y) || (dstSide === 'bottom' && src.y > dst.y);
      if (!sameDirSrc || !sameDirDst) {
        return undefined;
      }
      return [src, { x: dst.x, y: src.y }, dst];
    }

    // Case D: src vertical, dst horizontal — 1 bend L-shape.
    const sameDirSrc =
      (srcSide === 'bottom' && dst.y > src.y) || (srcSide === 'top' && dst.y < src.y);
    const sameDirDst =
      (dstSide === 'left' && src.x < dst.x) || (dstSide === 'right' && src.x > dst.x);
    if (!sameDirSrc || !sameDirDst) {
      return undefined;
    }
    return [src, { x: src.x, y: dst.y }, dst];
  };

  const outsideTracks = {
    top: Math.min(...realNodeRects.map((node) => node.rect.top)) - ANCHOR,
    bottom: Math.max(...realNodeRects.map((node) => node.rect.bottom)) + ANCHOR,
    left: Math.min(...realNodeRects.map((node) => node.rect.left)) - ANCHOR,
    right: Math.max(...realNodeRects.map((node) => node.rect.right)) + ANCHOR,
  };

  const buildOrthogonalPathCandidates = (
    src: { x: number; y: number },
    srcSide: RectSide,
    dst: { x: number; y: number },
    dstSide: RectSide
  ): { x: number; y: number }[][] => {
    const paths: { x: number; y: number }[][] = [];
    const base = buildOrthogonalPath(src, srcSide, dst, dstSide);
    if (base) {
      paths.push(base);
    }

    // Crossing-reduction extension of the same-side detour rule above:
    // when the local "just outside these two ports" track still crosses
    // an existing connector, also try the corresponding global outer
    // channel. This mirrors Wybrow-style post-route nudging/ordering:
    // preserve the port pair and topology class, but move the maximal
    // middle segment into an uncongested alley if safety checks accept it.
    if (srcSide === dstSide) {
      if (srcSide === 'top') {
        paths.push([
          src,
          { x: src.x, y: outsideTracks.top },
          { x: dst.x, y: outsideTracks.top },
          dst,
        ]);
      } else if (srcSide === 'bottom') {
        paths.push([
          src,
          { x: src.x, y: outsideTracks.bottom },
          { x: dst.x, y: outsideTracks.bottom },
          dst,
        ]);
      } else if (srcSide === 'left') {
        paths.push([
          src,
          { x: outsideTracks.left, y: src.y },
          { x: outsideTracks.left, y: dst.y },
          dst,
        ]);
      } else {
        paths.push([
          src,
          { x: outsideTracks.right, y: src.y },
          { x: outsideTracks.right, y: dst.y },
          dst,
        ]);
      }
    }

    return paths;
  };

  const pathHitsNode = (pts: { x: number; y: number }[], excludeIds: string[]): boolean => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (segmentHitsAnyRect(a, b, realNodeRects, excludeIds, 1)) {
        return true;
      }
    }
    return false;
  };

  const pathConflictCount = (
    path: { x: number; y: number }[],
    currentEdge: any,
    includeIncidentEdges = false
  ): number => {
    let conflicts = 0;
    const currentStart = (currentEdge as { start?: string }).start;
    const currentEnd = (currentEdge as { end?: string }).end;
    for (const other of edges) {
      if (other === currentEdge || (other as { isLayoutOnly?: boolean }).isLayoutOnly) {
        continue;
      }
      const otherStart = (other as { start?: string }).start;
      const otherEnd = (other as { end?: string }).end;
      if (
        !includeIncidentEdges &&
        currentStart &&
        currentEnd &&
        (otherStart === currentStart ||
          otherStart === currentEnd ||
          otherEnd === currentStart ||
          otherEnd === currentEnd)
      ) {
        continue;
      }
      const otherPts = (other as { points?: { x: number; y: number }[] }).points;
      if (!otherPts || otherPts.length < 2) {
        continue;
      }
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const aH = Math.abs(a.y - b.y) < EPS;
        const aV = Math.abs(a.x - b.x) < EPS;
        for (let j = 0; j < otherPts.length - 1; j++) {
          const c = otherPts[j];
          const d = otherPts[j + 1];
          if (orthogonalSegmentsCross(a, b, c, d, EPS, EPS)) {
            conflicts++;
            continue;
          }
          const cH = Math.abs(c.y - d.y) < EPS;
          const cV = Math.abs(c.x - d.x) < EPS;
          if (aH && cH && Math.abs(a.y - c.y) < EPS) {
            if (overlapLength(a.x, b.x, c.x, d.x) >= MIN_SHARED) {
              conflicts++;
            }
          } else if (aV && cV && Math.abs(a.x - c.x) < EPS) {
            if (overlapLength(a.y, b.y, c.y, d.y) >= MIN_SHARED) {
              conflicts++;
            }
          }
        }
      }
    }
    return conflicts;
  };

  const BEND_THRESHOLD = 4;

  // Collect which node faces are already claimed by other edges so the
  // rewrite loop below can reject a candidate port pair whose face is
  // contested. This realizes Hegemann-Wolff's bend-or-end global
  // feasibility rule (src d30cdbe1): two edges claiming the same node
  // face must be feasibility-checked as a set, never accepted as a
  // sequential patch.
  //
  // Iter 9 defect: raykov routed L_D_E_0 around H with 4 bends and
  // L_E_F_0 cleanly at E.top in parallel; this pass then rewrote
  // L_D_E_0 to the 2-bend (D.top, E.top) L-shape because it only
  // checked against real-node obstacles and was blind to the E.top
  // claim L_E_F_0 had already made.
  //
  // Note the face-detection uses `nearestSideOfRect` which picks
  // whichever of the 4 rect edges the point is closest to. The
  // polyline endpoints at this point in the pipeline are ALREADY
  // transformed to TB coordinates but the final endpoint-clip pass
  // (which snaps each endpoint onto the actual rect boundary) runs
  // LATER, so the raw attach points may sit a few units inside the
  // node rect. Nearest-side works regardless of whether the point is
  // on, just outside, or a few units inside the rect.
  const nearestSideOfRect = (pt: { x: number; y: number }, info: NodeBoundsInfo): RectSide => {
    const dTop = Math.abs(pt.y - info.rect.top);
    const dBottom = Math.abs(pt.y - info.rect.bottom);
    const dLeft = Math.abs(pt.x - info.rect.left);
    const dRight = Math.abs(pt.x - info.rect.right);
    let best: RectSide = 'top';
    let bestDist = dTop;
    if (dBottom < bestDist) {
      best = 'bottom';
      bestDist = dBottom;
    }
    if (dLeft < bestDist) {
      best = 'left';
      bestDist = dLeft;
    }
    if (dRight < bestDist) {
      best = 'right';
      bestDist = dRight;
    }
    return best;
  };

  interface FaceClaim {
    side: RectSide;
    edgeId: string;
  }
  const faceClaims = new Map<string, FaceClaim[]>();
  const addFaceClaim = (nodeId: string, side: RectSide, edgeId: string) => {
    if (!faceClaims.has(nodeId)) {
      faceClaims.set(nodeId, []);
    }
    faceClaims.get(nodeId)!.push({ side, edgeId });
  };
  for (const e of edges) {
    if ((e as { isLayoutOnly?: boolean }).isLayoutOnly) {
      continue;
    }
    const pts = (e as { points?: { x: number; y: number }[] }).points ?? [];
    if (pts.length < 1) {
      continue;
    }
    const eId = (e as { id?: string }).id ?? '';
    const startId = (e as { start?: string }).start;
    const endId = (e as { end?: string }).end;
    if (startId) {
      const info = nodeInfoById.get(startId);
      if (info) {
        addFaceClaim(startId, nearestSideOfRect(pts[0], info), eId);
      }
    }
    if (endId) {
      const info = nodeInfoById.get(endId);
      if (info) {
        addFaceClaim(endId, nearestSideOfRect(pts[pts.length - 1], info), eId);
      }
    }
  }

  const faceIsClaimed = (nodeId: string, side: RectSide, ignoreEdgeId: string): boolean => {
    const claims = faceClaims.get(nodeId);
    if (!claims) {
      return false;
    }
    for (const c of claims) {
      if (c.edgeId === ignoreEdgeId) {
        continue;
      }
      if (c.side === side) {
        return true;
      }
    }
    return false;
  };

  for (const edge of edges) {
    if (edge.isLayoutOnly) {
      continue;
    }
    const pts = edge.points as { x: number; y: number }[] | undefined;
    if (!pts || pts.length < 2) {
      continue;
    }
    const currentBends = countBends(pts);
    if (currentBends < BEND_THRESHOLD) {
      continue;
    }
    const srcId = edge.start as string | undefined;
    const dstId = edge.end as string | undefined;
    if (!srcId || !dstId) {
      continue;
    }
    const srcInfo = nodeInfoById.get(srcId);
    const dstInfo = nodeInfoById.get(dstId);
    if (!srcInfo || !dstInfo) {
      continue;
    }
    const edgeId = (edge as { id?: string }).id ?? '';
    const currentCrossingConflicts = pathConflictCount(pts, edge, true);

    let bestPath: { x: number; y: number }[] | undefined;
    let bestCrossingConflicts = currentCrossingConflicts;
    let bestBends = currentBends;

    for (const srcSide of sides) {
      if (faceIsClaimed(srcId, srcSide, edgeId)) {
        continue;
      }
      const srcPort = portForRectSide(srcInfo, srcSide);
      for (const dstSide of sides) {
        if (faceIsClaimed(dstId, dstSide, edgeId)) {
          continue;
        }
        const dstPort = portForRectSide(dstInfo, dstSide);
        for (const path of buildOrthogonalPathCandidates(srcPort, srcSide, dstPort, dstSide)) {
          if (pathHitsNode(path, [srcId, dstId])) {
            continue;
          }

          const pathBends = countBends(path);
          if (currentCrossingConflicts > 0) {
            const pathCrossingConflicts = pathConflictCount(path, edge, true);
            if (
              pathCrossingConflicts > bestCrossingConflicts ||
              (pathCrossingConflicts === bestCrossingConflicts && pathBends >= bestBends)
            ) {
              continue;
            }
            bestCrossingConflicts = pathCrossingConflicts;
            bestBends = pathBends;
            bestPath = path;
            continue;
          }

          if (pathConflictCount(path, edge) > pathConflictCount(pts, edge)) {
            continue;
          }
          if (pathBends < bestBends) {
            bestBends = pathBends;
            bestPath = path;
          }
        }
      }
    }

    if (bestPath) {
      (edge as { points: { x: number; y: number }[] }).points = bestPath;
      // Refresh face claims for this edge so downstream iterations
      // see the new attach sides. The loop mutates edges in place;
      // stale claims would let two edges both commit to the same face.
      const refreshSrc = faceClaims.get(srcId);
      if (refreshSrc) {
        faceClaims.set(
          srcId,
          refreshSrc.filter((c) => c.edgeId !== edgeId)
        );
      }
      const refreshDst = faceClaims.get(dstId);
      if (refreshDst) {
        faceClaims.set(
          dstId,
          refreshDst.filter((c) => c.edgeId !== edgeId)
        );
      }
      addFaceClaim(srcId, nearestSideOfRect(bestPath[0], srcInfo), edgeId);
      addFaceClaim(dstId, nearestSideOfRect(bestPath[bestPath.length - 1], dstInfo), edgeId);
    }
  }
}
