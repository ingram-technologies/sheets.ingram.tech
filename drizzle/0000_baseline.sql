-- Baseline, squashed 2026-11-01 from 0000_workbooks..0011_mcp_oauth_provider.
--
-- The body is a `pg_dump --schema-only --no-owner --schema=public` of
-- production with the full old chain applied, excluding every table nk-auth's
-- chain owns (user, session, account, verification, jwks, passkey and the
-- oauth* provider tables from its 0004). That chain runs first, here and in
-- every harness, so this file holds the app's own tables only.
--
-- Transforms: preamble SETs, psql \restrict lines and the public schema's
-- CREATE/COMMENT dropped; a statement-breakpoint between statements, because
-- the drizzle migrator sends each chunk as one prepared statement.

SET check_function_bodies = false;
--> statement-breakpoint
-- Name: inference_credential; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.inference_credential (
    user_id text NOT NULL,
    token_ciphertext text NOT NULL,
    token_hint text NOT NULL,
    source text NOT NULL,
    base_url text,
    agent_id text NOT NULL,
    agent_sig text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone
);
--> statement-breakpoint
-- Name: workbook; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.workbook (
    name text NOT NULL,
    bytes bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT uuidv7() CONSTRAINT workbook_id_v7_not_null NOT NULL,
    google_spreadsheet_id text,
    user_id text NOT NULL,
    deleted_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    last_activity jsonb
);
--> statement-breakpoint
-- Name: inference_credential inference_credential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.inference_credential
    ADD CONSTRAINT inference_credential_pkey PRIMARY KEY (user_id);
--> statement-breakpoint
-- Name: workbook workbook_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.workbook
    ADD CONSTRAINT workbook_pkey PRIMARY KEY (id);
--> statement-breakpoint
-- Name: workbook_user_id_updated_at_idx; Type: INDEX; Schema: public; Owner: -
CREATE INDEX workbook_user_id_updated_at_idx ON public.workbook USING btree (user_id, updated_at DESC NULLS LAST);
--> statement-breakpoint
-- Name: inference_credential inference_credential_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.inference_credential
    ADD CONSTRAINT inference_credential_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Name: workbook workbook_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.workbook
    ADD CONSTRAINT workbook_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
