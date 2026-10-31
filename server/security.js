import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
  } catch {
    return false;
  }
}
function secret() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw Object.assign(new Error('Authentication is not configured'), { status: 503 });
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}
export async function token(admin) {
  return new SignJWT({ email: admin.email, version: admin.version || 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(admin._id))
    .setIssuedAt()
    .setExpirationTime('8h')
    .setIssuer('rajneesh-admin')
    .setAudience('portfolio')
    .sign(secret());
}
export async function authenticate(req, res, next) {
  try {
    const { payload } = await jwtVerify(req.cookies.session, secret(), {
      issuer: 'rajneesh-admin',
      audience: 'portfolio',
    });
    const { db } = await import('./db.js');
    const admin = await (
      await db()
    )
      .collection('admins')
      .findOne({ email: payload.email, version: payload.version });
    if (!admin) throw Error();
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in' });
  }
}
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  let origin;
  try {
    origin = new URL(process.env.APP_ORIGIN).origin;
  } catch {
    return res.status(503).json({ error: 'APP_ORIGIN must be configured' });
  }
  if (req.get('origin') !== origin) return res.status(403).json({ error: 'Origin not allowed' });
  next();
}
export async function rateLimit(database, key, max, seconds) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const id = createHash('sha256')
    .update(key + ':' + bucket)
    .digest('hex');
  const row = await database
    .collection('limits')
    .findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * seconds * 1000) } },
      { upsert: true, returnDocument: 'after' },
    );
  if (row.count > max)
    throw Object.assign(new Error('Too many attempts; try again later'), { status: 429 });
}
