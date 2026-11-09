import { MongoClient, Db } from 'mongodb';

// In-Memory Fallback Store for Local Development & Testing when MONGODB_URI is absent
class MemoryCollection {
  private docs: Map<string, any> = new Map();

  async findOne(query: any): Promise<any | null> {
    for (const doc of this.docs.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  async find(query: any = {}): Promise<{ sort: (s: any) => { limit: (l: number) => { toArray: () => Promise<any[]> } }; toArray: () => Promise<any[]> }> {
    const matched: any[] = [];
    for (const doc of this.docs.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) matched.push(JSON.parse(JSON.stringify(doc)));
    }

    const res = {
      sort: (sortObj: any) => {
        const key = Object.keys(sortObj)[0];
        const dir = sortObj[key] === -1 ? -1 : 1;
        matched.sort((a, b) => ((a[key] > b[key] ? 1 : -1) * dir));
        return {
          limit: (limitNum: number) => ({
            toArray: async () => matched.slice(0, limitNum),
          }),
        };
      },
      toArray: async () => matched,
    };
    return res;
  }

  async insertOne(doc: any): Promise<{ insertedId: string }> {
    const id = doc.id || doc._id || Math.random().toString(36).slice(2);
    const toStore = { ...doc, _id: id };
    this.docs.set(id, toStore);
    return { insertedId: id };
  }

  async updateOne(query: any, update: any, options: any = {}): Promise<{ matchedCount: number; modifiedCount: number }> {
    let existing = await this.findOne(query);
    if (!existing) {
      if (options.upsert) {
        const newDoc = { ...query, ...(update.$set || update), ...(update.$setOnInsert || {}) };
        await this.insertOne(newDoc);
        return { matchedCount: 0, modifiedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }

    const updated = { ...existing };
    if (update.$set) Object.assign(updated, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        updated[k] = (updated[k] || 0) + (v as number);
      }
    }
    this.docs.set(existing._id, updated);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteMany(query: any): Promise<{ deletedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        this.docs.delete(id);
        count++;
      }
    }
    return { deletedCount: count };
  }
}

class MemoryDatabase {
  private collections: Map<string, MemoryCollection> = new Map();

  collection(name: string): any {
    let col = this.collections.get(name);
    if (!col) {
      col = new MemoryCollection();
      this.collections.set(name, col);
    }
    return col;
  }
}

// Global caching for Serverless Vercel execution
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _memoryDbInstance: MemoryDatabase | undefined;
}

const uri = process.env.MONGODB_URI;

export async function getDb(): Promise<any> {
  if (!uri) {
    if (!global._memoryDbInstance) {
      global._memoryDbInstance = new MemoryDatabase();
    }
    return global._memoryDbInstance;
  }

  let client: MongoClient;
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    global._mongoClientPromise = client.connect();
  }

  client = await global._mongoClientPromise;
  return client.db();
}
