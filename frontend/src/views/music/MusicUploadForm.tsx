import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useMusicMutation } from "@/hooks/mutations/useMusicMutation.hook";
import { useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";

const MusicUploadForm = () => {
  const mutation = useMusicMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  const handleName = (event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  };

  const handleUpload = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const file = fileRef.current?.files?.[0];

    if (!file) {
      return;
    }

    mutation.mutate(
      { kind: "upload", file, displayName: name },
      {
        onSuccess: () => {
          setName("");

          if (fileRef.current) {
            fileRef.current.value = "";
          }
        },
      },
    );
  };

  return (
    <form onSubmit={handleUpload} className="space-y-3 rounded-xl border p-4">
      <fieldset disabled={mutation.isPending} className="grid gap-3">
        <legend className="font-semibold mb-5">Upload WAV or MP3</legend>

        <div className="flex flex-col gap-1.5">
          <label>Display name (optional)</label>
          <Input
            value={name}
            onChange={handleName}
            maxLength={160}
            className="rounded-xl border p-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label>WAV or MP3 source</label>
          <Input
            ref={fileRef}
            type="file"
            accept=".wav,.mp3,audio/wav,audio/mpeg"
            required
            className="w-80"
          />
        </div>

        <Button
          variant={"secondary"}
          type="submit"
          className="rounded-xl border p-2"
        >
          Upload
        </Button>
      </fieldset>
      {mutation.isPending && (
        <p role="status">Uploading and validating audio…</p>
      )}
      {mutation.isError && (
        <p role="alert">
          Upload failed. Check the API error details and retry; your file choice
          is retained.
        </p>
      )}
      {mutation.isSuccess && <p role="status">Audio added to the library.</p>}
    </form>
  );
};

export default MusicUploadForm;
