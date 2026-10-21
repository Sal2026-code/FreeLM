/**
 * FreeLM — motion tokens.
 *
 * One place for every duration and easing curve, so the whole app moves the
 * same way. The curves follow Material 3's "emphasized" family, which is what
 * Google's own interfaces use.
 */

export const motion = {
  /** Durations in milliseconds. */
  duration: {
    /** Opacity and colour changes. */
    micro: 100,
    /** Small controls, chips, checkboxes. */
    short: 150,
    /** Panels, menus, page-level transitions. */
    medium: 250,
    /** Large surfaces: modals, sheets, the share panel. */
    long: 400,
    /** Ambient loops: progress, shimmer. */
    ambient: 1400,
  },

  /** Easing curves. */
  ease: {
    /** The default. */
    standard: [0.2, 0, 0, 1],
    /** Entering — decelerates. */
    decelerate: [0.05, 0.7, 0.1, 1],
    /** Leaving — accelerates. */
    accelerate: [0.3, 0, 0.8, 0.15],
    /** Springy, for things that bounce into place. */
    spring: [0.34, 1.56, 0.64, 1],
    /** Symmetric, for looping. */
    smooth: [0.4, 0, 0.2, 1],
  },
} as const;

/** CSS custom properties that mirror the tokens. */
export const motionVariables = {
  '--duration-micro': `${motion.duration.micro}ms`,
  '--duration-short': `${motion.duration.short}ms`,
  '--duration-medium': `${motion.duration.medium}ms`,
  '--duration-long': `${motion.duration.long}ms`,
  '--duration-ambient': `${motion.duration.ambient}ms`,
  '--ease-standard': `cubic-bezier(${motion.ease.standard.join(', ')})`,
  '--ease-decelerate': `cubic-bezier(${motion.ease.decelerate.join(', ')})`,
  '--ease-accelerate': `cubic-bezier(${motion.ease.accelerate.join(', ')})`,
  '--ease-spring': `cubic-bezier(${motion.ease.spring.join(', ')})`,
  '--ease-smooth': `cubic-bezier(${motion.ease.smooth.join(', ')})`,
} as const;
