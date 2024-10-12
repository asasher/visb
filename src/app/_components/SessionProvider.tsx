"use client";

import React, { type ReactNode } from "react";
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
interface Props {
  children: ReactNode;
}

const SessionProvider = ({ children }: Props) => {
  return (
    <NextAuthSessionProvider
      refetchOnWindowFocus={true}
      refetchInterval={15 * 60} // 15 minutes
    >
      {children}
    </NextAuthSessionProvider>
  );
};

export default SessionProvider;
