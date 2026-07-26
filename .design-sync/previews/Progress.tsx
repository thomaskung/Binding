import { Progress, Label } from "@jumponboard/ui";

export function Default() {
  return (
    <div style={{ width: 260 }}>
      <Label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        Spend used this posting
      </Label>
      <Progress value={62} />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 260 }}>
      <Label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        No spend yet
      </Label>
      <Progress value={0} />
    </div>
  );
}
