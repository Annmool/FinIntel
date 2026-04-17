import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCJZ4DquZQic_TxBt05EzV1Go-px_ggIzM",
  authDomain: "finintel-a64ec.firebaseapp.com",
  projectId: "finintel-a64ec",
  storageBucket: "finintel-a64ec.firebasestorage.app",
  messagingSenderId: "821347417366",
  appId: "1:821347417366:web:43818b7bbabc28fde96437",
  measurementId: "G-CEVHVBWCE0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// We export these so App.js can use them
export { auth, provider, signInWithPopup, signOut };