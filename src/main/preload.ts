import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  ModelId,
  PredictResponse,
  Sighting,
  NewSighting,
  ModelDownloadProgress,
  ModelsResponse,
  WildlifeApi,
} from "../shared/types";

const api = {
  models: {
    list: (): Promise<ModelsResponse> =>
      ipcRenderer.invoke("models:list"),

    select: (id: ModelId): Promise<void> =>
      ipcRenderer.invoke("models:select", id),

    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, p: ModelDownloadProgress) => cb(p);
      ipcRenderer.on("models:download-progress", handler);
      return () => ipcRenderer.off("models:download-progress", handler);
    },
  },

  identify: {
    predict: (imageBytes: Uint8Array): Promise<PredictResponse> =>
      ipcRenderer.invoke("identify:predict", imageBytes),
  },

  sightings: {
    list: (search?: string): Promise<Sighting[]> =>
      ipcRenderer.invoke("sightings:list", search),

    create: (s: NewSighting): Promise<Sighting> =>
      ipcRenderer.invoke("sightings:create", s),

    update: (id: number, patch: Partial<Sighting>): Promise<Sighting> =>
      ipcRenderer.invoke("sightings:update", id, patch),

    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke("sightings:delete", id),
  },

  app: {
    version: (): Promise<string> =>
      ipcRenderer.invoke("app:version"),

    openDataFolder: (): Promise<void> =>
      ipcRenderer.invoke("app:open-data-folder"),

    licenses: (): Promise<string> =>
      ipcRenderer.invoke("app:licenses"),
  },
};

contextBridge.exposeInMainWorld("api", api satisfies WildlifeApi);
