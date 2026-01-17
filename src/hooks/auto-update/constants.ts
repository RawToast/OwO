import { homedir } from "node:os"
import { join } from "node:path"

export const PACKAGE_NAME = "OwO"
export const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`

// Bun's global cache directory for installed packages
export const BUN_CACHE_DIR = join(homedir(), ".bun", "install", "cache")

// Toast display duration in milliseconds
export const TOAST_DURATION = 5000
