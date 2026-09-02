/*
 * Generator poświadczeń administratora.
 *
 * Tworzy losowe hasło i jego skrót PBKDF2, gotowy do wklejenia w konfiguracji.
 * Hasło jest wypisywane jeden raz i nigdzie nie jest zapisywane.
 *
 * Uruchomienie: node scripts/make-admin-hash.mjs
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERATIONS = 310000;
const KEY_LENGTH = 32;

/* Hasło budowane ze znaków bez par mylących ze sobą, żeby dało się je przepisać. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
const bytes = randomBytes(24);
const password = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');

const salt = randomBytes(16);
const hash = pbkdf2Sync(password.normalize('NFKC'), salt, ITERATIONS, KEY_LENGTH, 'sha256');

const toHex = (b) => Buffer.from(b).toString('hex');

console.log('\nHasło administratora, zapisz je teraz, nie da się go odtworzyć:\n');
console.log('  ' + password + '\n');
console.log('Konfiguracja do wklejenia w src/lib/auth.ts:\n');
console.log(JSON.stringify({ salt: toHex(salt), iterations: ITERATIONS, hash: toHex(hash) }, null, 2));
console.log();
