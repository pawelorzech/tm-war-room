import { SpyDeepLink } from './SpyDeepLink';

// `output: "export"` requires every dynamic segment to be enumerated at
// build time (Next.js forbids `dynamicParams: true` with static export).
// We emit a single sentinel page at `/spy/_/` and rely on the nginx rewrite
// `/spy/<digits>` → `/spy/_/` (see nginx.conf) to serve real player ids
// through the same shell. The client reads the actual id from
// `window.location.pathname` so the URL bar still shows `/spy/{playerId}`.
export function generateStaticParams() {
  return [{ id: '_' }];
}

export const dynamic = 'force-static';

export default async function SpyByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SpyDeepLink routeId={id} />;
}
