import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { getRuntimeConfigValue } from "./runtimeConfig.js";

const firebaseConfig = {
  apiKey: getRuntimeConfigValue("VITE_FIREBASE_API_KEY"),
  authDomain: getRuntimeConfigValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getRuntimeConfigValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getRuntimeConfigValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getRuntimeConfigValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getRuntimeConfigValue("VITE_FIREBASE_APP_ID")
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const FIRESTORE_EMULATOR_HOST = String(getRuntimeConfigValue("VITE_FIRESTORE_EMULATOR_HOST", "") || "").trim();
const FIRESTORE_EMULATOR_PORT = Number(getRuntimeConfigValue("VITE_FIRESTORE_EMULATOR_PORT", 0) || 0);
const FIREBASE_AUTH_EMULATOR_URL = String(getRuntimeConfigValue("VITE_FIREBASE_AUTH_EMULATOR_URL", "") || "").trim();

let firestoreEmulatorConnected = false;
let authEmulatorConnected = false;

if (FIRESTORE_EMULATOR_HOST && FIRESTORE_EMULATOR_PORT > 0 && !firestoreEmulatorConnected) {
  connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  firestoreEmulatorConnected = true;
}

if (FIREBASE_AUTH_EMULATOR_URL && !authEmulatorConnected) {
  connectAuthEmulator(auth, FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true });
  authEmulatorConnected = true;
}
