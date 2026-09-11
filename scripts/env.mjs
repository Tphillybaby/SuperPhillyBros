import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
export function saveEnv(values) {
  const path = ".env.local";
  let content = existsSync(path)
    ? readFileSync(path, "utf8")
    : "# Local store configuration. Keep this file private.\n";
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z0-9_]+$/.test(key) || /[\r\n\0]/.test(String(value)))
      throw new Error("Invalid environment value.");
    const line = `${key}=${JSON.stringify(String(value))}`;
    const matcher = new RegExp(`^${key}=.*$`, "m");
    content = matcher.test(content)
      ? content.replace(matcher, () => line)
      : content + `${content.endsWith("\n") ? "" : "\n"}${line}\n`;
    process.env[key] = String(value);
  }
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}
