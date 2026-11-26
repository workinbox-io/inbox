export interface DeviceInfo {
  /** e.g. "Chrome", "Safari", "Firefox"; "Unknown browser" when it can't be told. */
  browser: string;
  /** e.g. "macOS", "Windows", "iOS"; "" when it can't be told. */
  os: string;
  mobile: boolean;
}

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Vivaldi\//, "Vivaldi"],
  [/Brave/, "Brave"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/curl\//, "curl"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

/** A rough, dependency-free reading of a User-Agent header for the sessions list. */
export function describeUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? "";
  return {
    browser: BROWSERS.find(([re]) => re.test(s))?.[1] ?? "Unknown browser",
    os: SYSTEMS.find(([re]) => re.test(s))?.[1] ?? "",
    mobile: /Mobile|iPhone|Android/.test(s),
  };
}
