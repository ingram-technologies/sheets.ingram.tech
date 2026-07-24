-- Better Auth's `mcp` plugin (OAuth provider for MCP clients), hardened the
-- same way as drizzle/0001: `if not exists`, statement-breakpoint markers
-- between commands (the drizzle migrator sends each chunk as one prepared
-- statement, which PGlite rejects when it contains multiple commands), and
-- deny-all RLS on every table.
--
-- Generated with `npx @better-auth/cli generate` against the pinned
-- better-auth, then hardened. Regenerate and re-diff after upgrades.
--
-- These three tables are what lets `claude mcp add` complete with a browser
-- sign-in instead of a pasted API key: `oauthApplication` holds dynamically
-- registered clients (Claude Code registers itself), `oauthAccessToken` the
-- issued tokens, `oauthConsent` the user's grant per client.
--
-- Like the rest of the Better Auth schema these are deliberately absent from
-- the drizzle schema — declaring them would make drizzle-kit try to manage
-- Better Auth's tables. Better Auth reaches them through its own privileged
-- connection, which bypasses RLS, so denying the app's RLS role any access
-- costs nothing and keeps auth state off-limits to user-facing queries.

create table if not exists "public"."oauthApplication" (
	"id" text primary key,
	"name" text not null,
	"icon" text,
	"metadata" text,
	"clientId" text not null unique,
	"clientSecret" text,
	"redirectUrls" text not null,
	"type" text not null,
	"disabled" boolean,
	"userId" text references "public"."user" ("id") on delete cascade,
	"createdAt" timestamptz not null,
	"updatedAt" timestamptz not null
);--> statement-breakpoint

create table if not exists "public"."oauthAccessToken" (
	"id" text primary key,
	"accessToken" text not null unique,
	"refreshToken" text not null unique,
	"accessTokenExpiresAt" timestamptz not null,
	"refreshTokenExpiresAt" timestamptz not null,
	"clientId" text not null references "public"."oauthApplication" ("clientId") on delete cascade,
	"userId" text references "public"."user" ("id") on delete cascade,
	"scopes" text not null,
	"createdAt" timestamptz not null,
	"updatedAt" timestamptz not null
);--> statement-breakpoint

create table if not exists "public"."oauthConsent" (
	"id" text primary key,
	"clientId" text not null references "public"."oauthApplication" ("clientId") on delete cascade,
	"userId" text not null references "public"."user" ("id") on delete cascade,
	"scopes" text not null,
	"createdAt" timestamptz not null,
	"updatedAt" timestamptz not null,
	"consentGiven" boolean not null
);--> statement-breakpoint

create index if not exists "oauthApplication_userId_idx" on "public"."oauthApplication" ("userId");--> statement-breakpoint
create index if not exists "oauthAccessToken_clientId_idx" on "public"."oauthAccessToken" ("clientId");--> statement-breakpoint
create index if not exists "oauthAccessToken_userId_idx" on "public"."oauthAccessToken" ("userId");--> statement-breakpoint
create index if not exists "oauthConsent_clientId_idx" on "public"."oauthConsent" ("clientId");--> statement-breakpoint
create index if not exists "oauthConsent_userId_idx" on "public"."oauthConsent" ("userId");--> statement-breakpoint

-- Enable with no policies = deny all, for every role except the table owner.
-- Matching drizzle/0001, this is `enable` and not `force`: Better Auth reaches
-- these tables as the owner, and forcing RLS would lock out the one connection
-- that legitimately needs them.
alter table "public"."oauthApplication" enable row level security;--> statement-breakpoint
alter table "public"."oauthAccessToken" enable row level security;--> statement-breakpoint
alter table "public"."oauthConsent" enable row level security;
