/** Values safe to use on both server and browser. */
export const PASSWORD_MIN = 8;

/** The usual mentor slots (Bangladesh time, evening), offered as one-tap choices. */
export const MENTOR_SLOTS = [
  { value: "19:00", label: "7:00 pm" },
  { value: "19:40", label: "7:40 pm" },
  { value: "20:20", label: "8:20 pm" },
  { value: "21:00", label: "9:00 pm" },
  { value: "21:40", label: "9:40 pm" },
];
/** A slot is 40 minutes; a teacher can't have two sessions closer than this. */
export const MENTOR_SLOT_MINUTES = 40;
export const MENTOR_MAX_PHOTOS = 5;
