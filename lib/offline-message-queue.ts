export type OfflineQueuedMessage = {
  userId: string;
  conversationId: string;
  clientMessageId: string;
  text: string;
  createdAt: string;
};

const DATABASE_NAME = "binary-chat-offline";
const STORE_NAME = "queued-messages";
const DATABASE_VERSION = 1;

export function offlineMessageKey(message: Pick<OfflineQueuedMessage, "userId" | "conversationId" | "clientMessageId">): string {
  return `${message.userId}:${message.conversationId}:${message.clientMessageId}`;
}

function openQueueDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_STORAGE_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("OFFLINE_STORAGE_BLOCKED"));
  });
}

export async function enqueueOfflineMessage(message: OfflineQueuedMessage): Promise<void> {
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ ...message, key: offlineMessageKey(message) });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("OFFLINE_STORAGE_WRITE_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("OFFLINE_STORAGE_WRITE_ABORTED"));
    });
  } finally {
    database.close();
  }
}

export async function listOfflineMessages(userId: string): Promise<OfflineQueuedMessage[]> {
  const database = await openQueueDatabase();
  try {
    return await new Promise<OfflineQueuedMessage[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).index("userId").getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => resolve((request.result as Array<OfflineQueuedMessage & { key: string }>).map(({ userId: owner, conversationId, clientMessageId, text, createdAt }) => ({
        userId: owner, conversationId, clientMessageId, text, createdAt,
      })).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
      request.onerror = () => reject(request.error ?? new Error("OFFLINE_STORAGE_READ_FAILED"));
    });
  } finally {
    database.close();
  }
}

export async function removeOfflineMessage(message: OfflineQueuedMessage): Promise<void> {
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(offlineMessageKey(message));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("OFFLINE_STORAGE_DELETE_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("OFFLINE_STORAGE_DELETE_ABORTED"));
    });
  } finally {
    database.close();
  }
}
