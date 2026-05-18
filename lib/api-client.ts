import { auth } from "./firebase";

async function getAuthHeaders() {
  let user = auth.currentUser;
  
  if (!user) {
    // Wait a bit for auth to initialize
    await new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        user = u;
        unsubscribe();
        resolve(u);
      });
      // Timeout after 2 seconds
      setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, 2000);
    });
  }

  if (!user) throw new Error("Not authenticated - please sign in.");
  const token = await user.getIdToken();
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export async function fetchSettings() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/settings", { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch settings: ${res.status}`);
  }
  return res.json();
}

export async function updateSettings(settings: any) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers,
    body: JSON.stringify(settings)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update settings: ${res.status}`);
  }
  return res.json();
}

export async function fetchMemories() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/memories", { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch memories: ${res.status}`);
  }
  return res.json();
}

export async function saveMemory(content: string, type: string) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/memories", {
    method: "POST",
    headers,
    body: JSON.stringify({ content, type })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save memory: ${res.status}`);
  }
  return res.json();
}

export async function deleteMemory(id: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/memories/${id}`, {
    method: "DELETE",
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete memory: ${res.status}`);
  }
  return res.json();
}

export async function fetchConversations(num = 100) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/conversations?limit=${num}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch history: ${res.status}`);
  }
  return res.json();
}

export async function saveConversationTurn(role: string, content: string, session_id?: string) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers,
    body: JSON.stringify({ role, content, session_id })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save conversation: ${res.status}`);
  }
  return res.json();
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
  const res = await fetch(`/api/whatsapp/connect`, {
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
  const res = await fetch(`/api/whatsapp/send`, {
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
