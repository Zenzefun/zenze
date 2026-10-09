import { pageHead } from "@/lib/seo";

const ROBOTS = "noindex, nofollow, noarchive, nosnippet, noimageindex";

export function stealthNotFoundHead() {
  return pageHead({
    description: "Zenzen",
    path: "/",
    index: false,
  });
}

export function stealthNotFoundHeaders() {
  return { "X-Robots-Tag": ROBOTS };
}
