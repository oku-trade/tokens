import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";

// Include the processing recipe in each hash so recipe changes invalidate old uploads.
export class UploadManifest {
  private constructor(
    private readonly file: string,
    private readonly hashes: Record<string, string>,
  ) {}

  static async load(file = ".upload-manifest.json"): Promise<UploadManifest> {
    try {
      const hashes = JSON.parse(await fs.readFile(file, "utf8"));
      if (
        !hashes ||
        Array.isArray(hashes) ||
        typeof hashes !== "object" ||
        !Object.values(hashes).every((value) => typeof value === "string")
      ) {
        throw new Error(`Invalid upload manifest: ${file}`);
      }
      return new UploadManifest(file, hashes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return new UploadManifest(file, {});
    }
  }

  async upload(key: string, source: Buffer, recipe: string, upload: () => Promise<unknown>): Promise<boolean> {
    const hash = createHash("sha256").update(recipe).update("\0").update(source).digest("hex");
    if (this.hashes[key] === hash) return false;
    await upload();
    this.hashes[key] = hash;
    return true;
  }

  async save(): Promise<void> {
    const sorted = Object.fromEntries(Object.entries(this.hashes).sort(([a], [b]) => a.localeCompare(b)));
    await fs.writeFile(this.file, `${JSON.stringify(sorted, null, 2)}\n`);
  }
}
