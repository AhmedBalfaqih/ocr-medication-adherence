# Design changes

This file records every place where the built system differs from the Part A design. Each entry gives the change, the Part A reference, the reason and the date. Chapter 4 of the final report draws on it.

## 1. Next.js route handlers replace the Express backend

- Change: The REST API is a set of Next.js route handlers (`src/app/api/**/route.js`) that run on Node.js inside the same app as the screens. There is no separate Express server.
- Part A: Table 9, which plans an Express backend.
- Reason: One app means one project to build, test and deploy, and the screens and the API share one origin, so the login cookie works without any CORS setup. Each planned Express route maps to one route handler, and the handlers play the Backend Server part in the sequence diagram (§3.10), so the flow there is unchanged.
- Date: 2 November 2026

## 2. Vercel and Supabase replace Nginx and self hosting

- Change: The app runs on Vercel's free Hobby plan over HTTPS. The database is a free Supabase PostgreSQL project. A free cron-job.org job calls the reminder check every minute. A second free Supabase project is used for development and tests.
- Part A: Table 9, which plans Nginx.
- Reason: Every part is free, so the system costs nothing to run. Vercel gives HTTPS by default, which the camera needs (§3.7.3), and there is no server to patch or keep running. Vercel's free plan runs its own scheduled jobs only once a day, which is too slow for dose reminders, so an outside scheduler calls the check instead.
- Date: 2 November 2026

## 3. The final software stack

- Change: The front end is React 19 with Next.js 16 (App Router). The database is PostgreSQL, used through Prisma 7. The language is JavaScript (ES6+), with no TypeScript files in the app code. At the start of the build the versions were Next.js 16.4.4, React 19.3.0 and Prisma 7.10.1, and `package-lock.json` pins every exact version.
- Part A: Table 9, which lists "React.js or vanilla JavaScript" and "MongoDB or PostgreSQL".
- Reason: Table 9 left two choices open, and both are now settled. React builds the screens from small parts that can be reused, such as one medicine form for both manual entry and label scanning. The data is a chain of one to many links (user, medicine, schedule, reminder, dose log) with integer keys in the class diagram (Figure 5), so a relational database fits better than a document store. Prisma keeps the whole schema in one file, writes the migrations and gives plain, readable queries. Prisma 7 generates its client as TypeScript, but that code is made on install, is never edited by hand and is not committed, so all written code stays JavaScript as Table 9 says.
- Date: 2 November 2026

## 4. Node.js 26

- Change: The app runs on Node.js 26. `.node-version`, `.nvmrc` and the `engines` field in `package.json` pin it, and Vercel reads the `engines` field.
- Part A: Table 9 (the backend runtime).
- Reason: Node.js 26 became the Active LTS line on 28 October 2026, so it is supported for the whole project, and it is Vercel's default. Prisma 7's system requirements page lists Node.js 20, 22 and 24, so the database check (`npm run db:check`) was run on Node.js 26.12.1 on 2 November 2026. It passed, and Node.js 26 loaded the generated client with no extra tool.
- Date: 2 November 2026

## 5. Login by email only (FR2)

- Change: Users log in with their email and password. There is no username field.
- Part A: FR2 in Table 2, which says "a username or email and password".
- Reason: Registration (UC1) asks for name, email and password, and UC2 already describes login with email and password. The email is the one unique thing each user has. A username would add another thing to remember, which does not help elderly users. The final report updates the FR2 wording to match.
- Date: 2 November 2026

## 6. The shadcn/ui preset for the interface

- Change: The screens use shadcn/ui components, set up from one fixed preset (`b5JgvMfUu`): Base UI components, neutral zinc colors, the Roboto font and Hugeicons icons. The preset is used as it is. The only change is a larger base font size (`html { font-size: 125%; }`), which makes body text 20px instead of 16px. The preset sets its sizes in rem, so everything grows with it: an input box and a default button are 45px tall, a large button is 50px, and the preset's small text (`text-sm`), used for field labels, hints and button text, is 17.5px. The screens still use the large button size.
- Part A: NFR1, NFR2 and UIR4.
- Reason: The components come with labels, focus outlines and keyboard support, which helps NFR2. Using one preset without restyling keeps every screen plain and alike (NFR1), and the buttons look the same everywhere (UIR4). Larger text helps elderly users and users with limited vision (NFR2). On 3 November 2026 the base size was raised from 112.5% to 125%. At 112.5% body text was 18px, but the preset's input boxes and default buttons were 40.5px tall, under the 44px touch target, and its labels, hints and button text were 15.75px, under 16px. At 125% no text on the screens is under 16px and no input box or button is under 45px, and no preset component had to be changed. Every screen was checked at 375 and 1280 pixels wide, and nothing runs off the screen. At 125% the preset's confirm box would reach both edges of a phone screen, so the three confirm boxes (delete a medicine, delete a dose time, remove an account) get one width class in the app's own files, `w-[calc(100%-2rem)]`, which leaves a 20px gap on each side of a phone screen and keeps the preset's width on a computer, with the preset itself unchanged. The cost: less fits on a phone screen, so pages scroll a little more.
- Date: 2 November 2026 (base size changed on 3 November 2026)

## 7. One User table for patients and admins

- Change: Patient and Administrator are not separate tables. One `User` table has a `role` field (`PATIENT` or `ADMIN`). The patient-only fields, `dateOfBirth` and `conditions`, are optional. `patientId` and `adminId` become the one `User.id`. `accessLevel` is dropped, because there is only one admin level.
- Part A: Figure 5, the User class with its Patient and Administrator subclasses.
- Reason: This is the simplest way to store the subclasses (single table inheritance). Everyone logs in through one path, and one query finds the user and their role.
- Date: 2 November 2026

## 8. Time zone and account status on User

- Change: `User` gains `timezone` (an IANA zone name, default `Africa/Cairo`) and `status` (`ACTIVE` or `SUSPENDED`).
- Part A: Figure 5 (User) and FR14.
- Reason: Dose times are worked out in the user's own time zone, which keeps them right when Cairo changes its clocks for daylight saving time. FR14 (§3.9.8) asks the admin to activate and suspend accounts, which needs a status.
- Date: 2 November 2026

## 9. Schedule time and frequency

- Change: `time` is stored as wall clock text in the form `HH:mm`, such as `08:00`. `frequency` is `DAILY` or `SPECIFIC_DAYS`, and `daysOfWeek` (0 for Sunday to 6) holds the days for `SPECIFIC_DAYS`. Each daily time is its own `Schedule` row, so "twice daily" makes two rows from one form.
- Part A: Figure 5, Schedule (`time: Time`, `frequency: String`).
- Reason: This gives one clear rule for when each dose is due, and the rule stays correct when the clocks change for daylight saving time.
- Date: 2 November 2026

## 10. Reminder is the record of each due dose

