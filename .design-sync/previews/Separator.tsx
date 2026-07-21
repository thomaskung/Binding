import { Separator } from "@jumponboard/ui";

export function Horizontal() {
  return (
    <div style={{ width: 260 }}>
      <div style={{ fontSize: 14 }}>Account</div>
      <Separator style={{ margin: "12px 0" }} />
      <div style={{ fontSize: 14 }}>Billing</div>
    </div>
  );
}

export function Vertical() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24 }}>
      <span style={{ fontSize: 14 }}>Seeker</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 14 }}>Recruiter</span>
    </div>
  );
}
