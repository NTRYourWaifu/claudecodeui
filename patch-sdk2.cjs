const fs = require('node:fs');
const p = 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';

const src = fs.readFileSync(p, 'utf8');

// 整段 patch（原樣字串）
const oldWrapper = 'if(process.platform==="win32"&&Y&&X&&X.length>=2&&Y.length>=2&&X[0].toUpperCase()!==Y[0].toUpperCase()){let _quoted=J.map(a=>`"${String(a).replace(/"/g,\'\\\\"\')}"`).join(" ");_cmd=process.env.ComSpec||"cmd.exe";_args=["/d","/c",`cd /d "${Y}" && "${X}" ${_quoted}`];_cwd=undefined;}';

console.log('found exact:', src.includes(oldWrapper));

if (!src.includes(oldWrapper)) {
  // 印出真實內容做比對
  const start = src.indexOf('if(process.platform==="win32"&&Y&&X&&X.length>=2&&Y.length>=2&&X[0].toUpperCase()!==Y[0].toUpperCase())');
  if (start >= 0) {
    console.log('FOUND at:', start);
    console.log('REAL:', JSON.stringify(src.slice(start, start + 350)));
  }
  process.exit(1);
}

const out = src.replace(oldWrapper, '');
fs.copyFileSync(p, p + '.bak2-' + Date.now());
fs.writeFileSync(p, out);
console.log('Removed wrapper, bytes:', src.length - out.length);
