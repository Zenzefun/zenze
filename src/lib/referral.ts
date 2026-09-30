const KEY = "zenze.ref";

export function captureRef() {
  if (typeof window === "undefined") return;
  const code = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9]{4,12}$/.test(code)) localStorage.setItem(KEY, code);
}

export function storedRef() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
