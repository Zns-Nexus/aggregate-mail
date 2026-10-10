export type AccountKey = "gmail" | "fastmail" | "yahoo";
export type Category = "important" | "other" | "archive";

export type Message = {
  id: string;
  sender: string;
  domain: string;
  address: string;
  subject: string;
  preview: string;
  time: string;
  day: "today" | "yesterday";
  category: Category;
  relevance: 1 | 2 | 3;
  reason: string;
  account: AccountKey;
  unread?: boolean;
};

// Demo mail for the showcase window: three connected accounts, invented senders,
// subjects and previews.
export const messages: Message[] = [
  {
    id: "m1", sender: "GitHub", domain: "github.com", address: "hello@github.com",
    subject: "Two-factor recovery codes were regenerated",
    preview: "Your new recovery codes are ready. Store them somewhere safe; the previous set no longer works.",
    time: "27m", day: "today", category: "important", relevance: 2, reason: "Account security",
    account: "fastmail", unread: true,
  },
  {
    id: "m2", sender: "Figma", domain: "figma.com", address: "notifications@figma.com",
    subject: "Sam shared “Emc² — Settings” with you",
    preview: "Leave a comment on the Appearance frame before Friday's review. Four comments are already open.",
    time: "1h", day: "today", category: "important", relevance: 3, reason: "Potential personal correspondence",
    account: "fastmail", unread: true,
  },
  {
    id: "m3", sender: "Stripe", domain: "stripe.com", address: "receipts@stripe.com",
    subject: "A payout of $4,281.00 is on the way",
    preview: "Expected in your account on 13 October. 218 payments made up this batch; fees came to $96.42.",
    time: "3h", day: "today", category: "important", relevance: 2, reason: "Money",
    account: "gmail",
  },
  {
    id: "m4", sender: "Linear", domain: "linear.app", address: "notifications@linear.app",
    subject: "ENG-482 moved to In Review",
    preview: "Alex attached a two-minute recording of the new window controls and requested review from Priya.",
    time: "4h", day: "today", category: "important", relevance: 2, reason: "Assigned to you",
    account: "fastmail", unread: true,
  },
  {
    id: "m5", sender: "Hugging Face", domain: "huggingface.co", address: "noreply@huggingface.co",
    subject: "Your model card was accepted",
    preview: "emc2-mail-sorter is now public on the Hub. Downloads in the first hour: 138. Likes: 24.",
    time: "4h", day: "today", category: "important", relevance: 1, reason: "Build result",
    account: "yahoo",
  },
  {
    id: "m6", sender: "Google", domain: "google.com", address: "no-reply@accounts.google.com",
    subject: "Security alert: new sign-in on Windows",
    preview: "A new device signed in to your account. If this was you, no action is needed.",
    time: "5h", day: "today", category: "important", relevance: 3, reason: "Account security",
    account: "gmail",
  },
  {
    id: "m7", sender: "Vercel", domain: "vercel.com", address: "notifications@vercel.com",
    subject: "Deployment ready: emc2.app",
    preview: "Build finished in 42 seconds with no errors. Twelve routes prerendered, three served dynamically.",
    time: "5h", day: "today", category: "important", relevance: 1, reason: "Build result",
    account: "fastmail",
  },
  {
    id: "m8", sender: "Slack", domain: "slack.com", address: "feedback@slack.com",
    subject: "3 new messages in #design",
    preview: "Priya: the new window controls look great against the dark UI. One nit on the hover state.",
    time: "6h", day: "today", category: "important", relevance: 2, reason: "Mentions your team",
    account: "fastmail",
  },
  {
    id: "m9", sender: "Sentry", domain: "sentry.io", address: "alerts@sentry.io",
    subject: "New issue: TypeError in MailList",
    preview: "Twelve events across four users in the last hour. First seen in release 0.1.3.",
    time: "6h", day: "today", category: "important", relevance: 2, reason: "Error in your app",
    account: "fastmail",
  },
  {
    id: "m10", sender: "Notion", domain: "notion.so", address: "team@notion.so",
    subject: "Weekly digest: 6 pages updated",
    preview: "Roadmap, Design specs and Hiring were edited this week. Two pages mention your name.",
    time: "6h", day: "today", category: "important", relevance: 2, reason: "Mentions you",
    account: "fastmail",
  },
  {
    id: "m11", sender: "Apple", domain: "apple.com", address: "no_reply@email.apple.com",
    subject: "Your subscription receipt",
    preview: "iCloud+ 2 TB renewed for $9.99. The receipt is attached to your Apple account.",
    time: "13h", day: "today", category: "important", relevance: 1, reason: "Receipt",
    account: "gmail",
  },
  {
    id: "m12", sender: "Calendly", domain: "calendly.com", address: "notifications@calendly.com",
    subject: "Priya booked 30 minutes on Thursday",
    preview: "Priya Choudhary booked “Design review” for Thursday at 15:30 with a Google Meet link.",
    time: "8h", day: "today", category: "important", relevance: 3, reason: "Booking with a person",
    account: "gmail",
  },
  {
    id: "m13", sender: "Supabase", domain: "supabase.com", address: "no-reply@supabase.com",
    subject: "Your project is approaching its quota",
    preview: "Database size reached 82% of the free plan. Requests and storage remain within limits.",
    time: "7h", day: "today", category: "other", relevance: 1, reason: "Usage notice",
    account: "fastmail",
  },
  {
    id: "m14", sender: "Railway", domain: "railway.app", address: "billing@railway.app",
    subject: "Your October receipt",
    preview: "Your subscription renewed for $20.00. The invoice is attached to your billing page.",
    time: "7h", day: "today", category: "other", relevance: 1, reason: "Receipt",
    account: "fastmail",
  },
  {
    id: "m15", sender: "Cloudflare", domain: "cloudflare.com", address: "noreply@cloudflare.com",
    subject: "Pages build succeeded for emc2",
    preview: "Redeployed 214 files to the production branch in 31 seconds. Cache purged for 8 URLs.",
    time: "7h", day: "today", category: "other", relevance: 1, reason: "Build result",
    account: "fastmail",
  },
  {
    id: "m16", sender: "OpenAI", domain: "openai.com", address: "noreply@openai.com",
    subject: "Your API usage for September",
    preview: "You used 41% of your monthly budget across 12 keys. The busiest day was 24 September.",
    time: "8h", day: "today", category: "other", relevance: 1, reason: "Usage report",
    account: "yahoo",
  },
  {
    id: "m17", sender: "Docker", domain: "docker.com", address: "billing@docker.com",
    subject: "Monthly usage summary",
    preview: "Your organisation pulled 18,400 images this month. Storage sits at 6.2 GB of 10 GB.",
    time: "8h", day: "today", category: "other", relevance: 1, reason: "Usage report",
    account: "fastmail",
  },
  {
    id: "m18", sender: "Todoist", domain: "todoist.com", address: "no-reply@todoist.com",
    subject: "Today: 5 tasks, 2 due",
    preview: "Nothing is overdue. Your streak is now 46 days.",
    time: "12h", day: "yesterday", category: "other", relevance: 2, reason: "Your daily plan",
    account: "gmail",
  },
  {
    id: "m19", sender: "Dropbox", domain: "dropbox.com", address: "no-reply@dropbox.com",
    subject: "A file was shared with you",
    preview: "Sam shared “Emc² launch notes.docx” in your team folder. Edit access has been granted.",
    time: "12h", day: "yesterday", category: "other", relevance: 2, reason: "Shared with you",
    account: "gmail",
  },
  {
    id: "m20", sender: "Uber", domain: "uber.com", address: "receipts@uber.com",
    subject: "Your Thursday trip receipt",
    preview: "Trip total $12.40 including a $2.00 booking fee. Rate your driver within 24 hours.",
    time: "15h", day: "yesterday", category: "other", relevance: 1, reason: "Receipt",
    account: "gmail",
  },
  {
    id: "m21", sender: "Medium", domain: "medium.com", address: "noreply@medium.com",
    subject: "Your story was curated",
    preview: "“Shipping a rename without losing user data” was added to three topics.",
    time: "16h", day: "yesterday", category: "other", relevance: 2, reason: "Your own work",
    account: "gmail",
  },
  {
    id: "m22", sender: "Shopify", domain: "shopify.com", address: "payouts@shopify.com",
    subject: "Your payout has been sent",
    preview: "A payout of $1,208.44 was sent to your bank account ending 4417. Expect it in two working days.",
    time: "8h", day: "today", category: "archive", relevance: 1, reason: "Payout notice",
    account: "yahoo",
  },
  {
    id: "m23", sender: "npm", domain: "npmjs.com", address: "support@npmjs.com",
    subject: "emc2-cli published 2.4.1",
    preview: "The package was published by you three minutes ago. Weekly downloads are up 12%.",
    time: "9h", day: "today", category: "archive", relevance: 1, reason: "Your own release",
    account: "fastmail",
  },
  {
    id: "m24", sender: "Atlassian", domain: "atlassian.com", address: "jira@atlassian.com",
    subject: "Weekly project summary",
    preview: "Nine issues completed, three moved to review and one slipped to next sprint.",
    time: "9h", day: "today", category: "archive", relevance: 1, reason: "Digest",
    account: "fastmail",
  },
  {
    id: "m25", sender: "PayPal", domain: "paypal.com", address: "service@paypal.com",
    subject: "You sent a payment of $75.00",
    preview: "The payment to Bright Studio is complete. This transaction is covered by purchase protection.",
    time: "16h", day: "yesterday", category: "archive", relevance: 1, reason: "Receipt",
    account: "gmail",
  },
  {
    id: "m26", sender: "Booking.com", domain: "booking.com", address: "customer.service@booking.com",
    subject: "Your stay in Lisbon is confirmed",
    preview: "Check-in on 2 November from 15:00. Free cancellation until 30 October.",
    time: "17h", day: "yesterday", category: "archive", relevance: 3, reason: "Trip with a date",
    account: "gmail",
  },
  {
    id: "m27", sender: "LinkedIn", domain: "linkedin.com", address: "updates@linkedin.com",
    subject: "You appeared in 27 searches",
    preview: "Your profile was viewed by 27 people this week, mostly recruiters in Dubai.",
    time: "17h", day: "yesterday", category: "archive", relevance: 1, reason: "Weekly digest",
    account: "gmail",
  },
  {
    id: "m28", sender: "GitLab", domain: "gitlab.com", address: "gitlab@gitlab.com",
    subject: "Pipeline failed on main",
    preview: "Job test:e2e failed after 4m12s. The first failure is in the renderer navigation spec.",
    time: "18h", day: "yesterday", category: "archive", relevance: 2, reason: "Build result",
    account: "fastmail",
  },
];

export const recentWith = (sender: string) => [
  `Welcome to ${sender}`,
  `Your ${sender} digest`,
  `${sender} monthly summary`,
];
