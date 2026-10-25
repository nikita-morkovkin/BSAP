import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { filterCatalogOptions } from "@/utils/settings.util";
import { useId, useState } from "react";
import Select, {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";

type CatalogSelectProps = {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const CatalogSelect = ({
  label,
  value,
  options,
  onChange,
  loading,
  error,
  onRetry,
}: CatalogSelectProps) => {
  const [search, setSearch] = useState("");
  const id = useId();
  const matches = filterCatalogOptions(options, search);
  const available = options.some((option) => option.id === value);
  const selected = options.find((option) => option.id === value);

  return (
    <div className="grid content-start gap-2 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <Input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder="Search by name, provider, or keyword…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Select
        value={available ? value : null}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onChange(nextValue);
        }}
        required
        disabled={loading || error}
      >
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder={loading ? "Loading…" : "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          {selected && !matches.includes(selected) && (
            <SelectItem value={selected.id}>
              {selected.name} · {selected.id}
            </SelectItem>
          )}
          {matches.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {option.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!loading && !error && matches.length === 0 && (
        <p role="status">No matching options.</p>
      )}
      {error && (
        <div role="alert">
          Catalog unavailable.{" "}
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
};

export default CatalogSelect;
