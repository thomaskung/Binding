import { Tabs, TabsList, TabsTrigger, TabsContent } from "@binding/ui";

export function Default() {
  return (
    <Tabs defaultValue="matches" style={{ width: 320 }}>
      <TabsList>
        <TabsTrigger value="matches">Matches</TabsTrigger>
        <TabsTrigger value="reveals">Reveals</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="matches">12 active matches this week.</TabsContent>
      <TabsContent value="reveals">3 pending reveal requests.</TabsContent>
      <TabsContent value="settings">Profile visibility: active.</TabsContent>
    </Tabs>
  );
}

export function LineVariant() {
  return (
    <Tabs defaultValue="matches" style={{ width: 320 }}>
      <TabsList variant="line">
        <TabsTrigger value="matches">Matches</TabsTrigger>
        <TabsTrigger value="reveals">Reveals</TabsTrigger>
      </TabsList>
      <TabsContent value="matches">12 active matches this week.</TabsContent>
      <TabsContent value="reveals">3 pending reveal requests.</TabsContent>
    </Tabs>
  );
}