- Change: `Reminder` is kept, and each row is one due dose: one schedule at one moment, stored in UTC. A unique rule on `scheduleId` and `reminderTime` together stops the same dose from being created twice. `status` is a fixed list (`PENDING`, `SENT`, `RESOLVED`), and `sentAt` and `snoozedUntil` are added for sending and for `snooze()`.
- Part A: Figure 5, Reminder.
- Reason: The reminder check runs every minute. If two runs overlap, the unique rule still leaves one reminder for each dose.
- Date: 2 November 2026

## 11. One DoseLog for each reminder

- Change: `DoseLog` is kept, with `date` and `time` as in the diagram, plus a unique `reminderId` that links each log to its reminder.
- Part A: Figure 5, DoseLog and the "Reminder 1 to 1 DoseLog" link.
- Reason: Each due dose gets exactly one answer: taken, missed or skipped. The database enforces it, so a double tap cannot log the same dose twice.
- Date: 2 November 2026

## 12. OCRScan.imagePath is always empty

- Change: `OCRScan` keeps the `imagePath` field, but it is always empty. The label image is never uploaded or stored.
- Part A: Figure 5 (OCRScan), §3.11.2 and CIR3.
- Reason: The label is read in the browser, and only the text is saved. The image never leaves the user's device (CIR3), and storing no images follows data minimization (§3.11.2).
- Date: 2 November 2026

## 13. Medicine records how it was added

- Change: `Medicine` gains `source`: `MANUAL` or `OCR`.
- Part A: Figure 5, Medicine.
- Reason: The results chapter can then count how many medicines came from a scanned label.
- Date: 2 November 2026

## 14. Dashboard is not a table

- Change: There is no `Dashboard` table. The totals and the adherence rate are worked out from `DoseLog` each time the dashboard is opened.
- Part A: Figure 5, Dashboard (`totalTaken`, `totalMissed`, `totalSkipped`).
- Reason: Stored totals would copy data that `DoseLog` already holds, and the two could drift apart.
- Date: 2 November 2026

## 15. PushSubscription is added

- Change: A new `PushSubscription` table stores each browser's Web Push subscription (its endpoint and keys) for a user.
- Part A: FR10. Figure 5 has no class for it.
- Reason: Web Push needs the subscription to send a reminder to that browser or phone.
- Date: 2 November 2026

## 16. SystemEvent is added

- Change: A new `SystemEvent` table stores events such as a failed reminder check or a suspended account, each with a type, a message and an optional link to a user.
- Part A: FR15. Figure 5 has no class for it.
- Reason: It gives the admin something to monitor (FR15) without showing any medicine data. An event says what happened, never what a patient takes.
- Date: 2 November 2026

## 17. Registration logs the new patient in

- Change: When registration succeeds, the server sets the login cookie straight away and the screen opens the dashboard. The new patient does not have to log in again.
- Part A: UC1 Register (§3.9), which ends when the account is created, and UC2 Login.
- Reason: The patient has just typed their email and password, so asking for them again adds a step and checks nothing new. The password still follows the same rules and is stored only as a bcrypt hash (DIR1). One step fewer helps elderly users (NFR1).
- Date: 2 November 2026

## 18. The admin account comes only from the seed script

- Change: Registration always creates a patient. The register screen has no role field, and the server ignores a role sent with the request. The one admin account is made by the seed script (`npm run db:seed`), together with a fictional demo patient. The seed reads their emails and passwords from environment variables and checks them with the same rules as the register form. It never changes the role of an account that already exists, so an account someone registered with the admin email stops the seed instead of becoming the admin. The admin logs in on the same login screen and goes to the Accounts screen instead of the dashboard.
- Part A: FR1, FR14 and the System Administrator actor (§3.2).
- Reason: If the register form could make an admin, anyone could give themselves access to every account. The system needs only one admin, so a script run once on each database is enough, and no admin password is written in the code.
- Date: 2 November 2026

## 19. A suspended account gets the same login error

- Change: A suspended account that tries to log in gets the same answer as an unknown email or a wrong password: "Email or password is incorrect." A suspended user who is still logged in is refused on their next request, because the server reads the account status every time. Each failed login is saved as a `LOGIN_FAILED` system event, without the email or the password.
- Part A: FR14 (§3.9.8: activate, suspend or remove) and the UC2 alternative flow (wrong credentials).
- Reason: A message such as "Your account is suspended" could only come after the password was checked, so it would tell whoever typed it that the password is right. One message for every failed login gives nothing away. The cost is that a suspended patient is not told why, so they have to contact the admin. The saved events give the admin something to monitor (FR15).
- Date: 2 November 2026

## 20. The login session is a signed token in an httpOnly cookie

- Change: On login or registration, the server signs a JSON Web Token (HS256, with the `jose` library) that holds the user's id and role and lasts seven days. It is stored in a cookie named `session` that is httpOnly, SameSite=Lax and, in production, Secure. There is no session table. Logout clears the cookie, then the browser does a full page load of the login screen, which drops everything the screens held in memory. If the Back button brings a patient screen back from the browser's cache, the screen reloads and checks the session again, so it ends on the login screen.
- Part A: FR2, FR13, NFR6 and the Logout use case (§3.9), which "ends the session and clears any sensitive data from the browser".
- Reason: Scripts on the page cannot read an httpOnly cookie, so the session cannot be stolen that way, and the browser sends the cookie with every request by itself. A signed token needs no session table to store or clean up. The server still loads the user on every request, so a suspended or removed account is refused at once. The cost is that a copy of the token made before logout would keep working until it expires.
- Date: 2 November 2026

## 21. What the profile can change

- Change: The profile screen shows the email and the time zone, and lets the patient change their name, date of birth and health conditions. Date of birth and conditions are optional, and clearing one removes it. The email, the time zone and the password cannot be changed in this version, and every account uses the Africa/Cairo time zone (entry 8). Only patients have a profile screen; the server refuses a profile change from the admin.
- Part A: FR3 and `updateProfile()` on the User class (Figure 5).
- Reason: The email is the login name, so a typing mistake in a new email would lock the patient out, and checking a new address would need an email service. A wrong time zone choice would move every reminder by hours, so all accounts keep the default. A password change needs its own form that checks the current password first, so it is left as further work. The admin account is made and kept up to date by the seed script (entry 18).
- Date: 2 November 2026

## 22. The medicine form holds name, dose and notes

- Change: The medicine form has three fields: Name, Dose and Notes, and Notes is optional. Frequency and time are not on this form. They belong to the medicine's schedules (FR9), which the patient adds from the medicine's own screen (entry 34).
- Part A: UIR2 in Table 5, which puts name, dosage, frequency, time and notes on the medicine form. Figure 5, where `time` and `frequency` belong to the Schedule class, not to Medicine.
- Reason: In Figure 5 one medicine can have several schedules, such as 08:00 and 20:00, so one time field on the medicine form could not hold them. The form follows the Medicine class, so the same form serves both typing a medicine and checking a scanned label (UIR5). A label gives a name and a dose, but never the patient's own times. After Save medicine, the patient lands on the medicine's own screen, where its dose times are added.
- Date: 2 November 2026

## 23. One screen to view, correct and delete a medicine

