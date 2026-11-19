// 플러그인에 실을 실행 파일을 만든다. 설치한 쪽에서는 npm install도 빌드도 하지 않으므로 결과물을 커밋한다.
//   plugin/dist/panoptes.mjs  서버와 런처(server/cli.ts)를 한 파일로 묶은 것
//   plugin/dist/web/          Vite로 빌드한 페이지
// --out <폴더> 를 주면 그 폴더에만 쓴다. test/pluginBundle.test.ts가 커밋된 결과물과 비교할 때 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { build as buildPage } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out');
const custom = outFlag >= 0 ? process.argv[outFlag + 1] : undefined;
if (outFlag >= 0 && !custom) throw new Error('--out needs a folder');
const out = custom ? path.resolve(custom) : path.join(root, 'plugin', 'dist');

fs.rmSync(out, { recursive: true, force: true });

await buildPage({
  root,
  logLevel: 'warn',
  build: { outDir: path.join(out, 'web'), emptyOutDir: true },
});

await bundle({
  // 번들 안의 경로 주석이 실행 위치와 상관없이 같도록 고정한다
  absWorkingDir: root,
  entryPoints: ['server/cli.ts'],
  outfile: path.join(out, 'panoptes.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'warning',
});

if (!custom) {
  // 버전은 package.json 한 곳에서만 올린다
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifestPath = path.join(root, 'plugin', '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== version) {
    manifest.version = version;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`plugin/dist built for panoptes ${version}`);
}
