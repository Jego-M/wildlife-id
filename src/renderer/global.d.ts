import type { WildlifeApi } from "../shared/types";

declare global {
  interface Window {
    api: WildlifeApi;
  }
}
