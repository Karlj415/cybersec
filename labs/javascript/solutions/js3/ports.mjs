// Part 3, step 3: one possible answer. Check yours with:
//   node labs/javascript/check.mjs part3 ~/js3/ports.mjs
export function isWebPort(port) {
  return port === 80 || port === 443;
}

export function isAdminPort(port) {
  return port === 22 || port === 3389;
}
