# Staff invitations

The Settings page invites a cashier by email through the `invite-staff` Edge
Function. The function verifies the signed-in user and checks their current
`profiles.role` before using the server-only Supabase Auth admin API. It relies
on the `on_auth_user_created` profile trigger in `schema.sql`.

## Deploy

1. Install the Supabase CLI and link this project:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

2. Set the Edge Function secrets. Use the project URL, publishable/anon key,
   service-role key, and the exact public website origin. The service-role key
   must be added only as an Edge Function secret; never put it in Vercel
   variables used by the static build, `.env.example`, or browser code.

   ```powershell
   supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY OPK_APP_URL=https://YOUR_PUBLIC_APP_DOMAIN OPK_ALLOWED_ORIGINS=https://YOUR_PUBLIC_APP_DOMAIN
   ```

   For local testing, include the local origin in `OPK_ALLOWED_ORIGINS`, for
   example `https://YOUR_PUBLIC_APP_DOMAIN,http://localhost:3000`.

3. Deploy the function:

   ```powershell
   supabase functions deploy invite-staff
   ```

4. In Supabase Authentication URL Configuration, add
   `https://YOUR_PUBLIC_APP_DOMAIN/login` to the allowed redirect URLs so
   invitation links can return to the app.

Invited accounts are created as cashiers. Admins and managers may subsequently
change roles only through the existing `set_staff_role` database function and
its authorization rules. No service-role credential is needed in the frontend.
Deploy the updated static app to Vercel after changing the Settings page or
login callback handling.
