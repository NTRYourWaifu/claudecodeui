import { spawn } from 'node:child_process';

const bundled = 'F:\\Vs\\cloudcli\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe';
const sdkArgs = ["--output-format","stream-json","--verbose","--input-format","stream-json","--model","opus","--permission-prompt-tool","stdio","--tools","default","--setting-sources=project,user,local","--permission-mode","default"];

console.log('Test 1: cwd = current');
let p1 = spawn(bundled, sdkArgs, {
    cwd: process.cwd(),
    stdio: ["pipe","pipe","pipe"],
    env: process.env,
    windowsHide: true,
});
p1.on('error', e => console.log('  ERROR:', e.code, e.message));
p1.on('exit', (c,s) => console.log('  EXIT:', c, s));
p1.stderr.on('data', d => console.log('  STDERR:', d.toString().trim()));

setTimeout(() => {
    p1.kill();
    console.log('\nTest 2: cwd = H:\\Download\\health');
    let p2 = spawn(bundled, sdkArgs, {
        cwd: 'H:\\Download\\health',
        stdio: ["pipe","pipe","pipe"],
        env: process.env,
        windowsHide: true,
    });
    p2.on('error', e => console.log('  ERROR:', e.code, e.message));
    p2.on('exit', (c,s) => console.log('  EXIT:', c, s));
    p2.stderr.on('data', d => console.log('  STDERR:', d.toString().trim()));

    setTimeout(() => {
        p2.kill();
        console.log('\nTest 3: cwd = bundled dir itself');
        let p3 = spawn(bundled, sdkArgs, {
            cwd: 'F:\\Vs\\cloudcli\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64',
            stdio: ["pipe","pipe","pipe"],
            env: process.env,
            windowsHide: true,
        });
        p3.on('error', e => console.log('  ERROR:', e.code, e.message));
        p3.on('exit', (c,s) => console.log('  EXIT:', c, s));
        p3.stderr.on('data', d => console.log('  STDERR:', d.toString().trim()));

        setTimeout(() => { p3.kill(); process.exit(0); }, 2000);
    }, 2000);
}, 2000);
