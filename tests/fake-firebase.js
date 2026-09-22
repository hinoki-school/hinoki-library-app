// Browser-only test fixture, intercepted by Playwright; never included in Pages.
export async function connectFirebase() {
  const data = new Map([
    ['staff/test-user', { active: true, role: window.testRole || 'staff' }],
    ['students/S1', { name: '<img src=x onerror="window.pwned=true">', grade: '3年', active: true, activeLoanIds: [] }],
    ['students/S2', { name: 'テスト 花子', grade: '4年', active: true, activeLoanIds: [] }],
    ['books/9789999100007', { title: 'テスト本', author: 'テスト著者' }]
  ]);
  const observers = new Map();
  let authCallback, nextId = 0;
  const auth = { currentUser: null };
  const snapshot = path => ({ id: path.split('/').at(-1), exists: () => data.has(path), data: () => structuredClone(data.get(path)), metadata: { fromCache: false, hasPendingWrites: false } });
  function emit(path) {
    for (const callback of observers.get(path) || []) {
      const result = path.includes('/') ? snapshot(path) : {
        docs: [...data.keys()].filter(key => key.startsWith(path + '/')).map(snapshot),
        metadata: { fromCache: false, hasPendingWrites: false }
      };
      callback(result);
    }
  }
  const firestoreSDK = {
    doc(dbOrCollection, name, id) {
      return dbOrCollection?.path ? { path: dbOrCollection.path + '/loan' + (++nextId), id: 'loan' + nextId } : { path: name + '/' + id, id };
    },
    collection(db, name) { return { path: name }; },
    onSnapshot(ref, options, callback) {
      if (!observers.has(ref.path)) observers.set(ref.path, new Set());
      observers.get(ref.path).add(callback);
      queueMicrotask(() => emit(ref.path));
      return () => observers.get(ref.path).delete(callback);
    },
    async runTransaction(db, callback) {
      if (window.testWriteFail) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const writes = [];
      const result = await callback({
        get: async ref => snapshot(ref.path),
        set: (ref, value) => writes.push([ref.path, value]),
        update: (ref, value) => writes.push([ref.path, { ...data.get(ref.path), ...value }])
      });
      for (const [path, value] of writes) data.set(path, value);
      queueMicrotask(() => { for (const path of observers.keys()) emit(path); });
      return result;
    }
  };
  window.testBackend = {
    revoke() { data.set('staff/test-user', { active: false, role: 'staff' }); emit('staff/test-user'); },
    observerCount() { return [...observers.values()].reduce((sum, set) => sum + set.size, 0); },
    records() { return [...data.entries()]; },
    set(path, value) { data.set(path, value); emit(path.split('/')[0]); }
  };
  return { auth, db: {}, firestoreSDK, authSDK: {
    onAuthStateChanged(instance, callback) { authCallback = callback; queueMicrotask(() => callback(null)); },
    async signInWithEmailAndPassword(instance, email, password) {
      if (password !== 'test-only') throw new Error('invalid credential');
      auth.currentUser = { uid: 'test-user' }; authCallback(auth.currentUser);
    },
    async signOut() { auth.currentUser = null; authCallback(null); }
  } };
}
