import { APP_NAME } from "./config";

export function pageMeta(label: string, description: string) {
  const title = `${label} — ${APP_NAME}`;
  return { meta: [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] };
}