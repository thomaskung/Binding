import { Button } from "jumponboard";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant="default">Save changes</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete account</Button>
      <Button variant="link">Learn more</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button disabled>Save changes</Button>
      <Button variant="outline" disabled>
        Cancel
      </Button>
    </div>
  );
}
