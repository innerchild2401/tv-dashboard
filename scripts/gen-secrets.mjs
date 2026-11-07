import { randomBytes } from "node:crypto";

const names = ["TV_TOKEN", "AGENT_TOKEN", "PI_TOKEN", "SESSION_SECRET"];

for (const name of names) {
  process.stdout.write(`${name}=${randomBytes(32).toString("base64url")}\n`);
}

process.stdout.write(
  "\n# Choose REMOTE_PIN yourself (4 to 6 digits). Paste the lines above into .env.local and into the Vercel Production and Preview environments. Do not commit them.\n",
);
