import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@jumponboard/ui";

export function Default() {
  return (
    <Card style={{ width: 340 }}>
      <CardHeader>
        <CardTitle>Senior Backend Engineer</CardTitle>
        <CardDescription>Nimbus Cloud Systems · Remote / Hybrid</CardDescription>
        <CardAction>
          <Badge variant="secondary">92% match</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        Own our payments ledger service: distributed systems, Postgres,
        Kubernetes, event-driven microservices.
      </CardContent>
      <CardFooter>
        <Button size="sm">View match</Button>
      </CardFooter>
    </Card>
  );
}

export function Compact() {
  return (
    <Card size="sm" style={{ width: 280 }}>
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
        <CardDescription>Tighter padding via size=&quot;sm&quot;</CardDescription>
      </CardHeader>
      <CardContent>Used for dense list layouts.</CardContent>
    </Card>
  );
}
