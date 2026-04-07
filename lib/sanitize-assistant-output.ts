const KB_REF_IN_PARENS = /[（(]\s*KB\s*\d+(?:\s*[、,，/]\s*KB\s*\d+)*\s*[)）]/gi;
const KB_REF_ANYWHERE = /KB\s*\d+/gi;
const KB_REF_TRAILING = /[（(]\s*KB\s*\d*$/gi;

export function sanitizeAssistantOutput(text: string): string {
  return text
    .replace(KB_REF_IN_PARENS, "")
    .replace(KB_REF_TRAILING, "")
    .replace(KB_REF_ANYWHERE, "")
    .replace(/[ \t]+([，。！？；：、,.;:!?])/g, "$1")
    .replace(/([（(])\s*([)）])/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
