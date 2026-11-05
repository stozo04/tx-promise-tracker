import { json, options } from "@/lib/http";
import { openApiSpec } from "@/lib/openapi";

export function OPTIONS() {
  return options();
}

export function GET() {
  return json(openApiSpec);
}
