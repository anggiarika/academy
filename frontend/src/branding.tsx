import { useQuery } from "@tanstack/react-query";

import { api, fileUri } from "@/src/api";

export interface Branding {
  name: string;
  logo: string | null;
}

/** School name + logo (tokenized URL, safe for <img> in print/PDF HTML). */
export function useBranding(): Branding {
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 60_000 });
  return {
    name: q.data?.school_name ?? "",
    logo: q.data?.logo_path ? fileUri(q.data.logo_path) : null,
  };
}
