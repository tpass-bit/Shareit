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

function showStatus(element, message, type = 'info') {
  element.textContent = message;
  element.className = 'status-message ' + type;
  element.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 10000);
  }
}

// ---- UPLOAD ----
async function uploadFile() {
  const fileInput = document.getElementById("fileInput");
  const password = document.getElementById("uploadPassword").value;
  const statusEl = document.getElementById("uploadStatus");
  const progressEl = document.getElementById("uploadProgress");
  const progressText = document.getElementById("progress-text");
  const progressContainer = document.querySelector('.progress-container');

  if (!fileInput.files.length) {
    showStatus(statusEl, "⚠️ No file selected!", 'error');
    return;
  }

  const file = fileInput.files[0];
  const id = randId();
  const ownerToken = randId(30);
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24h expiry

  try {
    // Show progress container
    progressContainer.style.display = 'block';
    progressEl.value = 0;
    progressText.textContent = '0%';
    
    const fileRef = storage.ref().child("uploads/" + id);
    const uploadTask = fileRef.put(file);

    // Track progress
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        progressEl.value = percent;
        progressText.textContent = `${Math.round(percent)}%`;
        statusEl.textContent = `Uploading: ${percent.toFixed(1)}%`;
      },
      (error) => {
        showStatus(statusEl, "❌ Upload failed: " + error.message, 'error');
        progressContainer.style.display = 'none';
      },
      async () => {
        // On success - get download URL
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
        const passHash = password ? await sha256(password) : "";
        
        await db.collection("files").doc(id).set({
          ownerToken,
          passwordHash: passHash,
          originalName: file.name,
          fileSize: file.size,
          fileType: file.type,
          downloadURL: downloadURL,
          expiry,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        progressEl.value = 100;
        progressText.textContent = '100%';
        
        const shareLink = `${window.location.origin}${window.location.pathname}?id=${id}`;
        const successMessage = `✅ File uploaded successfully!\n\nFile ID: ${id}\nOwner Token: ${ownerToken}\n\nShare this link:\n${shareLink}`;
        
        showStatus(statusEl, successMessage, 'success');
        
        // Clear form
        fileInput.value = '';
        document.getElementById("uploadPassword").value = '';
        
        // Hide progress after delay
        setTimeout(() => {
          progressContainer.style.display = 'none';
        }, 2000);
      }
    );
  } catch (e) {
    showStatus(statusEl, "❌ Upload failed: " + e.message, 'error');
    progressContainer.style.display = 'none';
  }
}

// ---- DOWNLOAD ----
async function getFile() {
  const docId = document.getElementById("docId").value.trim();
  const password = document.getElementById("downloadPassword").value;
  const statusEl = document.getElementById("downloadLink");

  if (!docId) {
    showStatus(statusEl, "⚠️ Please enter a File ID", 'error');
    return;
  }

  try {
    const doc = await db.collection("files").doc(docId).get();
    
    if (!doc.exists) {
      showStatus(statusEl, "❌ File not found", 'error');
      return;
    }

    const fileData = doc.data();
    
    // Check expiry
    if (fileData.expiry && Date.now() > fileData.expiry) {
      showStatus(statusEl, "❌ File has expired", 'error');
      return;
    }

    // Check password
    if (fileData.passwordHash) {
      const inputHash = await sha256(password);
      if (inputHash !== fileData.passwordHash) {
        showStatus(statusEl, "❌ Incorrect password", 'error');
        return;
      }
    }

    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = fileData.downloadURL;
    downloadLink.textContent = `📥 Download ${fileData.originalName}`;
    downloadLink.className = 'btn btn-primary';
    downloadLink.target = '_blank';
    downloadLink.download = fileData.originalName;

    statusEl.innerHTML = '';
    statusEl.appendChild(downloadLink);
    showStatus(statusEl, `File: ${fileData.originalName} (${formatFileSize(fileData.fileSize)})`, 'success');

  } catch (error) {
    showStatus(statusEl, "❌ Error: " + error.message, 'error');
  }
}

// ---- DELETE FILE ----
async function deleteFile() {
  const ownerToken = document.getElementById("ownerToken").value.trim();
  const statusEl = document.getElementById("ownerStatus");

  if (!ownerToken) {
    showStatus(statusEl, "⚠️ Please enter Owner Token", 'error');
    return;
  }

  try {
    const querySnapshot = await db.collection("files")
      .where("ownerToken", "==", ownerToken)
      .get();

    if (querySnapshot.empty) {
      showStatus(statusEl, "❌ No file found with this owner token", 'error');
      return;
    }

    // Should only be one file per owner token
    const doc = querySnapshot.docs[0];
    const fileData = doc.data();
    
    // Delete from storage
    await storage.ref().child("uploads/" + doc.id).delete();
    
    // Delete from firestore
    await db.collection("files").doc(doc.id).delete();
    
    showStatus(statusEl, `✅ File "${fileData.originalName}" deleted successfully`, 'success');
    document.getElementById("ownerToken").value = '';

  } catch (error) {
    showStatus(statusEl, "❌ Delete failed: " + error.message, 'error');
  }
}

// ---- UPDATE PASSWORD ----
async function setNewPassword() {
  const ownerToken = document.getElementById("ownerToken").value.trim();
  const newPassword = document.getElementById("newPassword").value;
  const statusEl = document.getElementById("ownerStatus");

  if (!ownerToken) {
    showStatus(statusEl, "⚠️ Please enter Owner Token", 'error');
    return;
  }

  try {
    const querySnapshot = await db.collection("files")
      .where("ownerToken", "==", ownerToken)
      .get();

    if (querySnapshot.empty) {
      showStatus(statusEl, "❌ No file found with this owner token", 'error');
      return;
    }

    const doc = querySnapshot.docs[0];
    const newPasswordHash = newPassword ? await sha256(newPassword) : "";
    
    await db.collection("files").doc(doc.id).update({
      passwordHash: newPasswordHash
    });

    const message = newPassword ? 
      `✅ Password updated for "${doc.data().originalName}"` : 
      `✅ Password removed for "${doc.data().originalName}"`;
    
    showStatus(statusEl, message, 'success');
    document.getElementById("ownerToken").value = '';
    document.getElementById("newPassword").value = '';

  } catch (error) {
    showStatus(statusEl, "❌ Update failed: " + error.message, 'error');
  }
}

// ---- UTILITY FUNCTIONS ----
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ---- AUTO-LOAD FILE FROM URL PARAM ----
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const fileId = urlParams.get('id');
  
  if (fileId) {
    document.getElementById('docId').value = fileId;
    // Auto-scroll to download section
    document.querySelector('.card:nth-child(2)').scrollIntoView({ 
      behavior: 'smooth' 
    });
  }
});

// ---- FILE INPUT CHANGE HANDLER ----
document.getElementById('fileInput').addEventListener('change', function(e) {
  const label = document.querySelector('.file-input-label span');
  if (this.files.length > 0) {
    const file = this.files[0];
    label.textContent = `${file.name} (${formatFileSize(file.size)})`;
  } else {
    label.textContent = 'Choose a file';
  }
});
