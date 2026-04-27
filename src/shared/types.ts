export type ModelId = "bioclip-v1" | "bioclip-v2";

export interface ModelInfo {
  id: ModelId;
  name: string;
  size_mb: number;
  downloaded: boolean;
}

export interface ModelsResponse {
  active: ModelId;
  available: ModelInfo[];
}

export interface Prediction {
  scientific_name: string;
  common_name: string | null;
  taxonomy: string[];
  iucn_status: string | null;
  confidence: number;
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
  date_observed: string | null;
  location: string | null;
  comments: string | null;
  created_at: string;
}

export type NewSighting = Omit<Sighting, "id" | "created_at">;

export interface ModelDownloadProgress {
  model_id: ModelId;
  bytes_downloaded: number;
  bytes_total: number;
  status: "downloading" | "verifying" | "ready" | "error";
  error?: string;
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
    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void) => () => void;
  };
  identify: {
    predict: (imageBytes: Uint8Array) => Promise<PredictResponse>;
  };
  sightings: {
    list: (search?: string) => Promise<Sighting[]>;
    create: (s: NewSighting) => Promise<Sighting>;
    update: (id: number, patch: Partial<Sighting>) => Promise<Sighting>;
    delete: (id: number) => Promise<void>;
  };
  app: {
    version: () => Promise<string>;
    openDataFolder: () => Promise<void>;
    licenses: () => Promise<string>;
  };
}
