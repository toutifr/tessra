// Génère le client secret Apple (JWT ES256) pour Supabase Auth.
// Usage : node scripts/apple-client-secret.mjs ~/Downloads/AuthKey_297ZPRMUSS.p8
// Colle le résultat dans Supabase → Authentication → Providers → Apple → Secret Key.
// ⚠️ Expire dans 6 mois (max Apple) — mets un rappel pour le régénérer.
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const TEAM_ID = "AL3PSFY3BT";
const KEY_ID = "297ZPRMUSS";
const CLIENT_ID = "com.piri.app.signin"; // Services ID

const p8Path = process.argv[2];
if (!p8Path) {
  console.error("Usage: node scripts/apple-client-secret.mjs <chemin/vers/AuthKey.p8>");
  process.exit(1);
}

const key = createPrivateKey(readFileSync(p8Path, "utf8"));
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 180 * 24 * 3600, // 6 mois (maximum autorisé par Apple)
  aud: "https://appleid.apple.com",
  sub: CLIENT_ID,
};

const signingInput = `${b64(header)}.${b64(payload)}`;
const signature = sign("sha256", Buffer.from(signingInput), {
  key,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");

console.log(`\n${signingInput}.${signature}\n`);
console.log(`Expire le : ${new Date(payload.exp * 1000).toLocaleDateString("fr-FR")}`);
