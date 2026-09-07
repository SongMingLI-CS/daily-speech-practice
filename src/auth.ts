import "server-only";

import { randomUUID } from "node:crypto";

import { compare } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

import { db } from "@/db";
import { oauthAccounts, userCredentials, userSettings, users } from "@/db/schema";
import { loginSchema } from "@/lib/auth-validation";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "邮箱和密码",
    credentials: {
      email: { label: "邮箱", type: "email" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const [account] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          passwordHash: userCredentials.passwordHash,
        })
        .from(users)
        .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
        .where(eq(users.email, parsed.data.email))
        .limit(1);

      if (!account || !(await compare(parsed.data.password, account.passwordHash))) {
        return null;
      }

      return {
        id: account.id,
        name: account.name,
        email: account.email,
        image: account.image,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;

      const [linkedAccount] = await db
        .select({ userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, account.provider),
            eq(oauthAccounts.providerAccountId, account.providerAccountId),
          ),
        )
        .limit(1);

      if (linkedAccount) {
        user.id = linkedAccount.userId;
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const userId = existingUser?.id ?? randomUUID();

      if (existingUser) {
        await db
          .insert(oauthAccounts)
          .values({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            userId,
          })
          .onConflictDoNothing();
      } else {
        await db.transaction(async (tx) => {
          await tx.insert(users).values({
            id: userId,
            email,
            name: user.name?.trim() || email.split("@")[0],
            image: user.image,
            emailVerified: new Date(),
          });
          await tx.insert(oauthAccounts).values({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            userId,
          });
          await tx.insert(userSettings).values({ userId });
        });
      }

      user.id = userId;
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? session.user : null;
}
