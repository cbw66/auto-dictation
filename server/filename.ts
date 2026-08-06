/**
 * Multer/busboy often exposes UTF-8 filenames as latin1-misdecoded strings
 * (classic Chinese mojibake). Re-decode when needed.
 */
export function decodeUploadFilename(name: string): string {
  if (!name) return name
  // Already looks like proper Chinese UTF-8
  if (/[\u4e00-\u9fff]/.test(name) && !/[ÃÂåæçèéêë]/.test(name)) {
    return name
  }
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    if (decoded.includes('\uFFFD')) return name
    if (/[\u4e00-\u9fff]/.test(decoded) || /[ÃÂåæç]/.test(name)) {
      return decoded
    }
    return name
  } catch {
    return name
  }
}
