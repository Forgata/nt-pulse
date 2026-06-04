export function updateUIStatus(status, textLog) {
  elStatus.innerText = `STATUS: ${status}`;
  console.log(`[STATE] ${status} - ${textLog}`);
}
