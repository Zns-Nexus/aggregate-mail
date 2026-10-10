export type Provider = {
  name: string;
  hex: string;
  viewBox: string;
  paths: string[];
};

// Marks for the providers the app actually connects to. Gmail and iCloud Mail
// come from Simple Icons (CC0); Fastmail and Yahoo Mail come from theSVG, the
// same open brand library the app fetches sender logos from, which publishes
// those two only as a badge - so the mark is taken on its own and drawn in the
// brand colour. Every mark carries a tight viewBox, so the four render at one
// optical size.
export const providers: Provider[] = [
  {
    name: "Gmail",
    hex: "#EA4335",
    viewBox: "0 0 24 24",
    paths: [
      "M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z",
    ],
  },
  {
    name: "iCloud Mail",
    hex: "#3693F3",
    viewBox: "0 0 24 24",
    paths: [
      "M13.762 4.29a6.51 6.51 0 0 0-5.669 3.332 3.571 3.571 0 0 0-1.558-.36 3.571 3.571 0 0 0-3.516 3A4.918 4.918 0 0 0 0 14.796a4.918 4.918 0 0 0 4.92 4.914 4.93 4.93 0 0 0 .617-.045h14.42c2.305-.272 4.041-2.258 4.043-4.589v-.009a4.594 4.594 0 0 0-3.727-4.508 6.51 6.51 0 0 0-6.511-6.27z",
    ],
  },
  {
    name: "Fastmail",
    hex: "#0067b9",
    viewBox: "234.5 234.5 555 555",
    paths: [
      "M743.55 359.1C693.88 284 608.74 234.5 512 234.5c-153.26 0-277.5 124.24-277.5 277.5A277.44 277.44 0 0 0 512 789.5c153.26 0 277.5-124.24 277.5-277.5a276.13 276.13 0 0 0-45.95-152.9zM512 731.17A219.12 219.12 0 0 1 292.83 512c0-121 98.17-219.17 219.17-219.17A219.22 219.22 0 0 1 731.17 512c0 121-98.17 219.17-219.17 219.17zM512 512l-131.92-87.95v175.9h254.56a9.27 9.27 0 0 0 9.28-9.28V424.05zm-130.54 87-.74.49z",
    ],
  },
  {
    name: "Yahoo Mail",
    hex: "#6001d2",
    viewBox: "256 275.85 512.55 472.3",
    paths: [
      "M256 390.61h101.45l59.06 151 59.83-151H575L426.38 748.15H327l40.66-94.74Zm332.7 143.54a61.36 61.36 0 1 0 61.37 61.35 61.36 61.36 0 0 0-61.37-61.35ZM768 275.85H657.83l-98.09 235.67h110.55Z",
    ],
  },
];
