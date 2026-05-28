import type { Edge, Node } from '../../../types.js';
import {
  dedupeConsecutivePoints,
  isHorizontalSegment,
  isVerticalSegment,
  overlapLength,
  segmentBoundsOverlapRect,
} from './geometry.js';
import type { Point, RectBounds } from './geometry.js';

export function nudgeSharedInteriorSubpaths(edges: Edge[], nodeByIdMap: Map<string, Node>): void {
  const EPS_LOCAL = 1e-3;
  const MIN_SHARED = 8;
  const TRACK_SHIFT = 7;
  const BUFFER = 2;
  const MAX_ITERATIONS = 12;

  type PointLite = Point;
  type RectLite = RectBounds;

  interface SegmentLite {
    edge: Edge;
    index: number;
    a: PointLite;
    b: PointLite;
    horizontal: boolean;
    vertical: boolean;
    interior: boolean;
  }

  const realNodeRects: { id: string; rect: RectLite }[] = [];
  const labelRects: { id: string; rect: RectLite }[] = [];
  for (const n of nodeByIdMap.values()) {
    if (n.isGroup) {
      continue;
    }
    const cx = n.x ?? 0;
    const cy = n.y ?? 0;
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    if (w <= 0 || h <= 0) {
      continue;
    }
    const rect: RectLite = {
      left: cx - w / 2,
      right: cx + w / 2,
      top: cy - h / 2,
      bottom: cy + h / 2,
    };
    const id = n.id;
    if (n.isEdgeLabel) {
      labelRects.push({ id, rect });
    } else {
      realNodeRects.push({ id, rect });
    }
  }

  const sameAxisOverlap = (a: SegmentLite, b: SegmentLite): number => {
    if (a.horizontal && b.horizontal && Math.abs(a.a.y - b.a.y) < EPS_LOCAL) {
      return overlapLength(a.a.x, a.b.x, b.a.x, b.b.x);
    }
    if (a.vertical && b.vertical && Math.abs(a.a.x - b.a.x) < EPS_LOCAL) {
      return overlapLength(a.a.y, a.b.y, b.a.y, b.b.y);
    }
    return 0;
  };

  const segmentsCrossStrict = (
    a1: PointLite,
    a2: PointLite,
    b1: PointLite,
    b2: PointLite
  ): boolean => {
    const aHoriz = isHorizontalSegment(a1, a2);
    const aVert = isVerticalSegment(a1, a2);
    const bHoriz = isHorizontalSegment(b1, b2);
    const bVert = isVerticalSegment(b1, b2);
    if (!((aHoriz && bVert) || (aVert && bHoriz))) {
      return false;
    }
    const h = aHoriz ? { a: a1, b: a2 } : { a: b1, b: b2 };
    const v = aHoriz ? { a: b1, b: b2 } : { a: a1, b: a2 };
    const hY = h.a.y;
    const hXMin = Math.min(h.a.x, h.b.x);
    const hXMax = Math.max(h.a.x, h.b.x);
    const vX = v.a.x;
    const vYMin = Math.min(v.a.y, v.b.y);
    const vYMax = Math.max(v.a.y, v.b.y);
    return (
      vX > hXMin + EPS_LOCAL &&
      vX < hXMax - EPS_LOCAL &&
      hY > vYMin + EPS_LOCAL &&
      hY < vYMax - EPS_LOCAL
    );
  };

  const segmentsFor = (edge: Edge, points: PointLite[]): SegmentLite[] => {
    const result: SegmentLite[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const horizontal = isHorizontalSegment(a, b);
      const vertical = isVerticalSegment(a, b);
      if (!horizontal && !vertical) {
        continue;
      }
      result.push({
        edge,
        index: i,
        a,
        b,
        horizontal,
        vertical,
        interior: i >= 1 && i <= points.length - 3,
      });
    }
    return result;
  };

  const allSegments = (): SegmentLite[] => {
    const result: SegmentLite[] = [];
    for (const edge of edges) {
      if (edge.isLayoutOnly) {
        continue;
      }
      const points = edge.points;
      if (!points || points.length < 2) {
        continue;
      }
      result.push(...segmentsFor(edge, dedupeConsecutivePoints(points)));
    }
    return result;
  };

  const candidateIsSafe = (edge: Edge, candidate: PointLite[]): boolean => {
    const sourceId = edge.start;
    const targetId = edge.end;
    const candidateSegments = segmentsFor(edge, candidate);
    if (candidateSegments.length !== candidate.length - 1) {
      return false;
    }

    for (const segment of candidateSegments) {
      for (const nodeRect of realNodeRects) {
        if (nodeRect.id === sourceId || nodeRect.id === targetId) {
          continue;
        }
        if (segmentBoundsOverlapRect(segment.a, segment.b, nodeRect.rect, BUFFER)) {
          return false;
        }
      }
      const ownLabelId = edge.labelNodeId;
      for (const labelRect of labelRects) {
        if (ownLabelId && labelRect.id === ownLabelId) {
          continue;
        }
        if (segmentBoundsOverlapRect(segment.a, segment.b, labelRect.rect, BUFFER)) {
          return false;
        }
      }
    }

    for (const other of edges) {
      if (other === edge || other.isLayoutOnly) {
        continue;
      }
      const otherPoints = other.points;
      if (!otherPoints || otherPoints.length < 2) {
        continue;
      }
      for (const candidateSegment of candidateSegments) {
        for (const otherSegment of segmentsFor(other, dedupeConsecutivePoints(otherPoints))) {
          if (sameAxisOverlap(candidateSegment, otherSegment) >= MIN_SHARED) {
            return false;
          }
          if (
            segmentsCrossStrict(
              candidateSegment.a,
              candidateSegment.b,
              otherSegment.a,
              otherSegment.b
            )
          ) {
            return false;
          }
        }
      }
    }

    return true;
  };

  const shiftedCandidate = (segment: SegmentLite, shift: number): PointLite[] | undefined => {
    const points = dedupeConsecutivePoints(segment.edge.points ?? []);
    if (points.length < 4 || segment.index >= points.length - 1) {
      return undefined;
    }
    const candidate = points.map((p) => ({ ...p }));
    if (segment.horizontal) {
      candidate[segment.index].y += shift;
      candidate[segment.index + 1].y += shift;
    } else if (segment.vertical) {
      candidate[segment.index].x += shift;
      candidate[segment.index + 1].x += shift;
    } else {
      return undefined;
    }
    return segmentsFor(segment.edge, candidate).length === candidate.length - 1
      ? candidate
      : undefined;
  };

  const shifts = [
    -TRACK_SHIFT,
    TRACK_SHIFT,
    -2 * TRACK_SHIFT,
    2 * TRACK_SHIFT,
    -3 * TRACK_SHIFT,
    3 * TRACK_SHIFT,
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const segments = allSegments();
    let fixed = false;

    for (let i = 0; i < segments.length && !fixed; i++) {
      for (let j = i + 1; j < segments.length && !fixed; j++) {
        const first = segments[i];
        const second = segments[j];
        if (first.edge === second.edge || sameAxisOverlap(first, second) < MIN_SHARED) {
          continue;
        }

        const candidates = [first, second].filter((segment) => segment.interior);
        for (const segment of candidates) {
          for (const shift of shifts) {
            const candidate = shiftedCandidate(segment, shift);
            if (!candidate || !candidateIsSafe(segment.edge, candidate)) {
              continue;
            }

            segment.edge.points = candidate;
            fixed = true;
            break;
          }
          if (fixed) {
            break;
          }
        }
      }
    }

    if (!fixed) {
      return;
    }
  }
}
