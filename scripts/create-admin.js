import { db, indexes } from '../server/db.js';
import { hashPassword } from '../server/security.js';
const email = (process.env.ADMIN_ID || process.env.ADMIN_EMAIL)?.trim().toLowerCase(),
  password = process.env.ADMIN_PASSWORD;
if (!email || !/^[a-z0-9@._+-]{3,254}$/.test(email) || !password || password.length < 8)
  throw Error('Set ADMIN_ID and ADMIN_PASSWORD (8+ characters) in your local environment.');
const d = await db();
await indexes(d);
const existing = await d.collection('admins').findOne({ email });
await d
  .collection('admins')
  .updateOne(
    { email },
    { $set: { passwordHash: hashPassword(password) }, $inc: { version: 1 } },
    { upsert: true },
  );
console.log(existing ? 'Password reset; previous sessions revoked.' : 'Administrator created.');
process.exit(0);
