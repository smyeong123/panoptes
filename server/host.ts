import net from 'node:net';

// host[:port] 꼴만 받는다. 이름 쪽은 대괄호로 싼 IPv6이거나 글자·숫자·점·하이픈.
const HOST_HEADER = /^(?:\[([0-9a-f:.]+)\]|([a-z0-9.-]+))(?::\d+)?$/i;

export const FORBIDDEN_HOST = 'Forbidden host. Open Panoptes by IP address or as localhost.';

/**
 * 요청의 Host 헤더가 이 컴퓨터를 직접 가리키는지 본다.
 *
 * DNS 리바인딩을 막기 위한 검사다. 바깥 페이지가 자기 도메인을 127.0.0.1로 돌리면 브라우저는
 * 로컬 서버를 그 페이지와 같은 출처로 보고 응답을 읽게 해 준다. 그때도 Host 헤더에는 그 도메인이
 * 남는다. IP 주소는 다른 곳으로 돌릴 수 없으므로 그대로 받는다.
 *
 * @param extra 그 밖에 받아 줄 이름. 서버를 띄울 때 정한 HOST 값을 넣는다.
 */
export function isLocalHost(header: string | undefined, extra: readonly string[] = []): boolean {
  const match = header ? HOST_HEADER.exec(header) : null;
  if (!match) return false;
  const name = (match[1] ?? match[2]).toLowerCase();
  return name === 'localhost' || net.isIP(name) !== 0 || extra.some((host) => host.toLowerCase() === name);
}
