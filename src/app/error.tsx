"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="message-page">
      <h1>We hit a small snag.</h1>
      <p>The collection is temporarily unavailable. Please try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
