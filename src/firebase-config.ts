import type { FirebaseOptions } from 'firebase/app';

// Identificadores públicos del proyecto de Firebase. No son secretos: van dentro de cualquier app
// web y lo que protege los datos son las reglas de seguridad de Firestore.
// Con null, la sincronización queda desactivada y la app funciona solo con el progreso local.
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyBhGrc8DAG0SpNxzxsKFh3AEPfUmxofmnA',
  authDomain: 'lectura-notas.firebaseapp.com',
  projectId: 'lectura-notas',
  storageBucket: 'lectura-notas.firebasestorage.app',
  messagingSenderId: '627360175633',
  appId: '1:627360175633:web:9ad33c4a71db61bbd043b0',
};
