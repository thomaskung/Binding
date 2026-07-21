import { Input } from "@jumponboard/ui";

export function Default() {
  return <Input placeholder="jane@company.com" style={{ width: 260 }} />;
}

export function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
      <Input defaultValue="Jane Doe" />
      <Input placeholder="Disabled" disabled />
      <Input placeholder="Invalid" aria-invalid="true" />
    </div>
  );
}
