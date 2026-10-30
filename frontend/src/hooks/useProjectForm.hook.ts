import type { ProfileInputEvent } from "@/types/form.types";
import type { MusicTrack } from "@/types/music.types";
import type { Profile, ReasoningEffort } from "@/types/project.types";
import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import { useCreateProjectMutation } from "./mutations/useCreateProjectMutation.hook";

type HookProps = { defaults: Profile; tracks: MusicTrack[] };
type ReturnProps = {
  selectedTrackIds: string[];
  setSelectedTrackIds: (ids: string[]) => void;
  title: string;
  description: string;
  canSubmit: boolean;
  profile: Profile;
  isPending: boolean;
  handleTitle: (event: ChangeEvent<HTMLInputElement>) => void;
  handleDescription: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleProfile: (event: ProfileInputEvent) => void;
  handleArchitectEffort: (value: ReasoningEffort | null) => void;
  handleWriterEffort: (value: ReasoningEffort | null) => void;
  handleSpeed: (value: number | readonly number[]) => void;
  handleSubmit: (
    event: SyntheticEvent<HTMLFormElement>,
    overrides?: Partial<Profile>,
  ) => void;
  updateProfile: (patch: Partial<Profile>) => void;
};

export const useProjectForm = ({
  defaults,
  tracks,
}: HookProps): ReturnProps => {
  const [selectedTrackIds, setSelectedTrackIds] = useState(() =>
    tracks.filter((track) => track.available).map((track) => track.id),
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [profile, setProfile] = useState(defaults);
  const mutation = useCreateProjectMutation();

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();

  const canSubmit = Boolean(
    trimmedTitle &&
    trimmedDescription &&
    trimmedTitle.length <= 100 &&
    trimmedDescription.length <= 2000,
  );

  const handleTitle = (event: ChangeEvent<HTMLInputElement>) =>
    setTitle(event.target.value);

  const handleDescription = (event: ChangeEvent<HTMLTextAreaElement>) =>
    setDescription(event.target.value);

  const handleProfile = (event: ProfileInputEvent) => {
    const { name, value } = event.target;
    const nextValue = ["maxChunkChars", "temperature"].includes(name)
      ? Number(value)
      : value;

    setProfile((current) => ({ ...current, [name]: nextValue }));
  };

  const handleArchitectEffort = (value: ReasoningEffort | null) => {
    if (value) {
      setProfile((current) => ({
        ...current,
        architectReasoningEffort: value,
      }));
    }
  };

  const handleWriterEffort = (value: ReasoningEffort | null) => {
    if (value) {
      setProfile((current) => ({ ...current, writerReasoningEffort: value }));
    }
  };
  const handleSpeed = (value: number | readonly number[]) => {
    const ttsSpeed = typeof value === "number" ? value : value[0];

    setProfile((current) => ({ ...current, ttsSpeed }));
  };
  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement>,
    overrides?: Partial<Profile>,
  ) => {
    event.preventDefault();

    if (!canSubmit || mutation.isPending) {
      return;
    }

    mutation.mutate({
      title: title.trim(),
      description: description.trim(),
      profile: { ...profile, ...overrides },
      selectedTrackIds,
    });
  };

  return {
    selectedTrackIds,
    setSelectedTrackIds,
    updateProfile: (patch) =>
      setProfile((current) => ({ ...current, ...patch })),
    title,
    description,
    canSubmit,
    profile,
    isPending: mutation.isPending,
    handleTitle,
    handleDescription,
    handleProfile,
    handleArchitectEffort,
    handleWriterEffort,
    handleSpeed,
    handleSubmit,
  };
};
