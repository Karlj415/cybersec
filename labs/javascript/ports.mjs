// A module: a file that shares some of its code. `export` marks what other
// files may import.
export function isWebPort(port) {
  return port === 80 || port === 443;
}
