export type ModelOption = {
  id: string;
  name: string;
  supportedParameters: string[];
  reasoning: {
    mandatory: boolean;
    defaultEnabled: boolean;
    supportedEfforts: string[];
    defaultEffort: string | null;
  };
};
export type VoiceOption = { id: string; name: string };