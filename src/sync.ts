// Sincronización del progreso entre dispositivos con Firebase: inicio de sesión con Google y un
// único documento por usuario en Firestore. Firebase se carga solo cuando hace falta, para que
// quien no sincroniza no descargue nada de más.
import { firebaseConfig } from './firebase-config';
import { importBackup, exportBackup } from './storage';
import type { Progress } from './storage';

export const syncAvailable = firebaseConfig !== null;

export interface SyncUser {
  uid: string;
  email: string | null;
}

async function loadServices() {
  if (!firebaseConfig) throw new Error('La sincronización no está configurada');
  const [{ initializeApp }, authModule, storeModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore/lite'),
  ]);
  const app = initializeApp(firebaseConfig);
  return { auth: authModule.getAuth(app), store: storeModule.getFirestore(app), authModule, storeModule };
}

let services: ReturnType<typeof loadServices> | null = null;
const getServices = () => (services ??= loadServices());

/** Avisa cada vez que cambia la sesión; devuelve la función para dejar de escuchar. */
export async function watchUser(listener: (user: SyncUser | null) => void): Promise<() => void> {
  const { auth, authModule } = await getServices();
  return authModule.onAuthStateChanged(auth, (user) => listener(user ? { uid: user.uid, email: user.email } : null));
}

export async function signIn(): Promise<void> {
  const { auth, authModule } = await getServices();
  await authModule.signInWithPopup(auth, new authModule.GoogleAuthProvider());
}

export async function signOut(): Promise<void> {
  const { auth, authModule } = await getServices();
  await authModule.signOut(auth);
}

// El progreso viaja como texto, con el mismo formato que la copia de seguridad: así no depende de
// los tipos de dato de Firestore y lo que se sube es exactamente lo que se sabe leer.
async function userDoc(uid: string) {
  const { store, storeModule } = await getServices();
  return { ref: storeModule.doc(store, 'users', uid), storeModule };
}

/** Progreso guardado en la nube, o null si aún no hay ninguno. */
export async function pullProgress(uid: string): Promise<Progress | null> {
  const { ref, storeModule } = await userDoc(uid);
  const snapshot = await storeModule.getDoc(ref);
  const data = snapshot.data()?.data;
  return typeof data === 'string' ? importBackup(data) : null;
}

export async function pushProgress(uid: string, progress: Progress): Promise<void> {
  const { ref, storeModule } = await userDoc(uid);
  await storeModule.setDoc(ref, { data: exportBackup(progress, new Date()) });
}
