import { spawn } from 'node:child_process';

const bundled = 'F:\\Vs\\cloudcli\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe';

console.log('spawning with SDK-like args');
const proc = spawn(bundled, ['--print', '--output-format=stream-json', '--input-format=stream-json', '--verbose'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
});

proc.on('error', (err) => {
    console.log('ERROR event:', err.code, err.message);
});

proc.on('exit', (code, signal) => {
    console.log('EXIT code:', code, 'signal:', signal);
});

proc.stdout.on('data', (d) => console.log('STDOUT:', d.toString().trim()));
proc.stderr.on('data', (d) => console.log('STDERR:', d.toString().trim()));

setTimeout(() => {
    console.log('killing after 5s');
    proc.kill();
}, 5000);
