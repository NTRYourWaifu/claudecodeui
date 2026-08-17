// 移除 SDK 內 cross-drive cmd.exe wrapper（已失效 + 害死所有 spawn）
// Node v24 原生支援 spawn 跨碟 cwd，wrapper 多此一舉
const fs = require('node:fs');
const p = 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';

const src = fs.readFileSync(p, 'utf8');

const before = src;

// 1. 把整段「if (win32 && cross-drive) { ...cmd wrapper... }」拿掉
//    這段以 `if(process.platform==="win32"&&Y&&X&&X.length>=2` 開頭，到 `_cwd=undefined;}` 結尾
const winWrapRe = /if\(process\.platform==="win32"&&Y&&X&&X\.length>=2&&Y\.length>=2&&X\[0\]\.toUpperCase\(\)!==Y\[0\]\.toUpperCase\(\)\)\{[^}]*?_cwd=undefined;\}/;
const m1 = src.match(winWrapRe);
console.log('Match 1 (cmd wrapper):', !!m1, m1 ? `len=${m1[0].length}` : '');

let out = src.replace(winWrapRe, '');

// 2. 順便移除三條 DEBUG log（保留 stderr 監聽，但去掉 console.log 雜訊）
const dbgSpawnRe = /console\.log\(`\[DEBUG-SDK\] spawning cmd=\$\{_cmd\} cwd=\$\{_cwd\}`\);/;
const dbgArgsRe = /console\.log\(`\[DEBUG-SDK\] args=\$\{JSON\.stringify\(_args\)\}`\);/;
const dbgStderrRe = /G\.stderr\.on\("data",\(d\)=>\{console\.log\(`\[DEBUG-SDK-STDERR\] \$\{d\.toString\(\)\.trim\(\)\}`\)\}\);/;

console.log('Match 2 (DEBUG spawn log):', dbgSpawnRe.test(out));
console.log('Match 3 (DEBUG args log):', dbgArgsRe.test(out));
console.log('Match 4 (DEBUG stderr log):', dbgStderrRe.test(out));

out = out.replace(dbgSpawnRe, '');
out = out.replace(dbgArgsRe, '');
out = out.replace(dbgStderrRe, '');

if (out === before) {
  console.log('!!! No changes made — patch already gone?');
  process.exit(1);
}

fs.copyFileSync(p, p + '.bak-' + Date.now());
fs.writeFileSync(p, out);
console.log('Patched. Backup written.');
console.log('Removed bytes:', before.length - out.length);
