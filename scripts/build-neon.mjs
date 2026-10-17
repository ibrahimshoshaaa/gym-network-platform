import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = path.join(root, 'build/neon');
const runtime = path.join(work, 'runtime');
const target = 'linux-arm64-openssl-3.0.x';
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const sharpVersion = apiRequire('sharp/package.json').version;
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
await rm(work, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
// Generate an isolated ARM client without changing the regular TCP/CI client.
const schema = (await readFile(path.join(root, 'apps/api/prisma/schema.prisma'), 'utf8'))
  .replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = "./client"\n  binaryTargets = ["${target}"]`);
await writeFile(path.join(work, 'schema.prisma'), schema);
run('node', [apiRequire.resolve('prisma/build/index.js'), 'generate', '--schema', path.join(work, 'schema.prisma')]);
const engineName = `libquery_engine-${target}.so.node`;
await copyFile(path.join(work, 'client', engineName), path.join(runtime, engineName));
await copyFile(path.join(work, 'schema.prisma'), path.join(runtime, 'schema.prisma'));
await build({
  entryPoints: [path.join(root, 'apps/api/src/neon.ts')],
  outfile: path.join(runtime, 'index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node24', minify: true,
  external: ['sharp'],
  alias: { '@prisma/client': path.join(work, 'client/index.js') },
  banner: { js: `import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import{dirname}from'node:path';const require=createRequire(import.meta.url);const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);process.env.PRISMA_QUERY_ENGINE_LIBRARY=fileURLToPath(new URL('./${engineName}',import.meta.url));` },
});
await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
// Install the published native ARM64/glibc addon, never a host-machine binary.
run('npm', ['install', '--ignore-scripts', '--cpu=arm64', '--os=linux', '--libc=glibc', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', `sharp@${sharpVersion}`], runtime);
// Native packages must contain AArch64 ELF files, not the local x64 build.
run('python3', ['-c', `
import pathlib, struct, zipfile
root=pathlib.Path(${JSON.stringify(runtime)})
files=[p for p in root.rglob('*') if p.is_file()]
for p in files:
    if p.suffix == '.node' or '.so' in p.name:
        data=p.read_bytes()
        if data[:4] == b'\\x7fELF' and struct.unpack('<H',data[18:20])[0] != 183:
            raise SystemExit('Non-ARM64 native binary: '+str(p.relative_to(root)))
archive=root.parent/'gym-api-neon.zip'
if len(files)>4096 or sum(p.stat().st_size for p in files)>64*1024*1024:
    raise SystemExit('Neon archive exceeds uncompressed/file-count limits')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(files): z.write(p,p.relative_to(root))
if archive.stat().st_size>10*1024*1024:
    raise SystemExit('Neon archive exceeds 10 MiB compressed limit')
print('ARM64 Neon bundle verified:',len(files),'files,',archive.stat().st_size,'bytes')
`]);
console.log(`Bundle ready: ${path.relative(root, work)}/gym-api-neon.zip (${(await stat(path.join(work, 'gym-api-neon.zip'))).size} bytes)`);
