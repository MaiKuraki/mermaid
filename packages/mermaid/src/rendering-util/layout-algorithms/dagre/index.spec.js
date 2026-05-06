import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll } from 'vitest';
import { Graph } from 'dagre-d3-es/src/graphlib/index.js';
import { getEdgesToRender } from './index.js';
import mermaid from '../../../mermaid.js';
import { mermaidAPI } from '../../../mermaidAPI.js';

const setOnProtectedConstant = (object, key, value) => {
  object[key] = value;
};

const setupDom = () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldMutationObserver = globalThis.MutationObserver;
  const dom = new JSDOM('<html lang="en"><body><div id="container"></div></body></html>', {
    resources: 'usable',
    beforeParse(window) {
      setOnProtectedConstant(window.Element.prototype, 'getBBox', () => ({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      }));
      setOnProtectedConstant(window.Element.prototype, 'getComputedTextLength', () => 50);
    },
  });

  setOnProtectedConstant(globalThis, 'window', dom.window);
  setOnProtectedConstant(globalThis, 'document', dom.window.document);
  setOnProtectedConstant(globalThis, 'MutationObserver', undefined);

  return () => {
    setOnProtectedConstant(globalThis, 'window', oldWindow);
    setOnProtectedConstant(globalThis, 'document', oldDocument);
    setOnProtectedConstant(globalThis, 'MutationObserver', oldMutationObserver);
  };
};

describe('getEdgesToRender', () => {
  beforeAll(async () => {
    await mermaid.registerExternalDiagrams([]);
    mermaid.initialize({
      deterministicIds: true,
      deterministicIDSeed: '',
      flowchart: { htmlLabels: false },
      logLevel: 5,
    });
  });

  it('creates one compact render edge from self-loop layout segments', () => {
    const graph = new Graph({ multigraph: true, compound: true });
    graph.setNode('A', { id: 'A', x: 10, y: 10, width: 20, height: 20 });

    const originalEdge = {
      id: 'A-A',
      start: 'A',
      end: 'A',
      label: 'loop',
      arrowTypeStart: 'normal',
      arrowTypeEnd: 'normal',
    };

    const segment1 = {
      ...originalEdge,
      id: 'A-cyclic-special-1',
      selfLoop: { id: 'A-A', order: 0 },
      originalEdge,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    const segmentMid = {
      ...originalEdge,
      id: 'A-cyclic-special-mid',
      selfLoop: { id: 'A-A', order: 1 },
      originalEdge,
      points: [
        { x: 10, y: 0 },
        { x: 20, y: 10 },
      ],
    };
    const segment2 = {
      ...originalEdge,
      id: 'A-cyclic-special-2',
      selfLoop: { id: 'A-A', order: 2 },
      originalEdge,
      points: [
        { x: 20, y: 10 },
        { x: 30, y: 10 },
      ],
    };

    graph.setNode('A---A---1', { id: 'A---A---1' });
    graph.setNode('A---A---2', { id: 'A---A---2' });
    graph.setEdge('A', 'A---A---1', segment1, 'A-cyclic-special-0');
    graph.setEdge('A---A---1', 'A---A---2', segmentMid, 'A-cyclic-special-1');
    graph.setEdge('A---A---2', 'A', segment2, 'A-cyclic-special-2');

    const edgesToRender = getEdgesToRender(graph);

    expect(edgesToRender).toHaveLength(1);
    expect(edgesToRender[0].edge.id).toBe('A-A');
    expect(edgesToRender[0].edge.selfLoop).toBeUndefined();
    expect(edgesToRender[0].edge.points).toEqual([
      { x: -8, y: 0 },
      { x: -8, y: -24 },
      { x: 28, y: -24 },
      { x: 28, y: 0 },
    ]);
    expect(edgesToRender[0].edge.x).toBe(10);
    expect(edgesToRender[0].edge.y).toBe(-28);
    expect(edgesToRender[0].edge.label).toBe('loop');
  });

  it('places compact self-loops on the side chosen by the layout', () => {
    const graph = new Graph({ multigraph: true, compound: true });
    graph.setNode('A', { id: 'A', x: 10, y: 10, width: 20, height: 20 });
    graph.setNode('A---A---1', { id: 'A---A---1', x: 80, y: 5 });
    graph.setNode('A---A---2', { id: 'A---A---2', x: 80, y: 15 });

    const originalEdge = {
      id: 'A-A',
      start: 'A',
      end: 'A',
      label: 'loop',
      arrowTypeStart: 'normal',
      arrowTypeEnd: 'normal',
    };
    const segment1 = {
      ...originalEdge,
      id: 'A-cyclic-special-1',
      selfLoop: { id: 'A-A', order: 0 },
      originalEdge,
      points: [],
    };
    const segmentMid = {
      ...originalEdge,
      id: 'A-cyclic-special-mid',
      selfLoop: { id: 'A-A', order: 1 },
      originalEdge,
      points: [],
      width: 20,
      height: 10,
    };
    const segment2 = {
      ...originalEdge,
      id: 'A-cyclic-special-2',
      selfLoop: { id: 'A-A', order: 2 },
      originalEdge,
      points: [],
    };

    graph.setEdge('A', 'A---A---1', segment1, 'A-cyclic-special-0');
    graph.setEdge('A---A---1', 'A---A---2', segmentMid, 'A-cyclic-special-1');
    graph.setEdge('A---A---2', 'A', segment2, 'A-cyclic-special-2');

    const edgesToRender = getEdgesToRender(graph);

    expect(edgesToRender[0].edge.points).toEqual([
      { x: 20, y: -8 },
      { x: 44, y: -8 },
      { x: 44, y: 28 },
      { x: 20, y: 28 },
    ]);
    expect(edgesToRender[0].edge.x).toBe(58);
    expect(edgesToRender[0].edge.y).toBe(10);
  });

  it('keeps regular edges unchanged', () => {
    const graph = new Graph({ multigraph: true, compound: true });
    graph.setNode('A', { id: 'A' });
    graph.setNode('B', { id: 'B' });
    const edge = {
      id: 'A-B',
      start: 'A',
      end: 'B',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    graph.setEdge('A', 'B', edge, 'A-B');

    const edgesToRender = getEdgesToRender(graph);

    expect(edgesToRender).toHaveLength(1);
    expect(edgesToRender[0]).toEqual({ edge, start: 'A', end: 'B' });
  });

  it('renders a flowchart self-loop as one SVG path', async () => {
    const restoreDom = setupDom();

    try {
      const { svg } = await mermaidAPI.render(
        'self-loop-test',
        `flowchart TD
A[Christmas] -->|Get money| B(Go shopping)
C --> C`
      );
      const dom = new JSDOM(svg);
      const edgePaths = dom.window.document.querySelectorAll('.edgePaths path.flowchart-link');
      const selfLoopPath = [...edgePaths].find((path) =>
        path.getAttribute('data-id')?.includes('C')
      );
      expect(selfLoopPath).toBeTruthy();
      const points = JSON.parse(dom.window.atob(selfLoopPath.getAttribute('data-points')));
      const xValues = points.map((point) => point.x);
      const yValues = points.map((point) => point.y);

      expect(edgePaths).toHaveLength(2);
      expect(Math.max(...xValues) - Math.min(...xValues)).toBeLessThanOrEqual(100);
      expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThanOrEqual(60);
      expect(
        dom.window.document.querySelectorAll('.edgePaths path[data-id*="cyclic-special"]')
      ).toHaveLength(0);
    } finally {
      restoreDom();
    }
  });
});