- Change: Pressing a medicine in the list opens that medicine's own screen. Its details are already in fields the patient can change, with a Save changes button, and a Delete medicine button sits further down, below a dividing line. There is no separate Edit button. A new medicine is added on the Add a medicine screen with a Save medicine button, and once it is saved the patient is taken to the new medicine's screen.
- Part A: UIR4 in Table 5, which asks for clearly visible and labeled Add, Edit, Delete, Save, Scan and Confirm buttons, and FR4.
- Reason: An Edit button would add one more press and a second screen that shows the same details again. The fields show that the details can be changed, and each screen keeps one main button, which suits elderly users (NFR1). The Add, Save and Delete buttons are there and labeled as UIR4 asks. The Scan and Confirm buttons came with the label scan: Scan a label sits under Add medicine on the medicines list, and Confirm and save is the main button of the scan review (entry 28).
- Date: 2 November 2026

## 24. Deleting a medicine also removes its schedules and dose history

- Change: Pressing Delete medicine first opens a box that asks "Delete this medicine?" and says "Its schedules and dose history are removed too.", with Cancel and Delete buttons. Nothing is removed until the patient presses Delete. The server then deletes the medicine, and the database removes its schedules, their reminders and their dose logs in the same step (a cascade delete).
- Part A: FR4, DR7, `deleteMedicine()` on the Medicine class, and the link in Figure 5 where one medicine has one or more schedules. Part A does not say what happens to the schedules and logs of a deleted medicine.
- Reason: DR7 asks that patients can remove wrong or outdated medicine information. A schedule or a dose log without its medicine would point at nothing, and its reminders would keep coming for a medicine the patient has removed. The database does the whole removal in one statement, so nothing is left behind halfway. The question first guards against a slip of the finger. The cost is that the medicine's past doses also leave the dashboard's statistics. Keeping the history of a stopped medicine, for example by archiving it, is left as further work.
- Date: 2 November 2026

## 25. Another patient's medicine answers "not found"

- Change: Every medicine request looks the medicine up by its id and the logged in patient's id together, inside the same database query. A medicine that belongs to someone else therefore gets the same answer as one that does not exist, 404 Not Found with the message "Medicine not found." It never gets 403 Forbidden. An id that is not a whole number, or is too large for the database, also gets 404. The screen shows "We could not find this medicine." Schedules follow the same rule through their medicine (entry 36), and so do reminders and dose logs (entry 42). The rule was planned for label scans as well; entry 29 explains their answer.
- Part A: NFR6, NFR7, DR5 and DIR2.
- Reason: Medicine ids are whole numbers that count up, so they are easy to guess. A 403 would tell someone trying ids that a medicine with that id exists and belongs to another patient. A 404 tells them nothing. Because the patient's id is part of the query, no request can load another patient's medicine first and then forget to check it. 403 is still used for the wrong role, such as the admin calling a medicine route (entry 26), because the role is not a secret.
- Date: 2 November 2026

## 26. The admin cannot see any medicine

- Change: Every medicine route accepts only a patient. The admin gets 403 with "You cannot do that." on all of them, and the admin's menu has no Medicines link. The admin screens deal with accounts and system events only.
- Part A: NFR7 in Table 3, which lets the administrator see medicine information "for technical reasons only", and §3.2.2, which says the admin role does not extend to "touching adherence data".
- Reason: The two parts of Part A disagree, and the stricter one is followed. The admin manages accounts and watches for problems, and neither job needs to see what a patient takes. Medicine records are sensitive personal information (DR5), so keeping them from the admin means fewer people can see them. The final report updates the NFR7 wording to match.
- Date: 2 November 2026

## 27. The label reader's files are served by the app itself

- Change: Tesseract.js 7.0.0 reads the label in the browser. Its worker, its engine files (tesseract.js-core 7.0.0) and the English language data (the `4.0.0_best_int` data from `@tesseract.js-data/eng` 1.0.0) are copied from the installed packages into `public/tesseract/` by `scripts/copy-tesseract.js`, which runs after every `npm install`. The browser loads them from the app's own address, never from another site. The folder is not committed, because each install rebuilds it.
- Part A: CIR3 in Table 6, the sequence diagram (§3.10), where the OCR Module is Tesseract.js, and §3.7.3, which says OCR runs locally.
- Reason: By default Tesseract.js downloads these files from a public CDN (jsDelivr). The image would still stay on the device, but the CDN would see a request from every patient who scans a label, and the scan would stop working whenever the CDN was slow or blocked. Served by the app, every request the scan makes stays on the app's own site, the files are exactly the ones installed and tested with the app, and nothing extra costs money. The cost is size: the copied files take about 46 MB in each deploy. A browser downloads only one engine file (about 3.9 MB) and the language data (about 3 MB) on its first scan, and keeps the language data for later scans.
- Date: 2 November 2026

## 28. The scanned text is saved as a draft before the patient confirms

- Change: When the label has been read in the browser, the scan screen sends only the text to `POST /api/ocr-scans`. The server saves it as an `OCRScan` row with `extractedText`, no medicine and no image, and returns the scan's id. The text fills the medicine form. Only a press on Confirm and save sends `POST /api/medicines` with the checked fields, `source: 'OCR'`, the scan id and `confirmed: true`. In one database transaction the server finds the patient's own scan that no medicine has used yet, creates the medicine, saves the confirmed details in `confirmedText` and links the scan to the new medicine. Without the confirm flag and a usable scan id, the server answers 400 and saves nothing. Label text longer than 5,000 characters is refused, and the patient is asked to type the details instead.
- Part A: The sequence diagram (§3.10), where the backend receives only the confirmed medicine details. The OCRScan class (`extractText()`, `confirmText()`) and its link to Medicine in Figure 5, the D5 OCR Scans store in the Level 1 DFD, CIR5 and DR3.
- Reason: Keeping the text that was read beside the details the patient confirmed shows, for each scan, which fields had to be corrected. That is the evidence Chapter 5 needs for keeping the confirm step (NFR10). It also lets the server check that a scanned medicine comes from a real scan by the same patient, used only once, so a request cannot simply claim to be confirmed, and one scan cannot make two medicines. The image still never leaves the device (entry 12). The cost: a scan that is read but never confirmed stays in the table with its text and no medicine. A deleted medicine leaves its scan behind too (entry 31).
- Date: 2 November 2026

## 29. A scan that cannot be used gets one answer

- Change: The scan id reaches the server in the body of the Confirm and save request, not in the address. If that scan does not exist, belongs to another patient, or has already been used for a medicine, the server gives the same answer in all three cases: 400 with "This scan cannot be used. Please scan the label again." Nothing is saved. There is no route that reads, changes or deletes a single scan.
- Part A: NFR6, NFR7, DR5 and CIR5. This refines entry 25, which planned the 404 answer for label scans too.
- Reason: 404 means the address asked for is not there. Here the address, `/api/medicines`, is fine, and one value in the body cannot be used, which is a 400. The answer is the same whether the scan is someone else's, missing or used, so it tells someone trying ids nothing, which is the aim of entry 25. The scan screen can show the message as it is.
- Date: 2 November 2026

