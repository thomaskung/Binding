import { Textarea } from "@binding/ui";

export function Default() {
  return (
    <Textarea placeholder="Paste the job description text here…" style={{ width: 280 }} />
  );
}

export function Filled() {
  return (
    <Textarea
      style={{ width: 280 }}
      defaultValue="Senior backend engineer, 8 years: distributed systems, Postgres, event-driven pipelines, Kubernetes."
    />
  );
}
