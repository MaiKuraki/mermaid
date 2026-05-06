import { describe, expect, it } from 'vitest';
import { nudgeInteriorVerticalsFromObstacles } from '../direction/obstacleNudging.js';

describe('nudgeInteriorVerticalsFromObstacles', () => {
  it('moves an interior vertical away from a nearby obstacle face', () => {
    const nodeById = new Map<string, any>([
      ['J', { id: 'J', x: 120, y: 50, width: 40, height: 80 }],
    ]);
    const edges: any[] = [
      {
        id: 'A_B',
        start: 'A',
        end: 'B',
        points: [
          { x: 0, y: 0 },
          { x: 90, y: 0 },
          { x: 90, y: 100 },
          { x: 160, y: 100 },
        ],
      },
    ];

    nudgeInteriorVerticalsFromObstacles(edges, nodeById);

    expect(edges[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
      { x: 160, y: 100 },
    ]);
  });
});
