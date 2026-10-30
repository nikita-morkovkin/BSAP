import type { ExportArtifact } from "@/types/export-artifact.type";
import { axiosInstance } from "./axiosInstance";

export const exportsApi = {
  root: (id: string) => `/projects/${encodeURIComponent(id)}/exports`,
  list: async (id: string): Promise<ExportArtifact[]> =>
    (await axiosInstance.get(exportsApi.root(id))).data,
  download: (id: string, kind: string, format: string) =>
    `${axiosInstance.defaults.baseURL}${exportsApi.root(id)}/${kind}/download?format=${format}`,
  zip: (id: string, kinds: string[]) =>
    `${axiosInstance.defaults.baseURL}${exportsApi.root(id)}/zip?kinds=${kinds.join(",")}`,
  build: async (
    id: string,
    kind: string,
    durationSec?: number,
  ): Promise<void> => {
    await axiosInstance.post(`${exportsApi.root(id)}/${kind}/build`, {
      durationSec,
    });
  },
};
