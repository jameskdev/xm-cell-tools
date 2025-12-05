/* 
 * An object that parses a DSL query, fetch data & insert into the table accordingly.
 * This DSL largely resembles the SQL language, and is intended to behave in similar way.
 * 
 * Each statement in this DSL is separated by a semicolon(;)
 * 
 * The following are the rules and syntaxes for this DSL:
 * (escapes for quotation marks are omitted for brevity's sake)
 * 
 * 1. "REQUEST" clause:
 *  REQUEST clause defines a command to make a HTTP fetch request.
 *  This command has following syntax:
 *  REQUEST (HTTP REQUEST METHOD) (URL) HEADERS[("header key1" : "header value1"), ("header key1" : "header value1")...] BODY("HTTP request body") AS <variable to store the request result> <body type (TEXT, JSON, HTML, BINARY, VOID)>
 *  The result from the request is stored to the map #fetchRes.
 *  The 
 *  
 *  For example, the following statement:
 *  let a = new FetchLoaderDSL("REQUEST GET https://www.example.com/api/get HEADERS[("header", "value")] AS a TEXT;");
 *  a.execute();
 * 
 *  would result in the following:
 * 
 *  #fetchRes.set("a", await fetch("https://www.example.com/api/get", { method : "GET", headers { header : "value" } }));
 * 
 * 2. "INSERT INTO" clause:
 *  This clause stores values into the #results Map, using information from the input and/or the variables (more information on that in the section #3)
 *  It is similar to the SQL's INSERT INTO <table> (columns...) values(values...) command, except that <table> corresponds to the #results map's key, and columns... corresponds to the CellData.column number.
 *  The command takes the following form:
 *  INSERT INTO <tableName> (column numbers...) ("values to put in"...);
 *  ...
 * 
 *  for example, the following statement :
 *  let a = new FetchLoaderDSL("INSERT INTO someTable (0, 1, 2) values("AAAA", "BBBB", "CCCC");");
 *  a.execute();
 *  would result in the following:
 *  let row = #results.get("someTable");
 *  set.add({ row: 0, column: 0, value: "AAAA" });
 *  set.add({ row: 0, column: 1, value: "BBBB" });
 *  set.add({ row: 0, column: 2, value: "CCCC" });
 * 
 *  Each INSERT INTO command appends a new row, so issuing more than one insert commands would mean inserting multiple rows: 
 *  let a = new FetchLoaderDSL("INSERT INTO someTable (0, 1, 2) values("AAAA", "BBBB", "CCCC");
 *   INSERT INTO someTable (0, 1, 2) values("DDDD", "EEEE", "FFFF");");
 * 
 *  would result in the following:
 * 
 *  let row = #results.get("someTable");
 *  set.add({ row: 0, column: 0, value: "AAAA" });
 *  set.add({ row: 0, column: 1, value: "BBBB" });
 *  set.add({ row: 0, column: 2, value: "CCCC" });
 *  set.add({ row: 1, column: 0, value: "DDDD" });
 *  set.add({ row: 1, column: 1, value: "EEEE" });
 *  set.add({ row: 1, column: 2, value: "FFFF" });
 * 
 * 3. Storing and using variables from requests
 *  The results from previous requests can be used for making additional HTTP requests or extracting information from the response header/body and storing it using INSERT INTO.
 *  The syntax for accessing data from the requests is as follows:
 * 
 *  <variable to store the request result>.html --> accessing the request result as HTML
 *  <variable to store the request result>.json --> accessing the result as JSON
 *  <variable to store the request result>.text --> accessing the result as text
 *  <variable to store the request result>.headers --> accessing the result's headers
 * 
 *  For example, the following statement : 
 *  let a = new FetchLoaderDSL("
 *  REQUEST GET https://www.example.com/api/get HEADERS[("header", "value")] AS a TEXT;
 *  REQUEST POST https://www.example.com/api/post HEADERS[("header", a.header.Authorization)] BODY(a.body.text) AS b HTML;");
 *  a.execute();
 * 
 *  would perform the following:
 *  
 *  let result = await fetch("https://www.example.com/api/get", { method : "GET", headers { header : "value" } });
 *  #fetchRes.set("a", { result.code, headers : result.headers, bodyText : result.text() });
 *  result = await fetch("https://www.example.com/api/post", { method : "GET", headers { header : #fetchRes.get("a").headers.get("Authorization") }, body : #fetchRes.get("a").text });
 *  #fetchRes.set("b", { result.code, headers : result.headers, bodyHTML : new DOMParser().parseFromString(result.text(), 'text/html') });
 * 
 *  Also, HTML DOM elements can be fetched through this DSL, such as by following: 
 * 
 *  REQUEST GET https://www.example.com/api/get HEADERS[("header", "value")] AS a HTML;
 *  INSERT INTO sheet1 (1, 2) VALUES(a.html.getElementById("someElement").textContent, a.html.getElementById("someElement2").textContent);
 * 
 *  This is still a WIP, and might or might not be finished (depending on the circumstances.)
 *  Hopefully, when finished, this should provide a good way to fetch data & store them in a table easily.
 * 
 *
*/

