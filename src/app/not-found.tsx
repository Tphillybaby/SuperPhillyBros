import Link from "next/link";
export default function NotFound() {
  return (
    <main className="message-page">
      <h1>This find got away.</h1>
      <p>That page isn’t in our collection.</p>
      <Link className="button primary" href="/">
        Back to the store
      </Link>
    </main>
  );
}
