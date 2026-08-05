/** Resolve project aliases and extensionless imports for TypeScript source tests. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const projectRelativeUrl = new URL(`../${specifier.slice(2)}`, import.meta.url)
      .href;
    try {
      return await nextResolve(projectRelativeUrl, context);
    } catch (error) {
      if (error?.code === "ERR_MODULE_NOT_FOUND") {
        return nextResolve(`${projectRelativeUrl}.ts`, context);
      }
      throw error;
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelative =
      specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[a-z0-9]+$/i.test(specifier);
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      isRelative &&
      !hasExtension
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
