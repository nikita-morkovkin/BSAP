import { useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { useCreateProjectMutation } from './mutations/useCreateProjectMutation.hook';
import type { Profile, ReasoningEffort } from '@/types/project.types';
import type { ProfileInputEvent } from '@/types/form.types';

type HookProps = { defaults: Profile };
type ReturnProps = {
  topic: string;
  profile: Profile;
  isPending: boolean;
  handleTopic: (event: ChangeEvent<HTMLInputElement>) => void;
  handleProfile: (event: ProfileInputEvent) => void;
  handleArchitectEffort: (value: ReasoningEffort | null) => void;
  handleWriterEffort: (value: ReasoningEffort | null) => void;
  handleSpeed: (value: number | readonly number[]) => void;
  handleSubmit: (event: SyntheticEvent<HTMLFormElement>, overrides?: Partial<Profile>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
};

export const useProjectForm = ({ defaults }: HookProps): ReturnProps => {
  const [topic, setTopic] = useState('');
  const [profile, setProfile] = useState(defaults);
  const mutation = useCreateProjectMutation();

  const handleTopic = (event: ChangeEvent<HTMLInputElement>) => setTopic(event.target.value);
  const handleProfile = (event: ProfileInputEvent) => {
    const { name, value } = event.target;
    const nextValue = ['maxChunkChars', 'temperature'].includes(name) ? Number(value) : value;

    setProfile((current) => ({ ...current, [name]: nextValue }));
  };
  const handleArchitectEffort = (value: ReasoningEffort | null) => {
    if (value) {
      setProfile((current) => ({ ...current, architectReasoningEffort: value }));
    }
  };
  const handleWriterEffort = (value: ReasoningEffort | null) => {
    if (value) {
      setProfile((current) => ({ ...current, writerReasoningEffort: value }));
    }
  };
  const handleSpeed = (value: number | readonly number[]) => {
    const ttsSpeed = typeof value === 'number' ? value : value[0];

    setProfile((current) => ({ ...current, ttsSpeed }));
  };
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>, overrides?: Partial<Profile>) => {
    event.preventDefault();

    if (!topic.trim() || mutation.isPending) {
      return;
    }

    mutation.mutate({ topic: topic.trim(), profile: { ...profile, ...overrides } });
  };

  return {
    updateProfile: (patch) => setProfile((current) => ({ ...current, ...patch })),
    topic, profile, isPending: mutation.isPending, handleTopic, handleProfile,
    handleArchitectEffort, handleWriterEffort, handleSpeed, handleSubmit,
  };
};