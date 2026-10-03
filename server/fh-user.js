/* fh-user.js — manage Field Forms logins. Run on the VPS as the fh user:
     sudo -u fh /opt/node-runtime/node /var/www/fh/server/fh-user.js list
     ... add  <email> "<name>"   create a login, prints a random password
     ... reset <email>           new random password (signs out that user everywhere)
     ... disable <email> | enable <email>
   People can change their own password in the app under Settings. */
import { openDb, hashPassword, randomPassword } from './db.js';

const [cmd, email, ...rest] = process.argv.slice(2);
const db = openDb();
const find = () => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
const die = (msg) => { console.error(msg); process.exit(1); };

switch (cmd) {
  case 'list':
    for (const u of db.prepare('SELECT * FROM users ORDER BY id').all()) console.log(`${u.email}\t${u.name}${u.disabled ? '\t(disabled)' : ''}`);
    break;
  case 'add': {
    if (!/^\S+@\S+$/.test(email || '')) die('Usage: fh-user.js add <email> "<name>"');
    if (find()) die(`${email} already exists — use reset`);
    const pw = randomPassword();
    db.prepare('INSERT INTO users (email, name, pass, created) VALUES (?, ?, ?, ?)').run(email.trim(), rest.join(' '), hashPassword(pw), new Date().toISOString());
    console.log(`Created ${email}\nPassword: ${pw}`);
    break;
  }
  case 'reset': {
    const u = find() || die(`No user ${email}`);
    const pw = randomPassword();
    db.prepare('UPDATE users SET pass = ?, pwv = pwv + 1 WHERE id = ?').run(hashPassword(pw), u.id);
    console.log(`New password for ${u.email}: ${pw}`);
    break;
  }
  case 'disable':
  case 'enable': {
    const u = find() || die(`No user ${email}`);
    db.prepare('UPDATE users SET disabled = ?, pwv = pwv + 1 WHERE id = ?').run(cmd === 'disable' ? 1 : 0, u.id);
    console.log(`${u.email} ${cmd}d`);
    break;
  }
  default:
    die('Usage: fh-user.js list | add <email> "<name>" | reset <email> | disable <email> | enable <email>');
}
