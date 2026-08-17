// 模擬 server 走 cmd.exe wrapper 跑帶逗號的 arg
import { spawn } from 'node:child_process';

const X = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
const Y = 'F:\\Vs\\cloudcli';
const J = [
  '--output-format', 'stream-json',
  '--verbose',
  '--input-format', 'stream-json',
  '--thinking', 'disabled',
  '--effort', 'xhigh',
  '--model', 'claude-opus-4-7',
  '--permission-prompt-tool', 'stdio',
  '--tools', 'default',
  '--setting-sources=project,user,local',  // ← 含逗號
  '--permission-mode', 'default',
];

const _quoted = J.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
const _cmd = process.env.ComSpec || 'cmd.exe';
const _args = ['/d', '/c', `cd /d "${Y}" && "${X}" ${_quoted}`];

console.log('cmd line:', _args[2].slice(0, 200), '...');
const p = spawn(_cmd, _args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env, windowsHide: true });
let out = '', err = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => err += d);
p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }) + '\n');
p.stdin.end();
p.on('exit', (c) => {
  console.log('EXIT:', c);
  console.log('STDOUT first 200:', out.slice(0, 200));
  console.log('STDERR first 200:', err.slice(0, 200));
  process.exit(0);
});
setTimeout(() => { console.log('TIMEOUT'); p.kill(); }, 8000);
