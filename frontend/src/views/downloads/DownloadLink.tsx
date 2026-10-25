import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type DownloadLinkProps = { url: string; label: string; available: boolean };

const DownloadLink = ({ url, label, available }: DownloadLinkProps) => {
  if (!available) {
    return <Button variant="outline" disabled><Download />{label}</Button>;
  }

  return (
    <a href={url} download className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <Download className="size-4" />{label}
    </a>
  );
};

export default DownloadLink;