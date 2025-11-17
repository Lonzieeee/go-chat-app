import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBvkz6DGKhDgPW0rzocYQHEq0_FMzNuk_s',
  authDomain: 'yapchat-83505.firebaseapp.com',
  projectId: 'yapchat-83505',
  storageBucket: 'yapchat-83505.firebasestorage.app',
  messagingSenderId: '785435223476',
  appId: '1:785435223476:web:a614f6d9ff23c353087ee1',
  measurementId: 'G-GBXH0HWG6B',
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
await signInAnonymously(auth);
const db = getFirestore(firebaseApp);


window.firebaseServices = {
  db,
  auth,
  collection,
  
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
};