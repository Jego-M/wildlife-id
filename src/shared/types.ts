export type ModelId = "bioclip-v1" | "bioclip-v2";

export interface ModelArtifactStatus {
  weights: boolean;
  embeddings: boolean;
  meta: boolean;
}

export interface ModelInfo {
  id: ModelId;
  name: string;
  /** Total on-disk footprint when fully downloaded (weights + embeddings + meta). */
  size_bytes: number;
  weights_size_bytes: number;
  embeddings_size_bytes: number;
  meta_size_bytes: number;
  /** Strict: true only when all three artifacts are present and the model is loadable. */
  downloaded: boolean;
  /** Per-artifact presence — lets the UI show "Resume download" for partial state. */
  status: ModelArtifactStatus;
}

export interface ModelsResponse {
  active: ModelId;
  available: ModelInfo[];
}

export interface Prediction {
  scientific_name: string;
  common_name: string | null;
  display_label: string | null;
  taxonomy: string[];
  iucn_status: string | null;
  confidence: number;
  animal_class: string | null;
}

export interface PredictResponse {
  model_used: ModelId;
  predictions: Prediction[];
}

export interface Sighting {
  id: number;
  scientific_name: string;
  common_name: string | null;
  confidence: number;
  image_path: string;
  model_used: ModelId;
  taxonomy_class: string | null;
  date_observed: string | null;
  location: string | null;
  comments: string | null;
  created_at: string;
}

export type NewSighting = Omit<Sighting, "id" | "created_at">;

export interface CreateSightingPayload {
  scientific_name: string;
  common_name: string | null;
  confidence: number;
  image_bytes: Uint8Array;
  model_used: ModelId;
  taxonomy_class?: string | null;
  date_observed?: string | null;
  location?: string | null;
  comments?: string | null;
}

export interface ModelDownloadProgress {
  model_id: ModelId;
  bytes_downloaded: number;
  bytes_total: number;
  status: "downloading" | "verifying" | "ready" | "error";
  error?: string;
}

export interface StorageInfo {
  dataPath: string;
  modelsBytes: number;
  collectionBytes: number;
  logsBytes: number;
  diskAvailableBytes: number;
}

export interface IpcError {
  code: string;
  message: string;
}

// Shape of the contextBridge API exposed by src/main/preload.ts.
// Used in the renderer for window.api typing and in preload.ts for satisfies check.
export interface WildlifeApi {
  models: {
    list: () => Promise<ModelsResponse>;
    select: (id: ModelId) => Promise<void>;
    download: (id: ModelId) => Promise<void>;
    remove: (id: ModelId) => Promise<void>;
    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void) => () => void;
  };
  identify: {
    predict: (imageBytes: Uint8Array) => Promise<PredictResponse>;
  };
  sightings: {
    list: (search?: string) => Promise<Sighting[]>;
    create: (s: CreateSightingPayload) => Promise<Sighting>;
    update: (id: number, patch: Partial<Sighting>) => Promise<Sighting>;
    delete: (id: number) => Promise<void>;
  };
  app: {
    version: () => Promise<string>;
    openDataFolder: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    licenses: () => Promise<string>;
    storageInfo: () => Promise<StorageInfo>;
    clearLogs: () => Promise<void>;
  };
}
