'use client';

import React, { useState, useMemo, useRef } from 'react';
import { extractEndpoints, generateSubset, ParsedEndpoint } from '@/lib/swagger-utils';
import { Check, Copy, Upload, ChevronDown, ChevronRight, Search, Download } from 'lucide-react';

const METHOD_STYLES: Record<string, { bg: string, border: string, badge: string }> = {
  get: { bg: 'bg-[#ebf3fb]', border: 'border-[#61affe]', badge: 'bg-[#61affe]' },
  post: { bg: 'bg-[#e8f6f0]', border: 'border-[#49cc90]', badge: 'bg-[#49cc90]' },
  put: { bg: 'bg-[#fbf1e6]', border: 'border-[#fca130]', badge: 'bg-[#fca130]' },
  delete: { bg: 'bg-[#fae7e7]', border: 'border-[#f93e3e]', badge: 'bg-[#f93e3e]' },
  patch: { bg: 'bg-[#e9fbf7]', border: 'border-[#50e3c2]', badge: 'bg-[#50e3c2]' },
  options: { bg: 'bg-[#eef2f9]', border: 'border-[#0d5aa7]', badge: 'bg-[#0d5aa7]' },
  head: { bg: 'bg-[#f2e6ff]', border: 'border-[#9012fe]', badge: 'bg-[#9012fe]' },
  default: { bg: 'bg-white', border: 'border-slate-300', badge: 'bg-slate-600' }
};

const resolveRef = (ref: string, swagger: any): any => {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.split('/').slice(1);
  let current = swagger;
  for (const part of parts) {
    if (!current) return null;
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
    current = current[decoded];
  }
  return current;
};

const highlightJson = (json: any) => {
  if (json === undefined) return '';
  const formatted = JSON.stringify(json, null, 2);
  if (!formatted) return '';

  return formatted.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          const key = match.replace(/:$/, '').trim();
          return `<span class="text-white">${key}</span><span class="text-white">:</span>`;
        }
        return `<span class="text-[#8f9d6a]">${match}</span>`; // string
      } else if (/true|false/.test(match)) {
        return `<span class="text-[#d38b5d]">${match}</span>`; // boolean
      } else if (/null/.test(match)) {
        return `<span class="text-gray-400">${match}</span>`; // null
      } else {
        return `<span class="text-[#e06c75]">${match}</span>`; // number
      }
    }
  );
};

