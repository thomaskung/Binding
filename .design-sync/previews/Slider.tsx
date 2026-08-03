import { Slider, Label } from "@binding/ui";

export function Default() {
  return (
    <div style={{ width: 260 }}>
      <Label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        Per-role budget cap
      </Label>
      <Slider defaultValue={40} min={0} max={100} />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ width: 260 }}>
      <Label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        Limited by your available balance
      </Label>
      <Slider defaultValue={70} min={0} max={70} disabled />
    </div>
  );
}