## 30. Simple rules fill the form from the label text

- Change: The text read from the label is split into the three form fields by plain rules in `src/features/ocr/parse-label.js`. Dose: the first number followed by mg, mcg, µg, g, ml, mL, IU or %, kept exactly as printed (DR2). Name: of the lines above the dose, within the first three lines, those that are mostly letters; the line whose words the reader was surest of wins, or the longest line when no confidence is known. Notes: every other line, cut at 500 characters. A field is marked "Please check this" when it is empty, when its confidence is unknown, or when the mean confidence of its words is under 70 out of 100. The threshold of 70, the three lines and Tesseract's page segmentation mode are first values. The OCR experiment will measure them on real medicine boxes, and this entry will then be updated with the final values.
- Part A: FR7, FR8, CIR4 and UIR5 (OCR text shown in editable fields before saving), NFR4 and NFR10.
- Reason: Plain rules are quick, run in the browser, can be tested with made up labels, and can be explained line by line. Every line read ends up in one of the fields, unless the notes pass 500 characters, so the patient sees the text and corrects it before saving. Matching against a list of medicine names would need a drug database, which is left for further work, and a cloud service would break CIR3. The cost: the rules miss some layouts. When the name and the dose are on the same line, the name is left empty and marked for checking, and a short line such as "Rx" can be picked as the name.
- Date: 2 November 2026

## 31. A deleted medicine leaves its scan behind, still marked as used

- Change: When a patient deletes a medicine that came from a scan, the database clears the scan's link to it (`onDelete: SetNull`) and keeps the scan with the text that was read and the details that were confirmed. The server counts a scan as used once it holds confirmed details, so a kept scan can never make another medicine. No screen or route reads a scan, the admin never sees one, and a patient's scans are removed with their account.
- Part A: Figure 5, where one medicine "creates" zero or more OCR scans, DR7 and §3.11.2 (data minimization). Part A does not say what happens to the scans of a deleted medicine. Entry 24 covers the medicine's schedules and dose history.
- Reason: Each scan pairs what the reader saw with what the patient confirmed, which is the evidence Chapter 5 counts (entry 28). Removing the scan with its medicine would lose that pair for every scanned medicine a patient or a tester deletes later. Only the text is kept, never the image (entry 12). The cost: the label text of a deleted medicine stays in the database until the account is removed, which keeps a little more than DR7 lets the patient remove. If the supervisor prefers, the link can be changed to `onDelete: Cascade` in the schema with one migration, and the scan then goes with its medicine.
- Date: 2 November 2026

## 32. Dose times are worked out with Temporal, built into Node.js 26

- Change: Dose times are worked out with Temporal, the date and time API that is built into Node.js 26, in `src/lib/time.js`. No date library was added. Temporal takes the time zone rules from the time zone database that comes with Node.js, which on the development PC is version 2026e and holds both of Cairo's clock changes in 2026. This code runs only on the server, never in the browser.
- Part A: Table 9, which names no date or time zone tool, and UC5, where reminders trigger at the times the patient enters. Entry 33 gives the rules for the clock changes.
- Reason: Egypt moves its clocks forward in spring and back in autumn, so a fixed offset from UTC would put every dose an hour out for half the year. Temporal understands named zones such as Africa/Cairo and handles both clock changes with one setting on each call. Node.js 26 turns it on by default, so there is no package to pin, update or explain, and it is the date API of JavaScript itself. Two other choices were looked at. Luxon is one mature package that also works in older browsers, but it is one more dependency to pin and keep up to date. date-fns needs its time zone add-on (`@date-fns/tz`) as well, so two packages have to work together. Writing the offsets by hand was ruled out, because it breaks whenever the rules change. The cost: Temporal is new, and not every browser has it yet, so it stays on the server, and the app must run on Node.js 26, which entry 4 already sets. Vercel runs the deployed app on Node.js 26 too, and one new dose time on the deployed site will confirm that Temporal works there.
- Date: 2 November 2026

## 33. Dose times follow the patient's clock, also when the clocks change

- Change: A dose time is kept as the patient's own clock time, such as `08:00`, with a start date and an optional end date that are plain calendar dates. The account's time zone (`User.timezone`, Africa/Cairo, entry 8) says which clock that is. Whenever a due moment is needed, the server works it out in that zone and gets one exact moment in UTC (entries 9 and 10). It never uses the server's own time zone, because Vercel runs in UTC. The weekday, "today" and the start and end dates are all the patient's, so a Monday dose at 00:30 in Cairo counts as Monday even though it is still Sunday in UTC, and the start date and the end date both have doses. Two rules cover the clock changes. When the clocks go forward, a time can be skipped: in Cairo on Friday 24 April 2026, 00:00 to 00:59 never happens, so a dose at 00:30 that night is due at the moment the clock jumps, which the clock shows as 01:00. When the clocks go back, a time can happen twice: in Cairo on Thursday 29 October 2026, 23:00 to 23:59 happens twice, so a dose at 23:30 that night is due once, at the first 23:30. The unit tests in `test/unit/time.test.js` check both 2026 changes.
- Part A: UC5, where reminders trigger at the times entered, FR10, NIR2 (the reminder shows the scheduled time), DR2, and Figure 5, Schedule (`time: Time`, `startDate`, `endDate`). Part A does not say what happens to a dose time when the clocks change.
- Reason: Patients think in clock times. "My tablet at eight in the morning" stays 08:00 in summer and in winter, so the clock time is what is kept, while a fixed UTC moment would drift by an hour after each change. Exact UTC moments let the reminder check compare them with the current moment and nothing else. For a skipped time, the dose still comes that night, as close as possible to the time the patient chose, instead of being dropped. Temporal's default would move it later by the length of the gap, to 01:30, which is further from the chosen time. For a time that happens twice, the dose is due once, so the patient is never reminded twice for the same dose. The cost: on that one spring night, a 00:30 dose shows as due at 01:00.
- Date: 2 November 2026

## 34. Dose times have their own screens, reached from the medicine

- Change: On screen, schedules are called dose times. The medicine's own screen has a Dose times part under the medicine form. It lists each dose time in large type with how often, its dates and the next dose, or says "No dose times yet.", and it has an Add dose times button. That button opens a screen of its own, "Add dose times for" the medicine's name. There the patient enters 1 to 6 times at once (Add another time, and Remove beside each extra time), How often (entry 35), a Start date that starts as today in the patient's time zone, and an optional End date, then presses Save dose times. Each time is saved as its own schedule row (entry 9), all in one database transaction, so either every time is saved or none is. Pressing a dose time opens "Change a dose time for" the medicine's name, where Save changes changes that one time. Below a dividing line, Delete this time opens a box that asks "Delete this dose time?" and says "Its reminders and dose history are removed too.", with Cancel and Delete buttons. Both screens go back to the medicine's screen when they are done. A dose time always stays with its medicine, and a change cannot move it to another one. A medicine can have no dose times, and then it has no reminders.
- Part A: UC5 (pick a medicine, then enter time, frequency, start date and end date), UIR2 (frequency and time on the medicine form, see entry 22), FR9, and Figure 5, where one medicine has one or more schedules and Schedule has `createSchedule()` and `updateSchedule()`.
- Reason: Each screen keeps one job and one main button, which suits elderly users (NFR1). Opening the medicine first is the "pick a medicine" step of UC5, so the patient never picks from a list and cannot add a time to the wrong medicine. Changing every time of a medicine on one form would make a long form that is easy to get wrong, so each time is changed on its own, while "twice a day" is still added in one go. "Dose time" is a plainer word than "schedule" (UIR7). A medicine is saved before its times are added, whether it was typed or scanned, so for a while it has no dose times, which the "one or more" in Figure 5 does not allow. It simply gets no reminders until a time is added. Deleting a dose time removes its reminders and dose logs for the same reason as deleting a medicine (entry 24), and with the same cost: those past doses leave the dashboard's statistics.
- Date: 2 November 2026

