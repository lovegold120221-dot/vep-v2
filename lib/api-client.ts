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
  
  const defaultSettings = { persona_name: 'Beatrice', language: 'English' };
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

export async function connectWhatsapp() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  let host = "";
  if (typeof window !== "undefined" && window.location.port !== "3000") {
    host = `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  const res = await fetch(`${host}/api/whatsapp/connect`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `connect failed: ${res.status}`);
  }
  return res.json();
}

export async function sendWhatsappMessage(number: string, message: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  let host = "";
  if (typeof window !== "undefined" && window.location.port !== "3000") {
    host = `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  const res = await fetch(`${host}/api/whatsapp/send`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ number, message })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `send failed: ${res.status}`);
  }
  return res.json();
}
