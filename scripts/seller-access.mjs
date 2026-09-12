import { z } from "zod";

export function parseSellerEmails(value) {
  const emails = [
    ...new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return z.array(z.email().max(254)).min(1).max(2).parse(emails);
}

// Run with one connected client so replacement is atomic and never leaves partial access.
export async function configureSellerAccess(client, value) {
  const emails = parseSellerEmails(value);
  await client.query("begin");
  try {
    await client.query("lock table public.sellers in share row exclusive mode");
    await client.query(
      "delete from public.sellers where not (email = any($1::text[]))",
      [emails],
    );
    for (const [index, email] of emails.entries()) {
      await client.query(
        "insert into public.sellers(email,is_owner) values($1,$2) on conflict(email) do update set is_owner=excluded.is_owner",
        [email, index === 0],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  return emails.length;
}