## 35. How often: every day, or chosen days of the week

- Change: How often has two answers, Every day and Only on some days. Only on some days shows the seven days from Sunday to Saturday as boxes to tick, and at least one must be ticked. Neither answer is chosen when the screen opens, so the patient has to pick one. Other patterns, such as every 8 hours, every other day, once a month or "when needed", are not offered. A medicine taken three times a day gets three times on the same form. Entry 9 gives how the answer is stored.
- Part A: Figure 5, Schedule (`frequency: String`), UC5 and its alternative flow for a missing frequency, UIR2 and DR2.
- Reason: The two answers cover the usual instructions on a label, are easy to understand, and each gives one clear rule for when a dose is due. "Every 8 hours" really means clock times the patient picks, such as 06:00, 14:00 and 22:00, and typing them keeps the times in the patient's hands (DR2). Because nothing is chosen at the start, a patient who skips the question gets "Please choose how often.", as UC5 asks, and the app never guesses. A "when needed" medicine has no due time, so there is nothing to remind about. The cost: a pattern such as every other day cannot be entered exactly. The nearest is chosen days, which repeat each week. Other patterns are left for further work.
- Date: 2 November 2026

## 36. A schedule belongs to the patient through its medicine

- Change: `Schedule` has no user id of its own. It belongs to the patient who owns its medicine, and every schedule query reaches the patient through that link (`medicine: { userId: user.id }`) inside the same query. Another patient's dose time gets 404 "Schedule not found.", the same as one that does not exist. Listing or adding the times of another patient's medicine gets 404 "Medicine not found.", and the admin gets 403 on every schedule route, as on the medicine routes (entry 26).
- Part A: Figure 5, where Patient "owns" one or more schedules and Medicine "has" one or more schedules, and NFR6, NFR7, DR5 and DIR3 (schedules linked to a medicine record). This applies the rule of entry 25 to schedules.
- Reason: With one link, a schedule and its medicine can never point at two different patients. A second user id on the schedule would always have to match the medicine's, and one mistake there could show a schedule to the wrong patient. The patient still owns their schedules, as Figure 5 says, through their medicines. Because the link is part of the query, no request can load another patient's schedule first and then forget to check it. The cost: each schedule query also looks at the medicine table, which costs very little at this size.
- Date: 2 November 2026

## 37. A reminder check runs every minute, called from outside the app

- Change: Reminders come from one route, `POST /api/cron/tick`, which a free cron-job.org job calls every minute (entry 2). The call must carry the secret `CRON_SECRET` in an `x-cron-secret` header, or it gets 401 and does nothing. Each run has three steps. First, it creates a `Reminder` row for every dose that fell due in the last 24 hours, worked out in the patient's time zone (entry 33), counting each dose time only from the moment it was last saved (entry 44). Second, it claims each due reminder that is still waiting, marks it sent and pushes it to the patient's devices (entry 38). Third, it logs a dose as missed when it is still unanswered once the next dose is due (entry 40). The check keeps nothing in memory between runs, because everything it needs is in the database. Each step works in batches of 100 and starts no new work after 20 seconds. A step that fails is saved as a `TICK_FAILED` system event and the next step still runs, and a push that fails is saved as a `PUSH_FAILED` event. Neither event holds a medicine name or any other patient detail. A suspended account gets no new reminders and no pushes, but its doses that are already open are still marked missed.
- Part A: FR10, NIR1, UC5 ("reminders trigger at those times") and the activity diagram (§3.10), where the system waits and then sends the reminder. Part A does not say what starts the reminders or how often.
- Reason: The app runs on Vercel as short functions that stop after each request, so nothing inside the app can wait for a dose time. A call from outside every minute is the simplest clock that fits, and it costs nothing. Every step is safe to run twice. The unique rule on a schedule and its time (entry 10) means a second run creates no new row, and each reminder is claimed with one update that only works while it is still waiting, so when two runs overlap only one of them sends it. The 24 hour look back means that if cron-job.org misses some calls, the next call catches up. cron-job.org gives up after 30 seconds, so the check starts no new work after 20, which leaves time for a last push (each push waits at most 5 seconds). Anything left over is done on the next call. The tests check the secret, two runs at the same moment, the catch up after missed calls, a time already past today that starts tomorrow and a step that fails. The cost: a reminder can come up to a minute after its time. On 3 November 2026 the look back was limited to the time since the dose time was last saved (entry 44). Before that, a dose time added or changed later in the day to a time that had already passed, such as 08:00 every day added at 10:00 with today as the start date, got a reminder for today's 08:00 dose on the next call, while the medicine screen showed the next dose as tomorrow. Such a time now starts tomorrow, which is what the medicine screen shows and what the patient set up.
- Date: 3 November 2026

## 38. Reminders come by Web Push, and the dashboard lists the doses due now

- Change: A reminder is a Web Push notification, sent with the `web-push` package (version 3.6.7) and a VAPID key pair. The patient turns reminders on for each device under Reminders on the Profile screen. Only the Turn on reminders button asks the browser for permission; no screen asks by itself. The browser then gives a subscription, which is an address at its push service and two keys. The server accepts only an HTTPS address on a named host and saves it as a `PushSubscription` row (entry 15) for that patient. One browser has one address, and it belongs to whoever is logged in on it, so when another account sends the same address, the row moves to that account. The app sends the subscription again each time it opens, and Turn off reminders deletes it. A plain service worker, `public/sw.js`, shows each reminder with the medicine name as its title and the dose and time as its text, such as "500 mg due at 08:00" (NIR2). If the push service answers that a device is gone (404 or 410), its row is deleted. A reminder that cannot be delivered within an hour is dropped by the push service. The dashboard also has a Due now list of every dose that is due and not answered yet, each with large Taken, Skipped and Missed buttons.
- Part A: FR10, and NIR1 and NIR2 in Table 8. Part A does not say how a reminder reaches the patient.
- Reason: Web Push is built into Chrome, Edge, Firefox and Safari, costs nothing and needs no app store, which fits a web app (NFR9). The VAPID keys prove to the push services that a reminder comes from this app, and the private key stays on the server. The message is encrypted with the device's own keys, so the push service passes it on without being able to read the medicine name (DR5). Asking for permission only after a press means the patient knows why the browser is asking. iPhones do not tell the app when a subscription changes, so sending it again on every open keeps the saved one current. Moving the row is the one save that does not look only at the patient's own rows. The address is a secret that only the browser holds, and keeping the row with the old account would send that patient's reminders to a device someone else now uses. Push can still fail: the patient may say no, the browser may not support it, an iPhone needs the app on the Home Screen (entry 45), and a phone may be offline. The Due now list keeps FR10 and FR11 working in all those cases, because every due dose waits there until it is answered or missed. Email reminders were rejected, because they need an outside email service and have no buttons to answer from, and text messages cost money. The cost: on a computer, the browser has to be running for a reminder to show.
- Date: 3 November 2026

