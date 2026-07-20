import { encode } from "gpt-tokenizer";
import { LIVERY_AGENT_GUIDE } from "@liveryscript/core";

console.log(`Livery agent guide: ${encode(LIVERY_AGENT_GUIDE).length} tokens`);
