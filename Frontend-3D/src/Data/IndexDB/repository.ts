import { getIndexDb } from "./database";
import type {
  IndexDbError,
  IndexDbRecord,
  IndexDbResult,
  IndexDbStoreName,
} from "./types";

export type IndexDbRepository<T> = {
  create(id: string, value: T): Promise<IndexDbResult<IndexDbRecord<T>>>;
  get(id: string): Promise<IndexDbResult<IndexDbRecord<T>>>;
  getAll(): Promise<IndexDbResult<Array<IndexDbRecord<T>>>>;
  update(id: string, value: T): Promise<IndexDbResult<IndexDbRecord<T>>>;
  upsert(id: string, value: T): Promise<IndexDbResult<IndexDbRecord<T>>>;
  remove(id: string): Promise<IndexDbResult<IndexDbRecord<T>>>;
  clear(): Promise<IndexDbResult<{ deletedCount: number }>>;
};

function success<T>(data: T): IndexDbResult<T> {
  return { ok: true, data };
}

function failure<T>(error: IndexDbError): IndexDbResult<T> {
  return { ok: false, error };
}

function validateId<T>(id: string): IndexDbResult<T> | null {
  if (id.trim().length > 0) return null;

  return failure({
    code: "INVALID_ID",
    message: "IndexedDB record id cannot be empty.",
  });
}

function databaseFailure<T>(error: unknown): IndexDbResult<T> {
  if (error instanceof DOMException) {
    if (error.name === "ConstraintError") {
      return failure({
        code: "ALREADY_EXISTS",
        message: "A record with this id already exists.",
      });
    }

    if (error.name === "QuotaExceededError") {
      return failure({
        code: "QUOTA_EXCEEDED",
        message: "The browser storage quota has been exceeded.",
      });
    }

    if (
      error.name === "InvalidStateError" ||
      error.name === "NotAllowedError" ||
      error.name === "SecurityError"
    ) {
      return failure({
        code: "STORAGE_UNAVAILABLE",
        message: "IndexedDB is unavailable in this browser context.",
      });
    }
  }

  return failure({
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "IndexedDB request failed.",
  });
}

function notFound<T>(id: string): IndexDbResult<T> {
  return failure({
    code: "NOT_FOUND",
    message: `IndexedDB record "${id}" was not found.`,
  });
}

function nowUtc(): string {
  return new Date().toISOString();
}

export function createIndexDbRepository<T>(
  storeName: IndexDbStoreName,
): IndexDbRepository<T> {
  return {
    async create(id, value) {
      const invalidId = validateId<IndexDbRecord<T>>(id);
      if (invalidId) return invalidId;

      const timestamp = nowUtc();
      const record: IndexDbRecord<T> = {
        id,
        value,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };

      try {
        const database = await getIndexDb();
        await database.add(storeName, record);
        return success(record);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async get(id) {
      const invalidId = validateId<IndexDbRecord<T>>(id);
      if (invalidId) return invalidId;

      try {
        const database = await getIndexDb();
        const record = await database.get(storeName, id);
        return record
          ? success(record as IndexDbRecord<T>)
          : notFound(id);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async getAll() {
      try {
        const database = await getIndexDb();
        const records = await database.getAll(storeName);
        return success(records as Array<IndexDbRecord<T>>);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async update(id, value) {
      const invalidId = validateId<IndexDbRecord<T>>(id);
      if (invalidId) return invalidId;

      try {
        const database = await getIndexDb();
        const transaction = database.transaction(storeName, "readwrite");
        const existing = await transaction.store.get(id);

        if (!existing) {
          await transaction.done;
          return notFound(id);
        }

        const record: IndexDbRecord<T> = {
          id,
          value,
          createdAtUtc: existing.createdAtUtc,
          updatedAtUtc: nowUtc(),
        };

        await transaction.store.put(record);
        await transaction.done;
        return success(record);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async upsert(id, value) {
      const invalidId = validateId<IndexDbRecord<T>>(id);
      if (invalidId) return invalidId;

      try {
        const database = await getIndexDb();
        const transaction = database.transaction(storeName, "readwrite");
        const existing = await transaction.store.get(id);
        const timestamp = nowUtc();
        const record: IndexDbRecord<T> = {
          id,
          value,
          createdAtUtc: existing?.createdAtUtc ?? timestamp,
          updatedAtUtc: timestamp,
        };

        await transaction.store.put(record);
        await transaction.done;
        return success(record);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async remove(id) {
      const invalidId = validateId<IndexDbRecord<T>>(id);
      if (invalidId) return invalidId;

      try {
        const database = await getIndexDb();
        const transaction = database.transaction(storeName, "readwrite");
        const existing = await transaction.store.get(id);

        if (!existing) {
          await transaction.done;
          return notFound(id);
        }

        await transaction.store.delete(id);
        await transaction.done;
        return success(existing as IndexDbRecord<T>);
      } catch (error) {
        return databaseFailure(error);
      }
    },

    async clear() {
      try {
        const database = await getIndexDb();
        const transaction = database.transaction(storeName, "readwrite");
        const deletedCount = await transaction.store.count();

        await transaction.store.clear();
        await transaction.done;
        return success({ deletedCount });
      } catch (error) {
        return databaseFailure(error);
      }
    },
  };
}