## 39. Taken and Skip on the notification, the other choices on the dose page

- Change: Where the browser shows buttons on a notification (Chrome, Edge and Firefox), a reminder has two: Taken and Skip. Pressing one saves the answer straight from the notification, without opening the app. Missed is not on the notification. A press on the notification itself, which is the only choice in Safari on a Mac, iPhone or iPad, opens the dose page, `/doses/` followed by the reminder's number. The dose page shows the medicine name, the dose and the time in large type (DR4), asks "Did you take this dose?" and has Taken, Skipped and Missed buttons, Remind me in 10 minutes (entry 41) and the medical advice notice (DR6). If saving from a notification button fails, for example because the login has ended, the dose page opens instead.
- Part A: NIR3 in Table 8, which says the user can mark the reminder taken, missed or skipped from the reminder itself, and UC6.
- Reason: Chrome shows at most two buttons on a notification, so the two answers a patient gives at the moment of the reminder were kept. A dose the patient does not answer is marked missed by the reminder check (entry 40), and Missed is one press away on the dose page. Safari shows no buttons on web notifications, so there the dose page is the way to answer, and it gives every patient the same large buttons. The cost: on a Mac, iPhone or iPad every answer takes a tap and then a press.
- Date: 3 November 2026

## 40. A dose counts as missed when the next dose of the same time is due

- Change: The reminder check logs a dose as missed when it still has no answer at the moment the next dose of the same dose time is due. Each dose time is its own schedule (entry 9), so a daily 08:00 dose is missed at 08:00 the next day, and a dose on chosen days is missed when the next chosen day's dose is due. The last dose before an end date is missed when the next one would have been due if the schedule went on. The check writes a `DoseLog` with the status `MISSED` and the dose's own date and time (entry 43), and the dose leaves the Due now list. Until then the dose stays in the list and can be answered, showing "Today" or, for an older dose, its weekday and date (DR4).
- Part A: UC6, whose alternative flow says a dose with no response before the next dose is marked missed, and the activity diagram (§3.10).
- Reason: This is Part A's own rule, applied to each dose time on its own, so it needs only the one schedule to work out. A patient who takes the 08:00 tablet late, at noon, can still log it as taken, while a shorter window would turn late doses into missed ones. For the last dose of a schedule there is no next dose, so the check waits as long as it would for any other dose, instead of logging it as missed in the same minute it is sent. The cost: a medicine taken at 08:00 and 20:00 has two dose times, so an unanswered 08:00 dose stays open until 08:00 the next day, past the 20:00 dose.
- Date: 3 November 2026

## 41. Remind me in 10 minutes is on the dose page

- Change: The dose page has a Remind me in 10 minutes button. It sets the reminder back to waiting, with `snoozedUntil` ten minutes on, and the reminder check sends it again once that time has passed. The dose keeps its own time, so the second reminder still says, for example, "due at 08:00". While it is snoozed, the dose is not in the Due now list. A dose that is already answered cannot be snoozed. The snooze is not a button on the notification.
- Part A: `snooze()` on the Reminder class (Figure 5), NIR3 and DR2.
- Reason: Part A gives Reminder a `snooze()` method but does not say how long or where. One fixed time of ten minutes leaves nothing to set. Safari has no notification buttons, and Chrome shows only two, which are used for Taken and Skip (entry 39), so the dose page is the one place every patient can find it. Keeping the dose time means a snooze never changes when the dose was due (DR2), and the missed rule (entry 40) still counts from that time. The cost: in Chrome, a snooze takes a press on the notification and then a press on the dose page.
- Date: 3 November 2026

## 42. One answer for each dose, but a missed dose can still be marked taken

- Change: The patient's answer, Taken, Skipped or Missed, is saved as one `DoseLog`, and the reminder is closed in the same database transaction. A second answer for the same dose gets 409 Conflict with "This dose is already recorded.", and the first answer stays. There is one exception: a dose recorded as missed can be changed to taken, once. The log keeps its id, and its `loggedAt` moves to the time of the change. Taken and skipped are final. Each answer comes back with the patient's new totals of taken, missed and skipped doses, so the screen shows them at once (NIR4). Another patient's dose gets 404, as in entry 25.
- Part A: FR11, NIR3, NIR4, UC6, DR7 and DIR4, and the "Reminder 1 to 1 DoseLog" link in Figure 5 (entry 11).
- Reason: One dose has one outcome. A double tap, or an answer from the notification and another from the dose page, cannot count the same dose twice and skew the statistics. The unique `reminderId` (entry 11) also stops two answers that arrive at the same moment. The exception follows DR7: a patient who took the tablet late and answers after the check has marked it missed would otherwise keep a wrong record. Missed to taken is the one change that brings the record closer to what happened, so it is allowed, while changing taken to skipped later would let the history be rewritten. No column says who wrote a missed log, so a Missed that the patient pressed can be changed to taken as well. The dose page then shows "If you took it after all, press Taken." with only the Taken button. The cost: a patient who pressed Taken or Skipped by mistake cannot change it in this version. A way to correct it is left as further work.
- Date: 3 November 2026

## 43. A dose log keeps the dose's own date and time

- Change: `DoseLog.date` and `DoseLog.time` hold the date and clock time the dose was due in the patient's time zone, not the moment the patient answered. That moment is kept apart in `loggedAt`. The patient's answer and the missed log from the reminder check follow the same rule. On the night the clocks go forward, a dose at 00:30 is due at the moment the clock jumps (entry 33), which the clock shows as 01:00, so its reminder says "due at 01:00" and its log records 01:00, not 00:30.
- Part A: DIR4 (adherence logs stored with date, time and dose status) and the DoseLog class in Figure 5 (`date`, `time`).
- Reason: The dashboard history (FR12) is a list of doses, and a dose answered late still belongs to its own day and time, so a Monday evening dose answered after midnight stays on Monday. For the skipped clock time, the log, the reminder, the Due now list and the dose page all show the same time, the time the dose was really due, so the patient never sees two different times for one dose. The cost: on that one spring night, the history shows 01:00 for a dose whose dose time is 00:30.
- Date: 3 November 2026

## 44. Changing a dose time keeps its open reminders

