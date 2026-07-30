import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { IndexDbRecord } from "./types";

const DATABASE_NAME = "my-isekai-home";
const DATABASE_VERSION = 1;
const UPDATED_AT_INDEX = "by-updated-at";

interface IdleHomeDatabaseSchema extends DBSchema {
  settings: {
    key: string;
    value: IndexDbRecord<unknown>;
    indexes: {
      "by-updated-at": string;
    };
  };
  gameSaves: {
    key: string;
    value: IndexDbRecord<unknown>;
    indexes: {
      "by-updated-at": string;
    };
  };
}

export type IdleHomeDatabase = IDBPDatabase<IdleHomeDatabaseSchema>;

let databasePromise: Promise<IdleHomeDatabase> | null = null;

function createRecordStore(
  database: IdleHomeDatabase,
  storeName: "settings" | "gameSaves",
) {
  if (database.objectStoreNames.contains(storeName)) return;

  const store = database.createObjectStore(storeName, { keyPath: "id" });
  store.createIndex(UPDATED_AT_INDEX, "updatedAtUtc");
}

export async function getIndexDb(): Promise<IdleHomeDatabase> {
  if (!databasePromise) {
    databasePromise = openDB<IdleHomeDatabaseSchema>(
      DATABASE_NAME,
      DATABASE_VERSION,
      {
        upgrade(database) {
          createRecordStore(database, "settings");
          createRecordStore(database, "gameSaves");
        },
      },
    ).then((database) => {
      database.addEventListener(
        "versionchange",
        () => {
          database.close();
          databasePromise = null;
        },
        { once: true },
      );
      return database;
    });
  }

  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    throw error;
  }
}

export async function closeIndexDb(): Promise<void> {
  if (!databasePromise) return;

  const database = await databasePromise;
  database.close();
  databasePromise = null;
}
