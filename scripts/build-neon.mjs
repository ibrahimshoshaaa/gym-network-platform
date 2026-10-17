import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm, stat, copyFile, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = path.join(root, 'apps/api/build/neon');
const runtime = path.join(work, 'runtime');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const sharpVersion = apiRequire('sharp').versions.sharp;
const prismaVersion = apiRequire('@prisma/client/package.json').version;
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
await rm(work, { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
// Generate an isolated JS client; the native Rust engine plus libvips exceeds
// Neon's 10 MiB archive limit. Do not change the regular TCP/CI client.
const schema = (await readFile(path.join(root, 'apps/api/prisma/schema.prisma'), 'utf8'))
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "./client"\n  engineType = "client"');
await writeFile(path.join(work, 'schema.prisma'), schema);
run('node', [apiRequire.resolve('prisma/build/index.js'), 'generate', '--schema', path.join(work, 'schema.prisma')]);
const deps = path.join(work, 'deps');
await mkdir(deps, { recursive: true });
await writeFile(path.join(deps, 'package.json'), JSON.stringify({ private: true }));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', `@prisma/adapter-pg@${prismaVersion}`, 'pg@8.16.3'], deps);
const stagedRequire = createRequire(path.join(deps, 'package.json'));
const adapterPath = stagedRequire.resolve('@prisma/adapter-pg');
// Optional read-only smoke check, used only against disposable CI PostgreSQL.
if (process.env.NEON_DB_SMOKE === 'true') {
  const smoke = `const {PrismaClient}=require(${JSON.stringify(path.join(work, 'client'))});const {PrismaPg}=require(${JSON.stringify(adapterPath)});const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:2})});(async()=>{try{await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(92170341)');const rows=await tx.$queryRawUnsafe('SELECT current_user AS role, COUNT(*)::int AS users FROM "User"');if(rows[0]?.role!=='gym_app')throw Error('Expected restricted CI role');},{isolationLevel:'Serializable'});console.log('Prisma JS adapter serializable transaction smoke passed');}finally{await db.$disconnect();}})().catch(()=>{console.error('Prisma JS adapter smoke failed');process.exitCode=1;});`;
  run('node', ['-e', smoke]);
}
const entry = path.join(work, 'entry.mjs');
await writeFile(entry, `import{PrismaClient}from ${JSON.stringify(path.join(work, 'client/index.js'))};import{PrismaPg}from ${JSON.stringify(adapterPath)};import{buildNeonApp}from ${JSON.stringify(path.join(root, 'apps/api/src/neon.ts'))};if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000})});export default buildNeonApp(db);`);
await build({
  entryPoints: [entry],
  outfile: path.join(runtime, 'index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node24', minify: true,
  external: ['sharp', 'pg-native'],
  alias: { '@prisma/client': path.join(work, 'client/index.js') },
  banner: { js: "import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import{dirname}from'node:path';const require=createRequire(import.meta.url);const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);" },
});
// Generated Prisma resolves this WASM relative to config.dirname. Keeping the
// schema at the bundle root prevents its fallback to the build-machine path.
await copyFile(path.join(work, 'client/query_compiler_bg.wasm'), path.join(runtime, 'query_compiler_bg.wasm'));
await copyFile(path.join(work, 'schema.prisma'), path.join(runtime, 'schema.prisma'));
if (process.env.NEON_DB_SMOKE === 'true') {
  // Exercise the actual bundled ORM query, using the CI host's sharp only for
  // this invocation. The deploy archive then gets a fresh ARM64 install below.
  await symlink(path.join(root, 'apps/api/node_modules'), path.join(runtime, 'node_modules'), 'dir');
  try {
    const smoke = `import api from ${JSON.stringify(path.join(runtime, 'index.mjs'))};const headers={'x-gym-origin-secret':process.env.API_ORIGIN_SECRET};const health=await api.fetch(new Request('https://ci.test/health',{headers}));if(health.status!==200)throw Error('Bundled health failed');headers.authorization='Bearer '+ 'a'.repeat(43);const result=await api.fetch(new Request('https://ci.test/me',{headers}));if(result.status!==401)throw Error('Bundled Prisma session lookup failed: '+result.status);console.log('Bundled Neon handler and Prisma model query smoke passed');process.exit(0);`;
    run('node', ['--input-type=module', '-e', smoke], root, { ...process.env, API_ORIGIN_SECRET: 'disposable-ci-only-origin-secret-with-no-real-credentials' });
  } finally {
    await rm(path.join(runtime, 'node_modules'));
  }
}
await writeFile(path.join(runtime, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
// Install the published native ARM64/glibc addon, never a host-machine binary.
run('npm', ['install', '--ignore-scripts', '--cpu=arm64', '--os=linux', '--libc=glibc', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', `sharp@${sharpVersion}`], runtime);
// npm also installs sharp's optional browser-WASM fallback. This archive runs
// exclusively on ARM64/glibc and already carries the verified native addon.
await rm(path.join(runtime, 'node_modules/@img/sharp-wasm32'), { recursive: true, force: true });
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
