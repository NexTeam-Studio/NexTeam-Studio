declare module "expo-file-system/legacy" {
  export const documentDirectory: string | null;
  export const EncodingType: {
    readonly UTF8: "utf8";
    readonly Base64: "base64";
  };
  export function makeDirectoryAsync(fileUri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function readAsStringAsync(fileUri: string, options?: { encoding?: "utf8" | "base64" }): Promise<string>;
}
