import { doorUrl } from "@/lib/server/maya/shape";

/** The Linktree / x_own_domain switch is retired. There is one door. */
export async function ownDomainOn() {
  return true;
}

export async function siteDoor() {
  return doorUrl();
}
