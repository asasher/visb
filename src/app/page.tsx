import Link from "next/link";
import { getServerAuthSession } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { SpotifyPlayer } from "./_components/spotify-player";
import { Button } from "~/components/ui/button";

export default async function Home() {
  const session = await getServerAuthSession();

  return (
    <HydrateClient>
      <main className="grid h-dvh grid-rows-12">
        <div className="flex w-full items-center justify-between px-4 py-2">
          <div className="text-sm italic">
            <p>Rock DJ</p>
          </div>
          <Button variant={"link"} asChild>
            <Link
              className="text-xs font-bold"
              href={session ? "/api/auth/signout" : "/api/auth/signin"}
            >
              {session ? "Sign out" : "Sign in"}
            </Link>
          </Button>
        </div>
        <div className="row-start-2 -row-end-1 w-full overflow-hidden">
          {session?.user && <SpotifyPlayer token={session?.user.accessToken} />}
        </div>
      </main>
    </HydrateClient>
  );
}
