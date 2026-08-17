import { spawn } from 'node:child_process';

const npmBinary = 'C:\\Users\\yee\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
const sdkArgs = ["--output-format","stream-json","--verbose","--input-format","stream-json","--model","opus","--permission-prompt-tool","stdio","--tools","default","--setting-sources=project,user,local","--permission-mode","default"];

console.log('Test: npm binary on C: + cwd on H:');
let p = spawn(npmBinary, sdkArgs, {
    cwd: 'H:\\Download\\health',
    stdio: ["pipe","pipe","pipe"],
    env: process.env,
    windowsHide: true,
});
p.on('error', e => console.log('  ERROR:', e.code, e.message));
p.on('exit', (c,s) => console.log('  EXIT:', c, s));
p.stderr.on('data', d => console.log('  STDERR:', d.toString().trim()));
p.stdout.on('data', d => console.log('  STDOUT:', d.toString().slice(0,200).trim()));

setTimeout(() => { p.kill(); process.exit(0); }, 3000);
