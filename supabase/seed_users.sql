-- Test logins (scripts/test-db.sh loads this BEFORE migration_013, which enrols the owner).
-- owner …a1 becomes staff; outsider …b2 stands for an account from another app on the shared project.
-- GoTrue cannot load a user whose token columns are NULL, so they are set to ''.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'owner@test.local',    '', now(), now(), now(), '', '', '', '', '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'outsider@test.local', '', now(), now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
