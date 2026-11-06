import type { RecordActionRow } from "@/lib/types";

export type VoteItemType = "status_update" | "record_action";
export type Choice = "support" | "oppose";

export function functionUrl(name: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/functions/v1/${name}`;
}

/** Where the official stood on a record, in the same terms visitors vote in. */
export function officialStance(action: Pick<RecordActionRow, "kind" | "position">): Choice | null {
  if (action.kind === "vote") {
    if (action.position === "yea") return "support";
    if (action.position === "nay") return "oppose";
    return null;
  }
  if (action.kind === "vetoed") return "oppose";
  return "support";
}

const POSITION_LABELS: Record<string, string> = {
  yea: "voted Yea",
  nay: "voted Nay",
  present: "voted Present",
  not_voting: "did not vote",
};

const KIND_LABELS: Record<string, string> = {
  signed: "signed it",
  vetoed: "vetoed it",
  filed_without_signature: "let it become law without signing",
  sponsored: "sponsored it",
  cosponsored: "co-sponsored it",
  executive_order: "issued it",
};

export function stanceText(role: string, action: Pick<RecordActionRow, "kind" | "position">) {
  const who = role.charAt(0).toUpperCase() + role.slice(1);
  if (action.kind === "vote") return `${who} ${POSITION_LABELS[action.position ?? ""] ?? "vote not recorded"}`;
  return `${who} ${KIND_LABELS[action.kind] ?? "acted"}`;
}

export function actionLabel(action: Pick<RecordActionRow, "kind" | "position">) {
  if (action.kind === "vote") {
    if (action.position === "yea") return "Yea";
    if (action.position === "nay") return "Nay";
    if (action.position === "present") return "Present";
    if (action.position === "not_voting") return "Did not vote";
    return "Vote";
  }
  const labels: Record<string, string> = {
    signed: "Signed",
    vetoed: "Vetoed",
    filed_without_signature: "Law without signature",
    sponsored: "Sponsor",
    cosponsored: "Co-sponsor",
    executive_order: "Executive order",
  };
  return labels[action.kind] ?? action.kind;
}
