import { describe, expect, it } from 'vitest';
import { lookFor } from '../src/render/character.ts';
import { NEUTRAL, partsFor, pose3d } from '../src/render/figure.ts';
import { Motion } from '../src/render/motion.ts';

const parts = partsFor(lookFor('Plan', 'sub'));

describe('3D 캐릭터', () => {
  it('어느 쪽을 봐도 다각형이 제대로 투영된다', () => {
    for (let h = -Math.PI; h < Math.PI; h += Math.PI / 8) {
      const p = pose3d(parts, NEUTRAL, h, null);
      expect(p.faces.length).toBeGreaterThan(20);
      for (const f of p.faces) expect(f.points).toMatch(/^(-?[\d.]+,-?[\d.]+ ){3}-?[\d.]+,-?[\d.]+$/);
    }
  });

  it('자세에 맞는 소품만 든다', () => {
    const book = pose3d(parts, NEUTRAL, 0, 'book').faces.length;
    const none = pose3d(parts, NEUTRAL, 0, null).faces.length;
    expect(book).toBeGreaterThan(none);
  });

  it('걸으면 가는 쪽으로 돌고 발을 디딘다', () => {
    const m = new Motion('a');
    let steps = 0;
    let heading = 0;
    for (let i = 0; i <= 60; i++) {
      const f = m.update({ x: 5, y: 2 + i * 0.07 }, 'walk', null, 1000 + i * 16);
      steps += f.steps.length;
      heading = f.heading;
    }
    expect(heading).toBeCloseTo(Math.PI / 2, 1);
    expect(steps).toBeGreaterThan(2);
  });

  it('멈추면 일하는 쪽을 본다', () => {
    const m = new Motion('b');
    let heading = 0;
    for (let i = 0; i <= 60; i++) heading = m.update({ x: 5, y: 2 }, 'type', -Math.PI / 2, 1000 + i * 16).heading;
    expect(heading).toBeCloseTo(-Math.PI / 2, 2);
  });
});
