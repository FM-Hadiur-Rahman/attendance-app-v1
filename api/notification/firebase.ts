// firebase.ts
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  serverTimestamp,
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCIo0P4TwyO2_G919eomg8REZRvyMDQKe0",
  authDomain: "attendance-app-notification.firebaseapp.com",
  projectId: "attendance-app-notification",
  storageBucket: "attendance-app-notification.firebasestorage.app",
  messagingSenderId: "67369003758",
  appId: "1:67369003758:web:cf747c586750e36712e1ff",
  measurementId: "G-04NF4YBL9C"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export { serverTimestamp, collection, doc, setDoc, addDoc, onSnapshot, query, orderBy, limit };
