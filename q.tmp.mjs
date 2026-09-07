import postgres from "postgres";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sql=postgres(env.DATABASE_URL,{prepare:false});
console.log(JSON.stringify(await sql.unsafe(process.argv[2]),null,2));
await sql.end();
