import { rm, readdir } from "node:fs/promises"
import { join } from "node:path"
import { BUN_CACHE_DIR } from "./constants"
import { findPluginEntry } from "./checker"

export async function invalidatePackageCache(): Promise<boolean> {
  try {
    const entries = await readdir(BUN_CACHE_DIR)
    const pluginEntry = findPluginEntry(entries)
    if (!pluginEntry) return false

    const cachePath = join(BUN_CACHE_DIR, pluginEntry)
    await rm(cachePath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
