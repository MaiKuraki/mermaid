import type { SVG } from '../../../mermaid.js';
import type { D3Selection } from '../../../types.js';
import { createGraphWithElements } from '../../createGraph.js';
import insertMarkers from '../../rendering-elements/markers.js';
import { clear as clearGraphlib } from '../dagre/mermaid-graphlib.js';
import { clear as clearNodes } from '../../rendering-elements/nodes.js';
import { clear as clearClusters } from '../../rendering-elements/clusters.js';
import { clear as clearEdges } from '../../rendering-elements/edges.js';
import type { LayoutData } from '../../types.js';
import { adjustLayout } from '../ipsecCola/adjustLayout.js';
import { prepareLayoutForSwimlanes } from './helpers.js';
import { createEdgeLabelNodes } from './edgeLabelNodes.js';
import { log } from '../../../logger.js';
import { runSwimlaneLayoutCore } from './layoutCore.js';

// Feature flag for edge labels as nodes - can be toggled for testing
const USE_EDGE_LABEL_NODES = true;

// Debug log prefix for swimlane layout issues
const SWIMLANE_DEBUG = '[SWIMLANE_DEBUG]';

export async function render(data4Layout: LayoutData, svg: SVG) {
  const element = svg.select('g') as unknown as D3Selection<SVGElement>;
  // Insert markers and clear previous elements
  insertMarkers(element, data4Layout.markers, data4Layout.type, data4Layout.diagramId);
  clearNodes();
  clearEdges();
  clearClusters();
  clearGraphlib();

  // Prepare layout data: render all group nodes using the swimlane cluster shape
  prepareLayoutForSwimlanes(data4Layout);

  // Debug: Log initial edges with labels before transformation
  log.debug(SWIMLANE_DEBUG, 'Initial edges with labels:');
  for (const edge of data4Layout.edges ?? []) {
    if (edge.label && edge.label.length > 0) {
      log.debug(
        SWIMLANE_DEBUG,
        `  Edge ${edge.id}: ${edge.start} -> ${edge.end}, label="${edge.label}"`
      );
    }
  }

  // Transform edges with labels into label nodes
  // This allows labels to participate in the Sugiyama layout
  if (USE_EDGE_LABEL_NODES) {
    const { data: transformedData, labelNodeMap } = createEdgeLabelNodes(data4Layout);
    // Update the layout data in place
    data4Layout.nodes = transformedData.nodes;
    data4Layout.edges = transformedData.edges;
    log.debug('[Swimlanes] Created edge label nodes:', labelNodeMap.size);

    // Debug: Log created label nodes
    log.debug(SWIMLANE_DEBUG, 'Created label nodes:');
    for (const [edgeId, labelNodeId] of labelNodeMap) {
      const labelNode = data4Layout.nodes.find((n: any) => n.id === labelNodeId);
      log.debug(
        SWIMLANE_DEBUG,
        `  ${edgeId} -> labelNode: ${labelNodeId}, parentId=${labelNode?.parentId}, w=${labelNode?.width}, h=${labelNode?.height}`
      );
    }
  }

  // Create the graph and insert the SVG groups and nodes
  const { groups } = await createGraphWithElements(element, data4Layout);

  runSwimlaneLayoutCore(data4Layout);

  await adjustLayout(data4Layout, groups);
}
