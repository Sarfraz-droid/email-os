import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { buildOpenApiDocument } from "../openapi.js";

export const docsRoutes = new Hono();

docsRoutes.get("/openapi.json", (c) => c.json(buildOpenApiDocument()));

docsRoutes.get(
  "/docs",
  Scalar({
    url: "/openapi.json",
    pageTitle: "Gmail OS Backend API",
  })
);
