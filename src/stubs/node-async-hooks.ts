export const AsyncLocalStorage = class AsyncLocalStorage {
  disable() {}
  getStore() { return undefined; }
  run(store: any, callback: any, ...args: any[]) { return callback ? callback(...args) : undefined; }
  exit(callback: any, ...args: any[]) { return callback ? callback(...args) : undefined; }
  enterWith(store: any) {}
  enterWith(_store: any) {}
};
export default { AsyncLocalStorage };
export const executionAsyncId = () => 0;
export const triggerAsyncId = () => 0;
export const createHook = () => ({ enable() {}, disable() {} });
export const executionAsyncResource = () => ({});
