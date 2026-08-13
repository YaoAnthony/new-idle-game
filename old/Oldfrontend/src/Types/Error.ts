// errorTypes.ts

/**
 * The shape of the custom error payload that comes from your server,
 * at the `response.data` level, containing at least a `message`.
 */
export interface ErrorData {
    /** Human-readable error message returned by the server */
    message: string;
  
    /** Optionally include other fields you send from backend */
    // code?: string;
    // timestamp?: string;
    // details?: any; // If you have additional info
}
  
  /**
   * An interface representing an Axios error object with `response` and
   * `response.data` included. This helps TypeScript know that in a catch,
   * `err.response.data.message` definitely exists (if typed correctly).
   */
export interface AxiosErrorWithData extends Error {
    status: number;
    error: {
        message: string;
    },
    response: {
        status: number;
        data: ErrorData;
    };
    // You could add other AxiosError fields here if needed, e.g. `config`, `request`, etc.
}
  