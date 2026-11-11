// npm run rsl:check <url>: discover and evaluate a page's RSL 1.0 terms.
import { checkRsl, publicRsl } from "../src/lib/rsl";

const url = process.argv[2];
if (!url) {
  console.error("usage: npm run rsl:check <url>");
  process.exit(2);
}
const r = await checkRsl(url);
console.log(JSON.stringify(publicRsl(r), null, 2));
