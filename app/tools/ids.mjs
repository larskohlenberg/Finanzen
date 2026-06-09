// app/tools/ids.mjs
function nextSerial(prefix, existingIds, width) {
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const serial = Number(id.slice(prefix.length));
      if (Number.isInteger(serial) && serial > max) max = serial;
    }
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

export function nextTransaktionId(buchungsdatum, existingIds) {
  return nextSerial(`TXN-${buchungsdatum.replaceAll("-", "")}-`, existingIds, 6);
}

export function nextTransferId(buchungsdatum, existingIds) {
  return nextSerial(`TRF-${buchungsdatum.replaceAll("-", "")}-`, existingIds, 3);
}
