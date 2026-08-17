// Reset the CloudCLI login password.
//
// Why this exists: the password is stored as a bcrypt hash in ~/.cloudcli/auth.db,
// so a forgotten password cannot be recovered - only replaced. CloudCLI is a
// single-user system (server/routes/auth.js refuses to register a second user),
// so there is no "forgot password" flow in the web UI at all.
//
// The new password is typed here and hashed locally; it is never printed,
// logged, or sent anywhere.
//
// Usage: double-click reset-password.bat, or run `node reset-password.cjs`

const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

// Must match server/routes/auth.js, otherwise the hash will not verify
const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 6;

const DB_PATH = path.join(os.homedir(), '.cloudcli', 'auth.db');

/**
 * Read a line without echoing it to the terminal.
 *
 * readline's own prompt echoes every keystroke, which would leave the new
 * password sitting in the console scrollback. Muting the output stream keeps
 * it off screen; the trailing newline is written manually so the next prompt
 * still starts on its own line.
 */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const originalWrite = rl._writeToOutput.bind(rl);
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) originalWrite(text);
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const db = new Database(DB_PATH);

  const users = db.prepare('SELECT id, username FROM users').all();
  if (users.length === 0) {
    console.log('No user exists yet. Just open CloudCLI in a browser and register.');
    return;
  }

  const user = users[0];
  console.log(`Resetting password for user: ${user.username}`);
  console.log(`(minimum ${MIN_PASSWORD_LENGTH} characters, input is hidden)`);
  console.log('');

  const first = await askHidden('New password: ');
  if (first.length < MIN_PASSWORD_LENGTH) {
    console.log(`\nToo short - needs at least ${MIN_PASSWORD_LENGTH} characters. Nothing changed.`);
    process.exitCode = 1;
    return;
  }

  const second = await askHidden('Type it again: ');
  if (first !== second) {
    console.log('\nThe two entries do not match. Nothing changed.');
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(first, SALT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);

  // Read the hash back and verify it, rather than trusting that the UPDATE did
  // what we wanted. A password reset that silently failed would be discovered
  // only at the next login attempt.
  const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  const verified = await bcrypt.compare(first, stored.password_hash);

  if (!verified) {
    console.log('\nWrote the new hash but it failed to verify. Password NOT changed reliably.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(`Done. Log in as "${user.username}" with the new password.`);
  console.log('Any existing login sessions stay valid until their token expires.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exitCode = 1;
});
