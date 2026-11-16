// Print the lifecycle state file.
import { printJson } from "../lib/format.js";
import { loadState } from "../lib/state.js";

export const runState = async (): Promise<void> => {
  const state = loadState();
  if (Object.keys(state).length === 0) {
    console.log(
      "state file is empty — run verify, then config create, then create-launch",
    );
    return;
  }
  printJson(state);
};
