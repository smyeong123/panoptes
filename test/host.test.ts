import { describe, expect, it } from 'vitest';
import { isLocalHost } from '../server/host.ts';

describe('isLocalHost', () => {
  it('localhost와 IP 주소는 받는다', () => {
    for (const host of ['localhost', 'localhost:4317', 'LOCALHOST:4317', '127.0.0.1', '127.0.0.1:4317', '[::1]:4317', '[::1]', '192.168.0.5:4317']) {
      expect(isLocalHost(host), host).toBe(true);
    }
  });

  it('다른 도메인 이름은 받지 않는다', () => {
    for (const host of [
      'attacker.example',
      'attacker.example:4317',
      '127.0.0.1.attacker.example:4317',
      'localhost.attacker.example',
      'localhost.',
    ]) {
      expect(isLocalHost(host), host).toBe(false);
    }
  });

  it('없거나 host[:port] 꼴이 아니면 받지 않는다', () => {
    for (const host of [undefined, '', '127.0.0.1@attacker.example', 'attacker.example/127.0.0.1', '127.0.0.1:4317:1', '::1', 'local host']) {
      expect(isLocalHost(host), String(host)).toBe(false);
    }
  });

  it('서버를 띄울 때 정한 이름은 받는다', () => {
    expect(isLocalHost('mybox.local:4317', ['mybox.local'])).toBe(true);
    expect(isLocalHost('MyBox.local:4317', ['mybox.LOCAL'])).toBe(true);
    expect(isLocalHost('other.local:4317', ['mybox.local'])).toBe(false);
  });
});
