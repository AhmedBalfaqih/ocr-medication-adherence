# OCR Medication Adherence

A web app that helps patients take their medicines on time. The patient adds each medicine by typing it in or by scanning its label with the camera, and the label is read in the browser. Nothing is saved until the patient checks the details and confirms them. The app reminds the patient when a dose is due and shows which doses were taken, missed or skipped. It does not diagnose or give medical advice.

The app is live at https://ocr-medication-adherence.vercel.app.

## Stack

- Next.js 16 (App Router) with React 19, in JavaScript
- Tailwind CSS 4 and shadcn/ui
- PostgreSQL on Supabase, through Prisma 7
- Tesseract.js 7 to read medicine labels in the browser
- Web Push, through the `web-push` package, for dose reminders
- Vitest for tests, ESLint and Prettier for code checks
- Node.js 26 and npm

## What you need

- Node.js 26 and npm.
- A Supabase project. The free plan is enough. The app connects through the session pooler (port 5432), whose URL is in the Connect panel of the Supabase dashboard. Development uses the `public` schema, and the tests use a separate `test` schema in the same project.

## Setup

1. Copy the two example environment files:

   ```bash
   cp .env.example .env
   cp .env.test.example .env.test
   ```

2. Fill in both files. Each value has a short comment above it.
   - `DATABASE_URL` and `DIRECT_URL`: the session pooler URL. In `.env.test`, add `?schema=test` to the end of `DIRECT_URL`.
   - `JWT_SECRET` and `CRON_SECRET`: long random strings, different in each file. `JWT_SECRET` signs the login, and `CRON_SECRET` lets only the scheduler start the reminder check. This command prints one:

     ```bash
     node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
     ```

   - `APP_ORIGIN`: `http://localhost:3000`.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`: the reminder keys, filled in step 4.
   - `SEED_PATIENT_EMAIL`, `SEED_PATIENT_PASSWORD`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: the logins for the two demo accounts. Use made up emails, such as `patient@example.com`, and passwords of 8 to 72 characters. These are fictional accounts, so never use a real person's details.

   Git ignores `.env` and `.env.test`. Never commit them.

3. Install the packages. This also generates the Prisma client, which reads `DIRECT_URL`, so step 2 comes first.

   ```bash
   npm install
   ```

   After the packages are in, the install also copies the label reader's files (the Tesseract.js worker, its engine files and the English language data) from `node_modules` into `public/tesseract`. It prints `OCR files copied`. The app serves these files itself, so a label scan never loads anything from another site. Git ignores `public/tesseract`, and every `npm install` makes it again. If a file is missing, the install stops with `Could not copy the OCR files` and the reason.

4. Make a key pair for the reminders, once for `.env` and once more for `.env.test`:

   ```bash
   npx web-push generate-vapid-keys --json
   ```

   It prints a `publicKey` and a `privateKey`. Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to `mailto:` followed by your own email address. The browser gets the public key, which is why its name starts with `NEXT_PUBLIC_`. The private key stays on the server, so keep it secret. Each place the app runs gets its own pair.

5. Create the tables in the development database, then generate the client:

   ```bash
   npx prisma@7 migrate dev
   npx prisma@7 generate
   ```

   The commands name `prisma@7` so they always run Prisma 7.

6. Create the two demo accounts in the development database:

   ```bash
   npm run db:seed
   ```

   It prints `Seeded 2 accounts`. Running it again does not add copies. It resets the two accounts' names and passwords, and makes them active again. It checks the emails and passwords with the same rules as the register screen, and it never changes the role of an account that already exists. If a value breaks a rule, or one of the emails already belongs to an account with the other role, it stops and names the variable.

## Run

```bash
npm run dev
```

Then open http://localhost:3000. It takes you to the login screen.

The label scan needs the camera, and browsers allow the camera only on a secure page: `http://localhost` on the same computer, or an HTTPS address such as the deployed site. On any other plain `http` address the camera is not offered, and the scan screen lets you upload a photo or type the details instead.

Reminders by push need a secure page too, so turn them on under Profile on `http://localhost:3000` or on the deployed HTTPS site. A phone cannot reach your computer's localhost, so reminders on a phone need the deployed site.

The reminder check, `POST /api/cron/tick`, creates the reminders that are due, sends them and marks missed doses. On the deployed site, cron-job.org calls it every minute with `CRON_SECRET` in an `x-cron-secret` header. On your own computer nothing calls it, so while `npm run dev` is running, call it by hand once a dose time has passed:

```bash
node --env-file=.env -e "fetch('http://localhost:3000/api/cron/tick', { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then((response) => response.json()).then(console.log)"
```

It prints how many reminders it created, sent and marked missed, such as `{ generated: 1, sent: 1, missed: 0 }`. A wrong or missing secret prints an error with the message `Wrong cron secret.`

To check the database connection:

```bash
npm run db:check
```

It prints `Database ok`, or the kind of error if the connection fails.

## Accounts

There are two kinds of account.

- **Patient.** Anyone can create a patient account on the register screen with a name, an email and a password of 8 to 72 characters. Creating it logs the patient in straight away. A patient logs in with their email and password, can view and update their profile (name, date of birth and health conditions) and can log out. Under Medicines, a patient adds, changes and deletes their own medicines, each with a name, a dose and optional notes. A medicine can also be added with Scan a label, from a camera photo or a saved photo of the box. The label is read in the browser and only its text is sent to the server. The details fill the same form, and nothing is saved until the patient checks them and presses Confirm and save. From a medicine's own screen, the patient adds, changes and deletes its dose times: one or more times a day, every day or only on some days, from a start date to an optional end date. Under Profile, a patient turns on reminders for each device, and when a dose is due a notification shows the medicine name, the dose and the time. The dashboard lists every dose that is due under Due now, with Taken, Skipped and Missed buttons, and a dose left unanswered until the next dose of the same time is logged as missed. Below that, the dashboard shows how many doses were taken, missed and skipped, the share of logged doses that were taken, and the 30 most recent doses, or an Add a medicine button while the patient has no medicines. Each patient sees only their own data.
- **Admin.** The admin account comes only from `npm run db:seed`, never from the register screen. The admin logs in on the same login screen. The admin screens deal with accounts and system events only, and never show a patient's medicines, schedules or dose logs. Under Accounts, the admin sees each account's name, email, role, status and join date, and can suspend, activate or remove a patient account. Under Events, the admin sees the 50 newest system events, such as failed logins and reminders that could not be sent.

The seed makes one of each: "Demo Patient" and "Site Admin". Use them for demos and screenshots. A login lasts seven days, or until you log out.

## Test

```bash
npm test
```

The tests read `.env.test` and run against the `test` schema only, so they never touch the development data. Before the tests run, the setup applies the migrations, empties the test tables and creates the two demo accounts from the `SEED_` values in `.env.test`.

## Other scripts

- `npm run lint` checks the code with ESLint.
- `npm run format` formats the code with Prettier.
- `npm run build` applies any new migrations to the database in `.env`, then builds the app for production.
- `npm start` runs the production build.

## Documents

- `docs/design-changes.md` lists where the system differs from the Part A design, and why.
- `docs/test-log.md` holds the system test cases and their results.