- Change: When the patient changes a dose time (entry 34), its reminders and dose logs stay. A dose that is due and not answered yet stays in the Due now list and can still be answered. From then on, the missed rule (entry 40) uses the changed dose time, so the open dose is marked missed when the next dose at the new time is due. If the new time is earlier in the day than the change but later than the open dose, that time today already counts as the open dose's next dose, so the open dose is marked missed at the next check, even though the first reminder at the new time comes tomorrow. A tick test checks this case. Each `Schedule` row also keeps `updatedAt`, the moment it was last saved, and the reminder check counts a dose time only from that moment, so a change never creates a dose for a time before it was made. A dose time that is already past today when it is added or changed starts tomorrow, and a time still to come today is due today. Deleting a dose time still removes its reminders and dose logs (entry 34).
- Part A: FR9, UC5, UC6 and DR2, and the Schedule class in Figure 5, which has no `updatedAt`. Part A does not say what happens to reminders when a schedule is changed.
- Reason: The reminder check creates a reminder only when its dose is already due, so a dose time never has reminders waiting in the future that could go wrong. An open reminder belongs to a dose that was due at the old time. Deleting it would remove that dose from the history with no missed log, so changing the time could hide a missed dose. The check looks back 24 hours (entry 37), so without the moment of the save, a time moved later, such as 08:00 changed to 21:30 at 10:00, would get a reminder at once for 21:30 the day before. That dose was never due, yet it would show in Due now and later count as missed. On 3 November 2026 the count was changed from the day of the last save to the moment of the last save. Counting from the start of that day still gave a reminder for a time that had already passed when it was added or changed, such as 08:00 added at 14:00. That reminder arrived at once, hours after its time, counted as missed if it was not answered, and did not match the next dose the medicine screen showed, which was already tomorrow. A unit test checks that after a change from 08:00 to 21:30, the open 08:00 dose waits for the next dose at 21:30, and a tick test checks that no dose is made for the day before. Unit tests and tick tests also check that 08:00 added at 14:00 starts the next day, 16:00 added at 14:00 is due the same day, 20:00 changed to 09:00 at 14:00 starts the next day, the doses after a save are still caught up after missed calls, and a save on each day the clocks change in 2026 counts from its own moment. The cost: for a while the Due now list can show a dose at the old time. If cron-job.org missed calls just before a save, the doses due before the save are not caught up. Every save counts, even one that changes only the end date, so a save made in the minute after a dose time, before the check has run, means that dose gets no reminder.
- Date: 3 November 2026

## 45. The app can be added to the Home Screen

- Change: `src/app/manifest.js` gives the app a web app manifest: the name "OCR Medication Adherence", the short name "Medicines", two plain icons (192 and 512 pixels) and a white background, and it opens at the start page without the browser's address bar. On an iPhone or iPad, the Reminders part of the Profile screen shows four steps to add the app to the Home Screen in place of the Turn on reminders button, until the app is opened from the Home Screen. The service worker is sent with `Cache-Control: no-cache`, so a device picks up a new version after each deploy.
- Part A: NFR9 and UIR6 (desktop and mobile browsers), FR10 and NIR1. Part A plans a web app with no install step.
- Reason: iPhones and iPads give Web Push only to a site added to the Home Screen (iOS 16.4 and later), and the manifest is what lets it open there as an app. On Android and on computers the app can be installed the same way, which gives the patient one icon to press. It is still the same web app with no app store, as Part A plans, so this is not a native app. The cost: on an iPhone the patient has to add the app to the Home Screen, open it from there and perhaps log in again before reminders can be turned on, which is several extra steps for an elderly user. The steps on the screen walk through them.
- Date: 3 November 2026

## 46. The adherence rate counts skipped doses

- Change: The dashboard shows one adherence rate: the taken doses as a whole percent of every logged dose, taken, missed and skipped together. It first lists the three totals, Taken, Missed and Skipped, each with its icon and word, and then the rate in a sentence. For example, 3 taken, 1 missed and 1 skipped show as "You have taken 60% of your doses so far.". The rate is rounded down to a whole number, so 100% shows only when every logged dose was taken, and a bar under the sentence shows the same value. After an answer, the dose page shows the same totals in the same order, followed by the same sentence. The rate and the totals count every dose log the patient has, and they are worked out from `DoseLog` each time the dashboard opens (entry 14). Until the first dose is logged there is no rate at all: the dashboard shows the three counts at 0 and then "No doses logged yet", with no bar. Once one dose is logged, the rate is a whole number from 0 to 100.
- Part A: Figure 5, the Dashboard class (`totalTaken`, `totalMissed`, `totalSkipped` and `getAdherenceRate()`), FR12, UIR3 and DIR5. Part A names the rate but does not say how it is worked out.
- Reason: A skipped dose is still a dose that was not taken, so leaving it out would make the rate look better than the record. With 2 taken, 1 missed and 1 skipped the rate is 50%, while leaving skipped out would give 66%. Skipped is still shown as its own total, so the patient can see which doses were skipped on purpose and which were missed. Only logged doses count, so a dose that is due and not answered yet does not lower the rate while the patient can still answer it (entry 40). A whole percent is easy to read. Before the first log the rate would be 0 out of 0, and 0% would tell a new patient they took nothing when nothing was due yet. On 3 November 2026 the rounding was changed from the nearest whole number to rounding down. Rounding to the nearest showed 100% for 200 taken out of 201, so a patient with a missed dose could read that every dose was taken. Rounded down it shows 99%, and 100% always means every logged dose was taken. The taken doses are multiplied by 100 before they are divided by the logged doses, so the rounded down number is never one too low because of how a computer stores fractions: 29 out of 100 shows 29%, not 28%. The dashboard and the dose page were also given the same order of totals and the same sentence on that date, so the patient reads one wording everywhere. The cost: a patient who skips a dose on a doctor's advice still sees a lower rate, and with rounding down a patient who took 1 dose out of 101 or more sees 0%. The rate covers every log since the account began, so there is no weekly rate and no rate for each medicine. Both are left as further work.
- Date: 3 November 2026

## 47. The empty state is for a patient with no medicines

- Change: A patient with no medicines sees "You have no medicines yet." on the dashboard, with Add a medicine as the main button, which opens the Add a medicine screen. The adherence parts are not shown. A patient who has medicines but has not logged a dose yet sees the adherence parts instead, with counts of 0, no rate (entry 46) and "No doses logged yet." under Recent doses. The server sends the number of the patient's medicines with the dashboard data, so the screen can tell the two cases apart.
- Part A: UC7 View Dashboard (§3.9), whose alternative flow says that with no data the dashboard shows an empty state that suggests adding medicines.
- Reason: "No data" can mean two things. With no medicines, adding one is the patient's next step, so the dashboard suggests it with a button that goes straight there, as UC7 asks. With medicines but no logs, nothing is wrong: the first dose may simply not be due yet. Suggesting another medicine then would be the wrong advice, so the screen shows the empty totals and says that nothing has been logged. The cost: a medicine with no dose times gives no reminders and no logs, and the dashboard does not point that out. The medicine's own screen does, with "No dose times yet." (entry 34).
- Date: 3 November 2026

