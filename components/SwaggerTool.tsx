'use client';

import React, { useState, useMemo, useRef } from 'react';
import { extractEndpoints, generateSubset, ParsedEndpoint } from '@/lib/swagger-utils';
import { Check, Copy, Upload, ChevronDown, ChevronRight, Search } from 'lucide-react';

const METHOD_STYLES: Record<string, string> = {
  get: 'bg-blue-600 text-white',
  post: 'bg-green-600 text-white',
  put: 'bg-yellow-600 text-white',
  delete: 'bg-red-600 text-white',
  patch: 'bg-purple-600 text-white',
  options: 'bg-slate-600 text-white',
  head: 'bg-slate-600 text-white',
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

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="h-12 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0">
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

          <div className="flex-1 overflow-hidden p-4 flex flex-col">
            {endpoints.length > 0 ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded border border-slate-200">
                <div className="grid grid-cols-[30px_60px_1fr_150px] gap-4 px-3 py-2 bg-slate-200 rounded-t border-b border-slate-300 text-[10px] font-bold uppercase text-slate-600 shrink-0">
                  <div></div>
                  <div>Method</div>
                  <div>Path & Summary</div>
                  <div>Tags</div>
                </div>
                
                <div className="flex-1 overflow-y-auto w-full space-y-[1px] bg-slate-100 pb-8">
                  {Object.entries(groupedEndpointsByTag).map(([tag, methods]) => (
                    <div key={tag} className="mb-4 first:mt-0 mt-4 bg-white shadow-sm border border-slate-200 mx-2 rounded overflow-hidden">
                      <div 
                        className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none hover:bg-slate-100"
                        onClick={() => toggleTag(tag)}
                      >
                        <div className="flex items-center gap-2">
                          {collapsedTags.has(tag) ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          <h3 className="text-sm font-bold text-slate-800 capitalize">
                            {tag === 'default' ? 'Uncategorized' : tag}
                          </h3>
                        </div>
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                          {methods.length}
                        </span>
                      </div>
                      
                      {!collapsedTags.has(tag) && (
                        <div className="divide-y divide-slate-100">
                          {methods.map((ep) => {
                            const id = `${ep.path}|${ep.method}`;
                            const isSelected = selectedPaths.has(id);
                            return (
                              <label 
                                key={id}
                                className="grid grid-cols-[30px_60px_1fr] md:grid-cols-[30px_60px_1fr_150px] gap-4 px-3 py-2 hover:bg-indigo-50 transition-colors items-center cursor-pointer m-0 border-b border-slate-100 last:border-b-0"
                              >
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(ep.path, ep.method)}
                                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 pointer-events-auto"
                                  />
                                </div>
                                <div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${METHOD_STYLES[ep.method] || 'bg-slate-600 text-white'}`}>
                                    {ep.method}
                                  </span>
                                </div>
                                <div className="flex flex-col overflow-hidden leading-tight">
                                  <code className="text-[11px] font-mono text-slate-800 truncate block">{ep.path}</code>
                                  {ep.summary && <span className="text-[10px] text-slate-500 truncate block">{ep.summary}</span>}
                                </div>
                                <div className="hidden md:flex gap-1 flex-wrap items-center">
                                  {ep.tags.map((t, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] border border-slate-200 truncate max-w-[100px]">
                                      {t}
                                    </span>
                                  ))}
                                  {ep.tags.length === 0 && <span className="text-[9px] text-slate-400 italic">No tags</span>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm bg-white rounded border border-slate-200 border-dashed">
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
                    <button
                        onClick={copyToClipboard}
                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold"
                    >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
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