import type { CellData } from "./CellItem";

interface RequestResult {
  code: number;
  headers: Headers;
  bodyText?: string;
  bodyJson?: any;
  bodyArrayBuffer?: ArrayBuffer;
  bodyHTML?: Document;
}

type BodyType = "TEXT" | "JSON" | "HTML" | "BINARY" | "VOID";

class FetchLoaderDSL {
  #inputDsl: string;
  #fetchRes: Map<string, RequestResult>;
  // changed to array per-table for deterministic row ordering
  #results: Map<string, CellData[]>;

  constructor(inputDsl: string) {
    this.#inputDsl = inputDsl;
    this.#fetchRes = new Map();
    this.#results = new Map();
  }

  async execute() {
    // split by semicolon, but keep quoted semicolons intact: simple scanning
    const statements = this.#splitStatements(this.#inputDsl);
    for (let stmt of statements) {
      const s = stmt.trim();
      if (!s) continue;
      if (/^REQUEST\b/i.test(s)) {
        await this.#handleRequestStatement(s);
      } else if (/^INSERT\s+INTO\b/i.test(s)) {
        this.#handleInsertStatement(s);
      } else {
        throw new Error("Unsupported statement: " + s.slice(0, 80));
      }
    }
    return this.getResults();
  }

  getResults() {
    return this.#results;
  }