const RequestBodyView = ({ requestBody, parsedSwagger }: { requestBody: any, parsedSwagger: any }) => {
  const contentKeys = requestBody.content ? Object.keys(requestBody.content) : [];
  const [selectedMediaType, setSelectedMediaType] = React.useState(contentKeys.length > 0 ? contentKeys[0] : null);

  const currentSchema = 
    selectedMediaType && requestBody.content && requestBody.content[selectedMediaType] 
      ? requestBody.content[selectedMediaType].schema 
      : requestBody.schema;

  if (!currentSchema) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-bold text-gray-800 text-base flex items-center gap-2">
          Request body 
          {requestBody.required && <span className="text-red-500 text-xs font-bold font-sans">* required</span>}
        </h4>
        {contentKeys.length > 0 && (
          <select 
            value={selectedMediaType || ''}
            onChange={e => setSelectedMediaType(e.target.value)}
            className="text-[13px] font-mono border border-gray-300 bg-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {contentKeys.map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        )}
      </div>
      <div className="border border-gray-200 rounded bg-white">
        {requestBody.description && (
          <div className="px-4 py-3 text-gray-700 whitespace-pre-wrap text-sm font-sans border-b border-gray-200">
             {requestBody.description}
          </div>
        )}
        <div className="p-4">
          <div className="bg-[#282c34] rounded text-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-[12px] font-sans px-3 py-2 bg-[#1e2227] border-b border-[#3b4048]">
                <div className="flex items-center gap-2">
                  <span className="font-bold">Example Value</span><span className="text-gray-500">|</span><span className="text-gray-400">Schema</span>
                </div>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto custom-scrollbar">
              <pre 
                className="text-[13px] font-mono leading-relaxed text-[#abb2bf] whitespace-pre-wrap word-break-all"
                dangerouslySetInnerHTML={{ __html: highlightJson(generateExample(currentSchema, parsedSwagger)) }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const generateExample = (schema: any, swagger: any, seenRefs = new Set<string>()): any => {
  if (!schema) return undefined;
  
  if (schema.$ref) {
    if (seenRefs.has(schema.$ref)) return "[Circular Reference]"; 
    const resolved = resolveRef(schema.$ref, swagger);
    return generateExample(resolved, swagger, new Set([...seenRefs, schema.$ref]));
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  if (schema.allOf) {
     let combined = {};
     for (const s of schema.allOf) {
         const ex = generateExample(s, swagger, seenRefs);
         if (ex && typeof ex === 'object') {
             combined = { ...combined, ...ex };
         }
     }
     return combined;
  }
  
  if (schema.oneOf && schema.oneOf.length > 0) {
    return generateExample(schema.oneOf[0], swagger, seenRefs);
  }
  
  if (schema.anyOf && schema.anyOf.length > 0) {
    return generateExample(schema.anyOf[0], swagger, seenRefs);
  }

  const type = schema.type || (schema.properties ? 'object' : undefined);

  switch (type) {
    case 'object':
      const obj: any = {};
      if (schema.properties) {
        for (const key in schema.properties) {
          obj[key] = generateExample(schema.properties[key], swagger, seenRefs);
        }
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        obj['additionalProp1'] = generateExample(schema.additionalProperties, swagger, seenRefs);
      }
      return obj;
    case 'array':
      return [generateExample(schema.items || {}, swagger, seenRefs)];
    case 'string':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().split('T')[0];
      return 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      if (Object.keys(schema).length === 0) return {};
      return null;
  }
};

const ResponseRow = ({ code, resp, parsedSwagger }: { code: string, resp: any, parsedSwagger: any }) => {
  const contentKeys = resp.content ? Object.keys(resp.content) : [];
  const [selectedMediaType, setSelectedMediaType] = React.useState(contentKeys.length > 0 ? contentKeys[0] : null);

  const currentSchema = 
    selectedMediaType && resp.content && resp.content[selectedMediaType] 
      ? resp.content[selectedMediaType].schema 
      : resp.schema;

  return (
    <tr className="align-top">
      <td className="py-4 px-4">
        <div className="font-bold text-gray-800 text-[15px]">{code}</div>
      </td>
      <td className="py-4 px-4">
        {resp.description ? (
          <div className="text-gray-700 whitespace-pre-wrap mb-4 font-sans">{resp.description}</div>
        ) : (
          <div className="text-gray-400 italic mb-4">No description</div>
        )}
        
        {contentKeys.length > 0 && (
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-gray-700 mb-1">Media type</label>
            <select 
              value={selectedMediaType || ''}
              onChange={e => setSelectedMediaType(e.target.value)}
              className="text-[13px] font-mono border border-gray-300 bg-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {contentKeys.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
        )}

        {currentSchema && (
          <div className="mt-2 bg-[#282c34] rounded text-white overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 text-[12px] font-sans px-3 py-2 bg-[#1e2227] border-b border-[#3b4048]">
                <span className="font-bold">Example Value</span>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto custom-scrollbar">
              <pre 
                className="text-[13px] font-mono leading-relaxed text-[#abb2bf] whitespace-pre-wrap word-break-all"
                dangerouslySetInnerHTML={{ __html: highlightJson(generateExample(currentSchema, parsedSwagger)) }} 
              />
            </div>
          </div>
        )}
      </td>
    </tr>
  );
};

export default function SwaggerTool() {
  const [inputJson, setInputJson] = useState('');
  const [parsedSwagger, setParsedSwagger] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<ParsedEndpoint[]>([]);
  
  // Format: "path|method"
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set());
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());

  const [outputJson, setOutputJson] = useState('');
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputJson(content);
      
      // Auto-parse
      setParseError(null);
      setParsedSwagger(null);
      setEndpoints([]);
      setSelectedPaths(new Set());
      setOutputJson('');

      try {
        const parsed = JSON.parse(content);
        setParsedSwagger(parsed);
        const extracted = extractEndpoints(parsed);
        setEndpoints(extracted);
      } catch (err: any) {
        setParseError(`Invalid JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleParse = () => {
    setParseError(null);
    setParsedSwagger(null);
    setEndpoints([]);
    setSelectedPaths(new Set());
    setOutputJson('');

    if (!inputJson.trim()) {
      setParseError('Please paste a Swagger JSON.');
      return;
    }

    try {
      const parsed = JSON.parse(inputJson);
      setParsedSwagger(parsed);
      const extracted = extractEndpoints(parsed);
      setEndpoints(extracted);
    } catch (e: any) {
      setParseError(`Invalid JSON: ${e.message}`);
    }
  };

  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return endpoints;
    const q = searchQuery.toLowerCase();
    return endpoints.filter(ep => 
      ep.path.toLowerCase().includes(q) || 
      ep.method.toLowerCase().includes(q) ||
      (ep.summary && ep.summary.toLowerCase().includes(q)) ||
      (ep.tags && ep.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [endpoints, searchQuery]);

  const groupedEndpointsByTag = useMemo(() => {
    const groups: { [tag: string]: ParsedEndpoint[] } = {};
    for (const ep of filteredEndpoints) {
      const tags = ep.tags && ep.tags.length > 0 ? ep.tags : ['default'];
      for (const tag of tags) {
        if (!groups[tag]) groups[tag] = [];
        // Prevent duplicates if same endpoint has same tag somehow
        if (!groups[tag].some(existing => existing.path === ep.path && existing.method === ep.method)) {
            groups[tag].push(ep);
        }
      }
    }
    
    const sortedGroups: { [tag: string]: ParsedEndpoint[] } = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    return sortedGroups;
  }, [filteredEndpoints]);

  const toggleSelection = (path: string, method: string) => {
    const key = `${path}|${method}`;
    const nextSet = new Set(selectedPaths);
    if (nextSet.has(key)) {
      nextSet.delete(key);
    } else {
      nextSet.add(key);
    }
    setSelectedPaths(nextSet);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSet = new Set(expandedEndpoints);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    setExpandedEndpoints(nextSet);
  };

  const selectAll = () => {
    const all = new Set<string>();
    endpoints.forEach(ep => all.add(`${ep.path}|${ep.method}`));
    setSelectedPaths(all);
  };

  const deselectAll = () => {
    setSelectedPaths(new Set());
  };

  const toggleTag = (tag: string) => {
    const nextList = new Set(collapsedTags);
    if (nextList.has(tag)) nextList.delete(tag);
    else nextList.add(tag);
    setCollapsedTags(nextList);
  };

  const handleGenerate = () => {
    if (!parsedSwagger) return;

    const selectedList = Array.from(selectedPaths).map(key => {
      const [path, method] = key.split('|');
      return { path, method };
    });

    const subset = generateSubset(parsedSwagger, selectedList);
    setOutputJson(JSON.stringify(subset, null, 2));
  };

  const copyToClipboard = async () => {
    if (!outputJson) return;
    try {
      await navigator.clipboard.writeText(outputJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDownload = () => {
    if (!outputJson) return;
    const blob = new Blob([outputJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swagger-subset.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white text-[10px] font-bold">SW</div>
          <h1 className="text-sm font-semibold tracking-tight">Swagger Subsetter</h1>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Input Source</h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1"
              >
                <Upload className="w-3 h-3" />
                Upload File
              </button>
              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            </div>
            <textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              placeholder="Paste OpenAPI / Swagger JSON here..."
              className="w-full flex-1 min-h-[200px] p-3 text-xs border border-slate-200 rounded mb-4 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono bg-slate-50 resize-none"
            />
            {parseError && <div className="text-red-500 text-xs mt-2 mb-2">{parseError}</div>}
            <button
              onClick={handleParse}
              className="w-full bg-slate-800 text-white px-3 py-2 rounded text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              Parse Swagger
            </button>
            
            {endpoints.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Source Statistics</h2>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <div className="text-lg font-mono leading-none">{endpoints.length}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Endpoints</div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <div className="text-lg font-mono leading-none">{Object.keys(groupedEndpointsByTag).length}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Tags</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-slate-50 min-w-0">
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500 italic">Showing {filteredEndpoints.length} of {endpoints.length} endpoints</span>
            </div>
            
            <div className="flex items-center flex-1 max-w-sm mx-4">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search paths, methods, summaries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-1.5 border border-slate-200 rounded-md leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {endpoints.length > 0 ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white shadow-inner">
                <div className="flex-1 overflow-y-auto w-full px-6 py-4 pb-12">
                  {Object.entries(groupedEndpointsByTag).map(([tag, methods]) => (
                    <div key={tag} className="mb-8 last:mb-0">
                      <div 
                        className="flex items-center justify-between cursor-pointer select-none group mb-2"
                        onClick={() => toggleTag(tag)}
                      >
                        <h3 className="text-[22px] font-bold text-gray-800 capitalize group-hover:text-gray-600 transition-colors">
                          {tag === 'default' ? 'Uncategorized' : tag}
                        </h3>
                        <div className="text-gray-500">
                          {collapsedTags.has(tag) ? <ChevronRight className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                        </div>
                      </div>
                      <div className="h-px bg-gray-200 w-full mb-4" />
                      
                      {!collapsedTags.has(tag) && (
                        <div className="space-y-[10px]">
                          {methods.map((ep) => {
                            const id = `${ep.path}|${ep.method}`;
                            const isSelected = selectedPaths.has(id);
                            const isExpanded = expandedEndpoints.has(id);
                            const operationDef = parsedSwagger?.paths?.[ep.path]?.[ep.method];
                            const style = METHOD_STYLES[ep.method] || METHOD_STYLES.default;

                            return (
                              <div key={id} className={`border rounded-[4px] overflow-hidden ${style.bg} ${style.border}`}>
                                <div 
                                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none`}
                                  onClick={(e) => toggleExpand(id, e)}
                                >
                                  <div className="flex items-center justify-center p-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelection(ep.path, ep.method)}
                                      className="w-4 h-4 rounded text-indigo-600 border-slate-400 cursor-pointer"
                                    />
                                  </div>
                                  <div className="ml-1 w-20 shrink-0">
                                    <span className={`block w-full text-center px-1.5 py-1 rounded-[3px] text-[13px] font-bold uppercase text-white shadow-sm ${style.badge}`}>
                                      {ep.method}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 ml-2 flex-1 min-w-0">
                                    <code className={`text-[15px] font-mono font-bold shrink-0 ${ep.summary ? 'text-gray-800' : 'text-gray-600'}`}>{ep.path}</code>
                                    {ep.summary && <span className="text-[13px] text-gray-600 truncate">{ep.summary}</span>}
                                  </div>
                                  <div className="flex items-center justify-end text-gray-500 px-2 shrink-0">
                                    {/* Padlock placeholder for consistency */}
                                    <svg className="w-4 h-4 mr-3 opacity-40" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                  </div>
                                </div>
                                
                                {isExpanded && operationDef && (
                                  <div className="px-5 py-4 bg-white border-t border-gray-200">
                                    {(operationDef.description || ep.summary) && (
                                      <div className="mb-6 text-gray-700 text-sm">
                                        {operationDef.description || ep.summary}
                                      </div>
                                    )}

                                    {(() => {
                                      let requestBodyRaw = operationDef.requestBody;
                                      if (requestBodyRaw?.$ref) {
                                        requestBodyRaw = resolveRef(requestBodyRaw.$ref, parsedSwagger);
                                      }
                                      const bodyParam = operationDef.parameters?.find((p: any) => p.in === 'body');
                                      if (!requestBodyRaw && bodyParam) {
                                        requestBodyRaw = {
                                          description: bodyParam.description,
                                          required: bodyParam.required,
                                          content: {
                                            'application/json': {
                                              schema: bodyParam.schema
                                            }
                                          }
                                        };
                                      }
                                      const displayParams = operationDef.parameters?.filter((p: any) => p.in !== 'body') || [];

                                      return (
                                        <>
                                          {displayParams.length > 0 ? (
                                            <div className="mb-8">
                                              <div className="flex items-center justify-between mb-2">
                                                  <h4 className="font-bold text-gray-800 text-base">Parameters</h4>
                                              </div>
                                              <div className="border border-gray-200 rounded">
                                                <table className="w-full text-left border-collapse text-sm">
                                                  <thead>
                                                    <tr className="border-b border-gray-200 bg-gray-50/50">
                                                      <th className="py-3 px-4 font-bold text-gray-700 w-[20%]">Name</th>
                                                      <th className="py-3 px-4 font-bold text-gray-700 w-[80%]">Description</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-gray-100">
                                                    {displayParams.map((p: any, i: number) => (
                                                      <tr key={i} className="align-top">
                                                        <td className="py-4 px-4 font-mono">
                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                              <span className={`font-bold text-[14px] ${p.required ? 'text-gray-900' : 'text-gray-700'}`}>{p.name || p.$ref}</span>
                                                              {p.required && <span className="text-red-500 font-sans text-xs font-bold leading-none mt-0.5">* required</span>}
                                                          </div>
                                                          {p.schema?.type && <div className="text-[13px] text-gray-600 mt-1.5">{p.schema.type}<span className="text-gray-400 ml-1">({p.schema.format || 'none'})</span></div>}
                                                          {p.type && <div className="text-[13px] text-gray-600 mt-1.5">{p.type}<span className="text-gray-400 ml-1">({p.format || 'none'})</span></div>}
                                                          {p.in && (
                                                            <div className="text-[12px] text-gray-500 italic mt-1 font-sans">
                                                              ({p.in})
                                                            </div>
                                                          )}
                                                        </td>
                                                        <td className="py-4 px-4">
                                                          {p.description ? (
                                                            <div className="text-gray-700 whitespace-pre-wrap">{p.description}</div>
                                                          ) : (
                                                            <span className="text-gray-400 italic">No description</span>
                                                          )}
                                                          {p.schema?.enum && (
                                                              <div className="mt-3 text-sm text-gray-600">
                                                                <span className="font-semibold italic block mb-1">Available values:</span>
                                                                {p.schema.enum.map((e: string, idx: number) => (
                                                                  <span key={idx} className="inline-block mr-1">{e}{idx < p.schema.enum.length - 1 ? ',' : ''}</span>
                                                                ))}
                                                              </div>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="mb-8 text-center text-sm text-gray-500 py-6 border border-dashed border-gray-200 rounded">
                                              No parameters
                                            </div>
                                          )}

                                          {requestBodyRaw && (
                                            <RequestBodyView requestBody={requestBodyRaw} parsedSwagger={parsedSwagger} />
                                          )}
                                        </>
                                      );
                                    })()}

                                    {operationDef.responses && (
                                      <div>
                                        <h4 className="font-bold text-gray-800 text-base mb-2">Responses</h4>
                                        <div className="border border-gray-200 rounded">
                                          <table className="w-full text-left border-collapse text-sm">
                                            <thead>
                                              <tr className="border-b border-gray-200 bg-gray-50/50">
                                                <th className="py-3 px-4 font-bold text-gray-700 w-24">Code</th>
                                                <th className="py-3 px-4 font-bold text-gray-700">Description</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                              {Object.entries(operationDef.responses).map(([code, resp]: [string, any]) => (
                                                <ResponseRow key={code} code={code} resp={resp} parsedSwagger={parsedSwagger} />
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm bg-white rounded border border-slate-200 border-dashed m-4">
                <svg className="w-8 h-8 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Parse a Swagger file to view endpoints
              </div>
            )}
          </div>
        </main>

        <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shadow-[-10px_0_15px_rgba(0,0,0,0.02)] shrink-0">
          <div className="p-5 flex-1 flex flex-col relative overflow-hidden">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4 shrink-0">Output Summary</h2>
            
            <div className="space-y-3 mb-6 shrink-0 text-xs">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600">Routes Selected</span>
                <span className="font-bold">{selectedPaths.size} / {endpoints.length}</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase">Output JSON</h3>
                    {outputJson && (
                      <div className="flex items-center gap-3">
                        <button
                            onClick={copyToClipboard}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold transition-colors"
                        >
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        <button
                            onClick={handleDownload}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold transition-colors"
                            title="Download JSON"
                        >
                            <Download className="w-3 h-3" />
                            Download
                        </button>
                      </div>
                    )}
                </div>

                <div className="flex-1 relative border border-slate-200 rounded min-h-0 bg-slate-50 group">
                    <textarea
                        readOnly
                        value={outputJson}
                        placeholder={selectedPaths.size > 0 ? "Click Generate to see output..." : "Select paths to enable generation..."}
                        className="w-full h-full p-3 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono bg-transparent resize-none leading-relaxed"
                    />
                </div>
            </div>
          </div>
          
          <div className="p-5 border-t border-slate-100 bg-slate-50 shrink-0">
            <button
                onClick={handleGenerate}
                disabled={selectedPaths.size === 0}
                className="w-full bg-indigo-600 text-white font-bold py-3 rounded shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Generate Subset
            </button>
          </div>
        </aside>
      </div>

      <footer className="h-6 bg-slate-800 text-slate-300 flex items-center px-4 text-[10px] justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span>Ready</span>
          {outputJson && <span className="text-slate-500 font-mono">Output size: {(new Blob([outputJson]).size / 1024).toFixed(1)} KB</span>}
        </div>
        <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors">Home</a>
            <a href="#" className="hover:text-white transition-colors">About</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
