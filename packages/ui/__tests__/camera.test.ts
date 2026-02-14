import { describe, it, expect } from 'vitest';
import { computeBoundingBox, computeFocusFrame } from '../src/lib/camera.js';

describe('computeBoundingBox', () => {
  it('computes correct min/max/center for basic positions', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 100, y: 200 },
      { x: -50, y: 50 },
    ];
    const box = computeBoundingBox(positions);

    // Raw bounds: x [-50, 100], y [0, 200]
    // Width 150 < 200 → expanded to 200: x [-75, 125]  (center stays 25)
    // Height 200 ≥ 200 → no expansion
    // Then padding 80 applied to each side
    expect(box.cx).toBeCloseTo(25);
    expect(box.cy).toBeCloseTo(100);
    expect(box.minX).toBeLessThan(-50);
    expect(box.maxX).toBeGreaterThan(100);
    expect(box.minY).toBeLessThan(0);
    expect(box.maxY).toBeGreaterThan(200);
  });

  it('enforces minimum 200x200 for a single position', () => {
    const box = computeBoundingBox([{ x: 50, y: 50 }]);

    // Single point → raw 0x0 → expand to 200x200
    // Then 80px padding on each side → 360x360
    expect(box.width).toBeGreaterThanOrEqual(200 + 80 * 2);
    expect(box.height).toBeGreaterThanOrEqual(200 + 80 * 2);
    expect(box.cx).toBeCloseTo(50);
    expect(box.cy).toBeCloseTo(50);
  });

  it('returns a default box centered at origin for empty array', () => {
    const box = computeBoundingBox([]);
    expect(box.cx).toBe(0);
    expect(box.cy).toBe(0);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  it('applies padding correctly', () => {
    const noPad = computeBoundingBox([{ x: 0, y: 0 }, { x: 100, y: 100 }], 0);
    const withPad = computeBoundingBox(
      [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      50,
    );
    // With padding, the box should be exactly 100px wider and taller (50 per side)
    expect(withPad.width).toBeCloseTo(noPad.width + 100);
    expect(withPad.height).toBeCloseTo(noPad.height + 100);
  });
});

describe('computeFocusFrame', () => {
  it('produces a valid transform that frames all nodes in viewport', () => {
    const focused = { x: 100, y: 100 };
    const deps = [{ x: 200, y: 200 }];
    const dependants = [{ x: 0, y: 0 }];

    const t = computeFocusFrame(focused, dependants, deps, 800, 600);

    expect(t.k).toBeGreaterThan(0);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });

  it('handles root focused with no dependants', () => {
    const focused = { x: 50, y: 50 };
    const t = computeFocusFrame(focused, [], [], 800, 600);

    expect(t.k).toBeGreaterThan(0);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });

  it('clamps scale to [0.25, 4.0]', () => {
    // Very spread out points → tiny scale
    const farApart = computeFocusFrame(
      { x: 0, y: 0 },
      [{ x: 10000, y: 10000 }],
      [{ x: -10000, y: -10000 }],
      800,
      600,
    );
    expect(farApart.k).toBeGreaterThanOrEqual(0.25);

    // Single point with small viewport → would try very large scale
    const tight = computeFocusFrame(
      { x: 0, y: 0 },
      [],
      [],
      8000,
      6000,
    );
    expect(tight.k).toBeLessThanOrEqual(4.0);
  });
});

describe('camera spec compliance', () => {
  it('bounding box uses 80px default padding', () => {
    const box = computeBoundingBox([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    // With default 80px padding, the box should be larger by 160px in each dimension
    const noPad = computeBoundingBox([{ x: 0, y: 0 }, { x: 100, y: 100 }], 0);
    expect(box.width).toBeCloseTo(noPad.width + 160);
    expect(box.height).toBeCloseTo(noPad.height + 160);
  });

  it('focus frame scale is clamped between 0.25 and 4.0', () => {
    // Already tested but let's be explicit about both bounds
    const verySpread = computeFocusFrame(
      { x: 0, y: 0 },
      [{ x: 50000, y: 50000 }],
      [{ x: -50000, y: -50000 }],
      800, 600,
    );
    expect(verySpread.k).toBe(0.25);

    const veryTight = computeFocusFrame({ x: 0, y: 0 }, [], [], 16000, 12000);
    expect(veryTight.k).toBe(4.0);
  });

  it('focus frame centers bounding box in viewport', () => {
    const focused = { x: 100, y: 100 };
    const frame = computeFocusFrame(focused, [], [], 800, 600);
    // The transform should center the bounding box center in the viewport
    // x = vw/2 - cx * k, y = vh/2 - cy * k
    // With only focused point, cx=100, cy=100
    expect(frame.x).toBeCloseTo(800 / 2 - 100 * frame.k);
    expect(frame.y).toBeCloseTo(600 / 2 - 100 * frame.k);
  });
});