  // perform the actual fetch and store RequestResult (parses body according to bodyType)
  async #performRequest(
    requestName: string,
    bodyType: BodyType,
    requestUrl: string,
    params: RequestInit
  ) {
    const res = await fetch(requestUrl, params);
    const rr: RequestResult = { code: res.status, headers: res.headers };

    // parse body according to type
    if (bodyType === "TEXT") {
      rr.bodyText = await res.text();
    } else if (bodyType === "JSON") {
      try {
        rr.bodyJson = await res.json();
      } catch (e) {
        // non-JSON response
        rr.bodyText = await res.text();
      }
    } else if (bodyType === "HTML") {
      const txt = await res.text();
      rr.bodyText = txt;
      try {
        const parser = new DOMParser();
        rr.bodyHTML = parser.parseFromString(txt, "text/html");
      } catch (e) {
        rr.bodyHTML = undefined;
      }
    } else if (bodyType === "BINARY") {
      rr.bodyArrayBuffer = await res.arrayBuffer();
    } else {
      // VOID - do nothing with body
    }

    this.#fetchRes.set(requestName, rr);
  }

  // ----- Parsing helpers -----

  // split statements by ; respecting string quotes
  #splitStatements(src: string): string[] {
    const res: string[] = [];
    let cur = "";
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        cur += ch;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        cur += ch;
        continue;
      }
      if (ch === ";" && !inSingle && !inDouble) {
        res.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) res.push(cur);
    return res;
  }

  // split function arguments / CSV respecting quotes and parentheses
  #splitArgs(str: string): string[] {
    const out: string[] = [];
    let cur = "";
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        else if (ch === "," && depth === 0) {
          out.push(cur.trim());
          cur = "";
          continue;
        }
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // remove surrounding quotes if present (single or double)
  #unquote(val: string): string {
    const m = val.match(/^['"](.*)['"]$/s);
    return m ? m[1] : val;
  }

  // Evaluate a simple expression that can reference prior request variables.
  // Supports forms like:
  //   "literal"
  //   a.text, a.bodyText, a.bodyJson, a.json.user.name
  //   a.headers.get("Authorization")
  //   a.html.getElementById("id").textContent
  // This is a purpose-built, limited evaluator (no arbitrary JS execution).
  #resolveExpression(exprRaw: string): any {
    const expr = exprRaw.trim();
    if (!expr) return "";
    // literal string
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return this.#unquote(expr);
    }

    // numeric literal
    if (/^\d+(\.\d+)?$/.test(expr)) {
      return Number(expr);
    }

    // variable access: varName.rest...
    const parts = expr.split(".");
    const varName = parts[0];
    const rr = this.#fetchRes.get(varName);
    if (!rr) {
      // not a fetched var; treat as raw token (fallback)
      return expr;
    }

    // start with root object
    let current: any = {
      text: rr.bodyText,
      bodyText: rr.bodyText,
      json: rr.bodyJson,
      bodyJson: rr.bodyJson,
      html: rr.bodyHTML,
      bodyHTML: rr.bodyHTML,
      headers: rr.headers,
      code: rr.code,
      arrayBuffer: rr.bodyArrayBuffer,
    };

    // iterate tokens after var name
    for (let i = 1; i < parts.length; i++) {
      const tok = parts[i];

      // handle function-like tokens with parentheses, e.g., get("Authorization"), getElementById("id")
      const funcMatch = tok.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/s);
      if (funcMatch) {
        const fn = funcMatch[1];
        let rawArg = funcMatch[2].trim();
        // split args by comma (simple)
        const argList = rawArg === "" ? [] : this.#splitArgs(rawArg).map((a) => this.#unquote(a.trim()));
        if (current == null) return undefined;
        // supported functions:
        if (typeof current.get === "function" && fn === "get") {
          // Headers.get(name)
          current = current.get(argList[0]);
          continue;
        }
        if (current instanceof Document && fn === "getElementById") {
          current = current.getElementById(argList[0]);
          continue;
        }
        if (current instanceof Element && fn === "querySelector") {
          current = current.querySelector(argList[0]);
          continue;
        }
        // fallback: try calling if function exists
        const maybe = (current as any)[fn];
        if (typeof maybe === "function") {
          try {
            current = maybe.apply(current, argList);
          } catch {
            current = undefined;
          }
          continue;
        }
        current = undefined;
        continue;
      }

      // property access
      if (current == null) return undefined;
      // normalize common aliases
      if (tok === "text" || tok === "bodyText") {
        current = current["bodyText"];
      } else if (tok === "json" || tok === "bodyJson") {
        current = current["bodyJson"];
      } else if (tok === "html" || tok === "bodyHTML") {
        current = current["bodyHTML"];
      } else if (tok === "headers") {
        current = current["headers"];
      } else {
        // generic property access (for JSON objects etc.)
        try {
          current = current[tok];
        } catch {
          current = undefined;
        }
      }
    }
    return current;
  }

  // ----- Statement handlers -----

  async #handleRequestStatement(stmt: string) {
    // Rough parse:
    // REQUEST <METHOD> <URL> (optional HEADERS[...]) (optional BODY(...)) AS <varName> <TYPE>
    const re = /^REQUEST\s+([A-Z]+)\s+(\S+)([\s\S]*)$/i;
    const m = stmt.match(re);
    if (!m) throw new Error("Invalid REQUEST statement: " + stmt);
    const method = m[1].toUpperCase();
    let rest = m[3].trim();

    // extract HEADERS[...] if present
    let headersObj: Record<string, string> = {};
    const headersMatch = rest.match(/HEADERS\s*\[(.*?)\](.*)$/is);
    if (headersMatch) {
      const inside = headersMatch[1];
      rest = headersMatch[2].trim();
      // parse pairs like ("Key", "Value") or ('Key', var.ref)
      const pairRe = /\(\s*([^,()]+)\s*,\s*([^,()]+?)\s*\)/gs;
      let pairMatch;
      while ((pairMatch = pairRe.exec(inside)) !== null) {
        const rawKey = pairMatch[1].trim();
        const rawVal = pairMatch[2].trim();
        const key = this.#unquote(rawKey);
        const valResolved = this.#resolveExpression(rawVal);
        headersObj[key] = String(valResolved ?? "");
      }
    }

    // extract BODY(...) if present
    let bodyValue: any = undefined;
    const bodyMatch = rest.match(/BODY\s*\(([\s\S]*?)\)\s*(.*)$/is);
    if (bodyMatch) {
      const rawBody = bodyMatch[1].trim();
      rest = bodyMatch[2].trim();
      // body may be literal or expression
      bodyValue = this.#resolveExpression(rawBody);
    }

    // extract AS <var> and TYPE
    const asMatch = rest.match(/^AS\s+([A-Za-z_$][\w$]*)\s*(TEXT|JSON|HTML|BINARY|VOID)?/i);
    if (!asMatch) throw new Error("REQUEST missing AS <var> in: " + stmt);
    const varName = asMatch[1];
    const bodyTypeRaw = (asMatch[2] || "TEXT").toUpperCase() as BodyType;

    // build fetch params
    const params: RequestInit = { method };
    if (Object.keys(headersObj).length) {
      params.headers = headersObj;
    }
    if (bodyValue !== undefined) {
      // if bodyValue is object and method implies JSON, stringify
      if (typeof bodyValue === "object" && !(bodyValue instanceof ArrayBuffer) && bodyTypeRaw === "JSON") {
        params.body = JSON.stringify(bodyValue);
        params.headers = params.headers || {};
        (params.headers as any)["Content-Type"] ||= "application/json";
      } else if (bodyValue instanceof ArrayBuffer) {
        params.body = bodyValue;
      } else {
        params.body = String(bodyValue);
      }
    }

    await this.#performRequest(varName, bodyTypeRaw, m[2], params);
  }

  #handleInsertStatement(stmt: string) {
    // INSERT INTO <tableName> (col1, col2, ...) VALUES(val1, val2, ...)
    const re = /^INSERT\s+INTO\s+([A-Za-z_$][\w$]*)\s*\(\s*([^)]+)\s*\)\s*VALUES\s*\(\s*([\s\S]+)\s*\)\s*$/i;
    const m = stmt.match(re);
    if (!m) throw new Error("Invalid INSERT INTO statement: " + stmt);
    const table = m[1];
    const colsRaw = m[2];
    const valuesRaw = m[3];

    const colParts = this.#splitArgs(colsRaw).map((c) => c.replace(/\s+/g, ""));
    const cols = colParts.map((c) => parseInt(c, 10));
    if (cols.some((c) => isNaN(c))) throw new Error("Invalid column list in INSERT INTO: " + colsRaw);

    const valParts = this.#splitArgs(valuesRaw);

    if (cols.length !== valParts.length) {
      throw new Error("Column count and value count mismatch in INSERT INTO: " + stmt);
    }

    const evaluatedValues = valParts.map((v) => this.#resolveExpression(v));
    // get current row index for this table (append)
    const arr = this.#results.get(table) ?? [];
    const rowIndex = arr.length; // append
    for (let i = 0; i < cols.length; i++) {
      const cd: CellData = { row: rowIndex, column: cols[i], value: evaluatedValues[i] == null ? "" : String(evaluatedValues[i]) };
      arr.push(cd);
    }
    this.#results.set(table, arr);
  }
}

export default FetchLoaderDSL;