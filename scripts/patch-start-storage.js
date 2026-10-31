const fs = require('fs');
const p = 'node_modules/@tanstack/start-storage-context/dist/esm/async-local-storage.js';
if (fs.existsSync(p)) {
  fs.writeFileSync(p, `export class AsyncLocalStorage{
  constructor(){}
  disable(){}
  getStore(){return undefined;}
  run(s,c,...a){if(typeof c==='function')return c(...a);return undefined;}
  exit(c,...a){if(typeof c==='function')return c(...a);return undefined;}
  enterWith(){}
}
class AsyncLocalStorageImpl{
  constructor(){this.storage=new AsyncLocalStorage();}
  getStore(){try{return this.storage.getStore();}catch{return undefined;}}
  run(s,f){try{return this.storage.run(s,f);}catch{return typeof f==='function'?f():undefined;}}
  enterWith(s){try{this.storage.enterWith(s);}catch{}}
  disable(){try{this.storage.disable();}catch{}}
}
var storage=new AsyncLocalStorageImpl();
export{storage as asyncLocalStorage,AsyncLocalStorageImpl as AsyncLocalStorage};
export default storage;`);
  console.log('Patched start-storage-context');
}
