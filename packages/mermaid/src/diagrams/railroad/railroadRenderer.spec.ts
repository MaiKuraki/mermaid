import { beforeEach, describe, expect, it } from 'vitest';
import type { Diagram } from '../../Diagram.js';
import { reset } from '../../config.js';
import { db } from './railroadDb.js';
import { renderer } from './railroadRenderer.js';
import { parser } from './parser/railroadParser.js';

const diagramId = 'railroad-test';

const stubSvgTextMeasurement = (): void => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: function (this: SVGElement) {
      const text = this.textContent ?? '';

      return {
        x: 0,
        y: 0,
        width: Math.max(text.length * 8, 1),
        height: 16,
      };
    },
  });
};

describe('Railroad Renderer', () => {
  beforeEach(() => {
    reset();
    db.clear();
    document.body.innerHTML = `<svg id="${diagramId}"></svg>`;
    stubSvgTextMeasurement();
  });

  it('sets a viewBox that includes the full rendered diagram height', () => {
    const text = `railroad-diagram
sign = choice(terminal("+"), terminal("-")) ;
number = sequence(optional(nonterminal("sign")), oneOrMore(nonterminal("digit"))) ;
list = sequence(terminal("["), optional(sequence(nonterminal("number"), zeroOrMore(sequence(terminal(","), nonterminal("number"))))), terminal("]")) ;
digit = choice(terminal("0"), terminal("1"), terminal("2"), terminal("3")) ;
`;

    void parser.parse(text);
    void renderer.draw(text, diagramId, '1.0.0', { db } as unknown as Diagram);

    const svg = document.getElementById(diagramId);
    if (!svg) {
      throw new Error('Expected railroad SVG to be rendered');
    }

    const viewBox = svg.getAttribute('viewBox');
    if (!viewBox) {
      throw new Error('Expected railroad SVG to have a viewBox');
    }

    const [x, y, width, height] = viewBox.split(' ').map(Number);

    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(150);
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('style')).toContain(`max-width: ${width}px`);
  });

  it('aligns rule markers with the centerline of tall expressions', () => {
    const text = `railroad-diagram
sign = choice(terminal("+"), terminal("-")) ;
`;

    void parser.parse(text);
    void renderer.draw(text, diagramId, '1.0.0', { db } as unknown as Diagram);

    const startMarker = document.querySelector<SVGCircleElement>('.railroad-start circle');
    const endMarker = document.querySelector<SVGCircleElement>('.railroad-end circle');
    const ruleName = document.querySelector<SVGTextElement>('.railroad-rule-name');
    const choiceEntryPath = document.querySelector<SVGPathElement>(
      '.railroad-choice > .railroad-line'
    );

    expect(startMarker?.getAttribute('cy')).toBe('40');
    expect(endMarker?.getAttribute('cy')).toBe('40');
    expect(ruleName?.getAttribute('y')).toBe('40');
    expect(choiceEntryPath?.getAttribute('d')).toContain('M 0 40');
  });

  it('connects centered choice alternatives from the left edge', () => {
    const text = `railroad-diagram
term = choice(nonterminal("number"), sequence(terminal("("), nonterminal("expression"), terminal(")"))) ;
`;

    void parser.parse(text);
    void renderer.draw(text, diagramId, '1.0.0', { db } as unknown as Diagram);

    const numberGroup = document.querySelector<SVGGElement>(
      '.railroad-choice .railroad-nonterminal'
    );
    const choiceEntryPath = document.querySelector<SVGPathElement>(
      '.railroad-choice > .railroad-line'
    );

    expect(numberGroup?.getAttribute('transform')).toBe('translate(74, 0)');
    expect(choiceEntryPath?.getAttribute('d')).toContain('L 74 18');
  });
});
