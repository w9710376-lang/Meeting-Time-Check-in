import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

// Suppress noisy internal Firestore connection retry console.error logs
// when operating in proxy/iframe environments or during brief network switches
setLogLevel('silent');

const app = getApps().length > 0 ? getApp() : initializeApp(config);

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    config.firestoreDatabaseId
  );
} catch {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      config.firestoreDatabaseId
    );
  } catch {
    firestoreDb = getFirestore(app, config.firestoreDatabaseId);
  }
}

export const db = firestoreDb;

