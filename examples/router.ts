import { H3 } from "h3";

export const app = new H3();

app
  .get("/", () => "GET: hello world")
  .post("/", () => "POST: hello world")
  .put("/", () => "PUT: hello world")
  .delete("/", () => "DELETE: hello world")
  .patch("/", () => "PATCH: hello world")
  .head("/", () => "HEAD: hello world");
