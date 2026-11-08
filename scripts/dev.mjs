// Development launcher: starts Vite, then Electron pointed at the dev server.
// Uses only the project's own dependencies (no extra tooling required).
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer({ server: { port: 5173, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
console.log(`[dev] Vite ready at ${url}`);

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

const shutdown = async (code = 0) => {
  await server.close();
  process.exit(code);
};
child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => { child.kill(); });
process.on('SIGTERM', () => { child.kill(); });
