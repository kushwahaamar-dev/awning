/**
 * What the test on the agent page tries with a stolen agent key, in the order it tries them.
 * The landing page lists them, the agent page shows them waiting, and the test runs them.
 */
export const ATTEMPTS = {
  ownAddress: "Pay a premium to the attacker’s own address",
  unoffered: "Pay the pool for cover nobody offered",
  onePremium: "Spend everything on one premium",
  allData: "Draw everything from the data budget",
  dataLeft: "Take what’s left of today’s data budget",
} as const;
