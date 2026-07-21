import { Label, Input } from "@jumponboard/ui";

export function Default() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 260 }}>
      <Label htmlFor="ds-preview-email">Work email</Label>
      <Input id="ds-preview-email" placeholder="jane@company.com" />
    </div>
  );
}
