import type { Project } from "./auth.ts";

/** Hono environment: middleware populates `project` from the API key. */
export type Env = {
  Variables: {
    project: Project;
  };
};
