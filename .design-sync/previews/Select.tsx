import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "jumponboard";

export function Open() {
  return (
    <Select defaultOpen defaultValue="hybrid">
      <SelectTrigger style={{ width: 200 }}>
        <SelectValue placeholder="Work setup" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Work setup</SelectLabel>
          <SelectItem value="remote">Remote</SelectItem>
          <SelectItem value="hybrid">Hybrid</SelectItem>
          <SelectItem value="onsite">Onsite</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
