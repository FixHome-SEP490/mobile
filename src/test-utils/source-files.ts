// Test-only helper: list and read the app's own source files, for tests that guard against a pattern coming back.
type Dirent = { name: string; isDirectory: () => boolean };
const fs = jest.requireActual<{
  readdirSync: (dir: string, options: { withFileTypes: true }) => Dirent[];
  readFileSync: (file: string, encoding: 'utf8') => string;
}>('fs');
const path = jest.requireActual<{ join: (...parts: string[]) => string; resolve: (...parts: string[]) => string; relative: (from: string, to: string) => string }>('path');

declare const __dirname: string;

export const SRC_DIR = path.resolve(__dirname, '..');

/** Every non-test .ts/.tsx file under src, as [path relative to src with forward slashes, content]. */
export function appSources(dir = SRC_DIR): [string, string][] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): [string, string][] => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return appSources(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || full.includes('test-utils')) return [];
    return [[path.relative(SRC_DIR, full).split('\\').join('/'), fs.readFileSync(full, 'utf8')]];
  });
}
