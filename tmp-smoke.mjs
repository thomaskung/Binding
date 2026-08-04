import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,"");
}
const tok = env.MODAL_API_TOKEN;
async function call(url, body){ const t=Date.now(); const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${tok}`},body:JSON.stringify(body)}); const dt=Date.now()-t; if(!r.ok) return {status:r.status,dt}; return {status:200,dt,json:await r.json()}; }
const e = await call("https://thomaskung--binding-embeddings-embedder-embed.modal.run",{text:"senior backend engineer hong kong fintech go postgres kubernetes"});
console.log("embed:", e.status, e.dt+"ms", e.json?.embedding? "dim="+e.json.embedding.length : "");
const rd = await call("https://thomaskung--binding-llm-qwen-redact.modal.run",{text:"John Smith, +852 9123 4567, worked at HSBC Hong Kong as senior backend engineer on Go payments."});
console.log("redact:", rd.status, rd.dt+"ms", rd.json?.redactedText? JSON.stringify(rd.json.redactedText).slice(0,160) : "");
