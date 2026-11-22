// npm run new -- "first date in Delhi winter" 5000
import { planLook } from "./lib/plan.mjs";
import { printNextSteps } from "./lib/next-steps.mjs";

const [occasion, budget = "4000"] = process.argv.slice(2);
if (!occasion) {
  console.log('Usage: npm run new -- "occasion" [budget]\nExample: npm run new -- "first date in Delhi winter" 5000');
  process.exit(1);
}

const look = await planLook(occasion, budget);
console.log(`✓ Planned "${look.id}"`);
printNextSteps(look);
