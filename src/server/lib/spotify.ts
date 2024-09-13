import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { env } from "~/env";
import { getSpotifyTokenOrRefresh } from "~/server/auth";

export const getSpotifySdk = async (userId: string) => {
  const spotifyAccount = await getSpotifyTokenOrRefresh(userId);

  if (!spotifyAccount) {
    throw new Error("No spotify account found");
  }

  const token = {
    access_token: spotifyAccount.access_token!,
    token_type: spotifyAccount.token_type!,
    expires_in: spotifyAccount.expires_at! - Math.floor(Date.now() / 1000),
    refresh_token: spotifyAccount.refresh_token!,
  };

  const sdk = SpotifyApi.withAccessToken(env.SPOTIFY_CLIENT_ID, token);
  return sdk;
};
