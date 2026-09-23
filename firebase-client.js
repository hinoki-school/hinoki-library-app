const SDK_VERSION = '12.19.0';

export async function connectFirebase() {
  // This runtime resource is generated outside the checkout during deployment.
  // Never commit real config, credentials, or student data to this public repository.
  const response = await fetch('./firebase-config.json', { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('接続設定を読み込めませんでした。');
  const config = await response.json();
  if (!['apiKey', 'authDomain', 'projectId', 'appId'].every(key => typeof config[key] === 'string' && config[key].trim())) {
    throw new Error('接続設定が未完了です。管理者に確認してください。');
  }
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const [appSDK, authSDK, firestoreSDK] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)
  ]);
  const app = appSDK.initializeApp(config);
  const auth = authSDK.initializeAuth(app, { persistence: authSDK.inMemoryPersistence });
  const db = firestoreSDK.initializeFirestore(app, { localCache: firestoreSDK.memoryLocalCache() });
  return { auth, db, authSDK, firestoreSDK };
}
