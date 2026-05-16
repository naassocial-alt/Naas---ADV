import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// The app will break without providing the firestoreDatabaseId if it's explicitly set.
// If it's the default database, we don't need to specify it.
const databaseId = (firebaseConfig as any).firestoreDatabaseId || "(default)";

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, databaseId);
export const auth = getAuth(app);
