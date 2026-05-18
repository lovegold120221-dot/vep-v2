import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use initializeFirestore to enable long polling which is more reliable in AI Studio
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export async function testConnection() {
  try {
    console.log("Testing Firestore connection...");
    const { doc, getDocFromServer } = await import('firebase/firestore');
    // Attempt to fetch a non-existent doc from server to verify connectivity
    await getDocFromServer(doc(db, '_connection_test_', 'dummy'));
    console.log("Firestore connection test passed (reached server).");
    return true;
  } catch (error: any) {
    console.error("Firestore connection test failed:", error);
    if (error.message?.includes('offline')) {
      console.error("Client is reporting offline status.");
    }
    return false;
  }
}
