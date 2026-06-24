export function dataRootFromArg(arg, fallbackRoot, appRoot = new URL("../", import.meta.url)) {
  if (!arg) return fallbackRoot;
  const value = String(arg).replace(/\/?$/, "/");
  const base = value.startsWith("data/") ? appRoot : new URL(`file://${process.cwd()}/`);
  return new URL(value, base);
}
