import pkg from '../package.json' with { type: 'json' };

/** package.json의 버전. /api/health와 런처가 서버가 같은 버전인지 볼 때 쓴다. */
export const VERSION: string = pkg.version;
