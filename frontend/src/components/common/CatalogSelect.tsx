import { useId, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { filterCatalogOptions } from '@/utils/settings.util';

type CatalogSelectProps = {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const CatalogSelect = ({ label, value, options, onChange, loading, error, onRetry }: CatalogSelectProps) => {
  const [search, setSearch] = useState('');
  const id = useId();
  const matches = filterCatalogOptions(options, search);
  const available = options.some((option) => option.id === value);
  const selected = options.find((option) => option.id === value);

  return (
    <div className="grid content-start gap-2 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      <Input aria-label={`Search ${label.toLowerCase()}`} placeholder="Search by name, provider, or keyword…"
        value={search} onChange={(event) => setSearch(event.target.value)} />
      <select id={id} className="w-full min-w-0 rounded-xl border bg-background p-3" value={available ? value : ''}
        onChange={(event) => onChange(event.target.value)} required disabled={loading || error}>
        <option value="" disabled>{loading ? 'Loading…' : 'Select an option'}</option>
        {selected && !matches.includes(selected) && <option value={selected.id} hidden>{selected.name} · {selected.id}</option>}
        {matches.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.id}</option>)}
      </select>
      {!loading && !error && matches.length === 0 && <p role="status">No matching options.</p>}
      {error && <div role="alert">Catalog unavailable. <Button type="button" variant="outline" onClick={onRetry}>Retry</Button></div>}
    </div>
  );
};

export default CatalogSelect;