## 48. The history shows the 30 most recent dose logs

- Change: Under Recent doses the dashboard lists the patient's 30 most recent dose logs, newest first by the dose's own date and time (entry 43). Each row shows the medicine's name and dose, the day with the time ("Today", or the weekday and date for an older dose), and the status as an icon and a word. Older logs stay in the database and still count in the totals and the rate (entry 46), but they are not listed. There is no paging, date filter or search.
- Part A: FR12, UIR3 and DIR5 (adherence history retrieved for the dashboard), and `getStatistics()` on the Dashboard class in Figure 5. Part A does not say how much history the dashboard shows.
- Reason: A patient with three dose times a day logs about 90 doses a month. A list that grows without end gets long to scroll and slower to load, which does not suit elderly users on a phone (NFR1, NFR3). Thirty rows cover about ten days at three doses a day, which answers the usual question, such as "did I take it yesterday evening?". The server reads only those 30 rows, and the totals are counted in the database, so the dashboard loads the same way after a year as after a week. The cost: older doses cannot be looked up one by one in this version. A full history with paging or a date filter is left as further work. Each row shows the medicine's name and dose as they are now, so a dose changed later also shows in its older rows.
- Date: 3 November 2026

## 49. Only patient accounts can be suspended, activated or removed

- Change: On the Accounts screen, only a patient's row has the Suspend (or Activate) and Remove buttons. The admin's own row, and the row of any other admin, has no buttons. The server checks the same rule: a request to change or remove an admin account gets 403 with "Only patient accounts can be changed." and changes nothing. The only thing the admin can change is the status, Active or Suspended. A role sent with the request is dropped, so no account can become an admin, or stop being one, through the app.
- Part A: FR14 and §3.9.8 (Manage User Accounts: activate, suspend or remove), and `manageAccounts()` on the Administrator class in Figure 5. Part A does not say which accounts the admin can manage.
- Reason: There is one admin, made by the seed script (entry 18). If the admin could suspend or remove their own account, one wrong press would lock everyone out of the admin screens, and only a database step could bring the account back. Changing roles in the app would also open a way to make a second admin, which entry 18 closes on purpose. Patients are the accounts that need managing, so the rule costs nothing in normal use. Hiding the buttons is only for the screen; the server check is what stops the change. The cost: a second admin account, if one is ever added by hand in the database, cannot be suspended or removed in the app either.
- Date: 3 November 2026

## 50. The account list shows no medicine counts

- Change: Each account on the Accounts screen shows only the name, the email, the role, the status and the date the account was made. There is no count of medicines, dose times or logged doses, and no adherence rate. The server sends exactly six account fields (`id`, `name`, `email`, `role`, `status` and `createdAt`) and nothing else, never the password hash, and a test checks that each account has exactly those six.
- Part A: NFR7 in Table 3, which lets the administrator see medicine information "for technical reasons only", §3.2.2, which says the admin role does not extend to "touching adherence data", and DR5 and DR8.
- Reason: Entry 26 keeps every medicine away from the admin. A count looks harmless, but it still says something about a patient's health: an account with nine medicines tells a different story from one with none. The stricter rule in §3.2.2 is followed here too, so the admin sees no trace of medical data, not even a number. Suspending, activating and removing an account need none of it. The cost: the admin cannot tell from the list whether a patient is using the app. To find out, the admin has to ask the patient.
- Date: 3 November 2026

## 51. Removing an account deletes all its data, after a question

- Change: Pressing Remove on a patient's row opens a box that asks "Remove this account?" and says that the account and all its medicines and dose history are deleted for good, with Cancel and Remove account buttons. Nothing is removed until the admin presses Remove account, and the box cannot be closed while the removal runs. The server then deletes the account, and the database removes its medicines, their schedules, reminders and dose logs, its label scans and its push subscriptions in the same step (a cascade delete). The removal is saved as an `ACCOUNT_REMOVED` system event that holds only the account's number, such as "Account 12 was removed." Older events about the account stay, but they lose their link to it, so they no longer show its email. If the patient is still logged in somewhere, their next screen sends them to the login screen. The email is free to register again.
- Part A: FR14 and §3.9.8 (remove), DR5 and §3.11.2 (data minimization). Part A does not say what happens to a removed patient's data.
- Reason: A removed account has no one to log in to it, so keeping its medicines and dose logs would leave sensitive health data (DR5) that nobody can see or correct, against data minimization (§3.11.2). The database does the whole removal in one statement, so nothing is left behind halfway, as when a medicine is deleted (entry 24). The event records that a removal happened without keeping the email of someone who is no longer a user. A removal cannot be undone, so the question guards against a slip of the finger. The cost: a patient removed by mistake loses their whole history. Suspending the account (entry 19) is the way to stop it for a while without losing anything.
- Date: 3 November 2026

## 52. The admin watches saved events, and there is no form to report a problem

- Change: The Events screen lists the events the app saves by itself: a failed login, a reminder check that stopped, a reminder that could not be sent to a device, and an account that was suspended, activated or removed. Each event shows its type in words beside an icon, its message, the email of the account it is about when there is one, and its date and time in the admin's time zone. The email comes from the event's link to the account and is never written into the event itself. There is no form where a patient can report a problem, and no screen with performance figures.
- Part A: FR15 (monitor system activity and reported issues), the System Administrator in §3.2, who monitors performance and handles reported technical issues, and `monitorSystem()` and `handleIssues()` on the Administrator class in Figure 5.
- Reason: The problems the admin can act on are the ones the app sees itself, and each one is saved the moment it happens, with no extra step for the patient. Failed logins can show someone guessing a password, and a stopped reminder check or a reminder that cannot be delivered means a patient may miss a dose. Event messages say what happened and never hold a medicine name, a dose, a dose time or a password (entry 16). A report form would be free text, and a patient could easily type a medicine or an illness into it, which the admin must never see (entry 26). Performance is measured for the report with Lighthouse runs (NFR3), not watched on an admin screen. The cost: a problem only the patient notices, such as a screen that will not load, does not reach the admin through the app, so the patient has to contact the admin another way. A report form that keeps medical details out is left as further work.
- Date: 3 November 2026

## 53. The events list shows the 50 newest events

- Change: The Events screen shows the 50 newest events, newest first, and the line "This list shows the 50 newest events." under its heading says so. Two events saved at the same moment always keep the same order. Older events stay in the database but are not listed. There is no paging, filter or search, and nothing deletes old events.
- Part A: FR15 and `monitorSystem()` on the Administrator class in Figure 5. Part A does not say how much activity the admin sees.
- Reason: The admin opens the list to see what has gone wrong lately, and the newest events answer that. A list that grows without end gets slow to load and long to scroll. The server reads only the 50 rows it shows, so the screen loads the same way after a year as after a week, as with the dose history (entry 48). The line under the heading tells the admin that older events exist. The cost: an event older than the newest 50 cannot be seen in the app. Paging or a date filter, and a way to clear out old events, are left as further work.
- Date: 3 November 2026
