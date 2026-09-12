import Link from "next/link";
import { finalSaleSummary } from "@/lib/store-policy";
export function ReturnPolicyNotice({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <p className="return-policy-notice">
      <strong>{finalSaleSummary}</strong>{" "}
      <Link href="/returns" onClick={onNavigate}>
        Read our return policy
      </Link>
    </p>
  );
}
