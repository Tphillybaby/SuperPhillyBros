import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { saveEnv } from "./env.mjs";
import { randomBytes } from "node:crypto";
function run(command, args, input) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input,
    env: process.env,
    stdio: input === undefined ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.slice(0, 2).join(" ")} failed. Check your account connection and project settings.`,
    );
}
try {
  if (!process.env.CRON_SECRET)
    saveEnv({ CRON_SECRET: randomBytes(32).toString("hex") });
  if (!process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://"))
    throw new Error(
      "Set NEXT_PUBLIC_SITE_URL to your production HTTPS URL in .env.local first.",
    );
  if (process.env.STORE_LIVE === "true")
    for (const key of [
      "DATABASE_URL",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_COOKIE_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ])
      if (!process.env[key]) throw new Error(`Live checkout requires ${key}.`);
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"]);
  run("npm", ["run", "build"]);
  if (!existsSync(".vercel/project.json")) {
    const localEnv = existsSync(".env.local")
      ? readFileSync(".env.local")
      : null;
    try {
      run("vercel", [
        "link",
        "--yes",
        "--project",
        "super-philliy-bros-collectibles",
      ]);
    } finally {
      if (localEnv) {
        writeFileSync(".env.local", localEnv);
        chmodSync(".env.local", 0o600);
      }
    }
  }
  const keys = [
    "NEXT_PUBLIC_SITE_URL",
    "DATABASE_URL",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "BLOB_READ_WRITE_TOKEN",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "CRON_SECRET",
    "STORE_LIVE",
    "SHIPPING_FLAT_CENTS",
    "STRIPE_AUTOMATIC_TAX",
  ];
  for (const key of keys)
    if (process.env[key]) {
      run(
        "vercel",
        ["env", "add", key, "production", "--force"],
        process.env[key],
      );
      console.log(`Synced ${key} (value hidden).`);
    }
  run("vercel", ["deploy", "--prod", "--yes"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
