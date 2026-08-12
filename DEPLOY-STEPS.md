# What to do when you have electricity/internet

## Files changed in this round (7 files)
- `rules.html` — **NEW FILE**
- `login.js` — updated (new default fields on signup)
- `post-property.html` — updated (landlord name/phone fields)
- `post-property.js` — updated (shows/saves landlord fields)
- `property-details.js` — updated (violation-type reporting)
- `firebase-rules.txt` — updated (locks new fields from self-editing)
- `dashboard.html`, `feed.html`, `property-details.html`, `profile.html`,
  `dispute.html` — updated (added "Rules" link to nav)

## Step 1 — Upload files to GitHub
1. Go to `github.com/TElite16/VerifyStay`
2. Click **Add file → Upload files**
3. Drag in all the changed files listed above (including the new `rules.html`)
4. Since these are the SAME filenames as what's already there, GitHub will
   overwrite them automatically — you don't need to delete anything first
5. Scroll down, write a commit message like "Add rules page, agent levels,
   landlord authorization, violation reporting"
6. Click **Commit changes**
7. Wait 1-2 minutes, then check the **Actions** tab for the green checkmark
   confirming the site rebuilt successfully

## Step 2 — Re-publish Firestore rules
1. Go to Firebase Console → your VerifyStay project → **Firestore Database**
   → **Rules** tab
2. Open `firebase-rules.txt` (updated version) and copy everything
3. Paste it into the Firebase Console rules editor, replacing what's there
4. Click **Publish**
5. Confirm it says "Rules published successfully"

## Step 3 — Quick test after both are live
1. Visit `https://telite16.github.io/VerifyStay/rules.html` — confirm the
   Rules page loads and looks right
2. Sign up as a brand-new test agent account → confirm no errors
3. Post a property as that agent → confirm the "Landlord Name & Phone" fields
   appear and the listing saves without error
4. On any property page, click "Report this listing" → confirm the new
   numbered category prompt appears before the reason prompt

## Step 4 — Note on existing test accounts
Any user accounts you created **before** this update won't have
`agentLevel`, `landlordTier`, `strikeCount`, or `suspendedUntil` fields yet.
This won't break anything (the app doesn't display them yet), but if you
want them for testing later, either:
- Manually add the 4 fields to that user's document in Firestore Console, or
- Just delete the test account and sign up fresh (simpler)

That's it — no other manual Firestore console setup is needed for this round.
