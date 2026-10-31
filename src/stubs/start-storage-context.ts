import { AsyncLocalStorage } from "./node-async-hooks";

export function createStorage() {
  return {};
}
export function useStorage() {
  return {};
}
export const storageContext = new AsyncLocalStorage();
export { AsyncLocalStorage };
export default storageContext;
