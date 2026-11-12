// site: Guildenstern's public home page, privacy policy and terms, linked
// from the Google OAuth consent screen (Google requires them to publish the
// app). Served from the project's Supabase domain, which is already an
// authorized domain there. Supabase serves function responses on the default
// domain as plain text, so these are written to read well as text.
//
//   /functions/v1/site           home
//   /functions/v1/site/privacy   privacy policy
//   /functions/v1/site/terms     terms

const UPDATED = "November 12, 2026";
const CONTACT = "the support email shown on Google's sign-in screen for Guildenstern";

const HOME = `GUILDENSTERN

A shared inbox for a household, where an assistant does the follow-through.

Two partners talk in one thread. Guildenstern's assistants (Mira, private to
each person, and Otis, shared between them) pick out the to-dos, keep a shared
list of who's on what and when, and send a short morning and evening rundown.

Guildenstern is a private app, currently used by invitation only.

Privacy policy: /functions/v1/site/privacy
Terms:          /functions/v1/site/terms
`;

const PRIVACY = `GUILDENSTERN PRIVACY POLICY
Last updated ${UPDATED}

WHAT GUILDENSTERN IS
Guildenstern is a private app for two partners to coordinate a household. It
is used by invitation only.

WHAT WE STORE
- Your account: your name and the Apple ID sign-in identifier.
- What you put in the app: messages, photos you attach, and your to-do list.
- Your timezone, and a push notification token so we can notify you.

GOOGLE CALENDAR AND GMAIL (OPTIONAL)
If you choose to connect Google, Guildenstern asks for read-only access:
- Calendar (calendar.readonly): to show your upcoming events in the app.
- Gmail (gmail.readonly): to read recent inbox email and suggest to-dos, such
  as a bill to pay or an appointment to confirm. For each suggestion we keep
  the sender name, subject, date and a one-line summary. We do not store
  email bodies.
Guildenstern never sends, deletes or changes your email or calendar.
Suggestions are visible only to you until you choose to add one to your
shared list.

Use of information received from Google APIs adheres to the Google API
Services User Data Policy, including the Limited Use requirements. Google
data is used only to provide these features to you. It is not sold, not used
for advertising, not used to train general AI models, and not read by people
except where you ask for help or the law requires it.

AI PROCESSING
To find to-dos and write summaries, message and email text is sent to
Anthropic's Claude API for processing. Anthropic does not use this data to
train its models.

SHARING
Your partner in the app sees your shared thread and shared list. Nothing is
shared with anyone else, except service providers that run the app
(Supabase for hosting, Anthropic for AI processing, Apple for notifications).
We do not sell data.

YOUR CHOICES
- Disconnect Google any time at myaccount.google.com/permissions. Once
  access is revoked, Guildenstern deletes its stored Google access.
- Turn off the Claude/ChatGPT connector any time from the app's menu.
- To delete your account and data, contact us at ${CONTACT}.

CONTACT
Questions: ${CONTACT}.
`;

const TERMS = `GUILDENSTERN TERMS
Last updated ${UPDATED}

Guildenstern is a private, invitation-only app provided as-is, without
warranties. Use it for your own household coordination. Don't use it to
store anything you're not allowed to share with your partner in the app.
We may change or stop the app at any time. See the privacy policy at
/functions/v1/site/privacy.
`;

Deno.serve((req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const body = path.endsWith("/privacy") ? PRIVACY : path.endsWith("/terms") ? TERMS : HOME;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
