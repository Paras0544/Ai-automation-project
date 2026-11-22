// Runs before the autopilot: pulls Claude's latest fixes and learned rules from GitHub,
// so you never need to type "git pull". Set SYNC=0 in .env to turn off.
import { syncPull } from "./lib/learning.mjs";
syncPull();
