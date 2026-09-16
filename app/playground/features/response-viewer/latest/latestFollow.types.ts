export type LatestFollowMode = "follow" | "hold" | "frozen";

export type LatestFollowState = {
  mode: LatestFollowMode;
  targetMessageId?: string;
  newerCount: number;
};
