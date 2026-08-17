import { spawn } from 'node:child_process';

const binary = 'F:\\Vs\\cloudcli\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe';
const projectCwd = 'H:\\Download\\health';
const sdkArgs = ["--output-format","stream-json","--verbose","--input-format","stream-json"];

const quoted = sdkArgs.map(a => `"${a.replace(/"/g,'\\"')}"`).join(" ");
const cmdLine = `cd /d "${projectCwd}" && "${binary}" ${quoted}`;
console.log('cmdLine:', cmdLine);

const p = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', cmdLine], {
    stdio: ["pipe","pipe","pipe"],
    env: process.env,
    windowsHide: true,
});
p.on('error', e => console.log('ERROR:', e.code, e.message));
p.on('exit', (c,s) => console.log('EXIT:', c, s));
p.stderr.on('data', d => console.log('STDERR:', d.toString().slice(0,300).trim()));
p.stdout.on('data', d => console.log('STDOUT:', d.toString().slice(0,300).trim()));

setTimeout(() => { p.kill(); process.exit(0); }, 4000);
