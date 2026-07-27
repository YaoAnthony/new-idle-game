/// <reference types="vite/client" />

declare module '*.tmj?raw' {
  const content: string;
  export default content;
}

declare module '*.tsj?raw' {
  const content: string;
  export default content;
}
