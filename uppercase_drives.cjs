// 把 projects.project_path 與 sessions.project_path 的 drive letter 統一大寫
// 用法:
//   node uppercase_drives.cjs           -> dry-run
//   node uppercase_drives.cjs --apply   -> 真執行

const Database = require("better-sqlite3");
const DB_PATH = "C:/Users/yee/.cloudcli/auth.db";
const APPLY = process.argv.includes("--apply");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const upper = (p) => p.replace(/^([a-z]):/, (_m, l) => `${l.toUpperCase()}:`);

const projects = db.prepare("SELECT project_id, project_path FROM projects WHERE project_path GLOB '[a-z]:*'").all();
const sessions = db.prepare("SELECT DISTINCT project_path FROM sessions WHERE project_path GLOB '[a-z]:*'").all();

console.log("=== Plan ===");
console.log("Mode:", APPLY ? "APPLY" : "DRY-RUN");
console.log("");
console.log("projects rows to upgrade:", projects.length);
for (const r of projects) console.log("  ", r.project_path, "->", upper(r.project_path));
console.log("");
console.log("sessions distinct paths to upgrade:", sessions.length);
for (const r of sessions) console.log("  ", r.project_path, "->", upper(r.project_path));

if (!APPLY) {
  console.log("\nDry-run end.");
  process.exit(0);
}

// 檢查升級後會不會撞到現有大寫 row（如果撞了應該用 dedupe 而不是 update）
const upConflict = db.prepare("SELECT 1 FROM projects WHERE project_path = ?");
for (const r of projects) {
  const u = upper(r.project_path);
  if (u !== r.project_path && upConflict.get(u)) {
    console.error("CONFLICT: upgrading", r.project_path, "would collide with existing", u);
    console.error("Run dedupe_projects.cjs --apply first.");
    process.exit(1);
  }
}

const updProj = db.prepare("UPDATE projects SET project_path = ? WHERE project_id = ?");
const updSess = db.prepare("UPDATE sessions SET project_path = ? WHERE project_path = ?");

const tx = db.transaction(() => {
  for (const r of projects) {
    const u = upper(r.project_path);
    if (u !== r.project_path) updProj.run(u, r.project_id);
  }
  for (const r of sessions) {
    const u = upper(r.project_path);
    if (u !== r.project_path) updSess.run(u, r.project_path);
  }
});

try {
  tx();
  console.log("\nDone.");
  const stillLower = db.prepare("SELECT COUNT(*) AS n FROM projects WHERE project_path GLOB '[a-z]:*'").get().n;
  console.log("projects rows still with lowercase drive:", stillLower);
  const sessLower = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE project_path GLOB '[a-z]:*'").get().n;
  console.log("sessions rows still with lowercase drive:", sessLower);
} catch (err) {
  console.error("Transaction failed:", err);
  process.exit(1);
}
