import { auth, db } from "./firebase";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";

export async function fetchSettings() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const docRef = doc(db, "user_settings", user.uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  
  const defaultSettings = { persona_name: 'Beatrice', language: 'en_US:en' };
  await setDoc(docRef, defaultSettings);
  return defaultSettings;
}

export async function updateSettings(settings: any) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const docRef = doc(db, "user_settings", user.uid);
  await setDoc(docRef, settings, { merge: true });
  const updated = await getDoc(docRef);
  return updated.data();
}

export async function fetchMemories() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const q = query(
    collection(db, "user_memories"),
    where("uid", "==", user.uid)
  );
  
  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return docs.sort((a: any, b: any) => {
    const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
    const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
    return tB - tA; // desc
  });
}

export async function saveMemory(content: string, type: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const docRef = await addDoc(collection(db, "user_memories"), {
    uid: user.uid,
    content,
    type,
    created_at: serverTimestamp()
  });
  
  const snap = await getDoc(docRef);
  return { id: snap.id, ...snap.data() };
}

export async function deleteMemory(id: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  await deleteDoc(doc(db, "user_memories", id));
  return { status: "success" };
}

export async function fetchConversations(num = 100) {
  const user = auth.currentUser;
  if (!user) {
    console.warn("fetchConversations: Not authenticated");
    return [];
  }
  
  const q = query(
    collection(db, "user_conversations"),
    where("uid", "==", user.uid)
  );
  
  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const sorted = data.sort((a: any, b: any) => {
    const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
    const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
    return tA - tB; // asc (reverse of desc) so oldest first, wait previously it was sorted desc then reversed. So we want oldest first!
  });
  // Since we reversed in the old logic:
  // `getDocs() desc limit(num) then reverse()`
  // Now we just sort desc, slice, then reverse:
  const descSorted = data.sort((a: any, b: any) => {
    const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
    const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
    return tB - tA; // desc
  });
  return descSorted.slice(0, num).reverse();
}

export async function saveConversationTurn(role: string, content: string, session_id?: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  const docRef = await addDoc(collection(db, "user_conversations"), {
    uid: user.uid,
    role,
    content,
    session_id,
    created_at: serverTimestamp()
  });
  
  const snap = await getDoc(docRef);
  return { id: snap.id, ...snap.data() };
}

export async function search(queryStr: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(`/api/search?q=${encodeURIComponent(queryStr)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Search failed: ${res.status}`);
  }
  return res.json();
}
