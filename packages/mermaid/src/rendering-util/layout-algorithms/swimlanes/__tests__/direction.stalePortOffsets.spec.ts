import { describe, expect, it } from 'vitest';
import { straightenStalePortOffsets } from '../direction/stalePortOffsets.js';

describe('straightenStalePortOffsets', () => {
  it('collapses a short HVH stale port offset into a straight line', () => {
    const nodeById = new Map<string, any>([
      ['A', { id: 'A', x: 0, y: 0, width: 20, height: 40 }],
      ['B', { id: 'B', x: 100, y: 0, width: 20, height: 40 }],
    ]);
    const edges: any[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 10, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 8 },
          { x: 90, y: 8 },
        ],
      },
    ];

    straightenStalePortOffsets(edges, nodeById);

    expect(edges[0].points).toEqual([
      { x: 10, y: 0 },
      { x: 90, y: 0 },
    ]);
  });
});
