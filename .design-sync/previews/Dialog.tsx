import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "jumponboard";

export function Open() {
  return (
    <Dialog defaultOpen modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal this candidate?</DialogTitle>
          <DialogDescription>
            Standard reveal costs 10 pts and requires the candidate has
            already expressed interest.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Reveal — 10 pts</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
