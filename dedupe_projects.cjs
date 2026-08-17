// CloudCLI projects 表 case-insensitive 去重
// 用法:
//   node dedupe_projects.cjs           -> dry-run, 印計畫
//   node dedupe_projects.cjs --apply   -> 真正執行
//
// 規則:
//   - 同一 lowercase(project_path) 視為同專案
//   - canonical row 選擇: 優先 isStarred=1, 否則 isArchived=0, 否則 path 含大寫字母 (較有資訊), 否則第一個
//   - 其他 row: sessions.project_path 全部改指 canonical, 然後刪 row
//   - custom_project_name 若 canonical 為空, 從其他 row 補進 (任一非空)

const Database = require("better-sqlite3");
const DB_PATH = "C:/Users/yee/.cloudcli/auth.db";
const APPLY = process.argv.includes("--apply");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const rows = db.prepare(
  "SELECT project_id, project_path, custom_project_name, isStarred, isArchived FROM projects"
).all();

const groups = new Map();
for (const r of rows) {
  const key = r.project_path.toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const hasUpperDrive = (s) => /^[A-Z]:/.test(s);
const hasAnyUpper = (s) => /[A-Z]/.test(s);

function scorePath(p) {
  // 越高越優先
  let s = 0;
  if (hasUpperDrive(p)) s += 100;       // 大寫 drive letter 最重要 (F: 而非 f:)
  if (hasAnyUpper(p)) s += 10;          // 整體有大寫字母 (Vs 而非 vs)
  s += (p.match(/[A-Z]/g) || []).length; // 大寫字母越多越接近原始命名
  return s;
}

function pickCanonical(list) {
  // 1. starred 最優先 (不丟失使用者標記)
  const starred = list.find((r) => r.isStarred);
  if (starred) return starred;
  // 2. 排除 archived
  const active = list.filter((r) => !r.isArchived);
  const pool = active.length > 0 ? active : list;
  // 3. 按 path 大小寫分數排序, 取最高
  const sorted = [...pool].sort((a, b) => scorePath(b.project_path) - scorePath(a.project_path));
  return sorted[0];
}

const plan = []; // { canonical, toMerge: [{row, sessionCount}] }
let totalDupGroups = 0;
let totalRowsToDelete = 0;

for (const [key, list] of groups) {
  if (list.length <= 1) continue;
  totalDupGroups++;
  const canonical = pickCanonical(list);
  const toMerge = list.filter((r) => r.project_id !== canonical.project_id);
  totalRowsToDelete += toMerge.length;

  // 每個被合併 row 名下有多少 sessions
  const countStmt = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE project_path = ?");
  const mergeInfo = toMerge.map((r) => ({
    row: r,
    sessionCount: countStmt.get(r.project_path).n,
  }));

  // 若 canonical custom_project_name 為空, 從待合併 row 取一個非空
  let nameToBackfill = null;
  if (!canonical.custom_project_name || canonical.custom_project_name.trim() === "") {
    const donor = toMerge.find(
      (r) => r.custom_project_name && r.custom_project_name.trim() !== ""
    );
    if (donor) nameToBackfill = donor.custom_project_name;
  }

  plan.push({ key, canonical, mergeInfo, nameToBackfill });
}

console.log("=== Dedupe Plan ===");
console.log("Mode:", APPLY ? "APPLY (will modify DB)" : "DRY-RUN");
console.log("Duplicate groups:", totalDupGroups);
console.log("Rows to delete:", totalRowsToDelete);
console.log("");

for (const item of plan) {
  console.log("Group:", item.key);
  console.log("  KEEP   :", item.canonical.project_path, item.canonical.custom_project_name ? `(name=${item.canonical.custom_project_name})` : "(no name)");
  if (item.nameToBackfill) console.log("    backfill name <-", item.nameToBackfill);
  for (const m of item.mergeInfo) {
    console.log("  MERGE  :", m.row.project_path, `(sessions=${m.sessionCount}, name=${m.row.custom_project_name || "-"})`);
  }
}

if (!APPLY) {
  console.log("\nDry-run end. Re-run with --apply to commit.");
  process.exit(0);
}

// 真正執行
console.log("\nApplying changes...");
const updateSessions = db.prepare("UPDATE sessions SET project_path = ? WHERE project_path = ?");
const deleteProject = db.prepare("DELETE FROM projects WHERE project_id = ?");
const updateName = db.prepare("UPDATE projects SET custom_project_name = ? WHERE project_id = ?");
// canonical 若為 isStarred=0 但其他 row 有 isStarred=1, 保留 star
const setStarred = db.prepare("UPDATE projects SET isStarred = 1 WHERE project_id = ?");
const setNotArchived = db.prepare("UPDATE projects SET isArchived = 0 WHERE project_id = ?");

const tx = db.transaction(() => {
  for (const item of plan) {
    // backfill name
    if (item.nameToBackfill) {
      updateName.run(item.nameToBackfill, item.canonical.project_id);
    }
    // 若任一被合併 row starred, 把 star 也搬到 canonical
    const mergedStar = item.mergeInfo.some((m) => m.row.isStarred);
    if (mergedStar && !item.canonical.isStarred) {
      setStarred.run(item.canonical.project_id);
    }
    // 若 canonical isArchived=1 而其他 row 有 isArchived=0, 取消歸檔
    const anyActive = item.mergeInfo.some((m) => !m.row.isArchived);
    if (anyActive && item.canonical.isArchived) {
      setNotArchived.run(item.canonical.project_id);
    }

    for (const m of item.mergeInfo) {
      updateSessions.run(item.canonical.project_path, m.row.project_path);
      deleteProject.run(m.row.project_id);
    }
  }
});

try {
  tx();
  console.log("Done. Verifying...");
  const after = db.prepare("SELECT COUNT(*) AS n FROM projects").get().n;
  console.log("projects rows after:", after);
} catch (err) {
  console.error("Transaction failed:", err);
  process.exit(1);
}
