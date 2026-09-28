import { describe, expect, it } from 'vitest';
import { clampSpan, lineRects, measureSpan } from '../measure';

describe('clampSpan', () => {
  it('keeps a span inside the text', () => {
    expect(clampSpan([3, 19], 19)).toEqual([3, 19]);
    expect(clampSpan([-4, 5], 10)).toEqual([0, 5]);
    expect(clampSpan([4, 99], 10)).toEqual([4, 10]);
  });

  it('drops empty, reversed and non-numeric spans', () => {
    expect(clampSpan([5, 5], 10)).toBeNull();
    expect(clampSpan([7, 2], 10)).toBeNull();
    expect(clampSpan([12, 20], 10)).toBeNull();
    expect(clampSpan([Number.NaN, 3], 10)).toBeNull();
  });
});

describe('lineRects', () => {
  const origin = { left: 100, top: 50 };

  it('one fragment → one rect relative to the strip', () => {
    expect(lineRects([{ left: 130, top: 60, width: 80, height: 28 }], origin)).toEqual([
      { x: 30, y: 10, width: 80, height: 28 },
    ]);
  });

  it('fragments on one line merge; a wrapped span gives one rect per line, top to bottom', () => {
    const rects = [
      { left: 400, top: 88, width: 60, height: 28 }, // line 2, second inline box
      { left: 300, top: 60, width: 200, height: 28 }, // line 1
      { left: 100, top: 88, width: 300, height: 28 }, // line 2, first inline box
    ];
    expect(lineRects(rects, origin)).toEqual([
      { x: 200, y: 10, width: 200, height: 28 },
      { x: 0, y: 38, width: 360, height: 28 },
    ]);
  });

  it('ignores zero-width line-end fragments', () => {
    expect(
      lineRects(
        [
          { left: 500, top: 60, width: 0, height: 28 },
          { left: 100, top: 88, width: 40, height: 28 },
        ],
        origin,
      ),
    ).toEqual([{ x: 0, y: 38, width: 40, height: 28 }]);
  });
});

describe('measureSpan', () => {
  it('builds a Range over exactly the span characters of the text node', () => {
    const box = document.createElement('p');
    box.textContent = 'by 30 to 40 percent';
    document.body.append(box);
    const text = box.firstChild as Text;
    const seen: [number, number][] = [];
    const proto = Range.prototype as Range & { getClientRects: () => DOMRectList };
    const original = proto.getClientRects;
    // jsdom has no layout: report the range it was asked for as a single fragment.
    proto.getClientRects = function (this: Range) {
      seen.push([this.startOffset, this.endOffset]);
      return [{ left: this.startOffset * 10, top: 0, width: (this.endOffset - this.startOffset) * 10, height: 20 }] as unknown as DOMRectList;
    };
    try {
      expect(measureSpan(text, [3, 19], box)).toEqual([{ x: 30, y: 0, width: 160, height: 20 }]);
      expect(seen).toEqual([[3, 19]]);
      expect(text.data.slice(3, 19)).toBe('30 to 40 percent');
      expect(measureSpan(text, [30, 40], box)).toEqual([]);
    } finally {
      proto.getClientRects = original;
      box.remove();
    }
  });
});
