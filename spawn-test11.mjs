// 不用 cmd wrap，直接 spawn + cwd
import { spawn } from 'node:child_process';

const X = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
const Y = 'F:\\Vs\\cloudcli';

console.log('Node version:', process.version);
console.log('Current cwd:', process.cwd());
console.log('Target cwd:', Y);

const p = spawn(X, ['--version'], { cwd: Y, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let out = '', err = '';
p.stdout.on('data', d => out += d);
p.stderr.on('data', d => err += d);
p.on('error', e => console.log('ERROR:', e.code, e.message));
p.on('exit', (c) => {
  console.log('EXIT:', c);
  console.log('STDOUT:', out);
  console.log('STDERR:', err);
});
