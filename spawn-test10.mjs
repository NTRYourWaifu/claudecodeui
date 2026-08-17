import { spawn } from 'node:child_process';

const Y = 'F:\\Vs\\cloudcli';
const X = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';

// 最簡：只跑 --version
const _args = ['/d', '/c', `cd /d "${Y}" && "${X}" --version`];
console.log('args:', JSON.stringify(_args));

const p = spawn(process.env.ComSpec || 'cmd.exe', _args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env, windowsHide: true });
let out = '', err = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => err += d);
p.on('exit', (c) => {
  console.log('EXIT:', c);
  console.log('STDOUT:', out);
  console.log('STDERR:', err);
});
