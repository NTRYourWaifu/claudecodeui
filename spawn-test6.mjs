import { spawn } from 'node:child_process';

const binary = 'F:\\Vs\\cloudcli\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe';
const cwd = 'F:\\Vs\\cloudcli';
const args = ['--output-format', 'json', '--print', 'hello'];

console.log('cwd:', cwd);
console.log('binary:', binary);

const p = spawn(binary, args, { cwd, env: process.env, windowsHide: true });
let out = '', err = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => err += d);
p.on('exit', (c) => {
  console.log('EXIT:', c);
  console.log('STDOUT len:', out.length, 'first 500:', out.slice(0, 500));
  console.log('STDERR len:', err.length, 'first 500:', err.slice(0, 500));
  process.exit(0);
});
p.on('error', e => {
  console.log('ERROR:', e.code, e.message);
  process.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); p.kill(); }, 25000);
