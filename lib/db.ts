import { MongoClient, type Db } from "mongodb";
import { getServerEnv } from "@/lib/env";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
  mongoDbPromise?: Promise<Db>;
};

async function getClient() {
  if (!globalForMongo.mongoClientPromise) {
    const { MONGODB_URI } = getServerEnv();
    const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10, minPoolSize: 0, serverSelectionTimeoutMS: 8000 });
    globalForMongo.mongoClientPromise = client.connect().catch((error: unknown) => {
      globalForMongo.mongoClientPromise = undefined;
      throw error;
    });
  }
  return globalForMongo.mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  if (!globalForMongo.mongoDbPromise) {
    globalForMongo.mongoDbPromise = (async () => {
      const { MONGODB_DB_NAME } = getServerEnv();
      const client = await getClient();
      const db = client.db(MONGODB_DB_NAME);
      await Promise.all([
        db.collection("users").createIndex({ phone: 1 }, { unique: true, name: "users_phone_unique" }),
        db.collection("auth_rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limit_ttl" }),
      ]);
      return db;
    })().catch((error: unknown) => {
      globalForMongo.mongoDbPromise = undefined;
      throw error;
    });
  }
  return globalForMongo.mongoDbPromise;
}
