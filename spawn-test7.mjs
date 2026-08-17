// 完全複製 server 跑失敗時 SDK 真實送的 args，看哪個 flag 害死它
import { spawn } from 'node:child_process';

const binary = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
const cwd = 'F:\\Vs\\cloudcli';

// 從 server log 抄來的完整 args
const args = [
  '--output-format', 'stream-json',
  '--verbose',
  '--input-format', 'stream-json',
  '--thinking', 'disabled',
  '--effort', 'xhigh',
  '--model', 'claude-opus-4-7',
  '--permission-prompt-tool', 'stdio',
  '--tools', 'default',
  '--setting-sources=project,user,local',
  '--permission-mode', 'default',
];

console.log('args:', JSON.stringify(args));
const p = spawn(binary, args, { cwd, env: process.env, windowsHide: true });
let out = '', err = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => err += d);
// 用 stream-json 它會等 stdin，所以送個簡單 user message 然後關 stdin
p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }) + '\n');
p.stdin.end();
p.on('exit', (c) => {
  console.log('EXIT:', c);
  console.log('STDOUT first 400:', out.slice(0, 400));
  console.log('STDERR first 400:', err.slice(0, 400));
  process.exit(0);
});
p.on('error', e => { console.log('ERROR:', e.code, e.message); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); p.kill(); }, 10000);
