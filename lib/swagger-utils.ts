export type ParsedEndpoint = {
  path: string;
  method: string;
  tags: string[];
  summary: string;
};

export function extractEndpoints(swagger: any): ParsedEndpoint[] {
  if (!swagger || typeof swagger !== 'object' || !swagger.paths) return [];
  const endpoints: ParsedEndpoint[] = [];
  for (const path in swagger.paths) {
    for (const method in swagger.paths[path]) {
      if (
        ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(
          method.toLowerCase()
        )
      ) {
        const operation = swagger.paths[path][method];
        endpoints.push({
          path,
          method: method.toLowerCase(),
          tags: operation.tags || [],
          summary: operation.summary || '',
        });
      }
    }
  }
  return endpoints;
}

export function generateSubset(
  swagger: any,
  selectedEndpoints: { path: string; method: string }[]
) {
  if (!swagger || typeof swagger !== 'object') return null;

  // Deep clone basic structure to avoid mutations, but we will reconstruct heavy parts
  const subset = JSON.parse(JSON.stringify(swagger));

  // Reset parts that we will build up from the selection
  subset.paths = {};
  
  if (subset.components) {
    // Keep non-reference heavy components intact, or wipe them and rebuild
    const originalComponents = subset.components;
    subset.components = {};
    if (originalComponents.securitySchemes) {
        subset.components.securitySchemes = JSON.parse(JSON.stringify(originalComponents.securitySchemes));
    }
  }
  
  // Swagger 2.0 definitions
  if (subset.definitions) subset.definitions = {};
  if (subset.parameters) subset.parameters = {};
  if (subset.responses) subset.responses = {};

  const refsToProcess = new Set<string>();

  function findRefs(obj: any) {
    if (!obj) return;
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        for (const item of obj) findRefs(item);
      } else {
        if (typeof obj.$ref === 'string') {
          refsToProcess.add(obj.$ref);
        }
        for (const key in obj) {
          findRefs(obj[key]);
        }
      }
    }
  }

  // Set up selected paths and capture initial references
  for (const { path, method } of selectedEndpoints) {
    if (!subset.paths[path]) {
      subset.paths[path] = {};
      // Include path-level parameters/servers if any method in this path is selected
      if (swagger.paths[path].parameters) {
        subset.paths[path].parameters = JSON.parse(
          JSON.stringify(swagger.paths[path].parameters)
        );
        findRefs(subset.paths[path].parameters);
      }
      if (swagger.paths[path].servers) {
        subset.paths[path].servers = JSON.parse(
          JSON.stringify(swagger.paths[path].servers)
        );
      }
    }
    subset.paths[path][method] = JSON.parse(
      JSON.stringify(swagger.paths[path][method])
    );
    findRefs(subset.paths[path][method]);
  }

  const processedRefs = new Set<string>();

  // Iteratively resolve references until none are left
  while (refsToProcess.size > 0) {
    const ref = Array.from(refsToProcess)[0];
    refsToProcess.delete(ref);

    if (processedRefs.has(ref)) continue;
    processedRefs.add(ref);

    if (ref.startsWith('#/')) {
      const parts = ref.split('/').slice(1); // ignore '#'
      let currentSrc = swagger;
      let currentDest = subset;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // JSON Pointer decoding logic (~1 -> /, ~0 -> ~)
        const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');

        if (!currentSrc || typeof currentSrc !== 'object') break; // invalid reference path
        currentSrc = currentSrc[decodedPart];

        if (i === parts.length - 1) {
          // Leaf node - copy it over
          if (currentSrc !== undefined) {
             // Create intermediate arrays/objects in destination if they don't exist
            if (currentDest[decodedPart] === undefined) {
                currentDest[decodedPart] = Array.isArray(currentSrc) ? [] : {};
            }
            currentDest[decodedPart] = JSON.parse(JSON.stringify(currentSrc));
            // Find references inside the newly copied structure
            findRefs(currentDest[decodedPart]);
          }
        } else {
          // Intermediate node
          if (currentDest[decodedPart] === undefined) {
            currentDest[decodedPart] = {} as any;
          }
          currentDest = currentDest[decodedPart];
        }
      }
    }
  }

  // Cleanup top-level component maps if they are empty
  if (subset.components) {
    for (const key of Object.keys(subset.components)) {
      if (Object.keys(subset.components[key]).length === 0) {
        delete subset.components[key];
      }
    }
    if (Object.keys(subset.components).length === 0) {
      delete subset.components;
    }
  }
  
  if (subset.definitions && Object.keys(subset.definitions).length === 0) delete subset.definitions;
  if (subset.parameters && Object.keys(subset.parameters).length === 0) delete subset.parameters;
  if (subset.responses && Object.keys(subset.responses).length === 0) delete subset.responses;


  return subset;
}
