import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { resolve } from "path";
import * as schema from "../lib/db/schema";

const dbPath = resolve(__dirname, "../../data/maqiu.db");

const client = createClient({
  url: `file:${dbPath}`,
});

export const db = drizzle(client, { schema });
