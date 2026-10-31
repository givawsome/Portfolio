import { MongoClient } from 'mongodb';
let connection;
export async function db() {
  if (!process.env.MONGODB_URI)
    throw Object.assign(new Error('Database not configured'), { status: 503 });
  if (!connection) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 5000,
    });
    connection = client.connect().catch((e) => {
      connection = null;
      throw e;
    });
  }
  return (await connection).db(process.env.MONGODB_DB || 'rajneesh_portfolio');
}
export async function indexes(database) {
  await Promise.all([
    database.collection('admins').createIndex({ email: 1 }, { unique: true }),
    database.collection('media').createIndex({ collectionId: 1, id: 1 }, { unique: true }),
    database.collection('media').createIndex({ collectionId: 1, order: 1 }),
    database.collection('limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection('inquiries').createIndex({ createdAt: -1 }),
  ]);
}
