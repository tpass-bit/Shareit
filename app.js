// ---- CONFIG ----
const firebaseConfig = {
  apiKey: "AIzaSyBPF1VE82Y3VkZe6IibjqKxBC-XHjM_Wco",
  authDomain: "chat-2024-ff149.firebaseapp.com",
  projectId: "chat-2024-ff149",
  storageBucket: "chat-2024-ff149.appspot.com",
  messagingSenderId: "146349109253",
  appId: "1:146349109253:android:e593afbf0584762519ac6c",
  databaseURL: "https://chat-2024-ff149-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ---- HELPERS ----
function randId(len = 20) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- UPLOAD ----
async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const password = document.getElementById("uploadPassword").value;
  const statusEl = document.getElementById("uploadStatus");

  if (!fileInput.files.length) {
    statusEl.textContent = "No file selected!";
    return;
  }

  const file = fileInput.files[0];
  const id = randId();
  const ownerToken = randId(30);
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24h expiry

  try {
    // Upload file
    const fileRef = storage.ref().child("uploads/" + id);
    await fileRef.put(file);

    // Store metadata in Firestore
    const passHash = password ? await sha256(password) : "";
    await db.collection("files").doc(id).set({
      ownerToken,
      passwordHash: passHash,
      originalName: file.name,
      expiry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    statusEl.textContent = `✅ Uploaded! File ID: ${id}\nOwner Token: ${ownerToken}\nShare link: ${location.origin}?id=${id}`;
  } catch (e) {
    statusEl.textContent = "❌ Upload failed: " + e.message;
  }
      }
