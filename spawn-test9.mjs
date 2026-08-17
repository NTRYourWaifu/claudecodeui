// 逐步加 arg 看哪個害死它
import { spawn } from 'node:child_process';

const X = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
const Y = 'F:\\Vs\\cloudcli';

async function run(args, label) {
  const _quoted = args.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
  const _cmd = process.env.ComSpec || 'cmd.exe';
  const _args = ['/d', '/c', `cd /d "${Y}" && "${X}" ${_quoted}`];
  return new Promise((resolve) => {
    const p = spawn(_cmd, _args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }) + '\n');
    p.stdin.end();
    const tm = setTimeout(() => { p.kill(); resolve(`[${label}] TIMEOUT (CLI started OK)`); }, 4000);
    p.on('exit', (c) => {
      clearTimeout(tm);
      const stderrShort = err.slice(0, 80).replace(/\r?\n/g, ' ');
      resolve(`[${label}] EXIT=${c} stderr="${stderrShort}"`);
    });
  });
}

(async () => {
  const base = ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json'];
  console.log(await run(base, 'base'));
  console.log(await run([...base, '--thinking', 'disabled'], '+thinking'));
  console.log(await run([...base, '--effort', 'xhigh'], '+effort'));
  console.log(await run([...base, '--model', 'claude-opus-4-7'], '+model'));
  console.log(await run([...base, '--permission-prompt-tool', 'stdio'], '+permission-prompt-tool'));
  console.log(await run([...base, '--tools', 'default'], '+tools'));
  console.log(await run([...base, '--setting-sources=project,user,local'], '+setting-sources(=)'));
  console.log(await run([...base, '--setting-sources', 'project,user,local'], '+setting-sources(space)'));
  console.log(await run([...base, '--permission-mode', 'default'], '+permission-mode'));
})();
