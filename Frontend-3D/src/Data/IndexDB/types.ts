export const INDEX_DB_STORE_NAMES = ["settings", "gameSaves"] as const;

export type IndexDbStoreName = (typeof INDEX_DB_STORE_NAMES)[number];

export type IndexDbRecord<T> = {
  id: string;
  value: T;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type IndexDbErrorCode =
  | "INVALID_ID"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE"
  | "UNKNOWN";

export type IndexDbError = {
  code: IndexDbErrorCode;
  message: string;
};

export type IndexDbResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: IndexDbError;
    };

