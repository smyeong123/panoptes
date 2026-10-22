import type { Look } from './figure.ts';
import { esc } from './iso.ts';

function hashHue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function lookFor(type: string, role: 'main' | 'sub'): Look {
  if (role === 'main') return { outfit: '#d97757', pants: '#5b4636', hair: '#6b4a32', hat: 'beanie', tag: 'Claude' };
  const t = type.toLowerCase();
  if (t === 'explore') return { outfit: '#4fa36b', pants: '#4b5a3a', hair: '#3b2a1d', hat: 'explorer', tag: 'Explore' };
  if (t === 'plan') return { outfit: '#8e6ccf', pants: '#3e3555', hair: '#2a2233', hat: 'glasses', tag: 'Plan' };
  if (t === 'general-purpose') return { outfit: '#5b86c5', pants: '#3a4660', hair: '#4a3626', hat: 'headset', tag: 'General' };
  const hue = hashHue(type);
  return { outfit: `hsl(${hue} 50% 55%)`, pants: `hsl(${hue} 25% 30%)`, hair: '#3a2c22', hat: 'none', tag: type.split(':').pop() || type };
}

/** 발끝이 원점인 캐릭터 껍데기. 몸(.body3d)은 Scene이 매 프레임 다각형으로 채운다. */
export function characterSvg(look: Look, role: 'main' | 'sub'): string {
  return `
  <ellipse class="shadow" cx="0" cy="0" rx="11" ry="4.5"/>
  <g class="body3d"></g>
  ${role === 'main' ? '<text class="spark">✳</text>' : ''}
  <g class="sweat"><path d="M11,-48 q2.5,4 0,6 q-2.5,-2 0,-6z" fill="#7cc8ff"/><path class="sweat-2" d="M-12,-44 q2,3.2 0,4.8 q-2,-1.6 0,-4.8z" fill="#7cc8ff"/></g>
  <foreignObject class="bubble-fo" x="-110" y="-160" width="220" height="104"><div class="bubble-wrap" xmlns="http://www.w3.org/1999/xhtml"><div class="bubble"></div></div></foreignObject>
  <text class="nametag" y="13">${esc(look.tag)}</text>`;
}
